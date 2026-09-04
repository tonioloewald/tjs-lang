/* tjs <- input.ts */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { AgentVM, ajs, coreAtoms } from '/Users/tonioloewald/tjs-lang/src/index'

const AGENT_DEPTH_HEADER = 'X-Agent-Depth'

const TEST_PORT = 9876

let requestLog = []

/* line 20 */
/* TODO: TS types degraded — return: Server */
function createAgentServer() {
  const vm = new AgentVM(coreAtoms)
  return Bun.serve({
    port: TEST_PORT,
    async fetch(req) {
      const url = new URL(req.url)
      const depth = parseInt(req.headers.get(AGENT_DEPTH_HEADER) || '0', 10)

      let body = undefined
      if (req.method === 'POST') {
        try {
          body = await req.json()
        } catch {}
      }
      requestLog.push({ path: url.pathname, depth, body })

      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', depth }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.pathname === '/echo') {
        return new Response(
          JSON.stringify({
            depth,
            timestamp: Date.now(),
            body,
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (url.pathname === '/run-agent') {
        const { code, args = {} } = body || {}
        if (!code) {
          return new Response(JSON.stringify({ error: 'No code provided' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        try {
          const ast = ajs(code)
          const result = await vm.run(ast, args, {
            fuel: 1000,
            context: {
              requestDepth: depth,
              allowedFetchDomains: ['localhost', '127.0.0.1'],
            },
            capabilities: {},
          })
          return new Response(
            JSON.stringify({
              result: result.result,
              error: result.error?.message,
              fuelUsed: result.fuelUsed,
              depth,
            }),
            {
              headers: { 'Content-Type': 'application/json' },
            }
          )
        } catch (e) {
          return new Response(
            JSON.stringify({
              error: e.message,
              depth,
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
      }
      return new Response('Not found', { status: 404 })
    },
  })
}
createAgentServer.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:15',
}

describe('Recursive Fetch Protection', () => {
  let server
  beforeAll(() => {
    server = createAgentServer()
    requestLog = []
  })
  afterAll(() => {
    server.stop()
  })
  it('should track depth header through requests', async () => {
    requestLog = []

    const res1 = await fetch(`http://localhost:${TEST_PORT}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 1 }),
    })
    const data1 = await res1.json()
    expect(data1.depth).toBe(0)

    const res2 = await fetch(`http://localhost:${TEST_PORT}/echo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [AGENT_DEPTH_HEADER]: '5',
      },
      body: JSON.stringify({ test: 2 }),
    })
    const data2 = await res2.json()
    expect(data2.depth).toBe(5)
  })
  it('should run a simple agent', async () => {
    requestLog = []
    const code = `
      function add(a: 1, b: 2) {
        let sum = a + b
        return { sum }
      }
    `
    const res = await fetch(`http://localhost:${TEST_PORT}/run-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, args: { a: 10, b: 20 } }),
    })
    const data = await res.json()
    expect(data.result.sum).toBe(30)
    expect(data.depth).toBe(0)
  })
  it('should allow agent to fetch external URLs in allowlist', async () => {
    requestLog = []
    const code = `
      function fetchHealth() {
        let response = httpFetch({ url: 'http://localhost:${TEST_PORT}/health' })
        return { health: response }
      }
    `
    const res = await fetch(`http://localhost:${TEST_PORT}/run-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    expect(data.result.health.status).toBe('ok')

    expect(data.result.health.depth).toBe(1)
  })
  it('should increment depth when agent calls another agent', async () => {
    requestLog = []

    const code = `
      function callEcho() {
        let response = httpFetch({ 
          url: 'http://localhost:${TEST_PORT}/echo',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { from: 'agent' }
        })
        return { echoDepth: response.depth }
      }
    `

    const res = await fetch(`http://localhost:${TEST_PORT}/run-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [AGENT_DEPTH_HEADER]: '3',
      },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()

    expect(data.result.echoDepth).toBe(4)
  })
  it('should block recursive agent calls at max depth', async () => {
    requestLog = []

    const recursiveCode = `
      function recurse(n: 0) {
        if (n <= 0) {
          return { done: true, n }
        }
        let response = httpFetch({
          url: 'http://localhost:${TEST_PORT}/run-agent',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { 
            code: 'function inner() { return { inner: true } }',
            args: {}
          }
        })
        return { response, n }
      }
    `

    const res = await fetch(`http://localhost:${TEST_PORT}/run-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [AGENT_DEPTH_HEADER]: '10',
      },
      body: JSON.stringify({ code: recursiveCode, args: { n: 5 } }),
    })
    const data = await res.json()

    expect(data.error).toMatch(/depth exceeded/i)
  })
  it('should propagate context through agent chain', async () => {
    requestLog = []
    const code = `
      function checkContext() {
        let response = httpFetch({ url: 'http://localhost:${TEST_PORT}/echo' })
        return { 
          receivedDepth: response.depth
        }
      }
    `

    const res = await fetch(`http://localhost:${TEST_PORT}/run-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [AGENT_DEPTH_HEADER]: '2',
      },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    expect(data.depth).toBe(2)
    expect(data.result.receivedDepth).toBe(3)
  })
})

describe('Fetch Domain Allowlist', () => {
  let server
  beforeAll(() => {
    server = createAgentServer()
    requestLog = []
  })
  afterAll(() => {
    server.stop()
  })
  it('should block fetch to non-allowed domains when using default fetch', async () => {
    const vm = new AgentVM(coreAtoms)
    const ast = ajs(`
      function fetchExternal() {
        let response = httpFetch({ url: 'https://example.com/api' })
        return { response }
      }
    `)

    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100,
        context: {},
      }
    )
    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('allowedFetchDomains')
  })
  it('should allow fetch to domains in allowlist', async () => {
    const vm = new AgentVM(coreAtoms)
    const ast = ajs(`
      function fetchLocal() {
        let response = httpFetch({ url: 'http://localhost:${TEST_PORT}/health' })
        return { response }
      }
    `)
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100,
        context: {
          allowedFetchDomains: ['localhost'],
        },
      }
    )
    expect(result.error).toBeUndefined()
    expect(result.result.response.status).toBe('ok')
  })
  it('should support wildcard domains in allowlist', async () => {
    const vm = new AgentVM(coreAtoms)

    const ast = ajs(`
      function testWildcard() {
        return { tested: true }
      }
    `)
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100,
        context: {
          allowedFetchDomains: ['*.example.com', 'localhost'],
        },
      }
    )

    expect(result.error).toBeUndefined()
  })
})
