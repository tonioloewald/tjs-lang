/**
 * Sound TypeScript type names produce REAL runtime checks.
 *
 * TJS's design line is "implement the parts of TypeScript that aren't Turing-complete
 * damage; best-effort the rest". The sound half had quietly gone missing in native TJS:
 * `function f(s: string)` inferred `any`, so it transpiled cleanly, looked typed, and
 * validated **nothing** — in a language whose entire pitch is that types survive to
 * runtime. Worse, it's the annotation newcomers and models reach for first
 * (ASSUMPTIONS.md A7), so the failure was both silent and likely.
 *
 * These tests pin both halves of the line: sound types check, undecidable ones degrade
 * to best-effort `any` on purpose.
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

const compile = (src: string, name = 'f') =>
  new Function(tjs(src, { runTests: false }).code + `\nreturn ${name}`)()

describe('sound TS type names are honoured as runtime types', () => {
  it('string / number / boolean validate, exactly like example types', () => {
    const s = compile(`function f(s: string) { return s }`)
    expect(s('ok')).toBe('ok')
    expect(isMonadicError(s(42)), '`s: string` must reject a number').toBe(true)

    const n = compile(`function f(n: number) { return n }`)
    expect(n(1.5)).toBe(1.5)
    expect(isMonadicError(n('nope'))).toBe(true)

    const b = compile(`function f(b: boolean) { return b }`)
    expect(b(true)).toBe(true)
    expect(isMonadicError(b('nope'))).toBe(true)
  })

  it('a TS name and the equivalent example agree', () => {
    // The two spellings are the same type. If they ever disagree, one of them is lying.
    const viaName = compile(`function f(s: string) { return s }`)
    const viaExample = compile(`function f(s: '') { return s }`)
    expect(isMonadicError(viaName(42))).toBe(isMonadicError(viaExample(42)))
    expect(viaName('x')).toBe(viaExample('x'))
  })

  it('unions of sound types validate', () => {
    const u = compile(`function f(a: string | number) { return a }`)
    expect(u('x')).toBe('x')
    expect(u(1)).toBe(1)
    expect(isMonadicError(u(true))).toBe(true)
  })

  it('`any`/`unknown` mean what they say — unconstrained', () => {
    for (const src of [
      `function f(a: any) { return a }`,
      `function f(a: unknown) { return a }`,
    ]) {
      const f = compile(src)
      expect(isMonadicError(f(42))).toBe(false)
      expect(isMonadicError(f('x'))).toBe(false)
    }
  })

  it('an unresolvable user type degrades to best-effort, not an error', () => {
    // Deliberate: we cannot resolve `MyThing` statically, and rejecting it would break
    // the TJS ⊇ JS invariant for code that means something to a human reader.
    const f = compile(`function f(a: MyThing) { return a }`)
    expect(isMonadicError(f(42))).toBe(false)
  })

  it('KNOWN GAP: `string[]` does not parse — but fails LOUDLY, not silently', () => {
    // The TJS spelling is `['']`. TS's `T[]` suffix isn't parseable as an expression,
    // so it throws. That's an acceptable interim state precisely because it is loud:
    // a parse error tells you to fix something, whereas the old silent `any` told you
    // nothing while removing your type checking.
    expect(() =>
      tjs(`function f(a: string[]) { return a }`, { runTests: false })
    ).toThrow()
  })
})

describe('best-effort degradation teaches the ladder', () => {
  it('an unresolvable type warns and suggests example / sound type / predicate', () => {
    const r = tjs(`function f(a: MyThing) { return a }`, { runTests: false })
    const w = (r.warnings ?? []).join('\n')
    expect(w).toContain('MyThing')
    expect(w).toContain('best effort')
    // Show the remedy, don't just describe it (A1: shown remedies repaired 80%,
    // prose 50%, bare diagnostics 0%).
    expect(w).toMatch(/Type MyThing \{ predicate/)
  })

  it('does NOT warn when `any`/`unknown` was asked for explicitly', () => {
    // Honouring `any` is not a degradation — warning here would train users to
    // ignore the channel, which is how a useful warning becomes noise.
    const r = tjs(`function f(a: any, b: unknown) { return a }`, {
      runTests: false,
    })
    expect(r.warnings ?? []).toEqual([])
  })

  it('does NOT warn for sound types or examples', () => {
    const r = tjs(`function f(a: string, b: 3, c: 3.0) { return a }`, {
      runTests: false,
    })
    expect(r.warnings ?? []).toEqual([])
  })
})
