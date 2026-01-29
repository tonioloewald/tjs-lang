/**
 * TJS Core - Essential transpiler functions without TypeScript dependency
 *
 * This module provides the core AJS transpilation functions.
 * Import from here (not ./index) to avoid pulling in the TS compiler.
 */

import type { SeqNode } from '../builder'
import type { TranspileOptions, TranspileResult, FunctionSignature } from './types'
import { parse, validateSingleFunction } from './parser'
import { transformFunction } from './emitters/ast'

export * from './types'
export { parse, preprocess, extractTDoc, validateSingleFunction } from './parser'
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
      properties[paramName] = param.schema || { type: 'any' }
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
