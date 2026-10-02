import { s } from 'tosijs-schema'
import { defineAtom, resolveValue, admitGuestSchema } from '../runtime'

/**
 * A response format's JSON Schema is GUEST data handed to a model server, whose grammar compiler
 * (llama.cpp, outlines) turns a `pattern` into an automaton outside every budget, and a host may
 * validate the reply against the same schema. So it is admitted like any guest schema (rc.2
 * thirteenth re-review). The OpenAI wrapper (`{ type: 'json_schema', json_schema: { schema } }`,
 * what `Schema.response` builds) is not itself a schema; what it carries is.
 */
function admitResponseFormat(format: any, op: string): any {
  const schema = format?.json_schema?.schema
  if (schema !== undefined) admitGuestSchema(schema, op)
  return format
}

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
    user: string | any[], // string for single-turn, message array for multi-turn
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
  // Network embedding call; a cold model can exceed the 1s atom default.
  {
    docs: 'Generate embeddings using vector battery',
    cost: 20,
    timeoutMs: 60000,
  }
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
  // May embed the doc via the store (network IO); allow for a cold model.
  {
    docs: 'Add a document to a vector store collection',
    cost: 5,
    timeoutMs: 60000,
  }
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

/**
 * An OpenAI-compatible chat message, as the LLM batteries return it: `{ role?, content?,
 * tool_calls? }` plus whatever else a provider sends (`reasoning_content`, `refusal`, …). OPEN,
 * because this is a protocol we do not control (tosijs-schema#5, adopted with ^1.12.0).
 */
const CHAT_MESSAGE = s.object({
  role: s.string.optional,
  content: s.any.optional,
  tool_calls: s.array(s.any).optional,
}).open

export const llmPredictBattery = defineAtom(
  'llmPredictBattery',
  s.object({
    system: s.string.optional,
    user: s.union([s.string, s.array(s.any)]), // string or message array for multi-turn
    tools: s.array(s.any).optional,
    responseFormat: s.any.optional,
  }),
  // An OpenAI-compatible chat message is an OPEN shape, and this is a protocol we do not
  // control: providers add `reasoning_content`, `refusal`, `annotations`, `audio`, and
  // more, at their own pace. `s.object()` always emits `additionalProperties: false`, so
  // pinning the fields here asserted a closed set that upstream never promised.
  //
  // It only surfaced when tosijs-schema 1.5.0 began enforcing `additionalProperties`
  // correctly — the schema had been silently open, so the mistake cost nothing until the
  // validator got it right. gemma-4 returns `reasoning_content`, and every vision call
  // started failing output validation.
  //
  // A runtime schema should reject what is WRONG, not what is merely newer than we are. Until
  // tosijs-schema 1.7 the only open spelling was `s.record(s.any)`, which dropped the field
  // list; `.open` (tosijs-schema#5) keeps the named fields AND admits the ones providers add.
  CHAT_MESSAGE,
  async ({ system, user, tools, responseFormat }, ctx) => {
    const llmCap = ctx.capabilities.llmBattery as unknown as LLMBattery
    if (!llmCap?.predict)
      throw new Error("Capability 'llmBattery' missing or invalid.")

    const resolvedSystem =
      resolveValue(system, ctx) ?? 'You are a helpful agent.'
    const resolvedUser = resolveValue(user, ctx)
    const resolvedTools = resolveValue(tools, ctx)
    const resolvedFormat = admitResponseFormat(
      resolveValue(responseFormat, ctx),
      'llmPredictBattery'
    )

    return llmCap.predict(
      resolvedSystem,
      resolvedUser,
      resolvedTools,
      resolvedFormat
    )
  },
  {
    docs: 'Generate completion using LLM battery',
    cost: 100,
    timeoutMs: 120000,
  }
)

// Vision battery interface (multimodal)
interface VisionBattery {
  predict(
    system: string,
    user: { text: string; images?: string[] },
    tools?: any[],
    responseFormat?: any
  ): Promise<any>
}

// llm.vision - Analyze images using a vision-capable model
export const llmVision = defineAtom(
  'llmVision',
  s.object({
    system: s.string.optional,
    prompt: s.string,
    images: s.array(s.string), // URLs or data URIs (data:image/...;base64,...)
    responseFormat: s.any.optional,
  }),
  // An OpenAI-compatible chat message is an OPEN shape, and this is a protocol we do not
  // control: providers add `reasoning_content`, `refusal`, `annotations`, `audio`, and
  // more, at their own pace. `s.object()` always emits `additionalProperties: false`, so
  // pinning the fields here asserted a closed set that upstream never promised.
  //
  // It only surfaced when tosijs-schema 1.5.0 began enforcing `additionalProperties`
  // correctly — the schema had been silently open, so the mistake cost nothing until the
  // validator got it right. gemma-4 returns `reasoning_content`, and every vision call
  // started failing output validation.
  //
  // A runtime schema should reject what is WRONG, not what is merely newer than we are. Until
  // tosijs-schema 1.7 the only open spelling was `s.record(s.any)`, which dropped the field
  // list; `.open` (tosijs-schema#5) keeps the named fields AND admits the ones providers add.
  CHAT_MESSAGE,
  async ({ system, prompt, images, responseFormat }, ctx) => {
    const llmCap = ctx.capabilities.llmBattery as unknown as VisionBattery
    if (!llmCap?.predict)
      throw new Error("Capability 'llmBattery' missing or invalid.")

    const resolvedSystem =
      resolveValue(system, ctx) ??
      'You analyze images accurately and concisely.'
    const resolvedPrompt = resolveValue(prompt, ctx)
    const resolvedImages = resolveValue(images, ctx) ?? []
    const resolvedFormat = admitResponseFormat(
      resolveValue(responseFormat, ctx),
      'llmVision'
    )

    return llmCap.predict(
      resolvedSystem,
      { text: resolvedPrompt, images: resolvedImages },
      undefined,
      resolvedFormat
    )
  },
  { docs: 'Analyze images using a vision model', timeoutMs: 120000, cost: 150 }
)

// Every battery atom is IO (embedding/LLM/vector-store network calls).
for (const atom of [
  storeVectorize,
  storeCreateCollection,
  storeVectorAdd,
  storeSearch,
  llmPredictBattery,
  llmVision,
]) {
  atom.effects = 'io'
}

// Every battery atom calls `resolveValue` on its own inputs, so the VM must not resolve them
// again (resolving twice can misread a resolved value). Set here, beside the definitions, so an
// atom imported straight from this module carries it too.
for (const atom of [
  storeVectorize,
  storeCreateCollection,
  storeVectorAdd,
  storeSearch,
  llmPredictBattery,
  llmVision,
])
  atom.resolveInputs = false
