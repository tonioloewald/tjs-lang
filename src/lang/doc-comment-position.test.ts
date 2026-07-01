import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

/**
 * A doc comment (`/*#` … or JSDoc `/**` …) is only a doc comment when it starts
 * a line — whitespace-only before the `/`. A `/*#` after code on the line, or
 * inside a string literal, is an ordinary block comment and must be ignored (not
 * extracted as documentation). Enforced by a line-start lookbehind on every
 * doc-comment matcher (docs.ts, from-ts, parser, bin/docs.js).
 */
const descOf = (src: string) =>
  tjs(src, { dialect: 'js', runTests: false }).metadata?.greet?.description

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
