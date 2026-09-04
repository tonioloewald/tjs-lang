/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  scanLiterals,
  clearLiteralCache,
  maskLiterals,
  maskLiteralsKeepComments,
  clearMaskCache,
  stripComments,
  stripLineComments,
  matchingBrace,
} from '/Users/tonioloewald/tjs-lang/src/strip-comments'

describe('the literal scanner memo', () => {
  it('gives the same answer computed twice', () => {
    const src = "const a = 'x' // c\nconst r = /[}]/\n"
    const first = scanLiterals(src)
    clearLiteralCache()
    const fresh = scanLiterals(src)
    expect(JSON.stringify(fresh)).toBe(JSON.stringify(first))
  })
  it('does not confuse two different strings', () => {
    const a = scanLiterals("const s = 'one'")
    const b = scanLiterals('const s = `two`')
    expect(a[0].kind).toBe('string')
    expect(b[0].kind).toBe('template')
  })
  it('survives more distinct inputs than it can hold', () => {
    const inputs = Array.from(
      { length: 60 },
      (_, i) => `const v${i} = 'lit${i}'`
    )
    for (const s of inputs) scanLiterals(s)
    for (const s of inputs) {
      const regions = scanLiterals(s)
      expect(regions.length).toBe(1)
      expect(s.slice(regions[0].innerStart, regions[0].innerEnd)).toMatch(
        /^lit\d+$/
      )
    }
  })
  it('returns a FROZEN array, so no caller can poison the cache', () => {
    const regions = scanLiterals("const s = 'x'")
    expect(Object.isFrozen(regions)).toBe(true)
    expect(() => regions.push({})).toThrow()
  })
})

describe('the mask memo', () => {
  const SRC = "const a = 'x' // note\nconst r = /[}]/\n"
  it('gives the same answer computed twice', () => {
    const first = maskLiterals(SRC)
    clearMaskCache()
    clearLiteralCache()
    expect(maskLiterals(SRC)).toBe(first)
  })
  it('does not confuse the two flavours for one source', () => {
    const erased = maskLiterals(SRC)
    const kept = maskLiteralsKeepComments(SRC)
    expect(erased).not.toBe(kept)
    expect(kept).toContain('// note')
    expect(erased).not.toContain('note')

    expect(maskLiterals(SRC)).toBe(erased)
    expect(maskLiteralsKeepComments(SRC)).toBe(kept)
  })
  it('preserves offsets, cached or not', () => {
    clearMaskCache()
    const fresh = maskLiterals(SRC)
    expect(fresh.length).toBe(SRC.length)
    expect(maskLiterals(SRC).length).toBe(SRC.length)
  })
  it('survives more distinct inputs than it can hold', () => {
    const inputs = Array.from(
      { length: 40 },
      (_, i) => `const v${i} = 'lit${i}' // c${i}`
    )
    for (const s of inputs) maskLiterals(s)
    for (const s of inputs) {
      const m = maskLiterals(s)
      expect(m.length).toBe(s.length)
      expect(m).not.toContain(`lit`)
    }
  })
})

describe('stripComments keeps literals and drops comments', () => {
  it('removes line and block comments', () => {
    expect(stripComments('const x = 1 // note')).toBe('const x = 1 ')
    expect(stripComments('/* hi */const y = 2')).toBe('const y = 2')
  })
  it('does NOT treat a `//` inside a template as a comment', () => {
    const src = 'const t = `a // not a comment`'
    expect(stripComments(src)).toBe(src)
  })
  it('does not touch a `//` inside a string or a regex', () => {
    expect(stripComments("const s = 'http://x'")).toBe("const s = 'http://x'")
    expect(stripComments('const r = /[/]/')).toBe('const r = /[/]/')
  })
  it('preserves line numbers across a multi-line block comment', () => {
    const src = 'a\n/* one\n   two */\nb'
    expect(stripComments(src).split('\n').length).toBe(src.split('\n').length)
  })
  it('keeps string CONTENT, which is why maskLiterals could not be used here', () => {
    const src = ' // trailing'
    const out = stripComments(src)
    expect(out).toContain("'a description'")
    expect(out).not.toContain('trailing')
  })
  it('returns the input unchanged when there are no comments', () => {
    const src = "const a = 1\nconst b = 'x'\n"
    expect(stripComments(src)).toBe(src)
  })
})

describe('stripLineComments preserves offsets', () => {
  const CASES = [
    ['plain', 'const a = 1 // gone\nconst b = 2'],
    ['at end of file', 'const a = 1 // gone'],
    ['url in a string', "const s = 'http://x' // gone"],
    ['regex containing a slash', 'const r = /[/]/ // gone'],
    ['block comment containing //', '/* keep // this */ const a = 1 // gone'],
    ['template containing //', 'const t = `a // b` // gone'],
    ['consecutive comments', '// one\n// two\nconst a = 1'],
  ]
  for (const [label, src] of CASES) {
    it(`${label}: same length, newlines intact`, () => {
      const out = stripLineComments(src)
      expect(out.length).toBe(src.length)

      expect(out.split('\n').length).toBe(src.split('\n').length)
    })
  }
  it('actually removes the comment text (not vacuous)', () => {
    expect(stripLineComments('const a = 1 // secret')).not.toContain('secret')
  })
  it('leaves a `//` inside a literal alone', () => {
    expect(stripLineComments('const r = /[/]/ // gone')).toContain('/[/]/')
    expect(stripLineComments("const s = 'http://x' // gone")).toContain(
      'http://x'
    )
  })
})

describe('matchingBrace handles every bracket kind', () => {
  const at = (src, open = 0) => matchingBrace(maskLiterals(src), open)
  it('braces, brackets and parens', () => {
    expect(at('{a}')).toBe(2)
    expect(at('[a]')).toBe(2)
    expect(at('(a)')).toBe(2)
  })
  it('counts nesting across KINDS, so a stray closer cannot close an outer opener', () => {
    expect(at('{ a: [1, 2], b: 3 }')).toBe(18)
    expect(at('[{ a: 1 }, { b: 2 }]')).toBe(19)
  })
  it('a depth-zero closer of the WRONG kind is -1, not a confident wrong answer', () => {
    expect(at('{a)')).toBe(-1)
    expect(at('[a}')).toBe(-1)
  })
  it('unbalanced is -1', () => {
    expect(at('{a')).toBe(-1)
  })
  it('a bracket inside a literal is not structure', () => {
    expect(at(`{ s: '}' }`)).toBe(9)
  })
  it('a non-opener is -1', () => {
    expect(at('abc')).toBe(-1)
  })
})

describe('a template ends past its own substitutions', () => {
  /**
   * The interior of `${ … }` is code, and code can contain backticks. Scanning for the next
   * bare backtick ended the template at the wrong one, and the damage is not local: from
   * there on, code was masked and later literals were exposed as code, so any pass consuming
   * this scanner acted on inverted parity for the rest of the file.
   *
   * The assertion is on the MASK rather than the region list, because that is what the twelve
   * consumers actually read, and because a wrong end shows up there as the tail of the file
   * flipping — visible, where an off-by-one on `end` is not.
   */
  const T = '`'
  const cases = [
    ['a backtick in a double-quoted string', `const s = \`a\${ "${T}" }b\``],
    ['a backtick in a single-quoted string', `const s = \`a\${ '${T}' }b\``],
    ['a backtick in a line comment', `const s = \`a\${ x // ${T}\n }b\``],
    ['a backtick in a block comment', `const s = \`a\${ /* ${T} */ x }b\``],
    ['a nested template', 'const s = `a${ `inner${ y }` }b`'],
    ['a brace inside the substitution', 'const s = `a${ {k:1}.k }b`'],
    ['two substitutions', 'const s = `a${ x }m${ y }b`'],
  ]
  for (const [label, prefix] of cases) {
    it(`${label}: the literal AFTER it is still seen as a literal`, () => {
      const src = `${prefix}\nconst t = "after"`
      const masked = maskLiterals(src)

      expect(masked.endsWith('const t = "     "')).toBe(true)

      expect(masked).toContain('const t = ')
    })
  }
  it('an unterminated template still terminates the scan', () => {
    const masked = maskLiterals('const s = `a${ x }b')
    expect(masked.startsWith('const s = `')).toBe(true)
    expect(masked).not.toContain('x')
  })
  it('the substitution interior is still masked (unchanged contract)', () => {
    expect(maskLiterals('const s = `a${ ident }b`')).not.toContain('ident')
  })
})
