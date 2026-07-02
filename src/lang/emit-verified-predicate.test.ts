/**
 * Unit tests for `emitVerifiedPredicate` — the transpile-time source emitter
 * that turns a verified-safe predicate cluster into a self-contained,
 * fuel-bounded guard expression (the foundation of wiring predicates into
 * `Type`/`FunctionPredicate`). Distinct from `compilePredicate`, which evals to
 * live closures; here we assert the emitted *string* is self-contained and
 * behaves correctly when evaluated.
 */
import { describe, it, expect } from 'bun:test'
import { emitVerifiedPredicate } from './predicate'

/** Evaluate an emitted guard expression to a callable, in an empty scope. */
function guardFrom(code: string): (...a: any[]) => boolean {
  // Indirect eval: the emitted code is a self-contained IIFE expression.
  return new Function(`return (${code})`)()
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

    const guard = guardFrom(r.code!)
    expect(guard(5)).toBe(true)
    expect(guard(-1)).toBe(false)
    expect(guard(0)).toBe(false)
  })

  it('coerces the guard result to a real boolean', () => {
    // Truthy/falsy body values must come back as strict booleans.
    const r = emitVerifiedPredicate(
      'function nonEmpty(s) { return s && s.length }',
      'nonEmpty'
    )
    const guard = guardFrom(r.code!)
    expect(guard('hi')).toBe(true)
    expect(guard('')).toBe(false)
  })

  it('supports composition + array methods (fuel-bounded iteration)', () => {
    const src =
      'function isWord(s) { return typeof s === "string" && s.length > 0 }\n' +
      'function allWords(xs) { return Array.isArray(xs) && xs.every(isWord) }'
    const r = emitVerifiedPredicate(src, 'allWords')
    expect(r.safe).toBe(true)
    const guard = guardFrom(r.code!)
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
    // Unbounded recursion: with a tiny fuel budget it must exhaust and the guard
    // answers `false` rather than hanging or throwing to the caller.
    const r = emitVerifiedPredicate(
      'function deep(n) { return deep(n + 1) }',
      'deep',
      { fuel: 100 }
    )
    expect(r.safe).toBe(true)
    const guard = guardFrom(r.code!)
    expect(guard(0)).toBe(false)
  })
})
