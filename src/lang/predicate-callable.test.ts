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
import { Type, Enum, Union, FunctionPredicate, Predicate } from '../types/Type'
import { isRuntimeType } from '../types/Type'
import { tjs } from './index'
import { createRuntime } from './runtime'

describe('the real runtime: predicates are callable', () => {
  const CASES: Array<[string, any, unknown, unknown]> = [
    ['Type', Type('Age', 0), 5, 'x'],
    ['Enum', Enum('Colour', ['red', 'green']), 'red', 'blue'],
    ['Union', Union('Mixed', [0, '']), 0, true],
  ]

  for (const [label, pred, pass, fail] of CASES) {
    it(`${label} is callable and decides`, () => {
      expect(typeof pred).toBe('function')
      expect(pred(pass)).toBe(true)
      expect(pred(fail)).toBe(false)
    })

    it(`${label}.check IS the function — one implementation`, () => {
      // Not "behaves the same as" — the same object. Two implementations is the failure mode.
      expect(pred.check).toBe(pred)
    })

    it(`${label} is instanceof Predicate, via a real prototype chain`, () => {
      expect(pred instanceof Predicate).toBe(true)
      // Still a function to everything that does not know better.
      expect(typeof pred.bind).toBe('function')
    })

    it(`${label} is still recognised as a runtime type`, () => {
      expect(isRuntimeType(pred)).toBe(true)
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
  /** Transpile and evaluate, returning the module's exports. */
  function run(source: string): any {
    const saved = (globalThis as any).__tjs
    try {
      ;(globalThis as any).__tjs = createRuntime()
      const { code } = tjs(source, { filename: 'a.tjs', runTests: false })
      return new Function(`${code}\nreturn { Age }`)()
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  }

  const { Age } = run(`Type Age 0\n`)

  it('a type emitted by the stub is callable too', () => {
    expect(typeof Age).toBe('function')
    expect(Age(5)).toBe(true)
    expect(Age('x')).toBe(false)
  })

  it('and its check is the same function', () => {
    expect(Age.check).toBe(Age)
  })

  it('and it carries the declared name', () => {
    expect(Age.name).toBe('Age')
  })

  it('and the stub still agrees with the real runtime on the DECISION', () => {
    // The behavioural half. Shape parity is worthless if the two disagree on the answer.
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
