function __ub(v) {
  try {
    if (v instanceof String) return String.prototype.valueOf.call(v)
    if (v instanceof Number) return Number.prototype.valueOf.call(v)
    if (v instanceof Boolean) return Boolean.prototype.valueOf.call(v)
  } catch {
    return v
  }
  return v
}
const __ac = Object.create(null)
function __proj(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v
  let k
  try {
    k = v.constructor && v.constructor.name
  } catch {
    return v
  }
  let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null
  if (typeof f !== 'function') {
    try {
      f = v.asCompared
    } catch {
      return v
    }
  }
  if (typeof f !== 'function') return v
  let p
  try {
    p = f.call(v)
  } catch {
    return v
  }
  const t = typeof p
  return p === null ||
    p === undefined ||
    t === 'number' ||
    t === 'string' ||
    t === 'boolean'
    ? p
    : v
}
function Eq(a, b) {
  a = __ub(__proj(a))
  b = __ub(__proj(b))
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b))
    return true
  if ((a === null || a === undefined) && (b === null || b === undefined))
    return true
  return false
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { Eq }
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import {
  dialectForFilename,
  sourceKindForFilename,
} from '/Users/tonioloewald/tjs-lang/src/lang/dialect'

describe('source dialect', () => {
  const JS = `function f(a, b) { if (a == b) { return typeof a } return null }`
  const isMolested = (code) =>
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
