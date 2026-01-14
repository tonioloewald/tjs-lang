import { describe, it, expect, mock } from 'bun:test'
import { AgentVM } from '../vm'
import { ajs } from '../transpiler'
import { Agent } from '../builder'
import { s } from 'tosijs-schema'

describe('Allocation Fuel Charging', () => {
  const vm = new AgentVM()

  it('should charge fuel proportional to string concatenation size', async () => {
    const ast = ajs`
      function stringConcat() {
        let str = 'x'.repeat(10000)
        return { length: str.length }
      }
    `

    // With limited fuel, large string should exhaust it
    const result = await vm.run(ast, {}, { fuel: 0.5 })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Out of Fuel')
  })

  it('should charge fuel proportional to array allocation size', async () => {
    const ast = ajs`
      function arrayAlloc() {
        let arr = [1, 2, 3]
        let big = arr.concat([4, 5, 6, 7, 8, 9, 10]) // 10 elements
        big = big.concat(big) // 20 elements
        big = big.concat(big) // 40 elements
        big = big.concat(big) // 80 elements
        return { length: big.length }
      }
    `

    // Verify it completes with enough fuel
    const result = await vm.run(ast, {}, { fuel: 100 })
    expect(result.error).toBeUndefined()
    expect(result.result.length).toBe(80)
  })

  it('should exhaust fuel on massive string repeat', async () => {
    const ast = ajs`
      function massiveString() {
        let str = 'x'.repeat(1000000) // 1 million chars
        return { length: str.length }
      }
    `

    // 1M chars * 0.0001 = 100 fuel, so 50 should fail
    const result = await vm.run(ast, {}, { fuel: 50 })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Out of Fuel')
    expect(result.error?.op).toBe('expr.repeat')
  })

  it('should charge fuel for JSON.parse based on result size', async () => {
    const ast = ajs`
      function parseJson() {
        let json = '{"a":1,"b":2,"c":3,"d":4,"e":5}'
        let obj = JSON.parse(json)
        return { keys: Object.keys(obj).length }
      }
    `

    const result = await vm.run(ast, {}, { fuel: 100 })
    expect(result.error).toBeUndefined()
    expect(result.result.keys).toBe(5)
  })
})

describe('Memory Pressure', () => {
  const vm = new AgentVM()

  it('should handle agents that accumulate large arrays', async () => {
    const ast = ajs`
      function bigArray() {
        let arr = []
        let i = 0
        while (i < 1000) {
          arr = arr.concat([{ index: i, payload: 'data-' + i }])
          i = i + 1
        }
        return { count: arr.length }
      }
    `

    const result = await vm.run(ast, {}, { fuel: 50000 })

    // Should complete successfully
    expect(result.error).toBeUndefined()
    expect(result.result.count).toBe(1000)
  })

  it('should handle deeply nested object structures', async () => {
    const ast = ajs`
      function deepNesting() {
        let obj = { value: 'leaf' }
        let i = 0
        while (i < 100) {
          obj = { nested: obj, depth: i }
          i = i + 1
        }
        return { finalDepth: obj.depth }
      }
    `

    const result = await vm.run(ast, {}, { fuel: 5000 })

    expect(result.error).toBeUndefined()
    expect(result.result.finalDepth).toBe(99)
  })

  it('should handle large string concatenation', async () => {
    const ast = ajs`
      function bigString() {
        let str = ''
        let i = 0
        while (i < 500) {
          str = str + 'chunk-' + i + '-'
          i = i + 1
        }
        return { length: str.length }
      }
    `

    const result = await vm.run(ast, {}, { fuel: 10000 })

    expect(result.error).toBeUndefined()
    expect(result.result.length).toBeGreaterThan(1000)
  })

  it('should handle large input arguments without crashing', async () => {
    const ast = ajs`
      function processLargeInput({ data }) {
        let len = data.length
        return { inputLength: len }
      }
    `

    // 1MB string input
    const largeInput = { data: 'x'.repeat(1_000_000) }
    const result = await vm.run(ast, largeInput, { fuel: 100 })

    expect(result.error).toBeUndefined()
    expect(result.result.inputLength).toBe(1_000_000)
  })

  it('should handle many small variables without degradation', async () => {
    const ast = ajs`
      function manyVariables() {
        let v0 = 0, v1 = 1, v2 = 2, v3 = 3, v4 = 4
        let v5 = 5, v6 = 6, v7 = 7, v8 = 8, v9 = 9
        let sum = v0 + v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8 + v9

        let i = 0
        while (i < 100) {
          let temp = sum + i
          sum = temp
          i = i + 1
        }
        return { sum }
      }
    `

    const result = await vm.run(ast, {}, { fuel: 5000 })

    expect(result.error).toBeUndefined()
    // 45 (sum of 0-9) + sum of 0-99 (4950) = 4995
    expect(result.result.sum).toBe(4995)
  })

  it('should exhaust fuel before memory on runaway allocation', async () => {
    const ast = ajs`
      function runawaAllocation() {
        let arr = []
        let i = 0
        while (i < 1000000) {
          arr = [...arr, { big: 'x'.repeat(1000) }]
          i = i + 1
        }
        return { count: arr.length }
      }
    `

    // Limited fuel should stop this before memory issues
    const result = await vm.run(ast, {}, { fuel: 100 })

    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Out of Fuel')
  })
})

describe('Capability Failure Modes', () => {
  it('should handle fetch throwing an error', async () => {
    const vm = new AgentVM()

    const failingFetch = mock(async () => {
      throw new Error('Network unreachable')
    })

    const ast = ajs`
      function fetchData() {
        let response = httpFetch({ url: 'https://example.com/api' })
        return { response }
      }
    `

    const result = await vm.run(
      ast,
      {},
      { capabilities: { fetch: failingFetch } }
    )

    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Network unreachable')
  })

  it('should handle fetch returning non-ok status gracefully', async () => {
    const vm = new AgentVM()

    const notFoundFetch = mock(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Resource not found',
      json: async () => ({ error: 'not found' }),
    }))

    // Agent that checks response status and handles errors
    const ast = ajs`
      function fetchData() {
        let response = httpFetch({ url: 'https://example.com/missing' })
        if (!response.ok) {
          return { error: true, status: response.status }
        }
        return { error: false, data: response }
      }
    `

    const result = await vm.run(
      ast,
      {},
      { capabilities: { fetch: notFoundFetch } }
    )

    // Should complete without VM error - the agent handles the HTTP error
    expect(result.error).toBeUndefined()
    expect(result.result.error).toBe(true)
    expect(result.result.status).toBe(404)
  })

  it('should handle store.get throwing an error', async () => {
    const vm = new AgentVM()

    const failingStore = {
      get: mock(async () => {
        throw new Error('Redis connection lost')
      }),
      set: mock(async () => {}),
    }

    const ast = {
      op: 'seq',
      steps: [
        { op: 'storeGet', key: 'mykey', result: 'data' },
        { op: 'return', schema: {} },
      ],
    } as any

    const result = await vm.run(
      ast,
      {},
      { capabilities: { store: failingStore } }
    )

    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Redis connection lost')
  })

  it('should handle store.set throwing an error', async () => {
    const vm = new AgentVM()

    const failingStore = {
      get: mock(async () => 'value'),
      set: mock(async () => {
        throw new Error('Disk full')
      }),
    }

    const ast = {
      op: 'seq',
      steps: [
        { op: 'storeSet', key: 'mykey', value: 'myvalue' },
        { op: 'return', schema: {} },
      ],
    } as any

    const result = await vm.run(
      ast,
      {},
      { capabilities: { store: failingStore } }
    )

    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Disk full')
  })

  it('should handle fetch timeout via AbortSignal', async () => {
    const vm = new AgentVM()

    const slowFetch = mock(async (url: string, options?: RequestInit) => {
      // Simulate slow network that respects abort signal
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 5000)
        options?.signal?.addEventListener('abort', () => {
          clearTimeout(timeout)
          reject(new Error('Fetch aborted'))
        })
      })
      return { ok: true }
    })

    const ast = ajs`
      function fetchData() {
        let response = httpFetch({ url: 'https://slow.example.com' })
        return { response }
      }
    `

    // Use very short timeout
    const result = await vm.run(
      ast,
      {},
      {
        capabilities: { fetch: slowFetch },
        timeoutMs: 50,
        fuel: 1000,
      }
    )

    expect(result.error).toBeDefined()
    expect(result.error?.message).toMatch(/timeout|aborted/i)
  })

  it('should handle llm.predict throwing an error', async () => {
    const vm = new AgentVM()

    const failingLlm = {
      predict: mock(async () => {
        throw new Error('Rate limit exceeded')
      }),
    }

    const ast = {
      op: 'seq',
      steps: [
        {
          op: 'llmPredict',
          system: 'You are helpful',
          user: 'Hello',
          result: 'response',
        },
        { op: 'return', schema: {} },
      ],
    } as any

    const result = await vm.run(ast, {}, { capabilities: { llm: failingLlm } })

    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Rate limit exceeded')
  })

  it('should handle llm.predict returning malformed response', async () => {
    const vm = new AgentVM()

    const badLlm = {
      predict: mock(async () => {
        // Return something unexpected
        return null
      }),
    }

    const ast = {
      op: 'seq',
      steps: [
        {
          op: 'llmPredict',
          system: 'You are helpful',
          user: 'Hello',
          result: 'response',
        },
        { op: 'return', schema: { type: 'object', properties: { response: {} } } },
      ],
    } as any

    const result = await vm.run(ast, {}, { capabilities: { llm: badLlm } })

    // Should handle gracefully - either error or null result
    // The important thing is it doesn't crash
    expect(result.result?.response === null || result.error).toBeTruthy()
  })

  it('should handle capability returning undefined', async () => {
    const vm = new AgentVM()

    const undefinedStore = {
      get: mock(async () => undefined),
      set: mock(async () => {}),
    }

    const ast = ajs`
      function getData() {
        let data = storeGet({ key: 'nonexistent' })
        let exists = data !== undefined
        return { exists, data }
      }
    `

    const result = await vm.run(
      ast,
      {},
      { capabilities: { store: undefinedStore } }
    )

    expect(result.error).toBeUndefined()
    expect(result.result.exists).toBe(false)
    expect(result.result.data).toBeUndefined()
  })

  it('should handle partial capability objects', async () => {
    const vm = new AgentVM()

    // Only provide get, not set
    const partialStore = {
      get: mock(async () => 'value'),
      // set is missing
    }

    const ast = {
      op: 'seq',
      steps: [
        { op: 'storeSet', key: 'test', value: 'data' },
        { op: 'return', schema: {} },
      ],
    } as any

    const result = await vm.run(
      ast,
      {},
      { capabilities: { store: partialStore as any } }
    )

    // Should error gracefully when capability method is missing
    expect(result.error).toBeDefined()
  })

  it('should recover from errors in try/catch with failing capabilities', async () => {
    const vm = new AgentVM()

    let callCount = 0
    const flakyFetch = mock(async () => {
      callCount++
      if (callCount < 3) {
        throw new Error('Temporary failure')
      }
      return {
        ok: true,
        json: async () => ({ data: 'success' }),
        text: async () => '{"data":"success"}',
      }
    })

    const ast = ajs`
      function retryFetch() {
        let result = null
        let attempts = 0
        let success = false

        while (!success && attempts < 5) {
          try {
            result = httpFetch({ url: 'https://flaky.example.com' })
            success = true
          } catch (e) {
            attempts = attempts + 1
          }
        }

        return { result, attempts, success }
      }
    `

    const result = await vm.run(
      ast,
      {},
      { capabilities: { fetch: flakyFetch }, fuel: 1000 }
    )

    expect(result.error).toBeUndefined()
    expect(result.result.success).toBe(true)
    expect(result.result.attempts).toBe(2) // Failed twice, succeeded on third
  })
})
