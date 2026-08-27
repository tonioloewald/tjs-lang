/**
 * `applyEdits` — the boundary case that used to corrupt output silently.
 *
 * The emitter applied deletions and insertions in two phases, adjusting each insertion's
 * position by the total length of deletions starting before it. That arithmetic cannot tell
 * an insertion sitting exactly ON a deleted span's END from one INSIDE it, so text meant to
 * follow a rewritten expression was relocated to before it — with no error.
 *
 * These tests are about the model, not about any one caller. The first is the shape that
 * shipped broken; the rest pin the contract the emitter's twenty call sites rely on.
 */
import { describe, it, expect } from 'bun:test'
import { applyEdits, type SourceEdit } from './source-edits'

const E = (start: number, end: number, text: string): SourceEdit => ({
  start,
  end,
  text,
})

describe('the boundary case', () => {
  it('an insertion at a replacement’s END lands AFTER it', () => {
    // `return a ? b : c` with the ternary replaced and a `}` closing the arm after it.
    // The old adjustment produced `}` first, i.e. `{ } REPLACED`.
    const src = 'return TERNARY'
    const out = applyEdits(src, [
      E(7, 14, 'REPLACED'), // the ternary
      E(14, 14, ' }'), // close the switch arm, at the statement's end
    ])
    expect(out).toBe('return REPLACED }')
  })

  it('an insertion at a replacement’s START lands BEFORE it', () => {
    const src = 'return TERNARY'
    const out = applyEdits(src, [E(7, 14, 'REPLACED'), E(7, 7, '{ ')])
    expect(out).toBe('return { REPLACED')
  })

  it('the two are not confused with each other', () => {
    // Both at once — the switch-arm case in full.
    const src = 'return TERNARY'
    const out = applyEdits(src, [
      E(7, 7, '{ '),
      E(7, 14, 'REPLACED'),
      E(14, 14, ' }'),
    ])
    expect(out).toBe('return { REPLACED }')
  })
})

describe('the emitter’s existing idioms keep working', () => {
  it('delete a span and insert at its start means REPLACE', () => {
    // How every rewrite in js.ts is expressed: one deletion plus a zero-width insertion.
    const out = applyEdits('abcdef', [E(1, 4, ''), E(1, 1, 'XY')])
    expect(out).toBe('aXYef')
  })

  it('several insertions at one position keep their established order', () => {
    // The old code applied insertions in DESCENDING position order, so at a shared offset
    // the one pushed LAST ended up leftmost. Arrow-parameter validation emits several
    // fragments at one offset and depends on it; changing this silently reordered a
    // validation prologue, which is how the contract was discovered.
    const out = applyEdits('ab', [E(1, 1, 'first'), E(1, 1, 'second')])
    expect(out).toBe('asecondfirstb')
  })

  it('a pure deletion removes exactly its span', () => {
    expect(applyEdits('abcdef', [E(2, 4, '')])).toBe('abef')
  })

  it('edits are independent of the order they were pushed', () => {
    const edits = [E(8, 9, 'Z'), E(0, 1, 'A'), E(4, 5, 'M')]
    expect(applyEdits('0123456789', [...edits])).toBe('A123M567Z9')
    expect(applyEdits('0123456789', [...edits].reverse())).toBe('A123M567Z9')
  })

  it('no edits changes nothing', () => {
    expect(applyEdits('unchanged', [])).toBe('unchanged')
  })
})

describe('conflicts fail loudly instead of emitting something', () => {
  it('an insertion strictly INSIDE a replaced span throws', () => {
    // This has no defined meaning — the text it addressed no longer exists. The old model
    // silently produced a result anyway.
    expect(() =>
      applyEdits('return TERNARY', [E(7, 14, 'REPLACED'), E(10, 10, 'X')])
    ).toThrow(/Overlapping source edits/)
  })

  it('two partially overlapping replacements throw', () => {
    expect(() => applyEdits('abcdefgh', [E(1, 5, 'X'), E(3, 7, 'Y')])).toThrow(
      /Overlapping source edits/
    )
  })

  it('the message says what to do about it', () => {
    // A compiler-internal invariant failing should tell the next person the remedy, not
    // just the symptom — the release's own measured finding about remedies.
    expect(() => applyEdits('abcdefgh', [E(1, 5, 'X'), E(3, 7, 'Y')])).toThrow(
      /gap text/
    )
  })

  it('IDENTICAL duplicate edits are a no-op, not a conflict', () => {
    // Two passes independently deciding to delete the same span agree with each other, and
    // agreement is not corruption. Only disagreement is.
    expect(applyEdits('abcdef', [E(1, 3, 'X'), E(1, 3, 'X')])).toBe('aXdef')
  })

  it('adjacent edits touching at an endpoint are NOT an overlap', () => {
    expect(applyEdits('abcdef', [E(1, 3, 'X'), E(3, 5, 'Y')])).toBe('aXYf')
  })
})
