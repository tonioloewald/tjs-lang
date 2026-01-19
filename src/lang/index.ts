/**
 * AsyncJS Transpiler
 *
 * Transforms AsyncJS ("Better JavaScript") into tosijs-agent AST.
 *
 * @example
 * ```typescript
 * import { ajs, transpile } from 'tosijs-agent'
 *
 * // Simple function
 * const ast = ajs(`
 *   function greet({ name }) {
 *     let msg = template({ tmpl: 'Hello {{name}}', vars: { name } })
 *     return { msg }
 *   }
 * `)
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
import { transformFunction } from './emitters/ast'

export * from './types'
export { parse, preprocess } from './parser'
export { transformFunction } from './emitters/ast'
export {
  transpileToJS,
  type TJSTranspileOptions,
  type TJSTranspileResult,
  type TJSTypeInfo,
} from './emitters/js'
export {
  fromTS,
  type FromTSOptions,
  type FromTSResult,
} from './emitters/from-ts'
export * from './inference'
export { Schema } from './schema'
export {
  lint,
  type LintResult,
  type LintDiagnostic,
  type LintOptions,
} from './linter'
export {
  extractTests,
  assertFunction,
  expectFunction,
  testUtils,
  type ExtractedTest,
  type ExtractedMock,
  type TestExtractionResult,
} from './tests'
export {
  runtime,
  installRuntime,
  isError,
  error,
  typeOf,
  checkType,
  validateArgs,
  wrap,
  emitRuntimeWrapper,
  TJS_VERSION,
  type TJSError,
} from './runtime'
export {
  compileToWasm,
  instantiateWasm,
  registerWasmBlock,
  compileWasmBlocks,
  type WasmCompileResult,
} from './wasm'
export type { WasmBlock } from './parser'
export {
  MetadataCache,
  getGlobalCache,
  setGlobalCache,
  hashSource,
  hashSourceSync,
  type CacheEntry,
  type CachedTranspileResult,
  type CachedTJSResult,
  type CacheStats,
} from './metadata-cache'

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
 * Transpile AsyncJS source and return just the AST.
 * Works as both a function and a tagged template literal.
 *
 * @example
 * ```typescript
 * // As a function
 * const ast = ajs(`
 *   function agent({ topic }) {
 *     let results = search({ query: topic })
 *     return { results }
 *   }
 * `)
 *
 * // As a tagged template literal
 * const ast2 = ajs`
 *   function greet({ name }) {
 *     let msg = template({ tmpl: 'Hello {{name}}', vars: { name } })
 *     return { msg }
 *   }
 * `
 * ```
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
  // Tagged template literal
  const source = sourceOrStrings.reduce(
    (acc, str, i) =>
      acc + str + (values[i] !== undefined ? String(values[i]) : ''),
    ''
  )
  return transpile(source).ast
}

/**
 * Transpile TJS source to JavaScript with type metadata.
 * Works as both a function and a tagged template literal.
 *
 * @example
 * ```typescript
 * // As a function
 * const result = tjs(`
 *   function greet(name: 'world') -> '' {
 *     return \`Hello, \${name}!\`
 *   }
 * `)
 * console.log(result.code)
 * // function greet(name = 'world') { return \`Hello, \${name}!\` }
 * // greet.__tjs = { params: { name: { type: 'string', required: true } }, returns: { type: 'string' } }
 *
 * // As a tagged template literal
 * const result2 = tjs`
 *   function add(a: 0, b: 0) -> 0 {
 *     return a + b
 *   }
 * `
 * ```
 */
import {
  transpileToJS,
  type TJSTranspileResult,
  type TJSTranspileOptions,
} from './emitters/js'

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

// ============================================================================
// Cached transpilation functions
// ============================================================================

import {
  MetadataCache,
  getGlobalCache,
  type CachedTranspileResult,
  type CachedTJSResult,
} from './metadata-cache'

/**
 * Transpile with caching support
 *
 * Uses IndexedDB to cache transpilation results. On cache hit,
 * returns immediately without re-parsing. Particularly useful for
 * playground editors and development workflows.
 *
 * @example
 * ```typescript
 * const cache = new MetadataCache()
 * await cache.open()
 *
 * // First call: parses and caches
 * const result1 = await transpileWithCache(source, {}, cache)
 *
 * // Second call: returns from cache
 * const result2 = await transpileWithCache(source, {}, cache)
 * ```
 */
export async function transpileWithCache(
  source: string,
  options: TranspileOptions = {},
  cache?: MetadataCache
): Promise<TranspileResult> {
  const effectiveCache = cache ?? (await getGlobalCache())

  // Try cache first
  const cached = await effectiveCache.getTranspile(source)
  if (cached) {
    return {
      ast: cached.ast,
      signature: cached.signature,
      warnings: cached.warnings,
    }
  }

  // Cache miss - transpile
  const result = transpile(source, options)

  // Store in cache (don't await - fire and forget)
  effectiveCache.setTranspile(source, {
    ast: result.ast,
    signature: result.signature,
    warnings: result.warnings,
  })

  return result
}

/**
 * Transpile TJS to JavaScript with caching support
 *
 * @example
 * ```typescript
 * const cache = new MetadataCache()
 * await cache.open()
 *
 * // First call: transpiles and caches
 * const result1 = await tjsWithCache(source, {}, cache)
 *
 * // Second call: returns from cache
 * const result2 = await tjsWithCache(source, {}, cache)
 * ```
 */
export async function tjsWithCache(
  source: string,
  options: import('./emitters/js').TJSTranspileOptions = {},
  cache?: MetadataCache
): Promise<import('./emitters/js').TJSTranspileResult> {
  const effectiveCache = cache ?? (await getGlobalCache())

  // Try cache first
  const cached = await effectiveCache.getTJS(source)
  if (cached) {
    return {
      code: cached.code,
      types: cached.types,
      metadata: cached.types, // alias
      testRunner: cached.testRunner,
      testCount: cached.testCount,
      warnings: cached.warnings,
    }
  }

  // Cache miss - transpile
  const result = transpileToJS(source, options)

  // Store in cache (don't await - fire and forget)
  effectiveCache.setTJS(source, {
    code: result.code,
    types: result.types,
    testRunner: result.testRunner,
    testCount: result.testCount,
    warnings: result.warnings,
  })

  return result
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
