/* tjs <- input.ts */

import { describe, it, expect, afterAll } from 'bun:test'

import {
  validate,
  s,
  setPredicateEvaluator,
  getPredicateEvaluator,
  installPredicateSupport,
  predicateSupportInstalled,
  createPredicateEvaluator,
} from '/Users/tonioloewald/tjs-lang/src/schema/index'

import {
  cssStyleSchema,
  cssColorSchema,
} from '/Users/tonioloewald/tjs-lang/src/css'

afterAll(() => installPredicateSupport())

describe('tjs-lang/schema is batteries-included', () => {
  it('registers the predicate evaluator on import', () => {
    expect(predicateSupportInstalled()).toBe(true)
    expect(typeof getPredicateEvaluator()).toBe('function')
  })
  it('re-exports the tosijs-schema surface', () => {
    expect(typeof validate).toBe('function')
    expect(typeof s).toBe('object')
    expect(typeof setPredicateEvaluator).toBe('function')
    expect(typeof createPredicateEvaluator).toBe('function')
  })
  it('validates a $predicate node out of the box (CSS color)', () => {
    const color = cssColorSchema()
    expect(validate('#3a3', color)).toBe(true)
    expect(validate('notacolor', color)).toBe(false)
  })
  it('validates the recursive CSS style structure', () => {
    const style = cssStyleSchema()
    expect(
      validate({ color: 'red', '&:hover': { color: 'var(--accent)' } }, style)
    ).toBe(true)
    expect(validate({ '  bad key  ': 'red' }, style)).toBe(false)
    expect(validate('not-an-object', style)).toBe(false)
  })
  it('opting out (setPredicateEvaluator(null)) falls back to structural only', () => {
    setPredicateEvaluator(null)
    const color = cssColorSchema()

    expect(validate('notacolor', color)).toBe(true)

    installPredicateSupport()
    expect(validate('notacolor', color)).toBe(false)
  })
  it('installPredicateSupport accepts custom options (fuel budget)', () => {
    installPredicateSupport({ fuel: 500_000 })
    expect(predicateSupportInstalled()).toBe(true)
    expect(validate('#fff', cssColorSchema())).toBe(true)
  })
})
