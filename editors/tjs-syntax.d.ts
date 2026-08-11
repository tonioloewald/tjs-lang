/**
 * TJS (Typed JavaScript) Syntax Definitions
 *
 * Extends AsyncJS syntax with:
 * - test/mock/unsafe keywords
 * - Return type annotation (-> Type)
 * - Markdown in non-JSDoc comments
 */
/**
 * TJS-specific keywords (in addition to AJS)
 */
export declare const TJS_KEYWORDS: readonly ["Type", "Generic", "Enum", "Union", "FunctionPredicate", "predicate", "example", "description", "declaration", "extend", "wasm", "test", "mock", "unsafe", "async", "await", "throw", "import", "export", "class", "extends", "super", "this", "new", "static", "typeof", "instanceof", "delete"];
/**
 * All TJS keywords
 */
export declare const KEYWORDS: readonly ["function", "return", "if", "else", "while", "for", "of", "in", "try", "catch", "finally", "let", "const", "true", "false", "null", "undefined", "Type", "Generic", "Enum", "Union", "FunctionPredicate", "predicate", "example", "description", "declaration", "extend", "wasm", "test", "mock", "unsafe", "async", "await", "throw", "import", "export", "class", "extends", "super", "this", "new", "static", "typeof", "instanceof", "delete"];
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
export declare const FORBIDDEN_KEYWORDS: readonly ["var", "eval"];
/**
 * Type constructors (same as AJS plus TJS-specific)
 */
export declare const TYPE_CONSTRUCTORS: readonly ["Date", "Set", "Map", "Array", "Object", "String", "Number", "Boolean", "RegExp", "Error", "JSON", "Math", "Schema", "expect", "assert", "Timestamp", "Is", "IsNot", "Eq", "NotEq", "TypeOf"];
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
export declare const TYPE_NAMES: readonly ["int", "unsigned", "uint", "float", "number", "string", "boolean", "bigint", "object", "any", "unknown", "void", "never", "null", "undefined"];
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
export declare const OPERATORS: readonly ["=", "+=", "-=", "*=", "/=", "%=", "==", "===", "!=", "!==", "<", ">", "<=", ">=", "+", "-", "*", "/", "%", "**", "&&", "||", "??", "!", "&", "|", "^", "~", "<<", ">>", ">>>", "?", ":", ".", "?.", "?.(", "?.[", "..."];
/**
 * TJS-specific syntax patterns
 */
export declare const TJS_PATTERNS: {
    returnType: RegExp;
    unsafeFunction: RegExp;
    testBlock: RegExp;
    mockBlock: RegExp;
    unsafeExpression: RegExp;
    colonType: RegExp;
};
/**
 * Markdown elements to highlight in comments
 * (for non-JSDoc block comments)
 */
export declare const MARKDOWN_PATTERNS: {
    header: RegExp;
    bold: RegExp;
    italic: RegExp;
    inlineCode: RegExp;
    link: RegExp;
    listItem: RegExp;
};
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
