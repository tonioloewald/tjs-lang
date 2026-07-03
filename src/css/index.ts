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

export {
  CSS_COLOR_SOURCE,
  CSS_COLOR_ENTRIES,
  CSS_NAMED_COLORS,
} from './predicates'

type ColorValidators = Record<
  (typeof CSS_COLOR_ENTRIES)[number],
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

/**
 * Verify the CSS predicate source is predicate-safe (pure, synchronous,
 * ReDoS-clean). Always true for the shipped source — exposed so downstream tools
 * (and the drift test) can assert it, and so a consumer embedding the source in
 * a `$predicate` schema can re-check before trusting it.
 */
export function verifyCss(): PredicateVerifyResult {
  return verifyPredicate(CSS_COLOR_SOURCE)
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
