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
  const typeMetadata = generateTypeMetadata(funcName, types, isUnsafe)

  const code = `${preprocessed.source}\n\n${typeMetadata}`

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
 * Generate type metadata code
 *
 * @param funcName - Function name
 * @param types - Type information
 * @param isUnsafe - If true, function was marked with (!) and should NOT be wrapped
 */
function generateTypeMetadata(
  funcName: string,
  types: TJSTypeInfo,
  isUnsafe: boolean
): string {
  const paramsObj: Record<string, any> = {}

  for (const [name, param] of Object.entries(types.params)) {
    paramsObj[name] = {
      type: param.type.kind,
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
    metadata.returns = { type: types.returns.kind }
  }

  if (types.description) {
    metadata.description = types.description
  }

  // Mark unsafe functions - they skip runtime validation wrapping
  if (isUnsafe) {
    metadata.unsafe = true
  }

  return `${funcName}.__tjs = ${JSON.stringify(metadata, null, 2)}`
}
