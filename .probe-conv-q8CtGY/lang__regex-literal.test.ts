/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { stripLineComments } from '/Users/tonioloewald/tjs-lang/src/lang/parser'

/* line 17 */
function compiles(src) {
  tjs(src, { runTests: false })
  return true
}
compiles.__tjs = {
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
  source: 'input.ts:17',
}

describe('regex literals are not mistaken for comments', () => {
  it('a regex containing an escaped `*/` survives', () => {
    expect(
      compiles(
        `function f(s: '') {\n  const re = /\\*\\//\n  return re.test(s)\n}`
      )
    ).toBe(true)
  })
  it('a regex containing an escaped `//` survives', () => {
    expect(
      compiles(
        `function f(s: '') {\n  const re = /\\/\\//\n  return re.test(s)\n}`
      )
    ).toBe(true)
  })
  it('the real-world shape that broke: a comment-matching regex', () => {
    const src = `function f(s: '') {\n  const isFromTS = /\\/\\*\\s*tjs\\s*<-\\s*\\S+\\s*\\*\\//.test(s)\n  return isFromTS\n}`
    expect(compiles(src)).toBe(true)
  })
  it('a regex character class containing / is not a terminator', () => {
    expect(
      compiles(
        `function f(s: '') {\n  const re = /[/*]+/\n  return re.test(s)\n}`
      )
    ).toBe(true)
  })
  it('stripLineComments leaves regex bodies intact', () => {
    const src = `const re = /\\*\\//\nconst x = 1 // gone\n`
    const out = stripLineComments(src)
    expect(out, 'the regex body must survive verbatim').toContain('/\\*\\//')
    expect(out, 'a real line comment must still be stripped').not.toContain(
      'gone'
    )
  })
  it('still strips ordinary line comments, and division is not a regex', () => {
    const out = stripLineComments(`const a = b / c // note\nconst d = 2\n`)
    expect(out).not.toContain('note')
    expect(out).toContain('b / c')
    expect(out).toContain('const d = 2')
  })
  it('does not treat // inside a string as a comment (existing behavior)', () => {
    const out = stripLineComments(`const u = 'http://x' // gone\n`)
    expect(out).toContain('http://x')
    expect(out).not.toContain('gone')
  })
})
