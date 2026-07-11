# TJS-Lang TODO

## ▶ Resume here — 0.9.1 PREPPED, awaiting `npm publish` (user/fingerprint)

Version bumped to **0.9.1**; **dist built** (`bun run make`, 0.9.1 inlined into
`tjs-runtime`) and **validated end-to-end in Node from the packed tarball** (fresh
`npm install`, NO typescript): `import 'tjs-lang'` works, `tjs-lang/{lang,css,
schema,runtime,vm}` resolve, the predicate-verification report + `TjsStrict` throw
work, a SIMD min/max kernel compiles to WASM, and the `__tjs_wasm_ready`/
`__tjs_wasm_enabled` controls are in the emitted output. **To publish: `npm
publish` from this working dir** (no prepublishOnly hook — dist must be present;
it is; don't `rm -rf dist`). Tag `v0.9.1` at the release commit (done locally).

**0.9.1 ships (post-0.9.0):** `TjsStrict` escalates unverifiable predicates to a
transpile error (+`tjsStrict` mode flag); the **full tosijs-ui WASM feedback** —
silent-`wasm{}`-fallback surfaced into `result.warnings` (UI-#1), `await
__tjs_wasm_ready()` (UI-#2), `__tjs_wasm_enabled` toggle (UI-#3), i32/i32-division

- supported-subset docs (UI-#4/#5), and **`f32x4` min/max/compare/select** for
  data-dependent SIMD (UI-#6). No breaking changes.

**Prev (0.9.0, published 2026-07-06):** predicate verification (Type/Generic guards,
ReDoS lint, per-predicate report), `tjs-lang/css`, `tjs-lang/schema`,
`tjs-lang/runtime` + `/bun-plugin`, dts bare-param fix + `generateDTS` export,
editors-from-source. Mild breaking: `fromTS` off the main entry.

Adoption in `../tosijs` and `../tosijs-ui` is owned by THOSE repos' agents — don't
drive their bumps from here; feedback flows back via `TJS-PORT-DX.md` /
`TJS-FEEDBACK.md`. 0.9.1 unblocks tosijs-ui's inline-WASM workstream.

**0.9.0 ships (25+ commits since 0.8.7):** predicate verification wired into
`Type` **and** `Generic` (fuel-bounded DoS-safe native guards, graceful fallback)

- ReDoS lint + per-predicate verification status on the `tjs()` result
  (`result.predicates`/`warnings`); `$predicate` keyword + `createPredicateEvaluator`
- **`tjs-lang/schema`** (tosijs-schema `1.4.0` pre-wired, batteries-included);
  **`tjs-lang/css`** (full CSS predicate library — colors/dimensions/shorthands/
  recursive structure + `$predicate` schema builders + property-aware validation,
  ~0.5ms/theme); **`tjs-lang/runtime`** + **`tjs-lang/bun-plugin`** exports;
  `generateDTS` reachable from `tjs-lang/lang` + the bare-param `.d.ts` fix (valid
  TS); `editors/*` rebuilt-from-source (fixes tosijs-ui autocomplete blocker);
  `TjsDate` `performance.now()` hint. **Mild breaking change:** `fromTS` no longer
  re-exported from the main entry — use `tjs-lang/lang/from-ts`.

**Post-publish (unblocks the two experiments):**

- [ ] tosijs port (`../tosijs`) — adopt `tjs-lang/css`/`schema`/`runtime`, the dts
      bridge; bump its `tjs-lang` dep to `^0.9.0`.
- [ ] tosijs-ui (`../tosijs-ui`) — adopt the CodeMirror autocomplete
      (`tjsEditorExtension`/`tjsCompletionSource`, now shipped); bump the
      live-example CDN pin (`code-transform.ts` `TJS_CDN`/`FROM_TS_CDN`, currently
      `@0.8.2`) to `@0.9.0`.
- [ ] `bun run deploy:hosting` to refresh the playground/site.

**Big-picture next (see memories):** consolidate onto tosijs-ui's doc-system /
`<tosi-example>` (transpile-option toggles, port the CodeMirror autocomplete, dogfood
tjs-lang's own docs → verified book/ePub/PDF), then retire the bespoke playground.
Pinned: argument-type-driven completion (needs TJS-native tosijs so element factories
carry `__tjs`). See [[introspection-autocomplete]], [[predicate-types-direction]].

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
- [~] **#5 Wire into `FunctionPredicate` / `Type`** — predicate bodies authored in this verified-safe substrate; the real consumer.
  - [x] **`Type … { predicate(x){…} }` — DONE 2026-07-02.** A `Type` predicate body now runs through the verifier at transpile time: if predicate-safe it compiles to a self-contained, fuel-bounded native guard (DoS-safe — a runaway input returns `false`, never hangs/throws to the caller); if not, it falls back to the raw arrow (never rejected — TJS ⊇ JS). New `emitVerifiedPredicate(source, entryName, opts)` in `src/lang/predicate.ts` (the transpile-time counterpart to `compilePredicate`, emits a self-contained IIFE **source string** — no engine/`__tjs` runtime dep), exported from `tjs-lang/lang`. Wired into both predicate branches of `transformTypeDeclarations` (the example schema-gate is preserved as an outer check). The verifier now whitelists the TJS-injected pure helpers `Eq`/`NotEq`/`Is`/`IsNot`/`TypeOf`, so native-TJS predicates using `==`/`typeof` still verify. Tests: `src/lang/emit-verified-predicate.test.ts` (7), `src/lang/type-verified-predicate.test.ts` (5); runtime-smoke verified `Pos.check(5)=true / check(-1)=false`.
  - [x] **Warn + strict-error on fallback (= #9 from the tosijs port) — DONE 2026-07-05/06.** `tjs()` surfaces per-predicate verification status: `result.predicates: PredicateVerification[]` (`{name, kind:'Type'|'Generic', verified, reason?}`), and each unverified predicate is mirrored into `result.warnings`. Plumbed transform → `preprocess` return (`predicates`) → `transpileToJS` result; `verifiedGuardExpr` reports verified/fallback with the verifier reason (internal `__pred_` name stripped). Exported `PredicateVerification` from `tjs-lang/lang`. **Strict escalation (2026-07-06):** under the explicit `TjsStrict` directive an unverifiable predicate throws a transpile error (subset invariant: warn by default, error only on opt-in). Added a distinguishing `tjsStrict` flag to `TjsModes` (native TJS has all modes on by default but is NOT strict unless the directive is written); checked in `transpileToJS`. Tests: `src/lang/predicate-report.test.ts` (8, incl. strict throws / non-strict warns / strict+safe passes).
  - [x] **Extend to `Generic` — DONE 2026-07-03.** Generic-Type predicates now verify too: the type-param checks (`T(x)` → `checkT(x)`) are passed as `knownPredicates`, so the verifier treats them as composition with another safe predicate. Safe → fuel-bounded guard, else raw fallback. `verifiedGuardExpr` gained a `knownPredicates` arg; wired into `transformGenericDeclarations`. Tests: `src/lang/generic-verified-predicate.test.ts` (3); verified the guard composes when given a real check fn (`guard({value:5}, isNum)=true`).
  - [ ] **`FunctionPredicate` — confirm no verify step.** It declares a function _shape_ (params/returns), not a boolean predicate body, so there's likely nothing to verify. Confirm and close.
  - [ ] **Pre-existing (surfaced 2026-07-03, orthogonal to verification): standalone `Generic` runtime passes raw type-args, not resolved check functions.** The inline emitted `Generic(tp, pred, d)` stub does `check: v => pred(v, ...args)`, so `Box(0).check({value:5})` calls the predicate with `checkT = 0` (the example) → `checkT is not a function`. Affects generic type-param _composition_ at runtime in standalone output, independent of (and predating) the verification work — the verified guard itself composes correctly when handed real check functions. Check whether the full `createRuntime().Generic` resolves type-args into predicates and, if so, why the emitted standalone stub doesn't.
- [x] **#6 (tjs-lang side) the `$predicate` keyword + reference evaluator** — `src/lang/predicate-schema.ts` (`compilePredicateSchema` / `validatePredicateSchema`, exported from `tjs-lang/lang`). A JSON-Schema node carries `$predicate` (predicate-cluster _source_; trivially serializable, the verifier makes it safe to run). Structural keywords (type/properties/required/items) validate for everyone; `$predicate` runs only for aware validators → progressive enhancement. Demoed on CSS (`experiments/predicates/css-schema.demo.test.ts`): same JSON, naive sees `string`, aware validates var()/calc()/!important + recursion. Gotcha noted: embed predicate source via `String.raw` (regex backslashes) — moot in real JSON.
- [x] **#6 (production) wire `$predicate` into tosijs-schema — DONE 2026-07-03.** The blog's payoff, working across both repos. Design constraint: **tjs-lang depends on tosijs-schema**, so tosijs-schema can't depend on tjs-lang (circular) — solved with a **pluggable evaluator**. tosijs-schema (sibling repo, committed, NOT published): `$predicate?: string` on `JSONSchema`, a `PredicateEvaluator` type + `setPredicateEvaluator`/`getPredicateEvaluator`, and a run-`$predicate`-after-type-check hook in `walk` — stays zero-dep; ignores `$predicate` until an evaluator is registered (progressive enhancement). tjs-lang: `createPredicateEvaluator(opts)` in `src/lang/predicate.ts` (verify+compile+cache per source; **fails closed** — unverifiable/runaway source → `false`, never throws mid-validation), exported from `tjs-lang/lang`. Tests: `src/lang/predicate-evaluator.test.ts` (4), tosijs-schema `src/predicate.test.ts` (6, incl. naive-vs-aware). **End-to-end verified**: real engine + real hook + `cssStyleSchema()` → good=true / bad-key=false / non-object=false; naive (evaluator cleared) passes bad-key on structure alone. Blocked on publishing tosijs-schema before tjs-lang can consume the hook from npm (don't publish without asking).
  - [x] **Pre-wired predicate-enhanced schema export — DONE 2026-07-03.** tosijs-schema `1.4.0` published (with the `$predicate` hook); tjs-lang dep bumped to `^1.4.0`. New **`tjs-lang/schema`** subpath (`src/schema/index.ts`): re-exports the whole tosijs-schema surface and auto-registers `createPredicateEvaluator()` on import (batteries-included — `import { s, validate } from 'tjs-lang/schema'` and `$predicate` nodes validate with zero wiring). `installPredicateSupport(opts)` for custom re-install; `predicateSupportInstalled()` to check. `tosijs-schema` externalized in the bundle (single instance → one global evaluator); the entry is in `sideEffects` (the auto-register must survive tree-shaking). Bundle `dist/tjs-schema.js` 5.7KB/2.7KB gz. Tested against the **real published** tosijs-schema (`src/schema/schema.test.ts`, 6): registers on import, validates cssColorSchema/cssStyleSchema out of the box, opt-out → structural-only, custom fuel. This closes the #6 north-star loop end-to-end.
- [~] **Real CSS predicate library** — productionize beyond the PoC corpus (the tosijs CSS replacement). New `tjs-lang/css` subpath (`src/css/`): `predicates.ts` holds the canonical **serializable source**, `index.ts` the compiled validators + `suggestColor` + `verifyCss`. Bundle `dist/tjs-css.js` (18.3KB/6.9KB gz) wired into `scripts/build.ts`; subpath + typesVersions in package.json. **Substantially done** — phases 1 (colors), 2 (dimensions), 3 (animation+transition shorthands), 4 (recursive structure + `$predicate` schema), 5 (perf: ~0.5ms/theme), **plus property-aware validation (2026-07-03)** all landed. Only remaining tail: `font`/`background` shorthands (slash-syntax + layers — messier) — a nice-to-have, not core.
  - [x] **Property-aware `isStyleValue` — DONE 2026-07-03.** `isStyleValueFor(prop, val)` in the combined style cluster (`style.ts`, which now composes the shorthand classifiers via the exported `CSS_SHORTHAND_FRAGMENT`) tightens only the **closed** value grammars — color props → `isColorValue`, `animation` → `isAnimation`, `transition` → `isTransition` — so `isStyleObject` now catches real value errors (`{color:'notacolor'}` → false, even nested), while keyword-heavy props (width/display/fontWeight) stay permissive to avoid false-rejecting valid idents. Universal escapes (global keyword/var/calc) pass on any prop; prop names normalized (lowercase, dashes stripped) so kebab === camelCase. Exported `isStyleValueFor` from `tjs-lang/css`. 14 tests (`src/css/property-aware.test.ts`); perf unchanged (~0.5ms/theme). Deferred extension: length/number props need per-property keyword sets to enforce precisely without false-rejects.
  - [x] **Phase 1 — color grammar. DONE 2026-07-03.** Full CSS-L4 named set (148) + hex (3/4/6/8) + rgb/rgba + hsl/hsla + modern fns (hwb/lab/lch/oklab/oklch/color/color-mix, by name+balanced-parens) + `var(--…)`, `!important`-tolerant. Verified predicate-safe **and ReDoS-clean** (flat char-classes), compiles to native validators, `suggestColor(prefix)` mines the named set + open functional stubs (validated through the compiled predicate). 39 tests (`src/css/css.test.ts`) incl. modern color fns + suggest. Proves the full vertical slice source→verify→compile→validate→suggest.
  - [x] **Phase 2 — dimensions / numbers / angles / times / keywords. DONE 2026-07-03.** `src/css/dimensions.ts`: `isLength` (full CSS Values 4 unit set — font-relative/viewport/container/absolute — + unitless `0` + `var`/`calc`), `isPercentage`, `isNumber`/`isInteger` (accept numeric values and numeric strings; reject `Infinity`/`NaN`), `isAngle`, `isTime`, `isResolution`, `isGlobalKeyword` (inherit/initial/unset/revert/revert-layer), and `isDimension` (any of them). ReDoS-clean numeric core `[+-]?(\d*\.\d+|\d+)`. `verifyCss()` now verifies **all** clusters (color + dimension), diagnostics namespaced by cluster. 31 tests (`src/css/dimensions.test.ts`); bundle 12.1KB/4.8KB gz.
  - [~] **Phase 3 — order-flexible shorthands. animation + transition DONE 2026-07-03.** `src/css/shorthands.ts` (cluster = dimension leaves + classifiers): `isAnimation`, `isTransition` (order-free tokens, comma-separated layers), `isTimingFunction` (keywords + `cubic-bezier`/`steps`/`linear(...)`). Key insight: **tokenize the whole value paren-aware, don't split** — `v.split(',')` breaks on commas inside `cubic-bezier(0.1, 0.7, 1, 0.1)`, and a paren-aware comma-_splitter_ regex `(?:[^,()]|\([^)]*\))+` is a nested quantifier the ReDoS verifier (correctly) rejects. So: one flat `.match` tokenizer (`[a-z-]+\([^)]*\)|[^\s,]+`) + a flat empty-layer guard. Schema builders `cssAnimationSchema()`/`cssTransitionSchema()` (pin the entry via an appended `__entry` alias, since `$predicate` uses last-function-as-entry). 20 tests (`src/css/shorthands.test.ts`); bundle 16.9KB/6.4KB gz. Deferred: `font`/`background` (slash-syntax + layers — messier); property-aware `isStyleValue` (use the right shorthand per property key).
  - [x] **Phase 4 — recursive style-object structure + `$predicate` JSON-Schema. DONE 2026-07-03.** `src/css/style.ts`: `CSS_STYLE_SOURCE` = color + dimension leaves + structure predicates (`isCssProperty` incl. custom `--props`, `isSelectorOrAtRule`, `isStyleValue`, recursive `isStyleObject` — entry). Validates the open recursive shape TS/JSON-Schema can't type (nested selectors/at-rules → nested rule; property → value; two-tier precision: strict structure, permissive leaf tail so shorthands aren't rejected). Schema builders `cssStyleSchema()` / `cssColorSchema()` / `cssDimensionSchema()` emit `$predicate` nodes. **The thesis demonstrated end-to-end** (`style.test.ts`, 13): a naive validator (`ignorePredicates`) passes an object with a bad key on `type: object` alone; the predicate-aware validator runs `isStyleObject` and catches it. 90 css+schema tests green; bundle 14.0KB/5.4KB gz.
  - [x] **Phase 5 — perf with the complete predicate set. DONE 2026-07-03.** `src/css/perf.bench.test.ts` (gated by `SKIP_BENCHMARKS`): validates a theme-sized style object (~50 rules × ~12 leaves + hover/focus/media nesting ≈ 600 values) with colors + dimensions + shorthands + recursive structure all live. **Numbers: ~0.5 ms/whole-theme (~1970 themes/sec); per-value isColor 0.41µs, isColorValue 0.52µs, isDimension 0.18µs, isAnimation 0.52µs.** Confirms "safe is fast" — a whole theme validates in half a millisecond, far under a 16ms frame. Loose 8ms ceiling (catastrophic-regression guard; hard thresholds are flaky under load). NOTE: measuring the _real_ tosijs-ui `baseTheme` is blocked by tosijs-ui's browser coupling (`theme.ts` needs `HTMLElement` at import) — would need a happy-dom shim; the self-contained synthetic theme is representative. (~0.5ms here vs the PoC's ~0.13ms because this theme is ~4× larger and fully nested.)
- [x] **Regex-linting in the verifier — DONE 2026-07-03.** `verifyPredicate` now analyzes every regex **literal** in a predicate and rejects catastrophic-backtracking patterns — the one unbounded primitive fuel can't interrupt (a single `.test`/`.match` is opaque to the function-entry fuel hook). Detector = conservative **star-height ≥ 2** (an unbounded quantifier nested inside an unbounded-quantified group: `(a+)+`, `(a*)*`, `([a-z]+)*`, `(.*)*`, `((a+))+`, `(a{2,})+`), which fails closed (over-flagging only costs the "verified" badge; certifying a dangerous one would be a broken promise). Dynamic `RegExp(...)` needs no analysis — already rejected (`new` banned, `RegExp` not a pure global). `src/lang/predicate.ts` (`reDoSRisk`); tests `src/lang/redos-lint.test.ts` (17, incl. end-to-end Type fallback + verified paths); CSS corpus unaffected (no false positives). **Known limitation (documented):** _polynomial_ ReDoS from adjacent overlapping quantifiers (`\d+\d+$`, `a.*a.*a`) and alternation-overlap (`(a|a)*`) is not caught — the exponential class is what the safety story commits to. So predicates are now strictly better than a bare `pattern`: the exponential footgun is refused, not silently certified.

## Ambient contracts — probe reality → verified predicate contracts (idea 2026-07-03)

Full design note: [`docs/ambient-contracts.md`](docs/ambient-contracts.md). The
itch: static types are pessimistic about ambient runtime environments (the DOM,
host objects) in ways that are ceremony without safety — `e.target.value` is a TS
error even though at runtime the value is either there or it isn't, and a pure
runtime predicate (`hasValueTarget(e)`) is the honest, total tool. The idea: tool
that **probes a real environment** (via the introspection iframe / Claude-in-Chrome)
and **derives serializable predicate contracts** for the surface a program
actually uses — then a **conformance harness** certifies a stand-in (happy-dom, a
VM capability) against the contract. Key distinction: predicates can be the
_contract/validator_, not the _behavioral shim_ (behavior stays a separate impure
diff-harness). Fits: introspection bridge exists, predicates are the serializable
contract form, the VM already validates capability boundaries, "types are
examples" ⇒ "contracts from observed values."

- [ ] **Spike: `event.target` demo** — `hasValueTarget` predicate compiles +
      verifies pure + is total; validates a real input event, rejects a `<div>`
      click. The predicate TS won't let you write cleanly is an ordinary verified
      predicate. (No browser needed for the unit; real browser confirms on live events.)
- [ ] **Spike: `CSSStyleDeclaration` probe** — introspect real `element.style` in
      a browser, derive a shape contract, diff a happy-dom `style` against it (where
      does the stub lie?). Leaf values ride the existing `tjs-lang/css` predicates —
      exercises probe→contract→conformance end-to-end. Would unblock the Phase-5
      real-`tosijs`-theme measurement (blocked by `theme.ts` needing `HTMLElement`).
- [ ] **Generalize**: probe record → `verifyPredicate`-certified contract cluster + `suggest()` leaves + a `$predicate` schema + `.d.ts`-ish editor view.

## tosijs 2.0 port feedback (DX log: `../tosijs/TJS-PORT-DX.md`, 2026-07-04)

Real dogfooding of native `.tjs` from the tosijs port + `tosijs-ui` live-examples.
Strongly validates the predicate-types/CSS/ambient direction (their §1b "ask the
browser via `CSS.supports`" is the ambient-contracts idea, independently; folded
into `docs/ambient-contracts.md`). Triaged items:

- [x] **#2 export `tjs-lang/runtime` + `tjs-lang/bun-plugin`** — DONE 2026-07-05.
      Subpaths + `tjs-runtime` bundle (26KB/8.9KB gz) so adoption is one line, not
      reaching into `src/`. (`tjs-lang/runtime` = createRuntime/Eq/Is/checkType/…;
      `tjs-lang/bun-plugin` = bun-only `.tjs` onLoad.)
- [x] **#3 `TjsDate` error mentions `performance.now()`** — DONE 2026-07-05. The
      `new Date()`/`Date.now()` messages now point at `performance.now()` for a
      monotonic counter (timing/id) alongside `Timestamp.now()` for wall-clock.
- [x] **#6 ship `tjs-lang/css`** — DONE this session (subpath + bundle); **needs an
      npm publish** before tosijs can adopt it (currently repo-only, not in 0.8.7).
- [x] **#8 `isStyleObject`/`shorthands.ts` standalone import** — resolved; builds
      clean on current `main` (was a point-in-time issue pre-refactor).
- [x] **#9 surface predicate verification in the `tjs()` result — DONE 2026-07-05.**
      `result.predicates: PredicateVerification[]` (per-Type/Generic verified status + reason) + unverified ones mirrored into `result.warnings`. See the #5
      warn-on-fallback entry above for details. (Strict-mode escalation still open.)
- [ ] **#7 `isCssProperty` is loose** — accepts `align-kontent` (any identifier).
      Wants a closed property set (+`--custom`/vendor prefixes). Natural home for
      the `CSS.supports`/ambient approach (§1b); the hand-set is the Node fallback.
- [ ] **#1 `toBool`-per-conditional hot-path tax** (~10% runtime, ~19% size on
      by-path). Skip the wrap when an operand is provably primitive/typed; and/or
      document the "`TjsCompat` for hot internals" pattern prominently.
- [ ] **#4 mode control is add-only** — want a per-mode `off` (e.g. `TjsStandard
off`); today it's `TjsCompat` + re-enable the rest.
- [ ] **#5 (their numbering) `Eq` ToPrimitive fallback** — nice-to-have; consult
      `Symbol.toPrimitive`/`valueOf` on objects, or an explicit `[TjsCompareValue]`
      protocol. tosijs works around it (box over a `Number` wrapper), NOT blocking.
- [x] **#10 export `generateDTS` from `tjs-lang/lang` — DONE 2026-07-05.** Added to
      `src/lang/transpiler.ts` (`generateDTS`/`typeDescriptorToTS`/`GenerateDTSOptions`);
      the `.d.ts` migration bridge is now reachable from the published `./lang` subpath.
- [x] **#11 bare params emitted as optional `.d.ts` (INVALID TS) — FIXED 2026-07-05.**
      Root cause: the dts derived optionality from the runtime `required` flag
      (`optional = !required`), leaking JS "wild-west" omittability into the dts. But
      **runtime `required` (a contract check — a bare JS param is `required:false`
      so it isn't runtime-rejected) is a different question from dts optionality (a
      deliberate optional _contract_).** Fix in `dts.ts:functionDeclToTS` (runtime
      untouched, so TJS ⊇ JS preserved): a param is dts-optional iff it has a
      `default`/`?` marker (both set `default`; a bare param has none) **and** no
      required param follows it (TS forbids optional-before-required, ts1016). Now
      `f(a, b: 0)` → `f(a: any, b: number)` (was `f(a?: any, …)` = invalid);
      `h(a=1, b)` → `h(a: number, b: any)` (a demoted). Repro + 3 tests in
      `dts.test.ts`. **Framing note (user):** judge TJS by its _native_ type system
      (examples/predicates), not by `.d.ts` polish — `.d.ts` is an express-controlled
      migration bridge (`declaration{}`/`// TS:`/keep `tsc`) — but the bridge must
      emit _valid_ TS, which this restores.
- [ ] **#12 dts emitter ignores arrow-const signatures** — `export const id = () =>`
      emits `id: any`; only `function` decls get a typed signature. Convenience-path
      roughness (per the reframing, not the yardstick), but worth honoring
      annotations on arrow consts so porting needn't rewrite them as `function`s.

**Reframing (user, 2026-07-05):** the end game is **replacing TS with a true JS
superset** (examples-as-types, predicates-as-functions), NOT being a better `tsc`.
So auto-`.d.ts` quality is a _migration-bridge convenience_, judged by correctness
(must emit valid TS — #11) not polish; the yardstick is TJS's native type system
(the predicate/CSS/ambient work). See `../tosijs/TJS-PORT-DX.md` header.

## tosijs-ui adoption feedback (`../tosijs-ui/TJS-FEEDBACK.md`, vs 0.8.7)

Second real consumer — the **live-example transpiler** + a first inline-WASM demo.

- [x] **UI-#7 stale `editors/codemirror` build (missing `tjsEditorExtension`/
      `tjsCompletionSource`/`AutocompleteConfig`) — RESOLVED on `main`** by this
      session's editors-build-from-source fix (gap #2). The built
      `editors/codemirror/ajs-language.js` now exports them (grep=6). **Ships in the
      next release** — this was the blocker for tosijs-ui's runtime-value autocomplete.
- [x] **UI-#1 silent `wasm{}` fallback — FIXED 2026-07-06.** The signal already
      existed on `result.wasmCompiled` (per-block `success:false` + `error`) but
      wasn't where consumers look, so a block that couldn't compile fell back to
      `fallback{}` (JS) silently. Now `transpileToJS` mirrors each failed block into
      `result.warnings` (`"wasm{} block '<id>' did not compile — running the
fallback{} (JS): <reason>"`) — same pattern as the predicate report. Verified:
      a triple-nested-loop block warns (`out is not a typed array parameter`), a
      working SIMD block doesn't. Tests: `src/lang/wasm-fallback-warning.test.ts` (2).
- [x] **UI-#5 document the supported `wasm{}` control-flow subset — DONE 2026-07-06.**
      DOCS-WASM.md § "Supported subset" lists what's allowed (numeric locals, nested
      `for` with numeric bounds, `if`/`else`, `&&`/`||`, typed-array element access,
      math intrinsics, SIMD) and what falls back. Anything unsupported now _warns_
      (UI-#1) rather than silently falling back. (Making it a hard _error_ instead
      of a warned fallback would violate the `fallback{}` contract, so warn is right.)
- [x] **UI-#2 awaitable WASM ready signal — DONE 2026-07-06.** Each module's
      instantiation promise is pushed onto `globalThis.__tjs_wasm_pending`, and
      `globalThis.__tjs_wasm_ready()` awaits them all — so `await __tjs_wasm_ready()`
      before the first call guarantees the WASM path instead of racing the
      fallback. `src/lang/emitters/js-wasm.ts` (bootstrap wrapper); tests
      `src/lang/wasm-ready.test.ts` (ready resolves + multi-module accumulation).
- [x] **UI-#3 public WASM enable/disable toggle — DONE 2026-07-06.**
      `globalThis.__tjs_wasm_enabled = false` forces every block to its
      `fallback{}` (JS) even when WASM is ready — the A/B benchmark lever without
      poking internal `__tjs_wasm_<id>` globals. Added to the dispatch guard in
      `extractWasmBlocks` (`__tjs_wasm_enabled !== false && globalThis.<id> ? …`);
      test via a spy on the export. Both documented in DOCS-WASM.md § Runtime.
- [x] **UI-#4 silent i32/i32 integer division — DONE 2026-07-06.** Documented
      (DOCS-WASM.md § "Numeric gotcha" — footgun + `x + 0.0` fix) **and** auto-linted:
      the wasm binary-expr compiler warns when `/` has two i32 operands (loop vars /
      int literals), once per block, via the existing `ctx.warnings` channel — plumbed
      through `compileBlocksToModule.warnings` → `generateWasmBootstrap.warnings` →
      mirrored into `result.warnings`. Fires only on genuine i32/i32 (i32/f64 is fine).
      Tests: `src/lang/wasm-intdiv-lint.test.ts` (3). **Closes the entire tosijs-ui WASM
      feedback (UI-#1..#7).**
- [x] **UI-#6 `f32x4` compare/select/min/max — DONE 2026-07-06.** Added to the
      wasm compiler (`src/lang/wasm.ts`): `f32x4_min`/`f32x4_max` (arithmetic),
      `f32x4_eq`/`ne`/`lt`/`gt`/`le`/`ge` (return a v128 lane **mask**), and
      `f32x4_select(mask, a, b)` (branch-free blend → `v128.bitselect`). The
      compare→mask→select trio unlocks **data-dependent SIMD** (clamp/saturate,
      per-lane escape masking, SIMD Mandelbrot) — previously impossible with the
      arithmetic-only set. Routed via the existing `startsWith('f32x4_')` dispatch;
      all `f32x4_*` return `v128`. Executed as real WASM + verified correct
      (`src/lang/wasm-simd-ops.test.ts`, 7 — max/min, each comparison through
      select, clamp). Documented in DOCS-WASM.md with the clamp example. Ships in
      the NEXT release (0.9.0 already out).

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

## Compat tests — currency check (2026-07-02: all green against current HEAD)

Re-ran all six `scripts/compat-*.ts` with `--clean` (fresh `git clone --depth 1`,
i.e. current upstream HEAD). The TS→TJS path transpiles every library with **zero
failures** and passes **100% of runnable upstream tests**:

| Library     | Transpile          | Upstream tests             |
| ----------- | ------------------ | -------------------------- |
| zod         | 116 files/~30K LOC | 1959/1959 pass             |
| effect      | 363/363 files      | (transpile-only)           |
| ts-pattern  | 17/17 files        | 453/453 pass               |
| superstruct | 8/8 files          | 225/225 pass               |
| radash      | (all)              | 340/340 pass¹              |
| kysely      | 303/303 files      | (transpile-only; needs DB) |

¹ radash also surfaces 47 _pre-existing upstream_ failures in `src/tests/async.test.ts`
(broken fake-timers — "Can't install fake timers twice"); the harness annotates
these as not-our-fault. All 340 TJS-transpilation assertions pass.

- [ ] **Harness gap: compat scripts shell out to `pnpm` (zod, effect) which may not
      be in `$PATH`.** Worked around 2026-07-02 with a corepack-backed `pnpm` shim
      (`corepack pnpm` → 11.9.0). Consider making the scripts use `corepack pnpm`
      (or `bun`) directly so they run out-of-the-box. radash/superstruct/ts-pattern
      use `npm` (available); kysely/effect are transpile-only.
- [ ] **Compat tests are manual + unpinned (not in CI).** They clone HEAD, so they
      drift silently — re-run periodically (this was the first refresh since Mar 30).
      Optional: pin to release tags for reproducibility, or add a lightweight CI job.

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

## Editors - published `.js` is stale — FIXED 2026-07-02

- [x] **The `tjs-lang/editors/*` subpaths shipped hand-maintained `.js` files that
      were NOT built from the `.ts` sources.** `editors/codemirror/ajs-language.js`
      was from Jan 2026 (~7.5KB, an old CDN-example impl exporting a stale
      `createAjsExtension` API) while `ajs-language.ts` is the real ~51KB
      implementation. So none of the autocomplete work (scope model, introspection
      bridge, member completion) reached npm consumers — they got months-old code.
      Same for monaco/ace. **Fixed:** `scripts/build-editors.ts` bundles each entry
      from its `.ts` (esbuild, ESM, unminified; externalizes the framework it
      augments — `@codemirror/*`/`@lezer/*`/`codemirror`/`monaco-editor`/`ace-builds`
      — plus the acorn stack, which are tjs-lang runtime deps; inlines the internal
      editor logic). Wired into `bun run make` (+ standalone `bun run build:editors`).
      The 3 `.js` are prettier-ignored (`editors/**/*.js`) so they stay
      byte-identical to esbuild output, and `editors/editors-build.test.ts`
      re-bundles in memory and asserts byte-equality with the committed files —
      so a `.ts` edit without a rebuild fails CI (no more silent drift). Verified:
      all 3 bundles import cleanly and expose their real `.ts` exports
      (codemirror → `tjsCompletionSource`/`ajsEditorExtension`/`ajs`/
      `tjsEditorExtension`/`ajsLanguage`/`FORBIDDEN_KEYWORDS`).

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
- [x] **`typescript` not resolvable from the main entry** _(confirmed live in 0.8.0–0.8.2 via fresh `npm install` + Node import)_ — `import 'tjs-lang'` threw `Cannot find package 'typescript' imported from dist/index.js`. Cause: the main entry (`src/index.ts` → `export * from './lang'` → `src/lang/index.ts`) statically re-exported `fromTS`, dragging the TS compiler into `dist/index.js` (externalized in `scripts/build.ts`'s `index` target, but only a devDependency so Node consumers without it crashed at import — and it pulled TS at import time → also broke Cloud Run). **Fixed 2026-07-02** via option (a): `src/lang/index.ts` now re-exports only the **types** (`export type { FromTSOptions, FromTSResult }`, erased at build → no runtime dep); the `fromTS` **value** is reachable only via the documented `tjs-lang/lang/from-ts` subpath. Mild breaking change for anyone doing `import { fromTS } from 'tjs-lang'` (docs already steer to the subpath; repo grep found no other consumers). Reproduction + guard: `src/index-tsfree.test.ts` (bundles the main entry with esbuild, asserts no `typescript` import). Internal test importers repointed to `./emitters/from-ts`.
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
