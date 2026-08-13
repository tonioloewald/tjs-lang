/**
 * ASI protection must not reach inside a template literal.
 *
 * TJS inserts a defensive `;` when a line starts with `(`, `[` or `` ` `` and the previous
 * line did not obviously expect a continuation — the one place TJS and JavaScript disagree
 * about statement boundaries, done deliberately and with a warning.
 *
 * A template literal spans lines, and its interior is DATA. `c64bcd3` fixed the half of
 * this that reads the PREVIOUS line (a `//` inside a template was being read as a comment)
 * and left the current line raw, so:
 *
 *     const s = `line one
 *     (two) three`
 *
 * became `` `line one\n;(two) three` ``. The string's VALUE changed — silently, at
 * transpile time, with a warning telling the author the opposite of what happened ("TJS
 * treats them as separate statements"; it did not, it edited their data). The two-line
 * closing-backtick shape is even more ordinary:
 *
 *     const b = `a
 *     `                       // evaluates to "a\n;"
 *
 * Any prose or markdown held in a template is a candidate, which is most of the templates
 * a documentation-heavy project writes.
 *
 * The control cases matter as much: this transform exists for a reason, and a fix that
 * disabled it would trade a data-corruption bug for a parse bug.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const evaluate = (src: string, name: string) =>
  new Function(
    `${tjs(src, { filename: 'asi.tjs', runTests: false }).code}\nreturn ${name}`
  )()

describe('a template literal is data, not code', () => {
  it('does not insert a semicolon before a parenthesised continuation line', () => {
    const s = evaluate('const s = `line one\n(two) three`\n', 's')
    expect(s).toBe('line one\n(two) three')
  })

  it('does not corrupt the two-line closing-backtick shape', () => {
    // `const b = \`a\n\`` — the closing line starts with a backtick, so the raw-line test
    // matched and produced "a\n;".
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
    // The transform's own purpose, in the presence of templates: a line that genuinely
    // starts a new statement with a backtick must still be separated.
    const src = 'const a = 1\nconst t = `x`\n'
    expect(evaluate(src, 't')).toBe('x')
  })
})

describe('the ASI protection itself still works', () => {
  it('separates a parenthesised line that follows a complete statement', () => {
    // Without the inserted `;`, JavaScript reads `const x = g\n(1)` as `g(1)`. TJS makes
    // them two statements. Disabling the transform to fix the template bug would bring
    // that trap back.
    const src =
      'function g(n: 0) { return n }\nconst x = g\n(1)\nconst y = typeof x\n'
    expect(evaluate(src, 'y')).toBe('function')
  })

  it('does not separate a genuine continuation', () => {
    const src = 'const n =\n  (1 + 2)\n'
    expect(evaluate(src, 'n')).toBe(3)
  })
})
