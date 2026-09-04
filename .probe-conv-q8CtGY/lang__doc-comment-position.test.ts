/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 11 */
function descOf(src) {
  return tjs(src, { dialect: 'js', runTests: false }).metadata?.greet
    ?.description
}
descOf.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:11',
}

describe('doc comments must start a line (whitespace-only before the slash)', () => {
  const fn = '\nfunction greet(name) { return name }'
  it('extracts a line-start /*# doc comment', () => {
    expect(descOf('/*#\nMy docs\n*/' + fn)).toContain('My docs')
  })
  it('extracts an indented (own-line) /*# doc comment', () => {
    expect(descOf('  /*#\n  Indented docs\n  */' + fn)).toContain('Indented')
  })
  it('ignores a /*# that follows code on the same line', () => {
    expect(descOf('const x = 1 /*# not a doc */' + fn)).toBeUndefined()
  })
  it('ignores a /*# inside a string literal', () => {
    expect(descOf('const s = "/*# not a doc */"' + fn)).toBeUndefined()
  })
})
