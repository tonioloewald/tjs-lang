import { describe, it, expect } from 'vitest'
import { AgentVM, isAgentError, defineAtom } from '../index'
import { s } from 'tosijs-schema'

// Define a slow atom that takes time but uses minimal fuel
const delayAtom = defineAtom(
  'delay',
  s.object({ ms: s.number }),
  undefined,
  async ({ ms }) => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  },
  { docs: 'Delay for testing', cost: 0.01 }
)

describe('Execution Timeout', () => {
  it('should timeout a slow loop with IO delays', async () => {
    const vm = new AgentVM({ delay: delayAtom })

    // Loop with delays - each iteration takes 20ms but minimal fuel
    const ast = vm.Agent.varSet({ key: 'x', value: 0 })
      .while('x < 100', {}, (b) =>
        b
          .step({ op: 'delay', ms: 20 }) // 20ms delay per iteration
          .varSet({
            key: 'x',
            value: {
              $expr: 'binary',
              op: '+',
              left: { $expr: 'ident', name: 'x' },
              right: { $expr: 'literal', value: 1 },
            },
          })
      )
      .toJSON()

    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100000, // Very high fuel
        timeoutMs: 50, // Short timeout - will trigger before loop completes
      }
    )

    expect(result.error).toBeDefined()
    expect(isAgentError(result.error)).toBe(true)
    expect(result.error?.message).toContain('timeout')
  })

  it('should timeout a slow map operation', async () => {
    const vm = new AgentVM()

    // Create a delay capability
    const slowCapabilities = {
      store: {
        get: async (key: string) => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return key
        },
        set: async () => {
          /* no-op */
        },
      },
    }

    const ast = vm.Agent.varSet({ key: 'items', value: [1, 2, 3, 4, 5] })
      .map('items', 'item', (b) => b.storeGet({ key: 'item' }).as('result'))
      .as('results')
      .toJSON()

    const result = await vm.run(
      ast,
      {},
      {
        fuel: 1000,
        timeoutMs: 150, // Should timeout before all items processed
        capabilities: slowCapabilities,
      }
    )

    expect(result.error).toBeDefined()
    expect(isAgentError(result.error)).toBe(true)
    expect(result.error?.message).toContain('timeout')
  })

  it('should complete fast operations within timeout', async () => {
    const vm = new AgentVM()

    const ast = vm.Agent.varSet({ key: 'x', value: 10 })
      .while('x > 0', {}, (b) =>
        b.varSet({
          key: 'x',
          value: {
            $expr: 'binary',
            op: '-',
            left: { $expr: 'ident', name: 'x' },
            right: { $expr: 'literal', value: 1 },
          },
        })
      )
      .return({ properties: { x: {} } })
      .toJSON()

    const result = await vm.run(
      ast,
      {},
      {
        fuel: 1000,
        timeoutMs: 5000, // Generous timeout
      }
    )

    expect(result.error).toBeUndefined()
    expect(result.result).toEqual({ x: 0 })
  })

  it('should respect external abort signal', async () => {
    const vm = new AgentVM({ delay: delayAtom })

    const controller = new AbortController()

    // Abort after 30ms
    setTimeout(() => controller.abort(), 30)

    // Loop with delays
    const ast = vm.Agent.varSet({ key: 'x', value: 0 })
      .while('x < 100', {}, (b) =>
        b.step({ op: 'delay', ms: 20 }).varSet({
          key: 'x',
          value: {
            $expr: 'binary',
            op: '+',
            left: { $expr: 'ident', name: 'x' },
            right: { $expr: 'literal', value: 1 },
          },
        })
      )
      .toJSON()

    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100000, // Very high fuel
        timeoutMs: 60000, // Very long internal timeout (1 minute)
        signal: controller.signal, // External signal aborts at 30ms
      }
    )

    expect(result.error).toBeDefined()
    expect(isAgentError(result.error)).toBe(true)
    expect(result.error?.message).toContain('timeout')
  })

  it('should run out of fuel before timeout for compute-bound work', async () => {
    const vm = new AgentVM()

    // With low fuel, fuel exhaustion is the backstop
    const ast = vm.Agent.varSet({ key: 'x', value: 0 })
      .while('x >= 0', {}, (b) =>
        b.varSet({
          key: 'x',
          value: {
            $expr: 'binary',
            op: '+',
            left: { $expr: 'ident', name: 'x' },
            right: { $expr: 'literal', value: 1 },
          },
        })
      )
      .toJSON()

    const result = await vm.run(ast, {}, { fuel: 10 }) // Low fuel

    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('Fuel')
  })

  it('should timeout slow IO even with high fuel', async () => {
    const vm = new AgentVM()

    // Slow capability that takes 200ms per call
    const slowCapabilities = {
      store: {
        get: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return 'value'
        },
        set: async () => {
          /* no-op */
        },
      },
    }

    const ast = vm.Agent.storeGet({ key: 'slow' }).as('result').toJSON()

    const result = await vm.run(
      ast,
      {},
      {
        fuel: 10000, // Very high fuel
        timeoutMs: 50, // Short timeout
        capabilities: slowCapabilities,
      }
    )

    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('timeout')
  })
})
