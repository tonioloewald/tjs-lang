/**
 * `typeof` on a name that was never declared is 'undefined' in native TJS, as in JavaScript
 * (#3822). Native TJS rewrites `typeof x` to `TypeOf(x)` (so `typeof null` is 'null'), and
 * calling a function EVALUATES its argument: the feature-detection idiom
 * `typeof window === 'undefined'` threw a ReferenceError in a .tjs file. TJS must accept every
 * JavaScript program (PRINCIPLES.md invariant 1).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const run = (src: string) => {
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return new Function(`${tjs(src, { runTests: false }).code}\nreturn f`)()()
  } finally {
    g.__tjs = prev
  }
}

describe('typeof on an undeclared name', () => {
  it("is 'undefined', and the feature-detection idiom works", () => {
    expect(run(`function f() { return typeof neverDeclaredAnywhere }`)).toBe(
      'undefined'
    )
    expect(
      run(
        `function f() { return typeof neverDeclaredAnywhere === 'undefined' ? 'absent' : 'present' }`
      )
    ).toBe('absent')
  })

  it('declared names keep TJS typeof: null is null', () => {
    expect(run(`function f() { const n = null; return typeof n }`)).toBe('null')
    expect(run(`function f() { let u; return typeof u }`)).toBe('undefined')
    expect(
      run(`function f() { const o = { a: null }; return typeof o.a }`)
    ).toBe('null')
  })
})
