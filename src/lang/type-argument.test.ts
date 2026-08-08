/**
 * A type ARGUMENT is a predicate.
 *
 * `Box<int>` needs `int` to be something at run time, and it is not: `n: int` compiles to
 * an inline `typeof n === 'number' && Number.isInteger(n)`, so `int` exists only at compile
 * time and `Box(int)` would reference nothing. That looked like the blocker for the
 * `generic-type-arguments` row.
 *
 * It is not, because a primitive kind maps cleanly onto a PREDICATE — and no new machinery
 * is needed to carry one: `Generic` already accepts a bare predicate function as a type
 * argument. This file proves that, since the claim is worth more than an assertion.
 *
 * The general form of the idea is the point: any type that cannot be represented as a
 * VALUE can be represented as a predicate over values. That is the direction
 * `docs/type-system-north-star.md` argues for, and it is why this needed no new mechanism —
 * the runtime was already predicate-shaped.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { typeArgumentSource } from './inference'

/** `Type Box<T> { example: { value: T } }`, compiled and evaluated. */
function box(): (arg: unknown) => { check(v: unknown): unknown } {
  const { code } = tjs(`Type Box<T> {\n  example: { value: T }\n}`, {
    filename: 'ta.tjs',
  })
  return new Function(`${code}\nreturn Box`)() as never
}

/** Evaluate a `typeArgumentSource` result into a callable predicate. */
const predicate = (name: string): ((v: unknown) => boolean) => {
  const src = typeArgumentSource(name)
  expect(src).not.toBeNull()
  return new Function(`return ${src}`)() as (v: unknown) => boolean
}

describe('a primitive kind has a predicate representation', () => {
  it('int accepts integers and rejects floats, strings and null', () => {
    const isInt = predicate('int')
    expect([2, -3, 0].every(isInt)).toBe(true)
    expect([1.5, '2', null, undefined, {}].some(isInt)).toBe(false)
  })

  it('unsigned additionally rejects negatives', () => {
    const isU = predicate('unsigned')
    expect([0, 7].every(isU)).toBe(true)
    expect(isU(-1)).toBe(false)
  })

  it('float accepts any number, including integers', () => {
    // `number` is the wide one — narrowing it would break pasted TypeScript, where
    // `number` must keep meaning number.
    const isF = predicate('float')
    expect([1.5, 2, -0.5].every(isF)).toBe(true)
    expect(isF('2')).toBe(false)
  })

  it('a declared type name is NOT translated', () => {
    // It is already a runtime binding; returning a predicate for it would shadow the
    // real type with a weaker guess.
    expect(typeArgumentSource('MyThing')).toBeNull()
    expect(typeArgumentSource('Box')).toBeNull()
  })
})

describe('a predicate works as a type argument, and composes', () => {
  it('Box(<int predicate>) checks the parameter slot', () => {
    const B = box()(predicate('int'))
    expect(B.check({ value: 7 })).toBe(true)
    expect(B.check({ value: 1.5 })).toBe(false)
    expect(B.check({ value: 's' })).toBe(false)
    expect(B.check({})).toBe(false)
  })

  it('Box<Box<int>> — a parameterized type is itself a type argument', () => {
    // The composition property is what makes predicates a sufficient representation
    // rather than a special case for primitives: a `Generic` result is a RuntimeType
    // with its own `.check`, so it can be passed where a predicate can.
    const Box = box()
    const BoxBoxInt = Box(Box(predicate('int')))
    expect(BoxBoxInt.check({ value: { value: 7 } })).toBe(true)
    expect(BoxBoxInt.check({ value: { value: 1.5 } })).toBe(false)
    expect(BoxBoxInt.check({ value: 7 })).toBe(false)
  })

  it('agrees with the parameter path on the same question', () => {
    // The load-bearing one. `n: int` and a `Box<int>` slot must not disagree about what
    // an int is — that is the whole class of defect `docs/type-identity.md` exists for,
    // and two hand-rolled implementations of "is this an int" is exactly how it starts.
    const { code } = tjs(`function f(n: int) { return 'ok' }`, {
      filename: 'ta.tjs',
    })
    const f = new Function(`${code}\nreturn f`)() as (n: unknown) => unknown
    const isInt = predicate('int')
    for (const v of [2, -3, 0, 1.5, '2', null, {}]) {
      expect(`${JSON.stringify(v)}:${f(v) === 'ok'}`).toBe(
        `${JSON.stringify(v)}:${isInt(v)}`
      )
    }
  })
})
