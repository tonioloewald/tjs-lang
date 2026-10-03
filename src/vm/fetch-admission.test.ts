/**
 * What `httpFetch` may fetch, and how much of it: one admission rule for every request, redirects
 * RETURNED to the agent and never followed, a closed list of request headers (rc.2 pre-tag reviews),
 * and a VM that never writes to the host's capabilities object.
 *
 * "May this URL be fetched" used to be answered in pieces: the scheme and private-range check ran
 * only WITHOUT an allowlist, the allowlist compared only the hostname, a redirect was followed by
 * the host's `fetch` unchecked, and the body was read in full before any size cap. On Bun,
 * `file://<allowed-host>/etc/hosts` read a host file.
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { Eval, SafeFunction } from '../lang/eval'

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
// allowlist entries name the fixture servers' ports (an entry admits only the default port
// otherwise); POST/PUT are enabled for the rows that need them — the default is GET/HEAD
const allow = {
  context: {
    allowedFetchDomains: [`127.0.0.1:${server.port}`, 'api.github.com'],
    allowedFetchMethods: ['POST', 'PUT', 'PATCH'],
  },
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

describe('a redirect is returned as data, never followed (Tonio, 2026-10-03)', () => {
  for (const [hop, path, location] of [
    [
      'to the cloud metadata address',
      '/to-metadata',
      'http://169.254.169.254/latest/meta-data/',
    ],
    ['to a host outside the allowlist', '/to-other', 'http://example.com/'],
    ['to a file: URL', '/to-file', 'file:///etc/hosts'],
  ])
    it(`not followed: a redirect ${hop}`, async () => {
      const r = await run(fetchSrc(`${base}${path}`), allow)
      expect(r.error).toBeUndefined()
      expect((r.result as any).v).toMatchObject({ redirect: true, location })
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
    if (u.pathname === '/not-modified')
      return new Response(null, { status: 304 })
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
// origin A is allowed; origin B (the other server) is deliberately NOT on the allowlist
allow.context.allowedFetchDomains.push(`127.0.0.1:${origin.port}`)
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

  it('a redirect to another origin is not followed, so nothing the guest chose reaches it', async () => {
    seen.length = 0
    const r = await run(
      fetchWith(
        `${A}/to-b`,
        `, method: 'PUT', body: { secret: 1 }, headers: { Authorization: 'Bearer secret' }`
      ),
      allow
    )
    expect(r.error).toBeUndefined()
    expect((r.result as any).v).toMatchObject({ redirect: true, status: 302 })
    expect(seen.some((x) => x.path.startsWith('B'))).toBe(false)
  })

  it('allowed: the common API headers and an X- API key', async () => {
    const r = await run(
      fetchWith(
        `${A}/landed`,
        `, headers: { Accept: 'text/plain', Authorization: 'Bearer t', 'X-API-Key': 'k', 'Content-Type': 'text/plain' }`
      ),
      allow
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ v: 'landed:GET' })
  })
})

describe('a 3xx comes back to the agent; fetching its location is a new request', () => {
  it('a relative Location is resolved to an absolute URL', async () => {
    const r = await run(fetchWith(`${A}/rel`, ''), allow)
    expect((r.result as any).v).toEqual({
      redirect: true,
      status: 302,
      location: `${A}/landed`,
    })
  })
  it('the agent can follow it itself, as a new admitted request', async () => {
    const r = await run(
      `function f() {
        const first = httpFetch({ url: ${JSON.stringify(
          `${A}/see-other`
        )}, method: 'POST', body: { a: 1 }, responseType: 'text' })
        const next = httpFetch({ url: first.location, responseType: 'text' })
        return { first: first.status, next }
      }`,
      allow
    )
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ first: 303, next: 'landed:GET' })
  })
  it('a loop costs one request per call', async () => {
    loops = 0
    const r = await run(fetchWith(`${A}/loop`, ''), allow)
    expect((r.result as any).v).toMatchObject({ redirect: true })
    expect(loops).toBe(1)
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
    'X-Forwarded',
    'Forwarded',
    'X-Original-URL',
    'X-Original-Host',
    'X-Host',
    'X-Real-IP',
    'True-Client-IP',
    'X-Client-IP',
    'X-Cluster-Client-IP',
    'X-Proxy-Authorization',
    'X-HTTP-Method-Override',
    'X-Rewrite-URL',
    'X-Method-Override',
    'X-Envoy-Original-Dst-Host',
    'X-Envoy-Internal',
    'X-Envoy-Original-Path',
    'X-Upstream-Host',
    'X-Backend-Host',
    'X-Override-URL',
    'X-Originating-IP',
    'X-True-Client-IP',
    'X-Remote-Addr',
    'X-Remote-IP',
    'X-Azure-ClientIP',
    'X-Scheme',
    'X-Url-Scheme',
    'X-Custom-Thing',
    'Cookie',
    'Origin',
    'Referer',
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
  it('comes back as data with a null location, and its body is released', async () => {
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
      expect(r.error).toBeUndefined()
      expect((r.result as any).v).toEqual({
        redirect: true,
        status: 0,
        location: null,
      })
      expect(cancelled).toBe(true)
    } finally {
      globalThis.fetch = real
    }
  })
})

describe('round 24: a closed header list, widened only by the host; allowlists bind the built-in client', () => {
  it('a host widens the list for a run, by exact name', async () => {
    const r = await run(
      fetchWith(`${A}/landed`, `, headers: { 'X-Custom-Thing': 'v' }`),
      {
        context: {
          ...allow.context,
          allowedRequestHeaders: ['x-custom-thing'],
        },
      }
    )
    expect(r.error).toBeUndefined()
  })
  it('the depth header stays refused even if the host lists it', async () => {
    const r = await run(
      fetchWith(`${A}/landed`, `, headers: { 'X-Agent-Depth': '0' }`),
      {
        context: { ...allow.context, allowedRequestHeaders: ['x-agent-depth'] },
      }
    )
    expect(r.error?.message ?? 'admitted').toMatch(
      /header cannot be set by an agent/
    )
  })
  it("a host's own fetch gets the SAME admission: undeclared headers and methods are refused", async () => {
    const got: any[] = []
    const caps = {
      fetch: async (_url: string, init: any) => {
        got.push(init)
        return 'ok'
      },
    }
    const bad = await run(
      fetchWith(
        'https://x.test/',
        `, method: 'PROPFIND', headers: { Cookie: 'c=1' }`
      ),
      { capabilities: caps }
    )
    expect(bad.error?.message ?? 'admitted').toMatch(
      /cannot be set by an agent|not allowed/
    )
    expect(got.length).toBe(0)
    // the host DECLARES what its own fetch needs, and then the agent may ask for it
    const ok = await run(
      fetchWith(
        'https://x.test/',
        `, method: 'propfind', headers: { Cookie: 'c=1' }`
      ),
      {
        capabilities: caps,
        context: {
          allowedRequestHeaders: ['Cookie'],
          allowedFetchMethods: ['PROPFIND'],
        },
      }
    )
    expect(ok.error).toBeUndefined()
    expect(got[0].method).toBe('PROPFIND')
    expect(got[0].headers.Cookie).toBe('c=1')
    const depth = await run(
      fetchWith('https://x.test/', `, headers: { 'x-AGENT-depth': '0' }`),
      {
        capabilities: caps,
      }
    )
    expect(depth.error?.message ?? 'admitted').toMatch(
      /header cannot be set by an agent/
    )
  })
  it('a 304 Not Modified is a response, not a redirect', async () => {
    const r = await run(
      fetchWith(`${A}/not-modified`, `, headers: { 'If-None-Match': '"abc"' }`),
      allow
    )
    expect(r.error).toBeUndefined()
    expect((r.result as any).v).toBe('')
  })
  it('the method is sent upper-cased, and credentials are omitted', async () => {
    let init: any
    const real = globalThis.fetch
    globalThis.fetch = (async (_u: string, i: any) => {
      init = i
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
    }) as any
    try {
      const r = await run(
        fetchWith('https://api.github.com/x', `, method: 'patch'`),
        allow
      )
      expect(r.error).toBeUndefined()
      expect(init.method).toBe('PATCH')
      expect(init.credentials).toBe('omit')
      expect(init.redirect).toBe('manual')
    } finally {
      globalThis.fetch = real
    }
  })
})

describe('round 25: highly constrained by default, widened only by the host (Tonio, 2026-10-03)', () => {
  const stub = async (body: () => Promise<void>) => {
    const real = globalThis.fetch
    const calls: any[] = []
    globalThis.fetch = (async (u: string, i: any) => {
      calls.push({ u, i })
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
    }) as any
    try {
      await body()
    } finally {
      globalThis.fetch = real
    }
    return calls
  }

  it('the default methods are GET and HEAD; POST needs the host to enable it', async () => {
    const ctx = { context: { allowedFetchDomains: ['api.github.com'] } }
    const r = await run(
      fetchWith('https://api.github.com/x', `, method: 'POST', body: { a: 1 }`),
      ctx
    )
    expect(r.error?.message ?? 'admitted').toMatch(
      /method 'POST' is not allowed/
    )
    const calls = await stub(async () => {
      const ok = await run(
        fetchWith(
          'https://api.github.com/x',
          `, method: 'POST', body: { a: 1 }`
        ),
        {
          context: { ...ctx.context, allowedFetchMethods: ['post'] },
        }
      )
      expect(ok.error).toBeUndefined()
    })
    expect(calls[0].i.method).toBe('POST')
  })

  it('CONNECT/TRACE are refused even if a host lists them', async () => {
    for (const m of ['CONNECT', 'TRACE', 'TRACK']) {
      const r = await run(
        fetchWith('https://api.github.com/x', `, method: '${m}'`),
        {
          context: {
            allowedFetchDomains: ['api.github.com'],
            allowedFetchMethods: [m],
          },
        }
      )
      expect(r.error?.message ?? 'admitted').toMatch(/not allowed/)
    }
  })

  it('a host-declared header name matches case-insensitively', async () => {
    await stub(async () => {
      const r = await run(
        fetchWith(
          'https://api.github.com/x',
          `, headers: { 'X-CUSTOM-thing': 'v' }`
        ),
        {
          context: {
            allowedFetchDomains: ['api.github.com'],
            allowedRequestHeaders: ['x-Custom-THING'],
          },
        }
      )
      expect(r.error).toBeUndefined()
    })
  })

  it('an allowlist entry admits the default port only, unless it names one', async () => {
    const ctx = (domains: string[]) => ({
      context: { allowedFetchDomains: domains },
    })
    for (const [url, domains, ok] of [
      ['https://api.github.com/x', ['api.github.com'], true],
      ['https://api.github.com:6379/x', ['api.github.com'], false],
      ['https://api.github.com:8443/x', ['api.github.com:8443'], true],
      ['https://api.github.com/x', ['api.github.com:443'], true],
      ['https://api.github.com:8443/x', ['api.github.com:9000'], false],
      ['https://x.github.com:6379/x', ['*.github.com'], false],
    ] as const) {
      await stub(async () => {
        const r = await run(fetchWith(url, ''), ctx([...domains]))
        expect({ url, domains, ok: !r.error }).toEqual({ url, domains, ok })
      })
    }
  })

  it('redirect = 301/302/303/307/308 WITH a Location (both conditions pinned)', async () => {
    const real = globalThis.fetch
    const respond = (status: number, location?: string) =>
      (globalThis.fetch = (async () =>
        new Response(status === 304 ? null : 'body', {
          status,
          headers: location
            ? { location, 'content-type': 'text/plain' }
            : { 'content-type': 'text/plain' },
        })) as any)
    try {
      respond(301) // no Location: an ordinary response
      let r = await run(fetchSrc('https://api.github.com/x'), {
        context: { allowedFetchDomains: ['api.github.com'] },
      })
      expect((r.result as any).v).toBe('body')
      respond(300, '/elsewhere') // a Location on a non-redirect status: an ordinary response
      r = await run(fetchSrc('https://api.github.com/x'), {
        context: { allowedFetchDomains: ['api.github.com'] },
      })
      expect((r.result as any).v).toBe('body')
    } finally {
      globalThis.fetch = real
    }
  })
})

describe('round 26: the whole request SHAPE is admitted on every path; the destination when set', () => {
  const spy = () => {
    const calls: any[] = []
    return {
      calls,
      caps: {
        fetch: async (url: string, init: any) => {
          calls.push({ url, init })
          return 'host-ok'
        },
      },
    }
  }

  it('host path: a method alone is refused (no other reason to refuse)', async () => {
    const { calls, caps } = spy()
    const r = await run(fetchWith('https://x.test/', `, method: 'DELETE'`), {
      capabilities: caps,
    })
    expect(r.error?.message ?? 'admitted').toMatch(
      /method 'DELETE' is not allowed/
    )
    expect(calls.length).toBe(0)
  })

  it('host path: a header alone is refused (GET, so the method passes)', async () => {
    const { calls, caps } = spy()
    const r = await run(
      fetchWith('https://x.test/', `, headers: { Cookie: 'c=1' }`),
      { capabilities: caps }
    )
    expect(r.error?.message ?? 'admitted').toMatch(
      /'Cookie' header cannot be set by an agent/
    )
    expect(calls.length).toBe(0)
  })

  for (const url of [
    'file://api.example.com/etc/hosts',
    'ftp://api.example.com/x',
    'data:text/plain,x',
  ])
    it(`host path: refused before the host fetch is called: ${url}`, async () => {
      const { calls, caps } = spy()
      const r = await run(fetchSrc(url), { capabilities: caps })
      expect(r.error?.message ?? 'admitted').toMatch(
        /http: or https:|Invalid URL/
      )
      expect(calls.length).toBe(0)
    })

  it('host path: a configured domain allowlist applies; without one, the host owns the destination', async () => {
    const a = spy()
    const refused = await run(fetchSrc('https://b.test/'), {
      capabilities: a.caps,
      context: { allowedFetchDomains: ['a.test'] },
    })
    expect(refused.error?.message ?? 'admitted').toMatch(/not in allowlist/)
    expect(a.calls.length).toBe(0)
    const b = spy()
    const owned = await run(fetchSrc('https://b.test/'), {
      capabilities: b.caps,
    })
    expect(owned.error).toBeUndefined()
    expect(b.calls.length).toBe(1)
  })
})

describe('Eval/SafeFunction: a host-only fetchPolicy (re-review 6 M2)', () => {
  it('Eval: POST is refused until fetchPolicy.methods allows it; the policy is not a guest variable', async () => {
    const calls: any[] = []
    const capabilities = {
      fetch: async (url: string, init: any) => {
        calls.push(init)
        return 'ok'
      },
    }
    const code =
      "return httpFetch({ url: 'https://x.test/', method: 'POST', body: { a: 1 } })"
    const denied = await Eval({ code, capabilities })
    expect(denied.error?.message ?? 'admitted').toMatch(/fetchPolicy\.methods/)
    expect(calls.length).toBe(0)
    const ok = await Eval({
      code,
      capabilities,
      fetchPolicy: { methods: ['POST'] },
    })
    expect(ok.error).toBeUndefined()
    expect(calls[0].method).toBe('POST')
    const hidden = await Eval({
      code: 'return typeof fetchPolicy',
      fetchPolicy: { methods: ['POST'] },
    })
    expect(hidden.result).not.toBe('object')
  })

  it('SafeFunction: fetchPolicy.domains binds a host fetch', async () => {
    const calls: any[] = []
    const fn = await SafeFunction({
      body: "return httpFetch({ url: 'https://b.test/' })",
      capabilities: {
        fetch: async (url: string) => {
          calls.push(url)
          return 'ok'
        },
      },
      fetchPolicy: { domains: ['a.test'] },
    })
    const r = await fn()
    expect(r.error?.message ?? 'admitted').toMatch(/not in allowlist/)
    expect(calls.length).toBe(0)
  })
})

describe('relative URLs belong to a host fetch, never to the built-in client', () => {
  const capture = () => {
    const urls: string[] = []
    return { urls, caps: { fetch: async (u: string) => (urls.push(u), 'ok') } }
  }
  it('a path-relative URL reaches a host fetch, which resolves it against its own origin', async () => {
    const { urls, caps } = capture()
    const r = await run(fetchSrc('/texts/coffee.txt'), { capabilities: caps })
    expect(r.error).toBeUndefined()
    expect(urls).toEqual(['/texts/coffee.txt'])
  })
  it('a protocol-relative URL names a host, so a configured allowlist binds it', async () => {
    const { urls, caps } = capture()
    const r = await run(fetchSrc('//evil.example/x'), {
      capabilities: caps,
      context: { allowedFetchDomains: ['a.test'] },
    })
    expect(r.error?.message ?? 'admitted').toMatch(/not in allowlist/)
    expect(urls.length).toBe(0)
  })
  it('the built-in client refuses a relative URL', async () => {
    const r = await run(fetchSrc('/texts/coffee.txt'), allow)
    expect(r.error?.message ?? 'admitted').toMatch(/Invalid URL/)
  })
})

describe('cumulative review B1: a relative URL cannot pass a configured allowlist', () => {
  const capture = () => {
    const urls: string[] = []
    return { urls, caps: { fetch: async (u: string) => (urls.push(u), 'ok') } }
  }
  const RELATIVE = [
    '/admin/secrets',
    'admin',
    '?x=1',
    '../x',
    '#frag',
    '%2F%2Fevil.com/x',
    '/%5Cevil.com',
  ]
  for (const rel of RELATIVE)
    it(`vm.run allowedFetchDomains: refused ${rel}`, async () => {
      const { urls, caps } = capture()
      const r = await run(fetchSrc(rel), {
        capabilities: caps,
        context: { allowedFetchDomains: ['a.test'] },
      })
      expect(r.error?.message ?? 'admitted').toMatch(
        /relative, and an allowlist needs an absolute URL/
      )
      expect(urls.length).toBe(0)
    })
  it('Eval fetchPolicy.domains: refused', async () => {
    const { urls, caps } = capture()
    const r = await Eval({
      code: "return httpFetch({ url: '/admin/secrets' })",
      capabilities: caps,
      fetchPolicy: { domains: ['api.example.com'] },
    })
    expect(r.error?.message ?? 'admitted').toMatch(/relative/)
    expect(urls.length).toBe(0)
  })
  it('SafeFunction fetchPolicy.domains: refused', async () => {
    const { urls, caps } = capture()
    const fn = await SafeFunction({
      body: "return httpFetch({ url: '/admin/secrets' })",
      capabilities: caps,
      fetchPolicy: { domains: ['api.example.com'] },
    })
    const r = await fn()
    expect(r.error?.message ?? 'admitted').toMatch(/relative/)
    expect(urls.length).toBe(0)
  })
})
