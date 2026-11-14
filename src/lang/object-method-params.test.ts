/**
 * Object-literal methods get the parameter preamble class methods get (Tonio, 2026-11-14):
 * dictionary defaults merge, and parameter examples are checked. Before, `{ m(o = { a: 1, b: 2 }) }`
 * received `{ a: 5 }` unmerged while a declaration or class method returned `{ a: 5, b: 2 }`,
 * and an object method's parameters were not checked at all ("no validation yet").
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { createRuntime, isMonadicError } from './runtime'

const load = (src: string) => {
  const saved = (globalThis as any).__tjs
  ;(globalThis as any).__tjs = createRuntime()
  try {
    return new Function(tjs(src).code + '\nreturn o')()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

const o = load(`const o = {
  m(opts = { a: 1, b: 2 }) { return opts },
  n: function (x: 0) { return x },
  k: (y: '') => { return y },
  e: (z: '') => z,
  get g() { return 1 },
}`)

describe('object-literal methods', () => {
  it('merge a dictionary default, as a class method does', () => {
    expect(o.m({ a: 5 })).toEqual({ a: 5, b: 2 })
  })
  it('check their parameter examples', () => {
    expect(isMonadicError(o.n('x'))).toBe(true)
    expect(isMonadicError(o.k(3))).toBe(true)
    expect(o.n(4)).toBe(4)
  })
  it('an expression-bodied arrow and a getter are left as they were', () => {
    expect(o.e(3)).toBe(3) // no body to hold a preamble
    expect(o.g).toBe(1)
  })
})
