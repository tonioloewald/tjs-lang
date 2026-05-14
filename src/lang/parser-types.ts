/**
 * Parser types and interfaces
 *
 * Shared type definitions used across parser modules.
 */

/** Parser options */
export interface ParseOptions {
  /** Filename for error messages */
  filename?: string
  /** Enable colon shorthand syntax preprocessing */
  colonShorthand?: boolean
  /**
   * Target is the VM (AJS code).
   * When true, skips == to Is() transformation since the VM handles == correctly.
   */
  vmTarget?: boolean
  /**
   * Optional ModuleLoader for cross-file `wasm function` composition (Phase 3).
   * When provided, imports are resolved at transpile time and matching wasm
   * functions are composed into the consumer's WebAssembly.Module. When
   * omitted, imports are preserved verbatim (the default — runtime resolves
   * them as before).
   *
   * Type is left as `any` here to avoid a circular import with module-loader.ts;
   * callers should pass a `ModuleLoader` instance.
   */
  moduleLoader?: any
}

/**
 * A WASM block extracted from source
 *
 * Simple form (body is both WASM source and JS fallback):
 *   wasm {
 *     for (let i = 0; i < arr.length; i++) { arr[i] *= 2 }
 *   }
 *
 * With explicit fallback (when WASM and JS need different code):
 *   wasm {
 *     // WASM-optimized path
 *   } fallback {
 *     // JS fallback using different approach
 *   }
 *
 * Variables are captured from scope automatically.
 */
export interface WasmBlock {
  /** Unique ID for this block */
  id: string
  /**
   * Declared function name (only set for top-level `wasm function NAME(...)`
   * declarations — Phase 1+). Used by Phase 3 cross-file composition to
   * match an imported symbol against a wasm function declaration. Inline
   * `wasm {}` blocks have no name and don't participate in composition.
   */
  name?: string
  /**
   * Declared return-type annotation, e.g. `'f64'`. Only set for top-level
   * `wasm function NAME(...): RetType` declarations; presence/absence is
   * used to determine `hasReturn` BEFORE the body is compiled, so the
   * function index map can be built up-front for wasm-to-wasm calls.
   * Inline blocks have no declared return type.
   */
  returnType?: string
  /** The body (JS subset that compiles to WASM, also used as fallback) */
  body: string
  /** Explicit fallback body (only if different from body) */
  fallback?: string
  /** Variables captured from enclosing scope (auto-detected) */
  captures: string[]
  /** Start position in original source */
  start: number
  /** End position in original source */
  end: number
}

/**
 * A test block extracted from source
 *
 * Syntax:
 *   test { body }
 *   test 'description' { body }
 *
 * Tests run at transpile time and are stripped from output.
 */
export interface TestBlock {
  /** Optional description */
  description?: string
  /** The test body code */
  body: string
  /** Start position in original source */
  start: number
  /** End position in original source */
  end: number
  /** Source line number (1-indexed) */
  line?: number
}

/**
 * Preprocess options
 */
export interface PreprocessOptions {
  /** Skip test execution (tests still stripped from output) */
  dangerouslySkipTests?: boolean
  /**
   * Skip == to Is() transformation.
   * Set to true for AJS code that runs in the VM, which already handles == correctly.
   * Default: false (transform == to Is() for TJS code running in regular JS)
   */
  vmTarget?: boolean
  /**
   * Optional ModuleLoader for cross-file `wasm function` composition (Phase 3).
   * See ParseOptions.moduleLoader for details.
   */
  moduleLoader?: any
  /** Path of the file being preprocessed (used as importer context). */
  filename?: string
}

/**
 * Tokenizer state for tracking context during source transformation
 */
export type TokenizerState =
  | 'normal'
  | 'single-string'
  | 'double-string'
  | 'template-string'
  | 'line-comment'
  | 'block-comment'
  | 'regex'

/**
 * Structural context for tracking where we are in the code
 * This enables proper handling of class methods vs function calls
 */
export type StructuralContext =
  | 'top-level'
  | 'class-body'
  | 'function-body'
  | 'block'

export interface ContextFrame {
  type: StructuralContext
  braceDepth: number // The brace depth when we entered this context
}

/**
 * Unified paren expression transformer using state machine tokenizer
 *
 * Model: opening paren can be ( or (? or (!, closing can be ) or )->type or )-?type or )-!type
 *
 * This unifies handling of:
 * - Function declaration params: function foo(x: type) -> returnType { }
 * - Arrow function params: (x: type) => expr
 * - Safe/unsafe markers: function foo(?) or function foo(!)
 * - Return type annotations: ) -> type or ) -? type or ) -! type
 *
 * @param source The source code to transform
 * @param ctx Context for tracking required params, safe/unsafe functions, etc.
 * @returns Transformed source and extracted metadata
 */

/** TJS mode flags for opt-in language improvements */
export interface TjsModes {
  /** TjsEquals: == and != use structural equality */
  tjsEquals: boolean
  /** TjsClass: classes callable without new, explicit new is banned */
  tjsClass: boolean
  /** TjsDate: Date is banned, use Timestamp/LegalDate */
  tjsDate: boolean
  /** TjsNoeval: eval() and new Function() are banned */
  tjsNoeval: boolean
  /** TjsStandard: newlines as statement terminators (prevents ASI footguns) */
  tjsStandard: boolean
  /** TjsSafeEval: include Eval/SafeFunction in runtime for dynamic code execution */
  tjsSafeEval: boolean
  /** TjsNoVar: var declarations are syntax errors */
  tjsNoVar: boolean
  /** TjsSafeAssign: let declarations need an initializer or `: example` annotation; literal undefined/null/void 0 assigned to typed lets is flagged */
  tjsSafeAssign: boolean
}

/**
 * Extension info for a single extend block
 */
export interface ExtensionInfo {
  /** The type name being extended (e.g., 'String', 'Array', 'MyClass') */
  typeName: string
  /** Method names defined in this extend block */
  methods: string[]
}

/**
 * Transform `extend TypeName { ... }` blocks into `const __ext_TypeName = { ... }` objects
 * and runtime registration calls.
 *
 * extend String {
 *   capitalize() { return this[0].toUpperCase() + this.slice(1) }
 * }
 *
 * becomes:
 *
 * const __ext_String = {
 *   capitalize: function() { return this[0].toUpperCase() + this.slice(1) }
 * }
 * if (__tjs?.registerExtension) {
 *   __tjs.registerExtension('String', 'capitalize', __ext_String.capitalize)
 * }
 */

export interface PolyVariant {
  /** Index (1-based) for renaming */
  index: number
  /** Start position in source */
  start: number
  /** End position in source (after closing brace) */
  end: number
  /** The full function source text */
  text: string
  /** Whether it was exported */
  exported: boolean
  /** Whether it was async */
  isAsync: boolean
  /** Parsed parameter info: [name, defaultValue][] */
  params: { name: string; defaultValue: string; required: boolean }[]
}

/**
 * Infer a type-check expression from a parameter's default value string.
 * Returns a condition that checks if an argument matches this param's type.
 */
