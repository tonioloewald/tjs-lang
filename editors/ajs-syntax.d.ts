/**
 * AsyncJS Syntax Definitions
 *
 * Single source of truth for AsyncJS language syntax elements.
 * Used by all editor integrations (Monaco, CodeMirror, Ace, VSCode).
 */
/**
 * Keywords supported in AsyncJS
 */
export declare const KEYWORDS: readonly ["function", "return", "if", "else", "while", "for", "of", "in", "try", "catch", "finally", "let", "const", "true", "false", "null", "undefined"];
/**
 * Keywords/constructs that are NOT supported in AsyncJS.
 * These should be highlighted as errors in editors.
 */
export declare const FORBIDDEN_KEYWORDS: readonly ["new", "class", "extends", "super", "this", "implements", "interface", "abstract", "static", "private", "protected", "public", "async", "await", "yield", "import", "export", "require", "module", "var", "throw", "switch", "case", "default", "with", "delete", "void", "typeof", "instanceof", "debugger", "eval", "type", "enum", "namespace", "declare", "readonly", "as", "is", "keyof", "infer", "never", "unknown"];
/**
 * Built-in type constructors that can be used as factories
 * (without 'new' keyword)
 */
export declare const TYPE_CONSTRUCTORS: readonly ["Date", "Set", "Map", "Array", "Object", "String", "Number", "Boolean", "RegExp", "Error", "JSON", "Math", "Schema"];
/**
 * Built-in atoms available in AsyncJS
 */
export declare const BUILTIN_ATOMS: readonly ["httpFetch", "llmPredict", "storeGet", "storeSet", "storeQuery", "storeVectorSearch", "console"];
/**
 * Operators supported in AsyncJS
 */
export declare const OPERATORS: readonly ["=", "+=", "-=", "*=", "/=", "%=", "==", "===", "!=", "!==", "<", ">", "<=", ">=", "+", "-", "*", "/", "%", "**", "&&", "||", "??", "!", "&", "|", "^", "~", "<<", ">>", ">>>", "?", ":", ".", "?.", "?.(", "?.[", "..."];
/**
 * Get all forbidden keywords as a Set for efficient lookup
 */
export declare const FORBIDDEN_SET: Set<"new" | "class" | "extends" | "super" | "this" | "implements" | "interface" | "abstract" | "static" | "private" | "protected" | "public" | "async" | "await" | "yield" | "import" | "export" | "require" | "module" | "var" | "throw" | "switch" | "case" | "default" | "with" | "delete" | "void" | "typeof" | "instanceof" | "debugger" | "eval" | "type" | "enum" | "namespace" | "declare" | "readonly" | "as" | "is" | "keyof" | "infer" | "never" | "unknown">;
/**
 * Get all keywords as a Set for efficient lookup
 */
export declare const KEYWORDS_SET: Set<"undefined" | "function" | "return" | "if" | "else" | "while" | "for" | "of" | "in" | "try" | "catch" | "finally" | "let" | "const" | "true" | "false" | "null">;
/**
 * Regex pattern matching any forbidden keyword (word boundary)
 */
export declare const FORBIDDEN_PATTERN: RegExp;
/**
 * Check if a word is a forbidden keyword
 */
export declare function isForbidden(word: string): boolean;
/**
 * Check if a word is a valid keyword
 */
export declare function isKeyword(word: string): boolean;
