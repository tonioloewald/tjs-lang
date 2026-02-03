/**
 * TJS Core - Essential transpiler functions without TypeScript dependency
 *
 * This module provides the core AJS transpilation functions.
 * Import from here (not ./index) to avoid pulling in the TS compiler.
 */

import type { SeqNode } from '../builder'
import type {
  TranspileOptions,
  TranspileResult,
  FunctionSignature,
  TypeDescriptor,
} from './types'
import { parse, validateSingleFunction } from './parser'
import { transformFunction } from './emitters/ast'
import {
  transpileToJS,
  type TJSTranspileResult,
  type TJSTranspileOptions,
} from './emitters/js'

export * from './types'
export {
  parse,
  preprocess,
  extractTDoc,
  validateSingleFunction,
} from './parser'
export { transformFunction } from './emitters/ast'

/**
 * Transpile JavaScript source code to Agent99 AST
 */
export function transpile(
  source: string,
  options: TranspileOptions = {}
): TranspileResult {
  const {
    ast: program,
    returnType,
    originalSource,
    requiredParams,
  } = parse(source, {
    filename: options.filename,
    colonShorthand: true,
    vmTarget: true,
  })

  const func = validateSingleFunction(program, options.filename)

  const { ast, signature, warnings } = transformFunction(
    func,
    originalSource,
    returnType,
    options,
    requiredParams
  )

  return {
    ast: ast as SeqNode,
    signature,
    warnings,
  }
}

/**
 * Transpile AsyncJS source and return just the AST
 */
export function ajs(strings: TemplateStringsArray, ...values: any[]): SeqNode
export function ajs(source: string): SeqNode
export function ajs(
  sourceOrStrings: string | TemplateStringsArray,
  ...values: any[]
): SeqNode {
  if (typeof sourceOrStrings === 'string') {
    return transpile(sourceOrStrings).ast
  }
  const source = sourceOrStrings.reduce(
    (acc, str, i) =>
      acc + str + (values[i] !== undefined ? String(values[i]) : ''),
    ''
  )
  return transpile(source).ast
}

/**
 * Create a function with attached signature for introspection
 */
export function createAgent(
  source: string,
  vm: { run: (ast: any, args: any, options?: any) => Promise<any> },
  runOptions?: { fuel?: number; capabilities?: any }
): ((args: Record<string, any>) => Promise<any>) & {
  signature: FunctionSignature
  ast: SeqNode
} {
  const { ast, signature } = transpile(source)

  const agent = async (args: Record<string, any>) => {
    const result = await vm.run(ast, args, runOptions)
    return result.result
  }

  ;(agent as any).signature = signature
  ;(agent as any).ast = ast

  return agent as any
}

/**
 * Convert TypeDescriptor to JSON Schema
 */
function typeDescriptorToJsonSchema(type: TypeDescriptor): any {
  switch (type.kind) {
    case 'string':
      return { type: 'string' }
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'null':
      return { type: 'null' }
    case 'array':
      return {
        type: 'array',
        items: type.items ? typeDescriptorToJsonSchema(type.items) : {},
      }
    case 'object':
      if (!type.shape) {
        return { type: 'object' }
      }
      return {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(type.shape).map(([k, v]) => [
            k,
            typeDescriptorToJsonSchema(v),
          ])
        ),
      }
    case 'union':
      if (!type.members) {
        return {}
      }
      return {
        anyOf: type.members.map(typeDescriptorToJsonSchema),
      }
    case 'any':
    default:
      return {}
  }
}

/**
 * Get tool definitions from a set of agent functions
 */
export function getToolDefinitions(
  agents: Record<string, { signature: FunctionSignature }>
): Array<{
  type: 'function'
  function: {
    name: string
    description?: string
    parameters: {
      type: 'object'
      properties: Record<string, any>
      required: string[]
    }
  }
}> {
  return Object.entries(agents).map(([name, agent]) => {
    const sig = agent.signature

    const properties: Record<string, any> = {}
    const required: string[] = []

    for (const [paramName, param] of Object.entries(sig.parameters)) {
      properties[paramName] = typeDescriptorToJsonSchema(param.type)
      if (param.description) {
        properties[paramName].description = param.description
      }
      if (param.required) {
        required.push(paramName)
      }
    }

    return {
      type: 'function' as const,
      function: {
        name,
        description: sig.description,
        parameters: {
          type: 'object' as const,
          properties,
          required,
        },
      },
    }
  })
}

/**
 * Transpile TJS source to JavaScript with type metadata.
 * Works as both a function and a tagged template literal.
 */
export function tjs(
  strings: TemplateStringsArray,
  ...values: any[]
): TJSTranspileResult
export function tjs(
  source: string,
  options?: TJSTranspileOptions
): TJSTranspileResult
export function tjs(
  sourceOrStrings: string | TemplateStringsArray,
  optionsOrFirstValue?: TJSTranspileOptions | any,
  ...restValues: any[]
): TJSTranspileResult {
  if (typeof sourceOrStrings === 'string') {
    return transpileToJS(
      sourceOrStrings,
      optionsOrFirstValue as TJSTranspileOptions
    )
  }
  // Tagged template literal
  const values =
    optionsOrFirstValue !== undefined
      ? [optionsOrFirstValue, ...restValues]
      : restValues
  const source = sourceOrStrings.reduce(
    (acc, str, i) =>
      acc + str + (values[i] !== undefined ? String(values[i]) : ''),
    ''
  )
  return transpileToJS(source)
}
