function __match(v, ex) {
  if (ex === null) return v === null
  if (ex === undefined) return true
  if (
    ex &&
    typeof ex === 'object' &&
    ex.__runtimeType &&
    typeof ex.check === 'function'
  )
    return ex.check(v) === true
  const t = typeof ex
  if (t === 'number')
    return (
      typeof v === 'number' &&
      (Number.isInteger(ex) ? Number.isInteger(v) : true)
    )
  if (t === 'string' || t === 'boolean') return typeof v === t
  if (Array.isArray(ex)) {
    if (!Array.isArray(v)) return false
    return ex.length ? v.every((x) => __match(x, ex[0])) : true
  }
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const ks = Object.keys(ex)
    return ks.every((k) => k in v && __match(v[k], ex[k]))
  }
  return v === ex
}
function Type(d, p, e) {
  const t = { description: d, __runtimeType: true }
  if (typeof p === 'function') {
    t.check = p
    t.default = e ?? null
  } else {
    const ex = e ?? p
    t.default = ex
    t.__ex = ex
    t.check = (v) => __match(v, ex)
  }
  return t
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Type }
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { getLLMCapability } from '/Users/tonioloewald/tjs-lang/src/batteries/llm'

import {
  checkVision,
  isEmbeddingModel,
  looksLikeVisionModel,
} from '/Users/tonioloewald/tjs-lang/src/batteries/audit'

const fakeModels = {
  getLLM: () => ({ id: 'chat-model' }),
  getStructuredLLM: () => ({ id: 'structured-model' }),
  getEmbedding: () => ({ id: 'embed-model' }),
}

const Captured = Type('Captured', undefined, { path: '', body: null })
var __tjs_has_Captured = true

/* line 43 */
function fixtureLMStudio(respond) {
  const captured = []
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      const body = await req.json().catch(() => ({}))
      captured.push({ path: url.pathname, body })
      const { status = 200, json } = respond(url.pathname, body)
      return new Response(JSON.stringify(json), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })
  return {
    baseUrl: `http://localhost:${server.port}/v1`,
    captured,
    stop: () => server.stop(true),
  }
}
fixtureLMStudio.__tjs = {
  params: {
    respond: {
      type: {
        kind: 'any',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:43',
}

describe('getLLMCapability — the real LM Studio HTTP client', () => {
  it('predict() sends system+user messages and parses choices[0].message', async () => {
    const fx = fixtureLMStudio(() => ({
      json: { choices: [{ message: { role: 'assistant', content: 'blue' } }] },
    }))
    try {
      const { predict } = getLLMCapability(fakeModels, fx.baseUrl)
      const res = await predict('You are terse.', 'sky color?')
      expect(res.content).toBe('blue')
      const req = fx.captured.at(-1)
      expect(req.path).toBe('/v1/chat/completions')
      expect(req.body.model).toBe('chat-model')
      expect(req.body.messages).toEqual([
        { role: 'system', content: 'You are terse.' },
        { role: 'user', content: 'sky color?' },
      ])
    } finally {
      fx.stop()
    }
  })
  it('predict() uses the STRUCTURED model and forwards response_format', async () => {
    const fx = fixtureLMStudio(() => ({
      json: { choices: [{ message: { content: '{"a":1}' } }] },
    }))
    try {
      const { predict } = getLLMCapability(fakeModels, fx.baseUrl)
      const rf = { type: 'json_schema', json_schema: { name: 't', schema: {} } }
      await predict('sys', 'give json', [], rf)
      const req = fx.captured.at(-1)

      expect(req.body.model).toBe('structured-model')
      expect(req.body.response_format).toEqual(rf)
    } finally {
      fx.stop()
    }
  })
  it('predict() omits an empty tools array (the LM Studio lazy-grammar 400 guard)', async () => {
    const fx = fixtureLMStudio(() => ({
      json: { choices: [{ message: { content: 'ok' } }] },
    }))
    try {
      const { predict } = getLLMCapability(fakeModels, fx.baseUrl)
      await predict('sys', 'hi', [])
      expect('tools' in fx.captured.at(-1).body).toBe(false)
      await predict('sys', 'hi', [
        { type: 'function', function: { name: 'f' } },
      ])
      expect(fx.captured.at(-1).body.tools).toHaveLength(1)
    } finally {
      fx.stop()
    }
  })
  it('predict() falls back to an empty content when the model returns no choices', async () => {
    const fx = fixtureLMStudio(() => ({ json: { choices: [] } }))
    try {
      const { predict } = getLLMCapability(fakeModels, fx.baseUrl)
      expect((await predict('sys', 'x')).content).toBe('')
    } finally {
      fx.stop()
    }
  })
  it('embed() posts to /embeddings and parses data[0].embedding', async () => {
    const vec = Array.from({ length: 384 }, (_, i) => i / 384)
    const fx = fixtureLMStudio(() => ({ json: { data: [{ embedding: vec }] } }))
    try {
      const { embed } = getLLMCapability(fakeModels, fx.baseUrl)
      const res = await embed('some text')
      expect(res).toEqual(vec)
      const req = fx.captured.at(-1)
      expect(req.path).toBe('/v1/embeddings')
      expect(req.body.model).toBe('embed-model')
      expect(req.body.input).toBe('some text')
    } finally {
      fx.stop()
    }
  })
  it('predict() maps a non-OK response to an LLM Error', async () => {
    const fx = fixtureLMStudio(() => ({ status: 500, json: { error: 'boom' } }))
    try {
      const { predict } = getLLMCapability(fakeModels, fx.baseUrl)
      await expect(predict('sys', 'x')).rejects.toThrow(/LLM Error: 500/)
    } finally {
      fx.stop()
    }
  })
  it('embed() maps a non-OK response to an Embedding Error', async () => {
    const fx = fixtureLMStudio(() => ({ status: 503, json: {} }))
    try {
      const { embed } = getLLMCapability(fakeModels, fx.baseUrl)
      await expect(embed('x')).rejects.toThrow(/Embedding Error: 503/)
    } finally {
      fx.stop()
    }
  })
  it('a refused connection becomes friendly, backend-neutral guidance', async () => {
    const { predict } = getLLMCapability(fakeModels, 'http://localhost:1/v1')
    await expect(predict('sys', 'x')).rejects.toThrow(
      /No local LLM server reachable at http:\/\/localhost:1\/v1.*TJS_LLM_BASE_URL/
    )
  })
})

describe('checkVision — the multimodal capability probe', () => {
  it('sends a standard OpenAI image_url block with a non-degenerate image', async () => {
    const fx = fixtureLMStudio(() => ({
      json: { choices: [{ message: { content: 'red' } }] },
    }))
    try {
      expect(await checkVision(fx.baseUrl, 'some-vlm')).toBe(true)
      expect(fx.captured).toHaveLength(1)
      const { path, body } = fx.captured[0]
      expect(path).toBe('/v1/chat/completions')
      expect(body.model).toBe('some-vlm')

      const content = body.messages[0].content
      expect(Array.isArray(content)).toBe(true)
      expect(content.map((c) => c.type)).toEqual(['text', 'image_url'])

      const url = content[1].image_url.url
      expect(url.startsWith('data:image/png;base64,')).toBe(true)
      expect(url.length).toBeGreaterThan(100)
    } finally {
      fx.stop()
    }
  })
  it('judges on SHAPE, not content — an empty answer is still a vision model', async () => {
    const fx = fixtureLMStudio(() => ({
      json: { choices: [{ message: { content: '' } }] },
    }))
    try {
      expect(await checkVision(fx.baseUrl, 'gemma-4-e4b')).toBe(true)
    } finally {
      fx.stop()
    }
  })
  it('a wrong answer is still a vision model', async () => {
    const fx = fixtureLMStudio(() => ({
      json: { choices: [{ message: { content: 'a photo of a dog' } }] },
    }))
    try {
      expect(await checkVision(fx.baseUrl, 'bad-but-multimodal')).toBe(true)
    } finally {
      fx.stop()
    }
  })
  it('non-2xx means no vision (the server rejected the multimodal request)', async () => {
    const fx = fixtureLMStudio(() => ({
      status: 400,
      json: { error: 'This model does not support images' },
    }))
    try {
      expect(await checkVision(fx.baseUrl, 'text-only-model')).toBe(false)
    } finally {
      fx.stop()
    }
  })
  it('an unreachable server is false, not a throw', async () => {
    expect(await checkVision('http://localhost:1/v1', 'anything')).toBe(false)
  })
})

describe('model name heuristics — a hint for ordering, never a filter', () => {
  it('ranks known multimodal families, INCLUDING the ones added after it was written', () => {
    for (const id of [
      'gemma-4-e4b',
      'gemma-3-12b',
      'qwen2.5-vl-7b',
      'llava-1.5',
      'pixtral-12b',
      'some-vision-model',
    ]) {
      expect(looksLikeVisionModel(id)).toBe(true)
    }
  })
  it('does not claim text-only models are multimodal', () => {
    for (const id of ['qwen2.5-7b-instruct', 'llama-3.1-8b', 'mistral-7b']) {
      expect(looksLikeVisionModel(id)).toBe(false)
    }
  })
  it('recognises embedding endpoints, which cannot answer a chat probe', () => {
    expect(isEmbeddingModel('text-embedding-nomic-v1.5')).toBe(true)
    expect(isEmbeddingModel('qwen2.5-7b-instruct')).toBe(false)
  })
  it('DELIBERATELY under-matches: a missed embedding model costs one wasted probe', () => {
    expect(isEmbeddingModel('bge-small-en-v1.5')).toBe(false)
  })
})
