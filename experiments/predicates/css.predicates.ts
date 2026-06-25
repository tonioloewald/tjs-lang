/**
 * The CSS torture set — predicates for the exact cases where TS structural
 * types and JSON Schema cave to `string`/`any`:
 *   - open value grammars: var(), calc(), !important
 *   - order-flexible shorthands: the `animation` family (tokenize + classify)
 *   - open recursive structure: nested selectors / keyframes (recurse)
 *
 * Written in named-composition style — no inline arrows, no IO, no async —
 * so it reads as "synchronous AJS" and verifies predicate-safe. `||` composition
 * and `.every(namedPredicate)` are natural here because predicates run as native
 * JS (the verified fast path), not through the sandboxed VM interpreter.
 */
export const CSS_PREDICATE_SOURCE = String.raw`
// ---- open value escapes (the things that explode TS unions) ----
function isVar(v)  { return typeof v == 'string' && v.startsWith('var(--') && v.endsWith(')') }
function isCalc(v) { return typeof v == 'string' && v.startsWith('calc(') && v.endsWith(')') }

// ---- color leaves ----
var NAMED_COLORS = ['transparent','currentcolor','red','green','blue','black','white','rebeccapurple']
function isNamedColor(v) { return typeof v == 'string' && NAMED_COLORS.includes(v.toLowerCase()) }
function isHexColor(v)   { return typeof v == 'string' && /^#[0-9a-f]{3,8}$/i.test(v) }
function isRgb(v)        { return typeof v == 'string' && /^rgba?\([0-9\s,.%\/]+\)$/i.test(v) }

// ---- composition: a color is ANY of the above (|| doesn't explode like |) ----
function isColor(v) {
  return isNamedColor(v) || isHexColor(v) || isRgb(v) || isVar(v) || isCalc(v)
}

// !important — strip-and-recurse. An infinite union in TS; one composed predicate here.
function isColorValue(v) {
  if (typeof v != 'string') { return false }
  var bare = v.replace(/\s*!important\s*$/i, '')
  return isColor(bare)
}

// ---- the animation shorthand: order-flexible token grammar ----
var TIMING = ['linear','ease','ease-in','ease-out','ease-in-out','step-start','step-end']
var DIRECTION = ['normal','reverse','alternate','alternate-reverse']
var FILLMODE = ['none','forwards','backwards','both']
var PLAYSTATE = ['running','paused']
function isTime(t)        { return /^-?[0-9.]+m?s$/.test(t) }
function isIterations(t)  { return t == 'infinite' || /^[0-9.]+$/.test(t) }
function isCubicBezier(t) { return typeof t == 'string' && t.startsWith('cubic-bezier(') && t.endsWith(')') }
function isSteps(t)       { return typeof t == 'string' && t.startsWith('steps(') && t.endsWith(')') }
function isAnimName(t)    { return /^-?[a-z_][a-z0-9_-]*$/i.test(t) }
function isAnimToken(t) {
  return isTime(t) || isIterations(t)
      || TIMING.includes(t) || DIRECTION.includes(t) || FILLMODE.includes(t) || PLAYSTATE.includes(t)
      || isCubicBezier(t) || isSteps(t) || isVar(t) || isCalc(t) || isAnimName(t)
}
function isAnimation(v) {
  if (typeof v != 'string') { return false }
  var toks = v.trim().split(/\s+/)
  return toks.every(isAnimToken)   // named predicate as callback — natural in native JS
}

// ---- generic value (per-property; permissive fallback keeps the rest precise) ----
function isStyleValue(val) {
  if (typeof val == 'number') { return true }
  if (typeof val != 'string') { return false }
  return isColorValue(val) || isAnimation(val) || isVar(val) || isCalc(val) || val.length > 0
}

// ---- the open recursive structure: nested selectors / keyframes ----
function isCssProperty(k)      { return /^-?[a-z][a-z0-9-]*$/i.test(k) }
function isSelectorOrAtRule(k) { return /[:>\s&.#\[]/.test(k) || k.startsWith('@') }
function isStyleEntry(pair) {
  var k = pair[0]
  var val = pair[1]
  if (isSelectorOrAtRule(k)) { return isStyleObject(val) }   // recurse into nested rule
  if (isCssProperty(k))      { return isStyleValue(val) }
  return false
}
function isStyleObject(o) {
  if (typeof o != 'object' || o == null) { return false }
  return Object.entries(o).every(isStyleEntry)   // recursion via named callback, no arrow/closure
}
`
