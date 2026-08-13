/**
 * A function that names a type declared LATER in the file does not crash at module load.
 *
 * `Type X {…}` emits as `const X = …`, so it is in TDZ until its declaration runs. A
 * function declaration hoists; a `const` does not. So this is legal, ordinary JavaScript:
 *
 *     function paint(c: Color) { return c }
 *     const first = paint('red')        // runs during module evaluation
 *     Enum Color 'a colour' { Red = 'red' }
 *
 * The emitted guard was `typeof Color !== 'undefined' && !Color.check(c)`, with a comment
 * explaining that it "turns a would-be ReferenceError into unchecked". It did the
 * opposite: `typeof` is only safe for an UNDECLARED identifier, and a declared `const` in
 * TDZ throws from the `typeof` itself. The module died at load with
 * `ReferenceError: Cannot access 'Color' before initialization` — and before the guard was
 * added, the same source emitted no check and ran clean, so this was a regression that
 * arrived wearing the costume of a safety feature.
 *
 * Comment-vs-code (review lens 2), in a place where the comment stated the correct
 * requirement and the code contradicted it line-for-line.
 *
 * The fix is a hoisted `var` sentinel: `var` exists (as `undefined`) from scope entry, so
 * the guard can ask "initialised yet?" without touching the binding, at zero runtime cost.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const run = (src: string, expr: string) =>
  new Function(
    `${tjs(src, { filename: 'tdz.tjs', runTests: false }).code}\nreturn ${expr}`
  )()

describe('a type used before its declaration does not crash the module', () => {
  it('Enum declared after the function that names it', () => {
    const src = `
function paint(c: Color) { return c }
const first = paint('red')
Enum Color 'a colour' {
  Red = 'red'
  Green = 'green'
}
`
    expect(run(src, 'first')).toBe('red')
  })

  it('Type declared after the function that names it', () => {
    const src = `
function double(n: Even) { return n * 2 }
const early = double(4)
Type Even 'an even number' {
  example: 0
  predicate(v) { return v % 2 === 0 }
}
`
    expect(run(src, 'early')).toBe(8)
  })

  it('the early call is UNCHECKED, not silently wrong', () => {
    // Degrading to unchecked is the deliberate choice — a legal ordering must not become
    // a crash. It is not a promise that the value was validated.
    const src = `
function double(n: Even) { return n * 2 }
const early = double(3)
Type Even 'an even number' {
  example: 0
  predicate(v) { return v % 2 === 0 }
}
`
    expect(run(src, 'early')).toBe(6)
  })
})

describe('checking still works once the type is initialised', () => {
  // The other direction: a guard that always short-circuited would pass every test above
  // and validate nothing. This is the control.
  const src = `
Type Even 'an even number' {
  example: 0
  predicate(v) { return v % 2 === 0 }
}
function double(n: Even) { return n * 2 }
`

  it('accepts a valid value', () => {
    expect(run(src, 'double(4)')).toBe(8)
  })

  it('REJECTS an invalid value', () => {
    expect(String(run(src, 'double(3)'))).toContain('Even')
  })

  it('rejects after a late declaration too, once evaluation has finished', () => {
    // Declaration order only affects calls made DURING module evaluation. A call made
    // afterwards must be fully checked.
    const late = `
function double(n: Even) { return n * 2 }
Type Even 'an even number' {
  example: 0
  predicate(v) { return v % 2 === 0 }
}
`
    expect(String(run(late, 'double(3)'))).toContain('Even')
    expect(run(late, 'double(4)')).toBe(8)
  })
})
