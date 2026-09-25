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
