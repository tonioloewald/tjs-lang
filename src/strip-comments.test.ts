import { describe, it, expect } from 'bun:test'
import {
  scanLiterals,
  clearLiteralCache,
  maskLiterals,
  maskLiteralsKeepComments,
  clearMaskCache,
  stripComments,
  type LiteralRegion,
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
