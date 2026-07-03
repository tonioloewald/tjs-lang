/**
 * `tjs-lang/schema` — tosijs-schema pre-wired with predicate support. Importing
 * the module should make `$predicate` validation work with no manual wiring, and
 * re-export the whole tosijs-schema surface. Runs against the real published
 * tosijs-schema (node_modules), so it also guards the version/API contract.
 */
import { describe, it, expect, afterAll } from 'bun:test'
import {
  validate,
  s,
  setPredicateEvaluator,
  getPredicateEvaluator,
  installPredicateSupport,
  predicateSupportInstalled,
  createPredicateEvaluator,
} from './index'
import { cssStyleSchema, cssColorSchema } from '../css'

// Leave the global evaluator registered for other suites (import order is
// nondeterministic); this module's contract is "installed after import".
afterAll(() => installPredicateSupport())

describe('tjs-lang/schema is batteries-included', () => {
  it('registers the predicate evaluator on import', () => {
    expect(predicateSupportInstalled()).toBe(true)
    expect(typeof getPredicateEvaluator()).toBe('function')
  })

  it('re-exports the tosijs-schema surface', () => {
    expect(typeof validate).toBe('function')
    expect(typeof s).toBe('object') // the builder proxy
    expect(typeof setPredicateEvaluator).toBe('function')
    expect(typeof createPredicateEvaluator).toBe('function')
  })

  it('validates a $predicate node out of the box (CSS color)', () => {
    const color = cssColorSchema()
    expect(validate('#3a3', color)).toBe(true)
    expect(validate('notacolor', color)).toBe(false) // predicate ran, no manual wiring
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
    // naive: only `type: string` is checked, so a non-color string passes
    expect(validate('notacolor', color)).toBe(true)
    // re-install for the remaining assertions
    installPredicateSupport()
    expect(validate('notacolor', color)).toBe(false)
  })

  it('installPredicateSupport accepts custom options (fuel budget)', () => {
    installPredicateSupport({ fuel: 500_000 })
    expect(predicateSupportInstalled()).toBe(true)
    expect(validate('#fff', cssColorSchema())).toBe(true)
  })
})
