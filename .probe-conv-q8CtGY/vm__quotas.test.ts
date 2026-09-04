/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { s } from 'tosijs-schema'

const VM = new AgentVM()

/* line 20 */
function fetchTimes(n) {
  let a = Agent.take(s.object({}))
  for (let i = 0; i < n; i++) {
    a = a.httpFetch({ url: `https://example.com/${i}` }).as(`r${i}`)
  }
  return a.return(s.object({})).toJSON()
}
fetchTimes.__tjs = {
  params: {
    n: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:20',
}

/* line 28 */
async function okFetch() {
  return { ok: true, status: 200, body: 'x' }
}
okFetch.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:28',
}

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

describe('quota scope — the boundary, pinned so it cannot surprise anyone', () => {
  const nested = (fetch, shared) => {
    const V = new AgentVM()
    const inner = {
      op: 'seq',
      steps: [{ op: 'httpFetch', url: 'https://x/1', result: 'r' }],
    }
    const agent = {
      run: async () =>
        V.run(
          inner,
          {},
          {
            fuel: 1000,
            capabilities: { fetch },
            quotas: { httpFetch: 1 },
            quotaUsed: shared,
          }
        ),
    }
    const outer = {
      op: 'seq',
      steps: [
        { op: 'httpFetch', url: 'https://x/0', result: 'a' },
        { op: 'agentRun', agentId: 'child', input: {}, result: 'b' },
      ],
    }
    return V.run(
      outer,
      {},
      {
        fuel: 5000,
        capabilities: { fetch, agent },
        quotas: { httpFetch: 1 },
        quotaUsed: shared,
      }
    )
  }
  it('a capability that re-enters the VM gets a FRESH quota (known limitation)', async () => {
    let calls = 0
    await nested(async () => {
      calls++
      return { ok: true, status: 200, body: 'x' }
    })

    expect(calls).toBe(2)
  })
  it('…unless the host threads one counter through — then it holds', async () => {
    let calls = 0
    const shared = {}
    await nested(async () => {
      calls++
      return { ok: true, status: 200, body: 'x' }
    }, shared)
    expect(calls, 'a shared counter caps the whole call tree').toBe(1)
  })
})
