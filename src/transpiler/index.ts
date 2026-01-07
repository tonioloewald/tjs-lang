/**
 * Agent99 JavaScript Transpiler
 *
 * Transforms "Better JavaScript" into Agent99 AST.
 *
 * @example
 * ```typescript
 * import { js, agent, transpile } from 'agent-99'
 *
 * // Simple function
 * const ast = js(`
 *   function greet({ name }) {
 *     let msg = template({ tmpl: 'Hello {{name}}', vars: { name } })
 *     return { msg }
 *   }
 * `)
 *
 * // Tagged template
 * const ast2 = agent`
 *   function add({ a, b }) {
 *     let sum = a + b
 *     return { sum }
 *   }
 * `
 *
 * // Execute
 * const vm = new AgentVM()
 * await vm.run(ast, { name: 'World' })
 * ```
 */

import type { SeqNode } from '../builder'
import type {
  TranspileOptions,
  TranspileResult,
  FunctionSignature,
} from './types'
import { parse, validateSingleFunction } from './parser'
import { transformFunction } from './transformer'

export * from './types'
export { parse, preprocess } from './parser'
export { transformFunction } from './transformer'
export * from './type-system/inference'

/**
 * Transpile JavaScript source code to Agent99 AST
 *
 * @param source - JavaScript source code containing a single function
 * @param options - Transpilation options
 * @returns The AST, signature, and any warnings
 *
 * @example
 * ```typescript
 * const result = transpile(`
 *   function search(query: 'string', limit = 10) {
 *     let results = storeSearch({ query, limit })
 *     return { results }
 *   }
 * `)
 *
 * console.log(result.signature)
 * // {
 * //   name: 'search',
 * //   parameters: {
 * //     query: { type: 'string', required: true },
 * //     limit: { type: 'number', required: false, default: 10 }
 * //   }
 * // }
 * ```
 */
export function transpile(
  source: string,
  options: TranspileOptions = {}
): TranspileResult {
  // Parse the source
  const {
    ast: program,
    returnType,
    originalSource,
    requiredParams,
  } = parse(source, {
    filename: options.filename,
    colonShorthand: true,
  })

  // Validate structure
  const func = validateSingleFunction(program, options.filename)

  // Transform to Agent99 AST
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
 * Convenience function: transpile and return just the AST
 *
 * @param source - JavaScript source code
 * @returns The Agent99 AST
 *
 * @example
 * ```typescript
 * const ast = js(`
 *   function agent({ topic }) {
 *     let results = search({ query: topic })
 *     return { results }
 *   }
 * `)
 * ```
 */
export function js(source: string): SeqNode {
  return transpile(source).ast
}

/**
 * Tagged template literal for inline transpilation
 *
 * @example
 * ```typescript
 * const ast = agent`
 *   function greet({ name }) {
 *     let msg = template({ tmpl: 'Hello {{name}}', vars: { name } })
 *     return { msg }
 *   }
 * `
 * ```
 */
export function agent(
  strings: TemplateStringsArray,
  ...values: any[]
): SeqNode {
  // Reconstruct source from template parts
  const source = strings.reduce(
    (acc, str, i) =>
      acc + str + (values[i] !== undefined ? String(values[i]) : ''),
    ''
  )
  return js(source)
}

/**
 * Create a function with attached signature for introspection
 *
 * This wraps the transpiled AST in a callable that includes
 * the .signature property for self-documentation.
 *
 * @example
 * ```typescript
 * const search = createAgent(`
 *   function search(query: 'string', limit = 10) {
 *     let results = storeSearch({ query, limit })
 *     return { results }
 *   }
 * `, vm)
 *
 * // Introspect
 * console.log(search.signature.parameters)
 *
 * // Execute
 * const result = await search({ query: 'hello' })
 * ```
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

  // Attach metadata
  ;(agent as any).signature = signature
  ;(agent as any).ast = ast

  return agent as any
}

/**
 * Get tool definitions from a set of agent functions
 *
 * This converts function signatures to OpenAI-compatible tool definitions.
 *
 * @example
 * ```typescript
 * const search = createAgent(searchSource, vm)
 * const summarize = createAgent(summarizeSource, vm)
 *
 * const tools = getToolDefinitions({ search, summarize })
 * // Ready to pass to LLM API
 * ```
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
        name: sig.name || name,
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
 * Convert TypeDescriptor to JSON Schema
 */
function typeDescriptorToJsonSchema(
  type: import('./types').TypeDescriptor
): any {
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
