/**
 * A mixed literal union means the same in any order (#4112).
 *
 * In a parameter it was folded pair by pair from the left, so `'S' | 'M' | 0` refused `'X'` while
 * `0 | 'S' | 'M'` accepted it. A union is a closed set only when it is ALL literals of one kind
 * (reading it as types would say nothing); a mixed union is a union of its members' types, in any
 * order, as a Type example already read it (example-kinds-oracle.test.ts defines that).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { isMonadicError } from './runtime'

const param = (example: string) =>
  new Function(
    tjs(`function f(x: ${example}) { return x }`).code + '\nreturn f'
  )()
const type = (example: string) =>
  new Function(tjs(`Type T = ${example}`).code + '\nreturn T')()

const ORDERS = ["'S' | 'M' | 0", "0 | 'S' | 'M'", "'S' | 0 | 'M'"]

describe('a mixed literal union, in every order', () => {
  for (const ex of ORDERS) {
    it(`parameter ${ex}`, () => {
      const f = param(ex)
      expect(f('S')).toBe('S')
      expect(f(5)).toBe(5)
      expect(f('X')).toBe('X') // a string or an integer
      expect(isMonadicError(f(true))).toBe(true)
    })
    it(`Type ${ex}`, () => {
      const T = type(ex)
      // a string or an integer, in every order
      expect([T.check('S'), T.check(5), T.check('X'), T.check(true)]).toEqual([
        true,
        true,
        true,
        false,
      ])
    })
  }
})

describe('what stays a closed set, and other unions (the other direction)', () => {
  it("'S' | 'M' alone is a closed set", () => {
    const f = param("'S' | 'M'")
    expect(f('S')).toBe('S')
    expect(isMonadicError(f('X'))).toBe(true)
  })
  it("0 | '' is an integer or a string", () => {
    const T = type("0 | ''")
    expect([T.check(5), T.check('anything'), T.check(true)]).toEqual([
      true,
      true,
      false,
    ])
  })
  it("'' | null is a nullable string", () => {
    const f = param("'' | null")
    expect(f(null)).toBe(null)
    expect(f('x')).toBe('x')
  })
})
