/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  AgentVM,
  isAgentError,
  defineAtom,
} from '/Users/tonioloewald/tjs-lang/src/index'

import { s } from 'tosijs-schema'

const slowAtom = defineAtom(
  'slow',
  s.object({ ms: s.number }),
  undefined,
  async ({ ms }) => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  },
  { docs: 'Slow IO atom for testing', cost: 0.01, timeoutMs: 100 }
)

describe('Per-atom Timeout Overrides', () => {
  it('uses the atom default when no override is provided', async () => {
    const vm = new AgentVM({ slow: slowAtom })
    const ast = vm.Agent.step({ op: 'slow', ms: 200 }).toJSON()
    const result = await vm.run(ast, {}, { fuel: 100 })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain("Atom 'slow' timed out")
  })
  it('static override raises an atom timeout above its default', async () => {
    const vm = new AgentVM({ slow: slowAtom })
    const ast = vm.Agent.step({ op: 'slow', ms: 200 }).toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100,
        timeoutOverrides: { slow: 5000 },
      }
    )
    expect(result.error).toBeUndefined()
  })
  it('static override lowers an atom timeout below its default', async () => {
    const vm = new AgentVM({ slow: slowAtom })
    const ast = vm.Agent.step({ op: 'slow', ms: 100 }).toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100,
        timeoutOverrides: { slow: 10 },
      }
    )
    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain("Atom 'slow' timed out")
  })
  it('dynamic override receives input and ctx', async () => {
    const vm = new AgentVM({ slow: slowAtom })
    const ast = vm.Agent.step({ op: 'slow', ms: 200 }).toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100,
        timeoutOverrides: {
          slow: (input) => input.ms * 10,
        },
      }
    )
    expect(result.error).toBeUndefined()
  })
  it('override of 0 disables the per-atom timeout', async () => {
    const vm = new AgentVM({ slow: slowAtom })

    const ast = vm.Agent.step({ op: 'slow', ms: 300 }).toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100,
        timeoutOverrides: { slow: 0 },
      }
    )
    expect(result.error).toBeUndefined()
  })
  it('atom timeout still fires when no override matches that op', async () => {
    const vm = new AgentVM({ slow: slowAtom })
    const ast = vm.Agent.step({ op: 'slow', ms: 200 }).toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100,
        timeoutOverrides: { somethingElse: 5000 },
      }
    )
    expect(result.error).toBeDefined()
    expect(isAgentError(result.error)).toBe(true)
  })
})

describe('Default vm.run timeout', () => {
  it('does not derive run timeout from fuel (formula removed)', async () => {
    const vm = new AgentVM({ slow: slowAtom })
    const ast = vm.Agent.step({ op: 'slow', ms: 200 }).toJSON()
    const result = await vm.run(
      ast,
      {},
      {
        fuel: 1000,
        timeoutOverrides: { slow: 0 },
      }
    )
    expect(result.error).toBeUndefined()
  })
  it('derives the default from the slowest atom × 2 (never below the slowest atom budget)', () => {
    const core = new AgentVM()
    expect(core.defaultRunTimeout).toBe(240_000)

    const slow = defineAtom('slow5m', s.object({}), undefined, async () => {}, {
      timeoutMs: 300_000,
    })
    const vm = new AgentVM({ slow5m: slow })
    expect(vm.defaultRunTimeout).toBe(600_000)

    expect(vm.defaultRunTimeout).toBeGreaterThanOrEqual(300_000)
  })
  it('floors the default at 60s for a VM whose atoms are all fast', () => {
    const fast = defineAtom('fast', s.object({}), undefined, async () => {}, {
      timeoutMs: 50,
    })
    const vm = new AgentVM({ fast })

    expect(vm.defaultRunTimeout).toBeGreaterThanOrEqual(60_000)
  })
})
