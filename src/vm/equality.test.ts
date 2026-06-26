import { describe, it, expect } from 'bun:test'
import { evaluateExpr } from './runtime'

/**
 * AJS `==`/`!=` must match TJS `==` (Eq): footgun-free `===`, NOT structural.
 * This used to do deep structural comparison in the VM — an early, unconsidered
 * divergence from TJS `==` (so `[1,2] == [1,2]` was `true` in AJS but `false` in
 * TJS). Now consistent: distinct objects/arrays are distinct; structural
 * equality is an explicit operation, never `==`.
 */
const lit = (value: unknown) => ({ $expr: 'literal' as const, value })
const evalEq = (op: '==' | '!=', a: unknown, b: unknown) =>
  evaluateExpr(
    { $expr: 'binary', op, left: lit(a), right: lit(b) } as any,
    { state: {}, args: {} } as any
  )

describe('AJS == / != — footgun-free, NOT structural (consistent with TJS)', () => {
  it('distinct arrays/objects are NOT equal (the divergence fix)', () => {
    expect(evalEq('==', [1, 2], [1, 2])).toBe(false)
    expect(evalEq('==', { a: 1 }, { a: 1 })).toBe(false)
    expect(evalEq('!=', [1, 2], [1, 2])).toBe(true)
  })

  it('identity still holds for the same reference', () => {
    const shared = { a: 1 }
    expect(evalEq('==', shared, shared)).toBe(true)
    const arr = [1, 2]
    expect(evalEq('==', arr, arr)).toBe(true)
  })

  it('no type coercion', () => {
    expect(evalEq('==', '5', 5)).toBe(false)
    expect(evalEq('==', '', false)).toBe(false)
    expect(evalEq('==', 0, false)).toBe(false)
  })

  it('unwraps boxed primitives', () => {
    expect(evalEq('==', new Boolean(false) as any, false)).toBe(true)
    expect(evalEq('==', new Number(5) as any, 5)).toBe(true)
  })

  it('null/undefined equal; NaN equal to itself', () => {
    expect(evalEq('==', null, undefined)).toBe(true)
    expect(evalEq('==', NaN, NaN)).toBe(true)
    expect(evalEq('==', null, 0)).toBe(false)
  })

  it('scalars compare as expected', () => {
    expect(evalEq('==', 1, 1)).toBe(true)
    expect(evalEq('==', 'x', 'x')).toBe(true)
    expect(evalEq('!=', 1, 2)).toBe(true)
  })

  it('=== / !== remain strict identity (unchanged)', () => {
    expect(evalEq('===' as any, [1], [1])).toBe(false)
    expect(evalEq('===' as any, 5, 5)).toBe(true)
  })
})
