/* tjs <- input.ts */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { auditModels } from '/Users/tonioloewald/tjs-lang/src/batteries/audit'

/* line 21 */
function substitutingServer(loaded, ids) {
  return Bun.serve({
    port: 0,
    fetch: async (req) => {
      const path = new URL(req.url).pathname
      if (path.endsWith('/models')) {
        return Response.json({ data: ids.map((id) => ({ id })) })
      }
      if (path.endsWith('/chat/completions')) {
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
substitutingServer.__tjs = {
  params: {
    loaded: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    ids: {
      type: {
        kind: 'array',
        items: {
          kind: 'string',
        },
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:21',
}

let server

let baseUrl

const CHAT = 'a-chat-model'

const EMBED = 'an-embedding-model'

let priorCacheDir

beforeAll(() => {
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

    expect(embed.type).toBe('Embedding')
  })
  it('and does not credit it with vision', async () => {
    const models = await auditModels(baseUrl, { force: true })
    expect(models.find((m) => m.id === EMBED).vision).toBe(false)
  })
  it('still types the model that DID answer as an LLM (control)', async () => {
    const models = await auditModels(baseUrl, { force: true })
    expect(models.find((m) => m.id === CHAT).type).toBe('LLM')
  })
})

describe('the answer is read from whichever channel holds it', () => {
  it('falls back to reasoning_content when content is empty', async () => {
    const { messageText } = await import(
      '/Users/tonioloewald/tjs-lang/src/batteries/audit'
    )
    expect(messageText({ content: '', reasoning_content: '{"n":1}' })).toBe(
      '{"n":1}'
    )
  })
  it('prefers content when both are present', async () => {
    const { messageText } = await import(
      '/Users/tonioloewald/tjs-lang/src/batteries/audit'
    )
    expect(
      messageText({ content: 'ok', reasoning_content: 'let me think…' })
    ).toBe('ok')
  })
  it('is empty when there is nothing anywhere (control)', async () => {
    const { messageText } = await import(
      '/Users/tonioloewald/tjs-lang/src/batteries/audit'
    )
    expect(messageText({ content: '' })).toBe('')
    expect(messageText(undefined)).toBe('')
  })
})
