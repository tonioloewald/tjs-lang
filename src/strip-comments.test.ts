import { describe, it, expect } from 'bun:test'
import {
  scanLiterals,
  clearLiteralCache,
  maskLiterals,
  maskLiteralsKeepComments,
  clearMaskCache,
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
