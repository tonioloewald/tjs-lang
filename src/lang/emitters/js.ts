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
import {
  parse,
  extractTDoc,
  preprocess,
  transformExtensionCalls,
} from '../parser'
import type { TypeDescriptor, ParameterDescriptor } from '../types'
import { inferTypeFromValue, parseParameter } from '../inference'
import { extractTests } from '../tests'
import {
  runAllTests,
  extractSignatureTestInfos,
  extractReturnExampleFromSource,
} from './js-tests'
export { stripModuleSyntax, stripTjsPreamble } from './js-tests'
import { generateWasmBootstrap } from './js-wasm'

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
export type { TestResult } from './js-tests'
import type { TestResult } from './js-tests'

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
 * Check if a param used `:` (required) or `=` (optional) in the raw source.
 * Finds the function's param list by name, then looks for `paramName:` vs `paramName =`.
 */
function isParamRequiredInSource(
  source: string,
  funcName: string,
  paramName: string
): boolean {
  if (!source || !funcName) return false
  // Find the function declaration and its param list
  const funcPattern = new RegExp(
    `function\\s+${funcName}\\s*\\([^)]*?\\b${paramName}\\s*([=:])`,
    's'
  )
  const match = source.match(funcPattern)
  if (!match) return false
  return match[1] === ':'
}

/**
 * Extract type info for a single function declaration
 */
function extractFunctionTypeInfo(
  func: FunctionDeclaration,
  originalSource: string,
  requiredParams: Set<string>,
  returnTypeStr: string | null,
  inputSource?: string
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
        // Determine if this param used `:` (required) or `=` (optional).
        // The global requiredParams set is name-based, which fails when
        // two functions share a param name with different syntax.
        // Use the raw input source to check the actual syntax.
        const isRequired = isParamRequiredInSource(
          inputSource || '',
          func.id?.name || '',
          param.left.name
        )
        params[param.left.name] = {
          ...paramInfo,
          required: isRequired,
          default: isRequired ? null : paramInfo.example ?? paramInfo.default,
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
      // Transform `key = value` (default keys) to `key: value` for acorn parsing
      const parsableReturnStr = returnTypeStr.includes('=')
        ? transformReturnDefaults(returnTypeStr)
        : returnTypeStr
      const returnExpr = parseExpressionAt(parsableReturnStr, 0, {
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
): { preamble: string; suffix: string } | null {
  const lines: string[] = []
  // Include source in path if available: "src/file.ts:42:funcName.param"
  const pathPrefix = source ? `${source}:` : ''
  const stackEntry = source ? `${source}:${funcName}` : funcName

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

    if (lines.length === 0) return null

    // Push stack first, then validate — callStack includes current function
    // finally block ensures popStack on all exit paths
    lines.unshift(`__tjs.pushStack('${stackEntry}');`)
    lines.unshift(`try {`)

    return {
      preamble: lines.join('\n  '),
      suffix: '} finally { __tjs.popStack(); }',
    }
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
      const expectedType =
        param.type.kind === 'union'
          ? (param.type as any).members.map((m: any) => m.kind).join(' | ')
          : param.type.kind
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

  if (lines.length === 0) return null

  // Push stack first, then validate — callStack includes current function
  // finally block ensures popStack on all exit paths
  lines.unshift(`__tjs.pushStack('${stackEntry}');`)
  lines.unshift(`try {`)

  return {
    preamble: lines.join('\n  '),
    suffix: '} finally { __tjs.popStack(); }',
  }
}

/**
 * Transform `key = value` to `key: value` in a return type string
 * so acorn can parse it as a valid JS object expression.
 */
function transformReturnDefaults(str: string): string {
  let result = ''
  let depth = 0

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++
      result += ch
    } else if (ch === '}' || ch === ']' || ch === ')') {
      depth--
      result += ch
    } else if (ch === "'" || ch === '"' || ch === '`') {
      result += ch
      i++
      while (i < str.length && str[i] !== ch) {
        if (str[i] === '\\') result += str[i++]
        result += str[i++]
      }
      if (i < str.length) result += str[i]
    } else if (
      depth === 1 &&
      ch === '=' &&
      str[i - 1] !== '!' &&
      str[i + 1] !== '='
    ) {
      // Top-level = that isn't != or == — replace with :
      result += ':'
    } else {
      result += ch
    }
  }

  return result
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
  // Collect deletions for | union suffixes in param defaults
  // e.g. `x = false | undefined` -> `x = false` (the `| undefined` is type-only)
  const deletions: { start: number; end: number }[] = []

  // Process each function
  for (const func of functions) {
    const funcName = func.id?.name || 'anonymous'

    // Extract return type for this specific function from original source
    const returnTypeStr = extractFunctionReturnType(cleanSource, funcName)

    // Extract default values from return type (e.g. { value: 0, error = '' })
    let returnDefaults: Record<string, unknown> | undefined
    if (returnTypeStr && returnTypeStr.includes('=')) {
      try {
        const defaultsMatch = returnTypeStr.matchAll(/(\w+)\s*=\s*/g)
        const transformed = transformReturnDefaults(returnTypeStr)
        const parsed = new Function(`return ${transformed}`)()
        const defaults: Record<string, unknown> = {}
        for (const m of defaultsMatch) {
          const key = m[1]
          if (key in parsed) defaults[key] = parsed[key]
        }
        if (Object.keys(defaults).length > 0) returnDefaults = defaults
      } catch {
        // If parsing fails, skip defaults
      }
    }

    // Extract type info for this function
    const { types, warnings: funcWarnings } = extractFunctionTypeInfo(
      func,
      originalSource,
      requiredParams,
      returnTypeStr,
      cleanSource
    )
    warnings.push(...funcWarnings)
    allTypes[funcName] = types

    // Clean up param defaults in the emitted JS.
    // After colon→equals transform, `x: false | undefined` becomes
    // `x = false | undefined` in the parsed source.
    // - For required params (`:` syntax), strip the entire `= value` — there's
    //   no JS default for required params, the value is a type annotation only.
    // - For union defaults, strip just the `| suffix` to avoid bitwise OR.
    for (const param of func.params) {
      if (param.type === 'AssignmentPattern') {
        const paramName =
          (param as any).left?.name || (param as any).left?.value
        const paramInfo = paramName ? types.params[paramName] : null

        if (paramInfo?.required && paramInfo.default === null) {
          // Required param — strip entire `= value` from JS output
          deletions.push({
            start: (param as any).left.end,
            end: (param as any).right.end,
          })
        } else {
          // Optional param with union — strip just the `| suffix`
          const right = (param as any).right
          if (right.type === 'BinaryExpression' && right.operator === '|') {
            deletions.push({ start: right.left.end, end: right.end })
          }
        }
      }
    }

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

    // Check if this is a polymorphic dispatcher
    const isPolymorphicDispatcher = preprocessed.polymorphicNames.has(funcName)

    // Generate __tjs metadata (to insert after function)
    let typeMetadata: string
    if (isPolymorphicDispatcher) {
      // Build composite metadata referencing variants
      const variantNames: string[] = []
      for (const f of functions) {
        const fn = f.id?.name || ''
        if (fn.startsWith(funcName + '$')) variantNames.push(fn)
      }
      const metadata: any = {
        polymorphic: true,
        variants: variantNames,
      }
      if (funcLoc) {
        metadata.source = `${funcLoc.file}:${funcLoc.line}`
      }
      typeMetadata = `${funcName}.__tjs = ${JSON.stringify(metadata, null, 2)}`
    } else {
      typeMetadata = generateTypeMetadata(funcName, types, safetyOptions, {
        debug,
        source: funcLoc,
        returnDefaults,
      })
    }

    // Queue insertion of __tjs after function closing brace
    insertions.push({
      position: func.end,
      text: `\n${typeMetadata}`,
    })

    // Generate inline validation (to insert at start of function body)
    // Skip for unsafe functions and polymorphic dispatchers (they handle routing)
    if (!isUnsafe && !isPolymorphicDispatcher) {
      const sourceStr = `${funcLoc.file}:${funcLoc.line}`
      const validation = generateInlineValidationCode(
        funcName,
        types,
        sourceStr
      )
      if (validation && func.body && func.body.start !== undefined) {
        // Insert preamble right after the opening brace
        insertions.push({
          position: func.body.start + 1,
          text: `\n  ${validation.preamble}\n`,
        })
        // Insert suffix (popStack) right before the closing brace
        insertions.push({
          position: func.body.end - 1,
          text: `\n  ${validation.suffix}\n`,
        })
      }
    }
  }

  // Apply deletions first (reverse order to maintain offsets), then insertions.
  // Deletions strip | union suffixes from param defaults in the output JS.
  deletions.sort((a, b) => b.start - a.start)
  let code = preprocessed.source
  for (const { start, end } of deletions) {
    code = code.slice(0, start) + code.slice(end)
  }

  // Adjust insertion positions for any deletions that shifted offsets
  for (const ins of insertions) {
    let shift = 0
    for (const del of deletions) {
      if (del.start < ins.position) {
        shift += del.end - del.start
      }
    }
    ins.position -= shift
  }

  // Apply insertions in reverse position order
  insertions.sort((a, b) => b.position - a.position)
  for (const { position, text } of insertions) {
    code = code.slice(0, position) + text + code.slice(position)
  }

  // Add __tjs reference for monadic error handling and structural equality
  // Use createRuntime() for isolated state per-module
  const needsTypeError = code.includes('__tjs.typeError(')
  const needsStack = code.includes('__tjs.pushStack(')
  const needsIs = code.includes('Is(')
  const needsIsNot = code.includes('IsNot(')
  const needsSafeEval = preprocessed.tjsModes.tjsSafeEval

  if (needsTypeError || needsStack || needsIs || needsIsNot || needsSafeEval) {
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
    testResults = runAllTests(
      tests,
      mocks,
      sigTestInfos,
      code,
      resolvedImports,
      preprocessed.extensions
    )

    // Check for failures and throw only if runTests === true (strict mode)
    // 'only' and 'report' modes return results without throwing
    const failures = testResults.filter((r) => !r.passed)
    if (failures.length > 0 && runTests === true) {
      const errorLines = failures.map((f) => {
        if (f.isSignatureTest) {
          return `  Function signature example is inconsistent:\n    ${f.error}`
        }
        const loc = f.line ? ` (line ${f.line})` : ''
        return `  Test '${f.description}'${loc} failed:\n    ${f.error}`
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
  /** Default values for optional return type keys */
  returnDefaults?: Record<string, unknown>
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
    if (debugOpts.returnDefaults) {
      metadata.returns.defaults = debugOpts.returnDefaults
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
 *     return __tjs.typeError('funcName.input', 'object', input)
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
  return __tjs.typeError('${path}', 'object', ${paramName})
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
    case 'integer':
      return `(typeof ${fieldPath} !== 'number' || !Number.isInteger(${fieldPath}))`
    case 'non-negative-integer':
      return `(typeof ${fieldPath} !== 'number' || !Number.isInteger(${fieldPath}) || ${fieldPath} < 0)`
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
    case 'union': {
      const checks = (type as any).members
        .map((m: TypeDescriptor) => generateTypeCheckExpr(fieldPath, m))
        .filter((c: string | null) => c !== null)
      if (checks.length === 0) return null
      return `(${checks.join(' && ')})`
    }
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
 *       return __tjs.typeError('funcName.input', 'object', __input)
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
  const lines: string[] = []

  for (const [paramName, param] of params) {
    const typeCheck = generateTypeCheck(paramName, param.type)
    if (typeCheck) {
      const path = `${funcName}.${paramName}`
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

  if (lines.length === 0) return null

  return lines.join('\n  ')
}

// =============================================================================
// Transpile-time Test Execution
// =============================================================================

/**
 * Fuzzy comparison for floating point numbers
 */
