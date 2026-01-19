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
  /** Generated test runner code (if tests were present) */
  testRunner?: string
  /** Number of tests extracted */
  testCount?: number
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
}

/**
 * Transpile TJS source to JavaScript
 */
export function transpileToJS(
  source: string,
  options: TJSTranspileOptions = {}
): TJSTranspileResult {
  const { filename = '<source>' } = options
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
    }
    // TODO: handle destructuring patterns
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

  return {
    code,
    types,
    metadata: types, // alias for runtime compatibility
    warnings: warnings.length > 0 ? warnings : undefined,
    testRunner: tests.length > 0 ? testRunner : undefined,
    testCount: tests.length > 0 ? tests.length : undefined,
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
 * Check if this is a single-arg function with object type (the happy path)
 *
 * Single-arg object types like:
 *   function foo(input: { x: 0, y: 0, name: 'default' }) { ... }
 *
 * Can be validated with fast inline checks instead of schema interpretation.
 */
function isSingleArgObjectType(types: TJSTypeInfo): boolean {
  const params = Object.entries(types.params)
  if (params.length !== 1) return false

  const [, param] = params[0]
  return param.type.kind === 'object' && param.type.shape !== undefined
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
 * For single-arg object types, this generates:
 *
 *   const _original_funcName = funcName
 *   funcName = function(input) {
 *     if (!globalThis.__tjs?.isUnsafeMode?.()) {
 *       if (typeof input !== 'object' || input === null || ...) {
 *         return { $error: true, message: '...', path: '...' }
 *       }
 *     }
 *     return _original_funcName.call(this, input)
 *   }
 *   funcName.__tjs = ...
 */
export function generateInlineWrapper(
  funcName: string,
  types: TJSTypeInfo,
  safety: SafetyOptions = {}
): string | null {
  // Only for single-arg object types
  if (!isSingleArgObjectType(types)) return null

  // Unsafe functions don't need wrappers
  if (safety.unsafe) return null

  const params = Object.entries(types.params)
  const [paramName, param] = params[0]
  const shape = param.type.shape!

  // Determine which fields are required
  const requiredFields = new Set<string>()
  for (const [fieldName] of Object.entries(shape)) {
    // For now, all fields in the shape are required
    // TODO: handle optional fields with ? syntax
    requiredFields.add(fieldName)
  }

  const validation = generateInlineValidation(
    funcName,
    paramName,
    shape,
    requiredFields
  )
  if (!validation) return null

  // Generate the wrapper
  // Note: We check isUnsafeMode() to respect unsafe {} blocks
  return `
const _original_${funcName} = ${funcName}
${funcName} = function(${paramName}) {
  if (!globalThis.__tjs?.isUnsafeMode?.()) {
    ${validation}
  }
  return _original_${funcName}.call(this, ${paramName})
}
`.trim()
}
