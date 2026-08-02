/**
 * `LegacyEquals` / `LegacyNot` / `LegacyExactly` / `LegacyNotExactly` — bridges back to
 * JavaScript's equality.
 *
 * TJS fixes `==` and `===`, and a fixed OPERATOR has no construct to mark: it is still
 * spelled the same, so `unsafe` has nothing to point at. The escape therefore has to be a
 * NAME. That makes reaching for one deliberate and greppable, and the word `Legacy` does
 * the teaching — you are asking for the behavior TJS exists to correct.
 *
 * This is what makes abolishing `TjsEquals` possible: the mode existed because there was no
 * other way to get JS semantics back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { tjs } from './index'
import {
  createRuntime,
  Eq,
  LegacyEquals,
  LegacyNot,
  LegacyExactly,
  LegacyNotExactly,
} from './runtime'

let saved: any
beforeAll(() => {
  saved = (globalThis as any).__tjs
  ;(globalThis as any).__tjs = createRuntime()
})
afterAll(() => {
  ;(globalThis as any).__tjs = saved
})

describe('legacy equality reproduces JavaScript exactly', () => {
  it('LegacyEquals coerces, where TJS `==` refuses to', () => {
    expect(LegacyEquals(1, '1')).toBe(true)
    expect(Eq(1, '1')).toBe(false)
    expect(LegacyEquals(0, '')).toBe(true)
    expect(LegacyEquals(false, [])).toBe(true)
  })

  it("LegacyExactly keeps JS's two famous warts", () => {
    // NaN is not itself…
    expect(LegacyExactly(NaN, NaN)).toBe(false)
    expect(Eq(NaN, NaN)).toBe(true)
    // …and a boxed primitive is not its value.
    expect(LegacyExactly(new String('a'), 'a')).toBe(false)
    expect(Eq(new String('a'), 'a')).toBe(true)
  })

  it('null vs undefined: legacy `===` separates, TJS `==` does not', () => {
    expect(LegacyExactly(null, undefined)).toBe(false)
    expect(LegacyEquals(null, undefined)).toBe(true) // JS `==` also conflates
    expect(Eq(null, undefined)).toBe(true)
  })

  it('the negations are exact inversions', () => {
    for (const [a, b] of [
      [1, '1'],
      [NaN, NaN],
      [null, undefined],
      [{}, {}],
    ] as Array<[unknown, unknown]>) {
      expect(LegacyNot(a, b)).toBe(!LegacyEquals(a, b))
      expect(LegacyNotExactly(a, b)).toBe(!LegacyExactly(a, b))
    }
  })
})

describe('they work in emitted standalone code', () => {
  // Emitted JS calls these bare, so the inline runtime must define them — and only when
  // the source actually reached for one (see CLAUDE.md, "the inline runtime is NOT the
  // real runtime").
  const NAMES = [
    ['LegacyEquals', true],
    ['LegacyNot', false],
    ['LegacyExactly', false],
    ['LegacyNotExactly', true],
  ] as const

  for (const [name, expected] of NAMES) {
    it(`${name} is inlined and runs`, () => {
      const code = tjs(`function f(a: 0, b: '') { return ${name}(a, b) }`, {
        runTests: false,
      }).code
      expect(code).toContain(`function ${name}(`)
      const f = new Function(code + '\nreturn f')()
      expect(f(1, '1')).toBe(expected)
    })
  }

  it('are NOT inlined when unused — no dead weight', () => {
    const code = tjs(`function f(a: 0, b: 0) { return a == b }`, {
      runTests: false,
    }).code
    expect(code).not.toContain('function LegacyEquals(')
  })
})
