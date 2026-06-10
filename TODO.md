# TJS-Lang TODO

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
- [ ] Portable Type predicates - expression-only AJS subset (no loops, no async, serializable)
- [ ] Sync AJS / AJS-to-JS compilation - for type-checked AJS that passes static analysis, transpile to native JS with fuel injection points. Enables both type safety guarantees AND native performance for RBAC rules, predicates, etc.
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
