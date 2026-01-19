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
