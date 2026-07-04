/**
 * Ambient-contract spike — the `event.target` anchor + the probe→derive loop.
 *
 * The itch (user, 2026-07-03): TS flags `e.target.value` as an error
 * (`EventTarget` has no `value`), forcing a cast that adds ceremony, not safety —
 * at runtime the value is either there or it isn't. The honest tool is a pure
 * runtime predicate, and the point of this spike is: **that predicate is an
 * ordinary verified predicate** (pure, total, native, serializable), and it can
 * be *derived* from a real sample rather than hand-written.
 *
 * See docs/ambient-contracts.md.
 */
import { describe, it, expect } from 'bun:test'
import { verifyPredicate, compilePredicate } from '../../src/lang/predicate'
import { deriveShapeContract } from './probe'

// The predicate TypeScript won't let you write cleanly (`e.target.value` → error)
// is a perfectly ordinary predicate: member access is pure, `typeof` is pure.
const HAS_VALUE_TARGET = `
function hasValueTarget(e) {
  return e != null && e.target != null && typeof e.target.value === 'string'
}
`

// Synthetic event-shaped objects (a real browser would supply live ones).
const inputEvent = { type: 'input', target: { tagName: 'INPUT', value: 'hi' } }
const clickOnDiv = { type: 'click', target: { tagName: 'DIV' } }

describe('event.target as a verified predicate (the "asinine TS" antidote)', () => {
  it('the e.target.value predicate verifies as pure/safe', () => {
    const r = verifyPredicate(HAS_VALUE_TARGET)
    expect(r.safe).toBe(true) // no cast, no lie, no ceremony — just a predicate
  })

  it('compiles native and is total (no throw on a missing target)', () => {
    const { hasValueTarget } = compilePredicate(HAS_VALUE_TARGET, [
      'hasValueTarget',
    ])
    expect(hasValueTarget(inputEvent)).toBe(true)
    expect(hasValueTarget(clickOnDiv)).toBe(false) // target has no `.value`
    expect(hasValueTarget(null)).toBe(false) // total — no crash
    expect(hasValueTarget({})).toBe(false) // no target
    // usage pattern: `hasValueTarget(e) ? e.target.value : undefined` — no `as`.
  })
})

describe('probe → derive → verify → validate (contract from a sample)', () => {
  it('derives a verifiable shape contract from a real-ish input element', () => {
    // What a live probe of `event.target` would hand back for an <input>.
    const sample = {
      tagName: 'INPUT',
      value: '',
      checked: false,
      disabled: false,
      focus: () => {},
    }
    const source = deriveShapeContract(sample, 'InputEl')
    // the derived source is itself certified predicate-safe...
    const r = verifyPredicate(source)
    expect(r.safe).toBe(true)
    // ...and validates conforming vs non-conforming stand-ins.
    const { isInputEl } = compilePredicate(source, ['isInputEl'])
    expect(isInputEl(sample)).toBe(true)
    expect(
      isInputEl({
        tagName: 'INPUT',
        value: '',
        checked: false,
        disabled: false,
        focus: () => {},
      })
    ).toBe(true)
    expect(isInputEl({ tagName: 'DIV' })).toBe(false) // a div stub doesn't conform
    expect(isInputEl(null)).toBe(false)
  })
})
