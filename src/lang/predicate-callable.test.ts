/**
 * A runtime type is a **function with properties** — in the real runtime AND in emitted code.
 *
 * The design (`docs/type-system-north-star.md`): a predicate is an ordinary callable carrying
 * facts, not an object with a callable `check`. `Type` is a predicate that carries an example;
 * `Enum`/`Union` carry a domain; `FunctionPredicate` carries a signature. Capabilities are
 * attached properties, not subclasses.
 *
 * Two things make this worth a dedicated guard rather than trusting the type-identity harness:
 *
 *  1. **It is a DIFFERENTIAL property.** `src/types/Type.ts` and the inline stub in
 *     `emitters/js.ts` are two implementations of one idea, and emitted code calls the stub —
 *     so the stub IS the shipped semantics (`docs/type-identity.md`). A type that is callable
 *     in one and not the other is exactly the drift this repo keeps paying for.
 *  2. **`check` is the function itself.** That is the point: one implementation that cannot
 *     disagree with itself. A refactor that reintroduces a separate `check` would pass every
 *     behavioural test while quietly restoring the thing this design removes.
 *
 * `name` is asserted because it is real introspection — what autocomplete, documentation and
 * error messages show. `length` is deliberately NOT asserted: a predicate inherits it from
 * `Function` and it says nothing useful.
 */
import { describe, it, expect } from 'bun:test'
// Through the PUBLIC entry, not `../types/Type`. This file used to import the internal module,
// which is how it could see `Predicate` while no consumer could: the 0.14.0 review's B2 was a
// brand that existed everywhere except the published surface, and the guard for it bypassed
// that surface. Cross-BUNDLE identity is `src/predicate-bundles.test.ts`, against dist/.
import {
  Type,
  Enum,
  Union,
  FunctionPredicate,
  Generic,
  Predicate,
  isRuntimeType,
} from '../index'
import { tjs } from './index'
// `Exactly` is public through the `tjs-lang/runtime` subpath, not the main entry.
import { createRuntime, Exactly } from './runtime'

/**
 * ONE table drives both the library and the emitted assertions.
 *
 * The 0.14.0 pre-release review found the reason this matters: the first version of this
 * file transpiled only `Type Age 0` in its emitted block, while the library block covered
 * four forms. The stub wrapped only `Type` in `__pred`, so emitted `Enum`/`Union`/
 * `FunctionPredicate` were plain objects — `Colour('red')` threw `is not a function` — and
 * the CHANGELOG asserted parity that did not exist. **The guard was green exactly where
 * the drift was, and could not go red.**
 *
 * A shared table makes that shape impossible: a form added here must pass on both sides.
 *
 * It was not actually shared until the 0.14.0 RE-review: the library block had its own
 * `CASES` (Type/Enum/Union) and this table was emitted-only — two tables, which is how a
 * `Generic` instance could be callable in the library and a plain object in emitted code with
 * nothing noticing. Every row now carries BOTH `lib` and `decl`.
 */
const FORMS: Array<{
  /** The library's value for this form — through the PUBLIC entry. */
  lib: () => any
  decl: string
  name: string
  pass: unknown
  fail: unknown
}> = [
  {
    lib: () => Type('Age', 0),
    decl: `Type Age 0`,
    name: 'Age',
    pass: 5,
    fail: 'x',
  },
  {
    lib: () => Enum('a colour', { Red: 'red', Green: 'green' } as any),
    decl: `Enum Colour 'a colour' { Red = 'red', Green = 'green' }`,
    name: 'Colour',
    pass: 'red',
    fail: 'blue',
  },
  // B1 was specifically about THESE three: the stub wrapped only `Type` in `__pred`, so
  // emitted Union/Exactly/FunctionPredicate were plain objects and threw `is not a function`.
  // The fix wrapped all five, but this table carried only Type and Enum — so the guard for
  // B1 did not cover B1. Added 2026-09-24.
  {
    lib: () => Union('mixed', [0, '']),
    decl: `const Mixed = Union('mixed', [0, ''])`,
    name: 'Mixed',
    pass: 0,
    fail: true,
  },
  {
    lib: () => Exactly('a', 'b'),
    decl: `const AB = Exactly('a', 'b')`,
    name: 'AB',
    pass: 'a',
    fail: 'c',
  },
  // The 0.14.0 RE-review's M-2: a Generic INSTANCE. B1's fix wrapped the five constructors
  // that return a type directly and missed the one that returns it one call later — so an
  // emitted `Box(0)` was a plain object and `Box(0)(v)` threw, while the library's is a
  // callable Predicate. The table listed the five, so it could not see the sixth.
  {
    lib: () =>
      Generic(
        ['T'],
        (x: any, T: (v: unknown) => boolean) =>
          typeof x === 'object' && x !== null && T(x.value),
        'box'
      )(0),
    decl: `Generic Box<T> {\n  description: 'box'\n  predicate(x, T) { return typeof x === 'object' && x !== null && T(x.value) }\n}\nconst IntBox = Box(0)`,
    name: 'IntBox',
    pass: { value: 1 },
    fail: { value: 'x' },
  },
  {
    lib: () =>
      FunctionPredicate('Callback', { params: { x: 0 }, returns: '' } as any),
    decl: `FunctionPredicate Callback {\n  params: { x: 0 }\n  returns: ''\n}`,
    name: 'Callback',
    pass: () => '',
    fail: 5,
  },
]

describe('the real runtime: predicates are callable', () => {
  for (const { lib, name, pass, fail } of FORMS) {
    it(`${name} is callable and decides`, () => {
      const pred = lib()
      expect(typeof pred).toBe('function')
      expect(pred(pass)).toBe(true)
      // `!== true`, not `=== false`: the contract `checkType` relies on is "true, or anything
      // else", and the real FunctionPredicate returns a REASON string on rejection where the
      // stub returns false — a documented divergence (CLAUDE.md, "The inline runtime is NOT
      // the real runtime"). Asserting `false` would fail on the documented behaviour.
      expect(pred(fail)).not.toBe(true)
    })

    it(`${name}.check IS the function — one implementation`, () => {
      // Not "behaves the same as" — the same object. Two implementations is the failure mode.
      const pred = lib()
      expect(pred.check).toBe(pred)
    })

    it(`${name} is instanceof Predicate, via a real prototype chain`, () => {
      const pred = lib()
      expect(pred instanceof Predicate).toBe(true)
      // Still a function to everything that does not know better.
      expect(typeof pred.bind).toBe('function')
    })

    it(`${name} is still recognised as a runtime type`, () => {
      expect(isRuntimeType(lib())).toBe(true)
    })
  }

  it('carries its declared name — introspection, not decoration', () => {
    expect(Type('Age', 0).name).toBe('Age')
    expect(Enum('Colour', ['red']).name).toBe('Colour')
    expect(
      FunctionPredicate('Cb', { params: { x: 0 }, returns: 0 } as any).name
    ).toBe('Cb')
  })

  it('keeps the facts that make it more than a predicate', () => {
    // A Type is a Predicate that carries a WITNESS; that witness is what lets it generate.
    const Age: any = Type('Age', 0)
    expect(Age.example).toBe(0)
    expect(Age.default).toBe(0)
    // An Enum carries its whole domain, which is why it can drive autocomplete for free.
    expect((Enum('Colour', ['red', 'green']) as any).values).toEqual([
      'red',
      'green',
    ])
  })
})

describe('EMITTED code agrees — the stub is the shipped semantics', () => {
  /** Transpile a declaration and hand back the emitted binding. */
  function emitted(decl: string, name: string): any {
    const saved = (globalThis as any).__tjs
    try {
      ;(globalThis as any).__tjs = createRuntime()
      const { code } = tjs(`${decl}\n`, { filename: 'a.tjs', runTests: false })
      return new Function(`${code}\nreturn ${name}`)()
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  }

  for (const { decl, name, pass, fail } of FORMS) {
    it(`emitted ${name} is CALLABLE — not just the library's`, () => {
      const p = emitted(decl, name)
      expect({ [name]: typeof p }).toEqual({ [name]: 'function' })
      expect(p(pass)).toBe(true)
      expect(p(fail)).toBe(false)
    })

    it(`emitted ${name}.check is the same function`, () => {
      const p = emitted(decl, name)
      expect(p.check).toBe(p)
    })

    it(`emitted ${name} names itself the same way the library does`, () => {
      // PARITY, not a literal. `Enum Colour 'a colour' {…}` lowers to
      // `Enum('a colour', …)`, so both sides name the predicate from the DESCRIPTION, not
      // the declared identifier. Whether that is the right choice is a separate question
      // (arguably it should be `Colour`) and predates callable predicates — asserting a
      // literal here would freeze one side of a divergence rather than detect it.
      const p = emitted(decl, name)
      expect(typeof p.name).toBe('string')
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.name).toBe(p.description)
    })
  }

  for (const { decl, name } of FORMS) {
    it(`emitted ${name} SERIALISES — the silent data-loss case`, () => {
      // Making runtime types callable turned `JSON.stringify(Age)` into `undefined` and
      // `JSON.stringify({field: Age})` into `{}` — the key vanishing with no error. The real
      // runtime got `toJSON` in `asPredicate`; the stub did not, and the stub IS the shipped
      // semantics for emitted code, so "runtime types serialise" was only true of the library.
      const p = emitted(decl, name)
      const solo = JSON.stringify(p)
      expect({ [name]: typeof solo }).toEqual({ [name]: 'string' })

      // Nested is the case that actually matters — a type is far likelier to be part of a
      // payload than stringified alone, and this is where the loss was silent rather than loud.
      const nested = JSON.parse(JSON.stringify({ field: p }))
      expect(Object.keys(nested)).toEqual(['field'])
      expect(nested.field.description).toBe(p.description)
      expect(nested.field.__runtimeType).toBe(true)

      // The implementation is excluded, not serialised: `check` is the function itself, so
      // including it would recurse through this very method.
      expect('check' in nested.field).toBe(false)
      expect('toJSON' in nested.field).toBe(false)
    })
  }

  it('emitted Type serialises to exactly its pre-0.14.0 shape — a regression fix, not a new format', () => {
    // Before runtime types were callable the emitted `Type('Age',0)` was a plain object. This
    // is what it stringified to, byte for byte. Asserting the literal is the only way to show
    // the fix RESTORED behaviour rather than inventing a shape that merely looks reasonable.
    expect(JSON.stringify(emitted('Type Age 0', 'Age'))).toBe(
      '{"description":"Age","__runtimeType":true,"default":0,"__ex":0}'
    )
  })

  it('emitted and real Enum serialise to the same facts', () => {
    // The forms where both sides carry the same field names must agree, or "serialises" means
    // something different depending on which runtime you reached.
    const p = emitted(FORMS[1].decl, FORMS[1].name)
    const real: any = Enum('a colour', { Red: 'red', Green: 'green' } as any)
    expect(JSON.parse(JSON.stringify(p))).toEqual(
      JSON.parse(JSON.stringify(real))
    )
  })

  it('but the stub names a Type’s witness `__ex` where the real runtime says `example`', () => {
    // A MEASURED divergence, asserted rather than glossed. Same information, two names — so
    // `Age.example` is `undefined` in emitted code, which is the shipped semantics. Recorded in
    // docs/type-identity.md ("Surface, not decisions") and tracked in TODO.md. Pinned here so
    // unifying them is a deliberate change that fails this test, not a silent drift.
    const p = emitted('Type Age 0', 'Age')
    const real: any = Type('Age', 0)
    expect({ stub: p.__ex, real: real.example }).toEqual({ stub: 0, real: 0 })
    expect({
      stubHasExample: 'example' in p,
      realHasEx: '__ex' in real,
    }).toEqual({ stubHasExample: false, realHasEx: false })
  })

  it('Object.keys and spread are EXACTLY what 0.13.13 produced — the CHANGELOG promise', () => {
    // The CHANGELOG says `Object.keys()` and spread are unchanged. Measured against the
    // PUBLISHED 0.13.13 (npm i tjs-lang@0.13.13, emitted `Type Age 0`): these five keys, in this
    // order. An enumerable `toJSON` added a sixth, and made a SPREAD copy carry a `toJSON`
    // closed over the ORIGINAL — so `{...Age, description: 'X'}` serialised Age's facts, not
    // its own (0.14.0 re-review, gap 5). Non-enumerable restores both; JSON.stringify still
    // finds it, since it looks the method up rather than enumerating.
    const Age = emitted('Type Age 0', 'Age')
    expect(Object.keys(Age)).toEqual([
      'description',
      '__runtimeType',
      'default',
      '__ex',
      'check',
    ])
    const copy = { ...Age, description: 'Renamed' }
    expect('toJSON' in copy).toBe(false)
    expect(JSON.parse(JSON.stringify(copy)).description).toBe('Renamed')
    // …and the original still serialises.
    expect(JSON.parse(JSON.stringify(Age)).description).toBe('Age')
  })

  it('the library agrees: toJSON is not an enumerable key there either', () => {
    for (const p of [
      Type('Age', 0),
      Enum('C', ['a']),
      Union('U', [0, '']),
    ] as any[]) {
      expect(Object.keys(p)).not.toContain('toJSON')
      expect(typeof p.toJSON).toBe('function')
    }
  })

  it('and the stub still agrees with the real runtime on the DECISION', () => {
    // Shape parity is worthless if the two disagree on the answer.
    const Age = emitted('Type Age 0', 'Age')
    const real: any = Type('Age', 0)
    for (const v of [0, 5, -1, 1.5, 'x', null, undefined, {}, []]) {
      expect({ v, emitted: Age(v) }).toEqual({ v, emitted: real(v) as any })
    }
  })
})

describe('a verified predicate IS a Predicate — no wrapping needed', () => {
  // The payoff of predicates being functions. `isColor` was already an ordinary function;
  // becoming a `Predicate` meant ATTACHING facts, not lifting it into a different shape. So
  // `isColor` and `Type('age', 0)` are the same kind of thing, which is what lets one concept
  // cover both in `$predicate`, in the docs, and in editor introspection.
  it('compiled CSS predicates carry the brand', async () => {
    const css: any = await import('../css/index')
    expect(css.isColor instanceof Predicate).toBe(true)
    expect(css.isColor.check).toBe(css.isColor)
    expect(css.isColor.name).toBe('isColor')
  })

  it('and still decide correctly', async () => {
    const css: any = await import('../css/index')
    expect(css.isColor('#ff0000')).toBe(true)
    expect(css.isColor('notacolour')).toBe(false)
  })

  it('defaults to claiming NO structure — the progressive-enhancement story', async () => {
    // A bare predicate knows how to decide, not how to describe a shape. A naive JSON-Schema
    // validator sees "anything"; an aware one runs the predicate.
    const css: any = await import('../css/index')
    expect(css.isColor.toJSONSchema()).toEqual({
      $predicate: { name: 'isColor' },
    })
    // And it carries neither a witness nor a domain, because it has neither.
    expect('example' in css.isColor).toBe(false)
    expect('values' in css.isColor).toBe(false)
  })

  it('EVERY unary css predicate is branded — no partial adoption', async () => {
    const css: any = await import('../css/index')
    const unary = Object.keys(css).filter(
      (k) => k.startsWith('is') && k !== 'isStyleValueFor'
    )
    expect(unary.length).toBeGreaterThan(10)
    expect(unary.filter((n) => !(css[n] instanceof Predicate))).toEqual([])
  })

  it('but a BINARY relation is not a Predicate', async () => {
    // `isStyleValueFor(prop, val)` asks whether a value is valid FOR a property. A predicate's
    // contract is `check(v)` over one value; branding this would degrade `instanceof Predicate`
    // to "callable and boolean-ish".
    const css: any = await import('../css/index')
    expect(css.isStyleValueFor instanceof Predicate).toBe(false)
    expect(css.isStyleValueFor('color', 'red')).toBe(true)
  })
})

describe('predicates SERIALISE — new capability, not restored behaviour', () => {
  // Worth stating precisely, because it looks like a regression fix and is not.
  //
  // Before runtime types were callable, `JSON.stringify(Type('Age', 0))` THREW —
  // "Maximum call stack size exceeded" — because a Type carries a `schema` object with
  // internal cycles. Making types functions changed that throw into a silent `undefined`
  // (JSON drops functions), which is how the gap was noticed. `toJSON` closes it properly:
  // a type now serialises to its FACTS for the first time.
  it('a Type serialises to its facts', () => {
    expect(JSON.parse(JSON.stringify(Type('Age', 0)))).toEqual({
      description: 'Age',
      example: 0,
      default: 0,
      __runtimeType: true,
    })
  })

  it('a verified predicate serialises too', () => {
    const css: any = require('../css/index')
    expect(JSON.parse(JSON.stringify(css.isColor))).toEqual({
      __runtimeType: true,
      description: 'isColor',
    })
  })

  it('nested in an object, which is the case that actually matters', () => {
    // A type is far more likely to be serialised as part of a payload than on its own.
    const out = JSON.parse(JSON.stringify({ field: Type('Age', 0) }))
    expect(out.field.example).toBe(0)
  })

  it('and does not recurse, whatever it carries', () => {
    // `check` is the function itself and `schema` holds cycles; both are excluded. The test
    // is that this terminates at all — the first two attempts at `toJSON` did not.
    for (const p of [
      Type('Age', 0),
      Enum('C', ['a', 'b']),
      Union('U', [0, '']),
    ]) {
      expect(() => JSON.stringify(p)).not.toThrow()
    }
  })
})
