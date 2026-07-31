/**
 * Canonical predicates — the identity properties the keystone rests on.
 *
 * The whole value proposition is that a verified predicate can BE several things at
 * once (cache key, pushdown payload, auth object), and every one of those roles needs
 * the same guarantee: **semantically identical predicates share an identity, and
 * semantically different ones don't.** These tests pin exactly that, in both directions
 * — a canonicalizer that only ever collapses things is as broken as one that never does.
 */
import { describe, it, expect } from 'bun:test'
import {
  canonicalizePredicate,
  predicateKey,
  PredicateNotVerifiedError,
} from './predicate-canonical'

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
    // 18 vs 1.8e1: same number, different source text.
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
    // Same entry text, different helper body. If identity ignored helpers these would
    // collide — and a cache key that collides across different behavior is a bug that
    // serves wrong data.
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
    // The canonical string is the ground truth; it must round-trip as JSON so it can
    // be sent to a store, logged as an auth object, or spliced.
    expect(() => JSON.parse(canonical)).not.toThrow()
  })

  it('refuses to mint an identity for an unverified (impure) predicate', () => {
    // Identity implies "same input ⇒ same result". Date.now() breaks that, so a key
    // would be a lie — two runs of the *same* canonical form can disagree.
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
