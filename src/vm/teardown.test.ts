/**
 * Teardown: when a run ends, nothing it started should still be talking to the outside.
 *
 * Design note (user, 2026-08-03): budget CANNOT be expected to pass from one agent to
 * another — across a system boundary all you can hand over is tokens and data, and the
 * other side takes care of itself. What we can always guarantee is a **time box**, and that
 * we shut our own outbound requests down as gracefully as possible.
 *
 * With the caveat that the grace must not itself become the vulnerability: teardown signals,
 * it does not *await* cleanup, because waiting is how cancellation turns into a path that
 * starts unmetered work.
 */
import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'
import { Agent } from '../builder'
import { s } from 'tosijs-schema'

const VM = new AgentVM()

const fetchAgent = Agent.take(s.object({}))
  .httpFetch({ url: 'https://example.com' })
  .as('r')
  .return(s.object({ r: s.any }))
  .toJSON()

/** A capability that records the signal it was handed and never resolves on its own. */
function hangingFetch() {
  let seen: AbortSignal | undefined
  const capability = async (_url: string, init?: { signal?: AbortSignal }) => {
    seen = init?.signal
    return new Promise<never>((_, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new Error('aborted'))
      )
    })
  }
  return { capability, signal: () => seen }
}

describe('outbound work is cancelled when the run ends', () => {
  it('aborts on a normal completion, not only on timeout', async () => {
    // The bug: `finally` cleared the timeout but never aborted, so a run that ended for
    // ANY other reason left in-flight requests alive with nothing left to cancel them.
    let observed: AbortSignal | undefined
    const fetch = async (_u: string, init?: { signal?: AbortSignal }) => {
      observed = init?.signal
      return { ok: true, status: 200, body: 'x' }
    }
    const result = await VM.run(
      fetchAgent,
      {},
      { fuel: 1000, capabilities: { fetch } }
    )
    expect(result.error).toBeUndefined()
    expect(observed, 'the capability should receive a signal').toBeDefined()
    expect(
      observed?.aborted,
      'and it must be aborted once the run is over'
    ).toBe(true)
  })

  it('aborts when the run dies of fuel exhaustion', async () => {
    let observed: AbortSignal | undefined
    const fetch = async (_u: string, init?: { signal?: AbortSignal }) => {
      observed = init?.signal
      return { ok: true, status: 200, body: 'x' }
    }
    await VM.run(fetchAgent, {}, { fuel: 1, capabilities: { fetch } })
    // Whether or not the atom ran, nothing may be left running afterwards.
    if (observed) expect(observed.aborted).toBe(true)
  })

  it('teardown does not WAIT for the capability to finish', async () => {
    // Grace must not become the vulnerability: if the VM awaited cleanup, a capability
    // that never settles would hold the run open indefinitely — cancellation becoming a
    // path that starts unmetered work.
    const h = hangingFetch()
    const started = Date.now()
    await VM.run(
      fetchAgent,
      {},
      { fuel: 1000, timeoutMs: 300, capabilities: { fetch: h.capability } }
    )
    expect(
      Date.now() - started,
      'must not hang on a never-settling call'
    ).toBeLessThan(3000)
  })
})
