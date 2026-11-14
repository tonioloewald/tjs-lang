/**
 * A call or a member path as a parameter example is reported, not silently unchecked (#4114).
 *
 * `function k(n: Math.round(1.0))` and `function f(n: k.n)` reported `n: any`, `f('x')` returned
 * `'x'`, and nothing said so: examples are not evaluated at transpile time, so the expression said
 * nothing about the type. The parameter stays unchecked (it cannot be evaluated in general), and
 * the transpiler now warns, naming the path, as it does for a type name it cannot resolve.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const warnings = (src: string) => (tjs(src).warnings ?? []).join('\n')

describe('an expression as a parameter example', () => {
  it('a call is reported', () => {
    expect(warnings('function k(n: Math.round(1.0)) { return n }')).toMatch(
      /'Math\.round\(…\)' is an expression.*'n' is unchecked/
    )
  })
  it('a member path is reported', () => {
    expect(
      warnings('const k = { n: 1 }\nfunction f(n: k.n) { return n }')
    ).toMatch(/'k\.n' is an expression/)
  })
  it('inside an object example, naming the member', () => {
    expect(
      warnings('function p(o: { n: Math.round(1.0) }) { return o }')
    ).toMatch(/'o\.n' is unchecked/)
  })
})

describe('what is not reported (the other direction)', () => {
  it('a default is ordinary JavaScript, computed at call time', () => {
    expect(warnings('function d(t = Math.max(1, 2)) { return t }')).not.toMatch(
      /is an expression/
    )
  })
  it('a literal example', () => {
    expect(warnings('function ok(n: 1.0, o: { a: "" }) { return n }')).toBe('')
  })
})
