/**
 * The model audit must not be fooled by a server that SUBSTITUTES models.
 *
 * LM Studio answers a chat request with whatever is loaded, whatever `model` you asked for.
 * Verified against a real instance: requesting `text-embedding-nomic-embed-text-v1.5-embedding`
 * for a chat completion returns 200 with `"model": "qwen/qwen3.8-27b"` in the body.
 *
 * `checkLLM` returned `res.ok`, so it was true for EVERY model id. An embedding model was
 * therefore typed `"LLM"` (and `vision: true`, by the same substitution), and
 * `selectDefaults`' `find(m => m.type === 'LLM')` could hand chat completions to an embedding
 * model. It did not bite in practice only because a real chat model happened to sort first —
 * an ordering accident, not a guarantee.
 *
 * A fixture server (real localhost socket, no external network) reproduces the substitution
 * deterministically, so this belongs in `test:fast` rather than behind `SKIP_LLM_TESTS`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { auditModels } from './audit'

/** Serves every chat request as a different model, exactly as LM Studio does. */
function substitutingServer(loaded: string, ids: string[]) {
  return Bun.serve({
    port: 0,
    fetch: async (req) => {
      const path = new URL(req.url).pathname
      if (path.endsWith('/models')) {
        return Response.json({ data: ids.map((id) => ({ id })) })
      }
      if (path.endsWith('/chat/completions')) {
        // Answers happily, but names the model that ACTUALLY ran.
        return Response.json({
          model: loaded,
          choices: [{ message: { content: 'hi' } }],
        })
      }
      if (path.endsWith('/embeddings')) {
        return Response.json({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
      }
      return new Response('not found', { status: 404 })
    },
  })
}

let server: ReturnType<typeof substitutingServer>
let baseUrl: string
const CHAT = 'a-chat-model'
const EMBED = 'an-embedding-model'

// RESTORED afterwards. `process.env` is process-wide, and bun runs test files in one
// process — leaving this set broke `cache-dir.test.ts`'s XDG_CACHE_HOME case, which is a
// different file entirely. A test that changes global state and does not put it back is a
// test that fails somebody else.
let priorCacheDir: string | undefined

beforeAll(() => {
  // Redirect the audit cache so a test can never write the developer's real one.
  priorCacheDir = process.env.TJS_CACHE_DIR
  process.env.TJS_CACHE_DIR = '/tmp/tjs-audit-classification-test'
  server = substitutingServer(CHAT, [CHAT, EMBED])
  baseUrl = `http://localhost:${server.port}/v1`
})

afterAll(() => {
  server.stop()
  if (priorCacheDir === undefined) delete process.env.TJS_CACHE_DIR
  else process.env.TJS_CACHE_DIR = priorCacheDir
})

describe('a substituted answer does not make a model an LLM', () => {
  it('types the embedding model as Embedding, not LLM', async () => {
    const models = await auditModels(baseUrl, { force: true })
    const embed = models.find((m) => m.id === EMBED)
    expect(embed).toBeDefined()
    // `res.ok` alone said LLM here, because the chat endpoint answered for every id.
    expect(embed!.type).toBe('Embedding')
  })

  it('and does not credit it with vision', async () => {
    const models = await auditModels(baseUrl, { force: true })
    expect(models.find((m) => m.id === EMBED)!.vision).toBe(false)
  })

  it('still types the model that DID answer as an LLM (control)', async () => {
    // Without this, refusing everything would pass both assertions above.
    const models = await auditModels(baseUrl, { force: true })
    expect(models.find((m) => m.id === CHAT)!.type).toBe('LLM')
  })
})

/**
 * A reasoning model's answer can arrive in `reasoning_content`.
 *
 * `qwen/qwen3.8-27b` under `response_format` returns `content: ''` and the requested JSON in
 * `reasoning_content` — verified against a live instance. Reading only `content` recorded
 * `structuredOutput: false` for a model that supports it perfectly well, and cached that for
 * 24 hours.
 *
 * Same class as the vision probe's old bug, where a thinking model's empty `content` was read
 * as "cannot do this". Ask where the answer IS, not where you expected it.
 */
describe('the answer is read from whichever channel holds it', () => {
  it('falls back to reasoning_content when content is empty', async () => {
    const { messageText } = await import('./audit')
    expect(messageText({ content: '', reasoning_content: '{"n":1}' })).toBe(
      '{"n":1}'
    )
  })

  it('prefers content when both are present', async () => {
    // `content` is the real channel; reasoning is only a fallback for models that misroute.
    // Preferring reasoning would hand callers a model's private deliberation as its answer.
    const { messageText } = await import('./audit')
    expect(
      messageText({ content: 'ok', reasoning_content: 'let me think…' })
    ).toBe('ok')
  })

  it('is empty when there is nothing anywhere (control)', async () => {
    const { messageText } = await import('./audit')
    expect(messageText({ content: '' })).toBe('')
    expect(messageText(undefined)).toBe('')
  })
})
