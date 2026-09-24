/**
 * The `Predicate` brand means "decides about ONE value" — enforced, not remembered.
 *
 * ## The defect this pins
 *
 * A predicate's contract is `check(v) -> boolean`. `src/css/index.ts` went out of its way not to
 * brand `isStyleValueFor(prop, val)` for exactly that reason — but `compilePredicate`, which is
 * the public API that *produces* functions of that shape, branded every name in `exportNames`
 * unconditionally. One rule, two addresses, drifted at birth.
 *
 * It was not cosmetic. `checkType` dispatches on the presence of `check`, and `brandPredicate`
 * sets `check` to the function itself — so a branded binary relation took the runtime-type
 * branch and was invoked with **one** argument, its second parameter silently `undefined`:
 *
 * ```
 * compilePredicate('function differsFrom(a, b) { return a !== b }', ['differsFrom'])
 * checkType('red',  differsFrom) -> null      // a validator that always says yes,
 * checkType(12345,  differsFrom) -> null      // for every input, with no diagnostic
 * ```
 *
 * The opposite arrangement of the same bug fails **closed** (`v.startsWith(undefined)`), and a
 * third throws outright. All three are a confident wrong answer from something whose whole job
 * is to answer correctly.
 *
 * ## Why arity had to be restored first
 *
 * The brand also *erased* the evidence: `compilePredicate` wraps each export in a rest-args fuel
 * closure, so `fn.length` was `0` — removing the one defence a careful consumer had, and leaving
 * the rule with no input to act on. The wrapper now carries the underlying function's arity, so
 * "is this a predicate?" is answerable at all.
 */
import { describe, it, expect } from 'bun:test'
import { compilePredicate } from './predicate'
import { Predicate, brandPredicate } from '../types/predicate-brand'
import { checkType } from './runtime'

const CLUSTER = `
function isRed(v) { return v === 'red' }
function differsFrom(a, b) { return a !== b }
function anyOf() { return true }
`

describe('compilePredicate brands by arity', () => {
  const c: any = compilePredicate(CLUSTER, ['isRed', 'differsFrom', 'anyOf'])

  it('a unary member IS a Predicate', () => {
    expect(c.isRed instanceof Predicate).toBe(true)
    expect(c.isRed.check).toBe(c.isRed)
  })

  it('a BINARY member is NOT — this is the finding', () => {
    expect(c.differsFrom instanceof Predicate).toBe(false)
    // And therefore carries no `check`, which is what kept `checkType` away from it.
    expect('check' in c.differsFrom).toBe(false)
  })

  it('a rest/nullary member still is — arity 0 means unknown, not "not a predicate"', () => {
    // `(...args) => …` and `() => …` both report 0. Refusing them would break legitimate
    // predicates to catch a shape the arity cannot distinguish.
    expect(c.anyOf instanceof Predicate).toBe(true)
  })

  it('every member still WORKS — apparatus check', () => {
    // All the assertions above are satisfied by a compile that returns broken functions.
    expect(c.isRed('red')).toBe(true)
    expect(c.isRed('blue')).toBe(false)
    expect(c.differsFrom(1, 2)).toBe(true)
    expect(c.differsFrom(1, 1)).toBe(false)
  })

  it('arity survives the fuel wrapper — the erased evidence, restored', () => {
    // Rest-args closures report 0. Without this the rule above has nothing to read, and a
    // consumer inspecting `.length` before calling gets a confident wrong answer too.
    expect({
      isRed: c.isRed.length,
      differsFrom: c.differsFrom.length,
    }).toEqual({ isRed: 1, differsFrom: 2 })
  })

  it('and so does the name — including for the DECLINED relation', () => {
    // The brand sets `name`, so a declined function would otherwise be left reporting the
    // wrapper's own closure name in every stack trace it appears in.
    expect({ a: c.isRed.name, b: c.differsFrom.name }).toEqual({
      a: 'isRed',
      b: 'differsFrom',
    })
  })

  it('checkType no longer says yes to everything', () => {
    // The measured failure, directly: before the fix all five returned null.
    const verdicts = ['red', 'blue', 12345, null, {}].map((v) =>
      checkType(v as any, c.differsFrom)
    )
    expect(verdicts.every((v) => v === null)).toBe(false)
  })

  it('and a real unary predicate still validates correctly through checkType', () => {
    expect(checkType('red', c.isRed)).toBeNull()
    expect(checkType('blue', c.isRed)).not.toBeNull()
  })
})

describe('the rule lives at ONE address — brandPredicate itself', () => {
  it('brandPredicate declines a binary function, wherever it is called from', () => {
    const binary = (a: unknown, b: unknown) => a === b
    expect(brandPredicate(binary) instanceof Predicate).toBe(false)
    // Declined means UNTOUCHED, not half-branded: no `check`, no `description`, still callable.
    expect('check' in binary).toBe(false)
    expect(binary(1, 1)).toBe(true)
  })

  it('and accepts a unary one', () => {
    expect(brandPredicate((v: unknown) => v === 1) instanceof Predicate).toBe(
      true
    )
  })
})

describe('the css surface obeys the same rule, without restating it', () => {
  it('no exported binary relation is branded', async () => {
    const css: any = await import('../css/index')
    const offenders = Object.entries(css)
      .filter(([, v]) => typeof v === 'function' && (v as any).length > 1)
      .filter(([, v]) => v instanceof Predicate)
      .map(([k]) => k)
    expect(offenders).toEqual([])
  })

  it('apparatus check: there IS a binary export, and it IS callable', () => {
    // Otherwise the sweep above passes by finding nothing.
    const css: any = require('../css/index')
    expect(css.isStyleValueFor.length).toBe(2)
    expect(css.isStyleValueFor('color', 'red')).toBe(true)
    expect(css.isStyleValueFor('color', 'notacolour')).toBe(false)
  })
})
