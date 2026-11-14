/**
 * Each polymorphic variant keeps its own return contract; the dispatcher has none (#4123).
 *
 * Return annotations were looked up by function NAME in the source, so a variant (`f$2` after
 * preprocessing) found none and the dispatcher `f` found the FIRST variant's. With
 * `f(s: 'a'):? 'A'` beside `f(n: 2):? 4`, every call was checked against a string, so `f(2)`
 * was refused and the second variant's signature test could not pass.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { isMonadicError } from './runtime'

const SRC = `function f(s: 'a'):? 'A' { return s.toUpperCase() }
function f(n: 2):? 4 { return n * 2 }`

describe('polymorphic variants and their returns', () => {
  it('each variant is checked against its own return, and both signature tests pass', () => {
    const r = tjs(SRC)
    expect(r.testResults?.every((t: any) => t.passed)).toBe(true)
    const f = new Function(r.code + '\nreturn f')()
    expect(f('b')).toBe('B')
    expect(f(3)).toBe(6)
  })
  it("a variant's return check still refuses a wrong value (the other direction)", () => {
    const f = new Function(
      tjs(
        `function f(s: 'a'):? 'A' { return 5 }
function f(n: 2):? 4 { return n * 2 }`,
        { runTests: false }
      ).code + '\nreturn f'
    )()
    expect(isMonadicError(f('b'))).toBe(true)
    expect(f(3)).toBe(6)
  })
  it('a wrong return example on a later variant fails its signature test', () => {
    expect(() =>
      tjs(`function f(s: 'a'): 'A' { return s.toUpperCase() }
function f(n: 2): 5 { return n * 2 }`)
    ).toThrow(/Expected 5/)
  })
})
