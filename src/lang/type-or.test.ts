/**
 * `||` in a type position is a compile error naming `|` (#3148). Both directions: every type
 * position refuses it, and every VALUE position keeps JavaScript's `||`.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const compile =
  (src: string, opts: any = {}) =>
  () =>
    tjs(src, { runTests: false, ...opts })

describe('`||` in a type is refused, naming `|`', () => {
  const REFUSED: Array<[string, string, string]> = [
    [
      'a parameter annotation',
      `function f(code: '' || null) { return code }`,
      `'' | null`,
    ],
    [
      'a return annotation',
      `function f(): { a: 0 } || null { return null }`,
      `{ a: 0 } | null`,
    ],
    [
      'an object member',
      `function f(x: { a: '' || null }) { return x }`,
      `'' | null`,
    ],
    [
      'an array element',
      `function f(x: ['' || null]) { return x }`,
      `'' | null`,
    ],
    [
      'inside a union',
      `function f(x: 0 | ('' || null)) { return x }`,
      `'' | null`,
    ],
    ['a nested arrow', `const g = [(x: 0 || null) => x][0]`, `0 | null`],
    ['a method', `class C { m(x: '' || null) { return x } }`, `'' | null`],
  ]
  for (const [where, src, fix] of REFUSED)
    it(where, () => {
      expect(compile(src)).toThrow(/`\|\|` is not a union in a type/)
      expect(compile(src)).toThrow(fix)
    })
})

describe('`||` as a value still compiles', () => {
  const ALLOWED: Array<[string, string, any]> = [
    ['a real default', `function f(x = '' || 'y') { return x }`, {}],
    ['a union with one bar', `function f(code: '' | null) { return code }`, {}],
    ['a body', `function f(a: 0, b: 0) { return a || b }`, {}],
    ['an object default', `function f(o = { a: 1 || 2 }) { return o }`, {}],
    [
      'plain JavaScript',
      `function f(x = a || b) { return x }`,
      { dialect: 'js' },
    ],
  ]
  for (const [where, src, opts] of ALLOWED)
    it(where, () => {
      expect(compile(src, opts)).not.toThrow()
    })
})
