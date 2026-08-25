/**
 * `asCompared` — a type's own answer to "what am I, for comparison?"
 *
 * `unwrapBoxed` already did this for three types (a `String` instance compares as a string,
 * `Number` as a number, `Boolean` as a boolean). That was never a special case — it is the
 * ROOT of a chain, and this is the layer above it, for types the host does not describe.
 *
 * Three things these tests exist to pin, each of which the design turns on:
 *
 *   1. **It is consumed by `Eq`, `Is` AND `toBool`.** That is the whole point, and it is the
 *      answer to the question that prompted the feature — "why don't Eq and toBool use the
 *      computed comparator?" Because there wasn't one.
 *   2. **It is a PROJECTION, not an `equals(other)` predicate**, so it composes into the
 *      deep walk: a projected type nested inside an object just works.
 *   3. **It works in STANDALONE emitted code**, with no shared runtime installed. Emitted
 *      files declare their own comparators and call them bare, so a runtime-only
 *      implementation would silently not apply — the "inline runtime always wins" trap that
 *      `docs/type-identity.md` exists to warn about.
 *
 * See `docs/type-system-north-star.md`. Note the deliberate comparator copies: a change here
 * must move `runtime.ts` and the emitted inline forms together.
 */
import { describe, it, expect } from 'bun:test'
import { Eq, Is, IsNot, toBool, registerProjection } from './runtime'
import { tjs } from './index'

class Timestamp {
  constructor(public seconds: number, public nanos: number) {}
}
class Result {
  constructor(public ok: boolean) {}
}
class Unprojected {
  constructor(public v: number) {}
}

registerProjection('Timestamp', function (this: any) {
  return this.seconds * 1000 + this.nanos / 1e6
})
registerProjection('Result', function (this: any) {
  return this.ok
})

describe('the shared runtime honours a projection', () => {
  it('two distinct objects are equal when they project equally', () => {
    expect(Eq(new Timestamp(100, 0), new Timestamp(100, 0))).toBe(true)
    expect(Eq(new Timestamp(100, 0), new Timestamp(101, 0))).toBe(false)
  })

  it('composes into the deep walk — a nested projected value just works', () => {
    // An `equals(other)` predicate would only fire where something dispatched it.
    const a = { when: new Timestamp(5, 0), tag: 'x' }
    const b = { when: new Timestamp(5, 0), tag: 'x' }
    expect(Is(a, b)).toBe(true)
    expect(IsNot(a, { when: new Timestamp(6, 0), tag: 'x' })).toBe(true)
  })

  it('feeds toBool, so a type can be FALSY', () => {
    // An errored service result is an object, and objects are truthy. Without this the
    // type has no way to say otherwise, and `if (result)` takes the success branch.
    expect(toBool(new Result(false))).toBe(false)
    expect(toBool(new Result(true))).toBe(true)
  })

  it('leaves unprojected values exactly as they were', () => {
    // The control. Reference equality for plain objects is a deliberate property of `==`,
    // and adding projections must not quietly make it structural.
    expect(Eq({ a: 1 }, { a: 1 })).toBe(false)
    expect(Eq(new Unprojected(1), new Unprojected(1))).toBe(false)
    expect(toBool(new Unprojected(0))).toBe(true)
    expect(Eq(1, 1)).toBe(true)
    expect(Eq('5', 5)).toBe(false)
  })
})

describe('a projection must yield a primitive, or nothing', () => {
  const roundTrip = (name: string, projected: unknown) => {
    class T {}
    Object.defineProperty(T, 'name', { value: name })
    registerProjection(name, function () {
      return projected
    })
    return new T()
  }

  it('accepts number, string, boolean, null and undefined', () => {
    expect(Eq(roundTrip('PNum', 42), 42)).toBe(true)
    expect(Eq(roundTrip('PStr', 'x'), 'x')).toBe(true)
    expect(Eq(roundTrip('PBool', false), false)).toBe(true)
    expect(Eq(roundTrip('PNull', null), null)).toBe(true)
    // `Eq` treats null and undefined as equal, which is why both are usable for Option-ish
    // types rather than being ambiguous with "declined".
    expect(Eq(roundTrip('PUndef', undefined), null)).toBe(true)
  })

  it('IGNORES a non-conforming projection rather than throwing', () => {
    // A hook that breaks `==` for every value is worse than one that does not apply.
    // `bigint` is excluded deliberately: `1n === 1` is false, so a number-vs-bigint
    // disagreement would silently compare unequal for values that are equal.
    const objProj = roundTrip('PObj', { nested: true })
    expect(() => Eq(objProj, objProj)).not.toThrow()
    expect(Eq(objProj, objProj)).toBe(true) // falls back to reference equality
    const bigProj = roundTrip('PBig', 1n)
    expect(Eq(bigProj, 1)).toBe(false)
  })

  it('a THROWING projection does not throw out of `==`', () => {
    // This language's promise is that errors are returned, not thrown. A declared hook that
    // throws is the author's bug, but it must not escape a comparison.
    const t = roundTrip('PThrow', undefined)
    registerProjection('PThrow', function () {
      throw new Error('hostile')
    })
    expect(() => Eq(t, t)).not.toThrow()
    expect(() => toBool(t)).not.toThrow()
  })
})

describe('STANDALONE emitted code honours a projection', () => {
  // No shared runtime: emitted files declare their own comparators and call them bare, so
  // a runtime-only implementation would silently not apply here.
  const run = (src: string, name: string) =>
    new Function(tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`)()

  it('`==` uses the file-local projection', () => {
    const eq = run(
      `extend Stamp { asCompared() { return this.s } }\n` +
        `export function eq(a: {}, b: {}):! false { return a == b }\n`,
      'eq'
    )
    class Stamp {
      constructor(public s: number) {}
    }
    expect(eq(new Stamp(1), new Stamp(1))).toBe(true)
    expect(eq(new Stamp(1), new Stamp(2))).toBe(false)
  })

  it('truthiness uses it too', () => {
    const check = run(
      `extend Res { asCompared() { return this.ok } }\n` +
        `export function check(r: {}):! 0 { return r ? 1 : 0 }\n`,
      'check'
    )
    class Res {
      constructor(public ok: boolean) {}
    }
    expect(check(new Res(false))).toBe(0)
    expect(check(new Res(true))).toBe(1)
  })

  it('a file with no `extend` is unaffected', () => {
    const eq = run(
      `export function eq(a: {}, b: {}):! false { return a == b }\n`,
      'eq'
    )
    expect(eq({ a: 1 }, { a: 1 })).toBe(false)
    const same = { a: 1 }
    expect(eq(same, same)).toBe(true)
    // (Not `eq(1, 1)` — the params are annotated `{}`, so numbers correctly return a
    // MonadicError rather than a boolean. That was my test's bug, not the code's.)
  })

  it('the projection table is FILE-LOCAL — one module cannot reach another', () => {
    // The chain's leaf is local by construction: different files, different comparators.
    // A single shared mutable type->behaviour table would be prototype pollution by
    // another name, which is what `extend` exists to avoid.
    const withProj = run(
      `extend Local { asCompared() { return 1 } }\n` +
        `export function eq(a: {}, b: {}):! false { return a == b }\n`,
      'eq'
    )
    const withoutProj = run(
      `export function eq(a: {}, b: {}):! false { return a == b }\n`,
      'eq'
    )
    class Local {}
    expect(withProj(new Local(), new Local())).toBe(true)
    expect(withoutProj(new Local(), new Local())).toBe(false)
  })
})
