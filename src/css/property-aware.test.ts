/**
 * Property-aware validation — `isStyleValueFor(prop, val)` tightens the closed
 * value grammars (color/animation/transition) so `isStyleObject` catches real
 * value errors (`color: 'notacolor'`), while keyword-heavy properties stay
 * permissive (no false rejections). This is the "validates real style objects"
 * payoff over structure-only checking.
 */
import { describe, it, expect } from 'bun:test'
import { isStyleValueFor, isStyleObject } from './index'

describe('isStyleValueFor — closed grammars are enforced', () => {
  it('color: precise (rejects a non-color)', () => {
    expect(isStyleValueFor('color', 'red')).toBe(true)
    expect(isStyleValueFor('color', '#3a3')).toBe(true)
    expect(isStyleValueFor('color', 'notacolor')).toBe(false)
    expect(isStyleValueFor('color', 5)).toBe(false)
  })
  it('color: kebab-case and camelCase both normalize', () => {
    expect(isStyleValueFor('background-color', 'blue')).toBe(true)
    expect(isStyleValueFor('backgroundColor', 'blue')).toBe(true)
    expect(isStyleValueFor('borderTopColor', 'nope')).toBe(false)
  })
  it('animation / transition: precise', () => {
    expect(isStyleValueFor('animation', 'spin 1s ease infinite')).toBe(true)
    expect(isStyleValueFor('animation', 'spin 1s @@@')).toBe(false)
    expect(isStyleValueFor('transition', 'all 0.3s ease')).toBe(true)
    expect(isStyleValueFor('transition', 'color 200ms @@@')).toBe(false)
  })
})

describe('isStyleValueFor — universal escapes valid on any property', () => {
  for (const v of [
    'inherit',
    'initial',
    'unset',
    'var(--x)',
    'calc(1px + 2px)',
  ]) {
    it(`color accepts ${v}`, () =>
      expect(isStyleValueFor('color', v)).toBe(true))
  }
})

describe('isStyleValueFor — keyword-heavy properties stay permissive', () => {
  it('width/padding/display accept idents we do not enumerate', () => {
    expect(isStyleValueFor('width', 'fit-content')).toBe(true)
    expect(isStyleValueFor('padding', '10px 1rem')).toBe(true)
    expect(isStyleValueFor('display', 'flex')).toBe(true)
    expect(isStyleValueFor('fontWeight', 'bold')).toBe(true)
    expect(isStyleValueFor('zIndex', 10)).toBe(true)
  })
  it('but still rejects empty / non-primitive', () => {
    expect(isStyleValueFor('padding', '')).toBe(false)
    expect(isStyleValueFor('padding', {})).toBe(false)
  })
})

describe('isStyleObject now catches value errors, not just structure', () => {
  it('rejects a bad color where structure is fine', () => {
    expect(isStyleObject({ color: 'red', padding: '10px' })).toBe(true)
    expect(isStyleObject({ color: 'notacolor' })).toBe(false)
    expect(isStyleObject({ backgroundColor: 'bogus' })).toBe(false)
  })
  it('catches a bad color inside a nested selector', () => {
    expect(isStyleObject({ '&:hover': { color: 'nope' } })).toBe(false)
    expect(isStyleObject({ '&:hover': { color: 'blue' } })).toBe(true)
  })
  it('catches a bad animation shorthand', () => {
    expect(isStyleObject({ animation: 'spin 1s @@@' })).toBe(false)
    expect(isStyleObject({ animation: 'spin 1s ease' })).toBe(true)
  })
  it('still accepts a full realistic spec (permissive where it should be)', () => {
    expect(
      isStyleObject({
        color: 'var(--text)',
        padding: '1rem 2rem',
        display: 'grid',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        transition: 'color 200ms ease',
        '&:hover': { color: '#00f' },
      })
    ).toBe(true)
  })
})
