/**
 * httpFetch's explicit `responseType` wins over the content type (#4104): `'text'` used to parse
 * an `application/json` body anyway. Rows run transpile() output against a local server.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'

let server: ReturnType<typeof Bun.serve>
let url = ''
beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.json({ a: 1 }),
  })
  url = `http://127.0.0.1:${server.port}/`
})
afterAll(() => server.stop(true))

const run = (responseType?: string) =>
  new AgentVM().run(
    transpile(
      responseType
        ? `function f({ url = '' }) { let r = httpFetch({ url, responseType: '${responseType}' })\n return { kind: typeof r } }`
        : `function f({ url = '' }) { let r = httpFetch({ url })\n return { kind: typeof r } }`
    ).ast,
    { url },
    {
      fuel: 500,
      context: {
        allowedFetchDomains: [new URL(url).host],
        allowPrivateNetwork: true,
      },
    }
  )

describe('responseType', () => {
  it("'text' returns the body as text, even for JSON", async () => {
    expect((await run('text')).result).toEqual({ kind: 'string' })
  })
  it('no responseType: a JSON content type is parsed (unchanged)', async () => {
    expect((await run()).result).toEqual({ kind: 'object' })
  })
})
