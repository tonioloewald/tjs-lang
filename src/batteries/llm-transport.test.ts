/**
 * Deterministic coverage for the REAL LM Studio HTTP client (`getLLMCapability`).
 *
 * This is our plumbing — request shape, response parsing, error mapping — and it
 * has nothing to do with what a model actually says. It used to be tested ONLY
 * live (src/batteries/models.integration.test.ts), which is backwards: the code
 * we own should be tested deterministically and always, and a real model kept for
 * the one thing only it can prove (that the wire still works against reality).
 *
 * Note batteries.test.ts does NOT cover this: its `createMockLLMBattery`
 * re-implements predict/embed rather than exercising `getLLMCapability`, so the
 * real client's parse paths (`data.choices[0].message`, `data.data[0].embedding`)
 * and its error mapping were untested. They are the exact things that break when
 * an endpoint's response shape drifts.
 *
 * A fixture HTTP server (real localhost socket, no external network) stands in for
 * LM Studio via the injectable `baseUrl`, so the real `fetch` + parse path runs.
 * Fast and deterministic — belongs in test:fast, not behind SKIP_LLM_TESTS.
 */
import { describe, it, expect } from 'bun:test'
import { getLLMCapability } from './llm'
import type { LocalModels } from './models'

// getLLMCapability only ever calls .getLLM()/.getStructuredLLM()/.getEmbedding()
// on its models arg, so a duck-typed stand-in is enough — and lets us assert
// which model id each path selects without a live audit.
const fakeModels = {
  getLLM: () => ({ id: 'chat-model' }),
  getStructuredLLM: () => ({ id: 'structured-model' }),
  getEmbedding: () => ({ id: 'embed-model' }),
} as unknown as LocalModels

interface Captured {
  path: string
  body: any
}

/**
 * Spin up a throwaway LM Studio stand-in. `respond` maps the request to a
 * { status?, json } response; every request is recorded for assertions.
 */
function fixtureLMStudio(
  respond: (path: string, body: any) => { status?: number; json: any }
) {
  const captured: Captured[] = []
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

describe('getLLMCapability — the real LM Studio HTTP client', () => {
  it('predict() sends system+user messages and parses choices[0].message', async () => {
    const fx = fixtureLMStudio(() => ({
      json: { choices: [{ message: { role: 'assistant', content: 'blue' } }] },
    }))
    try {
      const { predict } = getLLMCapability(fakeModels, fx.baseUrl)
      const res = await predict('You are terse.', 'sky color?')

      expect(res.content).toBe('blue')

      const req = fx.captured.at(-1)!
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

      const req = fx.captured.at(-1)!
      // A response_format request must select the structured-capable model, not
      // the plain LLM — a distinction models.getStructuredLLM() exists to make.
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
      expect('tools' in fx.captured.at(-1)!.body).toBe(false)

      await predict('sys', 'hi', [
        { type: 'function', function: { name: 'f' } },
      ])
      expect(fx.captured.at(-1)!.body.tools).toHaveLength(1)
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
      const req = fx.captured.at(-1)!
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

  it('a refused connection becomes the friendly "no provider" message', async () => {
    // Port 1 is never listening — the connect is refused (ECONNREFUSED), which
    // the client is supposed to translate into actionable guidance rather than a
    // raw socket error.
    const { predict } = getLLMCapability(fakeModels, 'http://localhost:1/v1')
    await expect(predict('sys', 'x')).rejects.toThrow(
      /No LLM provider configured/
    )
  })
})
