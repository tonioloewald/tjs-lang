# TJS-Lang TODO — Archive

Shipped/completed work moved out of `TODO.md` to keep the live backlog lean. The
authoritative record of what shipped and when is `CHANGELOG.md` (complete back to
0.2.0) and the git history; this file preserves the detailed task breakdowns and
design notes that don't belong in the changelog.

---

## AJS parsing structurally isolated from TJS parsing (DONE 2026-09-03)

`src/lang/parser-agent.ts`. The inversion filed on 2026-08-02 after the `test`-block RCE.

**The classification was the work, and it came out lopsided.** The expectation was ~30
transforms to sort into two piles. The AJS-legal pile is **four steps**: blank a hashbang
(ES2023, so inside the JS subset AJS is), strip line comments, `transformParenExpressions`
(colon shorthand — the one thing AJS has that JavaScript does not, and load-bearing, since the
entry function's parameter examples _are_ the agent's input contract), and
`extractParamMarkers`. Everything else in `preprocess` is TJS-only. That is the finding: AJS
was running ~26 transforms for constructs it does not have, and the two `vmTarget` checks were
never going to be the right number because the flag was answering the wrong question.

**What shipped:**

- `preprocessAgentSource()` / `parseAgentSource()` in a **separate file**, not a branch in
  `parser.ts`. The two AJS entry points (`core.ts`, `lang/index.ts` `transpile`) call it
  directly.
- **`vmTarget` deleted** — from `ParseOptions`, `PreprocessOptions`, `parse()`, and the three
  places in `preprocess` that consulted it. Not deprecated, removed. A flag nobody passes is a
  flag nobody has to check, and the four dead `{ vmTarget: true }` call sites left in tests
  were removed with it so nothing suggests the option still does something.
- All seven leaks (bang access, `Is`, inline `wasm function`, `Type`, `Generic`, `extend`,
  `FunctionPredicate`) closed **at once, none of them individually** — which is the whole
  argument for layering over gating, demonstrated rather than asserted.

**Two guards, because the behavioural one alone repeats the original mistake.**
`eval-no-transpile-execution.test.ts` gained a source-level scan pinning the exact import set
of `parser-agent.ts` (the `atom-effects-scan.test.ts` technique): a new transform reaching AJS
turns it red at the import, before anyone has to think of a construct that exercises it. The
existing behavioural ratchet stays, with `KNOWN_LEAKS` now **empty** — and an empty list is the
sharpest version of that assertion. Both were mutation-tested by re-adding `transformBangAccess`
to the AJS pipeline; both fail, at different layers.

**One behaviour change beyond the leak list.** Duplicate same-name top-level functions used to
be caught by TJS's polymorphic-merge pass leaking onto the AJS path ("ambiguous signatures");
they are now caught by acorn ("Identifier 'dup' has already been declared"). Same rejection,
now from the rule that actually governs the language — a duplicate top-level declaration is a
module-scope error in JavaScript, and AJS is a JavaScript subset. `local-helpers.test.ts`
updated.

**The rule going forward, recorded in `parser-agent.ts`'s header:** the bar for adding a step
to the AJS pipeline is _does AJS have this construct_. Not "is it harmless" — inertness is
exactly what all seven leaks had, right up until one of them called `new Function`.

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
