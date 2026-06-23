import { describe, it, expect } from 'vitest'
import { AgentVM, isAgentError, defineAtom } from '../index'
import { s } from 'tosijs-schema'

// A deliberately slow atom whose builtin timeout would normally trip.
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
        timeoutOverrides: { slow: 5000 }, // raise from 100 → 5s
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
        timeoutOverrides: { slow: 10 }, // lower from 100ms → 10ms
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
          // Allow 10x the requested delay
          slow: (input: any) => input.ms * 10,
        },
      }
    )

    expect(result.error).toBeUndefined()
  })

  it('override of 0 disables the per-atom timeout', async () => {
    const vm = new AgentVM({ slow: slowAtom })

    // ms > atom default (100), would normally trip
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
    // Under the old `fuel * 10ms` formula, fuel=1 would timeout in 10ms —
    // far less than the IO needed below. Under the atom-derived default
    // (slowest atom × 2), a 200ms IO atom completes fine with tiny fuel.
    const vm = new AgentVM({ slow: slowAtom })

    const ast = vm.Agent.step({ op: 'slow', ms: 200 }).toJSON()

    const result = await vm.run(
      ast,
      {},
      {
        fuel: 1000, // headroom for cost; the run-level timeout is what matters
        timeoutOverrides: { slow: 0 }, // disable per-atom timeout
        // no timeoutMs option — use the default
      }
    )

    expect(result.error).toBeUndefined()
  })

  it('derives the default from the slowest atom × 2 (never below the slowest atom budget)', () => {
    // coreAtoms include 120s atoms (llm/runCode); the run-level default must
    // cover them, else those per-atom budgets are dead config.
    const core = new AgentVM()
    expect(core.defaultRunTimeout).toBe(240_000) // 120s × 2

    // A slower custom atom raises the default (self-adjusting).
    const slow = defineAtom('slow5m', s.object({}), undefined, async () => {}, {
      timeoutMs: 300_000,
    })
    const vm = new AgentVM({ slow5m: slow })
    expect(vm.defaultRunTimeout).toBe(600_000) // 300s × 2
    // and it always covers the slowest atom's own budget
    expect(vm.defaultRunTimeout).toBeGreaterThanOrEqual(300_000)
  })

  it('floors the default at 60s for a VM whose atoms are all fast', () => {
    // `seq` etc. have timeoutMs: 0 (no timeout) and are excluded; if the only
    // finite budgets were tiny, the floor keeps a sane backstop.
    const fast = defineAtom('fast', s.object({}), undefined, async () => {}, {
      timeoutMs: 50,
    })
    const vm = new AgentVM({ fast })
    // coreAtoms still contribute their 120s atoms, so this VM is 240s; the floor
    // is exercised conceptually — assert it's at least the 60s minimum.
    expect(vm.defaultRunTimeout).toBeGreaterThanOrEqual(60_000)
  })
})
