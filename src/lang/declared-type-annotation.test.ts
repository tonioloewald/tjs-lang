/**
 * A `Type` declared in this module must actually check when used as an annotation.
 *
 * It didn't. `Type EvenNumber { example: 2, predicate(x) { … } }` built a real,
 * *verified*, fuel-bounded predicate object — `EvenNumber.check(3)` returned `false`
 * correctly — and then `function double(n: EvenNumber)` emitted `function double(n) {`
 * with no check at all. A working guard sat one line above a function that named it and
 * ignored it, so `double(3)` returned 6 and `double('x')` returned NaN.
 *
 * Three things made it worse than a plain gap:
 *   - `TJS-FOR-TS.md` already documents the usage (`function find(id: number): User`)
 *   - no test asserted it, so the feature was decorative without anything noticing
 *   - the degradation warning suggested "or a predicate: `Type X { predicate(v) {…} }`"
 *     to a file that already declared exactly that — a remedy that IS the thing you did
 *
 * 0.13.0 made sound TypeScript names (`string`, `number`, …) produce real runtime checks.
 * This is the other half of that work: user-declared types. It is also a prerequisite for
 * the `type` → `Type` direction — translating TS `type Email = string` is pointless if
 * every use site `e: Email` then checks nothing.
 *
 * Semantics (deliberate): a declared Type validates by **example-inferred structure AND
 * the predicate**, structure first — which is what lets a predicate be written tersely
 * (`/re/.test(Email)`) without re-checking the shape it can already assume.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

/** Transpile and run, returning either the value or the MonadicError's `expected`. */
function call(src: string, expr: string): unknown {
  const code = tjs(src, { runTests: false }).code
  const v = new Function(`${code}\nreturn ${expr}`)() as any
  return v && v.name === 'MonadicError' ? `Error(${v.expected})` : v
}

const EVEN = `Type EvenNumber {
  description: 'an even number'
  example: 2
  predicate(x) { return x % 2 === 0 }
}
function double(n: EvenNumber) { return n * 2 }
`

describe('a declared Type used as an annotation validates', () => {
  it('accepts a value satisfying structure and predicate', () => {
    expect(call(EVEN, 'double(4)')).toBe(8)
  })

  it('rejects a value failing the PREDICATE', () => {
    // Structurally an integer, but odd. Used to return 6.
    expect(call(EVEN, 'double(3)')).toBe('Error(EvenNumber)')
  })

  it('rejects a value failing the EXAMPLE-INFERRED STRUCTURE', () => {
    // The predicate alone (`x % 2 === 0`) would not catch a string — 'x' % 2 is NaN,
    // NaN === 0 is false, so it happens to work here — but a float would slip through
    // a predicate-only check. Structure comes from the example, and is checked first.
    expect(call(EVEN, `double('x')`)).toBe('Error(EvenNumber)')
    expect(call(EVEN, 'double(2.5)')).toBe('Error(EvenNumber)')
  })

  it('names the TYPE in the error, not the mechanism', () => {
    // "Expected declared" names the implementation and tells the reader nothing.
    const code = tjs(EVEN, { runTests: false }).code
    expect(code).toContain('EvenNumber')
    expect(code).not.toContain(`'declared'`)
  })

  it('no longer warns that a declared type is unresolvable', () => {
    const r = tjs(EVEN, { runTests: false })
    const noise = (r.warnings ?? []).filter((w) => /EvenNumber/.test(w))
    expect(noise).toEqual([])
  })

  it('gets object-ness right, including null', () => {
    const src = `Type Point {
  description: 'a 2d point'
  example: { x: 0.0, y: 0.0 }
  predicate(p) { return p.x !== p.y }
}
function slope(p: Point) { return p.y / p.x }
`
    expect(call(src, 'slope({x: 2.0, y: 4.0})')).toBe(2)
    // typeof null === 'object' is the footgun this must not inherit.
    expect(call(src, 'slope(null)')).toBe('Error(Point)')
    expect(call(src, `slope('nope')`)).toBe('Error(Point)')
    expect(call(src, 'slope({x: 1.0})')).toBe('Error(Point)') // missing member
    expect(call(src, 'slope({x: 3.0, y: 3.0})')).toBe('Error(Point)') // predicate
  })

  it('is cheap to satisfy when the predicate is cheap — the NonEmpty pattern', () => {
    // The point of a refinement type: an O(1) guard at the boundary rather than an
    // O(n) element scan. What the elements ARE is checked wherever one escapes.
    const src = `Type NonEmpty {
  description: 'an array with at least one element'
  example: []
  predicate(x) { return x.length > 0 }
}
function first(things: NonEmpty) { return things[0] }
`
    expect(call(src, 'first([7, 8])')).toBe(7)
    expect(call(src, 'first([])')).toBe('Error(NonEmpty)')
    expect(call(src, `first('nope')`)).toBe('Error(NonEmpty)')
  })

  it('leaves a genuinely unknown type unresolved and best-effort', () => {
    // The degradation path is CORRECT for a type that isn't declared — it preserves
    // TJS ⊇ JS. The bug was that it fired on types that were.
    const src = `function f(x: SomethingUndeclared) { return x }`
    const r = tjs(src, { runTests: false })
    expect(call(src, 'f(1)')).toBe(1) // unchecked, not an error
    expect((r.warnings ?? []).some((w) => /SomethingUndeclared/.test(w))).toBe(
      true
    )
  })
})
