/**
 * CSS style-object structure (phase 4) — the recursive, open shape TS structural
 * types and JSON Schema can't express, and the `$predicate` schemas that carry
 * it. This is the thesis deliverable: a JSON-Schema node whose *structural* part
 * (`type: 'object'`) a naive validator checks, and whose `$predicate` a
 * predicate-aware validator runs to validate the whole recursive CSS structure —
 * progressive enhancement, one serializable artifact.
 *
 * The combined source concatenates the color + dimension leaf clusters and adds
 * the structure predicates, so `isStyleValue`/`isStyleObject` compose the leaves
 * directly. `isStyleObject` is LAST — the entry the `$predicate` schema runs.
 *
 * Value precision is intentionally two-tier (as in the PoC): the *structure* is
 * validated strictly (keys must be CSS properties or selectors/at-rules; a
 * property maps to a value, a selector to a nested rule), while a generic leaf
 * value falls back to "non-empty string or finite number" so a valid-but-
 * unmodelled value (a shorthand, a not-yet-covered property) is never rejected.
 * Per-property precision comes from the specific value schemas (`cssColorSchema`
 * etc.) and, later, property-aware validation (phase 3 shorthands).
 */
import type { PredicateSchema } from '../lang/predicate-schema'
import { CSS_COLOR_SOURCE } from './predicates'
import { CSS_DIMENSION_SOURCE } from './dimensions'

/** The recursive structure predicates, layered on the leaf clusters. */
const CSS_STRUCTURE_FRAGMENT = `
function isCssProperty(k) {
  // custom property (--foo) OR a standard/vendor-prefixed property (-webkit-…).
  return typeof k === 'string' && /^(--[a-z0-9-]+|-?[a-z][a-z0-9-]*)$/i.test(k)
}
function isSelectorOrAtRule(k) {
  if (typeof k !== 'string' || k.length === 0) { return false }
  if (k.startsWith('@')) { return true }
  return /[ :>~+.#&*\\[\\]]/.test(k)
}
function isStyleValue(val) {
  if (typeof val === 'number') { return isFinite(val) }
  if (typeof val !== 'string' || val.length === 0) { return false }
  // Precise recognition for known leaves; permissive tail keeps the whole
  // structure total (a shorthand / unmodelled value is a non-empty string).
  return isColorValue(val) || isDimension(val) || isGlobalKeyword(val)
      || isCssVar(val) || isCssCalc(val) || val.length > 0
}
function isStyleEntry(pair) {
  var k = pair[0]
  var val = pair[1]
  if (isSelectorOrAtRule(k)) { return isStyleObject(val) }
  if (isCssProperty(k)) { return isStyleValue(val) }
  return false
}
function isStyleObject(o) {
  if (typeof o !== 'object' || o === null) { return false }
  return Object.entries(o).every(isStyleEntry)
}
`

/**
 * The full CSS style predicate cluster: color + dimension leaves + recursive
 * structure. Entry = `isStyleObject` (last function). Serializable — this is
 * exactly what a `$predicate` schema carries.
 */
export const CSS_STYLE_SOURCE =
  CSS_COLOR_SOURCE + '\n' + CSS_DIMENSION_SOURCE + '\n' + CSS_STRUCTURE_FRAGMENT

/** Entry predicates exported by the style cluster (for compile/verify). */
export const CSS_STYLE_ENTRIES = [
  'isCssProperty',
  'isSelectorOrAtRule',
  'isStyleValue',
  'isStyleObject',
] as const

/**
 * A `$predicate` JSON-Schema for a CSS style object (à la a tosijs styleSpec):
 * naive validators check only `type: 'object'`; predicate-aware validators run
 * `isStyleObject`, validating the whole recursive structure (nested selectors,
 * property/value shapes). Progressive enhancement from one serializable schema.
 */
export function cssStyleSchema(): PredicateSchema {
  return {
    type: 'object',
    title: 'CSSStyleObject',
    description:
      'An open, recursive CSS style object (properties + nested selectors/at-rules).',
    $predicate: CSS_STYLE_SOURCE,
  }
}

/**
 * A `$predicate` schema for a single CSS **color** value (entry `isColorValue`,
 * so a trailing `!important` is tolerated). Naive validators check `type:
 * 'string'`; aware ones validate the color grammar.
 */
export function cssColorSchema(): PredicateSchema {
  return { type: 'string', title: 'CSSColor', $predicate: CSS_COLOR_SOURCE }
}

/**
 * A `$predicate` schema for a CSS **dimension** value (length/%/angle/time/
 * number; entry `isDimension`). No structural `type` — a dimension may be a
 * string (`10px`) or a number — so aware validators do all the work.
 */
export function cssDimensionSchema(): PredicateSchema {
  return { title: 'CSSDimension', $predicate: CSS_DIMENSION_SOURCE }
}
