/**
 * `extend` methods work on any receiver of the extended type (#3823).
 *
 * The call rewrite matched only LITERAL receivers in the text, so `const xs = [1, 2];
 * xs.last()` threw "not a function", chained calls broke after the first, `rows[1].last()` and
 * `v2.clamp()` were rewritten into undefined names, and `Map`/`Date`/class extensions compiled
 * but never ran. An arrow-function member (`first: () => 1`) compiled to nothing, silently. Now a
 * call goes through a per-file dispatcher that checks the receiver's type, and a non-method
 * member is refused.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const SRC = `
extend String { shout() { return this.toUpperCase() + '!' } }
extend Array { last() { return this[this.length - 1] } }
extend Number { clamp(min: 0.0, max: 1.0) { return Math.min(Math.max(this, min), max) } }
extend Map { size2() { return this.size * 2 } }
class Box { constructor(v) { this.v = v } }
extend Box { twice() { return this.v * 2 } }
const rows = [[1, 2], [3, 4]]
const v2 = 7.5
const xs = [3, 1, 4]
function lastOf(a) { return a.last() }
const playlist = { last() { return 'own' } }
const s = "xs.last()"
function probe() {
  return {
    variable: xs.last(),
    parameter: lastOf([5, 9]),
    chain: 'a'.shout().shout(),
    indexed: rows[1].last(),
    digitName: v2.clamp(0, 5),
    paren: (7).clamp(0, 5),
    negParen: (-7.5).clamp(0, 5),
    map: new Map([[1, 1]]).size2(),
    cls: Box(4).twice(),
    own: playlist.last(),
    nullish: null?.last(),
    optional: xs?.last(),
    string: s,
    defaulted: 7.5.clamp(),
    checked: isMonadicError(7.5.clamp('a', 5)),
  }
}`

describe('extend receivers (#3823)', () => {
  const r = tjs(SRC, { runTests: false })
  const probe = new Function(r.code + '\nreturn probe')()
  it('every receiver of the extended type runs the extension', () => {
    expect(probe()).toEqual({
      variable: 4,
      parameter: 9,
      chain: 'A!!',
      indexed: 4,
      digitName: 5,
      paren: 5,
      negParen: 0,
      map: 2,
      cls: 8,
      own: 'own', // not an array: called as written
      nullish: undefined,
      optional: 4,
      string: 'xs.last()', // text in a string is never rewritten
      defaulted: 1,
      checked: true,
    })
  })
  it('the dispatchers are not taken for the author’s functions', () => {
    expect(
      Object.keys(r.types).filter((k) => k.startsWith('__tjs_ext'))
    ).toEqual([])
  })
  it('nothing is patched', () => {
    expect(typeof (Array.prototype as any).last).toBe('undefined')
  })
})

describe('an extend block holds only methods', () => {
  for (const member of [
    'first: () => 1,',
    'last = () => 1',
    'get size() { return 1 }',
  ])
    it(`refuses ${member}`, () => {
      expect(() =>
        tjs(`extend Array {\n  ${member}\n}`, { runTests: false })
      ).toThrow(/is not a method, and an extend block holds only methods/)
    })
  it('accepts methods with comments and separators (the other direction)', () => {
    expect(() =>
      tjs(
        'extend Array {\n  /* c */ last() { return 1 }, // t\n  first() { return 0 };\n}',
        { runTests: false }
      )
    ).not.toThrow()
  })
})
