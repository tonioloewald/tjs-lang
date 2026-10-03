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

// Round 21 (pre-tag re-review): guest headers are ADMITTED, they never follow a redirect to another
// origin, and the capabilities object is shadowed, not flattened.
const seen: Array<{
  path: string
  host: string | null
  auth: string | null
  method: string
}> = []
let loops = 0
const other = Bun.serve({
  port: 0,
  fetch(req) {
    const u = new URL(req.url)
    seen.push({
      path: `B${u.pathname}`,
      host: req.headers.get('host'),
      auth: req.headers.get('authorization'),
      method: req.method,
    })
    return new Response('from-b', { headers: { 'content-type': 'text/plain' } })
  },
})
const origin = Bun.serve({
  port: 0,
  fetch(req) {
    const u = new URL(req.url)
    seen.push({
      path: `A${u.pathname}`,
      host: req.headers.get('host'),
      auth: req.headers.get('authorization'),
      method: req.method,
    })
    if (u.pathname === '/to-b')
      return Response.redirect(`http://127.0.0.1:${other.port}/echo`, 302)
    if (u.pathname === '/rel')
      return new Response(null, {
        status: 302,
        headers: { location: 'landed' },
      })
    if (u.pathname === '/see-other')
      return new Response(null, {
        status: 303,
        headers: { location: '/landed' },
      })
    if (u.pathname === '/307-to-b')
      return new Response(null, {
        status: 307,
        headers: { location: `http://127.0.0.1:${other.port}/echo` },
      })
    if (u.pathname === '/307-same')
      return new Response(null, {
        status: 307,
        headers: { location: '/landed' },
      })
    if (u.pathname === '/loop') {
      loops++
      return new Response(null, { status: 302, headers: { location: '/loop' } })
    }
    if (u.pathname === '/declared-big')
      return new Response('x'.repeat(2 * 1024 * 1024), {
        headers: { 'content-type': 'text/plain' },
      })
    return new Response(`landed:${req.method}`, {
      headers: { 'content-type': 'text/plain' },
    })
  },
})
afterAll(() => {
  other.stop(true)
  origin.stop(true)
})
const A = `http://127.0.0.1:${origin.port}`
const fetchWith = (url: string, extra: string) =>
  `function f() { const v = httpFetch({ url: ${JSON.stringify(
    url
  )}, responseType: 'text'${extra} })\n return { v } }`

describe('guest headers are admitted (pre-tag re-review)', () => {
  for (const name of [
    'Host',
    'host',
    'Content-Length',
    'Transfer-Encoding',
    'Proxy-Authorization',
    'Sec-Fetch-Site',
    'X-Agent-Depth',
    'x-agent-depth',
    'X-AGENT-DEPTH',
  ])
    it(`refused: a guest '${name}' header`, async () => {
      seen.length = 0
      const r = await run(
        fetchWith(
          `${A}/landed`,
          `, headers: { ${JSON.stringify(name)}: 'admin.internal' }`
        ),
        allow
      )
      expect(r.error?.message ?? 'admitted').toMatch(
        /header cannot be set by an agent/
      )
      expect(seen.length).toBe(0) // refused before any request
    })

  it("a cross-origin hop carries none of the guest's headers", async () => {
    seen.length = 0
    const r = await run(
      fetchWith(`${A}/to-b`, `, headers: { Authorization: 'Bearer secret' }`),
      allow
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: 'from-b' })
    expect(seen.find((x) => x.path === 'A/to-b')?.auth).toBe('Bearer secret')
    expect(seen.find((x) => x.path === 'B/echo')?.auth).toBeNull()
  })
})

describe('allowed redirects still work', () => {
  it('a relative Location, same origin', async () => {
    const r = await run(fetchWith(`${A}/rel`, ''), allow)
    expect(r.result).toEqual({ v: 'landed:GET' })
  })
  it('303 turns a POST into a GET', async () => {
    const r = await run(
      fetchWith(`${A}/see-other`, `, method: 'POST', body: { a: 1 }`),
      allow
    )
    expect(r.result).toEqual({ v: 'landed:GET' })
  })
  it('the redirect cap stops a loop', async () => {
    loops = 0
    const r = await run(fetchWith(`${A}/loop`, ''), allow)
    expect(r.error?.message ?? 'admitted').toMatch(/more than 5 redirects/)
    expect(loops).toBeLessThanOrEqual(6)
  })
  it('a declared content-length over the cap is refused before the body is read', async () => {
    const r = await run(fetchWith(`${A}/declared-big`, ''), {
      ...allow,
      membraneMaxBytes: 1024 * 1024,
    })
    expect(r.error?.message ?? 'admitted').toMatch(/\(2097152 bytes exceeds/)
  })
})

describe('capabilities are shadowed, not flattened (pre-tag re-review)', () => {
  it('a class-instance store (a prototype getter) is the store the run uses', async () => {
    const real = new Map<string, unknown>()
    class Caps {
      get store() {
        return {
          get: async (k: string) => real.get(k),
          set: async (k: string, v: unknown) => void real.set(k, v),
        }
      }
    }
    const caps = new Caps()
    const r = await run(
      "function f() { storeSet({ key: 'k', value: 'v' })\n return { ok: true } }",
      { capabilities: caps }
    )
    expect(r.error).toBeUndefined()
    expect(real.get('k')).toBe('v')
    expect(Object.keys(caps)).toEqual([])
  })

  it('a frozen object with an undefined store gets the default store on the shadow', async () => {
    const caps = Object.freeze({ store: undefined })
    const r = await run(
      "function f() { storeSet({ key: 'k', value: 'v' })\n const v = storeGet({ key: 'k' })\n return { v } }",
      { capabilities: caps }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: 'v' })
  })
})

// Round 22 (pre-tag re-review 2): the host's capabilities object is used EXACTLY as passed.
describe('capabilities are never copied, wrapped or written', () => {
  const setGet =
    "function f() { storeSet({ key: 'k', value: 'v' })\n const v = storeGet({ key: 'k' })\n return { v } }"

  it('a #private-backed getter keeps its receiver', async () => {
    class Caps {
      #m = new Map<string, unknown>()
      get store() {
        const m = this.#m
        return {
          get: async (k: string) => m.get(k),
          set: async (k: string, v: unknown) => void m.set(k, v),
        }
      }
      peek(k: string) {
        return this.#m.get(k)
      }
    }
    const caps = new Caps()
    const r = await run(setGet, { capabilities: caps })
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: 'v' })
    expect(caps.peek('k')).toBe('v')
  })

  it('a #private method fetch keeps its receiver', async () => {
    class Caps {
      #reply = 'private-ok'
      async fetch() {
        return this.#reply
      }
    }
    const r = await run(
      "function f() { const v = httpFetch({ url: 'https://x.test/' })\n return { v } }",
      { capabilities: new Caps() }
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: 'private-ok' })
  })

  it('a getter that throws fails the atom monadically, not vm.run', async () => {
    const caps = {
      get store(): any {
        throw new Error('store unavailable')
      },
    }
    const r = await run(setGet, { capabilities: caps })
    expect(r.error?.message ?? 'admitted').toMatch(/store unavailable/)
  })

  it('the host object is never written', async () => {
    const caps = Object.freeze({})
    const r = await run(setGet, { capabilities: caps })
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: 'v' })
  })

  it('a non-object capabilities is refused by name', async () => {
    await expect(run(setGet, { capabilities: 5 as any })).rejects.toThrow(
      /capabilities must be an object/
    )
  })
})

describe('methods and routing headers are admitted (pre-tag re-review 2)', () => {
  for (const method of ['CONNECT', 'TRACE', 'TRACK', 'connect'])
    it(`refused: method ${method}`, async () => {
      seen.length = 0
      const r = await run(
        fetchWith(`${A}/landed`, `, method: '${method}'`),
        allow
      )
      expect(r.error?.message ?? 'admitted').toMatch(/method .* is not allowed/)
      expect(seen.length).toBe(0)
    })

  for (const name of [
    'X-Forwarded-Host',
    'x-forwarded-for',
    'Forwarded',
    'X-Original-URL',
    'X-HTTP-Method-Override',
  ])
    it(`refused: a guest '${name}' header`, async () => {
      seen.length = 0
      const r = await run(
        fetchWith(
          `${A}/landed`,
          `, headers: { ${JSON.stringify(name)}: 'admin.internal' }`
        ),
        allow
      )
      expect(r.error?.message ?? 'admitted').toMatch(
        /header cannot be set by an agent/
      )
      expect(seen.length).toBe(0)
    })
})

describe('the opaque (browser) redirect branch', () => {
  it('is refused, naming the escape hatches, and its body is released', async () => {
    let cancelled = false
    const real = globalThis.fetch
    globalThis.fetch = (async () => ({
      type: 'opaqueredirect',
      status: 0,
      headers: new Headers(),
      body: { cancel: async () => void (cancelled = true) },
    })) as any
    try {
      const r = await run(fetchSrc('https://api.github.com/x'), allow)
      expect(r.error?.message ?? 'admitted').toMatch(/custom fetch capability/)
      expect(cancelled).toBe(true)
    } finally {
      globalThis.fetch = real
    }
  })
})

describe('a 307/308 carries the body only within its origin', () => {
  it('refused: a cross-origin 307 with a body', async () => {
    seen.length = 0
    const r = await run(
      fetchWith(`${A}/307-to-b`, `, method: 'POST', body: { a: 1 }`),
      allow
    )
    expect(r.error?.message ?? 'admitted').toMatch(
      /307\/308 would re-send the request body/
    )
    expect(seen.some((x) => x.path.startsWith('B'))).toBe(false)
  })
  it('a same-origin 307 keeps the method', async () => {
    const r = await run(
      fetchWith(`${A}/307-same`, `, method: 'POST', body: { a: 1 }`),
      allow
    )
    expect(r.result).toEqual({ v: 'landed:POST' })
  })
})
