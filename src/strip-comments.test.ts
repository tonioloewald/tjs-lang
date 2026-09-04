import { describe, it, expect } from 'bun:test'
import {
  scanLiterals,
  clearLiteralCache,
  maskLiterals,
  maskLiteralsKeepComments,
  clearMaskCache,
  stripComments,
  type LiteralRegion,
  stripLineComments,
  matchingBrace,
} from './strip-comments'

/**
 * The scanner is memoized, and the memo must be invisible.
 *
 * Consolidating fifteen hand-rolled literal scanners onto one function was the right
 * correctness call, and nothing memoized it: one transpile called it 175 times over ~35
 * distinct strings — 91% redundant, 17% of total transpile time. Callers legitimately ask
 * repeatedly, because each transform masks the source it was handed.
 *
 * A memo on a pure function has no staleness surface, so the risks are the other two:
 * returning a WRONG answer for a different string, and handing every caller the same array
 * so one of them can corrupt it for the rest. Both are asserted here.
 */
describe('the literal scanner memo', () => {
  it('gives the same answer computed twice', () => {
    const src = "const a = 'x' // c\nconst r = /[}]/\n"
    const first = scanLiterals(src)
    clearLiteralCache()
    const fresh = scanLiterals(src)
    expect(JSON.stringify(fresh)).toBe(JSON.stringify(first))
  })

  it('does not confuse two different strings', () => {
    // The failure a naive cache key would produce.
    const a = scanLiterals("const s = 'one'")
    const b = scanLiterals('const s = `two`')
    expect(a[0].kind).toBe('string')
    expect(b[0].kind).toBe('template')
  })

  it('survives more distinct inputs than it can hold', () => {
    // Eviction must lose memory, never correctness.
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
    // Two exported wrappers hand this array straight to callers. A caller that sorted or
    // spliced it would corrupt the answer for everyone afterwards, with no symptom at the
    // mutation site.
    const regions = scanLiterals("const s = 'x'")
    expect(Object.isFrozen(regions)).toBe(true)
    expect(() =>
      (regions as LiteralRegion[]).push({} as LiteralRegion)
    ).toThrow()
  })
})

/**
 * The mask memo is invisible too.
 *
 * Memoizing `scanLiterals` removed the re-SCANNING but every caller still paid the
 * split -> blank -> join, which is the larger half on a big file. Measured: 200 masks of
 * the same 13KB source cost 21ms with the scan already cached, and a real transpile of
 * `src/rbac/rules.tjs` went 15.81ms -> 13.22ms once the mask itself was memoized.
 *
 * Strings are immutable, so unlike the region arrays there is nothing to freeze. The risks
 * are the other two: a wrong answer for a different input, and the two FLAVOURS
 * (`maskLiterals` erases comments, `maskLiteralsKeepComments` preserves them) colliding
 * with each other — they take the same key and must not share a cache.
 */
describe('the mask memo', () => {
  const SRC = "const a = 'x' // note\nconst r = /[}]/\n"

  it('gives the same answer computed twice', () => {
    const first = maskLiterals(SRC)
    clearMaskCache()
    clearLiteralCache()
    expect(maskLiterals(SRC)).toBe(first)
  })

  it('does not confuse the two flavours for one source', () => {
    // Same key, different answer — a single shared cache would return whichever ran first.
    const erased = maskLiterals(SRC)
    const kept = maskLiteralsKeepComments(SRC)
    expect(erased).not.toBe(kept)
    expect(kept).toContain('// note')
    expect(erased).not.toContain('note')
    // And again, from the cache.
    expect(maskLiterals(SRC)).toBe(erased)
    expect(maskLiteralsKeepComments(SRC)).toBe(kept)
  })

  it('preserves offsets, cached or not', () => {
    // The property every caller depends on: a masked index maps straight back.
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

/**
 * `stripComments` — comments GONE, literal contents INTACT.
 *
 * The third view, and the one that was missing. `maskLiterals` blanks literals and
 * comments; `maskLiteralsKeepComments` blanks literals and keeps comments. A caller that
 * wants comments removed while the strings survive had neither — so it hand-rolled the job
 * with two raw regexes and carried a comment admitting the result was wrong for a `//`
 * inside a template literal.
 *
 * That same hand-rolled shape, in the module-directive detectors, cost 90 seconds of a
 * 116-second transpile. A regex cannot decide whether `//` opens a comment: it depends on
 * not being inside a string, template or regex, which is precisely the state the scanner
 * already tracks.
 */
describe('stripComments keeps literals and drops comments', () => {
  it('removes line and block comments', () => {
    expect(stripComments('const x = 1 // note')).toBe('const x = 1 ')
    expect(stripComments('/* hi */const y = 2')).toBe('const y = 2')
  })

  it('does NOT treat a `//` inside a template as a comment', () => {
    // The exact case the hand-rolled version truncated.
    const src = 'const t = `a // not a comment`'
    expect(stripComments(src)).toBe(src)
  })

  it('does not touch a `//` inside a string or a regex', () => {
    expect(stripComments("const s = 'http://x'")).toBe("const s = 'http://x'")
    expect(stripComments('const r = /[/]/')).toBe('const r = /[/]/')
  })

  it('preserves line numbers across a multi-line block comment', () => {
    // Downstream matches report line numbers, so a block comment has to leave its
    // newlines behind even though its text goes.
    const src = 'a\n/* one\n   two */\nb'
    expect(stripComments(src).split('\n').length).toBe(src.split('\n').length)
  })

  it('keeps string CONTENT, which is why maskLiterals could not be used here', () => {
    // The inline-test harness matches `expect(...)` outside comments, and the strings are
    // the test descriptions — masking them erases what is being extracted.
    const src = "test 'a description' { expect(1).toBe(1) } // trailing"
    const out = stripComments(src)
    expect(out).toContain("'a description'")
    expect(out).not.toContain('trailing')
  })

  it('returns the input unchanged when there are no comments', () => {
    const src = "const a = 1\nconst b = 'x'\n"
    expect(stripComments(src)).toBe(src)
  })
})

/**
 * `stripLineComments` is LENGTH-PRESERVING, and that is the part worth pinning.
 *
 * `preprocess` runs it early and then works in OFFSETS — doc-comment adjacency, brace
 * matching, marker positions — so blanking to spaces rather than deleting is a contract,
 * not an implementation detail. A rewrite that deleted instead looked correct in isolation
 * and made a doc block stop attaching to the function below it, two hundred lines away.
 *
 * Nothing asserted the length, which is why that got as far as it did.
 */
describe('stripLineComments preserves offsets', () => {
  const CASES: Array<[string, string]> = [
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
      // Line structure must survive too — offsets are per-line as often as absolute.
      expect(out.split('\n').length).toBe(src.split('\n').length)
    })
  }

  it('actually removes the comment text (not vacuous)', () => {
    // Returning the input unchanged would satisfy every length assertion above.
    expect(stripLineComments('const a = 1 // secret')).not.toContain('secret')
  })

  it('leaves a `//` inside a literal alone', () => {
    // The hand-rolled version this replaced had no regex branch.
    expect(stripLineComments('const r = /[/]/ // gone')).toContain('/[/]/')
    expect(stripLineComments("const s = 'http://x' // gone")).toContain(
      'http://x'
    )
  })
})

/**
 * `matchingBrace` takes its closer from the opener.
 *
 * It was `{`-only, which is how a FOURTH private bracket scanner ended up in
 * `emitters/js-tests.ts` — in the same window that hoisted `splitTopLevelTrimmed`
 * specifically to stop that from happening, and beside the one both CLAUDE.md and llms.txt
 * call "the one balanced-brace matcher". The untested copy was the one the headline
 * nested-literal-unions feature ran on.
 */
describe('matchingBrace handles every bracket kind', () => {
  const at = (src: string, open = 0) => matchingBrace(maskLiterals(src), open)

  it('braces, brackets and parens', () => {
    expect(at('{a}')).toBe(2)
    expect(at('[a]')).toBe(2)
    expect(at('(a)')).toBe(2)
  })

  it('counts nesting across KINDS, so a stray closer cannot close an outer opener', () => {
    // `}` inside `[...]` must not close the `{`.
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
    // The whole reason this takes a MASKED view.
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

  const cases: Array<[string, string]> = [
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
      // The trailing string is masked (so it is still data) and its delimiters survive
      // (so the mask preserved offsets rather than eating the line).
      expect(masked.endsWith('const t = "     "')).toBe(true)
      // And the code between them was NOT swallowed.
      expect(masked).toContain('const t = ')
    })
  }

  it('an unterminated template still terminates the scan', () => {
    // No closing backtick at all: the region must run to end-of-source, not loop.
    const masked = maskLiterals('const s = `a${ x }b')
    expect(masked.startsWith('const s = `')).toBe(true)
    expect(masked).not.toContain('x')
  })

  it('the substitution interior is still masked (unchanged contract)', () => {
    // This fix moved where a template ENDS. It deliberately did not make `${ … }` visible
    // to consumers — that would be a much larger behaviour change.
    expect(maskLiterals('const s = `a${ ident }b`')).not.toContain('ident')
  })
})
