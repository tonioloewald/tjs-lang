/**
 * The CSS predicate library — canonical **source** form.
 *
 * Predicates are authored as source strings, not native functions, because the
 * source is the serializable, portable artifact: it feeds the verifier
 * (`verifyPredicate` — certifies pure/synchronous/ReDoS-clean), compiles to the
 * native fast path (`compilePredicate`), mines autocomplete (`suggest`), and
 * embeds into JSON Schema's `$predicate` keyword. This is the "computational
 * half" JSON Schema and TS structural types can't express — CSS is the torture
 * test (open value grammars, order-flexible shorthands, recursive structure).
 *
 * Style rules for anything added here (so it stays verifiable):
 *   - pure & synchronous: no IO, no `await`, no `new`, no loops (use
 *     `every`/`some`/`map`/recursion — fuel bounds them at function entry);
 *   - regexes must be ReDoS-clean (no nested unbounded quantifiers — the
 *     verifier rejects `(a+)+` and friends, so keep character classes flat);
 *   - compose with `||` and named predicates as callbacks (`toks.every(isX)`).
 *
 * Phase 1 ships the color grammar. Later phases add lengths/dimensions,
 * shorthands, and the recursive style-object structure — see TODO.md (#4).
 */

/**
 * The CSS Color Module Level 4 named colors (+ the CSS-wide `transparent` and
 * `currentcolor`), lower-cased. Data, kept in the source so the whole cluster
 * stays serializable as one artifact.
 */
export const CSS_NAMED_COLORS = [
  'transparent',
  'currentcolor',
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
]

/**
 * Color predicate cluster (source). Entry points: `isColor` (any CSS color) and
 * `isColorValue` (a color, tolerating a trailing `!important`). Regexes are
 * flat-class (ReDoS-clean). The functional-color forms (`hwb`/`lab`/`lch`/
 * `oklab`/`oklch`/`color`/`color-mix`) are matched by name + balanced parens
 * rather than validating their args — precise enough for validation, open
 * enough not to reject valid modern CSS.
 */
export const CSS_COLOR_SOURCE = `
var CSS_NAMED_COLORS = ${JSON.stringify(CSS_NAMED_COLORS)}

function isNamedColor(v) {
  return typeof v === 'string' && CSS_NAMED_COLORS.includes(v.toLowerCase())
}
function isHexColor(v) {
  return typeof v === 'string' && /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)
}
function isRgbColor(v) {
  return typeof v === 'string' && /^rgba?\\(\\s*[-0-9.,%\\s/]+\\)$/i.test(v)
}
function isHslColor(v) {
  return typeof v === 'string' && /^hsla?\\(\\s*[-0-9.,%\\s/adegr]+\\)$/i.test(v)
}
function isColorFn(v) {
  if (typeof v !== 'string' || !v.endsWith(')')) { return false }
  return v.startsWith('hwb(') || v.startsWith('lab(') || v.startsWith('lch(')
      || v.startsWith('oklab(') || v.startsWith('oklch(')
      || v.startsWith('color(') || v.startsWith('color-mix(')
}
function isColorVar(v) {
  return typeof v === 'string' && v.startsWith('var(--') && v.endsWith(')')
}
function isColor(v) {
  return isNamedColor(v) || isHexColor(v) || isRgbColor(v)
      || isHslColor(v) || isColorFn(v) || isColorVar(v)
}
function isColorValue(v) {
  if (typeof v !== 'string') { return false }
  var bare = v.replace(/\\s*!important\\s*$/i, '')
  return isColor(bare)
}
`

/** Entry predicates exported by the color cluster (for compile/suggest). */
export const CSS_COLOR_ENTRIES = [
  'isColor',
  'isColorValue',
  'isNamedColor',
  'isHexColor',
  'isRgbColor',
  'isHslColor',
] as const
