/**
 * Direct unit tests for the shared ReDoS star-height detector (src/redos.ts).
 * It backs both the predicate verifier and the VM's regexMatch, so the
 * bounded-vs-unbounded and star-height contract is pinned here once.
 */
import { describe, it, expect } from 'bun:test'
import {
  reDoSRisk,
  unboundedQuantifierLen,
  alternationOverlapRisk,
} from './redos'

describe('reDoSRisk — star-height ≥ 2 detection', () => {
  it('flags the classic exponential shapes', () => {
    for (const p of [
      '(a+)+',
      '(a*)*',
      '(a+)*',
      '([a-z]+)+',
      '(.*)*',
      '(.+)+',
    ]) {
      expect(reDoSRisk(p), p).not.toBeNull()
    }
  })

  it('flags star-height-2 through a NESTED group (the B2 blocker shape)', () => {
    for (const p of ['((a+))+', '((a+))+$', '(([a-z]+))*', '((a*))*']) {
      expect(reDoSRisk(p), p).not.toBeNull()
    }
  })

  it('flags an unbounded {n,} outer quantifier on a quantified group', () => {
    expect(reDoSRisk('(a+){2,}')).not.toBeNull()
    expect(reDoSRisk('(a+){10,}')).not.toBeNull()
  })

  it('does NOT flag safe patterns (no nested unbounded quantifier)', () => {
    for (const p of [
      '^[a-z]+$',
      '\\d{3}-\\d{4}',
      '^hello.*world$',
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+',
      '(abc){3}', // bounded outer on a group with no inner quantifier
      '(\\d{3})-(\\d{4})', // grouped captures, bounded
      '(a+){2,4}', // BOUNDED outer — not exponential
    ]) {
      expect(reDoSRisk(p), p).toBeNull()
    }
  })

  it('returns null for documented-out-of-scope polynomial cases', () => {
    // adjacent overlapping quantifiers — polynomial, not the exponential class
    expect(reDoSRisk('\\d+\\d+$')).toBeNull()
    expect(reDoSRisk('a.*a.*a')).toBeNull()
  })
})

describe('unboundedQuantifierLen', () => {
  it('recognizes unbounded quantifiers and their lazy variants', () => {
    expect(unboundedQuantifierLen('a+', 1)).toBe(1) // +
    expect(unboundedQuantifierLen('a*', 1)).toBe(1) // *
    expect(unboundedQuantifierLen('a+?', 1)).toBe(2) // lazy +
    expect(unboundedQuantifierLen('a*?', 1)).toBe(2) // lazy *
    expect(unboundedQuantifierLen('a{2,}', 1)).toBe(4) // {2,}
  })

  it('treats bounded quantifiers as not-unbounded (returns 0)', () => {
    expect(unboundedQuantifierLen('a{3}', 1)).toBe(0) // exact
    expect(unboundedQuantifierLen('a{2,4}', 1)).toBe(0) // bounded range
    expect(unboundedQuantifierLen('a?', 1)).toBe(0) // optional
    expect(unboundedQuantifierLen('ab', 1)).toBe(0) // no quantifier
  })
})

describe('alternationOverlapRisk', () => {
  it('flags identical-branch alternation under an unbounded quantifier', () => {
    expect(alternationOverlapRisk('(a|a)+')).toBe(true)
    expect(alternationOverlapRisk('(xy|xy)*')).toBe(true)
  })

  it('does not flag distinct-branch alternation', () => {
    expect(alternationOverlapRisk('(a|b)+')).toBe(false)
    expect(alternationOverlapRisk('(cat|dog)*')).toBe(false)
  })
})
