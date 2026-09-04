/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { emitVerifiedPredicate } from '/Users/tonioloewald/tjs-lang/src/lang/predicate'

/* line 13 */
function guardFrom(code) {
  return new Function(`return (${code})`)()
}
guardFrom.__tjs = {
  params: {
    code: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'any',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:13',
}

describe('emitVerifiedPredicate', () => {
  it('emits a self-contained guard for a safe predicate', () => {
    const r = emitVerifiedPredicate(
      'function isPos(x) { return x > 0 }',
      'isPos'
    )
    expect(r.safe).toBe(true)
    expect(r.diagnostics).toEqual([])
    expect(typeof r.code).toBe('string')
    const guard = guardFrom(r.code)
    expect(guard(5)).toBe(true)
    expect(guard(-1)).toBe(false)
    expect(guard(0)).toBe(false)
  })
  it('coerces the guard result to a real boolean', () => {
    const r = emitVerifiedPredicate(
      'function nonEmpty(s) { return s && s.length }',
      'nonEmpty'
    )
    const guard = guardFrom(r.code)
    expect(guard('hi')).toBe(true)
    expect(guard('')).toBe(false)
  })
  it('supports composition + array methods (fuel-bounded iteration)', () => {
    const src =
      'function isWord(s) { return typeof s === "string" && s.length > 0 }\n' +
      'function allWords(xs) { return Array.isArray(xs) && xs.every(isWord) }'
    const r = emitVerifiedPredicate(src, 'allWords')
    expect(r.safe).toBe(true)
    const guard = guardFrom(r.code)
    expect(guard(['a', 'b'])).toBe(true)
    expect(guard(['a', ''])).toBe(false)
    expect(guard('nope')).toBe(false)
  })
  it('rejects an unsafe predicate (loop) with diagnostics, no code', () => {
    const r = emitVerifiedPredicate(
      'function f(xs) { for (const x of xs) { if (x < 0) return false } return true }',
      'f'
    )
    expect(r.safe).toBe(false)
    expect(r.code).toBeUndefined()
    expect(r.diagnostics.length).toBeGreaterThan(0)
    expect(r.diagnostics[0].message).toMatch(/loop/i)
  })
  it('rejects an impure predicate (effectful call)', () => {
    const r = emitVerifiedPredicate('function f(x) { return fetch(x) }', 'f')
    expect(r.safe).toBe(false)
    expect(r.code).toBeUndefined()
  })
  it('reports a missing entry name as unsafe', () => {
    const r = emitVerifiedPredicate(
      'function isPos(x) { return x > 0 }',
      'nope'
    )
    expect(r.safe).toBe(false)
    expect(r.diagnostics[0].message).toMatch(/not found/i)
  })
  it('returns false (does not throw) on a runaway input — DoS-safe guard', () => {
    const r = emitVerifiedPredicate(
      'function deep(n) { return deep(n + 1) }',
      'deep',
      { fuel: 100 }
    )
    expect(r.safe).toBe(true)
    const guard = guardFrom(r.code)
    expect(guard(0)).toBe(false)
  })
})
