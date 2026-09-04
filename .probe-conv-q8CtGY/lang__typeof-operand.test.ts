function TypeOf(v) {
  return v === null ? 'null' : typeof v
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { TypeOf }
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 24 */
function lowered(expr) {
  const code = tjs(
    `export function t(x, k, j, f, a, b) { return ${expr} === 'z' }\n`
  ).code
  return (code.match(/TypeOf\(.*?\) === 'z'/)?.[0] ?? '(none)').replace(
    / === 'z'$/,
    ''
  )
}
lowered.__tjs = {
  params: {
    expr: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:24',
}

describe('typeof lowers the whole operand', () => {
  const CASES = [
    ['typeof x', 'TypeOf(x)'],
    ['typeof x.foo', 'TypeOf(x.foo)'],
    ['typeof x?.foo', 'TypeOf(x?.foo)'],

    ['typeof x[k]', 'TypeOf(x[k])'],
    ['typeof x[0]', 'TypeOf(x[0])'],
    [`typeof x['lit']`, `TypeOf(x['lit'])`],
    ['typeof x[k].foo', 'TypeOf(x[k].foo)'],
    ['typeof x.foo[k]', 'TypeOf(x.foo[k])'],
    ['typeof x[k][j]', 'TypeOf(x[k][j])'],
    ['typeof x[a[b]]', 'TypeOf(x[a[b]])'],
    ['typeof f()', 'TypeOf(f())'],
  ]
  for (const [src, want] of CASES) {
    it(`${src} -> ${want}`, () => {
      expect(lowered(src)).toBe(want)
    })
  }
})

describe('the guard that silently always passed', () => {
  const run = (src, name) =>
    new Function(tjs(src).code.replace(/^export /gm, '') + `\nreturn ${name}`)()
  it('filters out functions, as written', () => {
    const keep = run(
      `export function keep(obj) {
  const out = []
  for (const k of Object.keys(obj)) { if (typeof obj[k] !== 'function') out.push(k) }
  return out
}\n`,
      'keep'
    )
    expect(keep({ a: 1, fn: () => {}, b: 2 })).toEqual(['a', 'b'])
  })
  it('a computed access still gets the typeof-null correction', () => {
    const t = run(`export function t(o, k) { return typeof o[k] }\n`, 't')
    expect(t({ x: null }, 'x')).toBe('null')

    expect(t({ x: [] }, 'x')).toBe('object')
  })
  it('a bracket inside a STRING is not structure', () => {
    const t = run(`export function t(x) { return typeof x + '[k]' }\n`, 't')
    expect(t(1)).toBe('number[k]')
  })
})
