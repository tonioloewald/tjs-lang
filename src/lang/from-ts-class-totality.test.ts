/**
 * `fromTS` class conversion is TOTAL: every construct is converted, erased as type-only, or
 * REFUSED — never silently dropped.
 *
 * ## The defect class
 *
 * `transformClassToTJS` rebuilds a class from parts, from a CLOSED whitelist — constructor,
 * method, getter, setter, property; modifiers `static` and `async` — and anything not on the
 * list simply did not come out. No error, no warning. Found through a permanently skipped test
 * whose stated reason ("decorators need experimentalDecorators, so the input does not parse")
 * had quietly become false: the input parsed fine, and the decorator vanished.
 *
 * Measured before fixing, on 0.14.0:
 *
 *   | input                          | output                                             |
 *   | ------------------------------ | -------------------------------------------------- |
 *   | `@d m() {}`, `@c class`, `@p x`, `m(@q a)` | decorator DROPPED — behaviour deleted  |
 *   | `static { E.n = 42 }`          | DROPPED — the code never runs                      |
 *   | `export default class F`       | `export class F` — every default import breaks     |
 *   | `accessor v = 1`               | DROPPED                                            |
 *   | `abstract m(): number`         | emitted as an EMPTY method `m() { }`               |
 *   | three overload signatures      | emitted as THREE methods                           |
 *
 * One design flaw, not nine bugs — so the fix is to the design: every member kind and every
 * modifier is now classified, and the unclassified case is a refusal. New TypeScript syntax
 * therefore fails loudly here instead of vanishing somewhere downstream.
 */
import { describe, it, expect } from 'bun:test'
import { fromTS } from './emitters/from-ts'
import { tjs } from './index'

const convert = (src: string) => fromTS(src, { emitTJS: true }).code

/** Convert, then compile the TJS and run it, returning `result`'s value. */
function run(src: string, result: string): any {
  const code = tjs(convert(src), { filename: 'x.tjs', runTests: false }).code
  return new Function(`${code}\nreturn ${result}`)()
}

describe('decorators are REFUSED, never dropped', () => {
  // They cannot be converted faithfully: the input is TypeScript's LEGACY decorator semantics
  // (`(target, key, descriptor)`), and emitting them as JavaScript decorators would run them
  // under the TC39 semantics — a different call signature. Dropping them deletes behaviour
  // (logging, validation, dependency injection) with no signal. So: loud.
  const CASES: Array<[string, string]> = [
    [
      'method',
      'function d(t: any, k: string, x: any) { return x }\nclass A {\n  @d\n  m() { return 1 }\n}',
    ],
    ['class', 'function c(k: any) { return k }\n@c\nclass B {}'],
    ['property', 'function p(t: any, k: string) {}\nclass C {\n  @p x = 1\n}'],
    [
      'parameter',
      'function q(t: any, k: any, i: number) {}\nclass D {\n  m(@q a: number) { return a }\n}',
    ],
    // A class EXPRESSION takes a different conversion path; the refusal is file-wide.
    [
      'class expression',
      'function d(t: any, k: string, x: any) { return x }\nconst E = class {\n  @d\n  m() { return 1 }\n}',
    ],
  ]
  for (const [label, src] of CASES) {
    it(`a ${label} decorator throws, naming the line and the remedy`, () => {
      expect(() => convert(src)).toThrow(/decorator/i)
      try {
        convert(src)
      } catch (e: any) {
        expect(e.message).toMatch(/:\d+/) // where
        expect(e.message).toMatch(
          /cannot be converted|convert it by hand|remove/i
        ) // what to do
      }
    })
  }
})

describe('constructs with a faithful conversion are CONVERTED', () => {
  it('a static block is kept, and runs', () => {
    const src = 'class E {\n  static n = 0\n  static { E.n = 42 }\n}'
    expect(convert(src)).toContain('static {')
    expect(run(src, 'E.n')).toBe(42)
  })

  it('export default stays a DEFAULT export', () => {
    expect(convert('export default class F {\n  m() { return 1 }\n}')).toMatch(
      /export default class F\b/
    )
  })
})

describe('type-only constructs are ERASED, as TypeScript erases them', () => {
  it('an abstract method is erased, not emitted as an empty method', () => {
    const out = convert(
      'abstract class H {\n  abstract m(): number\n  n() { return 1 }\n}'
    )
    expect(out).not.toMatch(/\bm\s*\(/)
    expect(out).toMatch(/\bn\s*\(/)
  })

  it('method overload signatures are erased — ONE method, the implementation', () => {
    // The constructor path already erased bodyless signatures; methods never got the rule.
    const src =
      'class I {\n  m(a: string): string\n  m(a: number): number\n  m(a: any) { return a }\n}'
    expect(convert(src).match(/\bm\s*\(/g)?.length).toBe(1)
    expect(run(`${src}\nconst i = new I()`, 'i.m(7)')).toBe(7)
  })
})

describe('ambient declarations are ERASED, not fabricated', () => {
  it('`declare class` emits NO class — it describes one that exists elsewhere', () => {
    // Found by the compat corpus the moment the class-modifier table existed: kysely declares
    // tedious's `TediousRequest` this way, and the converter used to emit a REAL class with
    // empty methods — a runtime export the TypeScript output does not have.
    const out = convert(
      'export declare class Remote {\n  send(x: string): void\n}\nexport const y = 1'
    )
    expect(out).not.toMatch(/class Remote/)
    expect(out).toMatch(/export const y = 1/)
  })

  it('a `declare` FIELD is erased, and the class around it survives', () => {
    const out = convert('class L {\n  declare x: number\n  m() { return 1 }\n}')
    expect(out).toMatch(/class L/)
    expect(out).not.toMatch(/\bx\b/)
  })
})

describe('constructor PARAMETER modifiers are classified too — the third place modifiers live', () => {
  // The narrow review of the totality fix found the counterexample: parameter modifiers were
  // never classified. `override` alone makes a parameter property — tsc emits `this.a = a` —
  // but only public/private/protected/readonly were recognised, so the assignment was dropped
  // silently: `new C(5).a === 0`.
  it('`override` alone makes a parameter property', () => {
    const src =
      'class B { a = 0 }\nclass C extends B {\n  constructor(override a: number) { super() }\n}\nconst c = new C(5)'
    expect(run(src, 'c.a')).toBe(5)
  })

  it('each property-making modifier assigns', () => {
    for (const mod of ['public', 'private', 'protected', 'readonly']) {
      const src = `class P {\n  constructor(${mod} a: number) {}\n}\nconst p = new P(7)`
      expect({ mod, a: run(src, 'p.a') }).toEqual({ mod, a: 7 })
    }
  })
})

describe('the remaining erasure and refusal branches are exercised', () => {
  it('an abstract ACCESSOR is erased, not emitted as `get x() { }`', () => {
    const out = convert(
      'abstract class H {\n  abstract get x(): number\n  abstract set y(v: number)\n  n() { return 1 }\n}'
    )
    expect(out).not.toMatch(/\bget x\b/)
    expect(out).not.toMatch(/\bset y\b/)
    expect(out).toMatch(/\bn\s*\(/)
  })

  it('a refusal is identifiable — code FROMTS_REFUSED — so a batch caller can tell it from a crash', () => {
    let err: any
    try {
      convert('class G {\n  accessor v = 1\n}')
    } catch (e) {
      err = e
    }
    expect(err?.code).toBe('FROMTS_REFUSED')
    expect(err?.name).toBe('FromTSRefusal')
  })
})

describe('ambient STATEMENTS emit no code — the declare-class rule, at the top level', () => {
  // Found by the class-metadata review, while checking an older overload gap: `declare function`
  // and `declare enum` were FABRICATED into runtime values TypeScript never emits — shadowing the
  // real one that lives elsewhere. Two `declare function f` signatures became two
  // `export function f`, a duplicate declaration that an ES module refuses to load.
  const code = (src: string) =>
    convert(`${src}\nexport const z = 1`)
      .replace(/\/\*[^]*?\*\//g, '')
      .replace(/export const z = 1;?/, '')
      .trim()

  for (const [label, src] of [
    ['declare function', 'declare function f(a: string): string'],
    [
      'two exported declare function signatures',
      'export declare function f(a: string): string\nexport declare function f(a: number): number',
    ],
    ['declare enum', 'declare enum Color { Red, Green }'],
    ['declare const enum', 'declare const enum Dir { Up, Down }'],
    ['export declare const', 'export declare const API: string'],
  ] as const) {
    it(`${label} emits nothing`, () => {
      expect(code(src)).toBe('')
    })
  }

  // The narrow review BLOCKED the first version of this rule: it skipped EVERY `declare`
  // statement, but in TJS an interface or type alias IS a runtime Type — the type is the
  // metadata. `export declare type Bar` lost its export (an import of it failed to link) and a
  // parameter typed with an ambient interface degraded to `any`. The rule is about VALUES:
  // ambient function/enum/variable/namespace emit nothing, because TypeScript emits nothing;
  // ambient TYPES are promoted like any other type.
  it('`declare interface` is still promoted to a TJS Type', () => {
    expect(convert('declare interface Foo { a: number }')).toMatch(/Type Foo\b/)
  })

  it('`export declare type` is still an exported TJS Type', () => {
    expect(convert('export declare type Bar = { b: string }')).toMatch(
      /export Type Bar\b/
    )
  })

  it('and a parameter typed with an ambient interface keeps its type, not `any`', () => {
    const tjsSrc = convert(
      'declare interface Foo { a: number }\nexport function f(x: Foo): number { return x.a }'
    )
    const out = tjs(tjsSrc, { filename: 'x.tjs', runTests: false }) as any
    const kind = out.types?.f?.params?.x?.type?.kind
    // POSITIVE, not `not.toBe('any')` — an undefined path would pass that vacuously. `declared`
    // is what the base commit produced (measured by the review's verifier).
    expect(kind).toBe('declared')
  })

  it('an ordinary function and enum are unaffected — apparatus check', () => {
    expect(
      convert('export function g(a: number): number { return a }')
    ).toMatch(/function g/)
    expect(convert('enum E { A, B }')).toMatch(/Enum E/)
  })
})

describe('the auto-accessor keyword is REFUSED', () => {
  it('`accessor v` throws rather than becoming a plain field or vanishing', () => {
    expect(() => convert('class G {\n  accessor v = 1\n}')).toThrow(/accessor/)
  })
})

describe('apparatus check — an ordinary class still converts and runs', () => {
  it('fields, constructor, methods, getter, static, private', () => {
    const src = `class K {
  static count = 0
  private secret = 3
  constructor(public base: number) { K.count++ }
  get doubled(): number { return this.base * 2 }
  add(n: number): number { return this.base + n + this.secret }
}
const k = new K(5)`
    expect(run(src, '[k.doubled, k.add(1), K.count]')).toEqual([10, 9, 1])
  })
})
