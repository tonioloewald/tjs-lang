/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { isTernaryColon } from '/Users/tonioloewald/tjs-lang/src/lang/expression-context'

/* line 17 */
function at(src, marker) {
  return src.indexOf(marker) + marker.indexOf(':')
}
at.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    marker: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:17',
}

describe('isTernaryColon', () => {
  const ternaries = [
    [
      'parenthesized consequent — the shape that broke RpcServer.ts',
      'const o = { write: flag ? ((r) => f(r)) : (r) => g(r) }',
      ') : (',
    ],
    ['plain ternary', 'const x = a ? b : c', ' : '],
    ['arrow consequent', 'const x = a ? (r) => 1 : (r) => 2', ' : ('],
    ['inside a call argument', 'f(a ? b : c)', ' : '],
    ['after a property colon', 'const o = { k: a ? b : c }', ' : c'],
  ]
  for (const [label, src, marker] of ternaries) {
    it(`says YES: ${label}`, () => {
      expect(isTernaryColon(src, at(src, marker))).toBe(true)
    })
  }
  const notTernaries = [
    ['an arrow return type', 'const f = (a) : 0 => a', ') : 0'],
    ['an object property', 'const o = { a: 1 }', 'a: 1'],
    ['a property before a ternary', 'const o = { k: a ? b : c }', 'k: a'],
    [
      'a return type after optional chaining',
      'const f = (a) : 0 => a?.b',
      ') : 0',
    ],
    ['a return type after nullish', 'const f = (a) : 0 => a ?? 1', ') : 0'],
  ]
  for (const [label, src, marker] of notTernaries) {
    it(`says NO: ${label}`, () => {
      expect(isTernaryColon(src, at(src, marker))).toBe(false)
    })
  }
  it('matches inner ternaries rather than counting totals', () => {
    const src = 'const x = a ? b : c ? d : e'

    expect(isTernaryColon(src, src.indexOf(' : c') + 1)).toBe(true)
    expect(isTernaryColon(src, src.lastIndexOf(' : ') + 1)).toBe(true)
  })
  it('a colon inside a literal is not a colon', () => {
    const src = "const f = (a) => 'x ? y : z'"
    expect(isTernaryColon(src, src.indexOf(' : z'))).toBe(false)
  })
  it('is not confused by a safety marker', () => {
    const src = 'function f(? a: 0) { return a }'
    expect(isTernaryColon(src, src.indexOf('a: 0') + 1)).toBe(false)
  })
})
