/**
 * `tjs-lang/css` phase 2 — dimensions / numbers / angles / times / keywords.
 * Same vertical slice as colors: the source verifies safe (via `verifyCss`,
 * which now covers all clusters) and compiles to correct native validators.
 */
import { describe, it, expect } from 'bun:test'
import {
  isLength,
  isPercentage,
  isNumber,
  isInteger,
  isAngle,
  isTime,
  isDimension,
  isGlobalKeyword,
  verifyCss,
} from './index'

describe('all CSS clusters are predicate-safe (incl. dimensions)', () => {
  it('verifyCss covers color + dimension, all safe', () => {
    const r = verifyCss()
    if (!r.safe) console.error(r.diagnostics)
    expect(r.safe).toBe(true)
  })
})

describe('isLength', () => {
  const valid = [
    '0', // unitless zero
    '10px',
    '1.5rem',
    '-2em',
    '100vh',
    '50vmax',
    '3ch',
    '2.5cqw', // container query unit
    '1dvh', // dynamic viewport
    '10Q',
    '.5in',
    'calc(100% - 10px)',
    'var(--gap)',
  ]
  for (const v of valid)
    it(`accepts ${v}`, () => expect(isLength(v)).toBe(true))

  const invalid = ['10', '10foo', 'px', '10 px', 'red', '', {}, null]
  for (const v of invalid)
    it(`rejects ${JSON.stringify(v)}`, () => expect(isLength(v)).toBe(false))

  it('accepts numeric 0 (unitless zero) but not other bare numbers', () => {
    expect(isLength(0)).toBe(true)
    expect(isLength(10)).toBe(false) // a bare number isn't a length
  })
})

describe('isPercentage', () => {
  it('accepts', () => {
    expect(isPercentage('50%')).toBe(true)
    expect(isPercentage('-12.5%')).toBe(true)
  })
  it('rejects', () => {
    expect(isPercentage('50')).toBe(false)
    expect(isPercentage('50px')).toBe(false)
  })
})

describe('isNumber / isInteger', () => {
  it('isNumber accepts numbers and numeric strings', () => {
    expect(isNumber(42)).toBe(true)
    expect(isNumber(3.14)).toBe(true)
    expect(isNumber('42')).toBe(true)
    expect(isNumber('-.5')).toBe(true)
    expect(isNumber('4px')).toBe(false)
    expect(isNumber(Infinity)).toBe(false)
    expect(isNumber(NaN)).toBe(false)
  })
  it('isInteger', () => {
    expect(isInteger(5)).toBe(true)
    expect(isInteger('5')).toBe(true)
    expect(isInteger(5.5)).toBe(false)
    expect(isInteger('5.0')).toBe(false)
  })
})

describe('isAngle / isTime', () => {
  it('angles', () => {
    for (const a of ['45deg', '1turn', '1.5rad', '100grad', '-90deg'])
      expect(isAngle(a)).toBe(true)
    expect(isAngle('45')).toBe(false)
    expect(isAngle('45px')).toBe(false)
  })
  it('times', () => {
    expect(isTime('200ms')).toBe(true)
    expect(isTime('1s')).toBe(true)
    expect(isTime('1.5s')).toBe(true)
    expect(isTime('1')).toBe(false)
  })
})

describe('isDimension (any numeric family) + isGlobalKeyword', () => {
  it('isDimension unifies the families', () => {
    for (const v of ['10px', '50%', '45deg', '1s', '42', 'calc(1px + 2px)'])
      expect(isDimension(v)).toBe(true)
    expect(isDimension('red')).toBe(false)
  })
  it('isGlobalKeyword', () => {
    for (const k of ['inherit', 'initial', 'unset', 'revert', 'revert-layer'])
      expect(isGlobalKeyword(k)).toBe(true)
    expect(isGlobalKeyword('INHERIT')).toBe(true) // case-insensitive
    expect(isGlobalKeyword('auto')).toBe(false)
  })
})
