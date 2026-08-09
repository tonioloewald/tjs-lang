/**
 * `T[]` — the single most common annotation in real TypeScript.
 *
 * It did not parse at all: `function f(xs: number[])` was a syntax error, because the
 * colon shorthand rewrites `xs: T` to `xs = T` and `number[]` is not an expression.
 *
 * The fix rewrites it to the array-example spelling the language already has —
 * `xs: number[]` becomes `xs: [0.0]` — so item checking, `.d.ts` emit and JSON-Schema all
 * come for free. Teaching the emitter a second array representation would have been a
 * second mechanism for something the first already does.
 *
 * This also closes what was filed as "rest params are not validated". That was a
 * misdiagnosis: `...xs: [0]` item-checked correctly the whole time. The failing case was
 * `...xs: number[]`, and it failed because of `T[]` — the rest annotation is read from the
 * ORIGINAL source (JS forbids defaults on rest params, so it is stripped rather than
 * rewritten), so it needed the rewrite applied at that site too.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const fn = (src: string): any =>
  new Function(
    `${tjs(src, { filename: 'as.tjs', runTests: false }).code}\nreturn f`
  )()
const rejected = (v: unknown) => String(v).startsWith('MonadicError')

describe('`T[]` parses and enforces', () => {
  it('number[] checks the items, not just arrayness', () => {
    const f = fn(`function f(xs: number[]) { return xs.length }`)
    expect(f([1, 2])).toBe(2)
    expect(rejected(f(['x']))).toBe(true)
    expect(rejected(f('nope'))).toBe(true)
  })

  it('string[] likewise', () => {
    const f = fn(`function f(xs: string[]) { return xs.length }`)
    expect(f(['a'])).toBe(1)
    expect(rejected(f([1]))).toBe(true)
  })

  it('nests: string[][]', () => {
    const f = fn(`function f(xs: string[][]) { return xs.length }`)
    expect(f([['a']])).toBe(1)
    expect(rejected(f([[1]]))).toBe(true)
  })

  it('int[] narrows where number[] does not', () => {
    // `number` must keep meaning "any number" so pasted TS is unaffected; `int` is the
    // spelling that narrows.
    const ints = fn(`function f(xs: int[]) { return xs.length }`)
    const nums = fn(`function f(xs: number[]) { return xs.length }`)
    expect(rejected(ints([1.5]))).toBe(true)
    expect(rejected(nums([1.5]))).toBe(false)
  })

  it('an unknown element type is left alone rather than guessed', () => {
    // A wrong example would validate against the wrong thing, which is worse than not
    // validating — loud beats silent, and silently-wrong is the worst of the three.
    expect(() =>
      tjs(`function f(xs: Widget[]) { return xs }`, {
        filename: 'as.tjs',
        runTests: false,
      })
    ).toThrow()
  })
})

describe('rest params enforce their element type', () => {
  it('...xs: number[] rejects a bad element', () => {
    const f = fn(`function f(...xs: number[]) { return xs.length }`)
    expect(f(1, 2)).toBe(2)
    expect(rejected(f(1, 'x'))).toBe(true)
  })

  it('...xs: [0] — the example spelling — still works', () => {
    // The control. This path was never broken, and the misdiagnosis came from not
    // checking it separately.
    const f = fn(`function f(...xs: [0]) { return xs.length }`)
    expect(f(1, 2)).toBe(2)
    expect(rejected(f(1, 'x'))).toBe(true)
  })

  it('a rest param after a normal one', () => {
    const f = fn(`function f(a: '', ...xs: number[]) { return xs.length }`)
    expect(f('s', 1, 2)).toBe(2)
    expect(rejected(f(1, 2))).toBe(true)
  })
})
