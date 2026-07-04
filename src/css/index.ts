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
import { CSS_STYLE_SOURCE, CSS_STYLE_ENTRIES } from './style'
import { CSS_SHORTHAND_SOURCE, CSS_SHORTHAND_ENTRIES } from './shorthands'

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
export {
  CSS_STYLE_SOURCE,
  CSS_STYLE_ENTRIES,
  cssStyleSchema,
  cssColorSchema,
  cssDimensionSchema,
} from './style'
export {
  CSS_SHORTHAND_SOURCE,
  CSS_SHORTHAND_ENTRIES,
  cssAnimationSchema,
  cssTransitionSchema,
} from './shorthands'

/** Every predicate-source cluster the library ships, keyed for verify/drift. */
const CSS_SOURCES: Record<string, string> = {
  color: CSS_COLOR_SOURCE,
  dimension: CSS_DIMENSION_SOURCE,
  style: CSS_STYLE_SOURCE,
  shorthand: CSS_SHORTHAND_SOURCE,
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

type StyleValidators = Record<
  (typeof CSS_STYLE_ENTRIES)[number],
  (v: unknown) => boolean
>
let _style: StyleValidators | null = null
function styleValidators(): StyleValidators {
  if (!_style) {
    _style = compilePredicate(
      CSS_STYLE_SOURCE,
      CSS_STYLE_ENTRIES as unknown as string[]
    ) as StyleValidators
  }
  return _style
}

type ShorthandValidators = Record<
  (typeof CSS_SHORTHAND_ENTRIES)[number],
  (v: unknown) => boolean
>
let _shorthand: ShorthandValidators | null = null
function shorthandValidators(): ShorthandValidators {
  if (!_shorthand) {
    _shorthand = compilePredicate(
      CSS_SHORTHAND_SOURCE,
      CSS_SHORTHAND_ENTRIES as unknown as string[]
    ) as ShorthandValidators
  }
  return _shorthand
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

// --- recursive style-object structure (phase 4) -----------------------------

/**
 * Is `v` a valid CSS **style object** — an open, recursive map of CSS properties
 * to values and selectors/at-rules to nested style objects? Validates the whole
 * structure (keys are properties or selectors; property values are style values,
 * selector values are nested rules), recursively and fuel-bounded. This is the
 * shape TS/JSON-Schema can't express.
 */
export const isStyleObject = (v: unknown): boolean =>
  styleValidators().isStyleObject(v)
/** Is `v` a valid leaf CSS value (a known color/dimension/keyword, else a non-empty string / finite number)? */
export const isStyleValue = (v: unknown): boolean =>
  styleValidators().isStyleValue(v)
/** Is `k` a CSS property name (`color`, `--custom`, `-webkit-foo`)? */
export const isCssProperty = (k: unknown): boolean =>
  styleValidators().isCssProperty(k)
/** Is `k` a selector or at-rule key (nests a rule) rather than a property? */
export const isSelectorOrAtRule = (k: unknown): boolean =>
  styleValidators().isSelectorOrAtRule(k)

// --- order-flexible shorthands (phase 3) ------------------------------------

/** Is `v` a valid CSS `animation` shorthand (comma-separated, order-free tokens)? */
export const isAnimation = (v: unknown): boolean =>
  shorthandValidators().isAnimation(v)
/** Is `v` a valid CSS `transition` shorthand (comma-separated layers)? */
export const isTransition = (v: unknown): boolean =>
  shorthandValidators().isTransition(v)
/** Is `v` a CSS `<easing-function>` (keyword, `cubic-bezier(…)`, `steps(…)`, `linear(…)`)? */
export const isTimingFunction = (v: unknown): boolean =>
  shorthandValidators().isTimingFunction(v)

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
