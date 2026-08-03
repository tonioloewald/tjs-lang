/**
 * Per-atom call quotas — capping the work an agent summons OUTSIDE the VM.
 *
 * Fuel meters work done *inside* the VM, and is blind to what an atom reaches for. An
 * `llmPredict` costing 50 fuel may cost real money; a `httpFetch` costing 10 may hammer
 * someone else's service. A budget denominated in VM work cannot express "at most three
 * model calls", so it needs its own denomination.
 *
 * This is the first piece of §4 (open-graph blast radius) in the eval-soundness audit —
 * the section that had no work at all.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'
import { Agent } from '../builder'
import { s } from 'tosijs-schema'

const VM = new AgentVM()

/** An agent that calls `httpFetch` n times. */
const fetchTimes = (n: number) => {
  let a = Agent.take(s.object({}))
  for (let i = 0; i < n; i++) {
    a = a.httpFetch({ url: `https://example.com/${i}` }).as(`r${i}`)
  }
  return a.return(s.object({})).toJSON()
}

const okFetch = async () => ({ ok: true, status: 200, body: 'x' })

describe('per-atom call quotas', () => {
  it('allows calls up to the quota', async () => {
    const result = await VM.run(
      fetchTimes(3),
      {},
      {
        fuel: 10_000,
        capabilities: { fetch: okFetch },
        quotas: { httpFetch: 3 },
      }
    )
    expect(result.error).toBeUndefined()
  })

  it('rejects the call that would exceed it', async () => {
    const result = await VM.run(
      fetchTimes(4),
      {},
      {
        fuel: 10_000,
        capabilities: { fetch: okFetch },
        quotas: { httpFetch: 3 },
      }
    )
    expect(result.error).toBeDefined()
    expect(result.error?.message).toMatch(
      /Quota exceeded for 'httpFetch': 3 calls/
    )
  })

  it('an exhausted quota stops the call BEFORE it happens', async () => {
    // The point of a spend cap: the fourth request must never reach the network, not
    // merely be reported afterwards.
    let calls = 0
    const counting = async () => {
      calls++
      return { ok: true, status: 200, body: 'x' }
    }
    await VM.run(
      fetchTimes(5),
      {},
      {
        fuel: 10_000,
        capabilities: { fetch: counting },
        quotas: { httpFetch: 2 },
      }
    )
    expect(calls, 'the capability must not be invoked past the quota').toBe(2)
  })

  it('costs no fuel once exhausted', async () => {
    // A rejected call should not also drain the budget — otherwise a quota becomes a
    // second way to run out of fuel.
    const withQuota = await VM.run(
      fetchTimes(6),
      {},
      {
        fuel: 10_000,
        capabilities: { fetch: okFetch },
        quotas: { httpFetch: 1 },
      }
    )
    const oneCall = await VM.run(
      fetchTimes(1),
      {},
      { fuel: 10_000, capabilities: { fetch: okFetch } }
    )
    expect(withQuota.fuelUsed).toBeLessThanOrEqual(oneCall.fuelUsed + 1)
  })

  it('is per-op — one quota does not constrain another atom', async () => {
    const result = await VM.run(
      fetchTimes(3),
      {},
      {
        fuel: 10_000,
        capabilities: { fetch: okFetch },
        quotas: { llmPredict: 0 },
      }
    )
    expect(result.error).toBeUndefined()
  })

  it('unset means unlimited — purely additive', async () => {
    const result = await VM.run(
      fetchTimes(8),
      {},
      { fuel: 10_000, capabilities: { fetch: okFetch } }
    )
    expect(result.error).toBeUndefined()
  })

  it('a quota of 0 forbids the atom outright', async () => {
    const result = await VM.run(
      fetchTimes(1),
      {},
      {
        fuel: 10_000,
        capabilities: { fetch: okFetch },
        quotas: { httpFetch: 0 },
      }
    )
    expect(result.error?.message).toMatch(/Quota exceeded/)
  })
})
