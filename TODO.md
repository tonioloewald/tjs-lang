# TJS-Lang TODO

## Predicate types — "AJS is JSON-Schema's missing piece"

The thesis (see the blog draft): JSON-Schema / TS can't express types that need
**computation**; verified-pure, composable AJS predicates can — serializable
(the AJS AST), safe (no IO, fuel-bounded), and compiled to native JS so they're
fast. CSS is the torture-test proof. The engine is built and green on `main`;
what remains is **delivery, measurement, and reach** — not invention.

**Done (engine):**

- [x] Atom `effects: 'pure' | 'io'` keystone — classified, guarded (`src/vm/atom-effects.test.ts`).
- [x] `verifyPredicate` / `compilePredicate` — `src/lang/predicate.ts`, exported from `tjs-lang/lang`. Transitive closure check, pure-method whitelist, registry-driven effects.
- [x] Fuel-bounded, global-shadowed native compiler (loops rejected; `__fuel()` at function entry; per-call budget; stack-overflow normalized to `PredicateFuelExhausted`). Zero measurable perf cost.
- [x] PoC + CSS torture set + perf ballpark in `experiments/predicates/` (theme ~0.13ms, ReDoS-linear).

**Remaining (delivery / north star):**

- [x] **#4 Autocomplete `suggest()` companion** — `src/lang/predicate.ts` (`suggest`, exported from `tjs-lang/lang`). Mines a cluster for completions: keyword sets (array literals + `==` literals) → `value` suggestions, `startsWith(...)` guards → open-ended `stub`s (`var(--`/`calc(`). Mined values are run through the compiled entry predicate so suggestions are _guaranteed valid_, not just enumerated. Beats both TS modes: a `string` fallback offers nothing, a finite union can't offer the open-ended stubs. Prefix-filtered + limited. Tests: `src/lang/suggest.test.ts`, demo `experiments/predicates/suggest.demo.test.ts`.
- [ ] **#5 Wire into `FunctionPredicate` / `Type`** — predicate bodies authored in this verified-safe substrate; the real consumer.
- [x] **#6 (tjs-lang side) the `$predicate` keyword + reference evaluator** — `src/lang/predicate-schema.ts` (`compilePredicateSchema` / `validatePredicateSchema`, exported from `tjs-lang/lang`). A JSON-Schema node carries `$predicate` (predicate-cluster _source_; trivially serializable, the verifier makes it safe to run). Structural keywords (type/properties/required/items) validate for everyone; `$predicate` runs only for aware validators → progressive enhancement. Demoed on CSS (`experiments/predicates/css-schema.demo.test.ts`): same JSON, naive sees `string`, aware validates var()/calc()/!important + recursion. Gotcha noted: embed predicate source via `String.raw` (regex backslashes) — moot in real JSON.
- [ ] **#6 (production) wire `$predicate` into tosijs-schema** — the "incoming version" from the blog: tosijs-schema (separate repo) evaluates `$predicate` via this engine. The tjs-lang format + evaluator are ready to consume. **The remaining north-star step.**
- [ ] **Real CSS predicate library** — productionize beyond the PoC corpus (the tosijs CSS replacement). Recursive structure is plain `$ref` JSON-Schema; only leaf value-grammar needs `$predicate` (progressive enhancement). Schema validates the _serialized/data_ form; `Color` instances + bare-number→`px` are runtime conveniences (duck-typeable via `.toString()` where wanted).
- [ ] **Regex-linting in the verifier** — the ReDoS path-forward the blog commits to: reject catastrophic-backtracking patterns (the one unbounded primitive fuel can't interrupt). Until then, predicates are "no worse than `pattern`, with the bounded-tokenizer option."

## "Safe is fast" — the campaign (measurement + propagation, not invention)

The architecture already makes the safe path the fast path: boundary-level checks
(a few comparisons per _call_, not per-op), verify→native for validation, inline
WASM/SIMD for hot loops, zero-cost happy-path errors. The strip-the-safety
transpiler option is the Obj-C-`IMP`-cache / Rust-`unsafe` move — it wins the perf
argument precisely because, in practice, you leave the safety on. What's left is
to **prove it and spread it**:

- [ ] **Systematic overhead benchmark** — TJS-checked function call vs raw call across representative code (not just predicates), so "safe is fast" is backed by numbers, not just architecture. (Doubles as the CSS-post perf data — re-run on the _real_ tosijs theme with the full predicate set, confirming the ~0.1ms claim on real data.)
- [ ] **Propagate verify→native** — weave it under the type system / tosijs so the capability is pervasive, not just an engine + PoC.
- [ ] Frame the announcement around data + a real framework running it, not a promise. The blog draft is the spec: its present-tense claims (#6, the CSS lib, the real-theme number) must be true before publishing.

## Testing - watch items (don't fix yet)

- [ ] **Flaky LLM assertion (low priority — leave unless it recurs).**
      `src/batteries/models.integration.test.ts:55` asserts `res.content.length > 5`
      for `predict('the color of the sky is')`. These tests have been reliable for
      a long time; a one-off failure (2026-06) was traced to non-deterministic /
      terse model output (isolated re-run passed, probe returned a normal 32-char
      reply) — most likely just a poor model choice that run, NOT a code bug. If it
      starts failing regularly: harden to assert non-empty string + tolerate empty
      `content` when a reasoning field is present (or use a prompt that demands a
      full sentence). Until then, leave as-is.

## Editors - published `.js` is stale (address sooner rather than later)

- [ ] **The `tjs-lang/editors/*` subpaths ship hand-maintained `.js` files that
      are NOT built from the `.ts` sources.** `editors/codemirror/ajs-language.js`
      is from Jan 2026 (~7.5KB, an old standalone CDN-example impl) while
      `ajs-language.ts` is the real ~51KB implementation (used by the playground,
      which bundles from source). So none of the autocomplete work (scope model,
      introspection bridge, member completion) reaches npm consumers of
      `tjs-lang/editors/codemirror` — they get months-old code. Same for
      monaco/ace `.js`. **Fix: add a build step that compiles/bundles
      `editors/**/\*.ts`→ the published`.js`(wire into`scripts/build.ts`/
`bun run make`) so it stays current automatically.\*\* Not urgent for active
      use cases (user isn't consuming tjs-lang externally yet) but flagged to do
      soon. Context: tosijs-ui's live-example/doc engine now uses tjs (replacing
      sucrase) and is evolving into a portable embeddable playground/IDE — it'll
      switch from ACE to CodeMirror and will want working autocomplete, at which
      point this matters.

## Playground - Introspection-driven autocomplete

The current completion provider was regex-based and useless on real examples
(`extractVariables` matched only `const NAME =`, missing ALL destructuring — and
the tosijs examples bind everything via destructuring). Direction: introspection,
Chrome-console style — run the user's actual code and read real values; predicates
fill the value-grammar leaf (a runtime string can't reveal valid CSS colors). See
the `introspection-autocomplete` memory.

- [x] **Increment 1a — scope-aware symbol model** — `demo/src/scope-symbols.ts`
      (`collectScopeSymbols`, acorn + acorn-loose fallback, destructuring-aware,
      position-scoped, origin-tracking). Wired into `demo/src/autocomplete.ts`
      (replaces the regex extractors, with regex as never-go-blank fallback).
      `todoApp`, `h1`…`button` now complete; `h1` shows `∈ elements`. Tests:
      `demo/src/scope-symbols.test.ts` (11) + provider regression in
      `demo/autocomplete.test.ts`.
- [x] **Increment 1b — introspection bridge** — done. (i) path-aware member
      resolution in `ajs-language.ts` (`getPathBeforeDot`/`resolvePath`/
      `getCompletionsFromPath`) so `todoApp.items.` resolves, not just `todoApp.`.
      (ii) `editors/introspect-value.ts` (serializable, self-contained, injectable) + async `AutocompleteConfig.getMembers` + `demo/src/introspection-bridge.ts`
      (hidden disposable iframe, reuses the run pipeline, direct-`eval` handle into
      module scope, caches last good sandbox) wired via `getMembers` in the
      playground. Tested headlessly through the real `tjsCompletionSource`.
      **Verified working well live** (destructured locals + `todoApp.items.push` + proxy members).
- [ ] **Increment 2 — richer hints from real values** — function arity, `__tjs`
      metadata when present, signature help from the live function.
- [ ] **Increment 3 — argument-type-driven completion (PINNED) — the convergence
      point.** Infer an argument's type from the callee and complete inside it:
      `h1({ style: { color: ⎸ } })` → arg0 is `ElementPart` → suggest `style` →
      CSS values. A vanilla JS function exposes only `.length`/`.name`, so this
      needs the callee to carry `__tjs` whose param is a type-as-example (itself an
      introspectable value — the bridge reads its keys; `style`'s value is a CSS
      predicate → `suggest()`). **Precondition / the pin: rewrite tosijs `style` +
      the elementCreator in TJS** so creators carry `__tjs` example-typed params —
      then it's pure introspection + `suggest()`, no special-casing, no `.d.ts`
      parsing (the "smaller declaration files" payoff). Works TODAY for the user's
      OWN example-typed object-param functions via `getMetadata`/`getSignatureHelp`;
      the one missing primitive is **call-context detection** (enclosing call +
      callee path + arg index + nested-key-vs-value) — unit-testable like
      `collectScopeSymbols`. The `elementParts`/`style` CSS leaf rides this via the
      predicate-schema + `suggest()` work (`src/lang/predicate.ts`).
- [ ] **Increment 4 — completions-as-functions** — let a value/type carry a
      `suggest` hook (annotation / `__suggest`) the bridge calls; transpiles away
      under build options (dev-only, like the strip-safety pattern). The third leg
      of "a language, not a type system."

## Playground - Leverage tjs documentation system

- [ ] tosijs-ui essentially encapsulates most of what we've done with playgrounds in a more reusable way
- [ ] where necessary identify shortcomings in tosijs-ui's build / doc system
- [ ] fold in anything we add / need beyond the new build / doc system

## Playground - Error Navigation

- [ ] Test errors: click should navigate to source location
- [ ] Console errors: click should navigate to source location
- [ ] Error in imported module: click through to source

## Playground - Module Management

- [ ] Import one example from another in playground
- [ ] Save/Load TS examples (consistency with TJS examples)
- [ ] File name should be linked to example name
- [ ] New example button in playground
- [ ] UI for managing stored modules (browse/delete IndexedDB)
- [ ] Auto-discover and build local dependencies in module resolution
- [ ] **Wire `ModuleLoader` into the playground's `tjs()` invocation** for transpile-time cross-file `wasm function` composition (Phase 3 of the wasm-library plan). Today the playground resolves imports at runtime via the local-module store — correct but uses the "boundary form" with a JS↔wasm crossing per call. With a ModuleLoader, imported `wasm function`s would be composed into the consumer's own `WebAssembly.Module` at transpile time, enabling wasm-to-wasm calls (single-digit nanosecond per-call cost). The `wasm-library-consumer.md` example flags this as a known gap. See `src/lang/module-loader.ts` (already shipped) and `wasm-library-plan.md` § Phase 3.

## Language Features

- [x] Honest boolean coercion (TjsStandard) — `Boolean(new Boolean(false))` and friends now return false. Source rewriter wraps every truthiness context (`if`/`while`/`for`/`do`/`!`/`&&`/`||`/`?:`, `Boolean(x)` calls) with `__tjs.toBool` which unwraps boxed primitives. Always-on under `TjsStandard`. Demo: `examples/js-footguns-fixed.tjs`. Doc: `guides/footguns.md`.
- [ ] Intra-function type safety — bring TJS to parity with TS / good linters
  - [ ] **Tier 1 (lint):** `TjsTypedLet` mode — warn/error on `let` without type annotation. Follows the `TjsNoVar` precedent (`src/lang/parser.ts:214`). Severity gated by mode (info under `TjsStandard`, error under `TjsStrict`). ~30 lines in `src/lang/linter.ts`.
  - [ ] **Tier 2 (compile-time inference):** infer `TypeDescriptor` from initializer (already have `src/lang/inference.ts`), store per-decl in scope, walk subsequent `AssignmentExpression` nodes, warn on type-incompatible reassignment. ~200–300 lines, linter-only, no codegen changes.
  - [ ] **Tier 3 (runtime checks, long-term):** rewrite `let x = e` / `x = e` in the JS emitter to `__tjs.checkType(...)` so out-of-band assignments return MonadicError. Open design questions: closed-over `let`s, uninitialized `let x`, perf cost of per-assignment call. Defer until we see how Tier 1+2 land.
- [ ] Audit monadic-error propagation when an error is nested inside a parameter (esp. arrays)
  - Rule: a MonadicError reaching a checked boundary should surface as ONE error, not as data containing an error (e.g. `[5, <error>, 7]`).
  - Caveat: if the function never inspects the param, no error needs to fire — propagation is on-check, not eager.
  - Partial coverage today: input-validation in emitted JS scans top-level array params for an embedded MonadicError and re-propagates it (commit `3db372d`). Other paths likely miss this — return values, deeper nesting (object fields, arrays-of-arrays), function-typed params whose callbacks return arrays containing errors, etc.
  - Investigate: where does a MonadicError survive past a boundary as data? Audit `checkType` in `src/lang/runtime.ts`, the emitted-JS validation prefix in `src/lang/emitters/js.ts`, and `checkFnShape` interaction with array returns.
- [x] Portable Type predicates — expression-only AJS subset (no loops/async, serializable). **Done** as the predicate engine — see the "Predicate types" section above (`src/lang/predicate.ts`).
- [x] Sync AJS / AJS-to-JS compilation — verified-pure predicates compile to native JS with fuel-injection points. **Done** (`compilePredicate`); see "Predicate types" above. (Generalizing this to arbitrary type-checked AJS beyond predicates is the future "propagate verify→native" item.)
- [ ] Self-contained transpiler output (no runtime dependency)
  - Currently transpiled code references `globalThis.__tjs` for pushStack/popStack, typeError, Is/IsNot
  - Requires runtime to be installed or a stub (see playground's manual \_\_tjs stub)
  - Goal: TJS produces completely independent code, only needing semantic dependencies
  - Options: inline minimal runtime (~1KB), `{ standalone: true }` option, or tree-shake
  - See: src/lang/emitters/js.ts TODO comment for details
- [x] WASM compilation at transpile time (not runtime)
  - [x] Compile wasm {} blocks during transpilation
  - [x] Embed base64-encoded WASM bytes in output
  - [x] Include WAT disassembly as comment for debugging/learning
  - [x] Self-contained async instantiation (no separate compileWasmBlocksForIframe)
- [x] Expand WASM support beyond POC
  - [x] For loops with numeric bounds
  - [x] Conditionals (if/else)
  - [x] Local variables within block
  - [x] Typed array access (Float32Array, Float64Array, Int32Array, Uint8Array)
  - [x] Memory operations
  - [x] Continue/break statements
  - [x] Logical expressions (&& / ||)
  - [x] Math functions (sqrt, abs, floor, ceil, min, max, sin, cos, log, exp, pow)
- [x] WASM SIMD support (v128/f32x4)
  - 12 f32x4 intrinsics: load, store, splat, extract_lane, replace_lane, add, sub, mul, div, neg, sqrt
  - Explicit intrinsic approach (users call f32x4\_\* in wasm blocks)
  - Disassembler handles 0xfd prefix with LEB128 sub-opcodes
  - 16-byte aligned memory for v128 loads/stores
  - Demos: starfield SIMD rotation, vector search cosine similarity
- [ ] WASM SIMD vector search (batteries)
  - Replace JS vectorSearch battery with WASM SIMD implementation
  - SIMD cosine similarity demonstrated in vector search demo
  - TODO: integrate as a battery atom with auto-detect + fallback

## Cross-file WASM Libraries (v0.8.0)

Shipped in v0.8.0 — design + history in `wasm-library-plan.md`, user-facing reference in `DOCS-WASM.md`.

- [x] Module consolidation: one `WebAssembly.Module` per file with N exports (was N separate modules sharing memory)
- [x] Transpile-time `ModuleLoader` (`src/lang/module-loader.ts`) — opt-in `.tjs`/`.ts`/`.js` resolution
- [x] `(export)? wasm function NAME(params): RetType { body }` declaration syntax
- [x] Purity enforcement (backend already rejects host imports) + `(!)` unsafe marker reserved
- [x] Cross-file composition: `import { dot } from 'tjs-lang/linalg'` resolves at transpile time
- [x] Wasm-to-wasm `call <index>` instructions (Phase 1.5) — no JS↔wasm boundary on intra-module calls
- [x] Tree-shaking + transitive dep walking in cross-file composition (only reached functions get pulled in)
- [x] Boundary distribution form: same source → self-contained `.js` for non-tjs consumers
- [x] `tjs-lang/linalg` MVP — `dot`, `norm_sq`, `dot_at`, `norm_sq_at` (f32x4 SIMD)
- [x] Canonical 3-way vector-search benchmark proves composed-WASM matches inline perf
- [x] DOCS-WASM.md + TJS-FOR-JS.md additions + playground examples (`wasm-functions.md`, `wasm-library-author.md`, `wasm-library-consumer.md`)
- [x] JSDoc `/** */` blocks extracted by playground docs renderer

### Deferred follow-ups

- [ ] Wire `ModuleLoader` into the playground's `tjs()` invocation so cross-file composition works inside the playground (today the playground resolves imports at runtime — works but uses the boundary form). See `Playground - Module Management` section above for the full note. **High priority — the canonical wasm-library demo runs at boundary-form perf in the playground until this lands.**
- [ ] `i32` / `f32` / `v128` return types in wasm bytecode emitter (currently all returns are f64-or-void). Parsed today via `: RetType` annotation but not driving emission. Needed for top-K (i32 indices) and any wasm function that naturally returns f32 from SIMD.
- [ ] `tjs-lang/linalg` expansion beyond MVP:
  - Vector: `norm`, `normalize`, `add`, `sub`, `scale`, `lerp` (use `out` parameter for buffer results)
  - Matrix: `matmul`, `transpose`, `identity`, `inverse_3x3`, `inverse_4x4`
  - 3D: `cross`, `quat_mul`, `mat4_from_quat`, `look_at`, `perspective`
  - Batched kernels: `cosine_search(corpus, query, count, dim) → bestIdx`, `top_k_cosine(corpus, query, count, dim, k, outIdx, outScores)` (one boundary crossing for the whole workload regardless of K)
- [ ] gl-matrix benchmark — measure linalg vs the standard JS vector library at realistic scale
- [ ] Production `dist/tjs-linalg.js` bundle wired into `scripts/build.ts` (currently `bun` resolves the `.tjs` source directly; production consumers need the pre-transpiled `.js`)
- [ ] SIMD tail-loop for `n` not a multiple of 4 (today callers must pad)
- [ ] Inline `wasm{}` blocks still subject to `==` → `Eq()` rewrite (the inline-block extractor runs after `transformEqualityToStructural`; the new `wasm function` extractor runs before it). Fix: move `extractWasmBlocks` earlier in `preprocess()` too. Pre-existing bug, not introduced by v0.8.0.

## Editor

- [ ] Embedded AJS syntax highlighting

## Documentation / Examples

- [ ] Create an endpoint example
- [ ] Fold docs and tests into one panel, with passing tests collapsed by default (ts -> tjs inserts test; tjs -> js turns test blocks into documentation along with outcomes).
- [ ] Dim/hide the preview tab if nothing ever changed it
- [ ] Single source of truth for version number. I note the badge displayed in console is not matching the version. No hardwired versions -- version number is pulled from package.json and written to version.ts somewhere and that is the single source of truth.

## Production integration feedback (snowfox-app)

Outstanding items from real-world VM integration. See conversation notes; ranked by hours-burned.

- [ ] **`resolveValue` doesn't recurse into plain object literals** — atoms with structured input get `{$expr}` children unresolved. Need canonical `deepResolve(value, ctx)` helper.
- [ ] **Browser-safe entry point (`tjs-lang/browser`)** — main entry pulls `node:fs/promises` (CLI/playground); breaks webpack 4 and similar bundlers.
- [ ] **`evaluateExpr` diagnostics** — when a node has missing required fields, wrap with op name + step location instead of raw `Cannot read properties of undefined`.
- [ ] **`typescript` not resolvable from the main entry** _(confirmed live in 0.8.0–0.8.2 via fresh `npm install` + Node import)_ — `import 'tjs-lang'` throws `Cannot find package 'typescript' imported from dist/index.js`. Cause: `src/lang/index.ts:62` statically re-exports `fromTS`, dragging the TS compiler (~4MB) into `dist/index.js`; `typescript` is only a devDependency, never declared, so Node consumers without it can't import the main entry at all (and it pulls TS at import time → also crashes Cloud Run). The lean `tjs-lang/lang` entry is fine (no fromTS). **Not a 0.8.2 regression** — pre-existing. Fix options: (a) drop the static `fromTS` re-export from the main entry so it's reached only via `tjs-lang/lang/from-ts` (matches the documented usage; makes `import 'tjs-lang'` TS-free) — cleanest, mild breaking change for top-level `fromTS` importers; (b) declare `typescript` as a `peerDependency` (+ optional meta) or `optionalDependency` so it's at least provided/signalled. Recommend (a) + lazy-load. Cut in 0.8.3.
- [ ] **`const` inside `while` loop body** — `constSet` re-runs each iteration and throws "Cannot reassign const variable". Either compile-time error or per-iteration scope.
- [ ] **AgentVM: warn on unknown atoms referenced in source** — currently fails at execution time with `Unknown Atom: foo` and no hint about `batteryAtoms` / user-defined atoms.

## Language subset invariant (TJS ⊇ AJS) — see PRINCIPLES.md

**Invariant:** every legal AJS source must be legal TJS source (and options-off
TJS ⊇ JS). TJS may do _more_ with the same source but must never _reject_ it.
Engraved in `PRINCIPLES.md`. **Now holds** — restored via the signature-test
changes below; guarded by `src/lang/subset-invariant.test.ts`.

- [x] **Signature tests: inconclusive (not error) when un-runnable** — a signature test that can't execute (undefined references like AJS atoms `httpFetch`, or a harness that can't run the module) is now reported as `inconclusive: true` (a warning carrying the reason), never a transpile error. Only a test that _runs and mismatches_ stays a hard failure. New `inconclusive` field on `TestResult`; the strict-mode throw in `js.ts` skips inconclusive results. (Playground: surface the `inconclusive` flag distinctly — see playground TODO.)
- [x] **Multi-function signature-test harness** — the realistic newline-separated multi-function source already executed and validates correctly; only the _same-line_ `} function` edge case failed the harness ("Unexpected keyword 'function'"). That failure is now inconclusive (non-fatal) rather than a transpile error, so the invariant holds either way. (Making same-line two-functions actually execute is a nice-to-have, not required.)
- [x] **Subset guard test** — `src/lang/subset-invariant.test.ts`: representative AJS snippets (helpers with typed sigs, atom-call + return type, helper calling an atom) asserted valid as _both_ AJS and TJS; plain JS asserted valid under options-off TJS; plus controls (un-runnable → inconclusive, genuine mismatch → still throws).

- [x] **Playground: surface inconclusive signature tests** — `renderTestResults` (demo/src/playground-shared.ts) now counts inconclusive separately, renders them with a distinct amber `test-inconclusive`/`test-note` style and a `—` icon (not the ✗ failure), keeps them out of the failure count and editor error markers, and turns the tests-tab indicator amber when only inconclusive. Verified with a happy-dom unit test incl. real transpiler output (`demo/src/playground-test-results.test.ts`).
- [x] **Source dialect (`dialect: 'js' | 'tjs'`)** — public transpile option that sets the modes-on/off default explicitly. `'js'` preserves plain-JS semantics; `'tjs'` (and the bare-string default) is native TJS. Plus extension→dialect helpers `dialectForFilename`/`sourceKindForFilename` from `tjs-lang/lang`, wired into the CLI (check/types/emit/run) so a `.js` file is never silently given TJS semantics. Makes plain JS first-class for hosts (e.g. the tosijs doc system replacing sucrase). `src/lang/dialect.ts`, `src/lang/dialect.test.ts`.
- [ ] **`transpileSource` one-call `js | ts | tjs` sugar** — deferred. A single async call wrapping the route in PRINCIPLES.md ("Routing all three dialects"). It must NOT live in `tjs-lang/lang`: esbuild emits single-file bundles (no code-splitting), so a `fromTS` import — even a dynamic one — gets inlined and drags the TypeScript compiler into the lean, TS-free lang bundle (this broke the `tjs-lang`/`tjs-eval`/`tjs-vm` builds when first attempted). Correct home is a TS-aware entry (the main `tjs-lang` entry already bundles fromTS + externalizes typescript), or switch the bundler to code-splitting. Until then, consumers use the explicit recipe (tjs for js/tjs, fromTS+tjs for ts).

### Deferred enrichment (parity, not invariant)

AJS and TJS share one parser, so AJS already _accepts_ the full signature syntax — input `(!`/`(?` and return `)-!`/`)-?`/`)->` markers, colon/return examples — they just aren't _enforced_ in AJS. Closing that is a nice-to-have, separate from the subset invariant above.

TJS return-marker semantics (reference for when AJS enforcement lands): `)-!` never checks the return + **bypasses the build-time signature test**; `)-?` always checks at runtime; `)->` checks only under global `safety: 'all'`; plain `): T` captures the type + runs the build-time signature test but isn't runtime-asserted (default `safety: 'inputs'`). In AJS today every signature behaves like `)-!` on the return and gets only coarse JSON-Schema validation on inputs (and `n: 0` integer examples currently emit a no-op `{}` schema — a bug).

- [ ] **Signature-as-test in AJS** — TJS already runs the signature example as a transpile-time test (`scale(x:1.5,factor:0.5):0.75` with an inconsistent body fails with "Expected 0.75, got 1.5", `isSignatureTest:true`). AJS runs nothing. The VM can execute the function with the example inputs directly, so AJS is well-positioned to run the same check. Opt-in at first (don't break existing untested agents).
- [ ] **Enrich AJS entry input schema** — `parametersToJsonSchema` currently coarsens examples (`1.5`→`{type:number}`) and, worse, `n: 0` (integer example) emits `{}` — a no-op that validates nothing. JSON Schema can express `{type:integer}` and `{minimum:0}`; capture int / non-negative / number distinctions so the entry contract isn't silently dropped. (Full predicate parity with TJS `checkType` isn't reachable in JSON Schema — defer.)
- [ ] **Validate helper params** — helper bodies currently bind args by position with no validation (only arity is checked at transpile). For least-astonishment, helpers should honor their param examples like the entry function once AJS enforcement lands.

### Completed in current session

- [x] **Local helper functions / `TOOL_LIBRARY` pattern** — AJS agent source may now declare multiple top-level functions: the **last** is the entry point, the rest are helpers. Implemented **option 2** (by-reference `callLocal` + per-agent helper table), chosen over inlining because it supports recursion (bounded by fuel/timeout + a `MAX_CALL_DEPTH=256` host-stack guard) and keeps the AST compact (helper bodies stored once, not duplicated per call site — matters since AJS AST travels as data). Helpers run in isolated scopes (top-level siblings, no closure over caller locals). Helper calls must live at statement level (can't be nested in expressions, like template literals); recursion is a runtime loop, not a transpile error. See `src/use-cases/local-helpers.test.ts`, `extractFunctions` (parser), `ensureHelperTransformed`/`callLocal` emit (emitters/ast.ts), `callLocal` atom (vm/runtime.ts).
- [x] `llmPredictBattery` now has `timeoutMs: 120000` (was using default 1000ms — broken for any real LLM call) + regression test in `batteries.test.ts`.
- [x] `typesVersions` fallback in `package.json` so legacy `moduleResolution: node` consumers can resolve `tjs-lang/vm`, `tjs-lang/lang`, `tjs-lang/batteries` etc.
- [x] **Per-atom `timeoutMs` override** — `vm.run({ timeoutOverrides: { llmPredictBattery: 60000 } })` now works, mirroring the existing `costOverrides` pattern. Supports `number` and `(input, ctx) => number`; `0` disables the per-atom timeout. New `TimeoutOverride` type exported from `tjs-lang/vm`. See `src/use-cases/timeout-overrides.test.ts`.
- [x] **Replaced `vm.run` default `timeoutMs = fuel × 10ms` formula** — now derived from the registered atoms as `max(per-atom timeoutMs) × 2`, floored at 60s (`AgentVM.defaultRunTimeout`). A fixed 60s default (interim) was shorter than the 120s `llmVision`/`llmPredictBattery` budgets, so vision/LLM calls timed out mid-call on slower models; the atom-derived default always covers the slowest atom (and a chained pair) and self-adjusts to custom slow atoms. Updated timeout error message to point at `timeoutMs` / `timeoutOverrides` instead of "increase fuel".
- [x] **`storeVectorize` / `storeVectorAdd` get `timeoutMs: 60000`** — both make embedding network calls but had the 1s atom default, so a cold embedding model timed out. (Same class as the llmVision/llmPredict 120s budgets, missed for the store atoms.) Local ops (`storeSearch`, `storeCreateCollection`) keep the default.

- [x] **Vision-detection probe used a degenerate 1×1 PNG** — real vision preprocessors reject it (gemma-4-e4b: HTTP 400 "Cannot handle this data type: (1,1,1)"), so a genuinely multimodal model was false-negatived as `vision: false` and vision examples skipped with "no vision model available". Probe now uses a valid 32×32 PNG (gemma returns 200). `src/batteries/audit.ts`.

### Deferred (surfaced this session)

- [ ] **Model-audit vision detection still only checks `res.ok`** (`audit.ts` checkVision) — a text model that _tolerates_ the multimodal format without erroring would false-positive. Stronger: check the _response content_ (does the model actually describe the image?). Lower priority now that the 1×1 false-negative is fixed.

## Infrastructure

- [ ] Make playground components reusable for others
- [ ] Web worker for transpiles (freezer - not needed yet)
- [x] Retarget Firebase as host platform (vs GitHub Pages)
- [ ] Universal LLM endpoint with real LLMs (OpenAI, Anthropic, etc.)
- [ ] ESM-as-a-service: versioned library endpoints
- [ ] User accounts (Google sign-in) for API key storage
- [ ] AJS-based Firestore and Storage security rules
- [ ] npx tjs-playground - run playground locally with LM Studio
- [ ] Virtual subdomains for user apps (yourapp.tjs.land)
  - [ ] Wildcard DNS to Firebase
  - [ ] Subdomain routing in Cloud Function
  - [ ] Deploy button in playground
  - [ ] Public/private visibility toggle
- [ ] Rate limiting / abuse prevention for LLM endpoint
- [ ] Usage tracking / billing foundation (for future paid tiers)

## Dependencies & Tooling

Follow-ups from the ESLint 8 → 10 + typescript-eslint 5 → 8 flat-config migration:

- [ ] **Decide package-lock.json policy.** Repo is bun-primary (bun.lock is canonical). The committed `package-lock.json` is stale (still references the old eslint v5 tree) and a fresh npm re-resolve balloons it by ~6k lines (full firebase-admin/google-cloud tree) and needs `--legacy-peer-deps` (pre-existing `tosijs-ui` wants `marked@^16` vs pinned `marked@9`). Either regenerate it in its own commit or remove it and let bun.lock be the sole lockfile.
- [ ] **Clean up 22 pre-existing lint warnings** (unused vars/imports, prefer-const) — surfaced by `bun eslint src`, predate the migration (same `no-unused-vars`/`^_` config), all warnings not errors. Low-risk dead-code sweep across ~10 files.
- [ ] **Dev-dependency vulns (none shipped to consumers).** `npm audit` shows 28, all dev/peer: Firebase SDK + admin stack, the vitest/vite/esbuild/rollup chain (vitest _critical_, genuinely used by 5 test files → needs v3 major), happy-dom, valibot, ws. Plus one eslint-transitive straggler: `flatted@3.3.3` via `file-entry-cache → flat-cache` (non-major fix).
- [ ] **Resolve the `marked` peer conflict** — `tosijs-ui` peers on `marked@^16`, repo pins `marked@9.1.6` (bun warns + installs; npm refuses without `--legacy-peer-deps`).

## Self-hosting (TS feature coverage)

Four `it.skip` cases in `src/use-cases/self-hosting.test.ts` — advanced TS that the
TS→TJS path can't yet handle. Un-skip as support lands:

- [ ] Class with private fields and methods (gated on class support)
- [ ] Builder pattern with method chaining (gated on class support)
- [ ] Complex decorator patterns (requires `experimentalDecorators`)
- [ ] Module augmentation (type-only, no runtime code)

(Also 4 unconditional skips in `src/lang/metadata-cache.test.ts` — the transpile
metadata-cache feature is stubbed: store/retrieve, version-invalidation, merge,
prune.)

## Batteries / LLM tests

- [ ] **Audit misclassifies models under concurrent probing.** Many test files call `LocalModels.audit()` at once, sharing one `.models.cache.json` (cwd, 24h TTL). Clearing the cache before a parallel `bun test` makes several audits probe LM Studio simultaneously and classifications come back scrambled (embedding models tagged `LLM`, an LLM tagged `Embedding`). Tests stay green only by luck of ordering. Fix: serialize the audit, harden the probes, or isolate the cache per run. Workaround documented in [`docs/lm-studio-setup.md`](docs/lm-studio-setup.md). Surfaced 2026-06-10 while getting the LLM suite green.

---

## Completed (this session)

### Project Rename

- [x] Rename from tosijs-agent to tjs-lang
- [x] Update all references in package.json, docs, scripts

### Timestamp & LegalDate Utilities

- [x] Timestamp - pure functions, 1-based months, no Date warts (53 tests)
  - now, from, parse, tryParse
  - addDays/Hours/Minutes/Seconds/Weeks/Months/Years
  - diff, diffSeconds/Minutes/Hours/Days
  - year/month/day/hour/minute/second/millisecond/dayOfWeek
  - toLocal, format, formatDate, formatTime, toDate
  - isBefore/isAfter/isEqual/min/max
  - startOf/endOf Day/Month/Year
- [x] LegalDate - pure functions, YYYY-MM-DD strings (55 tests)
  - today, todayIn, from, parse, tryParse
  - addDays/Weeks/Months/Years
  - diff, diffMonths, diffYears
  - year/month/day/dayOfWeek/weekOfYear/dayOfYear/quarter
  - isLeapYear, daysInMonth, daysInYear
  - toTimestamp, toUnix, fromUnix
  - format, formatLong, formatShort
  - isBefore/isAfter/isEqual/min/max/isBetween
  - startOf/endOf Month/Quarter/Year/Week
- [x] Portable predicate helpers: isValidUrl, isValidTimestamp, isValidLegalDate

### TJS Mode System (native TJS has all modes ON by default; TS-originated code defaults to OFF)

- [x] Invert mode system - native TJS enables all modes; TS-originated/AJS code defaults to JS semantics
- [x] TjsEquals directive - structural == and != (null == undefined)
- [x] TjsClass directive - classes callable without new
- [x] TjsDate directive - bans Date constructor/methods
- [x] TjsNoeval directive - bans eval() and new Function()
- [x] TjsStrict directive - enables all of the above
- [x] TjsSafeEval directive - includes Eval/SafeFunction for dynamic code execution
- [x] Updated Is() for nullish equality (null == undefined)
- [x] Added Is/IsNot tests (structural equality, nullish handling)
- [x] TjsStandard directive - newlines as statement terminators (prevents ASI footguns)
- [x] WASM POC - wasm {} blocks with parsing, fallback mechanism, basic numeric compilation
- [x] Eval/SafeFunction - proper VM-backed implementation with fuel metering and capabilities

### Bundle Size Optimization

- [x] Separated Eval/SafeFunction into standalone module (eval.ts)
- [x] Created core.ts - AJS transpiler without TypeScript dependency
- [x] Fixed tjs-transpiler bundle: 4.14MB → 88.9KB (27KB gzipped)
- [x] Runtime is now ~5KB gzipped (just Is/IsNot, wrap, Type, etc.)
- [x] Eval adds ~27KB gzipped (VM + AJS transpiler, no TypeScript)
- [x] TypeScript only bundled in playground (5.8MB) for real-time TS transpilation
