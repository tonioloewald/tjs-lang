import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { dialectForFilename, sourceKindForFilename } from './dialect'

describe('source dialect', () => {
  // A line of vanilla JS whose meaning TJS would otherwise change: structural
  // `==` (→ Eq), honest truthiness (→ toBool), and `typeof` (→ TypeOf).
  const JS = `function f(a, b) { if (a == b) { return typeof a } return null }`

  const isMolested = (code: string) =>
    code.includes('Eq(') || code.includes('toBool') || code.includes('TypeOf')

  describe('dialect option', () => {
    it("dialect: 'js' preserves plain-JS semantics (no rewrites)", () => {
      expect(isMolested(tjs(JS, { dialect: 'js' }).code)).toBe(false)
    })

    it("dialect: 'tjs' applies native footgun-removal modes", () => {
      expect(isMolested(tjs(JS, { dialect: 'tjs' }).code)).toBe(true)
    })

    it('a bare string still defaults to native TJS (backward compatible)', () => {
      expect(isMolested(tjs(JS).code)).toBe(true)
    })

    it("dialect: 'js' is equivalent to the TjsCompat directive", () => {
      const viaOption = tjs(JS, { dialect: 'js' }).code
      const viaDirective = tjs(`TjsCompat\n${JS}`).code
      // Both leave the comparison/typeof untouched.
      expect(isMolested(viaOption)).toBe(false)
      expect(isMolested(viaDirective)).toBe(false)
    })
  })

  describe('dialectForFilename', () => {
    it('maps JS extensions to the js dialect', () => {
      for (const f of ['a.js', 'a.mjs', 'a.cjs', 'deep/b.JS']) {
        expect(dialectForFilename(f)).toBe('js')
      }
    })

    it('maps .tjs and unknown/TS extensions to the tjs dialect', () => {
      // .ts is not a tjs() dialect — it routes through fromTS — so the dialect
      // helper reports 'tjs'; use sourceKindForFilename to tell them apart.
      for (const f of ['a.tjs', 'a.ts', 'a.mts', 'a.d.ts', 'noext']) {
        expect(dialectForFilename(f)).toBe('tjs')
      }
    })
  })

  describe('sourceKindForFilename', () => {
    it('classifies js / ts / tjs by extension', () => {
      expect(sourceKindForFilename('x.js')).toBe('js')
      expect(sourceKindForFilename('x.mjs')).toBe('js')
      expect(sourceKindForFilename('x.cjs')).toBe('js')
      expect(sourceKindForFilename('x.ts')).toBe('ts')
      expect(sourceKindForFilename('x.mts')).toBe('ts')
      expect(sourceKindForFilename('x.d.ts')).toBe('ts')
      expect(sourceKindForFilename('x.tjs')).toBe('tjs')
      expect(sourceKindForFilename('x')).toBe('tjs')
    })
  })
})
