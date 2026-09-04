/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  compilePredicateSchema,
  validatePredicateSchema,
} from '/Users/tonioloewald/tjs-lang/src/lang/predicate-schema'

const COLOR = `
  function isHex(v){ return typeof v == 'string' && /^#[0-9a-f]{3,8}$/i.test(v) }
  function isVar(v){ return typeof v == 'string' && v.startsWith('var(--') && v.endsWith(')') }
  function isCalc(v){ return typeof v == 'string' && v.startsWith('calc(') && v.endsWith(')') }
  function isColor(v){ return isHex(v) || isVar(v) || isCalc(v) }
`

const TREE = `
  function isLeaf(v){ return typeof v == 'string' || typeof v == 'number' }
  function isEntry(pair){ var val = pair[1]; return isLeaf(val) || isNode(val) }
  function isNode(o){ return typeof o == 'object' && o != null && !Array.isArray(o) && Object.entries(o).every(isEntry) }
`

const colorSchema = {
  type: 'object',
  required: ['color'],
  properties: {
    color: { type: 'string', description: 'a CSS color', $predicate: COLOR },
  },
}

describe('predicate-schema — the computational half of JSON-Schema', () => {
  it('a predicate-aware validator validates the value grammar', () => {
    const validate = compilePredicateSchema(colorSchema)
    expect(validate({ color: '#3a3' }).valid).toBe(true)
    expect(validate({ color: 'var(--brand)' }).valid).toBe(true)
    expect(validate({ color: 'calc(1px + 1em)' }).valid).toBe(true)
    const bad = validate({ color: 'notacolor' })
    expect(bad.valid).toBe(false)
    expect(bad.errors[0].path).toBe('/color')
  })
  it('still does structural validation (type / required)', () => {
    const validate = compilePredicateSchema(colorSchema)
    expect(validate({ color: 123 }).errors[0].message).toMatch(
      /expected string/
    )
    expect(validate({}).errors[0].message).toMatch(/missing required 'color'/)
  })
  it('progressive enhancement: a naive validator ignores `$predicate`', () => {
    const naive = compilePredicateSchema(colorSchema, {
      ignorePredicates: true,
    })
    expect(naive({ color: 'notacolor' }).valid).toBe(true)

    expect(
      compilePredicateSchema(colorSchema)({ color: 'notacolor' }).valid
    ).toBe(false)
  })
  it('the schema is plain serializable JSON — code travels as data', () => {
    const roundTripped = JSON.parse(JSON.stringify(colorSchema))
    expect(roundTripped).toEqual(colorSchema)

    const validate = compilePredicateSchema(roundTripped)
    expect(validate({ color: '#abc' }).valid).toBe(true)
    expect(validate({ color: 'nope' }).valid).toBe(false)
  })
  it('a `$predicate` can recurse into open nested structure', () => {
    const schema = { type: 'object', $predicate: TREE }
    const validate = compilePredicateSchema(schema)
    expect(validate({ a: 1, b: { c: 'x', d: { e: 2 } } }).valid).toBe(true)
    expect(validate({ a: 1, bad: { nope: [] } }).valid).toBe(false)
  })
  it('rejects an unsafe predicate at compile time (IO never embeds)', () => {
    const evil = {
      type: 'string',
      $predicate: `function check(v){ return fetch(v) }`,
    }
    expect(() => compilePredicateSchema(evil)).toThrow(/Not predicate-safe/)
  })
  it('one-shot helper works too', () => {
    expect(validatePredicateSchema(colorSchema, { color: '#fff' }).valid).toBe(
      true
    )
  })
})
