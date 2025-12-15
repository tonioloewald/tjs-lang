import { s } from 'tosijs-schema'
import { defineAtom, resolveValue } from '../runtime'

// --- Interfaces ---

interface VectorBattery {
  embed(text: string): Promise<number[]>
}

interface StoreBattery {
  vectorSearch(
    collection: string,
    vector: number[],
    k?: number,
    filter?: any
  ): Promise<any[]>
}

interface LLMBattery {
  predict(system: string, user: string, tools?: any[]): Promise<any>
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
  }),
  s.object({
    content: s.string.optional,
    tool_calls: s.array(s.any).optional,
  }),
  async ({ system, user, tools }, ctx) => {
    const llmCap = ctx.capabilities.llm as unknown as LLMBattery
    if (!llmCap?.predict)
      throw new Error("Capability 'llm' missing or invalid.")

    const resolvedSystem = resolveValue(system, ctx) ?? 'You are a helpful agent.'
    const resolvedUser = resolveValue(user, ctx)
    const resolvedTools = resolveValue(tools, ctx)

    return llmCap.predict(resolvedSystem, resolvedUser, resolvedTools)
  },
  { docs: 'Generate completion using LLM battery', cost: 100 }
)