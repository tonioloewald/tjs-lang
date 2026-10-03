import { s } from 'tosijs-schema'
import {
  defineAtom,
  resolveValue,
  admitResponseFormat,
  admitTools,
  storeOf,
  admitFetchUrl,
  policyList,
} from '../runtime'

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
    const storeCap = storeOf(ctx) as unknown as StoreBattery
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
    const storeCap = storeOf(ctx) as unknown as StoreBattery
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
    const storeCap = storeOf(ctx) as unknown as StoreBattery
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
    // what is forwarded is REBUILT from what was admitted
    const resolvedUser = admitLlmUser(resolveValue(user, ctx), ctx)
    const resolvedTools = admitTools(
      resolveValue(tools, ctx),
      'llmPredictBattery'
    )
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

/**
 * An image URL is a request the BACKEND may make on the agent's behalf (vLLM and mlx-vlm fetch
 * http(s) `image_url` server-side), so it gets the fetch rule. Inline data passes:
 * `data:image/…` or `data:application/octet-stream`, with parameters, base64, which is what
 * `httpFetch`'s `dataUrl` produces. http(s) passes only against the run's allowlist, and never
 * without one (rc.2 cumulative review M2). ONE helper for every atom that forwards images:
 * `llmPredictBattery` bypassed it with a `{ text, images }` user (cumulative review 2 M1).
 */
function admitImageUrls(images: unknown, ctx: any, op: string): string[] {
  // RETURNS what may be forwarded, and the caller forwards exactly that: an admitted http(s) image
  // is its normalised `href`, never the guest's string. Checking one string and forwarding another
  // let `http://a.test\\@169.254.169.254/` pass a WHATWG allowlist check and reach a Python backend
  // as a request to the metadata address (rc.2 cumulative review 3).
  if (!Array.isArray(images))
    throw new Error(`${op}: images must be an array of strings`)
  const admitted: string[] = []
  for (const img of images) {
    if (typeof img !== 'string')
      throw new Error(`${op}: images must be an array of strings`)
    if (img.toLowerCase().startsWith('data:')) {
      // parsed by splitting, not a regex: `data:<type>[;params];base64,` (no nested quantifier for
      // our own ReDoS guardrail to flag). Inline data names no host; it is forwarded as given.
      const comma = img.indexOf(',')
      const params = (comma < 0 ? '' : img.slice(5, comma)).split(';')
      const type = params[0].trim().toLowerCase()
      if (
        params[params.length - 1].trim().toLowerCase() === 'base64' &&
        (type === 'application/octet-stream' ||
          /^image\/[a-z0-9.+-]+$/.test(type))
      ) {
        admitted.push(img)
        continue
      }
      throw new Error(
        `${op}: an inline image must be base64 image data (data:image/...;base64,...)`
      )
    }
    try {
      admitted.push(
        admitFetchUrl(
          img,
          policyList(ctx.context?.allowedFetchDomains, 'allowedFetchDomains'),
          true
        )
      )
    } catch (e: any) {
      // the fetch message suggests a custom fetch capability, which a model server never uses
      throw new Error(
        `${op}: image URL refused (${
          e.message.split('.')[0]
        }). Pass inline image data, or ` +
          `list the image host in allowedFetchDomains.`,
        { cause: e }
      )
    }
  }
  return admitted
}

/**
 * `llmPredictBattery`'s user, REBUILT from a closed shape (the copy is what is forwarded, never the
 * guest's value): a string, or an array of `{ role: string, content }` where content is a string or
 * an array of parts typed exactly `text` (a string `text`) or `image_url` (admitted, rebuilt with
 * the admitted URL). Anything else is refused. Checking only `image_url` parts let `video_url` and
 * `audio_url` through to backends that fetch them (cumulative review 3); the `{ text, images }`
 * vision form is refused too (use `llmVision`).
 */
function admitLlmUser(user: unknown, ctx: any): string | any[] {
  if (typeof user === 'string') return user
  const refuse = (why: string): never => {
    throw new Error(
      `llmPredictBattery: ${why} (user is a string, or an array of { role, content } messages whose ` +
        `content is a string or text/image_url parts; use llmVision for images)`
    )
  }
  if (!Array.isArray(user))
    return refuse('user must be a string or a message array')
  return user.map((message) => {
    if (
      message === null ||
      typeof message !== 'object' ||
      Array.isArray(message)
    )
      return refuse('each message must be an object')
    const keys = Object.keys(message)
    if (keys.some((k) => k !== 'role' && k !== 'content'))
      return refuse('a message has only role and content')
    const { role, content } = message as { role: unknown; content: unknown }
    if (typeof role !== 'string')
      return refuse('a message role must be a string')
    if (typeof content === 'string') return { role, content }
    if (!Array.isArray(content))
      return refuse('message content must be a string or an array of parts')
    return {
      role,
      content: content.map((part) => {
        if (part === null || typeof part !== 'object' || Array.isArray(part))
          return refuse('each content part must be an object')
        const p = part as Record<string, unknown>
        const pkeys = Object.keys(p)
        if (p.type === 'text') {
          if (
            pkeys.some((k) => k !== 'type' && k !== 'text') ||
            typeof p.text !== 'string'
          )
            return refuse('a text part is { type: "text", text: string }')
          return { type: 'text', text: p.text }
        }
        if (p.type === 'image_url') {
          if (pkeys.some((k) => k !== 'type' && k !== 'image_url'))
            return refuse(
              'an image_url part is { type: "image_url", image_url }'
            )
          const ref = p.image_url as any
          const url =
            typeof ref === 'string'
              ? ref
              : ref &&
                typeof ref === 'object' &&
                Object.keys(ref).every((k) => k === 'url')
              ? ref.url
              : refuse('an image_url is a string or { url }')
          const [admittedUrl] = admitImageUrls([url], ctx, 'llmPredictBattery')
          return { type: 'image_url', image_url: { url: admittedUrl } }
        }
        return refuse(
          `a content part of type '${String(p.type)}' is not supported`
        )
      }),
    }
  })
}

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
    // forwarded: the ADMITTED urls, never the guest's strings
    const resolvedImages = admitImageUrls(
      resolveValue(images, ctx) ?? [],
      ctx,
      'llmVision'
    )
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

// Every battery atom is a leaf IO atom: the VM resolves its inputs, so everything it hands a
// capability crosses the OUTBOUND membrane (a checked deep copy; `egressInput` in runtime.ts).
// Their bodies' own `resolveValue` calls are the identity under a resolved context. (They used to
// resolve their own, so a declared `system: s.string` was never checked against the resolved
// value: an array of video_url parts reached the backend — rc.2 cumulative review 4.)
for (const atom of [
  storeVectorize,
  storeCreateCollection,
  storeVectorAdd,
  storeSearch,
  llmPredictBattery,
  llmVision,
])
  atom.resolveInputs = true
