import { describe, it, expect } from 'bun:test'
import { compilePredicateSchema } from '../../src/lang/predicate-schema'
import { effectfulFromAtoms } from '../../src/lang/predicate'
import { coreAtoms } from '../../src/vm/runtime'
import { CSS_PREDICATE_SOURCE } from './css.predicates'

/**
 * The screenshot that sells the thesis: a *plain JSON-Schema* whose CSS value
 * grammar rides in `$predicate` keywords. The same serializable document means
 * two things to two readers:
 *   - naive JSON-Schema validator → `type: string` (any string passes)
 *   - predicate-aware (this evaluator / an incoming tosijs-schema) → the value
 *     is validated precisely: var()/calc()/!important, the animation shorthand,
 *     recursion — the things TS and JSON-Schema cave to `string` on.
 */
const opts = { effectful: effectfulFromAtoms(coreAtoms as any) }

// Precise per-property predicates (entry = last fn, takes the value).
// String.raw so regex backslashes survive the template literal (`\s` etc.).
const COLOR = String.raw`
  function isVar(v){ return typeof v == 'string' && v.startsWith('var(--') && v.endsWith(')') }
  function isCalc(v){ return typeof v == 'string' && v.startsWith('calc(') && v.endsWith(')') }
  function isHex(v){ return typeof v == 'string' && /^#[0-9a-f]{3,8}$/i.test(v) }
  function isRgb(v){ return typeof v == 'string' && /^rgba?\([0-9\s,.%\/]+\)$/i.test(v) }
  function isColor(v){ return isHex(v) || isRgb(v) || isVar(v) || isCalc(v) }
  function isColorValue(v){
    if (typeof v != 'string') { return false }
    return isColor(v.replace(/\s*!important\s*$/i, ''))
  }
`
const ANIMATION = String.raw`
  var TIMING = ['linear','ease','ease-in','ease-out','ease-in-out']
  function isTime(t){ return /^-?[0-9.]+m?s$/.test(t) }
  function isIter(t){ return t == 'infinite' || /^[0-9.]+$/.test(t) }
  function isVar(t){ return typeof t == 'string' && t.startsWith('var(--') && t.endsWith(')') }
  function isName(t){ return /^-?[a-z_][a-z0-9_-]*$/i.test(t) }
  function isTok(t){ return isTime(t) || isIter(t) || TIMING.includes(t) || isVar(t) || isName(t) }
  function isAnimation(v){
    if (typeof v != 'string') { return false }
    return v.trim().split(/\s+/).every(isTok)
  }
`

const ruleSchema = {
  type: 'object' as const,
  properties: {
    color: { type: 'string' as const, $predicate: COLOR },
    animation: { type: 'string' as const, $predicate: ANIMATION },
  },
}

describe('CSS as a predicate-aware JSON-Schema — precise per-value validation', () => {
  const aware = compilePredicateSchema(ruleSchema, opts)
  const naive = compilePredicateSchema(ruleSchema, {
    ...opts,
    ignorePredicates: true,
  })

  it('validates the value grammars TS/JSON-Schema cave to `string` on', () => {
    expect(aware({ color: '#3a3 !important' }).valid).toBe(true)
    expect(aware({ color: 'var(--brand)' }).valid).toBe(true)
    expect(aware({ animation: '2s ease-in infinite pulse' }).valid).toBe(true)
  })

  it('catches a bad color — precisely — where a naive validator cannot', () => {
    expect(aware({ color: 'definitely-not-a-color' }).valid).toBe(false)
    expect(aware({ animation: 'bogus!!' }).valid).toBe(false)
    // same document, naive reader: `type: string` → both slip through
    expect(naive({ color: 'definitely-not-a-color' }).valid).toBe(true)
  })

  it('is plain serializable JSON — code travels as data', () => {
    const rt = JSON.parse(JSON.stringify(ruleSchema))
    expect(typeof rt.properties.color.$predicate).toBe('string')
    expect(compilePredicateSchema(rt, opts)({ color: '#abc' }).valid).toBe(true)
    expect(compilePredicateSchema(rt, opts)({ color: 'nope' }).valid).toBe(
      false
    )
  })
})

describe('CSS as a predicate-aware JSON-Schema — recursive whole-spec', () => {
  // CSS_PREDICATE_SOURCE's entry is isStyleObject, which recurses into nested
  // selectors. It is permissive on unknown values by design (partial
  // validation), so it catches *structural* breaks; precise per-value checking
  // is the per-property form above (and the real CSS library's job).
  const schema = { type: 'object' as const, $predicate: CSS_PREDICATE_SOURCE }
  const aware = compilePredicateSchema(schema, opts)

  it('validates a nested styleSpec and rejects a structural break', () => {
    expect(
      aware({
        color: 'var(--fg)',
        '&:hover': { color: 'rebeccapurple' }, // nested rule → recurses
      }).valid
    ).toBe(true)

    // a selector slot holding a non-object is a structural error
    expect(aware({ '&:hover': 'should-be-a-nested-rule' }).valid).toBe(false)
    // an array where a value belongs
    expect(aware({ color: ['nope'] }).valid).toBe(false)
  })
})
