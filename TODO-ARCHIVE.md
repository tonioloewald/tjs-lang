# TJS-Lang TODO — Archive

Shipped/completed work moved out of `TODO.md` to keep the live backlog lean. The
authoritative record of what shipped and when is `CHANGELOG.md` (complete back to
0.2.0) and the git history; this file preserves the detailed task breakdowns and
design notes that don't belong in the changelog.

---

## ▶ Resume here — 0.9.1 SHIPPED (npm `latest` = 0.9.1, tag `v0.9.1` pushed)

**0.9.1 is published** — npm `latest` = 0.9.1, git tag `v0.9.1` on the remote,
`main` pushed. Release validated end-to-end in Node from the packed tarball (fresh
`npm install`, NO typescript): `import 'tjs-lang'` works, `tjs-lang/{lang,css,
schema,runtime,vm}` resolve, the predicate-verification report + `TjsStrict` throw
work, a SIMD min/max kernel compiles to WASM, and the `__tjs_wasm_ready`/
`__tjs_wasm_enabled` controls are in the emitted output.

**0.9.1 ships (post-0.9.0):** `TjsStrict` escalates unverifiable predicates to a
transpile error (+`tjsStrict` mode flag); the **full tosijs-ui WASM feedback** —
silent-`wasm{}`-fallback surfaced into `result.warnings` (UI-#1), `await
__tjs_wasm_ready()` (UI-#2), `__tjs_wasm_enabled` toggle (UI-#3),
i32/i32-division lint + supported-subset docs (UI-#4/#5), and **`f32x4`
min/max/compare/select** for data-dependent SIMD (UI-#6). No breaking changes.

**Prev (0.9.0, published 2026-07-06):** predicate verification (Type/Generic guards,
ReDoS lint, per-predicate report), `tjs-lang/css`, `tjs-lang/schema`,
`tjs-lang/runtime` + `/bun-plugin`, dts bare-param fix + `generateDTS` export,
editors-from-source. Mild breaking: `fromTS` off the main entry.

**0.9.0 ships (25+ commits since 0.8.7):** predicate verification wired into
`Type` **and** `Generic` (fuel-bounded DoS-safe native guards, graceful fallback);
ReDoS lint + per-predicate verification status on the `tjs()` result
(`result.predicates`/`warnings`); `$predicate` keyword + `createPredicateEvaluator`;
**`tjs-lang/schema`** (tosijs-schema `1.4.0` pre-wired, batteries-included);
**`tjs-lang/css`** (full CSS predicate library); **`tjs-lang/runtime`** +
**`tjs-lang/bun-plugin`** exports; `generateDTS` reachable from `tjs-lang/lang` +
the bare-param `.d.ts` fix; `editors/*` rebuilt-from-source. **Mild breaking:**
`fromTS` no longer re-exported from the main entry — use `tjs-lang/lang/from-ts`.

(Post-publish cross-repo adoption items — tosijs/tosijs-ui bumps — are owned by
those repos' agents. `deploy:hosting` done.)

---

## tosijs-ui adoption feedback (`../tosijs-ui/TJS-FEEDBACK.md`, vs 0.8.7) — all shipped 0.9.0/0.9.1

Second real consumer — the **live-example transpiler** + a first inline-WASM demo.

- [x] **UI-#7 stale `editors/codemirror` build** — RESOLVED by the editors-build-from-source
      fix; the built `ajs-language.js` now exports `tjsEditorExtension`/`tjsCompletionSource`/
      `AutocompleteConfig`.
- [x] **UI-#1 silent `wasm{}` fallback — FIXED 2026-07-06.** `transpileToJS` mirrors each
      failed block into `result.warnings`. Tests: `src/lang/wasm-fallback-warning.test.ts`.
- [x] **UI-#5 document the supported `wasm{}` control-flow subset — DONE 2026-07-06.**
      DOCS-WASM.md § "Supported subset". Unsupported now warns rather than silently falling back.
- [x] **UI-#2 awaitable WASM ready signal — DONE 2026-07-06.** `globalThis.__tjs_wasm_ready()`
      awaits all module instantiation promises. Tests: `src/lang/wasm-ready.test.ts`.
- [x] **UI-#3 public WASM enable/disable toggle — DONE 2026-07-06.**
      `globalThis.__tjs_wasm_enabled = false` forces every block to its `fallback{}`.
- [x] **UI-#4 silent i32/i32 integer division — DONE 2026-07-06.** Documented + auto-linted
      (warns once per block on genuine i32/i32). Tests: `src/lang/wasm-intdiv-lint.test.ts`.
- [x] **UI-#6 `f32x4` compare/select/min/max — DONE 2026-07-06.** `f32x4_min`/`max`, the
      comparison mask ops, and `f32x4_select` (branch-free blend) → data-dependent SIMD.
      Tests: `src/lang/wasm-simd-ops.test.ts`. Closes the entire tosijs-ui WASM feedback (UI-#1..#7).

---

## Editors — published `.js` is stale — FIXED 2026-07-02

- [x] **The `tjs-lang/editors/*` subpaths shipped hand-maintained `.js` files not built
      from the `.ts` sources** (months-old code reached npm consumers). **Fixed:**
      `scripts/build-editors.ts` bundles each entry from its `.ts` (esbuild, ESM, unminified;
      externalizes the framework it augments + the acorn stack), wired into `bun run make`.
      The 3 `.js` are prettier-ignored so they stay byte-identical to esbuild output, and
      `editors/editors-build.test.ts` re-bundles in memory and asserts byte-equality — so a
      `.ts` edit without a rebuild fails CI (no more silent drift).

---

## Completed (early sessions)

### Project Rename

- [x] Rename from tosijs-agent to tjs-lang
- [x] Update all references in package.json, docs, scripts

### Timestamp & LegalDate Utilities

- [x] Timestamp — pure functions, 1-based months, no Date warts (53 tests)
- [x] LegalDate — pure functions, YYYY-MM-DD strings (55 tests)
- [x] Portable predicate helpers: isValidUrl, isValidTimestamp, isValidLegalDate

### TJS Mode System (native TJS has all modes ON by default; TS-originated code defaults to OFF)

- [x] Invert mode system — native TJS enables all modes; TS-originated/AJS code defaults to JS semantics
- [x] TjsEquals / TjsClass / TjsDate / TjsNoeval / TjsStrict / TjsSafeEval / TjsStandard directives
- [x] `Is()`/`IsNot` for structural + nullish equality (null == undefined)
- [x] WASM POC — `wasm {}` blocks with parsing, fallback, basic numeric compilation
- [x] Eval/SafeFunction — VM-backed implementation with fuel metering and capabilities

### Bundle Size Optimization

- [x] Separated Eval/SafeFunction into standalone module (eval.ts)
- [x] Created core.ts — AJS transpiler without TypeScript dependency
- [x] tjs-transpiler bundle: 4.14MB → 88.9KB (27KB gzipped); runtime ~5KB gzipped; Eval ~27KB gzipped
- [x] TypeScript only bundled in playground (5.8MB) for real-time TS transpilation
