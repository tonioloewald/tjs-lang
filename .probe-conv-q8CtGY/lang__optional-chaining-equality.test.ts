/* tjs <- input.ts */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

let saved

beforeAll(() => {
  saved = globalThis.__tjs
  globalThis.__tjs = createRuntime()
})

afterAll(() => {
  globalThis.__tjs = saved
})

/* line 26 */
function compile(src) {
  return tjs(src, { runTests: false })
}
compile.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:26',
}

/* line 27 */
function fn(src) {
  return new Function(compile(src).code + '\nreturn f')()
}
fn.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:27',
}

describe('optional chaining with TJS equality', () => {
  const FORMS = [
    ['member', `function f(o: {}) { return o?.b != null }`],
    ['chained', `function f(o: {}) { return o?.b?.c != null }`],
    ['computed', `function f(o: []) { return o?.[0] != null }`],
    ['call', `function f(g: null) { return g?.() != null }`],
  ]
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
    const t = fn(`function f(a: 0) { return a == 1 ? 2 : 3 }`)
    expect(t(1)).toBe(2)
    expect(t(2)).toBe(3)
  })
  it('nullish coalescing still binds looser than equality', () => {
    expect(() =>
      compile(`function f(a: null, b: 0, c: 0) { return (a ?? b) == c }`)
    ).not.toThrow()
  })
})
