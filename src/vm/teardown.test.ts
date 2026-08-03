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

/**
 * Fetch first, then burn fuel — so the run can DIE OF FUEL after the call is in flight.
 * A single-step agent cannot express that: at any budget large enough to dispatch, the
 * run also finishes, which is why the exhaustion test below was silently testing nothing.
 */
const fetchThenBurnAgent = Agent.take(s.object({}))
  .httpFetch({ url: 'https://example.com' })
  .as('r')
  .jsonStringify({ value: { $kind: 'arg', path: 'big' } })
  .as('s')
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
    // This test was VACUOUS. It ran at `fuel: 1`, where `httpFetch` never dispatches at
    // all (it first executes at fuel >= 6), so `observed` was undefined and the guarded
    // assertion never ran — the file reported 3 pass / 4 expect() calls, of which this
    // test contributed ZERO. It could not have failed for any reason.
    //
    // The general rule, and it matters most in a security test: never write
    // `if (x) expect(...)`. A guarded assertion is indistinguishable from no assertion.
    // Assert the precondition FIRST, unconditionally, then assert the property.
    let observed: AbortSignal | undefined
    const fetch = async (_u: string, init?: { signal?: AbortSignal }) => {
      observed = init?.signal
      return { ok: true, status: 200, body: 'x' }
    }
    // Enough fuel to dispatch the call, not enough to finish the step after it: the
    // jsonStringify charges by operand size, so a big argument exhausts the budget while
    // the fetch is already away.
    const result = await VM.run(
      fetchThenBurnAgent,
      { big: Array.from({ length: 200_000 }, (_, i) => i) },
      { fuel: 20, capabilities: { fetch } }
    )
    expect(result.error?.message, 'the run must die of fuel').toBe(
      'Out of Fuel'
    )
    expect(
      observed,
      'the capability must actually have been called'
    ).toBeDefined()
    expect(
      observed!.aborted,
      'and its signal must be aborted once the run is over'
    ).toBe(true)
  })

  it('does not leak an abort listener onto the caller signal', async () => {
    // `vm.run` linked the caller's signal with `addEventListener('abort', …)` and never
    // removed it: no `once`, no removal, and the always-abort `finally` did not clean it
    // up either. Measured before the fix: ~2.1KB retained per run, 41.6MB after 20,000
    // runs against ONE shared signal (vs 1.59MB with no signal). A host running many
    // short agents under a single cancellation scope is the normal case.
    const shared = new AbortController()
    const simple = Agent.take(s.object({}))
      .varSet('x', 1)
      .return(s.object({}))
      .toJSON()

    const RUNS = 2000
    Bun.gc(true)
    const before = process.memoryUsage().heapUsed
    for (let i = 0; i < RUNS; i++) {
      await VM.run(simple, {}, { fuel: 100, signal: shared.signal })
    }
    Bun.gc(true)
    await new Promise((r) => setTimeout(r, 20))
    Bun.gc(true)
    const grew = process.memoryUsage().heapUsed - before

    // Generous bound: the point is that growth is not PROPORTIONAL to run count.
    // Leaking would put this at ~4MB for 2000 runs; the fix keeps it far below.
    expect(
      grew,
      `retained ${(grew / 1048576).toFixed(
        2
      )}MB across ${RUNS} runs on one signal`
    ).toBeLessThan(2 * 1024 * 1024)

    // And the listener must still WORK — a fix that simply stopped linking the signal
    // would pass the check above while silently removing cancellation.
    let sawAbort = false
    const live = new AbortController()
    const hanging = hangingFetch()
    const p = VM.run(
      fetchAgent,
      {},
      {
        fuel: 1000,
        timeoutMs: 5000,
        signal: live.signal,
        capabilities: {
          fetch: async (_u: string, init?: { signal?: AbortSignal }) => {
            init?.signal?.addEventListener('abort', () => {
              sawAbort = true
            })
            return hanging.capability(_u, init)
          },
        },
      }
    )
    live.abort()
    await p
    expect(sawAbort, 'the caller signal must still cancel the run').toBe(true)
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
