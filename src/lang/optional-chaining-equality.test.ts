/**
 * Regression: optional chaining must survive the `==`/`!=` → Eq/NotEq rewrite.
 *
 * `findLeftOperandBoundary` scans backwards for the start of the left operand and treated
 * `?` as a ternary boundary. So `o?.b != null` split into `o?` + `.b` and emitted
 * `o?NotEq(.b, null)?` — meaning the single most idiomatic null check in JavaScript did not
 * compile in native TJS.
 *
 * Found by the dogfood corpus (`vm/runtime.ts`), and only after an unrelated fix stopped
 * masking it — which is the argument for keeping that corpus green rather than merely
 * improving.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

let saved: any
beforeAll(() => {
  saved = (globalThis as any).__tjs
  ;(globalThis as any).__tjs = createRuntime()
})
afterAll(() => {
  ;(globalThis as any).__tjs = saved
})

const compile = (src: string) => tjs(src, { runTests: false })
const fn = (src: string) => new Function(compile(src).code + '\nreturn f')()

describe('optional chaining with TJS equality', () => {
  const FORMS = [
    ['member', `function f(o: {}) { return o?.b != null }`],
    ['chained', `function f(o: {}) { return o?.b?.c != null }`],
    ['computed', `function f(o: []) { return o?.[0] != null }`],
    ['call', `function f(g: null) { return g?.() != null }`],
  ] as const

  for (const [label, src] of FORMS) {
    it(`compiles: optional ${label} access before !=`, () => {
      expect(() => compile(src)).not.toThrow()
    })
  }

  it('evaluates correctly, not just parses', () => {
    const notNull = fn(`function f(o: {}) { return o?.b != null }`)
    expect(notNull({ b: 1 })).toBe(true)
    expect(notNull({})).toBe(false)

    const isNull = fn(`function f(o: {}) { return o?.b == null }`)
    expect(isNull({ b: 1 })).toBe(false)
    expect(isNull({})).toBe(true)
  })

  it('does not break the ternary boundary it shares a character with', () => {
    // `?` IS a boundary when it starts a ternary — only `?.` is part of the operand.
    const t = fn(`function f(a: 0) { return a == 1 ? 2 : 3 }`)
    expect(t(1)).toBe(2)
    expect(t(2)).toBe(3)
  })

  it('nullish coalescing still binds looser than equality', () => {
    // `??` is a genuine boundary — and a two-character one.
    expect(() =>
      compile(`function f(a: null, b: 0, c: 0) { return (a ?? b) == c }`)
    ).not.toThrow()
  })
})
