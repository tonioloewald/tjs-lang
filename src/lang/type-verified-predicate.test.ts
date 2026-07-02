/**
 * Integration: `Type … { predicate(x){…} }` bodies that verify as predicate-safe
 * compile to a self-contained, fuel-bounded native guard (the `emitVerifiedPredicate`
 * path); unverifiable ones fall back to the raw arrow (never rejected — TJS ⊇ JS).
 *
 * We assert against the preprocessed source: `__fuel` present ⇔ the verified
 * guard was emitted. Runtime guard behavior is covered by
 * `emit-verified-predicate.test.ts`.
 */
import { describe, it, expect } from 'bun:test'
import { preprocess } from './parser'

const src = (s: string) => preprocess(s).source

describe('Type predicate → verified fuel-bounded guard', () => {
  it('compiles a safe predicate-only Type to a fuel-bounded guard', () => {
    const out = src(`Type Pos 'positive' { predicate(x) { return x > 0 } }`)
    expect(out).toContain(`const Pos = Type('positive'`)
    expect(out).toContain('__fuel') // verified + fuel-injected
    expect(out).toContain('x > 0') // original body preserved inside the guard
  })

  it('compiles a safe predicate+example Type, keeping the example schema gate', () => {
    const out = src(
      `Type EvenNum 'even' { example: 2, predicate(x) { return x % 2 === 0 } }`
    )
    expect(out).toContain(`const EvenNum = Type('even'`)
    expect(out).toContain('__fuel') // verified
    expect(out).toContain('__tjs?.validate') // example schema still gates
    expect(out).toContain('x % 2 === 0')
  })

  it('verifies a native-TJS predicate using == (rewritten to Eq)', () => {
    // `==` → `Eq(...)`; Eq is whitelisted pure, so the predicate still verifies.
    const out = src(`Type Five 'five' { predicate(x) { return x == 5 } }`)
    expect(out).toContain('Eq(') // proves the equality rewrite ran
    expect(out).toContain('__fuel') // ...and it still verified as safe
  })

  it('falls back to the raw arrow for an unverifiable predicate (loop)', () => {
    const out = src(
      `Type AllPos 'all positive' { example: [1], predicate(xs) { for (const x of xs) { if (x <= 0) return false } return true } }`
    )
    expect(out).not.toContain('__fuel') // NOT verified → no fuel guard
    expect(out).toContain('for (const x of xs)') // raw body preserved
    expect(out).toContain('__tjs?.validate') // example gate still present
  })

  it('falls back for an impure predicate (effectful call)', () => {
    const out = src(
      `Type Reachable 'reachable' { predicate(url) { return fetch(url) } }`
    )
    expect(out).not.toContain('__fuel')
    expect(out).toContain('fetch(url)') // raw body preserved
  })
})
