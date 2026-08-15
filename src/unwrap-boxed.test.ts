/**
 * The runtime unwrapper and the EMITTED one give identical answers, on hostile input.
 *
 * Boxed-primitive unwrapping existed six times at three hardening levels, and the copies
 * disagreed on shipped semantics — emitted code calls `Is`/`Eq` bare, so the inline stub
 * always wins (`docs/type-identity.md`). An earlier pass hardened three copies by hand,
 * and they were the copies emitted code does not run:
 *
 *     class Liar extends Number { valueOf() { return 999 } }
 *     Is(new Liar(1), 999)   shared: false   emitted: true    <- ran the hostile method
 *
 *     const p = new Proxy({}, { getPrototypeOf: () => Boolean.prototype })
 *     p == true              shared: false   emitted: THREW   <- out of `==`
 *
 * The second matters most: a `==` that throws breaks the promise that errors are RETURNED,
 * not thrown.
 *
 * There are still two artefacts — a function and an emittable string — because emitted
 * `.js` must stand alone with no import. What makes that safe is not care: it is this
 * file, which runs BOTH against the same corpus and demands they agree. A differential
 * test is the only thing that keeps two copies honest; a shared constant they are both
 * *supposed* to derive from is exactly what the previous six copies also believed.
 */
import { describe, it, expect } from 'bun:test'
import { unwrapBoxed, UNWRAP_BOXED_SOURCE } from './unwrap-boxed'
import { tjs } from './lang/index'
import { Is as sharedIs, Eq as sharedEq } from './lang/runtime'

/** The emitted text, evaluated — exactly what ships inside a standalone `.js`. */
const emittedUb = new Function(`${UNWRAP_BOXED_SOURCE}\nreturn __ub`)() as (
  v: unknown
) => unknown

class Liar extends Number {
  valueOf() {
    return 999
  }
}
class LyingString extends String {
  valueOf() {
    return 'gotcha'
  }
  toString() {
    return 'gotcha'
  }
}

const HOSTILE: Array<[string, unknown]> = [
  ['plain number', 42],
  ['plain string', 'x'],
  ['boxed number', new Number(7)],
  ['boxed string', new String('s')],
  ['boxed boolean', new Boolean(false)],
  ['null', null],
  ['undefined', undefined],
  ['subclass with lying valueOf', new Liar(1)],
  ['String subclass with lying valueOf', new LyingString('real')],
  [
    'Proxy faking Boolean.prototype',
    new Proxy({}, { getPrototypeOf: () => Boolean.prototype }),
  ],
  [
    'Proxy with hasInstance trap',
    new Proxy(
      {},
      { get: (_t, k) => (k === Symbol.hasInstance ? () => true : undefined) }
    ),
  ],
  ['object', { a: 1 }],
  ['array', [1, 2]],
]

describe('the two unwrappers agree', () => {
  for (const [label, value] of HOSTILE) {
    it(`${label}`, () => {
      const run = (f: (v: unknown) => unknown) => {
        try {
          return `ok:${String(f(value))}`
        } catch (e: any) {
          return `threw:${e?.constructor?.name}`
        }
      }
      // Compared as strings so a THROW on one side and a value on the other is a visible
      // difference rather than two separate failures.
      expect(run(emittedUb)).toBe(run(unwrapBoxed))
    })
  }

  it('neither ever throws — that is the point', () => {
    for (const [, value] of HOSTILE) {
      expect(() => unwrapBoxed(value)).not.toThrow()
      expect(() => emittedUb(value)).not.toThrow()
    }
  })

  it('reads the SLOT, not the overridden method', () => {
    // `new Liar(1).valueOf()` is 999; the slot is 1.
    expect(unwrapBoxed(new Liar(1))).toBe(1)
    expect(emittedUb(new Liar(1))).toBe(1)
  })
})

describe('the operators built on it agree, end to end', () => {
  const load = (src: string, name: string) =>
    new Function(
      `${
        tjs(src, { filename: 'ub.tjs', runTests: false }).code
      }\nreturn ${name}`
    )()

  it('`Is` does not run a hostile valueOf', () => {
    const emitted = load('function f(a, b) { return Is(a, b) }', 'f')
    const liar: any = new Liar(1)
    expect(emitted(liar, 999)).toBe(sharedIs(liar, 999))
    expect(emitted(liar, 999)).toBe(false)
  })

  it('`==` returns rather than throwing on a lying Proxy', () => {
    const emitted = load('function f(a, b) { return a == b }', 'f')
    const p: any = new Proxy({}, { getPrototypeOf: () => Boolean.prototype })
    expect(() => emitted(p, true)).not.toThrow()
    expect(emitted(p, true)).toBe(sharedEq(p, true))
  })

  it('the ordinary cases still work', () => {
    // The control: hardening that broke real unwrapping would pass everything above.
    const eq = load('function f(a, b) { return a == b }', 'f')
    expect(eq(new Number(1), 1)).toBe(true)
    expect(eq(new String('a'), 'a')).toBe(true)
    expect(eq(new Boolean(false), false)).toBe(true)
    expect(eq('5', 5)).toBe(false)
  })
})
