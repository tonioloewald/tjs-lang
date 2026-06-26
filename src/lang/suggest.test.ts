import { describe, it, expect } from 'bun:test'
import { suggest } from './predicate'

const vals = (s: ReturnType<typeof suggest>) =>
  s.filter((x) => x.kind === 'value').map((x) => x.value)
const stubs = (s: ReturnType<typeof suggest>) =>
  s.filter((x) => x.kind === 'stub').map((x) => x.value)

describe('suggest — autocomplete from predicate clusters', () => {
  // The keyword set is a plain array literal + an equality check; the open-ended
  // values ride in `startsWith` guards. TS could enumerate the union but not the
  // open-ended `var(--`; a TS `string` fallback offers neither.
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
    expect(v).toContain('infinite') // from `t == 'infinite'`
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
    // user has typed `var(`; the `var(--` stub is still the relevant completion
    expect(stubs(suggest(ANIMATION, { prefix: 'var(' }))).toContain('var(--')
    // and once they pass it, it still matches by startsWith
    expect(stubs(suggest(ANIMATION, { prefix: 'var(--' }))).toContain('var(--')
  })

  it('validated suggestions are exactly what the predicate accepts', () => {
    // `bad` is in the keyword array but the entry predicate excludes it — so the
    // mined candidate is filtered out by running it through the predicate.
    const src = String.raw`
      var ALL = ['yes','maybe','bad']
      function check(v){ return ALL.includes(v) && v != 'bad' }
    `
    const v = vals(suggest(src))
    expect(v).toContain('yes')
    expect(v).toContain('maybe')
    expect(v).not.toContain('bad') // mined, but predicate rejects it
  })

  it('validate:false returns raw mined candidates (no predicate run)', () => {
    const src = String.raw`
      var ALL = ['yes','maybe','bad']
      function check(v){ return ALL.includes(v) && v != 'bad' }
    `
    const v = vals(suggest(src, { validate: false }))
    expect(v).toContain('yes')
    expect(v).toContain('bad') // un-validated → the excluded literal leaks in
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
