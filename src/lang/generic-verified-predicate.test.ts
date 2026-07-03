/**
 * Generic-Type predicates verify too — they compose with their type-param checks
 * (`T(x)` → `checkT(x)`), which the verifier accepts as composition with another
 * safe predicate (via `knownPredicates`). Safe → fuel-bounded native guard;
 * unverifiable → raw fallback (TJS ⊇ JS).
 */
import { describe, it, expect } from 'bun:test'
import { preprocess } from './parser'

const src = (s: string) => preprocess(s).source

describe('Generic predicate → verified fuel-bounded guard', () => {
  it('verifies a generic predicate that composes a type-param check', () => {
    const out = src(
      `Generic Box<T> {\n  description: 'a boxed value'\n  predicate(x, T) { return typeof x === 'object' && x !== null && T(x.value) }\n}`
    )
    expect(out).toContain('const Box = Generic(')
    expect(out).toContain('__fuel') // verified as safe
    expect(out).toContain('checkT(') // type-param composition preserved
  })

  it('verifies a two-type-param generic predicate', () => {
    const out = src(
      `Generic Pair<T, U> {\n  description: 'a pair'\n  predicate(x, T, U) { return T(x[0]) && U(x[1]) }\n}`
    )
    expect(out).toContain('__fuel')
    expect(out).toContain('checkT(')
    expect(out).toContain('checkU(')
  })

  it('falls back for an unverifiable generic predicate (loop)', () => {
    const out = src(
      `Generic AllOf<T> {\n  description: 'all match'\n  predicate(xs, T) { for (const x of xs) { if (!T(x)) return false } return true }\n}`
    )
    expect(out).not.toContain('__fuel') // not certified
    expect(out).toContain('for (const x of xs)') // raw body preserved
    expect(out).toContain('checkT') // type-param rewrite still applied
  })
})
