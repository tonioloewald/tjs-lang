/**
 * TJS Parser — Orchestration Layer
 *
 * This module contains the main entry points: preprocess() and parse().
 * Transform functions are in parser-transforms.ts, param processing in parser-params.ts.
 */

import {
  maskLiterals,
  maskLiteralsKeepComments,
  scanLiterals,
  stripLineComments,
  maskUnsafe,
  stripUnsafeMarkers,
  hashbangOf,
} from '../strip-comments'
export { stripLineComments } from '../strip-comments'
import * as acorn from 'acorn'
import { transformGiven } from './given-transform'
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

import {
  transformParenExpressions,
  extractParamMarkers,
  type HoistedTypeArg,
} from './parser-params'

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
  validateNoNew,
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
  /**
   * Offsets IN `source` where a required parameter's value begins, and where a type-name
   * optional's dangling annotation begins. Positional, so two parameters sharing a name
   * and a literal cannot be confused — see `extractParamMarkers`.
   */
  requiredValueOffsets: Set<number>
  typeNameValueOffsets: Set<number>
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
  // A `#!` line is standard ECMAScript (the ES2023 hashbang grammar), and acorn already
  // parses it. Rejecting it made `tjs(src, { dialect: 'js' })` refuse legal JavaScript —
  // a PRINCIPLES.md TJS ⊇ JS subset violation, not a preference.
  //
  // It was handled in `tjs check` ALONE, so `check` green-lit a bin script that `emit`,
  // `run`, `types` and `test` all rejected with `Unexpected character '!' at :1:1`. A guard
  // in one command is how a whole-language rule ends up true in one place; this belongs at
  // the entry every path goes through.
  //
  // BLANKED, not removed, so every offset in a later diagnostic still points at the right
  // line and column — the same reason `check` blanked it rather than slicing.
  const shebang = hashbangOf(source)
  if (shebang)
    source = ' '.repeat(shebang.length) + source.slice(shebang.length)

  const originalSource = source
  let moduleSafety: 'none' | 'inputs' | 'all' | undefined
  const requiredParams = new Set<string>()
  const typeNameOptionals = new Set<string>()
  const declaredTypes = new Set<string>()
  /** `const __ta_0 = Box(…)` declarations produced by type arguments (`b: Box<int>`). */
  const hoistedTypeArgs: HoistedTypeArg[] = []
  const unsafeFunctions = new Set<string>()
  const safeFunctions = new Set<string>()

  // Detect whether this source was emitted by fromTS (TS-originated).
  // The /* tjs <- filename */ annotation is the signal — and it is a COMMENT, so the scan
  // runs over a view with string literals blanked and comments intact. Scanning raw source
  // meant any file that merely MENTIONED the annotation in a string was read as
  // TS-originated and silently lost every TJS mode: `==` stopped being `Eq`, `given` never
  // lowered. `from-ts.ts` itself is such a file — it emits the annotation from a template —
  // so the converter's own source was the first casualty. Literal blindness, the repo's
  // dominant defect class; see src/lang/literal-blindness.test.ts.
  const isFromTS = /\/\*\s*tjs\s*<-\s*\S+\s*\*\//.test(
    maskLiteralsKeepComments(source)
  )

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
  //
  // Scanned over the MASKED view, where comments are already spaces — so the regex needs
  // no comment-matching at all and is linear. The previous pattern matched the leading
  // comment run itself (`(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*`), and the lazy `[\s\S]*?`
  // could extend a "comment" to ANY later `*/` in the file, so the prefix could absorb
  // arbitrary amounts of source in combinatorially many ways before failing. On a
  // converted file — which carries a `/* line N */` marker per declaration — that was
  // **90 of the 116 seconds** it took to transpile `emitters/ast.ts` (55KB): two regexes,
  // 47s and 43s, measured by CPU profile after every coarser probe missed them. Our own
  // `reDoSRisk` flags the old shape; `src/self-redos.test.ts` now keeps the count falling.
  //
  // Masking preserves offsets, so the match indexes straight into the real source for the
  // splice, and everything before the directive — comments included — is kept verbatim,
  // exactly as the old `$1` replacement did.
  const spliceDirective = (start: number, length: number): void => {
    let end = start + length
    while (end < source.length && /\s/.test(source[end])) end++
    source = source.slice(0, start) + source.slice(end)
  }
  const safetyMatch = maskLiterals(source).match(
    /^(\s*)safety\s+(none|inputs|all)\b/
  )
  if (safetyMatch) {
    moduleSafety = safetyMatch[2] as 'none' | 'inputs' | 'all'
    spliceDirective(
      safetyMatch[1].length,
      safetyMatch[0].length - safetyMatch[1].length
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
  let inBlockComment = false
  for (const rawLine of source.split('\n')) {
    const t = rawLine.trim()

    // Walk the leading comment/directive preamble properly, and only stop at real code.
    //
    // This used to `break` on the first line that was not itself `/^Tjs[A-Za-z]+$/`, which
    // two ordinary shapes trip:
    //
    // A `/*# … */` doc comment ends it. Only `//`, `/*` and `*` prefixes were skipped, so a
    // markdown line inside one (`# Title`, `- bullet`) hit the `break` at the top of the
    // file — which is how `functions/src/index.tjs`, whose header is exactly that, slipped
    // through. (`safety none` is NOT a cause: it is consumed upstream before this scan. I
    // added a skip for it and then measured that removing the skip changed nothing — a
    // guard whose comment claims a reason it does not have is the thing this file keeps
    // being bitten by.)
    //
    // The consequence was silent and total: an abolished directive fell through as a bare
    // identifier, `tjs emit` exited 0, and the emitted module threw
    // `ReferenceError: TjsSafeEval is not defined` on load. Our own Cloud Functions shipped
    // that way — the committed bundle only worked because it predated the abolition.
    if (inBlockComment) {
      if (t.includes('*/')) inBlockComment = false
      continue
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlockComment = true
      continue
    }
    if (!t || t.startsWith('//')) continue
    if (!/^Tjs[A-Za-z]+$/.test(t)) break // past the directive block: real code
    const guidance = ABOLISHED_DIRECTIVES[t]
    if (guidance) throw new Error(guidance)
  }

  // TjsCompat disables all TJS modes (useful for native TJS opting out)
  // Individual modes: TjsEquals, TjsClass, TjsNoeval, TjsStandard
  // Same masked-view scan as the safety directive above, and for the same reason — the
  // old comment-matching prefix was the 47-second half of the pair.
  const directivePattern = /^(\s*)(TjsStrict|TjsCompat)\b/

  let match
  while ((match = maskLiterals(source).match(directivePattern))) {
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

    // Remove the directive from source. (This was a FOURTH copy of the backtracking
    // pattern, built via `new RegExp` — invisible to the self-ReDoS ratchet, which scans
    // regex LITERALS. The splice-by-offset needs no pattern at all.)
    spliceDirective(match[1].length, directive.length)
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
  source = transformUnionDeclarations(source, declaredTypes)
  source = transformEnumDeclarations(source, declaredTypes)

  // `given` lowers to a C `switch` with explicit breaks, BEFORE acorn sees the source —
  // its syntax is not valid JavaScript, unlike #43's additions which happened to be.
  // Native `.tjs` only: `given` is a TJS construct, and plain JS must keep meaning what it
  // means (PRINCIPLES.md).
  if (tjsModes.tjsStandard) {
    const lowered = transformGiven(source)
    source = lowered.source
    for (const w of lowered.warnings) modeWarnings.push(w.message)
  }

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
    // Type declarations were transformed above, so `declaredTypes` is populated by now —
    // which is what lets `Box<int>` be recognised as an APPLICATION of a declared type
    // rather than a comparison.
    declaredTypes,
    hoistedTypeArgs,
    unsafeFunctions,
    safeFunctions,
  })
  source = transformedSource
  // Applied types are constructed once, at module top, rather than on every call. They go
  // AFTER the declarations they reference — `Box` must exist before `Box(…)` runs — and
  // the Type/Generic transforms have already emitted those above.
  for (const h of hoistedTypeArgs) {
    // After the declaration it applies, never before it — `const Box = …` is in the
    // temporal dead zone until its own line runs, so prepending threw
    // "Cannot access 'Box' before initialization" at module load.
    const decl = source.indexOf(`const ${h.head} =`)
    if (decl === -1) {
      source = `${source}\n${h.text}`
      continue
    }
    const eol = source.indexOf('\n', decl)
    const at = eol === -1 ? source.length : eol
    source = `${source.slice(0, at)}\n${h.text}${source.slice(at)}`
  }

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
  const polyResult = transformPolymorphicFunctions(
    source,
    requiredParams,
    declaredTypes
  )
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
    // Same gate as raw Date: this is the "is this native TJS?" dialect flag, so plain JS
    // and TS-originated source keep `new` and TJS stays a superset.
    // Against the ORIGINAL source, not `ruleSource`. By this point the class transform
    // has emitted `P = new Proxy(P, { apply … })` — which is HOW a TJS class becomes
    // callable — so checking transformed source makes the compiler reject its own output.
    // The other validators survive on `ruleSource` only because `var`/`eval`/`Date`
    // happen not to appear in anything we generate; that is luck, not design.
    validateNoNew(maskUnsafe(originalSource))
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

  // Markers out, offsets in — see `extractParamMarkers`. Everything downstream (acorn, the
  // wasm capture scanner, polymorphic detection, the emitted output) sees source that
  // never contained a marker.
  const marked = extractParamMarkers(source)
  source = marked.source

  return {
    source,
    requiredValueOffsets: marked.required,
    typeNameValueOffsets: marked.typeName,
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
  /**
   * The source acorn actually parsed — every AST position indexes into THIS, not
   * `originalSource`. Callers that need the text behind a node (to read a parameter's
   * value, say) were slicing `originalSource` or re-running `preprocess`; both drift.
   */
  processedSource: string
  /** Offsets in `processedSource` where a required parameter's value begins. */
  requiredValueOffsets: Set<number>
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
    requiredValueOffsets,
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
        requiredValueOffsets: new Set<number>(),
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
      processedSource,
      requiredValueOffsets,
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
 * Is this gap only whitespace and line comments?
 *
 * A linear scan, not `/^(?:\s|\/\/[^\n]*)*$/`. That pattern is a quantifier inside a
 * quantifier — the shape `src/redos.ts` refuses to certify in a user predicate — and the
 * compiler enforcing a rule on user code that it does not follow itself is exactly what
 * `self-redos.test.ts` exists to stop. It also cost this project 90 seconds of a 116-second
 * transpile once already, in the module-directive detectors.
 *
 * The gap here is short, so this was low RISK rather than harmless; a linear scan is no
 * harder to read and cannot backtrack at all.
 */
function onlyGapFiller(gap: string): boolean {
  for (let i = 0; i < gap.length; i++) {
    const c = gap[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue
    if (c === '/' && gap[i + 1] === '/') {
      const nl = gap.indexOf('\n', i)
      if (nl === -1) return true // trailing line comment runs to the end
      i = nl
      continue
    }
    return false
  }
  return true
}

/**
 * Every doc comment in a file, scanned ONCE.
 *
 * `extractTDoc` used to do `source.substring(0, func.start)` and then run a global
 * `matchAll` over that prefix — per function. Two O(N) operations inside an O(F) loop, so
 * O(F × N): 58 functions over a 176KB file cost **89ms of a 361ms transpile**, about a
 * quarter of it, and the JSDoc fallback below it did the same thing again for every
 * function WITHOUT a `/*#` block, which is nearly all of them.
 *
 * Now the comments are located once per source (through the memoized `scanLiterals`, which
 * the rest of the pipeline already pays for) and each function binary-searches for the
 * comment that ends nearest before it.
 *
 * Going through the scanner rather than a regex also makes it literal-correct for free: a
 * doc comment written inside a string is not a doc comment. The regex it replaces was one
 * of the three patterns on the self-ReDoS ratchet, and both of its quantifiers are gone.
 */
interface DocComment {
  /** Offset of the opening delimiter. */
  start: number
  /** Offset just past the closing delimiter. */
  end: number
  /** `'tdoc'` for a line-start `/*#`, `'jsdoc'` for `/**`. */
  kind: 'tdoc' | 'jsdoc'
  /** The text between the delimiters, past the `#` for a tdoc block. */
  body: string
}

const docCommentCache = new Map<string, DocComment[]>()

function docComments(source: string): DocComment[] {
  const hit = docCommentCache.get(source)
  if (hit) return hit
  const out: DocComment[] = []
  for (const r of scanLiterals(source)) {
    if (r.kind !== 'block-comment') continue
    const inner = source.slice(r.innerStart, r.innerEnd)
    if (inner.startsWith('#')) {
      // A tdoc block only counts at the start of a line — `x = 1 /*# … */` is a trailing
      // comment, not documentation.
      const lineStart = source.lastIndexOf('\n', r.start) + 1
      if (!/^[ \t]*$/.test(source.slice(lineStart, r.start))) continue
      out.push({
        start: r.start,
        end: r.end,
        kind: 'tdoc',
        body: inner.slice(1),
      })
    } else if (inner.startsWith('*')) {
      out.push({
        start: r.start,
        end: r.end,
        kind: 'jsdoc',
        body: source.slice(r.start, r.end),
      })
    }
  }
  // Bounded, like the mask memo: a transpile touches a handful of sources, and holding
  // every one seen forever would be a leak dressed as a cache.
  if (docCommentCache.size > 24) docCommentCache.clear()
  docCommentCache.set(source, out)
  return out
}

/** The last doc comment ending at or before `pos`, or undefined. */
function docCommentBefore(
  blocks: DocComment[],
  pos: number,
  kind: 'tdoc' | 'jsdoc'
): DocComment | undefined {
  let found: DocComment | undefined
  let lo = 0
  let hi = blocks.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (blocks[mid].end <= pos) {
      idx = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  for (let i = idx; i >= 0; i--) {
    if (blocks[i].kind === kind) {
      found = blocks[i]
      break
    }
  }
  return found
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

  const blocks = docComments(source)

  // TJS doc comment: /*# … */ immediately above the function. Located by binary search
  // rather than by re-scanning the file prefix — see `docComments`.
  const tdoc = docCommentBefore(blocks, func.start, 'tdoc')
  if (tdoc) {
    // Only attach if nothing but whitespace and line comments sits between the doc and
    // the function. This slice is the GAP, not the whole prefix.
    const afterBlock = source.slice(tdoc.end, func.start)
    if (onlyGapFiller(afterBlock)) {
      let content = tdoc.body

      // Remove common leading whitespace (like dedent)
      const lines = content.split('\n')
      const minIndent = lines
        .filter((line) => line.trim().length > 0)
        .reduce((min, line) => {
          const indent = line.match(/^(\s*)/)?.[1].length || 0
          return Math.min(min, indent)
        }, Infinity)

      if (minIndent > 0 && minIndent < Infinity) {
        content = lines.map((line) => line.slice(minIndent)).join('\n')
      }

      result.description = content.trim()
      return result
    }
  }

  // Fall back to JSDoc: /** … */, which must be the last thing before the function.
  const jsdocBlock = docCommentBefore(blocks, func.start, 'jsdoc')
  if (!jsdocBlock) return result
  if (!/^\s*$/.test(source.slice(jsdocBlock.end, func.start))) return result

  const jsdoc = jsdocBlock.body

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
