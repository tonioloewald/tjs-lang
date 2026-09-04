function Exactly(...v) {
  const vals = v.flat()
  return {
    description: 'exactly ' + vals.map((x) => JSON.stringify(x)).join(' | '),
    check: (x) => vals.includes(x),
    values: vals,
    __runtimeType: true,
  }
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? undefined
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { fromTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'

/* line 20 */
function load(src, name) {
  return new Function(
    tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`
  )()
}
load.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    name: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:20',
}

/* line 22 */
function isErr(v) {
  return !!v && typeof v === 'object' && v.name === 'MonadicError'
}
isErr.__tjs = {
  params: {
    v: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:22',
}

describe('Exactly() accepts only the given values', () => {
  it('a single number', () => {
    const f = load(`export function one(x: Exactly(1)):! 0 { return x }`, 'one')
    expect(f(1)).toBe(1)
    expect(isErr(f(2))).toBe(true)
    expect(isErr(f('1'))).toBe(true)
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
    const f = load(
      `export function t(x: Exactly(true)):! 0 { return x ? 1 : 0 }`,
      't'
    )
    expect(f(true)).toBe(1)
    expect(isErr(f(false))).toBe(true)
  })
  it('agrees with the equivalent literal union', () => {
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
    const f = load(
      `const v = 3\nexport function f(x: Exactly(v)):! 0 { return 1 }`,
      'f'
    )
    expect(f('anything')).toBe(1)
  })
})

describe('fromTS preserves TypeScript literal types', () => {
  const convert = (ts) => fromTS(ts, { emitTJS: true, filename: 't.ts' }).code
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
