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
