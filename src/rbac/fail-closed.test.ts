/**
 * A rule that does not return a boolean DENIES. It never coerces.
 *
 * GUARDRAIL, and a regression pin for #54. `interpretRuleResult` ended with
 *
 *     return { allowed: !!result, reason: result ? null : 'Access denied' }
 *
 * so any non-boolean return was coerced — and every truthy one GRANTED. Combined with #52
 * (a dotted read returning its own source text) the obvious rule inverted:
 *
 *     return doc.published        // doc.published === false
 *     -> 'doc.published'          // a non-empty string (#52)
 *     -> !!'doc.published'        // true
 *     -> ACCESS GRANTED
 *
 * #52 is fixed, so that particular input can no longer arrive. This is a separate defect and
 * is fixed on its own terms, because "the input cannot be corrupted any more" is not the same
 * as "the interpretation is correct". **A security property must not depend on the language
 * never having a bug.** Any future defect, or a rule that simply returns something unexpected
 * — a nullish-coalescing chain, an accidental object, a Promise — must fail CLOSED.
 *
 * This also restores a claim the surrounding design already made, and which the reference
 * implementation was the one place not to honour: *fuel exhaustion, a thrown error, or a
 * non-boolean return all evaluate as `false`*.
 */
import { describe, it, expect } from 'bun:test'
import { interpretRuleResult } from './index'

describe('a non-boolean rule result denies (#54)', () => {
  // Every one of these GRANTED before the fix, because each is truthy.
  const TRUTHY_NON_BOOLEANS: Array<[string, unknown]> = [
    ['the #52 shape — a dot path returned as text', 'doc.published'],
    ['any non-empty string', 'yes'],
    ['a number', 1],
    ['an array', [1]],
    ['an object with no `allow` key', { reason: 'because' }],
    ['a non-boolean `allow`', { allow: 'yes' }],
    ['a Promise (a forgotten await)', Promise.resolve(true)],
  ]

  for (const [label, value] of TRUTHY_NON_BOOLEANS) {
    it(`denies: ${label}`, () => {
      expect({ [label]: interpretRuleResult(value).allowed }).toEqual({
        [label]: false,
      })
    })

    it(`says why, rather than just "Access denied": ${label}`, () => {
      // A denial that reads like an ordinary policy decision hides a broken rule. The reason
      // has to distinguish "the rule said no" from "the rule did not answer".
      expect(String(interpretRuleResult(value).reason)).toContain('boolean')
    })
  }

  const FALSY: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['zero', 0],
  ]

  for (const [label, value] of FALSY) {
    it(`still denies: ${label}`, () => {
      expect({ [label]: interpretRuleResult(value).allowed }).toEqual({
        [label]: false,
      })
    })
  }
})

describe('...and real boolean rules are untouched (control)', () => {
  // Every assertion above is satisfied by an implementation that denies everything.
  it('true grants', () => {
    expect(interpretRuleResult(true)).toEqual({ allowed: true, reason: null })
  })

  it('false denies with the ordinary reason', () => {
    expect(interpretRuleResult(false).allowed).toBe(false)
    expect(interpretRuleResult(false).reason).toBe('Access denied')
  })

  it('the structured form still works', () => {
    expect(interpretRuleResult({ allow: true }).allowed).toBe(true)
    expect(interpretRuleResult({ allow: false }).allowed).toBe(false)
  })

  it('the structured form keeps a custom reason', () => {
    expect(
      interpretRuleResult({ allow: false, reason: 'not yours' }).reason
    ).toBe('not yours')
  })
})
