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
  'test', // inline tests
  'mock', // test setup blocks
  'unsafe', // exception-catching blocks
  'async', // TJS allows async (unlike sandboxed AJS)
  'await',
] as const

/**
 * All TJS keywords
 */
export const KEYWORDS = [...AJS_KEYWORDS, ...TJS_KEYWORDS] as const

/**
 * TJS forbidden keywords (fewer than AJS - TJS is less restrictive)
 * TJS allows: async/await, throw, import/export
 */
export const FORBIDDEN_KEYWORDS = AJS_FORBIDDEN.filter(
  (k) => !['async', 'await', 'throw', 'import', 'export'].includes(k)
) as readonly string[]

/**
 * Type constructors (same as AJS plus TJS-specific)
 */
export const TYPE_CONSTRUCTORS = [
  ...AJS_TYPE_CONSTRUCTORS,
  'expect', // test assertions
  'assert', // simple assertions
] as const

/**
 * TJS operators (same as AJS plus return type arrow)
 */
export const OPERATORS = [...AJS_OPERATORS, '->'] as const

/**
 * TJS-specific syntax patterns
 */
export const TJS_PATTERNS = {
  // Return type annotation: -> Type
  returnType: /\)\s*->\s*(\{[^}]+\}|'[^']*'|"[^"]*"|\[[^\]]*\]|\w+)/,

  // Unsafe function marker: function name(! or function name(!
  unsafeFunction: /function\s+(\w+)\s*\(\s*!/,

  // Test block: test('description') { ... }
  testBlock: /test\s*\(\s*(['"`])([^'"`]*)\1\s*\)\s*\{/,

  // Mock block: mock { ... }
  mockBlock: /mock\s*\{/,

  // Unsafe block: unsafe { ... }
  unsafeBlock: /unsafe\s*\{/,

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
