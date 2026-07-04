/**
 * `tjs-lang/css` phase 3 — order-flexible shorthands (animation, transition).
 * The torture case: tokens in any order. Same vertical slice — the source
 * verifies safe (via `verifyCss`, all clusters) and compiles to correct
 * validators; the `$predicate` schemas validate the shorthand grammar.
 */
import { describe, it, expect } from 'bun:test'
import { validatePredicateSchema } from '../lang/predicate-schema'
import {
  isAnimation,
  isTransition,
  isTimingFunction,
  cssAnimationSchema,
  cssTransitionSchema,
  verifyCss,
} from './index'

describe('all clusters (incl. shorthands) are predicate-safe', () => {
  it('verifyCss covers the shorthand cluster', () => {
    const r = verifyCss()
    if (!r.safe) console.error(r.diagnostics)
    expect(r.safe).toBe(true)
  })
})

describe('isAnimation — order-free tokens', () => {
  const valid = [
    '3s ease-in 1s infinite alternate slidein', // the PoC example
    'slidein 3s ease-in', // reordered
    'infinite alternate 3s slidein', // heavily reordered
    '1s linear',
    '200ms',
    'spin 1s cubic-bezier(0.1, 0.7, 1, 0.1) infinite',
    'spin 1s steps(4, end)',
    'var(--motion)',
    'slide 2s, fade 1s ease-out', // comma-separated list
  ]
  for (const v of valid)
    it(`accepts ${v}`, () => expect(isAnimation(v)).toBe(true))

  const invalid = [
    '3s @@@', // junk token
    '', // empty
    'slide 2s,', // trailing empty layer
    42,
    null,
  ]
  for (const v of invalid)
    it(`rejects ${JSON.stringify(v)}`, () => expect(isAnimation(v)).toBe(false))
})

describe('isTransition', () => {
  it('accepts', () => {
    expect(isTransition('all 0.3s ease')).toBe(true)
    expect(isTransition('color 200ms linear, background 1s')).toBe(true)
    expect(isTransition('opacity 0.2s ease-in-out 0.1s')).toBe(true)
    expect(isTransition('none')).toBe(true)
  })
  it('rejects', () => {
    expect(isTransition('color 200ms @@@')).toBe(false)
    expect(isTransition('')).toBe(false)
  })
})

describe('isTimingFunction', () => {
  it('keywords + functions', () => {
    for (const t of ['linear', 'ease-in-out', 'step-start'])
      expect(isTimingFunction(t)).toBe(true)
    expect(isTimingFunction('cubic-bezier(0.1, 0.7, 1, 0.1)')).toBe(true)
    expect(isTimingFunction('steps(4, end)')).toBe(true)
    expect(isTimingFunction('linear(0, 0.5, 1)')).toBe(true)
    expect(isTimingFunction('wobble')).toBe(false)
  })
})

describe('$predicate schemas', () => {
  it('cssAnimationSchema validates via the entry alias', () => {
    expect(
      validatePredicateSchema(cssAnimationSchema(), '1s ease infinite').valid
    ).toBe(true)
    expect(validatePredicateSchema(cssAnimationSchema(), '1s @@@').valid).toBe(
      false
    )
  })
  it('cssTransitionSchema', () => {
    expect(
      validatePredicateSchema(cssTransitionSchema(), 'all 0.3s ease').valid
    ).toBe(true)
  })
})
