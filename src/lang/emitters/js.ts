/**
 * TJS to JavaScript Emitter
 *
 * Transforms TJS source into standard JavaScript with runtime type metadata.
 * Unlike the AST emitter (for AgentJS), this outputs executable JS code.
 *
 * Input:
 *   function greet(name: 'world') -> '' {
 *     return `Hello, ${name}!`
 *   }
 *
 * Output:
 *   function greet(name = 'world') {
 *     return `Hello, ${name}!`
 *   }
 *   greet.__tjs = {
 *     params: { name: { type: 'string', required: true, example: 'world' } },
 *     returns: { type: 'string' }
 *   }
 *
 * TODO: Self-contained output (no runtime dependency)
 * =====================================================
 * Currently, transpiled code references `globalThis.__tjs` for:
 *   - __tjs.pushStack() / popStack() - debug stack traces
 *   - __tjs.typeError() - monadic error creation
 *   - __tjs.Is() / IsNot() - structural equality (when == / != used)
 *
 * This requires either:
 *   1. The runtime to be installed via installRuntime()
 *   2. A stub to be provided (e.g., playground's inline stub)
 *
 * The ideal is that TJS produces completely independent code that only needs
 * things it semantically needs (like fetch for HTTP calls). The runtime
 * functions above are ~30 lines and could be inlined when used:
 *
 *   - typeError: Create a simple Error with extra properties
 *   - pushStack/popStack: Could be no-ops in production, or inline array ops
 *   - Is/IsNot: ~20 lines for deep structural equality
 *
 * Options to explore:
 *   1. Inline minimal runtime when needed (adds ~1KB unminified per output)
 *   2. Add transpile option: { standalone: true } to emit self-contained code
 *   3. Tree-shake: only inline the specific functions actually referenced
 *
 * See also: demo/src/tjs-playground.ts which has a manual __tjs stub that
 * must stay in sync with the runtime - a symptom of this leaky abstraction.
 */

import type { FunctionDeclaration, Program } from 'acorn'
import { parseExpressionAt } from 'acorn'
import { parse, extractTDoc, preprocess } from '../parser'
import type { TypeDescriptor, ParameterDescriptor } from '../types'
import { inferTypeFromValue, parseParameter } from '../inference'
import { extractTests } from '../tests'
import { compileToWasm } from '../wasm'

export interface TJSTranspileOptions {
  /** Filename for error messages */
  filename?: string
  /** Include source map comment */
  sourceMap?: boolean
  /** Mode: 'dev' | 'strict' | 'production' */
  mode?: 'dev' | 'strict' | 'production'
  /**
   * Test execution mode:
   * - true (default): run tests at transpile time, throw on failure
   * - false: skip tests entirely (production build)
   * - 'only': only run tests, don't emit code (CI/test runner)
   * - 'report': run tests, report results in testResults, don't throw
   *             (caller decides whether to use the code based on results)
   */
  runTests?: boolean | 'only' | 'report'
  /**
   * Debug mode: include source locations in __tjs metadata
   * Enables better error messages with file:line:column info
   */
  debug?: boolean
  /**
   * Pre-resolved import code for test execution.
   * Map of import specifier to compiled JavaScript code.
   * Used when tests depend on imported modules.
   */
  resolvedImports?: Record<string, string>
}

/** Result of running tests at transpile time */
export interface TestResult {
  /** Test description */
  description: string
  /** Whether the test passed */
  passed: boolean
  /** Error message if failed */
  error?: string
  /** Whether this was an implicit signature test */
  isSignatureTest?: boolean
  /** Source line number (1-indexed) where the test or error occurred */
  line?: number
  /** Source column number (1-indexed) */
  column?: number
}

export interface TJSTranspileResult {
  /** The transpiled JavaScript code */
  code: string
  /** Type information for the function(s) - Record of function name to type info */
  types: Record<string, TJSTypeInfo>
  /** Function metadata (alias for types, used by runtime) */
  metadata: Record<string, TJSTypeInfo>
  /** Any warnings during transpilation */
  warnings?: string[]
  /** Generated test runner code (if tests were present) - DEPRECATED, tests now run at transpile time */
  testRunner?: string
  /** Number of tests extracted */
  testCount?: number
  /** Test results (when runTests is true or 'only') */
  testResults?: TestResult[]
  /** WASM compilation results (for debugging/inspection) */
  wasmCompiled?: {
    id: string
    success: boolean
    error?: string
    byteLength?: number
  }[]
}

export interface TJSTypeInfo {
  /** Function name */
  name: string
  /** Parameter types */
  params: Record<string, ParameterDescriptor>
  /** Return type */
  returns?: TypeDescriptor
  /** TDoc description */
  description?: string
  /** True if function uses destructured object param (the fast path) */
  isDestructuredParam?: boolean
  /** The shape of the destructured param (for inline validation) */
  destructuredShape?: Record<string, TypeDescriptor>
  /** Which fields in destructuredShape are required */
  destructuredRequired?: Set<string>
}

/**
 * Extract type info for a single function declaration
 */
function extractFunctionTypeInfo(
  func: FunctionDeclaration,
  originalSource: string,
  requiredParams: Set<string>,
  returnTypeStr: string | null
): { types: TJSTypeInfo; warnings: string[] } {
  const warnings: string[] = []

  // Extract TDoc (/*# ... */) comments
  const tdoc = extractTDoc(originalSource, func)

  // Build parameter type info
  const params: Record<string, ParameterDescriptor> = {}
  let isDestructuredParam = false
  let destructuredShape: Record<string, TypeDescriptor> | undefined
  let destructuredRequired: Set<string> | undefined

  // Check if this is a single destructured object param (the fast path)
  if (
    func.params.length === 1 &&
    (func.params[0].type === 'ObjectPattern' ||
      (func.params[0].type === 'AssignmentPattern' &&
        func.params[0].left.type === 'ObjectPattern'))
  ) {
    isDestructuredParam = true
    const param = func.params[0]
    const objectPattern =
      param.type === 'ObjectPattern' ? param : (param as any).left

    const paramInfo = parseParameter(objectPattern, requiredParams)
    if (paramInfo.type.kind === 'object' && paramInfo.type.destructuredParams) {
      destructuredShape = {}
      destructuredRequired = new Set()

      // Build shape and track required fields
      for (const [key, descriptor] of Object.entries(
        paramInfo.type.destructuredParams
      )) {
        params[key] = {
          ...descriptor,
          description: tdoc.params[key],
        }
        destructuredShape[key] = descriptor.type
        if (descriptor.required) {
          destructuredRequired.add(key)
        }
      }
    }
  } else {
    // Traditional param handling (multiple params or non-destructured)
    for (const param of func.params) {
      if (param.type === 'Identifier') {
        const paramInfo = parseParameter(param, requiredParams)
        params[param.name] = {
          ...paramInfo,
          required: requiredParams.has(param.name),
          description: tdoc.params[param.name],
        }
      } else if (
        param.type === 'AssignmentPattern' &&
        param.left.type === 'Identifier'
      ) {
        const paramInfo = parseParameter(param, requiredParams)
        params[param.left.name] = {
          ...paramInfo,
          required: requiredParams.has(param.left.name),
          description: tdoc.params[param.left.name],
        }
      } else if (param.type === 'ObjectPattern') {
        // Handle destructured object parameters (non-single case)
        const paramInfo = parseParameter(param, requiredParams)
        if (
          paramInfo.type.kind === 'object' &&
          paramInfo.type.destructuredParams
        ) {
          for (const [key, descriptor] of Object.entries(
            paramInfo.type.destructuredParams
          )) {
            params[key] = {
              ...descriptor,
              description: tdoc.params[key],
            }
          }
        }
      }
    }
  }

  // Parse return type if present
  let returns: TypeDescriptor | undefined
  if (returnTypeStr) {
    try {
      const returnExpr = parseExpressionAt(returnTypeStr, 0, {
        ecmaVersion: 2022,
      })
      returns = inferTypeFromValue(returnExpr as any)
    } catch {
      // If we can't parse the return type, just store it as-is
      returns = { kind: 'any' }
      warnings.push(`Could not parse return type: ${returnTypeStr}`)
    }
  }

  // Build type info object
  const types: TJSTypeInfo = {
    name: func.id?.name || 'anonymous',
    params,
    returns,
    description: tdoc.description,
    isDestructuredParam,
    destructuredShape,
    destructuredRequired,
  }

  return { types, warnings }
}

/**
 * Generate inline validation code to be inserted at the start of a function body
 *
 * Implements proper monadic error handling:
 * 1. Check if any param is an Error - if so, pass it through (no work)
 * 2. Check types with fast inline typeof checks
 * 3. On type mismatch, call __tjs.typeError() (only on error path)
 *
 * @param funcName - Function name for error paths
 * @param types - Type information for the function
 * @param source - Source location (e.g., "src/utils.ts:42") for error reporting
 */
function generateInlineValidationCode(
  funcName: string,
  types: TJSTypeInfo,
  source?: string
): string | null {
  const lines: string[] = []
  // Include source in path if available: "src/file.ts:42:funcName.param"
  const pathPrefix = source ? `${source}:` : ''
  const stackEntry = source ? `${source}:${funcName}` : funcName

  // Push onto call stack for debug mode (only runs if debug enabled)
  lines.push(`__tjs.pushStack('${stackEntry}');`)

  // Destructured params: validate each field of the input object
  if (types.isDestructuredParam && types.destructuredShape) {
    const shape = types.destructuredShape
    const requiredFields = types.destructuredRequired || new Set()
    const fieldNames = Object.keys(shape)

    if (fieldNames.length === 0) return null

    // 1. Error pass-through: check if any field is an Error
    for (const fieldName of fieldNames) {
      lines.push(`if (${fieldName} instanceof Error) return ${fieldName};`)
    }

    // 2. Type checks with proper error emission
    for (const [fieldName, fieldType] of Object.entries(shape)) {
      const isRequired = requiredFields.has(fieldName)
      const path = `${pathPrefix}${funcName}.${fieldName}`
      const typeCheck = generateTypeCheckExpr(fieldName, fieldType)

      if (typeCheck) {
        const expectedType = fieldType.kind
        if (isRequired) {
          lines.push(
            `if (${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${fieldName});`
          )
        } else {
          lines.push(
            `if (${fieldName} !== undefined && ${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${fieldName});`
          )
        }
      }
    }

    return lines.length > 0 ? lines.join('\n  ') : null
  }

  // Positional params: validate each param
  const params = Object.entries(types.params)
  if (params.length === 0) return null

  // 1. Error pass-through: check if any param is an Error
  for (const [paramName] of params) {
    lines.push(`if (${paramName} instanceof Error) return ${paramName};`)
  }

  // 2. Type checks with proper error emission
  for (const [paramName, param] of params) {
    const path = `${pathPrefix}${funcName}.${paramName}`
    const typeCheck = generateTypeCheckExpr(paramName, param.type)

    if (typeCheck) {
      const expectedType = param.type.kind
      if (param.required) {
        lines.push(
          `if (${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${paramName});`
        )
      } else {
        lines.push(
          `if (${paramName} !== undefined && ${typeCheck}) return __tjs.typeError('${path}', '${expectedType}', ${paramName});`
        )
      }
    }
  }

  return lines.length > 0 ? lines.join('\n  ') : null
}

/**
 * Extract the return type string for a specific function from source
 * Returns null if no return type found
 */
function extractFunctionReturnType(
  source: string,
  funcName: string
): string | null {
  // Match: function funcName(params) -> returnExample {
  // or: function funcName(params) -? returnExample {
  // or: function funcName(params) -! returnExample {
  const regex = new RegExp(
    `function\\s+${funcName}\\s*\\([^)]*\\)\\s*(-[>?!])\\s*`,
    'g'
  )
  const match = regex.exec(source)
  if (!match) return null

  const afterMarker = source.slice(match.index + match[0].length)
  return extractReturnExampleFromSource(afterMarker)
}

/**
 * Extract return safety marker for a specific function from source
 * Returns 'safe' for -?, 'unsafe' for -!, undefined for -> or no marker
 */
function extractFunctionReturnSafety(
  source: string,
  funcName: string
): 'safe' | 'unsafe' | undefined {
  // Match: function funcName(params) -X where X is >, ?, or !
  const regex = new RegExp(
    `function\\s+${funcName}\\s*\\([^)]*\\)\\s*-([>?!])`,
    'g'
  )
  const match = regex.exec(source)
  if (!match) return undefined

  const marker = match[1]
  if (marker === '?') return 'safe'
  if (marker === '!') return 'unsafe'
  return undefined // -> is the default, no special safety flag
}

/**
 * Extract source file annotation from TJS source
 * Looks for: /★ tjs <- path/to/file.ts ★/ at the start (★ = *)
 */
function extractSourceFileAnnotation(source: string): string | undefined {
  const match = source.match(/^\/\*\s*tjs\s*<-\s*([^*]+?)\s*\*\//)
  return match ? match[1].trim() : undefined
}

/**
 * Extract line number annotation for a specific function
 * Looks for: /★ line N ★/ immediately before the function declaration
 */
function extractLineAnnotation(
  source: string,
  funcName: string
): number | undefined {
  // Match: /* line N */ followed by function declaration
  // Allow for async, whitespace variations
  const regex = new RegExp(
    `\\/\\*\\s*line\\s+(\\d+)\\s*\\*\\/\\s*(?:async\\s+)?function\\s+${funcName}\\s*\\(`,
    'm'
  )
  const match = source.match(regex)
  return match ? parseInt(match[1], 10) : undefined
}

/**
 * Transpile TJS source to JavaScript
 *
 * This function handles:
 * - Files with no functions (just statements/tests)
 * - Files with multiple functions
 * - Inline validation (no wrappers)
 * - __tjs metadata inserted immediately after each function
 */
export function transpileToJS(
  source: string,
  options: TJSTranspileOptions = {}
): TJSTranspileResult {
  const {
    filename = '<source>',
    runTests = true,
    debug = false,
    resolvedImports = {},
  } = options
  const warnings: string[] = []

  // Extract source file annotation if present (from TS transpilation)
  const sourceFileAnnotation = extractSourceFileAnnotation(source)
  const effectiveFilename = sourceFileAnnotation || filename

  // Extract test/mock blocks before parsing (they're not valid JS)
  const { code: cleanSource, tests, mocks, testRunner } = extractTests(source)

  // Parse the cleaned source (handles TJS syntax like x: 'type' and -> ReturnType)
  const {
    ast: program,
    originalSource,
    requiredParams,
    unsafeFunctions,
  } = parse(cleanSource, {
    filename,
    colonShorthand: true,
  })

  // Find ALL functions in the program
  const functions = findAllFunctions(program)

  // Preprocess source (handles TJS syntax transformations)
  const preprocessed = preprocess(cleanSource)

  // Build types map for all functions
  const allTypes: Record<string, TJSTypeInfo> = {}

  // Collect insertions: { position, text } to be applied in reverse order
  const insertions: { position: number; text: string }[] = []

  // Process each function
  for (const func of functions) {
    const funcName = func.id?.name || 'anonymous'

    // Extract return type for this specific function from original source
    const returnTypeStr = extractFunctionReturnType(cleanSource, funcName)

    // Extract type info for this function
    const { types, warnings: funcWarnings } = extractFunctionTypeInfo(
      func,
      originalSource,
      requiredParams,
      returnTypeStr
    )
    warnings.push(...funcWarnings)
    allTypes[funcName] = types

    // Determine safety options
    // Module-level "safety none" makes ALL functions unsafe (no validation)
    const isUnsafe =
      preprocessed.moduleSafety === 'none' || unsafeFunctions.has(funcName)
    const isSafe = preprocessed.safeFunctions.has(funcName)
    // Extract return safety per-function from original source
    const returnSafety = extractFunctionReturnSafety(cleanSource, funcName)

    // Get source location - prefer line annotation from TS transpilation
    const annotatedLine = extractLineAnnotation(source, funcName)
    const funcLoc = {
      file: effectiveFilename,
      line: annotatedLine ?? func.loc?.start.line ?? 0,
      column: func.loc?.start.column ?? 0,
    }

    const safetyOptions = {
      unsafe: isUnsafe,
      safe: isSafe,
      returnSafety,
    }

    // Generate __tjs metadata (to insert after function)
    const typeMetadata = generateTypeMetadata(funcName, types, safetyOptions, {
      debug,
      source: funcLoc,
    })

    // Queue insertion of __tjs after function closing brace
    insertions.push({
      position: func.end,
      text: `\n${typeMetadata}`,
    })

    // Generate inline validation (to insert at start of function body)
    // Skip for unsafe functions
    if (!isUnsafe) {
      const sourceStr = `${funcLoc.file}:${funcLoc.line}`
      const validationCode = generateInlineValidationCode(
        funcName,
        types,
        sourceStr
      )
      if (validationCode && func.body && func.body.start !== undefined) {
        // Insert right after the opening brace
        insertions.push({
          position: func.body.start + 1,
          text: `\n  ${validationCode}\n`,
        })
      }
    }
  }

  // Apply insertions in reverse position order (to maintain correct offsets)
  insertions.sort((a, b) => b.position - a.position)

  let code = preprocessed.source
  for (const { position, text } of insertions) {
    code = code.slice(0, position) + text + code.slice(position)
  }

  // Add __tjs reference for monadic error handling and structural equality
  // Use createRuntime() for isolated state per-module
  const needsTypeError = code.includes('__tjs.typeError(')
  const needsIs = code.includes('Is(')
  const needsIsNot = code.includes('IsNot(')
  const needsSafeEval = preprocessed.tjsModes.tjsSafeEval

  if (needsTypeError || needsIs || needsIsNot || needsSafeEval) {
    // Create isolated runtime instance for this module
    // Falls back to shared global if createRuntime not available
    let preamble =
      'const __tjs = globalThis.__tjs?.createRuntime?.() ?? globalThis.__tjs;\n'

    // Add destructured imports for Is/IsNot if used
    if (needsIs || needsIsNot) {
      const imports = [needsIs && 'Is', needsIsNot && 'IsNot']
        .filter(Boolean)
        .join(', ')
      preamble += `const { ${imports} } = __tjs ?? {};\n`
    }

    code = preamble + code
  }

  // Add Eval/SafeFunction import when TjsSafeEval directive is present
  if (needsSafeEval) {
    code = `import { Eval, SafeFunction } from 'tjs-lang';\n` + code
  }

  // Run tests at transpile time if enabled
  let testResults: TestResult[] | undefined

  if (runTests) {
    // Extract signature tests info (doesn't execute yet)
    const sigTestInfos = extractSignatureTestInfos(source)

    // Run all tests in a single execution context
    testResults = runAllTests(tests, mocks, sigTestInfos, code, resolvedImports)

    // Check for failures and throw only if runTests === true (strict mode)
    // 'only' and 'report' modes return results without throwing
    const failures = testResults.filter((r) => !r.passed)
    if (failures.length > 0 && runTests === true) {
      const errorLines = failures.map((f) => {
        if (f.isSignatureTest) {
          return `  Function signature example is inconsistent:\n    ${f.error}`
        }
        return `  Test '${f.description}' failed:\n    ${f.error}`
      })
      throw new Error(`Transpile-time test failures:\n${errorLines.join('\n')}`)
    }
  }

  // If runTests === 'only', return minimal result
  if (runTests === 'only') {
    return {
      code: '',
      types: allTypes,
      metadata: allTypes,
      testResults,
      testCount: testResults?.length,
    }
  }

  // Compile WASM blocks at transpile time and embed in output
  let wasmCompiled:
    | { id: string; success: boolean; error?: string; byteLength?: number }[]
    | undefined
  if (preprocessed.wasmBlocks.length > 0) {
    wasmCompiled = []
    const wasmBootstrap = generateWasmBootstrap(preprocessed.wasmBlocks)
    if (wasmBootstrap.code) {
      code = wasmBootstrap.code + '\n' + code
    }
    wasmCompiled = wasmBootstrap.results
  }

  return {
    code,
    types: allTypes,
    metadata: allTypes, // alias for runtime compatibility
    warnings: warnings.length > 0 ? warnings : undefined,
    testRunner: tests.length > 0 ? testRunner : undefined,
    testCount: tests.length > 0 ? tests.length : undefined,
    testResults,
    wasmCompiled,
  }
}

/**
 * Find ALL function declarations in the AST
 * Includes functions inside export declarations
 */
function findAllFunctions(program: Program): FunctionDeclaration[] {
  const functions: FunctionDeclaration[] = []

  for (const node of program.body) {
    if (node.type === 'FunctionDeclaration') {
      functions.push(node)
    } else if (
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration'
    ) {
      functions.push(node.declaration as FunctionDeclaration)
    } else if (
      node.type === 'ExportDefaultDeclaration' &&
      node.declaration?.type === 'FunctionDeclaration'
    ) {
      functions.push(node.declaration as FunctionDeclaration)
    }
  }

  return functions
}

/**
 * Serialize a TypeDescriptor to JSON-compatible object
 * Preserves full type structure (shape, items, members)
 */
function serializeType(t: TypeDescriptor): any {
  const result: any = { kind: t.kind }
  if (t.nullable) result.nullable = true
  if (t.items) result.items = serializeType(t.items)
  if (t.shape) {
    result.shape = Object.fromEntries(
      Object.entries(t.shape).map(([k, v]) => [k, serializeType(v)])
    )
  }
  if (t.members) result.members = t.members.map(serializeType)
  return result
}

/**
 * Safety options for metadata generation
 */
interface SafetyOptions {
  /** Function marked with (!) - never validate inputs */
  unsafe?: boolean
  /** Function marked with (?) - always validate inputs */
  safe?: boolean
  /** Return type safety: 'safe' (-?) or 'unsafe' (-!) */
  returnSafety?: 'safe' | 'unsafe'
}

/**
 * Debug options for metadata generation
 */
interface DebugOptions {
  /** Include source locations in metadata */
  debug?: boolean
  /** Source location of the function */
  source?: {
    file: string
    line: number
    column: number
  }
}

/**
 * Generate type metadata code
 *
 * @param funcName - Function name
 * @param types - Type information
 * @param safety - Safety flags for the function
 * @param debugOpts - Debug options (source locations)
 */
function generateTypeMetadata(
  funcName: string,
  types: TJSTypeInfo,
  safety: SafetyOptions = {},
  debugOpts: DebugOptions = {}
): string {
  const paramsObj: Record<string, any> = {}

  for (const [name, param] of Object.entries(types.params)) {
    paramsObj[name] = {
      type: serializeType(param.type),
      required: param.required,
    }
    if (param.default !== undefined) {
      paramsObj[name].default = param.default
    }
    if (param.description) {
      paramsObj[name].description = param.description
    }
  }

  const metadata: any = {
    params: paramsObj,
  }

  if (types.returns) {
    metadata.returns = {
      type: serializeType(types.returns),
    }
    // Add return safety flags
    if (safety.returnSafety === 'safe') {
      metadata.safeReturn = true // -? forces output validation
    } else if (safety.returnSafety === 'unsafe') {
      metadata.unsafeReturn = true // -! skips output validation
    }
  }

  if (types.description) {
    metadata.description = types.description
  }

  // Mark unsafe functions - they skip runtime input validation
  if (safety.unsafe) {
    metadata.unsafe = true
  }

  // Mark safe functions - they force runtime input validation
  if (safety.safe) {
    metadata.safe = true
  }

  // Always include source location for error reporting
  if (debugOpts.source) {
    const { file, line } = debugOpts.source
    metadata.source = `${file}:${line}`
  }

  return `${funcName}.__tjs = ${JSON.stringify(metadata, null, 2)}`
}

/**
 * Check if this function can use inline validation (the fast path)
 *
 * Two patterns qualify:
 * 1. Single destructured object param: function foo({ x: 0, y: '' }) { ... }
 * 2. Single named object param: function foo(input: { x: 0, y: '' }) { ... }
 *
 * These can be validated with fast inline checks instead of schema interpretation.
 */
function canUseInlineValidation(types: TJSTypeInfo): boolean {
  // Destructured params always qualify
  if (types.isDestructuredParam && types.destructuredShape) {
    return true
  }

  // Any function with params can use inline validation
  // (we generate typeof checks for primitives too)
  return Object.keys(types.params).length > 0
}

/**
 * Generate inline validation code for single-arg object types
 *
 * This is ~20x faster than schema-based validation because:
 * 1. No schema interpretation at runtime
 * 2. No object iteration
 * 3. JIT can inline the checks
 *
 * Generated code looks like:
 *   if (typeof input !== 'object' || input === null ||
 *       typeof input.x !== 'number' ||
 *       typeof input.y !== 'number') {
 *     return { $error: true, message: '...', path: 'funcName.input' }
 *   }
 */
export function generateInlineValidation(
  funcName: string,
  paramName: string,
  shape: Record<string, TypeDescriptor>,
  requiredFields: Set<string>
): string {
  const checks: string[] = []
  const path = `${funcName}.${paramName}`

  // Check it's an object
  checks.push(`typeof ${paramName} !== 'object'`)
  checks.push(`${paramName} === null`)

  // Check each field
  for (const [fieldName, fieldType] of Object.entries(shape)) {
    const fieldPath = `${paramName}.${fieldName}`
    const isRequired = requiredFields.has(fieldName)

    const typeCheck = generateTypeCheck(fieldPath, fieldType)
    if (typeCheck) {
      if (isRequired) {
        // Required: must exist and have correct type
        checks.push(typeCheck)
      } else {
        // Optional: only check type if defined
        checks.push(`(${fieldPath} !== undefined && ${typeCheck})`)
      }
    }
  }

  if (checks.length === 0) return ''

  return `if (${checks.join(' || ')}) {
  return { $error: true, message: 'Invalid ${paramName}', path: '${path}' }
}`
}

/**
 * Generate a type check expression for a single field
 * Returns null if no check needed (e.g., 'any' type)
 */
/**
 * Generate a type check expression for a single field
 * Returns an expression that evaluates to true when type is INVALID
 * Returns null if no check needed (e.g., 'any' type)
 */
function generateTypeCheckExpr(
  fieldPath: string,
  type: TypeDescriptor
): string | null {
  switch (type.kind) {
    case 'string':
      return `typeof ${fieldPath} !== 'string'`
    case 'number':
      return `typeof ${fieldPath} !== 'number'`
    case 'boolean':
      return `typeof ${fieldPath} !== 'boolean'`
    case 'null':
      return `${fieldPath} !== null`
    case 'undefined':
      return `${fieldPath} !== undefined`
    case 'array':
      return `!Array.isArray(${fieldPath})`
    case 'object':
      // For nested objects, just check it's an object (deep validation is separate)
      return `(typeof ${fieldPath} !== 'object' || ${fieldPath} === null || Array.isArray(${fieldPath}))`
    case 'any':
      return null // No check needed
    default:
      return null
  }
}

// Alias for backward compatibility with other functions that use this
const generateTypeCheck = generateTypeCheckExpr

/**
 * Generate the complete function wrapper with inline validation
 *
 * For destructured object params, this generates:
 *
 *   const _original_funcName = funcName
 *   funcName = function(__input) {
 *     if (typeof __input !== 'object' || __input === null || ...) {
 *       return { $error: true, message: '...', path: '...' }
 *     }
 *     return _original_funcName.call(this, __input)
 *   }
 *
 * For single named object params, same pattern with the actual param name.
 */
export function generateInlineWrapper(
  funcName: string,
  types: TJSTypeInfo,
  safety: SafetyOptions = {}
): string | null {
  // Check if we can use inline validation
  if (!canUseInlineValidation(types)) return null

  // Unsafe functions don't need wrappers
  if (safety.unsafe) return null

  // Destructured params: use __input as the wrapper param name
  if (types.isDestructuredParam && types.destructuredShape) {
    const paramName = '__input'
    const shape = types.destructuredShape
    const requiredFields = types.destructuredRequired || new Set()

    const validation = generateInlineValidation(
      funcName,
      paramName,
      shape,
      requiredFields
    )
    if (!validation) return null

    return `
const _original_${funcName} = ${funcName}
${funcName} = function(${paramName}) {
  ${validation}
  return _original_${funcName}.call(this, ${paramName})
}
`.trim()
  }

  // Positional params path (primitives or single object param)
  const params = Object.entries(types.params)

  // Check if it's a single object param with shape
  if (params.length === 1) {
    const [paramName, param] = params[0]
    if (param.type.kind === 'object' && param.type.shape) {
      // Single named object param
      const shape = param.type.shape
      const requiredFields = new Set<string>()
      for (const [fieldName] of Object.entries(shape)) {
        requiredFields.add(fieldName)
      }

      const validation = generateInlineValidation(
        funcName,
        paramName,
        shape,
        requiredFields
      )
      if (!validation) return null

      return `
const _original_${funcName} = ${funcName}
${funcName} = function(${paramName}) {
  ${validation}
  return _original_${funcName}.call(this, ${paramName})
}
`.trim()
    }
  }

  // Generate validation for positional primitive params
  const validation = generatePositionalValidation(funcName, params)
  if (!validation) return null

  const paramNames = params.map(([name]) => name).join(', ')
  return `
const _original_${funcName} = ${funcName}
${funcName} = function(${paramNames}) {
  ${validation}
  return _original_${funcName}.call(this, ${paramNames})
}
`.trim()
}

/**
 * Generate validation for positional (primitive) params
 */
function generatePositionalValidation(
  funcName: string,
  params: [string, ParameterDescriptor][]
): string | null {
  const checks: string[] = []

  for (const [paramName, param] of params) {
    const typeCheck = generateTypeCheck(paramName, param.type)
    if (typeCheck) {
      if (param.required) {
        // Required: must have correct type
        checks.push(typeCheck)
      } else {
        // Optional: only check if defined
        checks.push(`(${paramName} !== undefined && ${typeCheck})`)
      }
    }
  }

  if (checks.length === 0) return null

  return `if (${checks.join(' || ')}) {
    return { $error: true, message: 'Invalid arguments', path: '${funcName}' }
  }`
}

// =============================================================================
// Transpile-time Test Execution
// =============================================================================

/**
 * Fuzzy comparison for floating point numbers
 */
function fuzzyEqual(a: unknown, b: unknown, epsilon = 1e-9): boolean {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') {
    // Check if either is non-integer (float)
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      const diff = Math.abs(a - b)
      const maxAbs = Math.max(Math.abs(a), Math.abs(b), 1)
      return diff / maxAbs < epsilon
    }
  }
  return false
}

/**
 * Deep equality check with fuzzy float comparison
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (fuzzyEqual(a, b)) return true
  if (a === null || b === null) return a === b
  if (a === undefined || b === undefined) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false

  const keysA = Object.keys(a as object)
  const keysB = Object.keys(b as object)
  if (keysA.length !== keysB.length) return false
  return keysA.every((k) => deepEqual((a as any)[k], (b as any)[k]))
}

/**
 * Check if a value matches an expected type pattern (from example value)
 * Unlike deepEqual, this checks TYPE compatibility, not value equality.
 *
 * Example patterns:
 *   0 matches any number
 *   "" matches any string
 *   true matches any boolean
 *   null matches null
 *   [] matches any array
 *   [0] matches array of numbers
 *   {name: "", age: 0} matches object with string name and number age
 */
function typeMatches(
  actual: unknown,
  pattern: unknown,
  path = ''
): { matches: boolean; error?: string } {
  // null pattern matches null
  if (pattern === null) {
    if (actual === null) return { matches: true }
    return {
      matches: false,
      error: `Expected null at '${path}', got ${typeOf(actual)}`,
    }
  }

  // undefined pattern matches undefined
  if (pattern === undefined) {
    if (actual === undefined) return { matches: true }
    return {
      matches: false,
      error: `Expected undefined at '${path}', got ${typeOf(actual)}`,
    }
  }

  // Primitive types - check type, not value
  if (typeof pattern === 'number') {
    if (typeof actual === 'number') return { matches: true }
    return {
      matches: false,
      error: `Expected number at '${path}', got ${typeOf(actual)}`,
    }
  }

  if (typeof pattern === 'string') {
    if (typeof actual === 'string') return { matches: true }
    return {
      matches: false,
      error: `Expected string at '${path}', got ${typeOf(actual)}`,
    }
  }

  if (typeof pattern === 'boolean') {
    if (typeof actual === 'boolean') return { matches: true }
    return {
      matches: false,
      error: `Expected boolean at '${path}', got ${typeOf(actual)}`,
    }
  }

  // Arrays
  if (Array.isArray(pattern)) {
    if (!Array.isArray(actual)) {
      return {
        matches: false,
        error: `Expected array at '${path}', got ${typeOf(actual)}`,
      }
    }
    // Empty array pattern matches any array
    if (pattern.length === 0) return { matches: true }
    // Non-empty array pattern: check each element against first pattern element
    const elementPattern = pattern[0]
    for (let i = 0; i < actual.length; i++) {
      const result = typeMatches(actual[i], elementPattern, `${path}[${i}]`)
      if (!result.matches) return result
    }
    return { matches: true }
  }

  // Objects
  if (typeof pattern === 'object' && pattern !== null) {
    if (
      typeof actual !== 'object' ||
      actual === null ||
      Array.isArray(actual)
    ) {
      return {
        matches: false,
        error: `Expected object at '${path}', got ${typeOf(actual)}`,
      }
    }
    // Check all pattern keys exist and match types
    for (const key of Object.keys(pattern)) {
      const keyPath = path ? `${path}.${key}` : key
      if (!(key in actual)) {
        return { matches: false, error: `Missing property '${keyPath}'` }
      }
      const result = typeMatches(
        (actual as any)[key],
        (pattern as any)[key],
        keyPath
      )
      if (!result.matches) return result
    }
    return { matches: true }
  }

  // Fallback: exact equality
  if (actual === pattern) return { matches: true }
  return { matches: false, error: `Type mismatch at '${path}'` }
}

/**
 * Get a human-readable type description
 */
function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/**
 * Format a value for error messages - uses cleaner object notation
 * Multi-line for objects with 3+ properties
 */
function formatValue(v: unknown, indent = 0): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    if (v.length <= 3)
      return `[${v.map((x) => formatValue(x, indent)).join(', ')}]`
    return `[${v
      .slice(0, 3)
      .map((x) => formatValue(x, indent))
      .join(', ')}, ...]`
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v)
    if (entries.length === 0) return '{}'

    const formatKey = (k: string) =>
      /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k)

    // Single line for 1-2 properties
    if (entries.length <= 2) {
      const formatted = entries
        .map(([k, val]) => `${formatKey(k)}: ${formatValue(val, indent)}`)
        .join(', ')
      return `{${formatted}}`
    }

    // Multi-line for 3+ properties
    const pad = '  '.repeat(indent + 1)
    const closePad = '  '.repeat(indent)
    const formatted = entries
      .slice(0, 8)
      .map(
        ([k, val]) => `${pad}${formatKey(k)}: ${formatValue(val, indent + 1)}`
      )
      .join(',\n')
    const suffix = entries.length > 8 ? `,\n${pad}...` : ''
    return `{\n${formatted}${suffix}\n${closePad}}`
  }
  return String(v)
}

import type { ExtractedTest, ExtractedMock } from '../tests'

/**
 * Strip comments from source code
 * Used to avoid matching code patterns inside comments
 */
function stripComments(code: string): string {
  // Replace block comments with equivalent whitespace (preserve line numbers)
  let result = code.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    // Replace with same number of newlines to preserve line numbers
    const newlines = match.split('\n').length - 1
    return '\n'.repeat(newlines)
  })

  // Replace line comments
  result = result.replace(/\/\/[^\n]*/g, '')

  return result
}

/**
 * Strip import/export syntax for test execution context
 * Tests run in new Function() which doesn't support ES modules
 *
 * Useful for:
 * - Running tests in new Function() context
 * - CLI test runners
 * - Bundler plugins that need to extract module code
 */
export function stripModuleSyntax(code: string): string {
  // Remove import statements (entire line)
  let result = code.replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  result = result.replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '')

  // Remove 'export ' keyword but keep the declaration
  result = result.replace(/^export\s+default\s+/gm, '')
  result = result.replace(/^export\s+/gm, '')

  return result
}

/**
 * Strip the __tjs runtime preamble from transpiled code
 * This is needed when injecting resolved imports into a test context
 * that already has its own __tjs stub
 *
 * Useful for:
 * - Combining multiple TJS modules into a single execution context
 * - Test runners that provide their own __tjs runtime
 * - Bundlers that need to deduplicate runtime setup
 */
export function stripTjsPreamble(code: string): string {
  // Remove the __tjs runtime setup lines:
  // const __tjs = globalThis.__tjs?.createRuntime?.() ?? globalThis.__tjs;
  // const { Is, IsNot } = __tjs ?? {};
  let result = code.replace(
    /^const __tjs = globalThis\.__tjs\?\.createRuntime\?\.\(\) \?\? globalThis\.__tjs;\n?/m,
    ''
  )
  result = result.replace(
    /^const \{ (?:Is|IsNot|Is, IsNot) \} = __tjs \?\? \{\};\n?/m,
    ''
  )
  return result
}

/**
 * Build code to inject resolved imports into test execution context
 *
 * Takes a map of module specifier -> compiled code and returns code that
 * makes those exports available in the test scope.
 *
 * For example, if resolvedImports contains:
 *   { 'mymath': 'function add(a, b) { return a + b }\nadd.__tjs = {...}' }
 *
 * This will return code that evaluates that module and makes `add` available.
 */
function buildResolvedImportsCode(
  resolvedImports: Record<string, string>
): string {
  if (Object.keys(resolvedImports).length === 0) {
    return ''
  }

  const lines: string[] = []

  for (const [specifier, moduleCode] of Object.entries(resolvedImports)) {
    // Strip module syntax from the imported code too (it may have exports)
    let cleanCode = stripModuleSyntax(moduleCode)
    // Strip __tjs preamble to avoid duplicate declarations
    // (test execution context provides its own __tjs stub)
    cleanCode = stripTjsPreamble(cleanCode)

    lines.push(`// Resolved import: ${specifier}`)
    lines.push(cleanCode)
  }

  return lines.join('\n')
}

/**
 * Info about a signature test (extracted but not yet executed)
 */
interface SignatureTestInfo {
  funcName: string
  args: unknown[]
  expected: unknown
  line: number
}

/**
 * Extract signature test info from source without executing
 */
function extractSignatureTestInfos(
  originalSource: string
): SignatureTestInfo[] {
  const infos: SignatureTestInfo[] = []

  // Strip comments to avoid matching functions inside doc comments/code examples
  const sourceWithoutComments = stripComments(originalSource)

  // Match function declarations with return type marker (-> or -?)
  // Skip -! which means "don't test"
  // Pattern: function name(params) -> returnExample {
  const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*(-[>?])\s*/g

  let match
  while ((match = funcRegex.exec(sourceWithoutComments)) !== null) {
    const funcName = match[1]
    const paramsStr = match[2]
    const returnMarker = match[3]

    // Calculate line number from match position in stripped source
    const lineNumber = sourceWithoutComments
      .slice(0, match.index)
      .split('\n').length

    // -! means skip test
    if (returnMarker === '-!') continue

    // Extract return example - handle nested braces/brackets
    const afterMarker = sourceWithoutComments.slice(
      match.index + match[0].length
    )
    const returnExample = extractReturnExampleFromSource(afterMarker)
    if (!returnExample) continue

    // Extract parameter examples
    const paramExamples = extractParamExamples(paramsStr)
    if (paramsStr.trim() && paramExamples.length === 0) continue

    try {
      // Parse expected value and args
      const expected = new Function(`return ${returnExample}`)()
      const args = paramExamples.map((p) => new Function(`return ${p}`)())

      infos.push({ funcName, args, expected, line: lineNumber })
    } catch {
      // Skip if parsing fails - will be reported as error during execution
    }
  }

  return infos
}

/**
 * Run all tests (explicit blocks + signature tests) in a single execution context
 * This executes the module only once, then runs all tests against that context
 */
function runAllTests(
  tests: ExtractedTest[],
  mocks: ExtractedMock[],
  sigTestInfos: SignatureTestInfo[],
  transpiledCode: string,
  resolvedImports: Record<string, string> = {}
): TestResult[] {
  const results: TestResult[] = []

  // If no tests at all, return empty
  if (tests.length === 0 && sigTestInfos.length === 0) {
    return results
  }

  // Strip import/export for test execution (can't use modules in new Function)
  let executableCode = stripModuleSyntax(transpiledCode)
  // Strip __tjs preamble - test context provides its own stub
  executableCode = stripTjsPreamble(executableCode)

  // Build resolved imports code - inject imported module code into execution context
  const importedCode = buildResolvedImportsCode(resolvedImports)

  // Build mock setup
  const mockSetup = mocks.map((m) => m.body).join('\n')

  // Build test execution code that runs all tests in sequence
  const testBodies = tests
    .map(
      (t, i) => `
    // Test ${i}: ${t.description}
    try {
      ${t.body}
      __testResults.push({ idx: ${i}, passed: true });
    } catch (e) {
      __testResults.push({ idx: ${i}, passed: false, error: e.message || String(e) });
    }
  `
    )
    .join('\n')

  // Build signature test execution code
  const sigTestBodies = sigTestInfos
    .map(
      (info, i) => `
    // Signature test ${i}: ${info.funcName}
    try {
      const __actual = ${info.funcName}(${info.args
        .map((a) => JSON.stringify(a))
        .join(', ')});
      const __expected = ${JSON.stringify(info.expected)};
      const __typeResult = __typeMatches(__actual, __expected, '${
        info.funcName
      }');
      if (__typeResult.matches) {
        __sigTestResults.push({ idx: ${i}, passed: true });
      } else {
        __sigTestResults.push({ idx: ${i}, passed: false, error: __typeResult.error || 'Type mismatch: got ' + __format(__actual) });
      }
    } catch (e) {
      __sigTestResults.push({ idx: ${i}, passed: false, error: e.message || String(e) });
    }
  `
    )
    .join('\n')

  // TJS stub setup/restore
  const tjsStub = `
    const __saved_tjs = globalThis.__tjs;
    const __stub_tjs = { version: '0.0.0', pushStack: () => {}, typeError: (path, expected, value) => new Error(\`Type error at \${path}: expected \${expected}\`), createRuntime: function() { return this; } };
    globalThis.__tjs = __stub_tjs;
  `
  const tjsRestore = `globalThis.__tjs = __saved_tjs;`

  // Combined test code - execute module ONCE, then run all tests
  const testCode = `
    ${tjsStub}
    const __testResults = [];
    const __sigTestResults = [];
    try {
      // Test assertions
      function assert(condition, message) {
        if (!condition) throw new Error(message || 'Assertion failed')
      }

      function expect(actual) {
        return {
          toBe(expected) {
            if (!__deepEqual(actual, expected)) {
              throw new Error('Expected ' + __format(expected) + ' but got ' + __format(actual))
            }
          },
          toEqual(expected) {
            if (!__deepEqual(actual, expected)) {
              throw new Error('Expected ' + __format(expected) + ' but got ' + __format(actual))
            }
          },
          toContain(item) {
            if (!Array.isArray(actual) || !actual.some(function(v) { return __deepEqual(v, item) })) {
              throw new Error('Expected ' + __format(actual) + ' to contain ' + __format(item))
            }
          },
          toBeTruthy() {
            if (!actual) {
              throw new Error('Expected ' + __format(actual) + ' to be truthy')
            }
          },
          toBeFalsy() {
            if (actual) {
              throw new Error('Expected ' + __format(actual) + ' to be falsy')
            }
          },
          toBeNull() {
            if (actual !== null) {
              throw new Error('Expected null but got ' + __format(actual))
            }
          },
          toBeUndefined() {
            if (actual !== undefined) {
              throw new Error('Expected undefined but got ' + __format(actual))
            }
          },
          toBeGreaterThan(n) {
            if (!(actual > n)) {
              throw new Error('Expected ' + __format(actual) + ' to be greater than ' + n)
            }
          },
          toBeLessThan(n) {
            if (!(actual < n)) {
              throw new Error('Expected ' + __format(actual) + ' to be less than ' + n)
            }
          }
        }
      }

      // Inject resolved imports first (they may be dependencies)
      ${importedCode}

      // Execute the module code ONCE
      ${executableCode}
      ${mockSetup}

      // Run explicit test blocks
      ${testBodies}

      // Run signature tests
      ${sigTestBodies}

    } finally {
      ${tjsRestore}
    }
    return { testResults: __testResults, sigTestResults: __sigTestResults };
  `

  try {
    // Execute all tests
    const fn = new Function(
      '__deepEqual',
      '__format',
      '__typeMatches',
      testCode
    )
    const { testResults: blockResults, sigTestResults } = fn(
      deepEqual,
      formatValue,
      typeMatches
    )

    // Map block test results
    for (const r of blockResults) {
      const test = tests[r.idx]
      results.push({
        description: test.description,
        passed: r.passed,
        error: r.error,
        line: test.line,
      })
    }

    // Map signature test results
    for (const r of sigTestResults) {
      const info = sigTestInfos[r.idx]
      results.push({
        description: `${info.funcName} signature example`,
        passed: r.passed,
        error: r.error,
        isSignatureTest: true,
        line: info.line,
      })
    }
  } catch (e: any) {
    // Module execution failed - all tests fail
    for (const test of tests) {
      results.push({
        description: test.description,
        passed: false,
        error: `Module execution failed: ${e.message}`,
        line: test.line,
      })
    }
    for (const info of sigTestInfos) {
      results.push({
        description: `${info.funcName} signature example`,
        passed: false,
        error: `Module execution failed: ${e.message}`,
        isSignatureTest: true,
        line: info.line,
      })
    }
  }

  return results
}

/**
 * Run extracted test blocks at transpile time
 * @deprecated Use runAllTests instead for single execution context
 */
function runTestBlocks(
  tests: ExtractedTest[],
  mocks: ExtractedMock[],
  transpiledCode: string,
  resolvedImports: Record<string, string> = {}
): TestResult[] {
  const results: TestResult[] = []

  // Strip import/export for test execution (can't use modules in new Function)
  let executableCode = stripModuleSyntax(transpiledCode)
  // Strip __tjs preamble - test context provides its own stub
  executableCode = stripTjsPreamble(executableCode)

  // Build resolved imports code - inject imported module code into execution context
  const importedCode = buildResolvedImportsCode(resolvedImports)

  // Build execution context with the transpiled function
  const mockSetup = mocks.map((m) => m.body).join('\n')

  for (const test of tests) {
    try {
      // Create a function that runs the test
      // Always provide a clean __tjs stub for isolated test execution
      // Save and restore globalThis.__tjs to prevent pollution
      const tjsStub = `
        const __saved_tjs = globalThis.__tjs;
        const __stub_tjs = { version: '0.0.0', pushStack: () => {}, typeError: (path, expected, value) => new Error(\`Type error at \${path}: expected \${expected}\`), createRuntime: function() { return this; } };
        globalThis.__tjs = __stub_tjs;
      `
      const tjsRestore = `globalThis.__tjs = __saved_tjs;`
      const testCode = `
        ${tjsStub}
        try {
          // Inject resolved imports first (they may be dependencies)
          ${importedCode}
          ${executableCode}
          ${mockSetup}

          // Test assertions
          function assert(condition, message) {
            if (!condition) throw new Error(message || 'Assertion failed')
          }

          function expect(actual) {
            return {
              toBe(expected) {
                if (!__deepEqual(actual, expected)) {
                  throw new Error('Expected ' + __format(expected) + ' but got ' + __format(actual))
                }
              },
              toEqual(expected) {
                if (!__deepEqual(actual, expected)) {
                  throw new Error('Expected ' + __format(expected) + ' but got ' + __format(actual))
                }
              },
              toContain(item) {
                if (!Array.isArray(actual) || !actual.some(function(v) { return __deepEqual(v, item) })) {
                  throw new Error('Expected ' + __format(actual) + ' to contain ' + __format(item))
                }
              },
              toBeTruthy() {
                if (!actual) {
                  throw new Error('Expected ' + __format(actual) + ' to be truthy')
                }
              },
              toBeFalsy() {
                if (actual) {
                  throw new Error('Expected ' + __format(actual) + ' to be falsy')
                }
              },
              toBeNull() {
                if (actual !== null) {
                  throw new Error('Expected null but got ' + __format(actual))
                }
              },
              toBeUndefined() {
                if (actual !== undefined) {
                  throw new Error('Expected undefined but got ' + __format(actual))
                }
              },
              toBeGreaterThan(n) {
                if (!(actual > n)) {
                  throw new Error('Expected ' + __format(actual) + ' to be greater than ' + n)
                }
              },
              toBeLessThan(n) {
                if (!(actual < n)) {
                  throw new Error('Expected ' + __format(actual) + ' to be less than ' + n)
                }
              }
            }
          }

          // Run the test body
          ${test.body}
        } finally {
          ${tjsRestore}
        }
      `

      // Execute the test
      const fn = new Function('__deepEqual', '__format', testCode)
      fn(deepEqual, formatValue)

      results.push({
        description: test.description,
        passed: true,
        line: test.line,
      })
    } catch (e: any) {
      results.push({
        description: test.description,
        passed: false,
        error: e.message || String(e),
        line: test.line,
      })
    }
  }

  return results
}

/**
 * Evaluate an ObjectExpression AST node to a plain object
 */
function evalObjectExpression(node: any): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const prop of node.properties) {
    if (prop.type === 'Property' && prop.key) {
      const key =
        prop.key.type === 'Identifier' ? prop.key.name : prop.key.value
      if (prop.value.type === 'Literal') {
        result[key] = prop.value.value
      } else if (prop.value.type === 'ObjectExpression') {
        result[key] = evalObjectExpression(prop.value)
      } else if (prop.value.type === 'ArrayExpression') {
        result[key] = evalArrayExpression(prop.value)
      } else {
        throw new Error('Unsupported value type')
      }
    }
  }
  return result
}

/**
 * Evaluate an ArrayExpression AST node to an array
 */
function evalArrayExpression(node: any): unknown[] {
  const result: unknown[] = []
  for (const elem of node.elements) {
    if (elem.type === 'Literal') {
      result.push(elem.value)
    } else if (elem.type === 'ObjectExpression') {
      result.push(evalObjectExpression(elem))
    } else if (elem.type === 'ArrayExpression') {
      result.push(evalArrayExpression(elem))
    } else {
      throw new Error('Unsupported element type')
    }
  }
  return result
}

/**
 * Extract and run signature tests for ALL functions with -> return types
 * Parses the original source to find function signatures
 *
 * Current limitations (future work):
 * - Only tests top-level `function` declarations (not arrow functions yet)
 * - Nested functions (inside other functions/blocks) are not excluded yet
 *   and will fail if tested since they're not in global scope
 * - Arrow functions like `Foo = (x: 5) -> 10 => {}` not yet supported
 */
function runAllSignatureTests(
  originalSource: string,
  transpiledCode: string,
  resolvedImports: Record<string, string> = {}
): TestResult[] {
  const results: TestResult[] = []

  // Strip comments to avoid matching functions inside doc comments/code examples
  const sourceWithoutComments = stripComments(originalSource)

  // Match function declarations with return type marker (-> or -?)
  // Skip -! which means "don't test"
  // Pattern: function name(params) -> returnExample {
  const funcRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*(-[>?])\s*/g

  let match
  while ((match = funcRegex.exec(sourceWithoutComments)) !== null) {
    const funcName = match[1]
    const paramsStr = match[2]
    const returnMarker = match[3]

    // Calculate line number from match position in stripped source
    const lineNumber = sourceWithoutComments
      .slice(0, match.index)
      .split('\n').length

    // -! means skip test
    if (returnMarker === '-!') continue

    // Extract return example - handle nested braces/brackets
    // Use stripped source since match.index is from that
    const afterMarker = sourceWithoutComments.slice(
      match.index + match[0].length
    )
    const returnExample = extractReturnExampleFromSource(afterMarker)
    if (!returnExample) continue

    // Extract parameter examples
    const paramExamples = extractParamExamples(paramsStr)
    if (paramsStr.trim() && paramExamples.length === 0) continue

    // Run the signature test
    try {
      const expectedStr = returnExample

      // Parse expected value
      const expected = new Function(`return ${expectedStr}`)()

      // Parse args
      const args = paramExamples.map((p) => new Function(`return ${p}`)())

      const result = runSignatureTest(
        funcName,
        transpiledCode,
        args,
        expected,
        resolvedImports
      )
      result.line = lineNumber
      results.push(result)
    } catch (e: any) {
      results.push({
        description: `${funcName} signature example`,
        passed: false,
        error: `Failed to parse signature: ${e.message}`,
        isSignatureTest: true,
        line: lineNumber,
      })
    }
  }

  return results
}

/**
 * Extract return type example from source, handling nested braces
 */
function extractReturnExampleFromSource(source: string): string | null {
  let result = ''
  let depth = 0
  let hasContent = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]

    if (char === '{' || char === '[' || char === '(') {
      if (char === '{' && depth === 0 && hasContent) {
        // Found the function body opening brace
        break
      }
      depth++
      result += char
      hasContent = true
    } else if (char === '}' || char === ']' || char === ')') {
      depth--
      result += char
    } else if (!/\s/.test(char)) {
      result += char
      hasContent = true
    } else {
      result += char
    }
  }

  const trimmed = result.trim()
  return trimmed || null
}

/**
 * Extract parameter example values from params string
 */
function extractParamExamples(paramsStr: string): string[] {
  if (!paramsStr.trim()) return []

  const examples: string[] = []
  const params = splitParams(paramsStr)

  for (const param of params) {
    // Match: name: example or name = example (with optional safety markers)
    // Handle: (? name: example) or (! name: example)
    const match = param.match(/(?:\(\s*[?!]\s*)?(\w+)\s*[:=]\s*(.+?)(?:\))?$/)
    if (match) {
      examples.push(match[2].trim())
    } else {
      // No example value - can't run signature test
      return []
    }
  }

  return examples
}

/**
 * Split parameter string on commas, respecting nested structures
 */
function splitParams(paramsStr: string): string[] {
  const params: string[] = []
  let current = ''
  let depth = 0

  for (const char of paramsStr) {
    if (char === '(' || char === '[' || char === '{') depth++
    else if (char === ')' || char === ']' || char === '}') depth--
    else if (char === ',' && depth === 0) {
      params.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  if (current.trim()) params.push(current.trim())
  return params
}

/**
 * Run signature example test
 */
function runSignatureTest(
  funcName: string,
  transpiledCode: string,
  args: unknown[],
  expected: unknown,
  resolvedImports: Record<string, string> = {}
): TestResult {
  const description = `${funcName} signature example`

  // Strip import/export for test execution (can't use modules in new Function)
  let executableCode = stripModuleSyntax(transpiledCode)
  // Strip __tjs preamble - test context provides its own stub
  executableCode = stripTjsPreamble(executableCode)

  // Build resolved imports code - inject imported module code into execution context
  const importedCode = buildResolvedImportsCode(resolvedImports)

  try {
    // Execute the function with example args
    // Provide a minimal __tjs stub for pushStack/typeError (used by inline validation)
    // Only define if not already in the transpiled code
    // Always provide a clean __tjs stub for isolated test execution
    // Save and restore globalThis.__tjs to prevent pollution
    const tjsStub = `
      const __saved_tjs = globalThis.__tjs;
      const __stub_tjs = { version: '0.0.0', pushStack: () => {}, typeError: (path, expected, value) => new Error(\`Type error at \${path}: expected \${expected}\`), createRuntime: function() { return this; } };
      globalThis.__tjs = __stub_tjs;
    `
    const tjsRestore = `globalThis.__tjs = __saved_tjs;`
    const testCode = `
      ${tjsStub}
      try {
        // Inject resolved imports first (they may be dependencies)
        ${importedCode}
        ${executableCode}
        return ${funcName}(${args.map((a) => JSON.stringify(a)).join(', ')})
      } finally {
        ${tjsRestore}
      }
    `
    const fn = new Function(testCode)
    const actual = fn()

    // Use type matching, not value equality
    // The expected value is a TYPE PATTERN (example), not the exact expected result
    const result = typeMatches(actual, expected, funcName)
    if (!result.matches) {
      return {
        description,
        passed: false,
        error: result.error || `Type mismatch: got ${formatValue(actual)}`,
        isSignatureTest: true,
      }
    }

    return { description, passed: true, isSignatureTest: true }
  } catch (e: any) {
    return {
      description,
      passed: false,
      error: e.message || String(e),
      isSignatureTest: true,
    }
  }
}

/**
 * Compile WASM blocks and generate bootstrap code that embeds the compiled bytes
 * and instantiates them on load.
 */
function generateWasmBootstrap(blocks: import('../parser').WasmBlock[]): {
  code: string
  results: {
    id: string
    success: boolean
    error?: string
    byteLength?: number
  }[]
} {
  const results: {
    id: string
    success: boolean
    error?: string
    byteLength?: number
  }[] = []
  const compiledBlocks: {
    id: string
    base64: string
    captures: string[]
    needsMemory: boolean
    wat: string
  }[] = []

  for (const block of blocks) {
    const result = compileToWasm(block)
    if (result.success) {
      // Convert bytes to base64 for embedding
      const base64 = btoa(String.fromCharCode(...result.bytes))
      compiledBlocks.push({
        id: block.id,
        base64,
        captures: block.captures,
        needsMemory: result.needsMemory ?? false,
        wat: result.wat ?? '',
      })
      results.push({
        id: block.id,
        success: true,
        byteLength: result.bytes.length,
      })
    } else {
      results.push({
        id: block.id,
        success: false,
        error: result.error,
      })
    }
  }

  if (compiledBlocks.length === 0) {
    return { code: '', results }
  }

  // Generate WAT comments for each block
  const watComments = compiledBlocks
    .map((b) => {
      const watLines = b.wat.split('\n').map((line) => ` * ${line}`)
      return `/**\n * WASM: ${b.id}\n${watLines.join('\n')}\n */`
    })
    .join('\n')

  // Generate self-contained bootstrap code
  // This runs immediately and sets up globalThis.__tjs_wasm_N functions
  const blockData = compiledBlocks
    .map(
      (b) =>
        `{id:${JSON.stringify(b.id)},b64:${JSON.stringify(
          b.base64
        )},c:${JSON.stringify(b.captures)},m:${b.needsMemory}}`
    )
    .join(',')

  const code = `${watComments}
;(async()=>{
const __wasmBlocks=[${blockData}];
const __b64ToBytes=s=>{const b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a};
const __parseType=c=>{const m=c.match(/^(\\w+)\\s*:\\s*(\\w+)$/);if(!m)return{n:c,t:'f64',a:false};const[,n,ts]=m;const at={Float32Array:'f32',Float64Array:'f64',Int32Array:'i32',Uint8Array:'i32'};if(at[ts])return{n,t:'i32',a:true,at:ts};return{n,t:'f64',a:false}};
for(const{id,b64,c,m}of __wasmBlocks){
  const bytes=__b64ToBytes(b64);
  const params=c.map(__parseType);
  const hasArrays=params.some(p=>p.a);
  let mem;if(m)mem=new WebAssembly.Memory({initial:256});
  const imp=mem?{env:{memory:mem}}:{};
  const inst=await WebAssembly.instantiate(await WebAssembly.compile(bytes),imp);
  const compute=inst.exports.compute;
  if(!hasArrays){globalThis[id]=compute;continue}
  globalThis[id]=function(...args){
    const mv=new Uint8Array(mem.buffer);let off=0;const ptrs=[];
    for(let i=0;i<params.length;i++){const p=params[i],a=args[i];
      if(p.a&&a?.buffer){const ab=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);mv.set(ab,off);ptrs.push(off);off+=ab.length;off=(off+7)&~7}
      else ptrs.push(a)}
    const r=compute(...ptrs);off=0;
    for(let i=0;i<params.length;i++){const p=params[i],a=args[i];
      if(p.a&&a?.buffer){const ab=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);ab.set(mv.slice(off,off+ab.length));off+=ab.length;off=(off+7)&~7}}
    return r};
}})();
`.trim()

  return { code, results }
}
