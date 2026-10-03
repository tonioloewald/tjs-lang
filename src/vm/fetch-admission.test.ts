/**
 * What `httpFetch` may fetch, and how much of it: one admission rule at EVERY hop (rc.2 pre-tag
 * review B1 and its redirect/body minor), and a VM that never writes to the host's capabilities
 * object (M1).
 *
 * "May this URL be fetched" used to be answered in pieces: the scheme and private-range check ran
 * only WITHOUT an allowlist, the allowlist compared only the hostname, a redirect was followed by
 * the host's `fetch` unchecked, and the body was read in full before any size cap. On Bun,
 * `file://<allowed-host>/etc/hosts` read a host file.
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'

const run = (src: string, opts: any = {}) =>
  new AgentVM().run(transpile(src).ast, {}, { fuel: 1000, ...opts })

const fetchSrc = (url: string) =>
  `function f() { const v = httpFetch({ url: ${JSON.stringify(
    url
  )}, responseType: 'text' })\n return { v } }`

// a local fixture: a redirect to a blocked/disallowed target, and a large streamed body that
// records how much of itself was actually pulled
let pulled = 0
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const u = new URL(req.url)
    if (u.pathname === '/to-metadata')
      return Response.redirect('http://169.254.169.254/latest/meta-data/', 302)
    if (u.pathname === '/to-other')
      return Response.redirect('http://example.com/', 302)
    if (u.pathname === '/to-file')
      return new Response(null, {
        status: 302,
        headers: { location: 'file:///etc/hosts' },
      })
    if (u.pathname === '/big') {
      pulled = 0
      const chunk = new Uint8Array(64 * 1024).fill(120)
      return new Response(
        new ReadableStream({
          pull(c) {
            if (pulled >= 32 * 1024 * 1024) return c.close()
            pulled += chunk.length
            c.enqueue(chunk)
          },
        }),
        { headers: { 'content-type': 'text/plain' } }
      )
    }
    return new Response('ok', { headers: { 'content-type': 'text/plain' } })
  },
})
afterAll(() => server.stop(true))
const base = `http://127.0.0.1:${server.port}`
const allow = {
  context: { allowedFetchDomains: ['127.0.0.1', 'api.github.com'] },
}

describe('B1: the scheme is admitted in allowlist mode too', () => {
  for (const url of [
    'file://api.github.com/etc/hosts',
    'file://127.0.0.1/etc/hosts',
    'data:text/plain,secret',
    'blob:http://api.github.com/x',
    'ftp://api.github.com/x',
  ])
    it(`refused: ${url}`, async () => {
      const r = await run(fetchSrc(url), allow)
      expect(r.error?.message ?? 'admitted').toMatch(
        /http: or https:|not allowed|blocked/i
      )
    })

  it('apparatus: an allowed http URL is fetched', async () => {
    const r = await run(fetchSrc(`${base}/ok`), allow)
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: 'ok' })
  })
})

describe('every redirect hop is admitted again', () => {
  for (const [hop, path] of [
    ['to the cloud metadata address', '/to-metadata'],
    ['to a host outside the allowlist', '/to-other'],
    ['to a file: URL', '/to-file'],
  ])
    it(`refused: a redirect ${hop}`, async () => {
      const r = await run(fetchSrc(`${base}${path}`), allow)
      expect(r.error?.message ?? 'admitted').toMatch(/redirect/i)
    })
})

describe('the body is read under the cap, not in full first', () => {
  it('an oversized body is aborted early', async () => {
    const r = await run(fetchSrc(`${base}/big`), {
      ...allow,
      membraneMaxBytes: 1024 * 1024,
    })
    expect(r.error?.message ?? 'admitted').toMatch(/too large|exceeds|bytes/i)
    // read stops near the 1MB cap; the old path pulled all 32MB before the membrane refused
    expect(pulled).toBeLessThan(8 * 1024 * 1024)
  })
})

describe("M1: the VM never writes to the host's capabilities object", () => {
  const storeProgram = (op: string) =>
    op === 'set'
      ? "function f() { storeSet({ key: 'secret', value: 'S' })\n return { ok: true } }"
      : "function f() { const v = storeGet({ key: 'secret' })\n return { v } }"

  it('two runs sharing one capabilities object do not share a default store', async () => {
    const caps: Record<string, unknown> = {}
    await run(storeProgram('set'), { capabilities: caps })
    const b = await run(storeProgram('get'), { capabilities: caps })
    expect((b.result as any)?.v ?? null).toBeNull()
    expect(Object.keys(caps)).toEqual([])
  })

  it('a frozen capabilities object is fine', async () => {
    const r = await run(storeProgram('set'), {
      capabilities: Object.freeze({}),
    })
    expect(r.error).toBeUndefined()
  })

  it('within one run, nested agentRun sees the same per-run store', async () => {
    const child = transpile(
      "function g() { const v = storeGet({ key: 'k' })\n return { v } }"
    ).ast
    const r = await new AgentVM().run(
      transpile(
        "function f(child) { storeSet({ key: 'k', value: 7 })\n const r = agentRun({ agentId: child, input: {} })\n return { r } }"
      ).ast,
      { child },
      { fuel: 1000, capabilities: {} }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ r: { v: 7 } })
  })
})
