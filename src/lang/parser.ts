/**
 * TJS Parser — Orchestration Layer
 *
 * This module contains the main entry points: preprocess() and parse().
 * Transform functions are in parser-transforms.ts, param processing in parser-params.ts.
 */

import {
  stripLineComments,
  maskUnsafe,
  stripUnsafeMarkers,
} from '../strip-comments'
export { stripLineComments } from '../strip-comments'
import * as acorn from 'acorn'
import type { Program, FunctionDeclaration } from 'acorn'
import { SyntaxError } from './types'
import type { PredicateVerification } from './types'

// Re-export types so external callers don't need to change imports
export type {
  ParseOptions,
  WasmBlock,
  TestBlock,
  PreprocessOptions,
  TjsModes,
} from './parser-types'

import type {
  ParseOptions,
  WasmBlock,
  TestBlock,
  PreprocessOptions,
  TjsModes,
} from './parser-types'

import { transformParenExpressions } from './parser-params'

import {
  transformTryWithoutCatch,
  extractWasmBlocks,
  maskWasmBodies,
  unmaskWasmBodies,
  extractWasmFunctions,
  composeImportedWasmFunctions,
  transformIsOperators,
  insertAsiProtection,
  transformEqualityToStructural,
  transformTypeDeclarations,
  transformGenericDeclarations,
  transformFunctionPredicateDeclarations,
  transformUnionDeclarations,
  transformEnumDeclarations,
  transformExtendDeclarations,
  transformPolymorphicFunctions,
  transformPolymorphicConstructors,
  wrapClassDeclarations,
  transformBareAssignments,
  extractAndRunTests,
  validateNoDate,
  validateNoEval,
  validateNoVar,
  transformConstBang,
  transformBangAccess,
  transformExtensionCalls,
  transformLetTypeAnnotations,
} from './parser-transforms'

// Re-exported for the test emitter (`emitters/js-tests.ts`), which transforms
// extension calls inside test bodies.
export { transformExtensionCalls } from './parser-transforms'

export function preprocess(
  source: string,
  options: PreprocessOptions = {}
): {
  source: string
  /** Mode violations that are flagged rather than rejected — see validateNoDate/NoEval. */
  modeWarnings: string[]
  returnType?: string
  returnSafety?: 'safe' | 'unsafe'
  moduleSafety?: 'none' | 'inputs' | 'all'
  tjsModes: TjsModes
  originalSource: string
  requiredParams: Set<string>
  typeNameOptionals: Set<string>
  unsafeFunctions: Set<string>
  safeFunctions: Set<string>
  wasmBlocks: WasmBlock[]
  tests: TestBlock[]
  testErrors: string[]
  polymorphicNames: Set<string>
  extensions: Map<string, Set<string>>
  letAnnotations: Map<string, string>
  predicates: PredicateVerification[]
  /** Names declared via `Type X {…}` / `Generic X<T> {…}` in this module. */
  declaredTypes: Set<string>
} {
  const originalSource = source
  let moduleSafety: 'none' | 'inputs' | 'all' | undefined
  const requiredParams = new Set<string>()
  const typeNameOptionals = new Set<string>()
  const declaredTypes = new Set<string>()
  const unsafeFunctions = new Set<string>()
  const safeFunctions = new Set<string>()

  // Detect whether this source was emitted by fromTS (TS-originated)
  // The /* tjs <- filename */ annotation is the signal
  const isFromTS = /\/\*\s*tjs\s*<-\s*\S+\s*\*\//.test(source)

  // Native TJS: all modes ON by default (TJS is its own language).
  // Plain JS (dialect: 'js'), TS-originated, or VM target: all modes OFF +
  // safety none, so the source's own semantics are preserved (JS-compatible).
  // An explicit `dialect` is authoritative; otherwise infer from the fromTS
  // annotation / vmTarget. See PRINCIPLES.md (TJS ⊇ JS).
  const isCompat =
    options.dialect === 'js'
      ? true
      : options.dialect === 'tjs'
      ? false
      : isFromTS || options.vmTarget
  const tjsModes: TjsModes = isCompat
    ? {
        tjsEquals: false,
        tjsClass: false,
        tjsDate: false,
        tjsNoeval: false,
        tjsStandard: false,
        tjsNoVar: false,
        tjsSafeAssign: false,
        tjsDictDefaults: false,
        tjsStrict: false,
      }
    : {
        tjsEquals: true,
        tjsClass: true,
        tjsDate: true,
        tjsNoeval: true,
        tjsStandard: true,
        tjsNoVar: true,
        tjsSafeAssign: true,
        tjsDictDefaults: true,
        // Native TJS has all modes on by default, but is NOT "strict" unless the
        // author writes the `TjsStrict` directive — that opt-in is what escalates
        // e.g. unverifiable predicates from a warning to a hard error.
        tjsStrict: false,
      }

  // Safety: native TJS defaults to 'inputs' (runtime default),
  // TS-originated and VM targets default to 'none'
  if (isCompat) {
    moduleSafety = 'none'
  }

  // Handle module-level safety directive: safety none | safety inputs | safety all
  // Must be at the start of the file (possibly after comments/whitespace)
  // Explicit directive always overrides the default
  const safetyMatch = source.match(
    /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)\s*safety\s+(none|inputs|all)\b/
  )
  if (safetyMatch) {
    moduleSafety = safetyMatch[2] as 'none' | 'inputs' | 'all'
    // Remove the directive from source
    source = source.replace(
      /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)\s*safety\s+(none|inputs|all)\s*/,
      '$1'
    )
  }

  // Handle TJS mode directives (can appear in any order after safety)
  // TjsStrict enables all TJS modes (useful for TS-originated code opting in)
  // Modes that USED to be dialable and no longer are. Left as a bare identifier they
  // would emit a ReferenceError at runtime, which teaches nothing — so name the change
  // and point at the replacement, per errors-as-curriculum.
  const ABOLISHED_DIRECTIVES: Record<string, string> = {
    TjsStandard: `\`TjsStandard\` is no longer a mode. .tjs always terminates statements at newlines and always uses honest truthiness (a boxed \`new Boolean(false)\` is falsy). Neither has an escape because neither has a legitimate opposite.`,
    TjsDictDefaults: `\`TjsDictDefaults\` is no longer a mode. An object-literal parameter default is always a dictionary in .tjs — members defaulted individually, merged on a partial argument, validated. For JavaScript's atomic default, wrap it: \`args = LegacyDefault({ x: 0 })\`.`,
    TjsEquals: `\`TjsEquals\` is no longer a mode. \`==\`/\`!=\` are always footgun-free in .tjs (no coercion, boxed primitives unwrapped, null == undefined). For JavaScript's behaviour use \`DangerousLegacyEquals(a, b)\` / \`LegacyExactly(a, b)\`.`,
    TjsClass: `\`TjsClass\` is no longer a mode. Classes are always callable without \`new\` in .tjs — this is purely additive, \`new Point(1, 2)\` still works, so there is nothing to opt out of.`,
    TjsSafeAssign: `\`TjsSafeAssign\` is no longer a mode. A first bare assignment to an undeclared Capitalised name becomes \`const\` in .tjs. To keep it mutable, declare it yourself: \`let Foo = …\`.`,
    TjsNoVar: `\`TjsNoVar\` is no longer a mode. \`var\` is always rejected in .tjs — the file extension is the gate. For a deliberate exception, mark it: \`unsafe var x = 1\`.`,
    TjsNoeval: `\`TjsNoeval\` is no longer a mode. \`eval()\` is always rejected in .tjs. For a deliberate exception, mark it: \`unsafe eval(src)\`. (\`new Function()\` is a warning, not an error.)`,
    TjsSafeEval: `\`TjsSafeEval\` is no longer a mode. \`Eval\`/\`SafeFunction\` are imported automatically if and only if your code calls them, so there is nothing to opt into.`,
    TjsDate: `\`TjsDate\` is no longer a mode. Raw \`Date\` is always banned in .tjs — the file extension is the gate. For a deliberate exception, mark the construct: \`const d = unsafe new Date(x)\`.`,
  }
  // Scan the WHOLE leading directive block, not just the first line. Directives stack —
  // `TjsCompat` followed by `TjsClass` was the documented ladder — so anchoring at the very
  // start missed an abolished name in any position but the first, and it fell through to a
  // bare identifier and a runtime "X is not defined". Found by examples/datetime.tjs.
  for (const rawLine of source.split('\n')) {
    const t = rawLine.trim()
    if (!t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*'))
      continue
    if (!/^Tjs[A-Za-z]+$/.test(t)) break // past the directive block
    const guidance = ABOLISHED_DIRECTIVES[t]
    if (guidance) throw new Error(guidance)
  }

  // TjsCompat disables all TJS modes (useful for native TJS opting out)
  // Individual modes: TjsEquals, TjsClass, TjsNoeval, TjsStandard
  const directivePattern =
    /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)\s*(TjsStrict|TjsCompat)\b/

  let match
  while ((match = source.match(directivePattern))) {
    const directive = match[2]

    if (directive === 'TjsStrict') {
      // Enable all TJS modes + mark strict (the author's explicit opt-in, which
      // escalates soft diagnostics like unverifiable predicates to hard errors).
      tjsModes.tjsEquals = true
      tjsModes.tjsClass = true
      tjsModes.tjsDate = true
      tjsModes.tjsNoeval = true
      tjsModes.tjsNoVar = true
      tjsModes.tjsStandard = true
      tjsModes.tjsSafeAssign = true
      tjsModes.tjsDictDefaults = true
      tjsModes.tjsStrict = true
    } else if (directive === 'TjsCompat') {
      // Disable all TJS modes (JS-compatible)
      tjsModes.tjsEquals = false
      tjsModes.tjsClass = false
      tjsModes.tjsDate = false
      tjsModes.tjsNoeval = false
      tjsModes.tjsNoVar = false
      tjsModes.tjsStandard = false
      tjsModes.tjsSafeAssign = false
      tjsModes.tjsDictDefaults = false
    }

    // Remove the directive from source
    source = source.replace(
      new RegExp(
        `^(\\s*(?:\\/\\/[^\\n]*\\n|\\/\\*[\\s\\S]*?\\*\\/\\s*)*)\\s*${directive}\\s*`
      ),
      '$1'
    )
  }

  // Strip single-line comments early — they confuse brace matching,
  // ASI protection, and test extraction (e.g. apostrophes in comments)
  // Preserves line structure by keeping the newline
  source = stripLineComments(source)

  // Rules that are FLAGGED rather than rejected collect here and reach the caller as
  // warnings, so tooling can surface them at the site — "turn all doubt into guidance".
  const modeWarnings: string[] = []

  // Statements terminate at newlines. See insertAsiProtection for the single case where
  // that disagrees with JavaScript, which it warns about.
  // Must happen early before other transformations modify line structure
  if (tjsModes.tjsStandard) {
    source = insertAsiProtection(source, modeWarnings)
  }

  // Transform const! declarations — validate immutability and emit as const
  // Must happen before acorn parsing since const! is not valid JS
  source = transformConstBang(source)

  // Transform !. bang access to __tjs.bang() calls
  // Must happen before acorn parsing since !. is not valid JS
  source = transformBangAccess(source)

  // Transform `let x: <example>` declarations: strip annotation and record
  // varName -> example. Must happen before paren transforms so the colon
  // is not confused with TS-style annotations on params/returns.
  const letAnnoResult = transformLetTypeAnnotations(source)
  source = letAnnoResult.source
  const letAnnotations = letAnnoResult.annotations

  // Extract `wasm function NAME(...) { ... }` declarations EARLY, before
  // any source-level transforms that would mangle wasm-body text. In
  // particular, the equality transforms below rewrite `==` to `Eq()` and
  // `Is`/`IsNot` to function calls — wasm bodies use literal operators
  // and shouldn't be affected.
  const wasmFunctions = extractWasmFunctions(source)
  source = wasmFunctions.source

  // Inline `wasm { ... }` blocks are extracted LATE (they need the surrounding
  // function's params/structure transformed first, for variable capture). But
  // the operator transforms below rewrite `==`→`Eq(...)` and `Is`/`IsNot`→calls,
  // which would mangle a wasm body (the wasm compiler can't compile `Eq(a,b)` and
  // silently falls back to JS — L807). So mask the wasm bodies across just those
  // two transforms, then restore them untouched for the real extraction later.
  const wasmMask = maskWasmBodies(source)
  source = wasmMask.source

  // Transform Is/IsNot infix operators to function calls
  // a Is b -> Is(a, b)
  // a IsNot b -> IsNot(a, b)
  // These are always available for explicit structural equality
  source = transformIsOperators(source)

  // Transform == and != to structural equality (Is/IsNot)
  // Only when TjsEquals mode is enabled and not for VM targets
  // VM targets already handle == correctly at runtime
  if (tjsModes.tjsEquals && !options.vmTarget) {
    source = transformEqualityToStructural(source)
  }

  // Restore wasm bodies now that the operator transforms have run — the real
  // inline-`wasm{}` extraction (below, post paren/poly transforms) sees them
  // untouched, and variable capture works as before. (L807.)
  source = unmaskWasmBodies(source, wasmMask.masks)

  // Transform Type, Generic, Union, and Enum declarations
  // Type Foo { ... } -> const Foo = Type(...)
  // Generic Bar<T, U> { ... } -> const Bar = Generic(...)
  // Union Dir 'up' | 'down' -> const Dir = Union(...)
  // Enum Status { Pending, Active, Done } -> const Status = Enum(...)
  // Collect per-predicate verification status (Type/Generic predicate bodies:
  // verified → native guard, or fell back to a raw function). Surfaced on the
  // transpile result so tools can flag unverifiable predicates.
  const predicates: PredicateVerification[] = []
  // PARAMETERIZED first: it claims `Type X<T> { … }` before the scalar transform sees
  // `Type X` and mis-reads the `<T>` that follows.
  source = transformGenericDeclarations(source, predicates, declaredTypes)
  source = transformTypeDeclarations(source, predicates, declaredTypes)
  source = transformFunctionPredicateDeclarations(source)
  source = transformUnionDeclarations(source)
  source = transformEnumDeclarations(source)

  // Transform bare assignments to const declarations (native-TJS convenience):
  // Foo = ... -> const Foo = ...  Gated by TjsSafeAssign — OFF for plain JS
  // (dialect: 'js'), TS-originated, and VM targets, so a JS reassignment like
  // `B = value` (of an already-declared `let B`) is never rewritten. See
  // PRINCIPLES.md (TJS ⊇ JS): plain JS must pass through unchanged.
  if (tjsModes.tjsSafeAssign) {
    source = transformBareAssignments(source)
  }

  // Phase 3: cross-file wasm-function composition. When a ModuleLoader is
  // supplied, resolve `import { ... } from '<spec>'` statements at transpile
  // time. Any imported names that correspond to `wasm function` declarations
  // in the source module get pulled into the consumer's wasm module, with
  // the import statement rewritten to a local JS wrapper. No loader supplied
  // = no behavior change (imports stay verbatim, runtime resolves them).
  const importedWasm = composeImportedWasmFunctions(source, {
    loader: options.moduleLoader,
    importerPath: options.filename,
  })
  source = importedWasm.source

  // Unified paren expression transformer
  // Handles: function params, arrow params, return types, safe/unsafe markers
  // Model: open paren can be ( or (? or (!, close can be ) or )-> or )-? or )-!
  const {
    source: transformedSource,
    returnType,
    returnSafety,
  } = transformParenExpressions(source, {
    originalSource,
    requiredParams,
    typeNameOptionals,
    unsafeFunctions,
    safeFunctions,
  })
  source = transformedSource

  // NOTE: unsafe {} blocks removed - they provided no performance benefit because
  // the wrapper decision is made at transpile time. Use (!) on functions instead.
  // See ideas parking lot for potential future approaches.

  // Transform extend blocks: extend TypeName { methods } -> __ext_TypeName object
  // Must happen after paren expressions so method params are already transformed
  const extResult = transformExtendDeclarations(source)
  source = extResult.source

  // Handle try-without-catch: try { ... } (no catch/finally) -> monadic error handling
  // This is the idiomatic TJS way to convert exceptions to AgentError
  source = transformTryWithoutCatch(source)

  // Transform polymorphic functions: multiple declarations with same name -> dispatcher
  // Must happen after param transformation but before class wrapping and test extraction
  const polyResult = transformPolymorphicFunctions(source, requiredParams)
  source = polyResult.source

  // Extract WASM blocks: wasm(args) { ... } fallback { ... }
  // `wasm function` declarations are already extracted earlier in the pipeline;
  // inline wasm bodies were masked across the operator transforms and restored
  // (see above) so their `==`/`Is` weren't rewritten. This finds the remaining
  // inline `wasm { ... }` blocks inside regular tjs functions.
  const wasmBlocks = extractWasmBlocks(source)
  source = wasmBlocks.source

  // Combine all flavors of wasm blocks for the downstream emitter.
  // They're indistinguishable from the compiler's perspective — all have
  // an id, body, captures, and need the same module composition treatment.
  //   - wasmFunctions: top-level `wasm function NAME(...)` decls in this file
  //   - importedWasm:  cross-file `wasm function`s pulled in via Phase 3
  //   - wasmBlocks:    inline `wasm { ... }` blocks nested in tjs functions
  const allWasmBlocks = [
    ...wasmFunctions.blocks,
    ...importedWasm.blocks,
    ...wasmBlocks.blocks,
  ]

  // Extract and run test blocks: test 'desc'? { body }
  // Tests run at transpile time and are stripped from output
  const testResult = extractAndRunTests(source, options.dangerouslySkipTests)
  source = testResult.source

  // Transform polymorphic constructors: multiple constructor() -> factory functions
  // Must happen before wrapClassDeclarations (which needs to know about poly ctors)
  const polyCtorResult = transformPolymorphicConstructors(
    source,
    requiredParams
  )
  source = polyCtorResult.source

  // Mark $dispatch functions as unsafe (internal Proxy trap params, not user-facing)
  for (const cls of polyCtorResult.polyCtorClasses) {
    unsafeFunctions.add(`${cls}$dispatch`)
  }

  // Wrap class declarations to make them callable without `new`
  // Only when TjsClass mode is enabled
  // class Foo { } -> let Foo = class Foo { }; Foo = globalThis.__tjs?.wrapClass?.(Foo) ?? Foo;
  if (tjsModes.tjsClass) {
    source = wrapClassDeclarations(source, polyCtorResult.polyCtorClasses)
  }

  // Mode checks. Some are hard errors (the construct is a genuine footgun with a
  // meaning-preserving alternative); some are WARNINGS, where the construct is merely
  // unsafe or unfashionable and any "fix" we could apply would change behavior. Flagging
  // beats rewriting there — see the conversion contract in PRINCIPLES.md.
  // Rules are checked against a view with `unsafe <expr>` blanked out. `unsafe` is the
  // per-construct escape: it says "this construct, deliberately" AT THE SITE, which is
  // what lets the rules stay unconditional and the file extension stay the only gate.
  // A whole-file opt-out would also silence the next, accidental use.
  const ruleSource = maskUnsafe(source)

  // Raw `Date` is banned in native TJS. ABOLISHED AS A MODE (2026-08-02): there is no
  // `TjsDate` directive any more, so a `.tjs` file cannot dial this rule off — the
  // extension is the gate, and `unsafe new Date(...)` is the per-construct escape.
  //
  // The flag itself survives because it still tracks DIALECT: plain JS and TS-originated
  // source must keep raw Date, or TJS would stop being a superset of JS.
  if (tjsModes.tjsDate) {
    validateNoDate(ruleSource, modeWarnings)
  }

  // Validate TjsNoeval mode - check for eval/Function usage
  if (tjsModes.tjsNoeval) {
    validateNoEval(ruleSource, modeWarnings)
  }

  // Validate TjsNoVar mode - check for var declarations
  if (tjsModes.tjsNoVar) {
    validateNoVar(ruleSource)
  }

  // The `unsafe` marker has done its job — remove it so what follows is plain JS.
  // Offsets are preserved (it is blanked, not deleted) so reported positions still line
  // up with the author's source.
  source = stripUnsafeMarkers(source)

  // Rewrite extension method calls on known-type receivers
  // Must happen after all other transforms so literals are in final form
  source = transformExtensionCalls(source, extResult.extensions)

  return {
    source,
    modeWarnings,
    typeNameOptionals,
    returnType,
    returnSafety,
    moduleSafety,
    tjsModes,
    originalSource,
    requiredParams,
    unsafeFunctions,
    safeFunctions,
    wasmBlocks: allWasmBlocks,
    tests: testResult.tests,
    testErrors: testResult.errors,
    polymorphicNames: polyResult.polymorphicNames,
    extensions: extResult.extensions,
    letAnnotations,
    predicates,
    declaredTypes,
  }
}

/**
 * Parse source code into an Acorn AST
 */
export function parse(
  source: string,
  options: ParseOptions = {}
): {
  ast: Program
  returnType?: string
  returnSafety?: 'safe' | 'unsafe'
  moduleSafety?: 'none' | 'inputs' | 'all'
  originalSource: string
  requiredParams: Set<string>
  unsafeFunctions: Set<string>
  safeFunctions: Set<string>
  wasmBlocks: WasmBlock[]
  tests: TestBlock[]
  testErrors: string[]
  letAnnotations: Map<string, string>
  tjsModes: TjsModes
} {
  const {
    filename = '<source>',
    colonShorthand = true,
    vmTarget = false,
    dialect,
  } = options

  // Preprocess for custom syntax
  const {
    source: processedSource,
    returnType,
    returnSafety,
    moduleSafety,
    originalSource,
    requiredParams,
    unsafeFunctions,
    safeFunctions,
    wasmBlocks,
    tests,
    testErrors,
    letAnnotations,
    tjsModes,
  } = colonShorthand
    ? preprocess(source, {
        vmTarget,
        dialect,
        moduleLoader: options.moduleLoader,
        filename: options.filename,
      })
    : {
        source,
        returnType: undefined,
        returnSafety: undefined,
        moduleSafety: undefined,
        originalSource: source,
        requiredParams: new Set<string>(),
        unsafeFunctions: new Set<string>(),
        safeFunctions: new Set<string>(),
        wasmBlocks: [] as WasmBlock[],
        tests: [] as TestBlock[],
        testErrors: [] as string[],
        letAnnotations: new Map<string, string>(),
        tjsModes: {
          tjsEquals: false,
          tjsClass: false,
          tjsDate: false,
          tjsNoeval: false,
          tjsStandard: false,
          tjsNoVar: false,
          tjsSafeAssign: false,
          tjsDictDefaults: false,
          tjsStrict: false,
        } as TjsModes,
      }

  try {
    const ast = acorn.parse(processedSource, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
      allowReturnOutsideFunction: false,
    })

    return {
      ast,
      returnType,
      returnSafety,
      moduleSafety,
      originalSource,
      requiredParams,
      unsafeFunctions,
      safeFunctions,
      wasmBlocks,
      tests,
      testErrors,
      letAnnotations,
      tjsModes,
    }
  } catch (e: any) {
    // Convert Acorn error to our error type
    const loc = e.loc || { line: 1, column: 0 }
    throw new SyntaxError(
      e.message.replace(/\s*\(\d+:\d+\)$/, ''), // Remove acorn's location suffix
      loc,
      originalSource,
      filename
    )
  }
}

/**
 * Validate that the source contains exactly one function declaration
 */
export function validateSingleFunction(
  ast: Program,
  filename?: string
): FunctionDeclaration {
  // Check for unsupported top-level constructs FIRST
  // This gives better error messages for things like classes
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      throw new SyntaxError(
        'Imports are not supported. All atoms must be registered with the VM.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }

    if (
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
    ) {
      throw new SyntaxError(
        'Exports are not supported. The function is automatically exported.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }

    if (node.type === 'ClassDeclaration') {
      throw new SyntaxError(
        'Classes are not supported. Agent99 uses functional composition.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }
  }

  const functions = ast.body.filter(
    (node): node is FunctionDeclaration => node.type === 'FunctionDeclaration'
  )

  if (functions.length === 0) {
    throw new SyntaxError(
      'Source must contain a function declaration',
      { line: 1, column: 0 },
      undefined,
      filename
    )
  }

  if (functions.length > 1) {
    const second = functions[1]
    throw new SyntaxError(
      'Only a single function per agent is allowed',
      second.loc?.start || { line: 1, column: 0 },
      undefined,
      filename
    )
  }

  return functions[0]
}

/**
 * Extract top-level function declarations from the parsed program.
 *
 * Returns `{ entry, helpers }` where:
 *   - `entry` is the last function declaration (the agent's entry point)
 *   - `helpers` are all preceding function declarations, looked up by name
 *
 * This matches the natural "helpers first, agent last" pattern, including
 * the TOOL_LIBRARY use case where helper async wrappers are prepended
 * before the user-supplied agent function.
 *
 * Same top-level construct restrictions as `validateSingleFunction`:
 * imports, exports, and classes are rejected.
 */
export function extractFunctions(
  ast: Program,
  filename?: string
): { entry: FunctionDeclaration; helpers: Map<string, FunctionDeclaration> } {
  // Top-level construct checks (same as validateSingleFunction)
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      throw new SyntaxError(
        'Imports are not supported. All atoms must be registered with the VM.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }

    if (
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
    ) {
      throw new SyntaxError(
        'Exports are not supported. The function is automatically exported.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }

    if (node.type === 'ClassDeclaration') {
      throw new SyntaxError(
        'Classes are not supported. Agent99 uses functional composition.',
        node.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }
  }

  const functions = ast.body.filter(
    (node): node is FunctionDeclaration => node.type === 'FunctionDeclaration'
  )

  if (functions.length === 0) {
    throw new SyntaxError(
      'Source must contain a function declaration',
      { line: 1, column: 0 },
      undefined,
      filename
    )
  }

  const entry = functions[functions.length - 1]
  const helpers = new Map<string, FunctionDeclaration>()

  for (let i = 0; i < functions.length - 1; i++) {
    const fn = functions[i]
    const name = fn.id?.name
    if (!name) {
      throw new SyntaxError(
        'Helper function must have a name',
        fn.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }
    if (helpers.has(name)) {
      throw new SyntaxError(
        `Duplicate helper function name: ${name}`,
        fn.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }
    if (name === entry.id?.name) {
      throw new SyntaxError(
        `Helper function cannot share a name with the entry function: ${name}`,
        fn.loc?.start || { line: 1, column: 0 },
        undefined,
        filename
      )
    }
    helpers.set(name, fn)
  }

  return { entry, helpers }
}

/**
 * Extract TDoc comment from before a function
 *
 * TJS doc comments use /\*# ... \*\/ syntax and preserve full markdown content.
 * Legacy JSDoc (/\*\* ... \*\/) is supported as a fallback.
 */
export function extractTDoc(
  source: string,
  func: FunctionDeclaration
): {
  description?: string
  params: Record<string, string>
} {
  const result: { description?: string; params: Record<string, string> } = {
    params: {},
  }

  if (!func.loc) return result

  const beforeFunc = source.substring(0, func.start)

  // First, check for TJS doc comment: /*# ... */
  // This preserves full markdown content
  // Find the LAST /*# ... */ block and verify it immediately precedes the function
  // (only whitespace and line comments allowed between)
  // Line-start `/*#` only — a `/*#` after code (or in a string) isn't a doc
  // comment. Lookbehind keeps match.index/length on the `/*#…*/` span.
  const allDocBlocks = [
    ...beforeFunc.matchAll(/(?<=^[ \t]*)\/\*#([\s\S]*?)\*\//gm),
  ]
  if (allDocBlocks.length > 0) {
    const lastBlock = allDocBlocks[allDocBlocks.length - 1]
    const afterBlock = beforeFunc.substring(
      lastBlock.index! + lastBlock[0].length
    )

    // Only attach if nothing but whitespace and line comments between doc and function
    if (/^(?:\s|\/\/[^\n]*)*$/.test(afterBlock)) {
      // Extract content, trim leading/trailing whitespace, preserve internal formatting
      let content = lastBlock[1]

      // Remove common leading whitespace (like dedent)
      const lines = content.split('\n')
      // Find minimum indentation (ignoring empty lines)
      const minIndent = lines
        .filter((line) => line.trim().length > 0)
        .reduce((min, line) => {
          const indent = line.match(/^(\s*)/)?.[1].length || 0
          return Math.min(min, indent)
        }, Infinity)

      // Remove that indentation from all lines
      if (minIndent > 0 && minIndent < Infinity) {
        content = lines.map((line) => line.slice(minIndent)).join('\n')
      }

      result.description = content.trim()
      return result
    }
  }

  // Fall back to JSDoc: /** ... */
  const jsdocMatch = beforeFunc.match(/\/\*\*[\s\S]*?\*\/\s*$/)
  if (!jsdocMatch) return result

  const jsdoc = jsdocMatch[0]

  // Extract description (first non-tag content)
  const descMatch = jsdoc.match(/\/\*\*\s*\n?\s*\*?\s*([^@\n][^\n]*)/m)
  if (descMatch) {
    result.description = descMatch[1].trim()
  }

  // Extract @param tags
  const paramRegex = /@param\s+(?:\{[^}]+\}\s+)?(\w+)\s*-?\s*(.*)/g
  let match
  while ((match = paramRegex.exec(jsdoc)) !== null) {
    result.params[match[1]] = match[2].trim()
  }

  return result
}
