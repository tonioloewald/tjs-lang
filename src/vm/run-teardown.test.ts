/**
 * A run that is REJECTED cleans up as thoroughly as a run that executes.
 *
 * `vm.run` creates the timeout timer and registers a listener on the caller's signal, then
 * enters a `try/finally` that clears both. Two exits sat in the gap: the root-op throw and
 * the input-schema early return. Both happened after the timer existed and before the
 * `try`, so neither cleared it — while the comment beside the `finally` said it
 * "guarantees on every exit path".
 *
 * Measured before the fix, by counting timers that were created and never cleared:
 *
 *     5 input-validation failures  ->  5 live timers
 *     5 root-op throws             ->  5 live timers
 *     5 ordinary runs              ->  0
 *
 * A pending timer also keeps the event loop alive. The probe that produced those numbers
 * HUNG rather than exiting — a host that validates a batch of agents and then finishes does
 * not finish, for up to `timeoutMs` (default `fuel × 10ms`) after the last rejection.
 *
 * The fix was to move both checks ABOVE the timer rather than widen the `try`: an argument
 * that never runs should not allocate a timer and a listener just to release them.
 *
 * The listener leak is the same defect this file's sibling reasoning already fixed once —
 * `{ signal: controller.signal }` was added precisely because listeners accumulated on a
 * long-lived caller signal (~2.1KB/run, 41.6MB after 20,000 runs). That removal is driven
 * by OUR controller aborting, which these two paths also skipped.
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { AgentVM } from './vm'

const VM = new AgentVM()

/**
 * Count timers created but never cleared during `fn`.
 *
 * Instrumenting the global is the only way to see this: the leak has no observable effect
 * on the RESULT — both rejections return/throw exactly what they should. What leaks is a
 * host resource, so a test that only inspected the return value would pass against the
 * broken code, which is precisely why this shipped.
 */
async function liveTimersDuring(fn: () => Promise<void>): Promise<number> {
  const realSet = globalThis.setTimeout
  const realClear = globalThis.clearTimeout
  const live = new Set<unknown>()
  ;(globalThis as unknown as { setTimeout: unknown }).setTimeout = (
    ...a: unknown[]
  ) => {
    const t = (realSet as (...x: unknown[]) => unknown)(...a)
    live.add(t)
    return t
  }
  ;(globalThis as unknown as { clearTimeout: unknown }).clearTimeout = (
    t: unknown
  ) => {
    live.delete(t)
    return (realClear as (x: unknown) => unknown)(t)
  }
  try {
    await fn()
  } finally {
    globalThis.setTimeout = realSet
    globalThis.clearTimeout = realClear
    for (const t of live) realClear(t as ReturnType<typeof setTimeout>)
  }
  return live.size
}

const controllers: AbortController[] = []
afterEach(() => {
  controllers.splice(0)
})

/** A caller signal that outlives the run — the case the listener leak needs. */
function sharedSignal(): AbortSignal {
  const c = new AbortController()
  controllers.push(c)
  return c.signal
}

const REJECTING_SCHEMA = {
  op: 'seq',
  steps: [{ op: 'return', value: { ok: 1 } }],
  inputSchema: {
    type: 'object',
    required: ['needed'],
    properties: { needed: { type: 'string' } },
  },
} as const

describe('every exit path releases the timeout timer', () => {
  it('an input-validation rejection leaves no timer behind', async () => {
    const leaked = await liveTimersDuring(async () => {
      for (let i = 0; i < 5; i++) {
        const r = await VM.run(REJECTING_SCHEMA as any, {} as any, {
          fuel: 1000,
          signal: sharedSignal(),
        })
        // The rejection itself must still happen — a "fix" that stopped validating
        // would also leak nothing.
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
          await VM.run({ op: 'varSet' } as any, {} as any, {
            fuel: 1000,
            signal: sharedSignal(),
          })
        } catch (e: any) {
          threw = true
          expect(e.message).toMatch(/Root AST must be 'seq'/)
        }
        expect(threw, 'the guard must still reject a non-seq root').toBe(true)
      }
    })
    expect(leaked).toBe(0)
  })

  it('an ordinary run leaves no timer behind (control)', async () => {
    // This one always passed. It is here so a failure in the two above is legible as
    // "the early exits" rather than "timers in general".
    const leaked = await liveTimersDuring(async () => {
      for (let i = 0; i < 5; i++) {
        const r = await VM.run(
          { op: 'seq', steps: [{ op: 'return', value: { ok: 1 } }] } as any,
          {} as any,
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
    // Moving the check earlier must not change what it decides.
    const r = await VM.run(REJECTING_SCHEMA as any, { needed: 'yes' } as any, {
      fuel: 1000,
    })
    expect(r.error?.message ?? 'ok').toBe('ok')
  })

  it('trace is an empty array when tracing is on, and absent otherwise', async () => {
    // The early return used to read `ctx.trace`, which is created further down now. It
    // reported `[]` with tracing on and `undefined` without; both are preserved.
    const traced = await VM.run(REJECTING_SCHEMA as any, {} as any, {
      fuel: 1000,
      trace: true,
    })
    expect(traced.trace).toEqual([])
    const untraced = await VM.run(REJECTING_SCHEMA as any, {} as any, {
      fuel: 1000,
    })
    expect(untraced.trace).toBeUndefined()
  })
})
