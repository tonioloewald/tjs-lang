/**
 * `createPredicateEvaluator` — the pluggable `(source, value) => boolean` bridge
 * a zero-dep, predicate-aware JSON-Schema validator (tosijs-schema) injects to
 * run `$predicate` sources. Compiles+caches per source; fails closed on an
 * unverifiable source (never a thrown error, never a silent pass).
 */
import { describe, it, expect } from 'bun:test'
import { createPredicateEvaluator } from './predicate'

const POS = 'function isPos(x) { return typeof x === "number" && x > 0 }'
const LOOPY =
  'function bad(xs) { for (const x of xs) { if (x < 0) return false } return true }'

describe('createPredicateEvaluator', () => {
  it('evaluates a safe source against values', () => {
    const evaluate = createPredicateEvaluator()
    expect(evaluate(POS, 5)).toBe(true)
    expect(evaluate(POS, -1)).toBe(false)
    expect(evaluate(POS, 'x')).toBe(false)
  })

  it('caches: compiles a source once, reuses across calls', () => {
    let unsafeCalls = 0
    const evaluate = createPredicateEvaluator({
      onUnsafe: () => unsafeCalls++,
    })
    // many evaluations of the same source — still one compile, zero warnings
    for (let i = 0; i < 100; i++) expect(evaluate(POS, i + 1)).toBe(true)
    expect(unsafeCalls).toBe(0)
  })

  it('fails closed on an unverifiable source (returns false, warns once)', () => {
    const unsafe: string[] = []
    const evaluate = createPredicateEvaluator({
      onUnsafe: (src) => unsafe.push(src),
    })
    // a loop can't be certified predicate-safe → every value is invalid
    expect(evaluate(LOOPY, [1, 2, 3])).toBe(false)
    expect(evaluate(LOOPY, [1, 2, 3])).toBe(false)
    // ...and the failure is reported exactly once (cached)
    expect(unsafe.length).toBe(1)
  })

  it('fails closed on a runaway (fuel) rather than throwing', () => {
    const evaluate = createPredicateEvaluator({ fuel: 100 })
    const recur = 'function deep(n) { return deep(n + 1) }'
    expect(evaluate(recur, 0)).toBe(false)
  })
})
