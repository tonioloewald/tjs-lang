/**
 * Discriminated unions dispatch by their discriminant (#45).
 *
 * TypeScript's version is a PATTERN you hand-write: `switch (s.kind)`, plus a `never` check
 * you have to remember. TJS offers dispatch as a language mechanism instead — and it could
 * not express the thing discriminated unions are for, because
 * `f(s: Circle)` / `f(s: Rect)` was rejected as *"ambiguous signatures"*.
 *
 * Three separate defects, each hiding the next:
 *
 *   1. A discriminant WIDENED. `kind: 'circle'` means "a string" under the example rule, so
 *      `Circle` and `Rect` were the same shape and nothing could tell them apart.
 *      `Exactly('circle')` fixes the spelling.
 *   2. `Type()` ignored a nested RuntimeType, inferring the example structurally — so a type
 *      built with `Exactly` inside REJECTED ITS OWN EXAMPLE. A type that fails its own
 *      example is not narrow, it is broken.
 *   3. The dispatcher compared `typeof`-level kinds, so two named object types both scored
 *      `'any'` and collided — and even once distinguished, the emitted matcher is the INLINE
 *      stub, not the runtime `Type`, so fixing the real one changed nothing that ships.
 *
 * That last one is the trap `docs/type-identity.md` exists to warn about, hit again: the
 * fix to `src/types/Type.ts` was invisible until the inline `__match` learned the same rule.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { Type, Exactly } from '../types/Type'

const load = (src: string, name: string) =>
  new Function(tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`)()
const isErr = (v: unknown) =>
  !!v && typeof v === 'object' && (v as any).name === 'MonadicError'

const SHAPES = `Type Circle { example: { kind: Exactly('circle'), r: 0.0 } }
Type Rect { example: { kind: Exactly('rect'), w: 0.0, h: 0.0 } }
`

describe('a nested Exactly makes a discriminant exact', () => {
  it('the runtime Type honours it', () => {
    const Circle = Type('Circle', undefined, {
      kind: Exactly('circle'),
      r: 0.0,
    })
    expect(Circle.check({ kind: 'circle', r: 1 })).toBe(true)
    expect(Circle.check({ kind: 'rect', r: 1 })).not.toBe(true)
  })

  it('and names the offending field when it fails', () => {
    // `false` tells you nothing about a five-field object. The path is the useful part.
    const Circle = Type('Circle', undefined, {
      kind: Exactly('circle'),
      r: 0.0,
    })
    expect(String(Circle.check({ kind: 'rect', r: 1 }))).toContain('kind')
  })

  it('the type still accepts its own example (the thing that was broken)', () => {
    const Circle = Type('Circle', undefined, {
      kind: Exactly('circle'),
      r: 0.0,
    })
    expect(Circle.check({ kind: 'circle', r: 0.0 })).toBe(true)
  })

  it('EMITTED code honours it too — the inline stub is what ships', () => {
    const f = load(
      SHAPES + `export function f(s: Circle):! 0 { return 1 }`,
      'f'
    )
    expect(f({ kind: 'circle', r: 1 })).toBe(1)
    expect(isErr(f({ kind: 'rect', r: 1 }))).toBe(true)
  })
})

describe('overloads dispatch on the declared type', () => {
  const area = load(
    SHAPES +
      `export function area(s: Circle):! 0.0 { return 3.14159 * s.r * s.r }\n` +
      `export function area(s: Rect):! 0.0 { return s.w * s.h }\n`,
    'area'
  )

  it('picks the variant whose type matches', () => {
    expect(area({ kind: 'circle', r: 2 })).toBeCloseTo(12.56636, 4)
    expect(area({ kind: 'rect', w: 3, h: 4 })).toBe(12)
  })

  it('a value matching NEITHER is an error, not an arbitrary variant', () => {
    // Dispatch that guesses is worse than dispatch that refuses: the runtime guarantee is
    // what TS's compile-time `never` check cannot give you, since `as` defeats it.
    const out = area({ kind: 'tri', a: 1 })
    expect(isErr(out)).toBe(true)
    expect(String((out as any).expected)).toContain('no matching overload')
  })

  it('two distinct named types are no longer "ambiguous"', () => {
    // The signature for a declared type is now the type NAME, so `Circle` and `Rect` are
    // different signatures. Previously both scored `any` and the pair was rejected outright.
    expect(() =>
      tjs(
        SHAPES +
          `export function area(s: Circle):! 0 { return 1 }\n` +
          `export function area(s: Rect):! 0 { return 2 }\n`
      )
    ).not.toThrow()
  })

  it('genuinely ambiguous overloads are STILL rejected', () => {
    // The control. Making named types distinguishable must not make everything legal —
    // two variants with identical parameter types remain an error.
    expect(() =>
      tjs(
        `export function f(a: 0):! 0 { return 1 }\n` +
          `export function f(b: 0):! 0 { return 2 }\n`
      )
    ).toThrow(/ambiguous/)
  })
})
