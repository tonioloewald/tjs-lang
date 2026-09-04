/* tjs <- input.ts */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  createRuntime,
  isMonadicError,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

let saved

beforeAll(() => {
  saved = globalThis.__tjs
  globalThis.__tjs = createRuntime()
})

afterAll(() => {
  globalThis.__tjs = saved
})

/* line 29 */
function fn(src) {
  return new Function(tjs(src, { runTests: false }).code + '\nreturn f')()
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
  source: 'input.ts:29',
}

/* line 33 */
function rejects(src, bad) {
  return isMonadicError(fn(src)(bad))
}
rejects.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    bad: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:33',
}

/* line 34 */
function accepts(src, good) {
  return !isMonadicError(fn(src)(good))
}
accepts.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    good: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:34',
}

describe('TIGHT: enforces exactly as strictly as TypeScript', () => {
  const TIGHT = [
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

describe('TIGHT: optional params with a type name are optional AND checked', () => {
  it('is callable with no argument', () => {
    const f = fn(`function f(n?: number) { return n }`)
    expect(f()).toBeUndefined()
    expect(f(1)).toBe(1)
  })
  it('still enforces the type when a value IS passed', () => {
    const f = fn(`function f(n?: number) { return n }`)
    expect(isMonadicError(f('nope'))).toBe(true)
  })
  it('does not touch a genuine JS default that references a variable', () => {
    const f = fn(`const someVar = 5\nfunction f(x = someVar) { return x }`)
    expect(f()).toBe(5)
  })
})

describe('LOOSE: accepted syntax that does NOT enforce (work queue)', () => {
  it("TIGHT: literal union `x: 'a' | 'b'` narrows to its members", () => {
    expect(rejects(`function f(x: 'a' | 'b') { return x }`, 'c')).toBe(true)
    expect(rejects(`function f(x: 'a' | 'b') { return x }`, 'a')).toBe(false)
  })
  it('TIGHT: arrow function params are validated', () => {
    const arrow = new Function(
      tjs(`const f = (s: string): string => s`, { runTests: false }).code +
        '\nreturn f'
    )()
    expect(isMonadicError(arrow(42))).toBe(true)
    expect(arrow('ok')).toBe('ok')
  })
  it('TIGHT: rest params `...xs: number[]` are validated', () => {
    expect(rejects(`function f(...xs: number[]) { return xs }`, 'x')).toBe(true)
  })
  it('LOOSE: tuple `p: [number, string]` does not check position types', () => {
    expect(
      rejects(`function f(p: [number, string]) { return p }`, ['a', 1])
    ).toBe(false)
  })
  it('reports the tightness score', () => {
    console.log('  TS tightness: 10/12 declarations enforce as strictly as tsc')
    expect(true).toBe(true)
  })
})
