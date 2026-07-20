# Changelog

All notable changes to **tjs-lang** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **Capability-boundary membrane on the VM.** Every value an `effects: 'io'` atom
  returns (`httpFetch`, `storeGet`/`storeQuery`/vector search, `llmPredict`, `agentRun`,
  `runCode`/`transpileCode`, …) is now deep-copied through a structured-clone membrane
  before it enters guest state, at a single choke point in the atom exec wrapper. This
  closes a defense-in-depth hole surfaced by an adversarial review: previously a
  capability could hand the guest a **live host reference** — an object carrying callable
  methods (e.g. a `Response` with `.json()`/`.text()`, or any object with a function
  property) — which the guest could then invoke via `methodCall` to reach the host realm,
  or mutate while the host still held it. The membrane rejects functions, symbols, and
  other non-cloneable host references with a `MonadicError` (`Capability boundary rejected
the return of '<op>'`), and gives clean data fresh identity so guest mutation can't
  alias host state. A budgeted, cycle-safe pre-walk caps the estimated payload size
  (`membraneMaxBytes` run option, default 4 MB) and **rejects oversized returns before the
  copy allocates**, so a hostile or broken capability can't OOM the VM through the
  capability boundary. **Contract change:** custom capabilities must return
  structured-cloneable data — a capability that returned a live `Response` must now return
  the fields the guest reads as a plain object (`{ ok, status, body }`); the default fetch
  path already normalizes to parsed body / text / data-URL and is unaffected.
- **`methodCall` is now allowlisted, not blocklisted.** Guest method invocations
  (`str.toUpperCase()`, `arr.includes(x)`, `d.format()`, …) are restricted to an allowlist
  computed from the standard built-in prototypes, the curated builtin statics, and the VM's
  own wrapper types (Date/Set) — replacing the previous name-blocklist that admitted any
  method not literally named `__proto__`/`constructor`/`prototype`. Behind the membrane
  (guest values are plain data) this permits everything a guest legitimately calls and
  nothing else; the teeth are that `call`/`apply`/`bind` live only on `Function.prototype`
  and are therefore rejected, so a leaked function reference can't be re-invoked with a
  chosen `this`.
- **SSRF guard (`isBlockedUrl`) now covers full private/loopback ranges.** Previously only
  `127.0.0.1` (not the rest of `127.0.0.0/8`, so `127.0.0.2` passed) and the single cloud
  metadata IP were blocked, and IPv6 private ranges weren't checked at all. Now blocks all
  of loopback `127/8`, `0/8`, private `10/8` · `172.16/12` · `192.168/16`, link-local
  `169.254/16` (the whole cloud-metadata range), and — for IPv6 — `::1`/`::`, unique-local
  `fc00::/7`, link-local `fe80::/10`, and IPv4-mapped addresses (`::ffff:7f00:1` = 127.0.0.1)
  that embed a blocked IPv4. WHATWG URL normalization already collapses shorthand/decimal
  IPv4 (`127.1`, `2130706433`) to canonical form before the check.
- **`regexMatch` ReDoS hardening — length caps + a wider heuristic.** The regex engine's
  backtracking is opaque to the fuel counter, so `regexMatch` now fails closed on three
  fronts: a pattern-length cap (1000 chars), an input-length cap (100 000 chars, checked
  after coercing the value to a string), and an extended suspicious-pattern check that also
  catches a quantified group repeated by an unbounded outer quantifier (`(a+){2,}`) in
  addition to the existing `(a+)+`/`(.*)+` forms. Safe patterns (including bounded
  `(abc){3}` and grouped captures like `(\d{3})-(\d{4})`) are unaffected.
- **VM scope variables can't be named a forbidden property.** Binding a variable named
  `__proto__`/`constructor`/`prototype` (via `varSet`/`constSet`/`varsLet`/`varsImport` or
  an atom result `.as('__proto__')`) is now rejected — previously such a name would mutate
  the scope object's own prototype chain (`createChildScope` uses `Object.create(state)`)
  instead of creating a binding. No global prototype pollution was possible, but the scope
  corruption is now closed at the write sites, mirroring the member-access guard.

### Added

- **Dictionary defaults — the `TjsDictDefaults` mode** (`docs/dictionary-defaults.md`).
  In native tjs, `(args = {x: 0, y: 0})` now has WebIDL-dictionary semantics: each member
  individually defaulted, partial payloads merged per member (recursively —
  `place({pos: {x: 5}})` keeps `pos.y` and every other default), members type-checked with
  precise error paths, `undefined` members treated as absent, example-`null` members
  nullable-any, arrays replaced wholesale (element-checked), excess keys stripped with a
  once-per-site flight-recorder notice naming them, and prototype-pollution keys
  (`__proto__`/`constructor`/`prototype`) rejected outright. Complete payloads return by
  identity — zero allocation.
  - **Faster than hand-rolling it, correct or not:** the merge is emitted as
    shape-specialized code per signature; measured 91 ns/op on a complete 8-member/3-nested
    payload vs 276 for the careful hand-written spread merge and 107 for the _incorrect_
    shallow spread — while validating every member (three-tier methodology in
    `experiments/dictionary-defaults/perf.bench.test.ts`).
  - **Mode-gated per PRINCIPLES.md:** ON in native `.tjs` (like `TjsEquals`), OFF under
    `dialect: 'js'`, `fromTS`, VM targets, and `TjsCompat` — JS-legal source keeps atomic
    JS default semantics exactly. `TjsStrict` enables it; `TjsDictDefaults` is a standalone
    directive. Impure object-literal defaults (`{x: mkX()}`) are a compile error in native
    mode (compute in the body, or use a colon-form param); non-literal defaults
    (`args = live`, `x = 0`, `list = []`) are untouched.
  - Required-ness needs no new syntax: `:` params are required (member-validated since
    Stage 0), `=` params are defaulted — mixed shapes use separate params, the platform
    convention.
  - **`.d.ts` output is deep-partial for dictionary params:** `generateDTS` emits
    `args?: { pos?: { x?: number; y?: number }; label?: string }` so TypeScript callers can
    pass the partials tjs accepts. Mode-gated (the transpile result now carries `tjsModes`);
    dialect-js output keeps required members, where partials genuinely aren't valid.

### Changed

- **Colon-form object params now enforce their member contract** (Stage 0 of
  dictionary defaults, `docs/dictionary-defaults.md`). `function f(args: {x: 0, y: 0})`
  has always documented "an object with integer x and y," but the emitted check was
  `typeof args === 'object'` only — partial payloads, wrong member types, and garbage
  members all passed while the full shape sat unused in `fn.__tjs.params`. Members are
  now required and type-checked (recursively, arrays included) with precise error paths
  (`f.args.pos.y`), matching `typeMatches` and the inline `Type.check` semantics. Excess
  members are still ignored (the excess-key policy belongs to the forthcoming merge
  mode). **Scope:** required (colon-form) params only — the JS-legal `=` form keeps
  plain-JS semantics, and code that hasn't opted into validation is unaffected. For
  TS-originated code this makes the runtime contract match what TypeScript itself
  enforces statically (`greet({name})` against `{name: string; age: number}` is a TS
  compile error — and now a runtime `MonadicError` too).

## [0.11.0] — 2026-07-18

Minor bump — two new entry points (`./import-resolver`, `./import-resolver/worker`),
no breaking changes. This is the release tosijs-ui's doc system builds against.

### Added

- **`tjs-lang/import-resolver`** (#20) — the playground's bundler-free bare-import
  machinery (TFS), promoted from `demo/` to a real export so doc systems (tosijs-ui's
  live-example) can own import resolution instead of hand-rolling it. `rewriteImports`
  rewrites bare specifiers to a configurable same-origin prefix (`/tfs/` default, e.g.
  `/lib/`); a service worker resolves them to a CDN — JSDelivr `/+esm` by default, an
  esm.sh allowlist for peer-dep dedup (react/react-dom), `jsdelivr/`·`esmsh/`·`unpkg/`·
  `github/` hints — and caches via the Cache API.
  - The worker ships as the raw classic-script asset **`tjs-lang/import-resolver/worker`**
    (`dist/import-resolver-worker.js`, esbuild IIFE, 2.9KB): a service worker is
    origin-scoped, so consumers copy it into their public root and call
    `registerImportResolver({ prefix, workerUrl, scope })`. Config travels to the worker
    as a **query string on its registered script URL** — available before the first
    intercepted fetch and durable across worker restarts — so the client rewrite and the
    worker's routing derive from one `ResolverConfig` and cannot disagree.
  - **The routing now has exactly one implementation** (`src/import-resolver/resolve.ts`,
    pure, zero-dependency). It previously lived in three diverged copies: the demo
    client, the demo service worker, and a materially different reimplementation in the
    dev server (raw JSDelivr + its own package.json-exports resolution — a package could
    resolve differently through the fallback than through the worker). The dev server and
    the playground worker now consume the shared core; the playground's `/iframe/`
    protocol stays demo-only, composed on top.
  - The previously-untested routing core is now covered (`resolve.test.ts`: parsing, CDN
    routing, hints, config round-trip, a client↔worker prefix-agreement guard, and an
    anti-drift smoke that parses the built worker as a classic script and checks the
    routing is embedded).

### Documentation

- `docs/dictionary-defaults.md` — design spec for **merge-on-partial object arguments**
  (WebIDL-dictionary semantics for options bags), a gated native-TJS mode. Includes the
  measured finding that member-level object-param validation doesn't exist yet (the
  emitted check is typeof-only; the full shape metadata goes unused). Spike A (semantics
  harness + 33-case table suite) lives in `experiments/dictionary-defaults/`.

## [0.10.1] — 2026-07-17

Patch — a critical fix, no API changes. One behavior change (`Is()` on cyclic
graphs now answers instead of crashing), noted under Changed.

### Fixed

- **Exponential blowup in deep-equal/format on shared-reference object graphs** (#21 —
  critical; same defect class as [oven-sh/bun#34178](https://github.com/oven-sh/bun/issues/34178),
  and since tjs ships its own `expect`, Bun's fix did not cover us). A DAG built as
  `{a: n, b: n}` per level has O(depth) nodes but a 2^depth unfolded tree:
  - `format()` re-serialized shared references via raw `JSON.stringify` — 21MB at depth 20,
    verified OOM at depth 28 under bun/JSC — whenever an assertion **failed**. It now marks
    revisited objects as `[shared]` (which also fixes true cycles, where `JSON.stringify`
    used to throw and eat the assertion message) and hard-caps output at 16KB.
  - `deepEqual` walked all 2^depth paths on **every** assertion (~61s at depth 30). It now
    memoizes visited pairs — a revisit is assumed equal (sound: any `false` short-circuits
    to the top) — collapsing the walk to O(nodes).
  - Fixed in all **five** copies (the issue named one): the injected `expectFunction`
    (`tests.ts`), the transpile-time harness's `__deepEqual` and `__format`/`formatValue`
    (`js-tests.ts`, which also had no depth bound), the runtime `Is()`, and the emitted
    inline `Is`. Guarded by `src/lang/dag-safety.test.ts`, calibrated so a regression fails
    cleanly (timeouts / message-length assertions) instead of killing the machine.
  - `Is()` stays allocation-free on the hot path: pair memoization only engages past
    recursion depth 8 (exponential blowup requires depth; a shallow shared graph pays at
    most a small constant factor). Measured: flat/nested small-object compares within noise
    of pre-fix (~29ns/58ns per call); `Is(dag(30), dag(30))` went from **101s to 3.2ms**.

### Changed

- **`Is()` on two distinct-but-cyclic graphs now terminates and returns their structural
  equality** (bisimulation semantics). Previously it recursed until stack overflow
  (`RangeError`). This is a behavior change to a language primitive, strictly in the
  direction of "gives an answer instead of crashing" — but if anything relied on the throw,
  note it here. Same applies to the test-harness `deepEqual`s.

## [0.10.0] — 2026-07-16

Minor bump — additive features and fixes, no breaking changes.

### Added

- **Framework-free editor primitives** — a new `tjs-lang/editors` entry point exporting
  `collectScopeSymbols` (AST scope extraction, destructuring included, carries `origin`),
  `introspectValue` (live value → members), and `scopeCaptureEpilogue` (capture a run's
  top-level bindings in-run, no re-execution). Acorn-only, no CodeMirror/Monaco/Ace
  dependency. Closes **#10** — downstream consumers (tosijs-ui) were hand-rolling a worse
  regex copy of the scope extractor because it wasn't exported.
- **`tjs-lang/editors/codemirror` now ships types.** The editor build emits `.d.ts` and the
  export declares a `types` condition, so consumers stop re-declaring `AutocompleteConfig` by
  hand (**#12**). The five `@codemirror/*` packages the CodeMirror integration imports are now
  declared as optional `peerDependencies` — an undeclared import resolved locally by hoisting
  and hard-failed in a consumer's isolated install (**#16**).
- **`functionMetaToJSONSchema` is now exported from `tjs-lang/lang`** (it was only on
  `src/lang/index.ts`, which the subpath doesn't resolve to — the documented import failed
  with "Export not found"). Emitted standalone code also carries `.toJSONSchema()` / `.strip()`
  on its inline `Type`/`Enum`/`Union` stubs when a file uses them, so a TJS type can describe
  itself at runtime from inside emitted `.js`.
- **Flight recorder** (#17). The `__tjs` error ring buffer is now a black box for the whole
  runtime, not just a type-error log. New API on the module, the runtime object, and every
  `createRuntime()` instance: `record(entry)`, `records(filter?)`, `clearRecords()`,
  `getRecordCount()`, `getDroppedCount()`. Records carry a `source`
  (`type`/`wasm`/`vm`/`app`/…) and a `severity` (`error`/`warning`/`notice`), and can be
  filtered by either.
  - **Reports today:** type errors; `wasm{}` blocks that fell back to JS or failed to
    instantiate (surfacing the previously-silent fallback, **#15**); typed arrays copied in
    and out on every call because they weren't allocated with `wasmBuffer()` — previously
    silent and can be slower than plain JS (**#9**); every VM failure — fuel exhaustion,
    atom timeout, capability denial.
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

### Changed

- **LLM tests restructured into three lanes by what they prove**, cutting the LLM cost of
  the pre-tag gate from ~82s (two files) to ~4s while _adding_ deterministic coverage:
  - **Plumbing → `test:fast`.** The real LM Studio HTTP client (`getLLMCapability`) now has
    deterministic coverage (`src/batteries/llm-transport.test.ts`, ~40ms) against an
    in-process fixture server. It was previously exercised _only_ live — backwards for code
    we own. (`batteries.test.ts` didn't cover it either: it mocks a _reimplementation_ of
    predict/embed, not the real client.)
  - **Live smoke pared.** `models.integration.test.ts` audited five times (once per test);
    it now audits once in `beforeAll` and keeps only predict + embed shape checks. ~28s → ~4s.
  - **AJS grokkability is its own advisory lane** (`bun run test:grok`, behind
    `RUN_GROK_TESTS`, not in the gate). It measures whether a pinned small model
    (gemma-4-e2b) can write valid AJS — a load-bearing AJS premise — as a success _rate_
    over N samples vs a bar, and **never fails on the rate** (model variance ≠ code
    regression). Replaces `transpiler-llm.test.ts`, whose `withRetry(1-of-3)` passed on a
    33% success rate and couldn't tell a healthy 90% from a degraded 35%.

### Fixed

- **The pre-tag gate no longer fails on LM Studio flakiness.** The live playground-example
  LLM tests (`demo/examples.test.ts`) hit a real LM Studio, which is prone to transient
  400s and dropped connections while models swap under memory pressure — a bad server
  moment, not a code regression, could block a release tag. They now retry the live call
  and degrade to the existing mock (with a visible warning) on persistent failure, so the
  gate blocks on code, never on server health. Safe because the LLM client's request/response
  shape is guarded deterministically by `llm-transport.test.ts` — a real malformed-request
  regression fails there, loudly; and a broken example still fails via its transpile/VM
  error. The fallback logic is itself covered by deterministic tests.
- **The friendly "start LM Studio" error was dead under Bun.** `getLLMCapability` detected a
  refused connection via `e.cause?.code === 'ECONNREFUSED'` (Node's shape), but Bun — our
  primary runtime — surfaces it as `e.code === 'ConnectionRefused'`, so users got a raw
  "Unable to connect" instead of the actionable message. Now detects both. (Found by the new
  deterministic transport tests.)
- **Every file in `examples/` works again, and a guardrail keeps it that way**
  (`src/examples.test.ts` runs each through `tjs check` _and_ `tjs run`). Five of the
  seven were broken; nothing caught it because nothing ran them. Beyond the `tjs run`
  and WASM bugs below, this surfaced:
  - **`tjs run` could not run any file with an `import` or an `export`.** It evaluated
    emitted code with `new AsyncFunction(code)`, and `import`/`export` are module-only
    syntax — a `SyntaxError` inside a function body. It even reported the failure as a
    syntax error in the _source_, pointing at a line the user never wrote. The emitted
    module is now written beside the source and imported, so relative and bare imports
    resolve exactly as they would for the original file.
  - **`tjs run` executed your program twice.** The transpile-time test harness _evaluates
    the module_ to run signature tests, and then `run` evaluated it again — so every
    top-level side effect fired twice (`console.log('hi')` printed `hi` twice). Running a
    program no longer tests it; that is what `tjs test` / `tjs check` are for (the same
    position the Bun plugin already took).
  - **Generics were dead on arrival in emitted code.** A generic's predicate receives its
    type parameters as **check functions** — `Generic Box<T> { predicate(obj, T) { … T(obj.value) } }`
    — but the inline runtime spread the raw type _arguments_ in, so `T` was the string
    `''` and calling it threw `checkT is not a function`.
  - **A runtime type's `check()` accepted anything of the right `typeof`.** For an object
    example that means _any_ object passed: `User.check({ name: 'Alice' })` returned `true`
    for a type requiring `name`+`age`+`email`. It now matches the example structurally. A
    validator that answers "yes" to everything is worse than no validator.
  - **`.toJSONSchema()` / `.strip()` did not exist in emitted code**, so a TJS type could
    not describe itself from inside TJS — the "types are examples that survive to runtime"
    claim, unmet. Both are now emitted (only for files that use them).
  - **`tjs-lang/lang` did not export `functionMetaToJSONSchema`.** `src/lang/index.ts` did,
    but the subpath resolves to `src/lang/transpiler.ts`, and the two had drifted — so the
    documented import failed with "Export not found".
- **WASM now instantiates synchronously**, so an exported `wasm function` can be called
  the moment its module is imported. The bootstrap was a fire-and-forget `async` IIFE, so
  nothing was bound to `globalThis` until a microtask later. An inline `wasm{} fallback{}`
  block survives that window (it runs the JS fallback), but a `wasm function` declaration
  has **no** fallback — it calls the global directly. So
  `import { dot } from 'tjs-lang/linalg'; dot(a, b, 3)` threw
  `__tjs_wasm_dot is not a function`: a shipped entry point that could not be imported and
  used. `new WebAssembly.Module` is synchronous everywhere except a browser main thread
  with a >4KB module, which is now the only case that takes the async path —
  `__tjs_wasm_ready()` still resolves in both and remains what to await in a browser.
- **Inline `wasm{}` block ids are no longer a per-file counter.** Every module's first
  block claimed `globalThis.__tjs_wasm_0`, so two modules with inline wasm blocks
  overwrote each other's binding — and since the emitted call site guards the wasm path
  on that global merely _existing_, module A could find module B's compiled function and
  call it with A's captured variables. Ids are now salted with a content hash of the
  module (`__tjs_wasm_<hash>_<n>`), which is deterministic, so the metadata cache is
  unaffected. Named `wasm function` declarations keep their exact `__tjs_wasm_<name>` id —
  that name is the cross-file composition contract.
- **A `wasm{}` block that failed to compile could still be called.** It was left in the
  module as a stub (correct — function indices must stay stable for other blocks'
  `call <i>`) but was _also_ exported and bound to `globalThis`, which made the call
  site's guard see a function and take the wasm path into a body that never compiled,
  invoking it with captures that don't exist in that scope. Failed blocks are no longer
  bound. (Reachable before this release too: the async instantiation window merely hid it
  from any caller that ran synchronously.)
- **`tjs run` was preprocessing every file twice** — it called `preprocess()` and then
  handed the already-preprocessed source to `transpileToJS`, which preprocesses
  internally. The first pass consumes the `wasm` blocks, so the emitter never saw them,
  emitted no wasm bootstrap, and ran the file with `wasmBuffer` undefined while every
  `wasm{}` block silently fell back to JS. It produced correct answers, which is why it
  went unnoticed.
- **`tjs run` injected a runtime prelude that collided with the emitted code.** It
  declared `const { Type, Generic, ... }`, while emitted code inlines its own
  `function Type` fallback — `const Type` plus `function Type` in one scope is a
  `SyntaxError`, reported against a line number the source file did not have. Emitted code
  is standalone by design; the prelude is gone.
- WASM module instantiation failures were swallowed by a bare `.catch(() => {})` in the
  emitted bootstrap — the module vanished without a trace while every `wasm{}` block in
  the file silently ran its JS fallback. Now recorded as a warning.
- The inline runtime core (`MonadicError` + `typeError` + `isMonadicError`) was emitted
  from three copy-pasted source strings. A file needing `checkFnShape` **and** bang access
  without `typeError` would have declared `class MonadicError` twice in one scope (a
  `SyntaxError` in the emitted output). Not reachable in practice — but held shut by
  coincidence, not design. Now one definition, emitted once.

### Performance

- The Bun plugin (`preload`ed by `bunfig.toml`) no longer loads the whole transpiler at
  startup just to register a `.tjs` `onLoad` hook that most invocations never fire. The
  import moved inside the callback, cutting `bun` startup **in this repo** from ~34ms to
  ~18ms (bun's cold floor is ~11ms, so the preload had made it start _slower than node_).
  This is a saving per invocation — every `bun test`, every CLI run. It defers the
  transpiler rather than adding work: a run that does import a `.tjs` pays the same total.

### Documentation

- `MEMORY-PROFILE.md`: what transpilation actually costs under bun vs node. `fromTS` calls
  only the TypeScript **parser and emitter** (`createSourceFile` + `transpileModule`),
  never `createProgram` or a type checker, so its memory is bounded by the largest file
  seen rather than by project size — a whole 36.7k-line project costs about half of what
  `tsc` costs to check it once. Also records a measured, unfixed inefficiency:
  `transpileModule` is called once per top-level statement **and per class member** (89
  times for one 1,930-line file), which is ~70–80% of `fromTS` wall time and roughly 3×
  the cost of a single whole-file call.
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
