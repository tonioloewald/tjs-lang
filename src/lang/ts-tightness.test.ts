/**
 * TIGHTNESS: does a TypeScript declaration enforce as strictly in TJS as it does in tsc?
 *
 * `ts-compat.test.ts` measures **acceptance** — does the syntax parse. This file measures
 * the thing that actually matters: for a declaration TJS accepts, is a value TypeScript
 * would reject actually rejected at runtime? A type that parses and then validates nothing
 * is the `s: string` → `any` failure all over again: it looks typed, transpiles clean, and
 * protects nothing, in a language whose entire pitch is that types survive to runtime.
 *
 * **Goal: catch everything tsc catches** — minus the places tsc is stupidly strict, which
 * are called out individually rather than waved at.
 *
 * Current score: **7/12 tight**. Each LOOSE row is a specific piece of work, and each is
 * expressed as a failing-if-fixed assertion so closing one is impossible to miss.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { tjs } from './index'
import { createRuntime, isMonadicError } from './runtime'

let saved: any
beforeAll(() => {
  saved = (globalThis as any).__tjs
  ;(globalThis as any).__tjs = createRuntime()
})
afterAll(() => {
  ;(globalThis as any).__tjs = saved
})

const fn = (src: string) =>
  new Function(tjs(src, { runTests: false }).code + '\nreturn f')()

/** Does this declaration reject a value TypeScript would reject? */
const rejects = (src: string, bad: unknown) => isMonadicError(fn(src)(bad))
const accepts = (src: string, good: unknown) => !isMonadicError(fn(src)(good))

describe('TIGHT: enforces exactly as strictly as TypeScript', () => {
  const TIGHT: Array<[string, string, unknown, unknown]> = [
    ['s: string', `function f(s: string) { return s }`, 42, 'ok'],
    ['n: number', `function f(n: number) { return n }`, 'x', 1.5],
    ['b: boolean', `function f(b: boolean) { return b }`, 'x', true],
    [
      'object shape — wrong member type',
      `function f(o: { id: number, name: string }) { return o }`,
      { id: 'x', name: 'a' },
      { id: 1, name: 'a' },
    ],
    [
      'object shape — missing member',
      `function f(o: { id: number, name: string }) { return o }`,
      { id: 1 },
      { id: 1, name: 'a' },
    ],
    [
      'union of primitives',
      `function f(x: string | number) { return x }`,
      true,
      1,
    ],
    ['nullable union', `function f(x: string | null) { return x }`, 42, null],
  ]

  for (const [label, src, bad, good] of TIGHT) {
    it(`${label}`, () => {
      expect(rejects(src, bad), `must reject ${JSON.stringify(bad)}`).toBe(true)
      expect(accepts(src, good), `must accept ${JSON.stringify(good)}`).toBe(
        true
      )
    })
  }
})

describe('LOOSE: accepted syntax that does NOT enforce (work queue)', () => {
  // Each of these is a real hole: the annotation is there, the reader believes it means
  // something, and nothing checks it. Flip the expectation when you close one.

  it('BUG: optional param with a TS type name emits broken code', () => {
    // `n?: number` emits `function f(n = number)` — a reference to an undefined variable,
    // so calling it throws `number is not defined`. Worse than loose: broken. The fix
    // needs a side channel; stripping the annotation instead silently degrades the param
    // to `any` (tried, reverted — loud beats silent). See TODO.
    const f = fn(`function f(n?: number) { return n }`)
    expect(
      f(1),
      'passing a value is fine — the default is never evaluated'
    ).toBe(1)
    // …but OMITTING it, which is the entire point of an optional parameter, evaluates
    // `number` as an expression and throws.
    expect(() => f()).toThrow(/number is not defined/)
  })

  it("LOOSE: literal union `x: 'a' | 'b'` does not narrow", () => {
    // TS narrows to exactly two values; TJS reads each literal as an EXAMPLE, so both
    // widen to `string` and the union collapses to `string`. This is the one place the
    // examples model genuinely collides with TS semantics — a TS literal union should
    // probably be honoured as an enum. Design decision, not just a missing check.
    expect(rejects(`function f(x: 'a' | 'b') { return x }`, 'c')).toBe(false)
  })

  it('LOOSE: arrow function params are not validated at all', () => {
    // Only `function` declarations get boundary checks. Arrows are ubiquitous in real
    // TypeScript, so this is probably the highest-impact row in this file.
    const arrow = new Function(
      tjs(`const f = (s: string): string => s`, { runTests: false }).code +
        '\nreturn f'
    )()
    expect(isMonadicError(arrow(42))).toBe(false)
  })

  it('LOOSE: rest params `...xs: number[]` are not validated', () => {
    expect(rejects(`function f(...xs: number[]) { return xs }`, 'x')).toBe(
      false
    )
  })

  it('LOOSE: tuple `p: [number, string]` does not check position types', () => {
    expect(
      rejects(`function f(p: [number, string]) { return p }`, ['a', 1])
    ).toBe(false)
  })

  it('reports the tightness score', () => {
    // 7 tight / 12 measured. Moves as rows above are closed; kept visible so "we support
    // TypeScript" can never quietly mean "we parse TypeScript".
    console.log('  TS tightness: 7/12 declarations enforce as strictly as tsc')
    expect(true).toBe(true)
  })
})
