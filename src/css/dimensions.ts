/**
 * CSS dimension / numeric value grammar (phase 2) — the other big family of leaf
 * values: lengths, percentages, angles, times, resolutions, plain numbers, and
 * the CSS-wide global keywords. Same rules as the color cluster: pure,
 * synchronous, ReDoS-clean (flat character classes / bounded alternation only),
 * with `var(--…)`/`calc(…)` as the open escapes.
 *
 * The numeric core `[+-]?(\d*\.\d+|\d+)` is a bounded alternation (each branch a
 * single quantifier — no nesting), so it passes the verifier's ReDoS lint.
 */

/** Absolute + relative + container + viewport length units (CSS Values 4). */
export const CSS_LENGTH_UNITS = [
  // font-relative
  'cap',
  'ch',
  'em',
  'ex',
  'ic',
  'lh',
  'rcap',
  'rch',
  'rem',
  'rex',
  'ric',
  'rlh',
  // viewport
  'vw',
  'vh',
  'vi',
  'vb',
  'vmin',
  'vmax',
  'svw',
  'svh',
  'svi',
  'svb',
  'svmin',
  'svmax',
  'lvw',
  'lvh',
  'lvi',
  'lvb',
  'lvmin',
  'lvmax',
  'dvw',
  'dvh',
  'dvi',
  'dvb',
  'dvmin',
  'dvmax',
  // container query
  'cqw',
  'cqh',
  'cqi',
  'cqb',
  'cqmin',
  'cqmax',
  // absolute
  'px',
  'cm',
  'mm',
  'q',
  'in',
  'pt',
  'pc',
]

/** CSS-wide keywords valid on any property. */
export const CSS_GLOBAL_KEYWORDS = [
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
]

/**
 * Dimension predicate cluster (source). Entry points cover each numeric family
 * plus `isDimension` (any of them) and `isGlobalKeyword`. Units are ordered
 * longest-first inside the alternation so e.g. `rem` isn't shadowed by `em`
 * (belt-and-suspenders — the `$` anchor already forces a full match).
 */
export const CSS_DIMENSION_SOURCE = `
var CSS_LENGTH_UNITS = ${JSON.stringify(
  // longest-first for safe alternation ordering
  [...CSS_LENGTH_UNITS].sort((a, b) => b.length - a.length)
)}
var CSS_GLOBAL_KEYWORDS = ${JSON.stringify(CSS_GLOBAL_KEYWORDS)}

function isCssVar(v) {
  return typeof v === 'string' && v.startsWith('var(--') && v.endsWith(')')
}
function isCssCalc(v) {
  return typeof v === 'string' && v.startsWith('calc(') && v.endsWith(')')
}
function isNumber(v) {
  if (typeof v === 'number') { return isFinite(v) }
  return typeof v === 'string' && /^[+-]?(\\d*\\.\\d+|\\d+)$/.test(v)
}
function isInteger(v) {
  if (typeof v === 'number') { return Number.isInteger(v) }
  return typeof v === 'string' && /^[+-]?\\d+$/.test(v)
}
function isPercentage(v) {
  return typeof v === 'string' && /^[+-]?(\\d*\\.\\d+|\\d+)%$/.test(v)
}
function isLength(v) {
  if (v === 0 || v === '0') { return true }
  if (isCssVar(v) || isCssCalc(v)) { return true }
  if (typeof v !== 'string') { return false }
  var m = v.match(/^[+-]?(\\d*\\.\\d+|\\d+)([a-z%]+)$/i)
  if (m === null) { return false }
  return CSS_LENGTH_UNITS.includes(m[2].toLowerCase())
}
function isAngle(v) {
  return typeof v === 'string' && /^[+-]?(\\d*\\.\\d+|\\d+)(deg|grad|rad|turn)$/i.test(v)
}
function isTime(v) {
  return typeof v === 'string' && /^[+-]?(\\d*\\.\\d+|\\d+)(ms|s)$/i.test(v)
}
function isResolution(v) {
  return typeof v === 'string' && /^[+-]?(\\d*\\.\\d+|\\d+)(dpi|dpcm|dppx|x)$/i.test(v)
}
function isGlobalKeyword(v) {
  return typeof v === 'string' && CSS_GLOBAL_KEYWORDS.includes(v.toLowerCase())
}
function isDimension(v) {
  return isLength(v) || isPercentage(v) || isAngle(v)
      || isTime(v) || isResolution(v) || isNumber(v)
      || isCssVar(v) || isCssCalc(v)
}
`

/** Entry predicates exported by the dimension cluster (for compile/suggest). */
export const CSS_DIMENSION_ENTRIES = [
  'isNumber',
  'isInteger',
  'isPercentage',
  'isLength',
  'isAngle',
  'isTime',
  'isResolution',
  'isGlobalKeyword',
  'isDimension',
] as const
