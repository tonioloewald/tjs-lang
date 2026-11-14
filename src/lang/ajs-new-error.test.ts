/**
 * `new Error('x')` in AJS is refused with the remedy, as a statement and as a value (#4105).
 * As a statement it was only warned about ("Expression statement has no effect"), so code that
 * meant to fail ran on; and the remedy offered elsewhere was stale ("return an error object"),
 * from before AJS had `Error('message')`.
 */
import { describe, it, expect } from 'bun:test'
import { transpile } from './core'

describe('new Error in AJS', () => {
  it('is refused as a statement, pointing at Error()', () => {
    expect(() =>
      transpile(`function f({}) { new Error('x')\n return {} }`)
    ).toThrow(/'new' keyword is not supported.*Error\('message'\)/)
  })
  it('is refused as a value too', () => {
    expect(() =>
      transpile(`function f({}) { let e = new Error('x')\n return {} }`)
    ).toThrow(/Error\('message'\)/)
  })
  it('Error() without new still works (the other direction)', () => {
    expect(() =>
      transpile(
        `function f({}) { try { Error('x') } catch (e) { return { e } }\n return {} }`
      )
    ).not.toThrow()
  })
})
