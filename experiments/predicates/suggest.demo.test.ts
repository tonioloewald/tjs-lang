import { describe, it, expect } from 'bun:test'
import { suggest } from '../../src/lang/predicate'
import { effectfulFromAtoms } from '../../src/lang/predicate'
import { coreAtoms } from '../../src/vm/runtime'

/**
 * The autocomplete half of the thesis (#4): the SAME verified-pure predicate
 * that validates a CSS value also drives autocomplete — and beats both TS modes.
 *
 *   - For an open value grammar (a color), TS collapses to `string` and offers
 *     ZERO suggestions. Our predicate still surfaces the `var(--` / `calc(`
 *     stubs the grammar admits.
 *   - For a finite keyword set (animation timing), TS can offer a union — but
 *     only if you hand-author the union type AND it can't include the
 *     open-ended `var(--`. The predicate mines the keyword set *and* the stub
 *     from the one source that also validates.
 */
const opts = { effectful: effectfulFromAtoms(coreAtoms as any) }
const vals = (s: ReturnType<typeof suggest>) =>
  s.filter((x) => x.kind === 'value').map((x) => x.value)
const stubs = (s: ReturnType<typeof suggest>) =>
  s.filter((x) => x.kind === 'stub').map((x) => x.value)

// String.raw so regex backslashes survive (moot in real JSON `$predicate`).
const COLOR = String.raw`
  function isVar(v){ return typeof v == 'string' && v.startsWith('var(--') }
  function isCalc(v){ return typeof v == 'string' && v.startsWith('calc(') }
  function isHex(v){ return typeof v == 'string' && /^#[0-9a-f]{3,8}$/i.test(v) }
  function isColor(v){ return isHex(v) || isVar(v) || isCalc(v) }
`
const ANIMATION = String.raw`
  var TIMING = ['linear','ease','ease-in','ease-out','ease-in-out']
  function isTime(t){ return /^-?[0-9.]+m?s$/.test(t) }
  function isIter(t){ return t == 'infinite' || /^[0-9.]+$/.test(t) }
  function isVar(t){ return typeof t == 'string' && t.startsWith('var(--') }
  function isTok(t){ return isTime(t) || isIter(t) || TIMING.includes(t) || isVar(t) }
  function isAnimationToken(v){ return typeof v == 'string' && isTok(v.trim()) }
`

describe('suggest() — autocomplete that beats the TS `string` fallback', () => {
  it('an open value grammar still yields stubs where TS offers nothing', () => {
    // TS: `color: string` → no completions at all.
    const s = suggest(COLOR, opts)
    expect(stubs(s)).toContain('var(--')
    expect(stubs(s)).toContain('calc(')
  })

  it('a keyword set yields the union AND the open-ended stub', () => {
    const s = suggest(ANIMATION, opts)
    // the finite part a TS union could also give:
    expect(vals(s)).toEqual(
      expect.arrayContaining([
        'linear',
        'ease',
        'ease-in',
        'ease-out',
        'ease-in-out',
        'infinite',
      ])
    )
    // …plus the part a TS union can't:
    expect(stubs(s)).toContain('var(--')
  })

  it('prefix narrows to exactly the relevant completions', () => {
    expect(vals(suggest(ANIMATION, { ...opts, prefix: 'ease-' }))).toEqual([
      'ease-in',
      'ease-in-out',
      'ease-out',
    ])
  })
})
