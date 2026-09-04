/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/index'

describe('Cost Overrides', () => {
  it('should use default costs when no overrides provided', async () => {
    const vm = new AgentVM()
    const ast = vm.Agent.varSet({ key: 'x', value: 1 })
      .varSet({ key: 'y', value: 2 })
      .return({ properties: { x: {}, y: {} } })
      .toJSON()
    const result = await vm.run(ast, {}, { fuel: 1000 })

    expect(result.fuelUsed).toBeCloseTo(0.4, 1)
  })
  it('should apply static cost overrides', async () => {
    const vm = new AgentVM()
    const ast = vm.Agent.varSet({ key: 'x', value: 1 })
      .varSet({ key: 'y', value: 2 })
      .return({ properties: { x: {}, y: {} } })
      .toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 1000,
        costOverrides: {
          varSet: 10,
        },
      }
    )

    expect(result.fuelUsed).toBeCloseTo(20.2, 1)
  })
  it('should apply dynamic cost overrides', async () => {
    const vm = new AgentVM()
    const ast = vm.Agent.varSet({ key: 'small', value: 'hi' })
      .varSet({ key: 'large', value: 'hello world this is a long string' })
      .return({ properties: { small: {}, large: {} } })
      .toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 1000,
        costOverrides: {
          varSet: (input) => {
            const value = input.value
            if (typeof value === 'string') {
              return value.length * 0.1
            }
            return 1
          },
        },
      }
    )

    expect(result.fuelUsed).toBeGreaterThan(3.5)
    expect(result.fuelUsed).toBeLessThan(4.0)
  })
  it('should cause early fuel exhaustion with high cost overrides', async () => {
    const vm = new AgentVM()
    const ast = vm.Agent.httpFetch({ url: 'https://example.com' })
      .as('response')
      .return({ properties: { response: {} } })
      .toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 50,
        costOverrides: {
          httpFetch: 100,
        },
        capabilities: {
          fetch: async () => ({ ok: true }),
        },
      }
    )
    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Fuel')
  })
  it('should allow making expensive atoms cheap', async () => {
    const vm = new AgentVM()
    const ast = vm.Agent.httpFetch({ url: 'https://example.com' })
      .as('response')
      .return({ properties: { response: {} } })
      .toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 10,
        costOverrides: {
          httpFetch: 0.1,
        },
        capabilities: {
          fetch: async () => ({ ok: true }),
        },
      }
    )
    expect(result.error).toBeUndefined()

    expect(result.fuelUsed).toBeCloseTo(0.3, 1)
  })
  it('should only override specified atoms', async () => {
    const vm = new AgentVM()
    const ast = vm.Agent.varSet({ key: 'x', value: 1 })
      .storeGet({ key: 'test' })
      .as('data')
      .return({ properties: { x: {}, data: {} } })
      .toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 1000,
        costOverrides: {
          storeGet: 100,
        },
      }
    )

    expect(result.fuelUsed).toBeCloseTo(100.3, 1)
  })
})
