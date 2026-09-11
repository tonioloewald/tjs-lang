/**
 * `LegacyDate(x)` — the named confession that replaces `unsafe new Date(x)`.
 *
 * `new Date()` is banned in `.tjs` because the object is mutable and timezone-dependent, and
 * the remedy is `Timestamp`. But a deliberate exception has to be expressible, and until now
 * the only way to say it was the generic marker `unsafe`.
 *
 * `unsafe` is the odd one out in this language. Every other escape is a NAMED, greppable,
 * deliberately-ugly callable — `DangerousLegacyEquals`, `LegacyExactly`, `LegacyDefault` — so
 * the debt announces what it is and a reviewer can grep for it. `unsafe` says only "some rule
 * does not apply here" without saying which, and it is the thing that drags `/* @tjs-unsafe *\/`
 * along behind it as a comment channel for smuggling the marker through files `tsc` must
 * accept. See PRINCIPLES.md, "Make stupid stuff stand out".
 *
 * So the escape gets a name. These tests pin that the name WORKS (it is a real Date, it takes
 * the same arguments), that the ban still fires on the raw form, and that the diagnostic now
 * teaches the named form — the diagnostic being the teaching moment is exactly why the old
 * message's advice mattered enough to test.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

/** Transpile as native TJS and run, returning the named export. */
function run(source: string, name: string): any {
  const saved = (globalThis as any).__tjs
  try {
    ;(globalThis as any).__tjs = createRuntime()
    const { code } = tjs(source, { filename: 'a.tjs', runTests: false })
    return new Function(`${code}\nreturn ${name}`)()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

describe('LegacyDate is a real Date, by a name you can grep for', () => {
  it('constructs from epoch milliseconds', () => {
    const f = run(`function at(ms: 0) { return LegacyDate(ms) }`, 'at')
    const d = f(86_400_000)
    expect(d instanceof Date).toBe(true)
    expect(d.getTime()).toBe(86_400_000)
  })

  it('constructs from a string, like the constructor it replaces', () => {
    const f = run(`function at(s: '') { return LegacyDate(s) }`, 'at')
    expect(f('2020-01-02T03:04:05.000Z').toISOString()).toBe(
      '2020-01-02T03:04:05.000Z'
    )
  })

  it('takes no arguments for "now"', () => {
    const f = run(`function now() { return LegacyDate() }`, 'now')
    const before = Date.now()
    const t = f().getTime()
    expect(t).toBeGreaterThanOrEqual(before)
  })

  it('takes the multi-argument form too', () => {
    const f = run(`function at() { return LegacyDate(2020, 0, 2) }`, 'at')
    expect(f().getFullYear()).toBe(2020)
  })
})

describe('the ban still fires, and now teaches the named form', () => {
  const raw = `function f(x: 0) { const d = new Date(x)\n  return d.getTime() }`

  it('raw `new Date()` is still rejected', () => {
    expect(() => tjs(raw, { filename: 'a.tjs', runTests: false })).toThrow()
  })

  it('the diagnostic names LegacyDate, not `unsafe`', () => {
    // The diagnostic IS the teaching moment (errors-as-curriculum), so what it recommends is
    // behaviour worth pinning. It used to say `unsafe new Date(x)`, which taught the generic
    // marker we are retiring.
    let message = ''
    try {
      tjs(raw, { filename: 'a.tjs', runTests: false })
    } catch (e: any) {
      message = String(e.message)
    }
    expect(message).toContain('LegacyDate(')
  })

  it('still points at Timestamp FIRST — LegacyDate is the escape, not the advice', () => {
    let message = ''
    try {
      tjs(raw, { filename: 'a.tjs', runTests: false })
    } catch (e: any) {
      message = String(e.message)
    }
    expect(message.indexOf('Timestamp')).toBeLessThan(
      message.indexOf('LegacyDate')
    )
  })
})
