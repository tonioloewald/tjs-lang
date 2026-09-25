/**
 * Type-only class facts are ERASED from emitted code but must SURVIVE in metadata.
 *
 * The rule that separates the two: emitted code must behave exactly as TypeScript's does, so an
 * abstract method or an overload signature — neither of which exists at runtime — is erased
 * there (emitting one invented behaviour: an empty `m() { }`). But TJS keeps types as
 * introspectable metadata, and that is where type-only information belongs. The maintainer's
 * reason for doing this before 0.14.0: "just `abstract: true` is insanely useful for
 * autocomplete" — a completion list that can say "declared, not implemented here".
 *
 * Measured before fixing: `declare class` metadata survived intact, but
 *   - an abstract method's signature survived with NOTHING marking it abstract, and
 *   - method OVERLOAD signatures were lost entirely: methods were recorded by name, so the
 *     implementation silently overwrote each signature, and `m(string): string` /
 *     `m(number): number` collapsed to the implementation's `m(a: any)` — the most precise
 *     types in the class, replaced by `any`.
 *
 * Methods now use the SAME shape top-level functions already had: the implementation's info,
 * with `overloads: [one FunctionTypeInfo per signature]`.
 */
import { describe, it, expect } from 'bun:test'
import { fromTS } from './emitters/from-ts'

const classes = (src: string) => (fromTS(src, { emitTJS: true }) as any).classes

describe('method overloads survive in metadata', () => {
  const md = classes(
    'class I {\n  m(a: string): string\n  m(a: number): number\n  m(a: any) { return a }\n}'
  ).I.methods.m

  it('the implementation is the top-level entry, as for functions', () => {
    expect(md.params.a.type.kind).toBe('any')
  })

  it('every signature is recorded, in order, with its own precise types', () => {
    expect(md.overloads?.length).toBe(2)
    expect(
      md.overloads.map((o: any) => [o.params.a.type.kind, o.returns?.kind])
    ).toEqual([
      ['string', 'string'],
      ['number', 'number'],
    ])
  })

  it('a method WITHOUT overloads has no overloads field — absent, not []', () => {
    const plain = classes('class J {\n  n(x: number): number { return x }\n}').J
      .methods.n
    expect('overloads' in plain).toBe(false)
  })

  it('static methods get the same treatment', () => {
    const s = classes(
      'class K {\n  static f(a: string): string\n  static f(a: number): number\n  static f(a: any) { return a }\n}'
    ).K.staticMethods.f
    expect(s.overloads?.length).toBe(2)
  })
})

describe('abstract is recorded — on the class and on its members', () => {
  const H = classes(
    'abstract class H {\n  abstract m(x: number): string\n  n(): number { return 1 }\n}'
  ).H

  it('the abstract method keeps its signature AND says it is abstract', () => {
    expect(H.methods.m.abstract).toBe(true)
    expect(H.methods.m.params.x.type.kind).toBe('number')
    expect(H.methods.m.returns.kind).toBe('string')
  })

  it('a concrete method in the same class is not marked', () => {
    expect('abstract' in H.methods.n).toBe(false)
  })

  it('the CLASS is marked abstract — it cannot be instantiated', () => {
    expect(H.abstract).toBe(true)
    expect('abstract' in classes('class C {}').C).toBe(false)
  })

  it('an abstract method with overloads keeps both facts', () => {
    const md = classes(
      'abstract class A {\n  abstract f(a: string): string\n  abstract f(a: number): number\n}'
    ).A.methods.f
    expect(md.abstract).toBe(true)
    expect(md.overloads?.length).toBe(2)
  })
})

describe('the emitted code is unchanged by any of this — apparatus check', () => {
  it('abstract and overload signatures are still erased from the CODE', () => {
    const { code } = fromTS(
      'abstract class H {\n  abstract m(): number\n  f(a: string): string\n  f(a: any) { return a }\n}',
      { emitTJS: true }
    )
    expect(code).not.toMatch(/\bm\s*\(/)
    expect(code.match(/\bf\s*\(/g)?.length).toBe(1)
  })
})

describe('ONE rule for overload groups — with an implementation or without', () => {
  // `overloads` is the full list of CALLABLE signatures; the entry is a summary — the
  // implementation, or the FIRST signature when there is none. Render `overloads` when present.
  // Before: a group with no implementation kept the LAST signature and no overloads at all.
  it('an ambient class method group: entry = first signature, overloads = all of them', () => {
    const m = classes(
      'declare class D {\n  m(a: string): string\n  m(a: number): number\n}'
    ).D.methods.m
    expect(m.params.a.type.kind).toBe('string')
    expect(m.overloads.map((o: any) => o.params.a.type.kind)).toEqual([
      'string',
      'number',
    ])
  })

  it('ambient top-level function signatures use the same shape', () => {
    const r: any = fromTS(
      'export declare function f(a: string): string\nexport declare function f(a: number): number',
      { emitTJS: true }
    )
    expect(r.types.f.params.a.type.kind).toBe('string')
    expect(r.types.f.overloads.map((o: any) => o.params.a.type.kind)).toEqual([
      'string',
      'number',
    ])
  })

  it('CONSTRUCTOR overloads survive too — the other site with the by-name defect', () => {
    const c = classes(
      'class A {\n  constructor(a: string)\n  constructor(a: number)\n  constructor(a: any) {}\n}'
    ).A.constructor
    expect(c.params.a.type.kind).toBe('any')
    expect(c.overloads.map((o: any) => o.params.a.type.kind)).toEqual([
      'string',
      'number',
    ])
  })

  it('a single ambient signature has no overloads field', () => {
    const r: any = fromTS('declare function g(a: number): number', {
      emitTJS: true,
    })
    expect(r.types.g.params.a.type.kind).toBe('number')
    expect('overloads' in r.types.g).toBe(false)
  })
})
