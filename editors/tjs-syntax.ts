/**
 * TJS (Typed JavaScript) Syntax Definitions
 *
 * Extends AsyncJS syntax with:
 * - test/mock/unsafe keywords
 * - Return type annotation (-> Type)
 * - Markdown in non-JSDoc comments
 */

import {
  KEYWORDS as AJS_KEYWORDS,
  FORBIDDEN_KEYWORDS as AJS_FORBIDDEN,
  TYPE_CONSTRUCTORS as AJS_TYPE_CONSTRUCTORS,
  OPERATORS as AJS_OPERATORS,
} from './ajs-syntax'

/**
 * TJS-specific keywords (in addition to AJS)
 */
export const TJS_KEYWORDS = [
  // These MIRROR `src/lang/keywords.ts` (TJS_CONSTRUCT_KEYWORDS), and the mirror is enforced
  // rather than trusted: `vocabulary.test.ts` requires every registered construct to have a
  // proof row, and every row asserts both that the compiler accepts it and that this list
  // carries it. So a keyword added to the language and not to this list fails by name.
  //
  // Not imported directly because `tsconfig.editors.json` roots declaration emit at
  // `editors/`, and reaching into `src/` would scatter a stray `.d.ts` into the source tree
  // to save a line. The test chain gives the same guarantee without that.
  //
  // Their absence meant a `.tjs` file got no highlighting for the constructs that make it
  // TJS — the lists described AJS plus a handful of JS keywords. That was fixed once, and
  // then `given` shipped unhighlighted a release later, because a hand-written list is only
  // as current as the last person who remembered it. Now it fails.
  'Type',
  'Generic',
  'Enum',
  'Union',
  'FunctionPredicate',
  'predicate',
  'example',
  'description',
  'declaration',
  'extend', // local class extensions
  'wasm', // inline WebAssembly
  'test', // inline tests
  'mock', // test setup blocks
  'unsafe', // exception-catching blocks
  'given', // value dispatch without fallthrough
  // JavaScript keywords TJS also wants painted (AJS, being a sandbox, omits them).
  'async', // TJS allows async (unlike sandboxed AJS)
  'await',
  'throw',
  'import',
  'export',
  // Class support
  'class',
  'extends',
  'super',
  'this',
  'new',
  'static',
  // JS operators
  'typeof',
  'instanceof',
  'delete',
] as const

/**
 * All TJS keywords
 */
export const KEYWORDS = [...AJS_KEYWORDS, ...TJS_KEYWORDS] as const

/**
 * Constructs a `.tjs` file actually REJECTS.
 *
 * This used to be derived by subtracting a 14-item allow-list from AJS's 42-item forbidden
 * list, which encoded the AJS sandbox's restrictions rather than TJS's. Measured against
 * the real compiler: **41 of those 42 tokens are legal TJS.** `switch`/`case`/`default`
 * are ordinary control flow, and `type`/`module`/`is`/`as`/`keyof`/`never` are ordinary
 * identifiers — all painted red in the live playground and in every consumer of
 * `tjs-lang/editors/codemirror`. One shipped example (`schema-validation.md`) got three
 * false squiggles on the property name `type`.
 *
 * So the list is now built from what the compiler rejects, and
 * `editors/forbidden-keywords.test.ts` drives every entry through `tjs()` to prove it —
 * and every token REMOVED from the old list to prove those compile. A syntax highlighter
 * that disagrees with the compiler teaches the language wrongly, and it is the first
 * thing a new user sees.
 *
 * AJS keeps its own, much longer list: it is a sandbox, and its restrictions are real.
 */
export const FORBIDDEN_KEYWORDS = [
  // Rejected outright — `unsafe var x = 1` is the escape.
  'var',
  // Rejected as a CALL (`eval(...)`). Flagged as a token because that is the only usage
  // anyone writes, and the remedy — `Eval()` from the runtime, or `unsafe eval(src)` —
  // is worth surfacing at the site.
  'eval',
] as const satisfies readonly string[]

/**
 * Type constructors (same as AJS plus TJS-specific)
 */
export const TYPE_CONSTRUCTORS = [
  ...AJS_TYPE_CONSTRUCTORS,
  'expect', // test assertions
  'assert', // simple assertions
  // TJS runtime functions. `Is`/`IsNot` have an INFIX spelling too (`a Is b`), which the
  // compiler rewrites to the call form — both are real.
  'Timestamp', // the `Date` replacement: epoch ms, immutable
  // `fromTS` EMITS this for every TS literal type, so it appears in converted files nobody
  // hand-wrote — the most-read TJS there is, and it was in no list.
  'Exactly',
  'Is',
  'IsNot',
  'Eq',
  'NotEq',
  'TypeOf',
] as const

/**
 * Type NAMES usable in an annotation (`n: int`).
 *
 * TJS's whole numeric-narrowing story lives here — `int`, `unsigned`, `float` — and none
 * of it was highlighted, so the distinctive part of an annotation looked like an ordinary
 * identifier.
 *
 * Duplicated from the compiler's `TS_TYPE_NAMES` rather than imported, because the editor
 * bundles must not drag in the parser. `editors/vocabulary.test.ts` drives every entry
 * through the real compiler, so the duplication cannot drift silently.
 */
export const TYPE_NAMES = [
  'int',
  'unsigned',
  'uint',
  'float',
  'number',
  'string',
  'boolean',
  'bigint',
  'object',
  'any',
  'unknown',
  'void',
  'never',
  'null',
  'undefined',
] as const

/**
 * TJS operators.
 *
 * NOT `->`. That was a return-type arrow the parser never implemented — the compiler
 * rejects `function f(n: 0) -> 0 {}` outright — yet every generated grammar highlighted it
 * as a valid operator, in the playground and in every consumer of
 * `tjs-lang/editors/codemirror`. An editor that paints an abandoned form as legitimate
 * teaches it, which is worse than not highlighting at all: the reader trusts the colour.
 *
 * The same defect class the differences harness was built for — `docs/tjs-vs-typescript.md`
 * lists "an editor completion suggesting a form the compiler rejects" among the six false
 * claims one review cycle turned up. This was another live one.
 *
 * Guarded by `editors/grammars.test.ts`.
 */
export const OPERATORS = [...AJS_OPERATORS] as const

/**
 * TJS-specific syntax patterns
 */
export const TJS_PATTERNS = {
  // Return type annotation: `): Type`, with the safety-marked spellings `):!` and `):?`.
  //
  // This matched `) -> Type` — the arrow the parser never implemented — so return types
  // were not highlighted at all while an abandoned form was. Same defect the grammar
  // builder had; fixing one did not fix the other, which is why both are now covered by
  // `editors/vocabulary.test.ts`.
  returnType: /\)\s*:[!?]?\s*(\{[^}]+\}|'[^']*'|"[^"]*"|\[[^\]]*\]|\w+)/,

  // Unsafe function marker: function name(! or function name(!
  unsafeFunction: /function\s+(\w+)\s*\(\s*!/,

  // Test block. BOTH spellings are real: `test 'description' { … }` is the canonical one
  // used throughout the docs and examples, and `test('description') { … }` also compiles.
  // Only the parenthesised form was matched, so every example in the repo went
  // unhighlighted.
  testBlock: /test\s*(?:\(\s*)?(['"`])([^'"`]*)\1\s*\)?\s*\{/,

  // Mock block: mock { ... }
  mockBlock: /mock\s*\{/,

  // `unsafe <expression>` — an expression PREFIX, not a block. There is no `unsafe { }`
  // form; the block exempts nothing. Matched on the same line only, mirroring the
  // compiler's own scanner (see src/strip-comments.ts findUnsafeSpans): across a newline
  // `unsafe` is an ordinary identifier under ASI, and treating it as a marker would
  // highlight legal JavaScript as a language construct.
  unsafeExpression: /\bunsafe[ \t]+(?!(?:instanceof|in|of)\b)(?=[A-Za-z_$])/,

  // Colon type annotation: name: 'type' or name: 0
  colonType:
    /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*('[^']*'|"[^"]*"|\d+|\{[^}]*\}|\[[^\]]*\]|true|false|null)/,
}

/**
 * Markdown elements to highlight in comments
 * (for non-JSDoc block comments)
 */
export const MARKDOWN_PATTERNS = {
  // Headers: # ## ###
  header: /^(\s*)(#{1,6})\s+(.*)$/m,

  // Bold: **text** or __text__
  bold: /(\*\*|__)([^*_]+)\1/,

  // Italic: *text* or _text_
  italic: /(\*|_)([^*_]+)\1/,

  // Code: `code`
  inlineCode: /`([^`]+)`/,

  // Links: [text](url)
  link: /\[([^\]]+)\]\(([^)]+)\)/,

  // Lists: - item or * item or 1. item
  listItem: /^(\s*)([*\-]|\d+\.)\s+/m,
}

/**
 * Questions/Notes:
 *
 * Q1: Should markdown highlighting be in all comments or just /* ... *\/?
 *     Current plan: Only non-JSDoc block comments (/* without **)
 *
 * Q2: How deep should markdown parsing go?
 *     Current: Basic patterns (headers, bold, italic, code, links)
 *     Could add: code blocks, tables, etc.
 *
 * Q3: Should we generate separate TJS grammar files or extend AJS?
 *     Current plan: Extend - TJS is a superset
 */
