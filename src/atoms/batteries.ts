import { s } from 'tosijs-schema'
import { defineAtom, resolveValue } from '../runtime'

// --- Interfaces ---

interface VectorBattery {
  embed(text: string): Promise<number[]>
}

interface StoreBattery {
  createCollection(
    name: string,
    schema?: any,
    dimension?: number
  ): Promise<void>
  vectorAdd(collection: string, doc: any): Promise<void>
  vectorSearch(
    collection: string,
    vector: number[],
    k?: number,
    filter?: any
  ): Promise<any[]>
}

interface LLMBattery {
  predict(
    system: string,
    user: string,
    tools?: any[],
    responseFormat?: any
  ): Promise<any>
}

// --- Atoms ---

// store.vectorize
export const storeVectorize = defineAtom(
  'storeVectorize',
  s.object({
    text: s.string,
    model: s.string.optional,
  }),
  s.array(s.number),
  async ({ text }, ctx) => {
    const vectorCap = ctx.capabilities.vector as VectorBattery
    if (!vectorCap)
      throw new Error(
        "Capability 'vector' missing. Ensure vector battery is loaded."
      )

    const resolvedText = resolveValue(text, ctx)
    return vectorCap.embed(resolvedText)
  },
  { docs: 'Generate embeddings using vector battery', cost: 20 }
)

// store.createCollection
export const storeCreateCollection = defineAtom(
  'storeCreateCollection',
  s.object({
    collection: s.string,
    dimension: s.number.optional,
  }),
  undefined,
  async ({ collection, dimension }, ctx) => {
    const storeCap = ctx.capabilities.store as unknown as StoreBattery
    if (!storeCap?.createCollection)
      throw new Error(
        "Capability 'store' missing or does not support createCollection."
      )

    const resolvedColl = resolveValue(collection, ctx)
    const resolvedDim = resolveValue(dimension, ctx)

    return storeCap.createCollection(resolvedColl, undefined, resolvedDim)
  },
  { docs: 'Create a vector store collection', cost: 5 }
)

// store.vectorAdd
export const storeVectorAdd = defineAtom(
  'storeVectorAdd',
  s.object({
    collection: s.string,
    doc: s.any,
  }),
  undefined,
  async ({ collection, doc }, ctx) => {
    const storeCap = ctx.capabilities.store as unknown as StoreBattery
    if (!storeCap?.vectorAdd)
      throw new Error(
        "Capability 'store' missing or does not support vectorAdd."
      )

    const resolvedColl = resolveValue(collection, ctx)
    const resolvedDoc = resolveValue(doc, ctx)

    return storeCap.vectorAdd(resolvedColl, resolvedDoc)
  },
  { docs: 'Add a document to a vector store collection', cost: 5 }
)

// store.search (Vector Search)
export const storeSearch = defineAtom(
  'storeSearch',
  s.object({
    collection: s.string,
    queryVector: s.array(s.number),
    k: s.number.optional,
    filter: s.record(s.any).optional,
  }),
  s.array(s.any),
  async ({ collection, queryVector, k, filter }, ctx) => {
    const storeCap = ctx.capabilities.store as unknown as StoreBattery
    if (!storeCap?.vectorSearch)
      throw new Error(
        "Capability 'store' missing or does not support vectorSearch."
      )

    const resolvedColl = resolveValue(collection, ctx)
    const resolvedVec = resolveValue(queryVector, ctx)
    const resolvedK = resolveValue(k, ctx) ?? 5
    const resolvedFilter = resolveValue(filter, ctx)

    return storeCap.vectorSearch(
      resolvedColl,
      resolvedVec,
      resolvedK,
      resolvedFilter
    )
  },
  {
    docs: 'Search vector store',
    cost: (input, ctx) => 5 + (resolveValue(input.k, ctx) ?? 5),
  }
)

// llm.predict (Enhanced with system prompt support for battery)
export const llmPredictBattery = defineAtom(
  'llmPredictBattery',
  s.object({
    system: s.string.optional,
    user: s.string,
    tools: s.array(s.any).optional,
    responseFormat: s.any.optional,
  }),
  s.object({
    content: s.string.optional,
    tool_calls: s.array(s.any).optional,
  }),
  async ({ system, user, tools, responseFormat }, ctx) => {
    const llmCap = ctx.capabilities.llmBattery as unknown as LLMBattery
    if (!llmCap?.predict)
      throw new Error("Capability 'llmBattery' missing or invalid.")

    const resolvedSystem =
      resolveValue(system, ctx) ?? 'You are a helpful agent.'
    const resolvedUser = resolveValue(user, ctx)
    const resolvedTools = resolveValue(tools, ctx)
    const resolvedFormat = resolveValue(responseFormat, ctx)

    return llmCap.predict(
      resolvedSystem,
      resolvedUser,
      resolvedTools,
      resolvedFormat
    )
  },
  { docs: 'Generate completion using LLM battery', cost: 100 }
)
