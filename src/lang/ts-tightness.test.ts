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
 * Current score: **8/12 tight**. Each LOOSE row is a specific piece of work, and each is
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

/**
 * GRADUATED from the work queue: optional params with a TS type name.
 *
 * `n?: number` used to emit `function f(n = number)` — a reference to an undefined
 * variable — so calling it without the argument, which is the entire point of an optional
 * parameter, threw `number is not defined`. Worse than loose: broken.
 *
 * The fix needed the side channel the old note predicted. Stripping the annotation in the
 * parser was tried and reverted, because that string is also what inference reads to learn
 * the type, so removing it degraded the param to `any` — trading a loud crash for a silent
 * hole. The emitter deletes the default instead, driven by a `typeNameOptionals` set the
 * parser records: `n?: MyThing` and `x = someVar` produce byte-identical AST, and only the
 * parser knows which one was an annotation.
 */
describe('TIGHT: optional params with a type name are optional AND checked', () => {
  it('is callable with no argument', () => {
    const f = fn(`function f(n?: number) { return n }`)
    expect(f()).toBeUndefined()
    expect(f(1)).toBe(1)
  })

  it('still enforces the type when a value IS passed', () => {
    // The half that must not be lost: deleting the default must not delete the type.
    const f = fn(`function f(n?: number) { return n }`)
    expect(isMonadicError(f('nope'))).toBe(true)
  })

  it('does not touch a genuine JS default that references a variable', () => {
    // The regression this side channel exists to avoid — `x = someVar` looks identical
    // to `n?: MyThing` in the AST, and an earlier attempt deleted both.
    const f = fn(`const someVar = 5\nfunction f(x = someVar) { return x }`)
    expect(f()).toBe(5)
  })
})

describe('LOOSE: accepted syntax that does NOT enforce (work queue)', () => {
  // Each of these is a real hole: the annotation is there, the reader believes it means
  // something, and nothing checks it. Flip the expectation when you close one.

  it("LOOSE: literal union `x: 'a' | 'b'` does not narrow", () => {
    // TS narrows to exactly two values; TJS reads each literal as an EXAMPLE, so both
    // widen to `string` and the union collapses to `string`. This is the one place the
    // examples model genuinely collides with TS semantics — a TS literal union should
    // probably be honoured as an enum. Design decision, not just a missing check.
    expect(rejects(`function f(x: 'a' | 'b') { return x }`, 'c')).toBe(false)
  })

  it('TIGHT: arrow function params are validated', () => {
    // Was the highest-impact row in this file: only `function` declarations got boundary
    // checks, so the SAME annotation was enforced or ignored depending purely on which
    // spelling you used — and arrows are most of real TypeScript. Now both are checked.
    const arrow = new Function(
      tjs(`const f = (s: string): string => s`, { runTests: false }).code +
        '\nreturn f'
    )()
    expect(isMonadicError(arrow(42))).toBe(true)
    expect(arrow('ok')).toBe('ok')
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
    // 8 tight / 12 measured. Moves as rows above are closed; kept visible so "we support
    // TypeScript" can never quietly mean "we parse TypeScript".
    console.log('  TS tightness: 8/12 declarations enforce as strictly as tsc')
    expect(true).toBe(true)
  })
})
