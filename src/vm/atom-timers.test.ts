/**
 * A per-atom timer is armed only for a call that is still PENDING (Tonio's ask; #2849).
 *
 * Every atom step used to arm a `setTimeout` and a `Promise.race`, ~20–35% of a hot loop's wall
 * time, although for a call whose body completes synchronously the timer can never fire first.
 * The rule observes the call rather than predicting it: if the atom's own promise has settled
 * within one microtask, no timer; otherwise it is timed exactly as before, so an atom that awaits
 * real work (I/O, `crypto.subtle`) still times out.
 */
import { describe, it, expect } from 'bun:test'
import { s } from 'tosijs-schema'
import { transpile } from '../lang/core'
import { AgentVM } from './vm'
import { defineAtom } from './runtime'

function countTimers<T>(
  run: () => Promise<T>
): Promise<{ value: T; timers: number }> {
  const real = globalThis.setTimeout
  let timers = 0
  ;(globalThis as any).setTimeout = (...a: any[]) => {
    timers++
    return (real as any)(...a)
  }
  return run()
    .then((value) => ({ value, timers }))
    .finally(() => {
      ;(globalThis as any).setTimeout = real
    })
}

describe('per-atom timers are armed only for pending calls', () => {
  it('a 2,000-iteration pure loop arms only the run deadline, not one timer per step', async () => {
    const ast = transpile(
      `function f() { let s = 0; let i = 0; while (i < 2000) { s = s + i; i = i + 1 } return { s } }`
    ).ast
    const { value, timers } = await countTimers(() =>
      new AgentVM().run(ast, {}, { fuel: 1e6 })
    )
    expect(value.error).toBeUndefined()
    expect((value.result as any).s).toBe(1999000)
    expect(timers).toBeLessThan(5) // was ~4,000
  })

  it('an atom that awaits real work is still timed out', async () => {
    const slow = defineAtom(
      'slow',
      s.object({}),
      s.any,
      () => new Promise((resolve) => setTimeout(() => resolve(1), 500)),
      { timeoutMs: 20 }
    )
    const r = await new AgentVM({ slow }).run(
      transpile(
        `function f() { const x = slow({})
        return { x } }`,
        { atoms: { slow } } as any
      ).ast,
      {},
      { fuel: 1000 }
    )
    expect(r.error?.message).toMatch(/Atom 'slow' timed out/)
  })

  it('the deadline counts from the CALL, not from the first microtask (review 20)', async () => {
    // 100ms of synchronous work, then a 30ms await, under an 80ms timeout: counted from the call
    // the deadline has passed before the await; counted from the first microtask (round 46) the
    // atom would have finished.
    const late = defineAtom(
      'late',
      s.object({}),
      s.any,
      async () => {
        const end = Date.now() + 100
        while (Date.now() < end) {
          // busy
        }
        await new Promise((resolve) => setTimeout(resolve, 30))
        return 1
      },
      { timeoutMs: 80 }
    )
    const r = await new AgentVM({ late }).run(
      transpile(
        `function f() { const x = late({})
        return { x } }`,
        { atoms: { late } } as any
      ).ast,
      {},
      { fuel: 1000 }
    )
    expect(r.error?.message).toMatch(/Atom 'late' timed out/)
  })

  it('the deadline uses a MONOTONIC clock: a wall-clock jump does not time an atom out (review of round 47)', async () => {
    const wait = defineAtom(
      'wait',
      s.object({}),
      s.any,
      () => new Promise((resolve) => setTimeout(() => resolve(1), 20)),
      { timeoutMs: 1000 }
    )
    const realNow = Date.now
    let jump = 0
    // every read of the wall clock is 100 seconds later than the last (an NTP step, repeatedly)
    Date.now = () => realNow() + (jump += 100_000)
    try {
      const r = await new AgentVM({ wait }).run(
        transpile(
          `function f() { const x = wait({})
          return { x } }`,
          { atoms: { wait } } as any
        ).ast,
        {},
        { fuel: 1000, timeoutMs: 5000 }
      )
      expect(r.error).toBeUndefined()
      expect(r.result).toEqual({ x: 1 })
    } finally {
      Date.now = realNow
    }
  })

  it('a synchronous atom that throws, or returns a rejected promise, still fails its step', async () => {
    const throws = defineAtom('throws', s.object({}), s.any, (() => {
      throw new Error('sync boom')
    }) as any)
    const rejects = defineAtom('rejects', s.object({}), s.any, (() =>
      Promise.reject(new Error('rejected boom'))) as any)
    for (const [atom, why] of [
      [throws, /sync boom/],
      [rejects, /rejected boom/],
    ] as const) {
      const r = await new AgentVM({ [atom.op]: atom } as any).run(
        transpile(
          `function f() { const x = ${atom.op}({})
          return { x } }`,
          { atoms: { [atom.op]: atom } } as any
        ).ast,
        {},
        { fuel: 1000 }
      )
      expect(r.error?.message).toMatch(why)
    }
  })
})
