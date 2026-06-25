import { describe, it, expect } from 'bun:test'
import { verifyPredicates, compilePredicates } from './verify'
import { CSS_PREDICATE_SOURCE } from './css.predicates'

describe('predicate PoC — verifier', () => {
  it('certifies the CSS predicate cluster predicate-safe', () => {
    const r = verifyPredicates(CSS_PREDICATE_SOURCE)
    expect(r.safe).toBe(true)
    expect(r.diagnostics).toEqual([])
    // it found the composed cluster (a sampling)
    expect(r.predicates).toEqual(
      expect.arrayContaining([
        'isColor',
        'isColorValue',
        'isAnimation',
        'isStyleObject',
      ])
    )
  })

  it('rejects an IO-using "predicate" at definition time, with a location', () => {
    const bad = `
      function isLiveColor(v) { return httpFetch('/colors/' + v) }
    `
    const r = verifyPredicates(bad)
    expect(r.safe).toBe(false)
    expect(r.diagnostics[0].predicate).toBe('isLiveColor')
    expect(r.diagnostics[0].message).toMatch(/httpFetch.*IO/)
    expect(r.diagnostics[0].line).toBeGreaterThan(0)
    // and compiling it throws rather than producing a runnable predicate
    expect(() => compilePredicates(bad, ['isLiveColor'])).toThrow(
      /Not predicate-safe/
    )
  })

  it('rejects async and `new`', () => {
    expect(
      verifyPredicates(`async function f(v){ return await g(v) }`).safe
    ).toBe(false)
    expect(
      verifyPredicates(`function f(v){ return new RegExp(v).test(v) }`).safe
    ).toBe(false)
  })
})

describe('predicate PoC — native execution (the verified fast path)', () => {
  const css = compilePredicates(CSS_PREDICATE_SOURCE, [
    'isColor',
    'isColorValue',
    'isAnimation',
    'isStyleObject',
  ])

  it('validates colors incl. var()/calc() — the TS `string` fallback cases', () => {
    expect(css.isColor('#3a3')).toBe(true)
    expect(css.isColor('rebeccapurple')).toBe(true)
    expect(css.isColor('rgb(1,2,3)')).toBe(true)
    expect(css.isColor('var(--brand)')).toBe(true) // TS can't type this
    expect(css.isColor('calc(1px + 2em)')).toBe(true) // …or this
    expect(css.isColor('notacolor')).toBe(false)
    expect(css.isColor('#xyz')).toBe(false)
  })

  it('handles !important (combinatoric explosion in TS) via strip-and-recurse', () => {
    expect(css.isColorValue('#3a3 !important')).toBe(true)
    expect(css.isColorValue('var(--x) !important')).toBe(true)
    expect(css.isColorValue('rebeccapurple')).toBe(true)
    expect(css.isColorValue('notacolor !important')).toBe(false)
  })

  it('validates the order-flexible animation shorthand', () => {
    expect(
      css.isAnimation('3s ease-in 1s infinite alternate both slidein')
    ).toBe(true)
    expect(css.isAnimation('slidein 200ms linear')).toBe(true) // different order
    expect(css.isAnimation('var(--dur) ease-out forwards spin')).toBe(true)
    expect(css.isAnimation('3s bogus-timing!! slidein')).toBe(false)
  })

  it('validates an open, nested styleSpec recursively (the "structure" case)', () => {
    const spec = {
      color: 'var(--fg)',
      background: '#111 !important',
      animation: '2s ease-in-out infinite pulse',
      '&:hover': { color: 'rebeccapurple' }, // nested selector → recurse
      '@media (min-width: 600px)': {
        // nested at-rule → recurse
        color: 'rgb(0,0,0)',
      },
    }
    expect(css.isStyleObject(spec)).toBe(true)

    const broken = { '&:hover': { color: 12345, nope: {} } }
    expect(css.isStyleObject(broken)).toBe(false)
  })
})
