/**
 * `tjs-lang/css` phase 4 — recursive style-object structure + the `$predicate`
 * JSON-Schema. The thesis end-to-end: one serializable schema, validated two
 * ways — naive (structure only) vs predicate-aware (the full recursive grammar).
 */
import { describe, it, expect } from 'bun:test'
import {
  compilePredicateSchema,
  validatePredicateSchema,
} from '../lang/predicate-schema'
import {
  isStyleObject,
  isStyleValue,
  isCssProperty,
  isSelectorOrAtRule,
  cssStyleSchema,
  cssColorSchema,
  verifyCss,
} from './index'

describe('the combined style source verifies safe', () => {
  it('color + dimension + recursive structure all predicate-safe', () => {
    const r = verifyCss()
    if (!r.safe) console.error(r.diagnostics)
    expect(r.safe).toBe(true)
  })
})

describe('key classification', () => {
  it('isCssProperty', () => {
    expect(isCssProperty('color')).toBe(true)
    expect(isCssProperty('-webkit-box-shadow')).toBe(true)
    expect(isCssProperty('--brand')).toBe(true)
    expect(isCssProperty('&:hover')).toBe(false)
    expect(isCssProperty('.card')).toBe(false)
  })
  it('isSelectorOrAtRule', () => {
    expect(isSelectorOrAtRule('&:hover')).toBe(true)
    expect(isSelectorOrAtRule('.card')).toBe(true)
    expect(isSelectorOrAtRule('> a')).toBe(true)
    expect(isSelectorOrAtRule('@media (min-width: 600px)')).toBe(true)
    expect(isSelectorOrAtRule('[data-x]')).toBe(true)
    expect(isSelectorOrAtRule('color')).toBe(false)
  })
})

describe('isStyleObject validates the recursive structure', () => {
  it('accepts a nested style object', () => {
    const spec = {
      color: 'red',
      padding: '10px',
      '--gap': '4px',
      '&:hover': { color: '#00f', background: 'var(--surface)' },
      '@media (min-width: 600px)': {
        display: 'grid',
        '.card': { boxShadow: '0 1px 2px rgba(0,0,0,0.2)' },
      },
    }
    expect(isStyleObject(spec)).toBe(true)
  })
  it('rejects a non-object', () => {
    expect(isStyleObject('red')).toBe(false)
    expect(isStyleObject(null)).toBe(false)
    expect(isStyleObject(42)).toBe(false)
  })
  it('rejects a property whose value is the wrong type', () => {
    expect(isStyleObject({ color: { nested: 'x' } })).toBe(false) // property → not an object
    expect(isStyleObject({ color: '' })).toBe(false) // empty value
  })
  it('rejects a selector whose value is not a nested rule', () => {
    expect(isStyleObject({ '&:hover': 'red' })).toBe(false)
  })
  it('rejects a key that is neither property nor selector', () => {
    expect(isStyleObject({ '': 'red' })).toBe(false)
  })
})

describe('isStyleValue (leaf)', () => {
  it('accepts known + permissive values', () => {
    expect(isStyleValue('red')).toBe(true) // color
    expect(isStyleValue('10px')).toBe(true) // dimension
    expect(isStyleValue('1px solid red')).toBe(true) // shorthand → permissive tail
    expect(isStyleValue(0)).toBe(true) // finite number
  })
  it('rejects empty / non-primitive', () => {
    expect(isStyleValue('')).toBe(false)
    expect(isStyleValue({})).toBe(false)
    expect(isStyleValue(Infinity)).toBe(false)
  })
})

describe('$predicate schema — progressive enhancement', () => {
  const schema = cssStyleSchema()
  const good = { color: 'red', '&:hover': { color: 'blue' } }
  const structurallyOkButBadGrammar = { '  not a prop  ': 'red' } // is an object, but a bad key

  it('naive validator (structure only) checks just `type: object`', () => {
    const naive = compilePredicateSchema(schema, { ignorePredicates: true })
    expect(naive(good).valid).toBe(true)
    // a plain object passes structure even with an invalid key...
    expect(naive(structurallyOkButBadGrammar).valid).toBe(true)
    // ...but a non-object still fails the structural `type`.
    expect(naive('nope').valid).toBe(false)
  })

  it('predicate-aware validator runs the full recursive grammar', () => {
    const aware = compilePredicateSchema(schema)
    expect(aware(good).valid).toBe(true)
    // now the bad key is caught by $predicate where the naive one passed it
    expect(aware(structurallyOkButBadGrammar).valid).toBe(false)
  })

  it('validatePredicateSchema one-shot works for a color node', () => {
    expect(validatePredicateSchema(cssColorSchema(), '#3a3').valid).toBe(true)
    expect(validatePredicateSchema(cssColorSchema(), 'notacolor').valid).toBe(
      false
    )
    // naive sees only `type: string`
    expect(
      validatePredicateSchema(cssColorSchema(), 'notacolor', {
        ignorePredicates: true,
      }).valid
    ).toBe(true)
  })
})
