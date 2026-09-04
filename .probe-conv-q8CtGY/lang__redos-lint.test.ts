/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  verifyPredicate,
  emitVerifiedPredicate,
} from '/Users/tonioloewald/tjs-lang/src/lang/predicate'

import { preprocess } from '/Users/tonioloewald/tjs-lang/src/lang/parser'

/* line 14 */
function verifyRe(re) {
  return verifyPredicate(`function p(s) { return ${re}.test(s) }`)
}
verifyRe.__tjs = {
  params: {
    re: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:14',
}

describe('ReDoS linting: dangerous patterns are not predicate-safe', () => {
  const dangerous = [
    ['nested +', '/(a+)+$/'],
    ['nested *', '/(a*)*/'],
    ['plus-in-star', '/([a-z]+)*/'],
    ['dot-star star', '/(.*)*/'],
    ['digit nest', '/(\\d+)+/'],
    ['unbounded brace nest', '/(a{2,})+/'],
    ['doubly nested group', '/((a+))+/'],
  ]
  for (const [label, re] of dangerous) {
    it(`flags ${label}: ${re}`, () => {
      const r = verifyRe(re)
      expect(r.safe).toBe(false)
      expect(
        r.diagnostics.some((d) => /redos|backtrack/i.test(d.message))
      ).toBe(true)
    })
  }
})

describe('ReDoS linting: safe patterns still verify', () => {
  const safe = [
    ['char class +', '/[a-z]+/'],
    ['bounded braces', '/\\d{3}-\\d{4}/'],
    ['group repeated, no inner quantifier', '/(abc)+/'],
    ['alternation repeated', '/(foo|bar)+/'],
    ['anchored hex', '/^#[0-9a-f]{6}$/'],
    ['single star', '/foo.*bar/'],
    ['optional group', '/(ab)?c+/'],
  ]
  for (const [label, re] of safe) {
    it(`accepts ${label}: ${re}`, () => {
      const r = verifyRe(re)
      expect(r.safe).toBe(true)
      expect(r.diagnostics).toEqual([])
    })
  }
})

describe('ReDoS linting: end-to-end', () => {
  it('emitVerifiedPredicate refuses a ReDoS regex (no code)', () => {
    const r = emitVerifiedPredicate(
      'function p(s) { return /(a+)+$/.test(s) }',
      'p'
    )
    expect(r.safe).toBe(false)
    expect(r.code).toBeUndefined()
  })
  it('a Type predicate with a ReDoS regex falls back (no verified guard)', () => {
    const out = preprocess(
      `Type Bad 'bad' { predicate(s) { return /(a+)+$/.test(s) } }`
    ).source
    expect(out).not.toContain('__fuel')
    expect(out).toContain('(a+)+')
  })
  it('a Type predicate with a safe regex compiles to a verified guard', () => {
    const out = preprocess(
      `Type Hex 'hex' { predicate(s) { return /^#[0-9a-f]{6}$/.test(s) } }`
    ).source
    expect(out).toContain('__fuel')
  })
})
