/**
 * An allowlist entry alone does not open the private network (#3991, decided 2026-11-11).
 *
 * The private-range block applied only when NO allowlist was set, and then nothing was fetchable
 * anyway: an allowlist was the whole policy, so `allowedFetchDomains: ['127.0.0.1:8080']` (a
 * typo, a config copied from a dev setup) reached loopback. Now loopback, private and link-local
 * destinations are refused even when an allowlist names them, unless the host opts in with
 * `allowPrivateNetwork: true` (`fetchPolicy.privateNetwork` for Eval and SafeFunction). It holds on
 * both paths an allowlist governs: the built-in client and a host's own fetch.
 *
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'
import { admitFetchUrl } from './runtime'
import { Eval } from '../lang/eval'

let server: ReturnType<typeof Bun.serve>
let host = ''
beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.json({ local: true }),
  })
  host = `127.0.0.1:${server.port}`
})
afterAll(() => server.stop(true))

const AGENT = transpile(`function f({ url = '' }) {
  const r = httpFetch({ url })
  return { r }
}`).ast

const run = (context: Record<string, unknown>, capabilities = {}) =>
  new AgentVM().run(
    AGENT,
    { url: `http://${host}/` },
    { fuel: 500, context, capabilities }
  )

describe('the private network needs its own opt-in', () => {
  it('an allowlisted loopback address is refused by default', async () => {
    const r = await run({ allowedFetchDomains: [host] })
    expect(String(r.error?.message)).toMatch(/allowPrivateNetwork/)
  })

  it('allowPrivateNetwork: true opens it', async () => {
    const r = await run({
      allowedFetchDomains: [host],
      allowPrivateNetwork: true,
    })
    expect(r.error).toBeUndefined()
    expect(JSON.stringify(r.result)).toContain('local')
  })

  it("a host's own fetch is held to the same rule when an allowlist is set", async () => {
    let called = false
    const fetch = async () => {
      called = true
      return { ok: true, status: 200, body: 'host' }
    }
    const r = await run({ allowedFetchDomains: [host] }, { fetch })
    expect(called).toBe(false)
    expect(String(r.error?.message)).toMatch(/allowPrivateNetwork/)
  })

  it('a public allowlisted host is unaffected', () => {
    expect(
      admitFetchUrl('https://api.example.com/x', ['api.example.com'])
    ).toBe('https://api.example.com/x')
  })

  it('anything but a literal true is not an opt-in', async () => {
    const r = await run({
      allowedFetchDomains: [host],
      allowPrivateNetwork: 'yes',
    })
    expect(r.error).toBeDefined()
  })

  it("Eval's fetchPolicy.privateNetwork carries the opt-in", async () => {
    const code = `return httpFetch({ url: 'http://${host}/' })`
    const closed = await Eval({ code, fetchPolicy: { domains: [host] } })
    expect(String(closed.error?.message)).toMatch(/allowPrivateNetwork/)
    const open = await Eval({
      code,
      fetchPolicy: { domains: [host], privateNetwork: true },
    })
    expect(open.error).toBeUndefined()
  })
})

/**
 * Loopback and internal names in the forms the gate missed (0.14.0 final review): a trailing dot
 * is the same host as a fully qualified name, and WHATWG URL keeps it, so `localhost.` and
 * `metadata.google.internal.` matched neither the blocked set nor the suffixes; and every name
 * under `localhost` is loopback (RFC 6761).
 */
describe('loopback and internal names in every spelling', () => {
  const hosts = [
    'localhost.',
    'foo.localhost',
    'foo.localhost.',
    'metadata.google.internal.',
    'db.internal.',
    'printer.local.',
  ]
  for (const h of hosts) {
    it(`${h} is refused even when allowlisted`, () => {
      expect(() => admitFetchUrl(`http://${h}/x`, [h])).toThrow(
        /loopback or private address/
      )
    })
    it(`${h} is admitted with the explicit opt-in`, () => {
      expect(admitFetchUrl(`http://${h}/x`, [h], true, true)).toContain(h)
    })
  }
  it('127.0.0.1. is refused (URL normalises it to 127.0.0.1, which no dotted entry names)', () => {
    expect(() => admitFetchUrl('http://127.0.0.1./x', ['127.0.0.1.'])).toThrow()
    expect(() => admitFetchUrl('http://127.0.0.1./x', ['127.0.0.1'])).toThrow(
      /loopback or private address/
    )
  })
  it('a public name with a trailing dot is unaffected (the other direction)', () => {
    expect(
      admitFetchUrl('https://api.example.com./x', ['api.example.com.'])
    ).toBe('https://api.example.com./x')
  })
})
