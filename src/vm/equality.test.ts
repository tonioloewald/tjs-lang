import { describe, it, expect } from 'bun:test'
import { AgentVM } from './vm'
import { evaluateExpr } from './runtime'

/**
 * AJS `==`/`!=` must match TJS `==` (Eq): footgun-free `===`, NOT structural.
 * This used to do deep structural comparison in the VM — an early, unconsidered
 * divergence from TJS `==` (so `[1,2] == [1,2]` was `true` in AJS but `false` in
 * TJS). Now consistent: distinct objects/arrays are distinct; structural
 * equality is an explicit operation, never `==`.
 */
const lit = (value: unknown) => ({ $expr: 'literal' as const, value })
const evalEq = (op: '==' | '!=', a: unknown, b: unknown) =>
  evaluateExpr(
    { $expr: 'binary', op, left: lit(a), right: lit(b) } as any,
    { state: {}, args: {} } as any
  )

describe('AJS == / != — footgun-free, NOT structural (consistent with TJS)', () => {
  it('distinct arrays/objects are NOT equal (the divergence fix)', () => {
    expect(evalEq('==', [1, 2], [1, 2])).toBe(false)
    expect(evalEq('==', { a: 1 }, { a: 1 })).toBe(false)
    expect(evalEq('!=', [1, 2], [1, 2])).toBe(true)
  })

  it('identity still holds for the same reference', () => {
    const shared = { a: 1 }
    expect(evalEq('==', shared, shared)).toBe(true)
    const arr = [1, 2]
    expect(evalEq('==', arr, arr)).toBe(true)
  })

  it('no type coercion', () => {
    expect(evalEq('==', '5', 5)).toBe(false)
    expect(evalEq('==', '', false)).toBe(false)
    expect(evalEq('==', 0, false)).toBe(false)
  })

  it('unwraps boxed primitives', () => {
    expect(evalEq('==', new Boolean(false) as any, false)).toBe(true)
    expect(evalEq('==', new Number(5) as any, 5)).toBe(true)
  })

  it('null/undefined equal; NaN equal to itself', () => {
    expect(evalEq('==', null, undefined)).toBe(true)
    expect(evalEq('==', NaN, NaN)).toBe(true)
    expect(evalEq('==', null, 0)).toBe(false)
  })

  it('scalars compare as expected', () => {
    expect(evalEq('==', 1, 1)).toBe(true)
    expect(evalEq('==', 'x', 'x')).toBe(true)
    expect(evalEq('!=', 1, 2)).toBe(true)
  })

  it('=== / !== remain strict identity (unchanged)', () => {
    expect(evalEq('===' as any, [1], [1])).toBe(false)
    expect(evalEq('===' as any, 5, 5)).toBe(true)
  })
})

/**
 * The VM's equality does not run guest-supplied code, and cannot be made to throw.
 *
 * `unwrapBoxedVM` was a FOURTH hand-written copy of the boxed-primitive unwrap — and the
 * worst-placed one. `src/unwrap-boxed.ts` was created this release as "ONE definition", the
 * dedupe commit covered `lang/runtime.ts` and `emitters/js.ts`, and the VM was left behind.
 * Byte-identical, so nothing looked wrong; it was simply not connected to the module, nor
 * to the differential corpus that keeps the other copies honest.
 *
 * What made that dangerous is the gap this file closes: **no test under `src/vm/` used a
 * lying `valueOf`, a `getPrototypeOf` Proxy, or a `Symbol.hasInstance` trap.** Reverting
 * the hardening inside the VM — the copy an attacker reaches first — would have been
 * caught by nothing at all.
 *
 * The VM now imports the shared implementation, so these cases also pin that import.
 * Measured, rather than asserted: swapping it for a naive
 * `if (v instanceof Number) return v.valueOf()` fails exactly ONE of these — the lying
 * `valueOf`. The Proxy cases survive that particular naive form (a trapped `instanceof`
 * leads to `Object.prototype.valueOf`, which returns the object rather than throwing), so
 * they guard a different regression: a version that reads the slot UNGUARDED. Two hostile
 * shapes, two distinct failure modes, and neither is covered by the other.
 */
describe('VM equality is not fooled by hostile values', () => {
  const VM = new AgentVM()
  const lit = (value: unknown) => ({ $expr: 'literal', value })

  /** `a == b` as the VM evaluates it. */
  async function vmEq(a: unknown, b: unknown) {
    const r = await VM.run(
      {
        op: 'seq',
        steps: [
          { op: 'varSet', key: 'a', value: a },
          { op: 'varSet', key: 'b', value: b },
          {
            op: 'return',
            value: {
              eq: {
                $expr: 'binary',
                op: '==',
                left: { $expr: 'ident', name: 'a' },
                right: { $expr: 'ident', name: 'b' },
              },
            },
          },
        ],
      } as any,
      {} as any,
      { fuel: 1e6 }
    )
    return { eq: (r.result as any)?.eq, error: r.error?.message }
  }

  it('does not run an overridden valueOf', async () => {
    class Liar extends Number {
      valueOf() {
        return 999
      }
    }
    // The SLOT is 1. A naive `v.valueOf()` would read 999 and report equal.
    const { eq, error } = await vmEq(new Liar(1), 999)
    expect(error ?? 'ok').toBe('ok')
    expect(eq).toBe(false)
  })

  it('reads the slot, so a boxed primitive still compares equal', async () => {
    // The control: hardening that broke real unwrapping would pass the test above.
    const { eq } = await vmEq(new Number(7), 7)
    expect(eq).toBe(true)
  })

  it('a lying Proxy does not escape as a thrown exception', async () => {
    // `instanceof` can be made to lie, and the slot read then throws a raw TypeError.
    // Errors are RETURNED, not thrown — a `==` that throws breaks that outright.
    const p = new Proxy({}, { getPrototypeOf: () => Boolean.prototype })
    const { eq, error } = await vmEq(p, true)
    expect(error ?? 'ok').toBe('ok')
    expect(eq).toBe(false)
  })

  it('a Symbol.hasInstance trap does not either', async () => {
    const p = new Proxy(
      {},
      {
        get: (_t, k) => (k === Symbol.hasInstance ? () => true : undefined),
      }
    )
    const { error } = await vmEq(p, 1)
    expect(error ?? 'ok').toBe('ok')
  })

  it('no coercion — the VM `==` is footgun-free `===`', async () => {
    expect((await vmEq('5', 5)).eq).toBe(false)
    expect((await vmEq('', false)).eq).toBe(false)
    expect((await vmEq(null, undefined)).eq).toBe(true)
    void lit
  })
})
