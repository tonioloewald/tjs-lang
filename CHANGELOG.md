# Changelog

All notable changes to **tjs-lang** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Flight recorder** (#17). The `__tjs` error ring buffer is now a black box for the whole
  runtime, not just a type-error log. New API on the module, the runtime object, and every
  `createRuntime()` instance: `record(entry)`, `records(filter?)`, `clearRecords()`,
  `getRecordCount()`, `getDroppedCount()`. Records carry a `source`
  (`type`/`wasm`/`vm`/`app`/…) and a `severity` (`error`/`warning`/`notice`), and can be
  filtered by either.
  - **Reports today:** type errors; `wasm{}` blocks that fell back to JS or failed to
    instantiate; typed arrays copied in and out on every call because they weren't
    allocated with `wasmBuffer()` (previously silent, and can be slower than plain JS);
    every VM failure — fuel exhaustion, atom timeout, capability denial.
  - **Records once per site, never per call** — a recorder that fires inside a hot loop
    becomes the performance problem it exists to detect.
  - **`errors()` is unchanged** and still returns type errors _only_, so the documented
    `clearErrors()` → run → expect-none idiom keeps working. Notices never leak into it.
  - Emitted modules mirror their records into the installed global runtime, so a page with
    several TJS modules has one flight history rather than N isolated ones. Standalone
    emitted code (inline fallback runtime) starts reporting as soon as a runtime is
    installed, even if it loaded before one existed.
  - Recording never throws, never logs unbidden, and never alters control flow.
- Type-system north-star design note (`docs/type-system-north-star.md`):
  JSON-Schema + `$predicate` as the single source of truth for TJS types.

### Fixed

- WASM module instantiation failures were swallowed by a bare `.catch(() => {})` in the
  emitted bootstrap — the module vanished without a trace while every `wasm{}` block in
  the file silently ran its JS fallback. Now recorded as a warning.
- The inline runtime core (`MonadicError` + `typeError` + `isMonadicError`) was emitted
  from three copy-pasted source strings. A file needing `checkFnShape` **and** bang access
  without `typeError` would have declared `class MonadicError` twice in one scope (a
  `SyntaxError` in the emitted output). Not reachable in practice — but held shut by
  coincidence, not design. Now one definition, emitted once.

### Documentation

- CLAUDE.md now defers cross-project defaults to `../tosijs-coding-practices`, recording
  only tjs-lang-specific divergences.
- Explained why the full build is named `make`, not `build` (`bun build` is a Bun
  builtin — a `build` script would be silently shadowed).
- `src/docs-index.test.ts` enforces that `llms.txt` indexes every top-level/`docs/`
  markdown file and every `package.json` entry point, and that its links resolve.
- Added a `pre-commit` hook (`.githooks/`, enabled by the `prepare` script) that checks
  **staged files only** with Prettier and ESLint, plus a repo-wide `bun run format:check`.

## [0.9.1] — 2026-07-11

No breaking changes.

### Added

- **Inline-WASM developer feedback** (from tosijs-ui adoption):
  - Silent `wasm{}` fallback now surfaces in `result.warnings` (UI-#1).
  - `await __tjs_wasm_ready()` awaitable ready signal (UI-#2).
  - `__tjs_wasm_enabled` enable/disable toggle (UI-#3).
  - `f32x4` min/max, comparisons, and `select` for data-dependent SIMD (UI-#6).
- Auto-lint for `i32 / i32` integer division, a WASM footgun (UI-#4), plus
  supported-control-flow-subset docs (UI-#5).

### Changed

- `TjsStrict` now escalates an unverifiable predicate to a **transpile error**
  (default remains warn-only, preserving the subset invariant).

## [0.9.0] — 2026-07-06

### Added

- **Predicate verification** wired into `Type` **and** `Generic` guards — verified
  predicates compile to fuel-bounded, DoS-safe native JS, with graceful fallback.
- Per-predicate verification status on the `tjs()` result (`result.predicates`,
  mirrored into `result.warnings`); exported `PredicateVerification` from `tjs-lang/lang`.
- ReDoS lint: the verifier rejects ReDoS-prone regexes.
- New package subpaths: **`tjs-lang/css`** (verified-predicate CSS validators —
  colors, dimensions, order-flexible shorthands, recursive style structure,
  `$predicate` schema builders, property-aware validation), **`tjs-lang/schema`**
  (tosijs-schema pre-wired with `$predicate` support), **`tjs-lang/runtime`**, and
  **`tjs-lang/bun-plugin`**.
- `$predicate` JSON-Schema keyword + `createPredicateEvaluator` (the tosijs-schema bridge).
- `generateDTS` reachable from `tjs-lang/lang`; `editors/*` rebuilt from source.

### Fixed

- `.d.ts` emitter: bare params are required positions, not optional (valid TS).
- TS→TJS (`fromTS`) no longer leaks raw TS into `Type`/`Generic` blocks.

### Changed (mildly breaking)

- **`fromTS` is no longer re-exported from the main entry** — import it from
  `tjs-lang/lang/from-ts` (keeps the TypeScript compiler out of the main bundle).

## [0.8.7] — 2026-07-01

### Added

- First-class **predicate-safety verifier** (`src/lang/predicate.ts`) + fuel-bounded,
  global-shadowed native predicate compiler.
- Atom `effects: 'pure' | 'io'` tag — the predicate-safety keystone.
- `suggest()` — autocomplete completions mined from predicate clusters.
- Introspection-driven, destructuring-aware playground autocomplete (scope-aware
  symbol model + runtime-truth member completion via an introspection bridge).

### Fixed

- Bare-assignment auto-`const` must not touch plain JS or redeclare bindings.
- A doc comment must start a line (mid-line `/*#` and `/**` are ignored).

## [0.8.2] — 2026-06-24

### Added

- Explicit **source dialect** (`js | tjs`) + extension-based resolution; restores the
  **TJS ⊇ AJS** subset invariant.
- AJS local helper functions.
- Playground surfaces inconclusive signature tests as a distinct state.

### Fixed

- Run-level default timeout = `max(atom timeout) × 2` (was a fixed 60s).
- Generous timeouts on embedding IO atoms (`storeVectorize`/`storeVectorAdd`).
- `.prettierignore` narrowed so `format` isn't ~50× slower.

## [0.8.1] — 2026-06-10

### Fixed

- Broken npm main entry (index bundle) + structured-output `predict` fix.
- `predict()` omits an empty `tools` array so structured output works.
- Robust SIMD speedup timing in the demo (no more "Infinityx" in Firefox).

### Changed

- Migrated to ESLint 10 + typescript-eslint 8 flat config.

## [0.8.0] — 2026-05-14

### Added

- **Cross-file WASM libraries**: composable `wasm function` declarations,
  transpile-time module composition (wasm-to-wasm `call` resolution), and the
  `tjs-lang/linalg` SIMD stdlib subpath. See `wasm-library-plan.md`.

---

Releases before 0.8.0 predate this changelog. See the git tags (`git tag`) and
`git log` for that history.

[Unreleased]: https://github.com/tonioloewald/tjs-lang/compare/v0.9.1...HEAD
[0.9.1]: https://github.com/tonioloewald/tjs-lang/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.7...v0.9.0
[0.8.7]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.2...v0.8.7
[0.8.2]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/tonioloewald/tjs-lang/releases/tag/v0.8.0
