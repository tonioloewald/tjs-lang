/* tjs <- input.ts */

import { describe, it, expect, afterEach } from 'bun:test'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm/vm'

const VM = new AgentVM()

/* line 41 */
async function liveTimersDuring(fn) {
  const realSet = globalThis.setTimeout
  const realClear = globalThis.clearTimeout
  const live = new Set()
  globalThis.setTimeout = (...a) => {
    const t = realSet(...a)
    live.add(t)
    return t
  }
  globalThis.clearTimeout = (t) => {
    live.delete(t)
    return realClear(t)
  }
  try {
    await fn()
  } finally {
    globalThis.setTimeout = realSet
    globalThis.clearTimeout = realClear
    for (const t of live) realClear(t)
  }
  return live.size
}
liveTimersDuring.__tjs = {
  params: {
    fn: {
      type: {
        kind: 'any',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'number',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:41',
}

const controllers = []

afterEach(() => {
  controllers.splice(0)
})

/* line 74 */
function sharedSignal() {
  const c = new AbortController()
  controllers.push(c)
  return c.signal
}
sharedSignal.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:74',
}

const REJECTING_SCHEMA = {
  op: 'seq',
  steps: [{ op: 'return', value: { ok: 1 } }],
  inputSchema: {
    type: 'object',
    required: ['needed'],
    properties: { needed: { type: 'string' } },
  },
}

describe('every exit path releases the timeout timer', () => {
  it('an input-validation rejection leaves no timer behind', async () => {
    const leaked = await liveTimersDuring(async () => {
      for (let i = 0; i < 5; i++) {
        const r = await VM.run(
          REJECTING_SCHEMA,
          {},
          {
            fuel: 1000,
            signal: sharedSignal(),
          }
        )

        expect(r.error?.message ?? '').toMatch(/Input validation failed/)
      }
    })
    expect(leaked).toBe(0)
  })
  it('a root-op throw leaves no timer behind', async () => {
    const leaked = await liveTimersDuring(async () => {
      for (let i = 0; i < 5; i++) {
        let threw = false
        try {
          await VM.run(
            { op: 'varSet' },
            {},
            {
              fuel: 1000,
              signal: sharedSignal(),
            }
          )
        } catch (e) {
          threw = true
          expect(e.message).toMatch(/Root AST must be 'seq'/)
        }
        expect(threw, 'the guard must still reject a non-seq root').toBe(true)
      }
    })
    expect(leaked).toBe(0)
  })
  it('an ordinary run leaves no timer behind (control)', async () => {
    const leaked = await liveTimersDuring(async () => {
      for (let i = 0; i < 5; i++) {
        const r = await VM.run(
          { op: 'seq', steps: [{ op: 'return', value: { ok: 1 } }] },
          {},
          { fuel: 1000, signal: sharedSignal() }
        )
        expect(r.error).toBeUndefined()
      }
    })
    expect(leaked).toBe(0)
  })
})

describe('rejections still behave correctly', () => {
  it('a valid payload passes the schema', async () => {
    const r = await VM.run(
      REJECTING_SCHEMA,
      { needed: 'yes' },
      {
        fuel: 1000,
      }
    )
    expect(r.error?.message ?? 'ok').toBe('ok')
  })
  it('trace is an empty array when tracing is on, and absent otherwise', async () => {
    const traced = await VM.run(
      REJECTING_SCHEMA,
      {},
      {
        fuel: 1000,
        trace: true,
      }
    )
    expect(traced.trace).toEqual([])
    const untraced = await VM.run(
      REJECTING_SCHEMA,
      {},
      {
        fuel: 1000,
      }
    )
    expect(untraced.trace).toBeUndefined()
  })
})
