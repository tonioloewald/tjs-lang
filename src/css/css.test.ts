/**
 * `tjs-lang/css` phase 1 — the color grammar. Proves the full vertical slice:
 * the predicate source verifies safe (pure + ReDoS-clean), compiles to correct
 * native validators, and mines valid autocomplete suggestions.
 */
import { describe, it, expect } from 'bun:test'
import {
  isColor,
  isColorValue,
  isNamedColor,
  isHexColor,
  verifyCss,
  suggestColor,
  CSS_NAMED_COLORS,
} from './index'

describe('CSS color source is predicate-safe', () => {
  it('verifies pure, synchronous, ReDoS-clean', () => {
    const r = verifyCss()
    if (!r.safe) console.error(r.diagnostics)
    expect(r.safe).toBe(true)
    expect(r.diagnostics).toEqual([])
  })
})

describe('isColor accepts valid CSS colors', () => {
  const valid = [
    'red',
    'REBECCAPURPLE', // case-insensitive named
    'transparent',
    'currentColor',
    '#f00',
    '#ff0000',
    '#ff0000aa', // 8-digit
    '#abcd', // 4-digit
    'rgb(255, 0, 0)',
    'rgb(255 0 0 / 0.5)', // modern slash syntax
    'rgba(0,0,0,0.2)',
    'hsl(120, 50%, 50%)',
    'hsl(120deg 50% 50% / 0.5)',
    'hwb(194 0% 0%)',
    'oklch(0.7 0.15 200)',
    'lab(50% 40 59.5)',
    'color-mix(in oklch, red, blue)',
    'color(display-p3 1 0.5 0)',
    'var(--brand)',
  ]
  for (const c of valid) {
    it(`accepts ${c}`, () => expect(isColor(c)).toBe(true))
  }
})

describe('isColor rejects non-colors', () => {
  const invalid = [
    'notacolor',
    '#gg0000', // non-hex digits
    '#12345', // 5 digits (not 3/4/6/8)
    'reddish',
    '',
    'rgb', // no parens
    'linear-gradient(red, blue)', // a gradient, not a color
    42,
    null,
    undefined,
    {},
  ]
  for (const c of invalid) {
    it(`rejects ${JSON.stringify(c)}`, () => expect(isColor(c)).toBe(false))
  }
})

describe('isColorValue tolerates !important', () => {
  it('accepts a color with !important', () => {
    expect(isColorValue('#3a3 !important')).toBe(true)
    expect(isColorValue('red !important')).toBe(true)
  })
  it('still rejects a non-color with !important', () => {
    expect(isColorValue('notacolor !important')).toBe(false)
  })
  it('isColor (strict) does not accept !important', () => {
    expect(isColor('red !important')).toBe(false)
  })
})

describe('leaf predicates', () => {
  it('isNamedColor is case-insensitive and complete-ish', () => {
    expect(isNamedColor('RebeccaPurple')).toBe(true)
    expect(isNamedColor('cornflowerblue')).toBe(true)
    expect(isNamedColor('bluish')).toBe(false)
    // sanity: the full named set is present
    expect(CSS_NAMED_COLORS.length).toBeGreaterThan(140)
  })
  it('isHexColor validates digit counts', () => {
    expect(isHexColor('#abc')).toBe(true)
    expect(isHexColor('#abcd')).toBe(true)
    expect(isHexColor('#aabbcc')).toBe(true)
    expect(isHexColor('#aabbccdd')).toBe(true)
    expect(isHexColor('#ab')).toBe(false)
    expect(isHexColor('#abcde')).toBe(false)
  })
})

describe('suggestColor mines valid completions', () => {
  it('suggests named colors for a prefix, all valid', () => {
    const s = suggestColor('red')
    const values = s.filter((x) => x.kind === 'value').map((x) => x.value)
    expect(values).toContain('red')
    // every suggested value actually passes the predicate (mined + validated)
    for (const v of values) expect(isColor(v)).toBe(true)
  })
  it('offers the open var(-- stub for a relevant prefix', () => {
    // Empty-prefix suggest floods with named colors (correctly); autocomplete is
    // prefix-driven, so the open functional stubs surface once you start typing.
    const s = suggestColor('var')
    const stubs = s.filter((x) => x.kind === 'stub').map((x) => x.value)
    expect(stubs).toContain('var(--')
  })
  it('offers color-mix( for the color- prefix', () => {
    const s = suggestColor('color-')
    expect(s.some((x) => x.value === 'color-mix(')).toBe(true)
  })
})
