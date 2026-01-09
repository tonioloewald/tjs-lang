/**
 * AsyncJS Syntax Definitions
 *
 * Single source of truth for AsyncJS language syntax elements.
 * Used by all editor integrations (Monaco, CodeMirror, Ace, VSCode).
 */

/**
 * Keywords supported in AsyncJS
 */
export const KEYWORDS = [
  'function',
  'return',
  'if',
  'else',
  'while',
  'for',
  'of',
  'in',
  'try',
  'catch',
  'finally',
  'let',
  'const',
  'true',
  'false',
  'null',
  'undefined',
] as const

/**
 * Keywords/constructs that are NOT supported in AsyncJS.
 * These should be highlighted as errors in editors.
 */
export const FORBIDDEN_KEYWORDS = [
  // Object-oriented constructs
  'new',
  'class',
  'extends',
  'super',
  'this',
  'implements',
  'interface',
  'abstract',
  'static',
  'private',
  'protected',
  'public',

  // Async constructs (not needed - runtime handles async)
  'async',
  'await',
  'yield',

  // Module system (not supported)
  'import',
  'export',
  'require',
  'module',

  // Other unsupported
  'var', // use let/const
  'throw', // use Error() for monadic error flow
  'switch', // use if/else chains
  'case',
  'default', // (as switch keyword)
  'with',
  'delete',
  'void',
  'typeof', // use type-by-example instead
  'instanceof',
  'debugger',
  'eval',

  // TypeScript-specific (not supported)
  'type',
  'enum',
  'namespace',
  'declare',
  'readonly',
  'as',
  'is',
  'keyof',
  'infer',
  'never',
  'unknown',
] as const

/**
 * Built-in type constructors that can be used as factories
 * (without 'new' keyword)
 */
export const TYPE_CONSTRUCTORS = [
  'Date',
  'Set',
  'Map',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'RegExp',
  'Error',
  'JSON',
  'Math',
  'Schema', // AsyncJS-specific
] as const

/**
 * Built-in atoms available in AsyncJS
 */
export const BUILTIN_ATOMS = [
  // IO
  'httpFetch',
  'llmPredict',

  // Store
  'storeGet',
  'storeSet',
  'storeQuery',
  'storeVectorSearch',

  // Console (logging/warnings/errors)
  'console', // .log, .warn, .error
] as const

/**
 * Operators supported in AsyncJS
 */
export const OPERATORS = [
  // Assignment
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',

  // Comparison
  '==',
  '===',
  '!=',
  '!==',
  '<',
  '>',
  '<=',
  '>=',

  // Arithmetic
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',

  // Logical
  '&&',
  '||',
  '??',
  '!',

  // Bitwise (limited support)
  '&',
  '|',
  '^',
  '~',
  '<<',
  '>>',
  '>>>',

  // Other
  '?',
  ':',
  '.',
  '?.',
  '?.(',
  '?.[',
  '...',
] as const

/**
 * Get all forbidden keywords as a Set for efficient lookup
 */
export const FORBIDDEN_SET = new Set(FORBIDDEN_KEYWORDS)

/**
 * Get all keywords as a Set for efficient lookup
 */
export const KEYWORDS_SET = new Set(KEYWORDS)

/**
 * Regex pattern matching any forbidden keyword (word boundary)
 */
export const FORBIDDEN_PATTERN = new RegExp(
  `\\b(${FORBIDDEN_KEYWORDS.join('|')})\\b`,
  'g'
)

/**
 * Check if a word is a forbidden keyword
 */
export function isForbidden(word: string): boolean {
  return FORBIDDEN_SET.has(word as (typeof FORBIDDEN_KEYWORDS)[number])
}

/**
 * Check if a word is a valid keyword
 */
export function isKeyword(word: string): boolean {
  return KEYWORDS_SET.has(word as (typeof KEYWORDS)[number])
}
