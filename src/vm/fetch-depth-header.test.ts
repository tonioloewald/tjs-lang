/**
 * The agent-depth header must not break cross-origin fetches in a BROWSER.
 *
 * `httpFetch` added `X-Agent-Depth` to every request. In a browser that is a non-simple header,
 * so every cross-origin request became a preflighted one, and any API that does not list the
 * header in `Access-Control-Allow-Headers` failed with "Failed to fetch" (open-meteo, found
 * running the AJS weather example live on tjs.tosijs.net, 2026-09-29). The header exists to
 * catch agents calling back into agent endpoints over HTTP; a third-party API gains nothing
 * from it. In a browser it now goes only to the page's own origin. A SERVER runtime (Node, Bun,
 * Deno — no CORS) sends it everywhere, and that is decided by the runtime, not by whether a
 * `location` exists: a DOM shim in the test runner defines one, and the first version of this
 * fix dropped the header server-side because of it (the recursive-fetch suite caught it).
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'
import { depthHeaderFor } from './runtime'

const browser = { server: false, origin: 'https://site.example.com' }

describe('X-Agent-Depth and CORS', () => {
  it('in a browser, a CROSS-origin request carries no depth header (it would force a preflight)', () => {
    expect(depthHeaderFor('https://api.example.com/v1', 1, browser)).toEqual({})
  })

  it('in a browser, a SAME-origin request still carries it (that is where agent endpoints are)', () => {
    expect(depthHeaderFor('https://site.example.com/run', 2, browser)).toEqual({
      'X-Agent-Depth': '2',
    })
    expect(depthHeaderFor('/run', 1, browser)).toEqual({ 'X-Agent-Depth': '1' })
  })

  it("an OPAQUE origin ('null' — sandboxed iframe, file:, data:) sends it nowhere", () => {
    const opaque = { server: false, origin: 'null' }
    expect(depthHeaderFor('https://api.example.com/v1', 1, opaque)).toEqual({})
    expect(depthHeaderFor('/run', 1, opaque)).toEqual({})
  })

  it('a server runtime sends it everywhere — even with a DOM shim defining `location`', () => {
    const shimmed = { server: true, origin: 'http://localhost:3000' }
    expect(depthHeaderFor('https://api.example.com/v1', 1, shimmed)).toEqual({
      'X-Agent-Depth': '1',
    })
  })

  it('this test runner is a server runtime, so the real default path still sends it', async () => {
    let sent: Record<string, string> = {}
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (_u: string, init: any) => {
      sent = init?.headers ?? {}
      return new Response('{}', {
        headers: { 'content-type': 'application/json' },
      })
    }) as any
    try {
      await new AgentVM().run(
        {
          op: 'seq',
          steps: [
            { op: 'httpFetch', url: 'https://api.example.com/v1', result: 'r' },
            { op: 'return', value: {} },
          ],
        } as any,
        {},
        { context: { allowedFetchDomains: ['api.example.com'] } }
      )
    } finally {
      globalThis.fetch = realFetch
    }
    expect(sent['X-Agent-Depth']).toBe('1')
  })
})
