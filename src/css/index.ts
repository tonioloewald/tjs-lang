/**
 * `tjs-lang/css` — CSS validation built from verified-safe predicates.
 *
 * The "computational half" of a CSS schema: precise, total validators for the
 * open value grammars TS/JSON-Schema cave to `string` on (colors here in
 * phase 1; lengths, shorthands and the recursive style-object structure land in
 * later phases — see TODO.md #4). Every validator is compiled from a
 * predicate-safe source cluster (`./predicates`), so it is pure, synchronous,
 * fuel-bounded, and ReDoS-clean — safe to run on untrusted input.
 *
 * Autocomplete rides the same source: `suggestColor()` mines the named-color set
 * and the open functional stubs (`var(--`, `color-mix(`, …), validating mined
 * values through the compiled predicate so completions are guaranteed valid.
 */
import {
  compilePredicate,
  verifyPredicate,
  suggest,
  type PredicateVerifyResult,
  type Suggestion,
} from '../lang/predicate'
import {
  CSS_COLOR_SOURCE,
  CSS_COLOR_ENTRIES,
  CSS_NAMED_COLORS,
} from './predicates'
import {
  CSS_DIMENSION_SOURCE,
  CSS_DIMENSION_ENTRIES,
  CSS_LENGTH_UNITS,
  CSS_GLOBAL_KEYWORDS,
} from './dimensions'

export {
  CSS_COLOR_SOURCE,
  CSS_COLOR_ENTRIES,
  CSS_NAMED_COLORS,
} from './predicates'
export {
  CSS_DIMENSION_SOURCE,
  CSS_DIMENSION_ENTRIES,
  CSS_LENGTH_UNITS,
  CSS_GLOBAL_KEYWORDS,
} from './dimensions'

/** Every predicate-source cluster the library ships, keyed for verify/drift. */
const CSS_SOURCES: Record<string, string> = {
  color: CSS_COLOR_SOURCE,
  dimension: CSS_DIMENSION_SOURCE,
}

type ColorValidators = Record<
  (typeof CSS_COLOR_ENTRIES)[number],
  (v: unknown) => boolean
>
type DimensionValidators = Record<
  (typeof CSS_DIMENSION_ENTRIES)[number],
  (v: unknown) => boolean
>

// Compiled once, on first use (verification + `new Function` are one-time).
let _color: ColorValidators | null = null
function colorValidators(): ColorValidators {
  if (!_color) {
    _color = compilePredicate(
      CSS_COLOR_SOURCE,
      CSS_COLOR_ENTRIES as unknown as string[]
    ) as ColorValidators
  }
  return _color
}

let _dimension: DimensionValidators | null = null
function dimensionValidators(): DimensionValidators {
  if (!_dimension) {
    _dimension = compilePredicate(
      CSS_DIMENSION_SOURCE,
      CSS_DIMENSION_ENTRIES as unknown as string[]
    ) as DimensionValidators
  }
  return _dimension
}

/** Is `v` a valid CSS color (named, hex, rgb/hsl, modern fn, or `var(--…)`)? */
export const isColor = (v: unknown): boolean => colorValidators().isColor(v)
/** Like {@link isColor}, but tolerates a trailing `!important`. */
export const isColorValue = (v: unknown): boolean =>
  colorValidators().isColorValue(v)
/** Is `v` a CSS named color (incl. `transparent`/`currentcolor`)? */
export const isNamedColor = (v: unknown): boolean =>
  colorValidators().isNamedColor(v)
/** Is `v` a CSS hex color (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`)? */
export const isHexColor = (v: unknown): boolean =>
  colorValidators().isHexColor(v)

// --- dimensions / numbers / keywords (phase 2) ------------------------------

/** Is `v` a CSS `<length>` (unit'd, unitless `0`, or `var()`/`calc()`)? */
export const isLength = (v: unknown): boolean =>
  dimensionValidators().isLength(v)
/** Is `v` a CSS `<percentage>` (`50%`)? */
export const isPercentage = (v: unknown): boolean =>
  dimensionValidators().isPercentage(v)
/** Is `v` a CSS `<number>` (numeric, or a numeric string)? */
export const isNumber = (v: unknown): boolean =>
  dimensionValidators().isNumber(v)
/** Is `v` a CSS `<integer>`? */
export const isInteger = (v: unknown): boolean =>
  dimensionValidators().isInteger(v)
/** Is `v` a CSS `<angle>` (`45deg`, `1turn`, `1.5rad`, `100grad`)? */
export const isAngle = (v: unknown): boolean => dimensionValidators().isAngle(v)
/** Is `v` a CSS `<time>` (`200ms`, `1s`)? */
export const isTime = (v: unknown): boolean => dimensionValidators().isTime(v)
/** Is `v` any CSS dimension/number (length, %, angle, time, resolution, number)? */
export const isDimension = (v: unknown): boolean =>
  dimensionValidators().isDimension(v)
/** Is `v` a CSS-wide keyword (`inherit`/`initial`/`unset`/`revert`/`revert-layer`)? */
export const isGlobalKeyword = (v: unknown): boolean =>
  dimensionValidators().isGlobalKeyword(v)

/**
 * Verify every CSS predicate-source cluster is predicate-safe (pure,
 * synchronous, ReDoS-clean). Returns the combined result (safe iff all clusters
 * are; diagnostics carry the cluster name). Always safe for the shipped source —
 * exposed so downstream tools (and the drift test) can assert it, and so a
 * consumer embedding a source in a `$predicate` schema can re-check before
 * trusting it.
 */
export function verifyCss(): PredicateVerifyResult {
  const predicates: string[] = []
  const diagnostics: PredicateVerifyResult['diagnostics'] = []
  for (const [name, source] of Object.entries(CSS_SOURCES)) {
    const r = verifyPredicate(source)
    predicates.push(...r.predicates)
    for (const d of r.diagnostics)
      diagnostics.push({ ...d, predicate: `${name}:${d.predicate}` })
  }
  return { safe: diagnostics.length === 0, predicates, diagnostics }
}

/**
 * Autocomplete candidates for a CSS color value. Returns concrete named colors
 * (validated through the compiled predicate) plus open-ended stubs mined from
 * the functional forms (`var(--`, `color-mix(`, `oklch(`, …). Prefix-filtered.
 */
export function suggestColor(prefix = '', limit = 50): Suggestion[] {
  return suggest(CSS_COLOR_SOURCE, {
    entry: 'isColor',
    prefix,
    limit,
  })
}
