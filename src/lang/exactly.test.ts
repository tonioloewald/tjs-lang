/**
 * `Exactly(…)` — the value IS this, not "an example of its type" (#45).
 *
 * The example rule is the right default and has exactly one blind spot: it cannot express a
 * literal. `x: 1` means "an integer, for instance 1", so TypeScript's `x: 1` — the literal
 * type, where x must BE 1 — had no faithful spelling and `fromTS` silently widened it.
 *
 * It matters well beyond TS interop, because **a discriminant is a literal**. Under plain
 * widening `kind: 'circle'` means "a string", so `Circle` and `Rect` present as the same
 * shape and nothing can tell them apart — which is why dispatch rejects them as ambiguous.
 *
 * Implemented as a one-member `literal-union` rather than a new kind, so membership is the
 * language's `==` and every existing consumer (check emitter, JSON-Schema `enum`, `.d.ts`)
 * works unchanged.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { fromTS } from './emitters/from-ts'

const load = (src: string, name: string) =>
  new Function(tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`)()
const isErr = (v: unknown) =>
  !!v && typeof v === 'object' && (v as any).name === 'MonadicError'

describe('Exactly() accepts only the given values', () => {
  it('a single number', () => {
    const f = load(`export function one(x: Exactly(1)):! 0 { return x }`, 'one')
    expect(f(1)).toBe(1)
    expect(isErr(f(2))).toBe(true)
    expect(isErr(f('1'))).toBe(true) // no coercion — `==` is footgun-free `===`
    expect(isErr(f(null))).toBe(true)
  })

  it('several values — a closed set', () => {
    const f = load(
      `export function m(x: Exactly('a', 'b')):! '' { return x }`,
      'm'
    )
    expect(f('a')).toBe('a')
    expect(f('b')).toBe('b')
    expect(isErr(f('z'))).toBe(true)
  })

  it('booleans, which the example rule cannot narrow at all', () => {
    // `x: true` as an example means "a boolean"; `Exactly(true)` means true.
    const f = load(
      `export function t(x: Exactly(true)):! 0 { return x ? 1 : 0 }`,
      't'
    )
    expect(f(true)).toBe(1)
    expect(isErr(f(false))).toBe(true)
  })

  it('agrees with the equivalent literal union', () => {
    // `Exactly('a','b')` and `'a' | 'b'` must not diverge — same reading, two spellings.
    const a = load(
      `export function f(x: Exactly('a', 'b')):! '' { return x }`,
      'f'
    )
    const b = load(`export function f(x: 'a' | 'b'):! '' { return x }`, 'f')
    for (const v of ['a', 'b', 'z', 1, null]) {
      expect(isErr(a(v))).toBe(isErr(b(v)))
    }
  })

  it('an unusable argument degrades rather than lying', () => {
    // `Exactly(someVar)` cannot be read statically. Best-effort, not a false check.
    const f = load(
      `const v = 3\nexport function f(x: Exactly(v)):! 0 { return 1 }`,
      'f'
    )
    expect(f('anything')).toBe(1)
  })
})

describe('fromTS preserves TypeScript literal types', () => {
  const convert = (ts: string) =>
    fromTS(ts, { emitTJS: true, filename: 't.ts' }).code

  it('`x: 1` converts to Exactly(1), not to an example', () => {
    expect(convert('export function one(x: 1): 1 { return x }')).toContain(
      'Exactly(1)'
    )
  })

  it('string and boolean literal types too', () => {
    expect(convert('export function g(x: "go"): void {}')).toContain(
      "Exactly('go')"
    )
    expect(convert('export function h(x: true): void {}')).toContain(
      'Exactly(true)'
    )
  })

  it('the metadata carries the exact values', () => {
    // Converted output is annotated `/* tjs <- … */`, which means JS SEMANTICS, so no
    // runtime check is emitted there — the same boundary the #37 `new`-stripping fix landed
    // on. What must survive is the TYPE, so `.d.ts`, JSON Schema and graduation are right.
    const meta = tjs(convert('export function one(x: 1): 1 { return x }')).code
    expect(meta).toContain('"kind": "literal-union"')
  })

  it('and the check appears once the file graduates to native .tjs', () => {
    const tjsSrc = convert('export function one(x: 1): 1 { return x }').replace(
      /\/\* tjs <- [^*]*\*\/\n?/,
      ''
    )
    const f = load(tjsSrc, 'one')
    expect(f(1)).toBe(1)
    expect(isErr(f(2))).toBe(true)
  })
})
