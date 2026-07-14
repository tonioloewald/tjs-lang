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
export declare const TJS_KEYWORDS: readonly ["test", "mock", "unsafe", "async", "await", "throw", "import", "export", "class", "extends", "super", "this", "new", "static", "typeof", "instanceof", "delete"];
/**
 * All TJS keywords
 */
export declare const KEYWORDS: readonly ["function", "return", "if", "else", "while", "for", "of", "in", "try", "catch", "finally", "let", "const", "true", "false", "null", "undefined", "test", "mock", "unsafe", "async", "await", "throw", "import", "export", "class", "extends", "super", "this", "new", "static", "typeof", "instanceof", "delete"];
/**
 * TJS forbidden keywords (fewer than AJS - TJS is less restrictive)
 * TJS allows: async/await, throw, import/export, class-related, and JS operators
 */
export declare const FORBIDDEN_KEYWORDS: readonly string[];
/**
 * Type constructors (same as AJS plus TJS-specific)
 */
export declare const TYPE_CONSTRUCTORS: readonly ["Date", "Set", "Map", "Array", "Object", "String", "Number", "Boolean", "RegExp", "Error", "JSON", "Math", "Schema", "expect", "assert"];
/**
 * TJS operators (same as AJS plus return type arrow)
 */
export declare const OPERATORS: readonly ["=", "+=", "-=", "*=", "/=", "%=", "==", "===", "!=", "!==", "<", ">", "<=", ">=", "+", "-", "*", "/", "%", "**", "&&", "||", "??", "!", "&", "|", "^", "~", "<<", ">>", ">>>", "?", ":", ".", "?.", "?.(", "?.[", "...", "->"];
/**
 * TJS-specific syntax patterns
 */
export declare const TJS_PATTERNS: {
    returnType: RegExp;
    unsafeFunction: RegExp;
    testBlock: RegExp;
    mockBlock: RegExp;
    unsafeBlock: RegExp;
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
