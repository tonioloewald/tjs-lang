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
 */

import type { FunctionDeclaration, Program } from 'acorn'
import { parseExpressionAt } from 'acorn'
import { parse, extractJSDoc, preprocess } from '../parser'
import type { TypeDescriptor, ParameterDescriptor } from '../types'
import { inferTypeFromValue, parseParameter } from '../inference'
import { extractTests } from '../tests'

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
   */
  runTests?: boolean | 'only'
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
}

export interface TJSTranspileResult {
  /** The transpiled JavaScript code */
  code: string
  /** Type information for the function(s) */
  types: TJSTypeInfo
  /** Function metadata (alias for types, used by runtime) */
  metadata: TJSTypeInfo
  /** Any warnings during transpilation */
  warnings?: string[]
  /** Generated test runner code (if tests were present) - DEPRECATED, tests now run at transpile time */
  testRunner?: string
  /** Number of tests extracted */
  testCount?: number
  /** Test results (when runTests is true or 'only') */
  testResults?: TestResult[]
}

export interface TJSTypeInfo {
  /** Function name */
  name: string
  /** Parameter types */
  params: Record<string, ParameterDescriptor>
  /** Return type */
  returns?: TypeDescriptor
  /** JSDoc description */
  description?: string
  /** True if function uses destructured object param (the fast path) */
  isDestructuredParam?: boolean
  /** The shape of the destructured param (for inline validation) */
  destructuredShape?: Record<string, TypeDescriptor>
  /** Which fields in destructuredShape are required */
  destructuredRequired?: Set<string>
}

/**
 * Transpile TJS source to JavaScript
 */
export function transpileToJS(
  source: string,
  options: TJSTranspileOptions = {}
): TJSTranspileResult {
  const { filename = '<source>', runTests = true } = options
  const warnings: string[] = []

  // Extract test/mock blocks before parsing (they're not valid JS)
  const { code: cleanSource, tests, mocks, testRunner } = extractTests(source)

  // Parse the cleaned source (handles TJS syntax like x: 'type' and -> ReturnType)
  const {
    ast: program,
    returnType,
    originalSource,
    requiredParams,
    unsafeFunctions,
  } = parse(cleanSource, {
    filename,
    colonShorthand: true,
  })

  // For now, handle single function (can extend to modules later)
  const func = findMainFunction(program)
  if (!func) {
    throw new Error('No function declaration found')
  }

  // Extract JSDoc
  const jsdoc = extractJSDoc(originalSource, func)

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
          description: jsdoc.params[key],
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
          description: jsdoc.params[param.name],
        }
      } else if (
        param.type === 'AssignmentPattern' &&
        param.left.type === 'Identifier'
      ) {
        const paramInfo = parseParameter(param, requiredParams)
        params[param.left.name] = {
          ...paramInfo,
          required: requiredParams.has(param.left.name),
          description: jsdoc.params[param.left.name],
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
              description: jsdoc.params[key],
            }
          }
        }
      }
    }
  }

  // Parse return type if present
  let returns: TypeDescriptor | undefined
  if (returnType) {
    try {
      const returnExpr = parseExpressionAt(returnType, 0, { ecmaVersion: 2022 })
      returns = inferTypeFromValue(returnExpr as any)
    } catch {
      // If we can't parse the return type, just store it as-is
      returns = { kind: 'any' }
      warnings.push(`Could not parse return type: ${returnType}`)
    }
  }

  // Build type info object
  const types: TJSTypeInfo = {
    name: func.id?.name || 'anonymous',
    params,
    returns,
    description: jsdoc.description,
    isDestructuredParam,
    destructuredShape,
    destructuredRequired,
  }

  // Generate the JavaScript code
  // Use the parser's preprocess which handles all TJS syntax transformations
  // including: `x: 'type'` -> `x = 'type'`, `-> Type` removal, and `unsafe { }` blocks
  const preprocessed = preprocess(cleanSource)

  // Add type metadata
  const funcName = func.id?.name || 'anonymous'
  const isUnsafe = unsafeFunctions.has(funcName)
  const isSafe = preprocessed.safeFunctions.has(funcName)
  const returnSafety = preprocessed.returnSafety
  const safetyOptions = {
    unsafe: isUnsafe,
    safe: isSafe,
    returnSafety,
  }
  const typeMetadata = generateTypeMetadata(funcName, types, safetyOptions)

  // For single-arg object types, generate inline validation (20x faster)
  // Otherwise, the runtime wrap() will be used
  const inlineWrapper = generateInlineWrapper(funcName, types, safetyOptions)

  const code = inlineWrapper
    ? `${preprocessed.source}\n\n${inlineWrapper}\n${typeMetadata}`
    : `${preprocessed.source}\n\n${typeMetadata}`

  // Run tests at transpile time if enabled
  let testResults: TestResult[] | undefined

  if (runTests && (tests.length > 0 || returnType)) {
    testResults = []

    // Run explicit test blocks
    if (tests.length > 0) {
      const blockResults = runTestBlocks(tests, mocks, preprocessed.source)
      testResults.push(...blockResults)
    }

    // Run implicit signature test if function has ->! (assertion) return type
    // ->! means "assert this is what you get with these example inputs"
    // -> alone is just a type annotation, no test
    if (returnType && func && returnSafety === 'unsafe') {
      // returnSafety === 'unsafe' means ->! was used (the ! marker)
      const sigExample = extractSignatureExample(func, types, returnType)
      if (sigExample) {
        const sigResult = runSignatureTest(
          funcName,
          preprocessed.source,
          sigExample.args,
          sigExample.expected
        )
        testResults.push(sigResult)
      }
    }

    // Check for failures and throw if runTests is true (not 'only')
    const failures = testResults.filter((r) => !r.passed)
    if (failures.length > 0 && runTests !== 'only') {
      const errorLines = failures.map((f) => {
        if (f.isSignatureTest) {
          return `  Function '${funcName}' signature example is inconsistent:\n    ${f.error}`
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
      types,
      metadata: types,
      testResults,
      testCount: testResults?.length,
    }
  }

  return {
    code,
    types,
    metadata: types, // alias for runtime compatibility
    warnings: warnings.length > 0 ? warnings : undefined,
    testRunner: tests.length > 0 ? testRunner : undefined,
    testCount: tests.length > 0 ? tests.length : undefined,
    testResults,
  }
}

/**
 * Find the main function in the AST
 */
function findMainFunction(program: Program): FunctionDeclaration | null {
  for (const node of program.body) {
    if (node.type === 'FunctionDeclaration') {
      return node
    }
  }
  return null
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
 * Generate type metadata code
 *
 * @param funcName - Function name
 * @param types - Type information
 * @param safety - Safety flags for the function
 */
function generateTypeMetadata(
  funcName: string,
  types: TJSTypeInfo,
  safety: SafetyOptions = {}
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
function generateTypeCheck(
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
 * Format a value for error messages
 */
function formatValue(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

import type { ExtractedTest, ExtractedMock } from '../tests'

/**
 * Run extracted test blocks at transpile time
 */
function runTestBlocks(
  tests: ExtractedTest[],
  mocks: ExtractedMock[],
  transpiledCode: string
): TestResult[] {
  const results: TestResult[] = []

  // Build execution context with the transpiled function
  const mockSetup = mocks.map((m) => m.body).join('\n')

  for (const test of tests) {
    try {
      // Create a function that runs the test
      const testCode = `
        ${transpiledCode}
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
            }
          }
        }

        // Run the test body
        ${test.body}
      `

      // Execute the test
      const fn = new Function('__deepEqual', '__format', testCode)
      fn(deepEqual, formatValue)

      results.push({
        description: test.description,
        passed: true,
      })
    } catch (e: any) {
      results.push({
        description: test.description,
        passed: false,
        error: e.message || String(e),
      })
    }
  }

  return results
}

/**
 * Extract signature example values from function parameters
 * Returns null if not all params have examples or no return type
 */
function extractSignatureExample(
  func: FunctionDeclaration,
  types: TJSTypeInfo,
  returnTypeStr: string
): { args: unknown[]; expected: unknown } | null {
  // Need a return type with an example value
  if (!types.returns || !returnTypeStr) return null

  // Get example values from params - they should be the default values
  const args: unknown[] = []

  for (const param of func.params) {
    let defaultValue: unknown = undefined

    if (param.type === 'AssignmentPattern') {
      // Has default value - extract it
      const right = param.right as any
      if (right.type === 'Literal') {
        defaultValue = right.value
      } else if (right.type === 'ObjectExpression') {
        // Handle object examples by evaluating the expression
        try {
          defaultValue = evalObjectExpression(right)
        } catch {
          return null
        }
      } else if (right.type === 'ArrayExpression') {
        // Handle array examples
        try {
          defaultValue = evalArrayExpression(right)
        } catch {
          return null
        }
      }
    } else {
      // No default value - can't run signature test
      return null
    }

    if (defaultValue === undefined) return null
    args.push(defaultValue)
  }

  // Parse the expected return value from the return type string
  // The return type is a TJS example like: 14.5, 'hello', { name: '' }, etc.
  let expected: unknown
  try {
    // Use Function constructor to safely evaluate the literal
    expected = new Function(`return ${returnTypeStr}`)()
  } catch {
    // Can't parse the return type as a value
    return null
  }

  return { args, expected }
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
 * Run signature example test
 */
function runSignatureTest(
  funcName: string,
  transpiledCode: string,
  args: unknown[],
  expected: unknown
): TestResult {
  const description = `${funcName} signature example`

  try {
    // Execute the function with example args
    const testCode = `
      ${transpiledCode}
      return ${funcName}(${args.map((a) => JSON.stringify(a)).join(', ')})
    `
    const fn = new Function(testCode)
    const actual = fn()

    if (!deepEqual(actual, expected)) {
      return {
        description,
        passed: false,
        error: `Expected ${formatValue(expected)} but got ${formatValue(
          actual
        )}`,
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
