/**
 * The words that introduce a TJS construct — the single source of truth for them.
 *
 * ## Why this exists
 *
 * Highlighting is an assertion: a token painted as a keyword tells the reader "this is a
 * construct", and one left plain says "this is ordinary code". So a construct the editors do
 * not know about is not a cosmetic gap, it is the language lying about itself in the first
 * place anyone looks.
 *
 * `editors/vocabulary.test.ts` already checked that **every token the editors claim is real**.
 * It could not check the converse — that every real construct is claimed — because the corpus
 * was hand-written, so a new keyword could ship unhighlighted with the whole suite green.
 * `given` did exactly that.
 *
 * This list closes it from both ends:
 *
 *   - `vocabulary.test.ts` demands a proof ROW for every entry here — a snippet the compiler
 *     accepts — so a word cannot be registered on the strength of someone's belief that it
 *     works, and a word that stops working fails there.
 *   - each row in turn asserts the editors' own list carries the token, and that the BUILT
 *     grammar artifact does too. So registering a keyword and forgetting to highlight it
 *     fails by name, naming the keyword.
 *   - a source SCAN in the same file catches a construct that never reached this list at
 *     all — the hole a registry cannot close by itself.
 *
 * `editors/tjs-syntax.ts` mirrors this list rather than importing it, because declaration
 * emit for the editors is rooted at `editors/` and reaching into `src/` would scatter a stray
 * `.d.ts` through the source tree to save a line. The chain above makes the mirror enforced
 * rather than trusted, which is the property that actually matters.
 *
 * ## What belongs here
 *
 * TJS-ONLY construct introducers. Not JavaScript keywords (`class`, `new`, `async` — the base
 * grammar has those), not runtime functions (`Is`, `Timestamp` — those are TYPE_CONSTRUCTORS),
 * not type names (`int`, `float` — those are TYPE_NAMES). Each of those lists has its own
 * proof rows; this one is specifically the words that make a `.tjs` file a different language.
 *
 * Kept dependency-free on purpose: it is imported by the transforms, and a leaf stays cheap.
 */

/** `given x { 'a','b' { … } } else { … }` — the fixed dispatch construct. */
export const GIVEN = 'given'

/**
 * Constructs you can write where a statement is expected.
 *
 * Split out from the block members because the two have different obligations: BOTH must be
 * highlighted, but only these should be offered as a top-level completion. Requiring a
 * completion for `example` would force the editor to offer it where it is not legal, which
 * is the same class of wrong claim as leaving `given` unpainted — just in the other
 * direction.
 */
export const TJS_STATEMENT_KEYWORDS = [
  // Declaration forms.
  'Type',
  'Generic',
  'Enum',
  'Union',
  'FunctionPredicate',
  // Statement and block forms.
  'extend', // local class extensions
  'wasm', // inline WebAssembly
  'test', // inline tests
  'mock', // test setup blocks
  'unsafe', // exception-catching blocks
  GIVEN, // value dispatch without fallthrough
] as const satisfies readonly string[]

/**
 * Members of a `Type`/`Generic` block — legal only inside one.
 *
 * These have no top-level completion, which is correct but not complete: inside a `Type { }`
 * block the editor offers nothing at all. Contextual completion is tracked separately; the
 * point here is that the gap is NAMED rather than hidden behind a narrowed assertion.
 */
export const TJS_BLOCK_MEMBERS = [
  'predicate',
  'example',
  'description',
  'declaration',
] as const satisfies readonly string[]

/** Everything that must be highlighted, and must have a proof row. */
export const TJS_CONSTRUCT_KEYWORDS = [
  ...TJS_STATEMENT_KEYWORDS,
  ...TJS_BLOCK_MEMBERS,
] as const satisfies readonly string[]

export type TjsConstructKeyword = (typeof TJS_CONSTRUCT_KEYWORDS)[number]
