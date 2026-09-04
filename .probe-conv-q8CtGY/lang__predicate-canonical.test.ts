/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  canonicalizePredicate,
  predicateKey,
  PredicateNotVerifiedError,
} from '/Users/tonioloewald/tjs-lang/src/lang/predicate-canonical'

describe('canonical predicates: identity is meaning, not spelling', () => {
  const base = `function isAdult(p) { const age = p.age; return age >= 18 }`
  it('formatting, comments and local names do not change identity', () => {
    const reformatted = `
      // eligibility check
      function isAdult( person ) {
        const yrs   = person.age
        return yrs >= 18
      }`
    expect(predicateKey(reformatted)).toBe(predicateKey(base))
  })
  it('literal SPELLING does not change identity, but literal VALUE does', () => {
    expect(predicateKey(`function isAdult(p) { return p.age >= 1.8e1 }`)).toBe(
      predicateKey(`function isAdult(p) { return p.age >= 18 }`)
    )
    expect(predicateKey(`function isAdult(p) { return p.age >= 21 }`)).not.toBe(
      predicateKey(`function isAdult(p) { return p.age >= 18 }`)
    )
  })
  it('operator changes change identity', () => {
    const strict = `function isAdult(p) { const age = p.age; return age > 18 }`
    expect(predicateKey(strict)).not.toBe(predicateKey(base))
  })
  it('field names are meaning, not variables (p.age vs p.years differ)', () => {
    const other = `function isAdult(p) { const age = p.years; return age >= 18 }`
    expect(predicateKey(other)).not.toBe(predicateKey(base))
  })
  it('identity covers the whole cluster, not just the entry', () => {
    const one = `
      function ok(v) { return v > 0 }
      function check(p) { return ok(p.n) }`
    const two = `
      function ok(v) { return v > 100 }
      function check(p) { return ok(p.n) }`
    expect(predicateKey(one)).not.toBe(predicateKey(two))
  })
  it('is stable across repeated canonicalization (deterministic)', () => {
    const a = canonicalizePredicate(base)
    const b = canonicalizePredicate(base)
    expect(a.canonical).toBe(b.canonical)
    expect(a.key).toBe(b.key)
  })
  it('exposes the normalized AST as the pushdown/splice payload', () => {
    const { ast, entry, canonical } = canonicalizePredicate(base)
    expect(entry).toBe('isAdult')
    expect(ast).toBeDefined()

    expect(() => JSON.parse(canonical)).not.toThrow()
  })
  it('canonicalization is STRUCTURAL: introducing a local changes identity', () => {
    const direct = `function f(p) { return p.age >= 18 }`
    const viaLocal = `function f(p) { const a = p.age; return a >= 18 }`
    expect(predicateKey(direct)).not.toBe(predicateKey(viaLocal))
  })
  it('refuses to mint an identity for an unverified (impure) predicate', () => {
    expect(() =>
      canonicalizePredicate(`function stale(p) { return Date.now() > p.t }`)
    ).toThrow(PredicateNotVerifiedError)
  })
  it('an explicit entry selects which predicate the identity describes', () => {
    const src = `
      function a(v) { return v > 1 }
      function b(v) { return v > 2 }`
    expect(canonicalizePredicate(src, { entry: 'a' }).entry).toBe('a')
    expect(predicateKey(src, { entry: 'a' })).not.toBe(
      predicateKey(src, { entry: 'b' })
    )
  })
})
