/* tjs <- input.ts */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { s } from 'tosijs-schema'

describe('Use Case: Client-Server', () => {
  const VM = new AgentVM()
  let server
  let URL = ''
  beforeAll(() => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        if (req.method === 'POST') {
          try {
            const body = await req.json()
            const { ast, args } = body

            const capabilities = {
              store: {
                get: async (key) => `Server Value for ${key}`,
                set: async () => {},
              },
            }
            const result = await VM.run(ast, args, { capabilities })
            return new Response(JSON.stringify(result), {
              headers: { 'Content-Type': 'application/json' },
            })
          } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
              status: 500,
            })
          }
        }
        return new Response(`Not Found: ${req.method} ${req.url}`, {
          status: 404,
        })
      },
    })
    URL = `http://127.0.0.1:${server.port}/`
  })
  it('should execute an agent sent over HTTP', async () => {
    const logic = Agent.take(s.object({ key: s.string }))
      .storeGet({ key: Agent.args('key') })
      .as('val')
      .varSet({ key: 'valUpper', value: 'val' })

      .template({ tmpl: 'Echo: {{val}}', vars: { val: 'val' } })
      .as('response')
      .return(s.object({ response: s.string }))

    const response = await fetch(URL, {
      method: 'POST',
      body: JSON.stringify({
        ast: logic.toJSON(),
        args: { key: 'secret_id' },
      }),
    })
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch (e) {
      console.error('Failed to parse JSON:', text)
      console.error('Failed request status:', response.status)
      throw e
    }

    expect(response.status).toBe(200)
    expect(data.result).toEqual({
      response: 'Echo: Server Value for secret_id',
    })
    expect(data.fuelUsed).toBeGreaterThan(0)
  })
  it('should handle concurrent requests', async () => {
    const concurrency = 50
    const requests = Array.from({ length: concurrency }, (_, i) => ({
      key: `req_${i}`,
      expected: `Echo: Server Value for req_${i}`,
    }))
    const logic = Agent.take(s.object({ key: s.string }))
      .storeGet({ key: Agent.args('key') })
      .as('val')
      .template({ tmpl: 'Echo: {{val}}', vars: { val: 'val' } })
      .as('response')
      .return(s.object({ response: s.string }))
    const ast = logic.toJSON()
    const results = await Promise.all(
      requests.map(async (req) => {
        const response = await fetch(URL, {
          method: 'POST',
          body: JSON.stringify({
            ast,
            args: { key: req.key },
          }),
        })
        const text = await response.text()
        let data
        try {
          data = JSON.parse(text)
        } catch {
          console.error('Failed to parse concurrent response:', text)
          return { status: 500, result: text }
        }
        return {
          status: response.status,
          result: data.result?.response,
        }
      })
    )
    results.forEach((res, i) => {
      expect(res.status).toBe(200)
      expect(res.result).toBe(requests[i].expected)
    })
  })
  afterAll(() => {
    if (server) server.stop()
  })
})
