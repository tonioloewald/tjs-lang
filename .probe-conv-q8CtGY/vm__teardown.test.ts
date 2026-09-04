/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { s } from 'tosijs-schema'

const VM = new AgentVM()

const fetchAgent = Agent.take(s.object({}))
  .httpFetch({ url: 'https://example.com' })
  .as('r')
  .return(s.object({ r: s.any }))
  .toJSON()

const fetchThenBurnAgent = Agent.take(s.object({}))
  .httpFetch({ url: 'https://example.com' })
  .as('r')
  .jsonStringify({ value: { $kind: 'arg', path: 'big' } })
  .as('s')
  .return(s.object({ r: s.any }))
  .toJSON()

/* line 40 */
function hangingFetch() {
  let seen
  const capability = async (_url, init) => {
    seen = init?.signal
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new Error('aborted'))
      )
    })
  }
  return { capability, signal: () => seen }
}
hangingFetch.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:40',
}

describe('outbound work is cancelled when the run ends', () => {
  it('aborts on a normal completion, not only on timeout', async () => {
    let observed
    const fetch = async (_u, init) => {
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
    let observed
    const fetch = async (_u, init) => {
      observed = init?.signal
      return { ok: true, status: 200, body: 'x' }
    }

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
      observed.aborted,
      'and its signal must be aborted once the run is over'
    ).toBe(true)
  })
  it('does not leak an abort listener onto the caller signal', async () => {
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

    expect(
      grew,
      `retained ${(grew / 1048576).toFixed(
        2
      )}MB across ${RUNS} runs on one signal`
    ).toBeLessThan(2 * 1024 * 1024)

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
          fetch: async (_u, init) => {
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
