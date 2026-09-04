/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 32 */
function evaluate(src, name) {
  return new Function(
    `${tjs(src, { filename: 'asi.tjs', runTests: false }).code}\nreturn ${name}`
  )()
}
evaluate.__tjs = {
  params: {
    src: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    name: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:32',
}

describe('a template literal is data, not code', () => {
  it('does not insert a semicolon before a parenthesised continuation line', () => {
    const s = evaluate('const s = `line one\n(two) three`\n', 's')
    expect(s).toBe('line one\n(two) three')
  })
  it('does not corrupt the two-line closing-backtick shape', () => {
    const b = evaluate('const b = `a\n`\n', 'b')
    expect(b).toBe('a\n')
  })
  it('leaves a bracketed line inside a template alone', () => {
    const s = evaluate('const s = `head\n[one, two]\ntail`\n', 's')
    expect(s).toBe('head\n[one, two]\ntail')
  })
  it('handles a markdown-ish template, the realistic case', () => {
    const src = 'const doc = `# Title\n(see below)\n\n- item\n`\n'
    expect(evaluate(src, 'doc')).toBe('# Title\n(see below)\n\n- item\n')
  })
  it('still protects a template that follows a complete statement', () => {
    const src = 'const a = 1\nconst t = `x`\n'
    expect(evaluate(src, 't')).toBe('x')
  })
})

describe('the ASI protection itself still works', () => {
  it('separates a parenthesised line that follows a complete statement', () => {
    const src =
      'function g(n: 0) { return n }\nconst x = g\n(1)\nconst y = typeof x\n'
    expect(evaluate(src, 'y')).toBe('function')
  })
  it('does not separate a genuine continuation', () => {
    const src = 'const n =\n  (1 + 2)\n'
    expect(evaluate(src, 'n')).toBe(3)
  })
})
