/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { suggest } from '/Users/tonioloewald/tjs-lang/src/lang/predicate'

/* line 4 */
/* TODO: TS types degraded — s: ReturnType<typeof suggest> */
function vals(s) {
  return s.filter((x) => x.kind === 'value').map((x) => x.value)
}
vals.__tjs = {
  params: {
    s: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:9',
}

/* line 6 */
/* TODO: TS types degraded — s: ReturnType<typeof suggest> */
function stubs(s) {
  return s.filter((x) => x.kind === 'stub').map((x) => x.value)
}
stubs.__tjs = {
  params: {
    s: {
      type: {
        kind: 'any',
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:15',
}

describe('suggest — autocomplete from predicate clusters', () => {
  const ANIMATION = String.raw`
    var TIMING = ['linear','ease','ease-in','ease-out','ease-in-out']
    function isTime(t){ return /^-?[0-9.]+m?s$/.test(t) }
    function isIter(t){ return t == 'infinite' || /^[0-9.]+$/.test(t) }
    function isVar(t){ return typeof t == 'string' && t.startsWith('var(--') }
    function isTok(t){ return isTime(t) || isIter(t) || TIMING.includes(t) || isVar(t) }
    function isAnimationToken(v){ return typeof v == 'string' && isTok(v.trim()) }
  `
  it('mines the keyword set (array literal + equality literal)', () => {
    const v = vals(suggest(ANIMATION))
    expect(v).toContain('linear')
    expect(v).toContain('ease-in-out')
    expect(v).toContain('infinite')
  })
  it('mines open-ended `startsWith` guards as stubs (TS string can offer none)', () => {
    expect(stubs(suggest(ANIMATION))).toContain('var(--')
  })
  it('filters by the prefix typed so far', () => {
    const v = vals(suggest(ANIMATION, { prefix: 'ease-' }))
    expect(v).toEqual(['ease-in', 'ease-in-out', 'ease-out'])
    expect(v).not.toContain('linear')
  })
  it('a stub matches when the user is mid-typing into it', () => {
    expect(stubs(suggest(ANIMATION, { prefix: 'var(' }))).toContain('var(--')

    expect(stubs(suggest(ANIMATION, { prefix: 'var(--' }))).toContain('var(--')
  })
  it('validated suggestions are exactly what the predicate accepts', () => {
    const src = String.raw`
      var ALL = ['yes','maybe','bad']
      function check(v){ return ALL.includes(v) && v != 'bad' }
    `
    const v = vals(suggest(src))
    expect(v).toContain('yes')
    expect(v).toContain('maybe')
    expect(v).not.toContain('bad')
  })
  it('validate:false returns raw mined candidates (no predicate run)', () => {
    const src = String.raw`
      var ALL = ['yes','maybe','bad']
      function check(v){ return ALL.includes(v) && v != 'bad' }
    `
    const v = vals(suggest(src, { validate: false }))
    expect(v).toContain('yes')
    expect(v).toContain('bad')
  })
  it('respects limit', () => {
    expect(suggest(ANIMATION, { limit: 2 }).length).toBe(2)
  })
  it('values sort before stubs', () => {
    const s = suggest(ANIMATION)
    const firstStub = s.findIndex((x) => x.kind === 'stub')
    const lastValue = s.map((x) => x.kind).lastIndexOf('value')
    expect(lastValue).toBeLessThan(firstStub)
  })
  it('empty / unparseable source yields nothing', () => {
    expect(suggest('')).toEqual([])
    expect(suggest('function (')).toEqual([])
  })
})
