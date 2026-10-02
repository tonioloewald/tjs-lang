/**
 * `createPredicateEvaluator` — the pluggable `(source, value) => boolean` bridge
 * a zero-dep, predicate-aware JSON-Schema validator (tosijs-schema) injects to
 * run `$predicate` sources. Compiles+caches per source; fails closed on an
 * unverifiable source (never a thrown error, never a silent pass).
 */
import { describe, it, expect } from 'bun:test'
import {
  createPredicateEvaluator,
  isTrustedPredicate,
  trustPredicate,
} from './predicate'

// These sources are the HOST's (this test wrote them), so they are registered as trusted.
const POS = trustPredicate(
  'function isPos(x) { return typeof x === "number" && x > 0 }'
)
const LOOPY = trustPredicate(
  'function bad(xs) { for (const x of xs) { if (x < 0) return false } return true }'
)

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
    const recur = trustPredicate('function deep(n) { return deep(n + 1) }')
    expect(evaluate(recur, 0)).toBe(false)
  })
})

describe('only trusted sources run (rc.2 twelfth re-review: Tonio, 2026-10-02)', () => {
  // A predicate compiles to native JavaScript, and a syntactic verifier cannot make hostile
  // JavaScript safe: `['(a+)+$',''].reduce(RegExp).test(s)` verified, and ran exponentially.
  const HOSTILE =
    "function p(s) { return ['(a+)+$', ''].reduce(RegExp).test(s) }"

  it('an unregistered source fails closed, saying why, without compiling', () => {
    const reasons: string[] = []
    const evaluate = createPredicateEvaluator({
      onUnsafe: (_src, e) => reasons.push(e.message),
    })
    const t = performance.now()
    expect(evaluate(HOSTILE, 'a'.repeat(30) + '!')).toBe(false)
    expect(performance.now() - t).toBeLessThan(50)
    expect(reasons[0]).toMatch(/untrusted \$predicate source/)
  })

  it('a registered source runs; trustAllPredicates opts in to everything', () => {
    const src = 'function isNeg(x) { return x < 0 }'
    expect(createPredicateEvaluator({ onUnsafe: () => {} })(src, -1)).toBe(
      false
    )
    expect(
      createPredicateEvaluator({ trustAllPredicates: true })(src, -1)
    ).toBe(true)
    trustPredicate(src)
    expect(isTrustedPredicate(src)).toBe(true)
    expect(createPredicateEvaluator()(src, -1)).toBe(true)
  })

  it('the registry is shared across bundles (a Symbol.for slot, not clobberable by a name)', () => {
    const src = 'function isZero(x) { return x === 0 }'
    ;(globalThis as any)[Symbol.for('tjs.trustedPredicates.v1')].add(src)
    expect(isTrustedPredicate(src)).toBe(true)
    ;(globalThis as any).__tjs_trustedPredicates_1 = 'clobbered' // the old string slot: inert
    expect(isTrustedPredicate(src)).toBe(true)
  })

  it('a source trusted AFTER a first refusal runs at once (thirteenth re-review M1)', () => {
    const src = 'function isOdd(x) { return x % 2 === 1 }'
    const evaluate = createPredicateEvaluator({ onUnsafe: () => {} })
    expect(evaluate(src, 3)).toBe(false) // untrusted: refused
    trustPredicate(src)
    expect(evaluate(src, 3)).toBe(true) // same evaluator, no stale verdict
  })

  it('a long stream of distinct sources keeps working (the cache is bounded, FIFO)', () => {
    const evaluate = createPredicateEvaluator({ trustAllPredicates: true })
    for (let i = 0; i < 1000; i++)
      evaluate(`function p${i}(x) { return x === ${i} }`, i)
    expect(evaluate('function q(x) { return x === 1 }', 1)).toBe(true)
  })
})
