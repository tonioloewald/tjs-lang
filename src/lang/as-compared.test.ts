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
import {
  Eq,
  Is,
  IsNot,
  toBool,
  registerProjection,
  isMonadicError,
} from './runtime'
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

describe("the type's OWN asCompared() method (#33)", () => {
  /**
   * The layer beneath the registry, and the only one a Proxy can reach.
   *
   * The registry is keyed by `constructor.name`, and a Proxy reports its TARGET's — so the
   * tosijs boxed scalar below keys as `'Number'`, and registering it would claim that key
   * for every boxed Number in the process. There is no distinct key to register. A `get`
   * trap can serve a method, which is why this layer exists.
   */
  const live = { n: 42, flag: false }
  const boxed = (key: 'n' | 'flag') =>
    new Proxy(new Number(0), {
      get(t, k) {
        // The live value is read per access, so it cannot live in the target's slot.
        if (k === 'valueOf' || k === Symbol.toPrimitive) return () => live[key]
        if (k === 'asCompared') return () => live[key]
        return Reflect.get(t, k)
      },
    })

  it('the shipped repro: a Proxy over a boxed primitive', () => {
    const count = boxed('n')
    // Two independent reasons the pre-fix path could not answer this:
    expect((count as any).constructor.name).toBe('Number') // no distinct registry key
    expect(() => Number.prototype.valueOf.call(count)).toThrow() // no internal slot
    expect(Eq(count, 42)).toBe(true)
    expect(Eq(count, 41)).toBe(false)
  })

  it('toBool honours it — the half with the widest blast radius', () => {
    // `toBool` is injected at EVERY truthiness site in a .tjs file, so a boxed `false`
    // reading truthy is wrong at every `if` in the program, with no diagnostic.
    expect(toBool(boxed('flag'))).toBe(false)
    live.flag = true
    expect(toBool(boxed('flag'))).toBe(true)
    live.flag = false
  })

  it('an ordinary class can declare it directly', () => {
    class Money {
      constructor(public cents: number) {}
      asCompared() {
        return this.cents
      }
    }
    expect(Eq(new Money(500), new Money(500))).toBe(true)
    expect(Eq(new Money(500), new Money(501))).toBe(false)
    expect(Is({ p: new Money(1) }, { p: new Money(1) })).toBe(true)
    expect(toBool(new Money(0))).toBe(false)
  })

  it('a registered projection OVERRIDES the type’s own method', () => {
    // `extend` means local override. The registry is a third party describing a type it
    // does not own, and that is a deliberate act by THIS module; the method is the type's
    // default. So the registry is consulted first.
    class Owned {
      asCompared() {
        return 'mine'
      }
    }
    expect(Eq(new Owned(), 'mine')).toBe(true)
    registerProjection('Owned', () => 'theirs')
    expect(Eq(new Owned(), 'theirs')).toBe(true)
    expect(Eq(new Owned(), 'mine')).toBe(false)
  })

  it('a hostile probe or method cannot throw out of a comparison', () => {
    // Two distinct failure points: reading the property, and calling it.
    const throwsOnProbe = new Proxy(
      {},
      {
        get(_t, k) {
          if (k === 'asCompared') throw new Error('hostile probe')
          return undefined
        },
      }
    )
    const throwsOnCall = {
      asCompared() {
        throw new Error('hostile call')
      },
    }
    for (const v of [throwsOnProbe, throwsOnCall]) {
      expect(() => Eq(v, 1)).not.toThrow()
      expect(() => toBool(v)).not.toThrow()
      expect(Eq(v, v)).toBe(true) // falls back to reference equality
      expect(toBool(v)).toBe(true)
    }
  })

  it('a non-conforming method is ignored, like a registered one', () => {
    const obj = {
      asCompared() {
        return { still: 'an object' }
      },
    }
    expect(Eq(obj, obj)).toBe(true)
    expect(
      Eq(obj, {
        asCompared() {
          return { still: 'an object' }
        },
      })
    ).toBe(false)
  })

  it('objects WITHOUT the method are untouched', () => {
    // The control. `==` on plain objects is reference equality by design, and adding a
    // duck-typed hook must not quietly make it structural.
    expect(Eq({ a: 1 }, { a: 1 })).toBe(false)
    expect(toBool({})).toBe(true)
    expect(toBool(new (class {})())).toBe(true)
    // A non-function `asCompared` is not a hook.
    expect(Eq({ asCompared: 42 }, 42)).toBe(false)
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

  it('truthiness is file-local too, WITH a shared runtime installed', async () => {
    // The case the original file-local test missed, and the one that was actually broken.
    //
    // It exercised only `==` — emitted bare, reading `__ac`, where the promise held — and
    // installed no shared runtime. Meanwhile `if (x)` went through `__tjs.toBool`, which is
    // the SHARED implementation and cannot see `__ac`. The first fix for that fed a
    // process-GLOBAL table, which made one module's `extend` silently change an unrelated
    // module's control flow: "B before A loads: truthy / B after A loads: FALSY", with B
    // having no `extend` at all. Four shipped documents claimed the opposite.
    //
    // Both halves are asserted here, together, because fixing either one alone breaks the
    // other.
    const { installRuntime } = await import('./runtime')
    installRuntime()
    class Res {
      constructor(public ok: boolean) {}
    }

    const declaring = run(
      `extend Res { asCompared() { return this.ok } }\n` +
        `export function check(r: {}):! 0 { return r ? 1 : 0 }\n`,
      'check'
    )
    // The declaring module's own `if` must honour its projection.
    expect(declaring(new Res(false))).toBe(0)

    const unrelated = run(
      `export function truthy(r: {}):! 0 { return r ? 1 : 0 }\n`,
      'truthy'
    )
    // And a module that never opted in must be untouched by it.
    expect(unrelated(new Res(false))).toBe(1)
  })

  it('an attacker-controlled `constructor.name` cannot reach Object.prototype', () => {
    // `__ac` was a bare `{}` and the lookup was `__ac[k]`, so a key from `JSON.parse` —
    // which creates a real OWN `constructor` property — walked the prototype chain.
    // `__ac['toString']` resolved to `Object.prototype.toString`, which returns the
    // conforming primitive '[object Object]' for ANY object, so two distinct objects with
    // different contents compared EQUAL under emitted `==`.
    const eq = run(
      `export function eq(a: {}, b: {}):! false { return a == b }\n`,
      'eq'
    )
    for (const name of [
      'toString',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'toLocaleString',
    ]) {
      const h1 = JSON.parse(JSON.stringify({ constructor: { name }, x: 1 }))
      const h2 = JSON.parse(JSON.stringify({ constructor: { name }, x: 2 }))
      expect(eq(h1, h2), `constructor.name = ${name}`).toBe(false)
    }
  })

  it('a type’s own asCompared() reaches emitted `==` and `if` (#33)', () => {
    // The half that decides the issue. Emitted files call their OWN comparators bare, so a
    // runtime-only fix would leave every shipped `.js` answering the old way — the exact
    // drift that produced #33, where `Is` honoured a hook and `==` did not.
    const f = run(
      `export function probe(v: {}):! 0 { return (v == 42 ? 1 : 0) + (v ? 10 : 0) }\n`,
      'probe'
    )
    const live = { n: 42, flag: false }
    const boxed = (key: 'n' | 'flag') =>
      new Proxy(new Number(0), {
        get(t, k) {
          if (k === 'asCompared') return () => live[key]
          return Reflect.get(t, k)
        },
      })
    expect(f(boxed('n'))).toBe(11) // == 42, and truthy
    live.n = 1
    live.flag = false
    expect(f(boxed('flag'))).toBe(0) // != 42, and FALSY
  })

  it('a literal union agrees with `==` about the same value', () => {
    // The sibling site. `__oneOf` walked `__ub` alone while the comparators walked
    // `__proj` then `__ub`, so a value could satisfy `v == 'b'` and FAIL `'a' | 'b'` —
    // two mechanisms disagreeing about one value, which is the thing `docs/type-identity.md`
    // exists to keep track of.
    const f = run(
      `export function pick(mode: 'a' | 'b'): 0 { return mode == 'b' ? 1 : 0 }\n`,
      'pick'
    )
    class Mode {
      constructor(public m: string) {}
      asCompared() {
        return this.m
      }
    }
    expect(f(new Mode('b'))).toBe(1) // accepted by the union AND equal to 'b'
    expect(f(new Mode('a'))).toBe(0)
    expect(isMonadicError(f(new Mode('z')))).toBe(true) // still rejected
  })

  it('a file-local `extend` still overrides the type’s own method', () => {
    const body = `export function probe(v: {}):! 0 { return v ? 1 : 0 }\n`
    const overridden = run(
      `extend Owned { asCompared() { return 1 } }\n` + body,
      'probe'
    )
    const plain = run(body, 'probe')
    class Owned {
      asCompared() {
        return 0
      }
    }
    // Same value, same expression, two files: the one with the `extend` sees 1 (truthy),
    // the one without falls through to the type's own method and sees 0 (falsy).
    expect(overridden(new Owned())).toBe(1)
    expect(plain(new Owned())).toBe(0)
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
