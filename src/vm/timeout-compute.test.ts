/**
 * A run's wall-clock limits hold for COMPUTE, not only for IO (#3986).
 *
 * The deadline was a `setTimeout` raced against the run. A step that does no IO completes at
 * once, each `await` resumes as a microtask, and the event loop runs every pending microtask
 * before any timer: a compute-only run never let the timer fire. Measured: a 3M-step loop with
 * `timeoutMs: 200` ran 3.6 s and COMPLETED. The same starvation hid the caller's AbortSignal
 * (its listener never ran) and froze the host's event loop for the whole run.
 *
 * Now the step boundary, which every step and every loop iteration passes, reads the clock:
 * past the deadline the run is aborted, and after each time slice it yields one macrotask, so
 * timers, the caller's signal and the host's other work all get their turn.
 *
 * Rows run transpile() output, as CLAUDE.md asks of VM tests.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from '../lang/core'
import { AgentVM } from './ast'

const LOOP = transpile(`function spin({ n = 0 }) {
  let i = 0
  let s = 0
  while (i < n) {
    s = s + i
    i = i + 1
  }
  return { s }
}`).ast

const vm = new AgentVM()

describe('wall-clock limits hold for a compute-only run', () => {
  it('timeoutMs stops a busy loop near its deadline', async () => {
    const t0 = performance.now()
    const r = await vm.run(
      LOOP,
      { n: 50_000_000 },
      { fuel: 1e12, timeoutMs: 200 }
    )
    const ms = performance.now() - t0
    expect(String(r.error?.message)).toMatch(/timeout/i)
    expect(ms).toBeLessThan(1500)
  })

  it("the caller's AbortSignal stops a busy loop", async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100)
    const t0 = performance.now()
    const r = await vm.run(
      LOOP,
      { n: 50_000_000 },
      {
        fuel: 1e12,
        timeoutMs: 60_000,
        signal: controller.signal,
      }
    )
    const ms = performance.now() - t0
    expect(String(r.error?.message)).toMatch(/aborted by the caller/)
    expect(ms).toBeLessThan(1500)
  })

  it("a busy run does not starve the host's event loop", async () => {
    let ticks = 0
    const interval = setInterval(() => ticks++, 5)
    try {
      await vm.run(LOOP, { n: 50_000_000 }, { fuel: 1e12, timeoutMs: 400 })
    } finally {
      clearInterval(interval)
    }
    // ~400 ms of compute: a starved loop sees 0 or 1 ticks; a sliced one sees dozens.
    expect(ticks).toBeGreaterThan(10)
  })

  it('a run that finishes in time is unaffected', async () => {
    const r = await vm.run(LOOP, { n: 1000 }, { fuel: 1e6, timeoutMs: 5000 })
    expect(r.error).toBeUndefined()
    expect(r.result).toEqual({ s: 499500 })
  })
})
