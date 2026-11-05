/**
 * Graduation preserves behaviour (#1992, #2022, #2040, and the class they are instances of).
 *
 * A converted file (`fromTS`) carries a `tjs <- …` annotation and runs with JavaScript
 * semantics; `graduate()` removes it and every native-TJS rule switches on. Each row converts a
 * TypeScript function, runs it BEFORE and AFTER graduation on the same inputs, and requires the
 * same answers. Before `from-ts-faithful.ts`, nine of these rows failed: three graduated files
 * did not compile (`var`, `new Date`) and six changed meaning silently (`'5' == 5`,
 * `typeof null`, `f(2.5)` with `n = 5`, object defaults merging, the `typeof === 'object'`
 * branch skipping null, the closure over a `var` loop variable).
 */
import { describe, it, expect } from 'bun:test'
import { fromTS } from './emitters/from-ts'
import { tjs } from './index'
import { graduate } from './graduate'

function load(code: string, name = 'f') {
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return new Function(
      `${tjs(code, { runTests: false }).code.replace(
        /^export /gm,
        ''
      )}\nreturn ${name}`
    )()
  } finally {
    g.__tjs = prev
  }
}

const view = (v: unknown): string => {
  if (v instanceof Error) return `Error(${v.message})`
  return JSON.stringify(v)
}

function beforeAndAfter(ts: string) {
  const converted = fromTS(ts, { emitTJS: true }).code
  const graduated = graduate(converted)
  return { converted, graduated }
}

/** [what, TypeScript source exporting f, argument lists] */
const ROWS: [string, string, unknown[][]][] = [
  [
    '== coerces',
    `export function f(a: any, b: any): boolean { return a == b }`,
    [
      ['5', 5],
      ['', false],
      [0, null],
    ],
  ],
  [
    '!= coerces',
    `export function f(a: any, b: any): boolean { return a != b }`,
    [
      ['5', 5],
      [1, 2],
    ],
  ],
  [
    '== null means null or undefined (kept as ==)',
    `export function f(a: any): boolean { return a == null }`,
    [[null], [undefined], [0]],
  ],
  [
    'typeof null is object',
    `export function f(x: any): string { return typeof x }`,
    [[null], [1], [{}]],
  ],
  [
    'typeof === object branch takes null',
    `export function f(v: any): string { if (typeof v === 'object') { return v === null ? 'null' : 'obj' } return 'other' }`,
    [[null], [{}], [1]],
  ],
  [
    'var in a loop',
    `export function f(n: number): number { var t = 0; for (var i = 0; i < n; i++) { t += i } return t }`,
    [[4], [0]],
  ],
  [
    'closures share one var binding',
    `export function f(): number[] { var fs: (() => number)[] = []; for (var i = 0; i < 3; i++) fs.push(() => i); return fs.map(g => g()) }`,
    [[]],
  ],
  [
    'var read before its declaration',
    `export function f(c: boolean): any { if (c) { return x } var x = 1; return x }`,
    [[true], [false]],
  ],
  [
    'var redeclared, and for-in',
    `export function f(o: any): string { var s = ''; for (var k in o) { var s = s + k } return s }`,
    [[{ a: 1, b: 2 }]],
  ],
  [
    'an untyped integer default is a number',
    `export function f(n = 5) { return n * 2 }`,
    [[2.5], []],
  ],
  [
    'an object default is atomic',
    `export function f(o = { x: 0, y: 0 }) { return JSON.stringify(o) }`,
    [[{ x: 5 }], [{ x: 1, z: 9 }], []],
  ],
  [
    'new Date',
    `export function f(): number { return new Date(0).getTime() }`,
    [[]],
  ],
  [
    'a static self-instance (#3841)',
    `export class Money { static zero = new Money(0); constructor(public v: number) {} }
export function f(): number { return Money.zero.v }`,
    [[]],
  ],
  [
    'nested ==',
    `export function f(a: any, b: any, c: any): boolean { return (a == b) == c }`,
    [
      [1, '1', true],
      [1, 2, false],
    ],
  ],
]

describe('graduation preserves behaviour', () => {
  for (const [what, ts, inputs] of ROWS)
    it(what, () => {
      const { converted, graduated } = beforeAndAfter(ts)
      expect(graduated.refused).toBeUndefined()
      const before = load(converted)
      const after = load(graduated.code)
      for (const args of inputs)
        expect([args, view(after(...args))]).toEqual([
          args,
          view(before(...args)),
        ])
    })
})

describe('what graduation does not preserve, said out loud', () => {
  it('eval: refused, naming it, and the input comes back unchanged', () => {
    const { converted, graduated } = beforeAndAfter(
      `export function f(): number { return eval('1 + 1') }`
    )
    expect(graduated.refused).toMatch(/eval/)
    expect(graduated.code).toBe(converted)
  })

  it('boxed-primitive truthiness is the one ACCEPTED change (a boxed false is false)', () => {
    const { converted, graduated } = beforeAndAfter(
      `export function f(b: any): number { return b ? 1 : 0 }`
    )
    const box = new Boolean(false)
    expect(load(converted)(box)).toBe(1) // JavaScript: an object is truthy
    expect(load(graduated.code)(box)).toBe(0) // TJS: its value is false
  })
})

describe('the rewrites read as intended at the site', () => {
  it('each JavaScript reliance is spelled out, and only those', () => {
    const { converted } =
      beforeAndAfter(`export function f(a: any, n = 5, o = { x: 0 }): any {
  var r = typeof a === 'string' ? a : typeof a
  if (a == 1 || a == null) r = new Date(0)
  return [r, n, o]
}`)
    expect(converted).toContain('DangerousLegacyEquals(a, 1)')
    expect(converted).toContain('a == null') // same meaning in TJS: left alone
    expect(converted).toContain("typeof a === 'string'") // cannot be 'object': left alone
    expect(converted).toContain('LegacyTypeOf(a)')
    expect(converted).toContain('LegacyDate(0)')
    expect(converted).toContain('5.0')
    expect(converted).toContain('LegacyDefault(')
    expect(converted).not.toMatch(/\bvar\b/)
  })

  it('TjsStrict files are not rewritten: their author asked for TJS semantics', () => {
    const out = fromTS(
      `/* @tjs TjsStrict */\nexport function f(a: any, b: any): boolean { return a == b }`,
      { emitTJS: true }
    ).code
    expect(out).not.toContain('DangerousLegacyEquals')
  })
})
