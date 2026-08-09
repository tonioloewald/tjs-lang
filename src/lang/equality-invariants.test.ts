/**
 * The equality invariants, pinned.
 *
 * TJS has two equality operators and an overloaded `typeof`, and they have to agree with
 * each other or nothing above them can be reasoned about — union membership least of all,
 * since "is this literal a member" IS an equality question.
 *
 * ## The load-bearing invariant
 *
 * **`a === b` implies `a == b`.** `===` must be strictly stricter than `==`; there must be
 * no pair the identity operator accepts and the friendly one rejects. Violate it and every
 * intuition built on "`==` is the lenient one" inverts somewhere, silently.
 *
 * Checked exhaustively over a matrix rather than argued, because the interesting cases
 * (boxed primitives, `NaN`, `null`/`undefined`) are exactly the ones reasoning gets wrong.
 *
 * ## What `==` actually is
 *
 * Not `TypeOf(a) === TypeOf(b) && a == b`, which is the natural summary and is WRONG in a
 * way that matters: `TypeOf(null)` is `'null'` and `TypeOf(undefined)` is `'undefined'`, so
 * a typeof-gated `==` would make `null == undefined` FALSE. It is true, deliberately.
 *
 * `Eq` is: unwrap boxed primitives (via the prototype method, so a subclass `valueOf`
 * cannot intercept), then `===`, plus two exceptions — `NaN == NaN`, and `null == undefined`.
 *
 * ## Numbers
 *
 * `+1`, `1` and `1.0` are ONE value. The int/unsigned/float distinction is a fact about
 * the SOURCE, not the value — the same thing `docs/type-identity.md` records for `+0 === 0`
 * — and `TypeOf` reports `'number'` for all three. So no equality question can distinguish
 * them, and a numeric union cannot either.
 */
import { describe, it, expect } from 'bun:test'
import { Eq, TypeOf } from './runtime'

/** Values chosen for the cases reasoning gets wrong, not for coverage. */
const VALUES: Array<[string, unknown]> = [
  ['1', 1],
  ['1.0', 1.0],
  ['+1', +1],
  ['new Number(1)', new Number(1)],
  ['0', 0],
  ['-0', -0],
  ["'1'", '1'],
  ['true', true],
  ['false', false],
  ['null', null],
  ['undefined', undefined],
  ['NaN', NaN],
  ['{}', {}],
  ['[]', []],
]

describe('=== is strictly stricter than ==', () => {
  it('every pair `a === b` also satisfies `a == b`', () => {
    // THE invariant. If this ever fails, stop and fix the operator — not the test.
    const violations: string[] = []
    for (const [an, a] of VALUES) {
      for (const [bn, b] of VALUES) {
        if ((a as any) === (b as any) && !Eq(a, b)) {
          violations.push(`${an} === ${bn} but Eq() says no`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('and == is genuinely LOOSER somewhere, or the claim is vacuous', () => {
    // The control. An `Eq` that just forwarded to `===` would satisfy the invariant
    // perfectly and mean nothing.
    expect(Eq(new Number(1), 1)).toBe(true)
    expect((new Number(1) as any) === 1).toBe(false)
    expect(Eq(null, undefined)).toBe(true)
    expect((null as any) === undefined).toBe(false)
  })
})

describe('numeric identity: the source/value boundary', () => {
  it('`+1`, `1` and `1.0` are one value', () => {
    // int / unsigned / float are facts about the SOURCE. No runtime comparison can see
    // them, which is why `Type N { example: +0 }` needed the emitter to write the check.
    expect((+1 as any) === 1).toBe(true)
    expect((1 as any) === 1.0).toBe(true)
    expect(Eq(+1, 1)).toBe(true)
    expect(Eq(1, 1.0)).toBe(true)
    expect([TypeOf(1), TypeOf(1.0), TypeOf(+1)]).toEqual([
      'number',
      'number',
      'number',
    ])
  })

  it('`==` does not coerce across types', () => {
    expect(Eq('1', 1)).toBe(false)
    expect(Eq('', false)).toBe(false)
    expect(Eq(0, false)).toBe(false)
  })

  it('NaN equals itself, unlike in JavaScript', () => {
    expect(Eq(NaN, NaN)).toBe(true)
    // Through a binding: `NaN === NaN` written literally trips `use-isnan`, which is a
    // good rule reading real code and a false alarm on a demonstration of the very
    // behaviour being demonstrated.
    const nan: number = NaN
    expect(nan === nan).toBe(false)
  })
})

describe('`==` is NOT typeof-gated', () => {
  it('null == undefined even though TypeOf disagrees', () => {
    // The summary "`==` is `TypeOf(a) === TypeOf(b) && a == b`" is close and wrong. Under
    // it this pair would be false, because `TypeOf(null)` is `'null'`. Recorded so the
    // next person to "simplify" `Eq` into that form sees why it is not that.
    expect(TypeOf(null)).toBe('null')
    expect(TypeOf(undefined)).toBe('undefined')
    expect(TypeOf(null)).not.toBe(TypeOf(undefined))
    expect(Eq(null, undefined)).toBe(true)
  })

  it('a boxed primitive equals its primitive despite TypeOf disagreeing', () => {
    expect(TypeOf(new Number(1))).toBe('object')
    expect(TypeOf(1)).toBe('number')
    expect(Eq(new Number(1), 1)).toBe(true)
  })
})

/**
 * Union membership is an equality question, so it must use the language's equality.
 *
 * A `Set` is the natural storage for a closed set of literals, but **`Set.has` is not the
 * language's `==`** — it is SameValueZero, which is `===` plus `NaN`. It agrees with `Eq`
 * on `1.0` and on `NaN`, and DISAGREES on boxed primitives and on `null`/`undefined`.
 *
 * So a union implemented as a bare `Set` would reject values the rest of the language
 * calls equal — the same operator meaning two things depending on where it is asked, which
 * is the defect class `docs/type-identity.md` exists for.
 */
describe('Set.has is not the language equality', () => {
  const members = new Set<unknown>([1, null, NaN])
  const byEq = (v: unknown) => [...members].some((m) => Eq(m, v))

  it('agrees on plain values and on NaN', () => {
    expect([members.has(1.0), byEq(1.0)]).toEqual([true, true])
    expect([members.has(NaN), byEq(NaN)]).toEqual([true, true])
    expect([members.has(2), byEq(2)]).toEqual([false, false])
  })

  it('DISAGREES on a boxed primitive', () => {
    expect(members.has(new Number(1))).toBe(false)
    expect(byEq(new Number(1))).toBe(true)
  })

  it('DISAGREES on undefined against a null member', () => {
    expect(members.has(undefined)).toBe(false)
    expect(byEq(undefined)).toBe(true)
  })

  it('normalising the probe reconciles them', () => {
    // The fix that keeps O(1): canonicalise on the way in — unwrap boxed primitives and
    // fold `undefined` to `null` — instead of scanning with `Eq` on every check.
    const canon = (v: unknown): unknown => {
      if (v === undefined) return null
      if (v instanceof Number) return Number.prototype.valueOf.call(v)
      if (v instanceof String) return String.prototype.valueOf.call(v)
      if (v instanceof Boolean) return Boolean.prototype.valueOf.call(v)
      return v
    }
    const canonical = new Set([...members].map(canon))
    for (const v of [1.0, new Number(1), undefined, NaN, 2, 'x']) {
      expect(`${String(v)}:${canonical.has(canon(v))}`).toBe(
        `${String(v)}:${byEq(v)}`
      )
    }
  })
})
