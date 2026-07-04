/**
 * CSS order-flexible shorthands (phase 3) — the second torture case from the
 * PoC: a shorthand like `animation` or `transition` is a comma-separated list of
 * layers, each a whitespace-separated bag of tokens whose *order is free*
 * (`3s ease-in 1s infinite alternate slidein` ≡ any permutation). TS unions and
 * JSON Schema can't express "a set of tokens, each classifiable, in any order";
 * a predicate tokenizes and classifies (`toks.every(isAnimToken)`).
 *
 * Built on the dimension leaf cluster (for `isTime`/`isCssVar`/`isCssCalc`).
 * Same rules as the other clusters: pure, synchronous, ReDoS-clean (the split
 * regexes are single-quantifier `\s+` / `,`; classifier regexes are flat).
 */
import type { PredicateSchema } from '../lang/predicate-schema'
import { CSS_DIMENSION_SOURCE } from './dimensions'

/**
 * The shorthand classifiers alone (no leaf cluster prepended). Exported so the
 * combined style cluster (`style.ts`) can compose them for property-aware
 * validation without re-including the dimension source.
 */
export const CSS_SHORTHAND_FRAGMENT = `
var ANIM_TIMING = ['linear','ease','ease-in','ease-out','ease-in-out','step-start','step-end']
var ANIM_DIRECTION = ['normal','reverse','alternate','alternate-reverse']
var ANIM_FILLMODE = ['none','forwards','backwards','both']
var ANIM_PLAYSTATE = ['running','paused']

function isTimingFunction(t) {
  if (typeof t !== 'string') { return false }
  if (ANIM_TIMING.includes(t)) { return true }
  return (t.startsWith('cubic-bezier(') || t.startsWith('steps(') || t.startsWith('linear(')) && t.endsWith(')')
}
function isIterationCount(t) {
  return t === 'infinite' || (typeof t === 'string' && /^[0-9]*\\.?[0-9]+$/.test(t))
}
function isAnimName(t) {
  // any custom-ident (also matches keywords, which classify earlier anyway)
  return typeof t === 'string' && /^-?[a-z_][a-z0-9_-]*$/i.test(t)
}
// Tokenize a whole shorthand value. A function token like cubic-bezier(a, b) is
// kept whole (arg spaces/commas must not split it); top-level commas (layer
// separators) and whitespace are delimiters, so they're dropped. Loops are
// banned in predicates, so this is one .match with a FLAT (ReDoS-clean) regex —
// note a paren-aware comma *splitter* would be a nested quantifier the verifier
// rejects, so we tokenize instead and guard empty layers separately.
function cssTokens(v) {
  return typeof v === 'string' ? v.match(/[a-z-]+\\([^)]*\\)|[^\\s,]+/gi) : null
}
// Reject leading/trailing/double commas (empty layers). Flat, ReDoS-clean.
function hasEmptyLayer(v) {
  return typeof v === 'string' && /^\\s*,|,\\s*$|,\\s*,/.test(v)
}
function isAnimToken(t) {
  return isTime(t) || isIterationCount(t) || isTimingFunction(t)
      || ANIM_DIRECTION.includes(t) || ANIM_FILLMODE.includes(t) || ANIM_PLAYSTATE.includes(t)
      || isCssVar(t) || isCssCalc(t) || isAnimName(t)
}
function isAnimation(v) {
  if (typeof v !== 'string' || v.length === 0 || hasEmptyLayer(v)) { return false }
  var toks = cssTokens(v)
  return toks !== null && toks.length > 0 && toks.every(isAnimToken)
}

function isTransitionProperty(t) {
  return t === 'all' || t === 'none' || isAnimName(t)
}
function isTransitionToken(t) {
  return isTime(t) || isTimingFunction(t) || isCssVar(t) || isCssCalc(t) || isTransitionProperty(t)
}
function isTransition(v) {
  if (typeof v !== 'string' || v.length === 0 || hasEmptyLayer(v)) { return false }
  var toks = cssTokens(v)
  return toks !== null && toks.length > 0 && toks.every(isTransitionToken)
}
`

/**
 * Shorthand predicate cluster (source) = dimension leaves + the shorthand
 * classifiers. Entry predicates: `isAnimation`, `isTransition` (each accepts a
 * comma-separated list of order-free token layers).
 */
export const CSS_SHORTHAND_SOURCE =
  CSS_DIMENSION_SOURCE + '\n' + CSS_SHORTHAND_FRAGMENT

/** Entry predicates exported by the shorthand cluster (for compile/verify). */
export const CSS_SHORTHAND_ENTRIES = [
  'isTimingFunction',
  'isAnimation',
  'isTransition',
] as const

/**
 * A `$predicate` schema for a CSS `animation` shorthand value (entry
 * `isAnimation`). Uses the full cluster source so the entry (last function) is
 * `isTransition` — so pin the entry via a wrapper source ending in `isAnimation`.
 */
function schemaFor(entry: string): PredicateSchema {
  // The `$predicate` entry is the LAST function; append a thin alias so `entry`
  // is last regardless of its position in the cluster.
  return {
    type: 'string',
    $predicate: `${CSS_SHORTHAND_SOURCE}\nfunction __entry(v) { return ${entry}(v) }`,
  }
}

/** `$predicate` schema for a CSS `animation` shorthand value. */
export function cssAnimationSchema(): PredicateSchema {
  return { ...schemaFor('isAnimation'), title: 'CSSAnimation' }
}

/** `$predicate` schema for a CSS `transition` shorthand value. */
export function cssTransitionSchema(): PredicateSchema {
  return { ...schemaFor('isTransition'), title: 'CSSTransition' }
}
