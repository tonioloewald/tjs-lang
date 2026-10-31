/**
 * `name: Type = default` (#3596, from tosijs-native): checked against Type, optional,
 * defaulting to `default`, TypeScript's spelling. It was a bare "Unexpected token", and a
 * literal union could not have a default at all. And a bare `doc = null` means "any value,
 * defaulting to null" (#3609), as a null dictionary member does.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { generateDTS } from './emitters/dts'

const load = (src: string, names: string[]) => {
  const g = globalThis as any
  const prev = g.__tjs
  g.__tjs = undefined
  try {
    return new Function(
      `${tjs(src, { runTests: false }).code.replace(
        /^export /gm,
        ''
      )}\nreturn [${names}]`
    )()
  } finally {
    g.__tjs = prev
  }
}
const isError = (v: any) => v instanceof Error

const SRC = `Type Point { example: { x: 0, y: 0 } }
export function grant(mode: 'grant' | 'deny' = 'grant'):! '' { return mode }
export function count(n: 0 = 5):! 0 { return n }
export function at(p: Point = { x: 1, y: 2 }):! 0 { return p.x }
export const pick = (opts: { n: 0, m: 0 } = { n: 1, m: 2 }) => [opts.n, opts.m]`

describe('name: Type = default', () => {
  const [grant, count, at, pick] = load(SRC, ['grant', 'count', 'at', 'pick'])

  it('a literal union with a default', () => {
    expect(grant()).toBe('grant')
    expect(grant('deny')).toBe('deny')
    expect(isError(grant('maybe'))).toBe(true)
  })

  it('a number, a named Type and an object, each checked when passed', () => {
    expect(count()).toBe(5)
    expect(isError(count(2.5))).toBe(true)
    expect(at()).toBe(1)
    expect(isError(at({ x: 'a', y: 1 }))).toBe(true)
  })

  it('an object default is NOT merge-on-partial: a passed value must satisfy the type', () => {
    expect(pick()).toEqual([1, 2])
    expect(pick({ n: 5, m: 6 })).toEqual([5, 6])
    expect(isError(pick({}))).toBe(true) // as in TypeScript
  })

  it('the .d.ts declares it optional, with the declared type', () => {
    const dts = generateDTS(tjs(SRC, { runTests: false }), SRC)
    expect(dts).toContain('grant(mode?: "grant" | "deny")')
    expect(dts).toContain('count(n?: number)')
    expect(dts).toContain('at(p?: Point)')
    expect(dts).toContain('pick(opts?: { n: number; m: number })')
  })

  it('the marker never reaches the output', () => {
    expect(tjs(SRC, { runTests: false }).code).not.toContain('__tjs_type')
  })

  it('a literal default that fails its own type is refused at build', () => {
    for (const bad of [
      `function f(n: 0 = 'x') { return n }`,
      `function f(mode: 'a' | 'b' = 'c') { return mode }`,
      `function f(n: 0 = 2.5) { return n }`,
    ])
      expect(() => tjs(bad, { runTests: false })).toThrow(
        /does not satisfy its own type/
      )
    expect(() =>
      tjs(`function f(mode: 'a' | 'b' = 'b', m: 0.0 = -1.5) { return mode }`, {
        runTests: false,
      })
    ).not.toThrow()
  })

  it("dialect 'js' and a default with a ternary are untouched", () => {
    const [k] = load(`function k(x = 1 ? 2 : 3) { return x }`, ['k'])
    expect(k()).toBe(2)
  })
})

describe('a bare null or undefined default means any value (#3609)', () => {
  const [f, u, r] = load(
    `function f(doc = null) { return typeof doc }
function u(x = undefined) { return typeof x }
function r(doc: null) { return doc }`,
    ['f', 'u', 'r']
  )
  it('accepts anything, defaulting as written', () => {
    expect(f()).toBe('null') // TJS's typeof null is 'null'
    expect(f({})).toBe('object')
    expect(f('s')).toBe('string')
    expect(u()).toBe('undefined')
    expect(u(3)).toBe('number')
  })
  it('the colon form still means only null', () => {
    expect(r(null)).toBe(null)
    expect(isError(r({}))).toBe(true)
  })
})
