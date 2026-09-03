# Changelog

All notable changes to **tjs-lang** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.13.8] — 2026-09-03

### SECURITY — 0.13.7 shipped the fix in `src/` but not in `dist/`

**If you installed 0.13.7 from npm and use it under Node, upgrade.** 0.13.7's security fix
(a VM-target transpile no longer executes the code it is transpiling) was real in source and
absent from the published bundles: `dist/` had been built 35 minutes before the fix landed.

Bun resolves this package to `src/`, so every local check passed. Node resolves it to
`dist/`, so **every Node consumer of 0.13.7 got the vulnerable build** — including anyone
importing `tjs-lang/eval`. Verified by fresh-installing the published tarball and running
the exploit against it, which is the only check that would have caught it.

No source change from 0.13.7. This release is the same code, correctly built.

### Added

- `src/dist-freshness.test.ts` — the committed `dist/` bundles must not be older than the
  source they are built from. `editors/**` has had this guard for months; `dist/` is larger,
  is published, and had none. The mechanical release check had already reported
  `artifact freshness — no build script` as a SKIP, on a tool whose summary says "skips are
  NOT passes"; it was read as a pass anyway.

## [0.13.7] — 2026-09-02

### SECURITY — a VM-target transpile no longer executes the code it is transpiling

**If you call `Eval`, `SafeFunction`, or expose either over a network, upgrade.**

`parse()` ran every `test '…' { … }` block with `new Function(body)()`. `Eval` and
`SafeFunction` transpile the _submitted_ string before `vm.run`, so the payload executed
with full ambient authority **before** fuel, timeout, capabilities and the membrane existed:

```js
Eval({ code: "test 'x' { globalThis.__PWNED__ = true } return 1", fuel: 10, timeoutMs: 1 })
// -> { result: 1, fuelUsed: 0.2 }     and __PWNED__ === true
```

`timeoutMs: 1` was irrelevant and 0.2 fuel was charged, because the whole sandbox is
downstream of transpilation.

It was a category error before it was a vulnerability. **AJS has never had test blocks** —
they are a TJS feature, and the AJS path inherited them only by sharing `parse()`, where
every other TJS-only transform is gated on `vmTarget` and this one was not. An agent
language whose premise is that code travels as _data_ and runs with no ambient authority
was calling `new Function` on submitted source.

**What changed:** a VM-target transpile rejects `test` blocks as the syntax error they are.
**TJS inline tests are unaffected** — no `.tjs` behaviour changed, and the global
`runTests` default was deliberately _not_ touched, because that would have altered
documented TJS behaviour to fix a bug that only ever existed on the other path.

Verified two ways: every TJS construct a VM-target transpile still accepts was probed for
transpile-time execution (none executes), and a source-level test asserts that test
extraction is the **only** dynamic-execution site in the entire parse path.

Still open and tracked: a VM-target transpile _accepts_ seven TJS constructs AJS does not
have (inert, ratcheted). The structural fix — an AJS core that TJS wraps, rather than one
shared function with flags — is planned. A gate fails open; layering fails closed.

### Fixed

- **An annotated arrow after a keyword failed to parse.** `return (x: 0) => x`,
  `export default (x: 0) => x`, `throw (x: 0) => x` and curried
  `(a: 0) => { return (b: 0) => a + b }` all raised `Unexpected token`. A guard read the
  single preceding _character_, so the `n` of `return` read as a callee. Introduced in this
  cycle; not present in 0.13.6.
- **A TypeScript optional parameter no longer acquires a runtime default.** `fromTS` emitted
  `name?: T`, and TJS's `?:` is documented as "same as `name = value`" — so every optional
  gained its type example as a default. For a predicate type that meant a truthy object
  where TypeScript gives `undefined`, and radash's `unique` threw
  `TypeError: toKey is not a function`. Optionals convert to `T | undefined` again, and
  `required: false` is reported correctly.
- **Converted TypeScript overloads no longer change behaviour for unmatched input.**
  TypeScript erases overload signatures, so the implementation receives every call. We
  emitted runtime dispatch variants that _rejected_ input matching no signature —
  `inRange(null, 0, 20)` returned an error where TypeScript returns `false`. Conversion now
  emits the implementation and suggests the upgrade instead of performing it. The variants
  could never have earned their cost: with one body, every variant was a pass-through, so
  dispatch routed nothing and only gated. It also leaked `...__args` into the generated
  `.d.ts`, producing a declaration you could not legally call.
- **Same-named functions in different scopes are no longer merged.** The polymorphic merge
  grouped by name across the whole file, so two ordinary local helpers were rejected as
  "ambiguous variants" — legal JavaScript that TJS refused, a subset violation.
- **A type-only class field no longer absorbs the next member.** `readonly get: T` above
  `modify(f) {…}` emitted a bare `get`, producing a getter named `modify`. Private (`#x`)
  fields are still emitted — they are load-bearing, not type-level.
- **`$` is a legal identifier character.** `function $constructor(…)` and `Array$` were not
  recognised as declarations at all, so their parameters were never transformed. Also fixed
  in type-name position (`: Record$`).
- **A ternary's `:` is no longer read as an arrow's return type.**
  `flag ? ((r) => f(r)) : (r) => {…}` had its alternative deleted.
- **A generic type-parameter list is split depth-aware.** `<Config = { a: X, b: Y }>` was cut
  inside its own braces, emitting a brace closed by a bracket. A default containing `=>` was
  silently dropped.
- **A generated diagnostic can no longer be terminated by the code it quotes.** TypeScript
  type text often contains `*/`, which closed the comment early and turned the remainder into
  stray code.
- **`convert --emit-tjs` no longer reports success for output it cannot read.** It now
  validates its own result, exits non-zero, names the file, and does not write the artifact.
- **`given` no longer warns you to use `given`.** It lowers to a `switch` before parsing, so
  the advice fired on it — quoting the internal lowering back at the author, and failing
  `--max-warnings 0`.
- **A reasoning model's answer is read from whichever channel holds it.** Asking for
  structured output can leave `content` empty with the answer in `reasoning_content`; six
  call sites read `content` directly.

### Changed

- **`MonadicError` is shared across modules** via a shape-versioned global slot, so
  `instanceof` now works across a module boundary. `isMonadicError` remains the contract for
  anything crossing one. See `docs/runtime-fusion.md` for the rule this establishes: code
  fuses, data unions.
- **README bundle sizes remeasured** — they had drifted 17–23%.

### Added

- `tjs-lang/lang` exports `isTernaryColon` (`src/lang/expression-context.ts`), the first
  syntactic primitive above the lexical layer. See `docs/parser-primitives.md`.
- `docs/parser-primitives.md`, `docs/runtime-fusion.md`.
- `bun run test:compat-scan` — a ratchet over the whole compatibility corpus.

### Compatibility

Every file in zod, effect, kysely, radash, superstruct and ts-pattern now converts and
parses — **1973/1973**, up from 1951. All six projects' own test suites pass against our
output.

## [0.13.6] — 2026-08-26

### BREAKING — `defineAtom` now defaults to `effects: 'io'`

**If you define custom atoms, read this.** It ships as a **patch, deliberately**, and the
reasoning is worth stating because the obvious call is the wrong one.

Gating a security correctness fix behind a version bump means every adopter on `^0.13.x`
keeps the hole until they choose to move. Here the failure mode is the _silent absence of
protection_, so the person who never upgrades is the one who stays exposed — while the
person who does gets, at worst, a loud error telling them their atom was handing live host
references to guest code. There are no bad surprises in that trade, only good ones, and
they should arrive automatically. Breaking toward correctness, **loudly**, is a bugfix.

So: no bad surprises, but not silent ones either — hence this entry, the `BREAKING` marker,
and the migration notes below.

`effects` defaulted to `'pure'`, and `'pure'` skips the capability membrane. Not a
lighter check — `membraneValue` has exactly one call site, inside
`if (atom.effects === 'io')`, so an atom that didn't opt in bypassed the boundary
**entirely**: host objects reached guest scope by reference, getters intact, with
`methodCall` standing right there.

One default was serving two populations with opposite needs. Core atoms (`len`,
`jsonStringify`, `map`) work on data already inside the VM, so `'pure'` is right for them.
Atoms defined through the public `defineAtom` exist to bring **host** data in — Firestore
snapshots, Elasticsearch hits, SDK responses — which is precisely the data the membrane
exists to sanitise, and precisely the shape that carries accessors. The default served the
first and silently disabled the boundary for the second, whose authors are outside our audit
surface.

It failed quietly, which is what settles it: nothing warned, nothing broke, the atom worked
and the hardening was absent. snowfox-app upgraded _specifically_ for the 0.12.0
prototype-strip and later found all four of its custom atoms untagged ([#38]). When the
people who read the release note and acted on it still don't get the protection,
documentation is not a control.

**What changes for you.** An atom you define without `effects` now has its return
deep-copied through `structuredClone` before it reaches guest state. Three consequences:

- **Identity is not preserved.** The guest gets a copy. If you relied on handing through a
  live reference, that stops working — deliberately.
- **Non-cloneable returns are now rejected** with a `MonadicError`
  (`Capability boundary rejected the return of '<op>'`) instead of silently succeeding.
  Functions and **accessor properties** are refused; build the object literally, naming each
  field. `{ ...someResponse }` is not the fix and fails silently — a `Response` keeps
  `ok`/`status` on its _prototype_, so the spread is `{}`.
- **The atom is no longer callable from a verified predicate**, since predicates may only
  call pure atoms.

**If your atom really is pure**, say so and nothing changes:

```js
defineAtom('slugify', inSchema, outSchema, fn, { effects: 'pure' })
```

That is the honest fix, not a workaround — and it is now an explicit claim rather than
something you get by forgetting. Core atoms are classified the same way, by an explicit
sweep in both directions, so their class no longer depends on which default is in force.

### Fixed

- **`convert` stripped `new` from locally-declared classes** ([#37]). Converted modules threw
  `Class constructor X cannot be invoked without 'new'` and could not be imported at all — a
  `static zero = new Thing(0)` field fails at module _evaluation_ time, before any of the
  module's own code runs. Regressed in 0.13.0; 0.12.x and earlier are correct.

  Dropping `new` is only safe where a class is callable, and in native `.tjs` it is (the
  emitter Proxy-wraps it). But every `fromTS` output carries the `/* tjs <- … */`
  annotation, and that annotation means **JS semantics** — no Proxy wrap — so the `new` being
  removed was load-bearing. The transform now runs at _graduation_ (where the annotation is
  stripped and the class becomes callable), which is the step whose job it is.

  This was also corrupting converted **test suites**: preserved assertions 0.88 → 0.898,
  preserved tests 0.89 → 0.912. Both dogfood ratchets raised to lock it in.

### Added

- **A type can declare `asCompared()` on itself** ([#33]), beneath the `extend`/global
  registries in the projection chain. A registered projection still wins — the registries are
  keyed by `constructor.name`, which is a third party describing a type it does not own,
  whereas a method is the type answering for itself.

  This is the layer a **Proxy** can reach, and nothing above it can be. A proxy over
  `new Number(0)` has no internal slot (and slots are not forwarded to the target), so the
  slot read throws while `instanceof Number` says yes; and it reports its _target's_
  `constructor.name`, so the only registerable key is `'Number'` — which would claim that key
  for every boxed Number in the process. A `get` trap can serve a method.

  ```js
  class Money { constructor(c) { this.cents = c }  asCompared() { return this.cents } }
  new Money(500) == new Money(500)   // true
  if (new Money(0))                  // falsy
  ```

  Containment is unchanged: the probe and the call are both fail-soft, and a projection that
  is not a primitive is ignored rather than honoured.

### Fixed (same change)

- **A literal union disagreed with `==` about the same value.** `__oneOf` (the check emitted
  for `mode: 'a' | 'b'`) walked `unwrapBoxed` alone while every comparator walked the
  projection chain first — so a value could satisfy `v == 'b'` and _fail_ the check
  `'a' | 'b'`. The emitter had listed unions as a reason to emit the projection table since
  0.13.4; the union check just never read it.

[#33]: https://github.com/tonioloewald/tjs-lang/issues/33
[#38]: https://github.com/tonioloewald/tjs-lang/issues/38
[#37]: https://github.com/tonioloewald/tjs-lang/issues/37

## [0.13.5] — 2026-08-25

> **Fixes two defects in 0.13.4's `asCompared`, both found by a nine-lens review run after
> that release was published.** If you use `asCompared`, upgrade. If you do not, the second
> one still affects you — the projection table is emitted into every file that uses `==`,
> `Is` or truthiness, whether or not it declares a projection.
>
> 0.13.4 also went out without its tag being pushed, so the full-suite pre-push gate never
> ran for it. That is how it shipped.

### Fixed

- **A projection declared in one module silently changed another module's `if`.** The
  projection table was at MODULE scope rather than per-runtime, and `extend` fed it
  unconditionally — so a module with no `extend` at all had its control flow change when an
  unrelated module loaded:

  ```
  B before A loads: truthy
  B after  A loads: FALSY     ← B has no `extend`
  ```

  Four shipped documents asserted the opposite, including this changelog's own 0.13.4 entry
  ("one module's projection cannot reach another's comparators"). The global write is gone.

  The structural half, which is why the first attempt got it wrong: `==` and `Is` are emitted
  bare and read the file-local table, but truthiness went through `__tjs.toBool` — the SHARED
  implementation, which cannot see it. So a value could be falsy without being equal to
  `false`, inside one module. The emitted runtime binding now overrides its own `toBool` to
  consult the file-local table, so all three comparators read one table and it is this file's.

- **An attacker-controlled `constructor.name` reached `Object.prototype`.** The emitted table
  was a bare `{}` and the lookup was `__ac[k]`, so a key from `JSON.parse` — which creates a
  real _own_ `constructor` property — walked the prototype chain. `__ac['toString']` resolved
  to `Object.prototype.toString`, which returns a conforming primitive for any object, so two
  distinct objects with different contents compared **equal** under emitted `==`:

  ```js
  eq(JSON.parse('{"constructor":{"name":"toString"},"x":1}'),
     JSON.parse('{"constructor":{"name":"toString"},"x":2}'))   // was true
  ```

  The table is now `Object.create(null)` with an own-property check, and the resolved value
  must be a function. Verified against `toString`, `valueOf`, `hasOwnProperty`,
  `isPrototypeOf` and `toLocaleString`.

- **`wasm { } fallback { }` threw instead of falling back when the engine has no wasm
  compiler** ([#36]). The async retry lived inside the `catch` of the sync attempt with
  nothing around it — `WebAssembly.instantiate` normally rejects, so a `.catch` was assumed
  sufficient, but under memory pressure SpiderMonkey throws `no WebAssembly compiler
available` SYNCHRONOUSLY and that escaped, taking down the whole module. So `fallback`
  covered "this module failed to validate" but not "this engine has no wasm compiler right
  now" — the broader case, and the one an author cannot code around: intermittent,
  resource-dependent, ~1 run in 6 on a loaded Firefox. Reported from tosijs-ui's Playwright
  lane.

- **The dependency-audit gate did not cover `functions/`.** It ran `bun audit` with no `cwd`
  override and there is no `workspaces` field, so the deployed Cloud Functions tree was
  outside it — which is how an ecosystem sweep found 3 criticals there while the gate
  reported green. Both trees are audited now.

### Changed

- **Dev-tree advisories cleared** ([#31]): `firebase` devDep ^10 → ^12 removes all eleven
  `undici` advisories; root `firebase-admin`/`firebase-functions` aligned with the versions
  `functions/` already moved to. Root audit 23 → 7, all dev-only.

### Documentation

- **The optional-peer re-export trap** ([#28]) is documented in the README. `import type` is
  erased from emitted JS but not from emitted `.d.ts`, so a package re-exporting a tjs-lang
  type makes tjs-lang a hard typecheck dependency for _its_ consumers — and declaring the
  optional peer does not help, because optionality governs installation, not type resolution.

[#28]: https://github.com/tonioloewald/tjs-lang/issues/28
[#36]: https://github.com/tonioloewald/tjs-lang/issues/36
[#31]: https://github.com/tonioloewald/tjs-lang/issues/31

## [0.13.4] — 2026-08-25

### Added

- **`asCompared` — a type can say what it IS, for comparison.** Declared with `extend`, so
  you can attach one to a type you do not own without touching its prototype:

  ```js
  extend Timestamp { asCompared() { return this.seconds * 1000 + this.nanos / 1e6 } }

  ts1 == ts2          // true when they project equally
  Is({ when: ts1 }, { when: ts2 })   // composes into the deep walk
  if (failedResult)   // false, when the type projects to false
  ```

  **Consumed by `Eq`, `Is` AND `toBool`** — that last one is the point as much as the first.
  An errored service result is an object, objects are truthy, and until now the type had no
  way to say otherwise: `if (result)` took the success branch on a failure.

  A **projection**, not an `equals(other)` predicate, deliberately. A projection composes —
  the deep walk normalises each node, so a projected value nested three levels inside an
  object just works — and it generalises to ordering, neither of which a comparison
  predicate gives you.

  **Must project to a primitive, or to nothing**: `number`, `string`, `boolean`, `null`,
  `undefined`. An object projection defers the question rather than answering it. `bigint`
  is excluded on purpose — `1n === 1` is false, so two projections disagreeing on
  number-vs-bigint would compare unequal for values that are equal, and nobody needs
  nanosecond-exact `==`. A non-conforming or throwing projection is IGNORED rather than
  thrown: a hook that breaks `==` for every value is worse than one that does not apply.

  **It works in standalone emitted code**, not only under a shared runtime. Emitted files
  declare their own comparators and call them bare, so the projection table is emitted
  per-file — which also makes it file-local by construction. One module's projection cannot
  reach another's comparators; a single shared mutable type→behaviour table would be
  prototype pollution by another name, which is what `extend` exists to avoid.
  **⚠️ This claim was FALSE as shipped in 0.13.4** — the table was process-global and
  projections did leak across modules. Fixed in 0.13.5; the note is left here rather than
  rewritten, because a changelog that quietly corrects itself is worse than one that says
  what happened.

  This is not a new mechanism so much as an opened one: `unwrapBoxed` was already a
  comparison-projection table with three hardcoded entries (a `String` instance compares as
  a string, `Number` as a number, `Boolean` as a boolean). Those are the root of the chain;
  `asCompared` is the layer above them. Design and rationale in
  [`docs/type-system-north-star.md`](https://github.com/tonioloewald/tjs-lang/blob/main/docs/type-system-north-star.md).

### Fixed

- **`functions/`: 3 critical advisories cleared** ([#30]). `firebase-admin` 13→14,
  `firebase-functions` →7.3.2, and `tjs-lang` off `^0.2.8` — a range we deprecated
  ourselves. 3 critical / 5 high / 21 moderate → 0 / 1 / 16. The remaining `undici` high is
  pinned transitively by `@firebase/auth`.

- **An abolished mode directive emitted a bare identifier instead of erroring.** The guard
  scanned the file preamble and stopped at the first line that was not itself a directive,
  skipping only line comments and block-comment openers — so a markdown line inside a doc
  comment ended the scan at the top of the file. `tjs emit` then exited 0 and wrote a module
  that threw `ReferenceError: TjsSafeEval is not defined` on load. Our own Cloud Functions
  shipped that way; the committed bundle worked only because it predated the abolition.

[#30]: https://github.com/tonioloewald/tjs-lang/issues/30

## [0.13.3] — 2026-08-24

> Found by an ecosystem security sweep and by playing with the deployed playground —
> neither by a test here. Both defects were in published 0.13.2.

### Fixed

- **`typeof obj[key]` compiled to `(typeof obj)[key]`, so every guard of that shape was
  silently always true** ([#29]). `typeof` lowered to `TypeOf(…)` consuming only `.name` /
  `?.name` chains, so a COMPUTED access fell outside the call:

  ```js
  typeof obj[k] !== 'function'   //  ->  TypeOf(obj)[k] !== 'function'
  ```

  `TypeOf(obj)` is the string `'object'`, `'object'[k]` is `undefined`, and
  `undefined !== 'function'` is **always true**. No parse error, no type error, no warning,
  and the source reads correctly — the reporter's filter returned every key instead of
  dropping the function.

  The report named one form; **six** were broken. `x[k]`, `x[0]`, `x['lit']`, `x[k].foo`,
  `x.foo[k]` and `x[k][j]` were all silently wrong, and `typeof f()` became `TypeOf(f)()` —
  calling a string, which at least failed loudly. The operand now consumes balanced `[…]`
  and `(…)` by depth over a masked view, so nesting is safe and a bracket inside a string is
  not structure.

  This also restores something that never worked: `typeof o[k]` where the value is `null`
  now returns `'null'` rather than `'object'`. `TypeOf` exists to fix exactly that footgun
  and the value was never reaching it through a computed access.

  Reproduces back to 0.8.1 — not a regression, always wrong.

- **The Schema Validation playground example shipped a wrong worked example.** Its return
  annotation described a SHAPE (`{ name: '', … }`) where TJS reads a worked example and
  compares by deep equality — the single most common mistake with this syntax, in a teaching
  example on the public playground. The guard that should have caught it exists, but the
  example sat on a skip list whose stated reason is "examples that use imports"; it has no
  imports, nor did three other entries. A test now derives that justification instead of
  trusting it.

### Changed

- **`demo/` is no longer published.** It shipped 30 files and ~1.9 MB of playground source
  that no consumer of the package needs, including the Firebase web key in three of them
  ([#31] — a public project identifier by design, not a secret, but noise that trips secret
  scanners). Unpacked size 15.2 MB → 13.3 MB. The playground is deployed from `.demo/` and
  is unaffected.

[#29]: https://github.com/tonioloewald/tjs-lang/issues/29
[#31]: https://github.com/tonioloewald/tjs-lang/issues/31

## [0.13.2] — 2026-08-21

> A **ninth** pass then blocked this one on three more
> ([report](https://github.com/tonioloewald/tjs-lang/blob/main/docs/reviews/0.13.2-review-9.md)),
> two of them sibling-site misses in the fixes above: the symlink guard protected only the
> LEAF, so a symlinked output DIRECTORY still escaped and destroyed a file outside the named
> tree; and moving the `#!` line to the file-write seam fixed `-o` while silently regressing
> `tjs emit bin.tjs > bin.js`, which is the first example in `--help`. Both fixed here, with
> containment (a symlinked `-o` ROOT stays legal — that is a normal setup) and with stdout
> treated as the artifact sink it is. A fourth finding — that `port.test.ts` is red — was
> checked and **refuted**: `isOurServer` rejects the test runner under both relative and
> absolute argv.
>
> An eighth review pass, run after 0.13.1 shipped
> ([report](https://github.com/tonioloewald/tjs-lang/blob/main/docs/reviews/0.13.1-review-8.md)),
> found that 0.13.1's hashbang fix had been applied at the wrong seam — breaking `tjsx`, a
> published bin. **Six of eight rounds have now found a defect introduced by the previous
> round's fixes.** That is the argument for the round, not against it.

### ⚠️ Upgrade from 0.13.1

- **If you use `tjsx`, the playground, or `new Function(result.code)` on a file with a `#!`
  line, 0.13.1 threw `Invalid character: '#'`.** Fixed. `result.code` is now always a clean
  fragment and the shebang is carried separately as `result.hashbang`.
- **`tjs emit` now exits non-zero when it fails.** If a build script relied on it exiting 0,
  it was relying on a bug: 0.13.1 reported `2 emitted, 0 failed` with output missing.

### Fixed

- **The `#!` line was baked into `result.code`, breaking every embedder.** `code` is a
  FRAGMENT — `tjsx` wraps it in `new Function`, CLAUDE.md documents that idiom, and the
  playground evaluates it — and a hashbang is legal only at offset 0 of a whole script. All
  three died with `Invalid character: '#'`, an error naming neither the shebang nor the
  file. The line now travels beside the code as `result.hashbang` and is re-attached only
  where a FILE is written.

- **`tjs convert` silently stripped the `#!` line.** It never had any hashbang handling; the
  TS→TJS→JS chain loses it at the first step, so the restore added in 0.13.1 never saw it.
  `convert` is the command the migration docs point TypeScript users at — the one most
  likely to meet a real bin script.

- **`tjs emit` reported success and exited 0 with output missing.** `emitFile` swallowed its
  own error whenever `-o` was given, so the directory walk's failure branch was unreachable:
  a directory with one broken file printed `2 emitted, 0 failed`, exit 0, with that file's
  output absent. Nested tallies were also dropped at the recursion boundary. `tjs emit` is
  the documented production build path, so a CI step went green having produced a missing
  module. `convert` fixed exactly this in #24; its structural twin never got the same fix.

- **A symlinked output DIRECTORY still escaped the named tree.** The first guard unlinked a
  symlinked LEAF, but with `out/sub` a link elsewhere, `lstat` on `out/sub/b.js` resolves
  `sub` through the link and sees an ordinary file — so the write went through and destroyed
  the target while reporting `1 emitted, 0 failed`, exit 0. Writes are now CONTAINED: the
  resolved destination must sit under the resolved `-o` root. A symlinked root itself stays
  legal (`-o dist` where `dist -> /build/dist` is a normal setup).

- **`tjs emit`/`convert` to STDOUT dropped the `#!` line.** Moving the hashbang to the
  file-write seam fixed `-o` and regressed the pipe — and `tjs emit bin.tjs > bin.js` is the
  first example in `--help`, appears in two guides, and is what `functions/`'s own build
  script runs. A file and a pipe are two consumers of one decision.

- **`tjs emit -o out/a.mjs` overwrote the module with its own generated docs.** The sibling
  paths were derived with `replace(/\.js$/, …)`, which does not match `.mjs` — the normal
  ask for a `"type": "module"` package — so the docs path equalled the artifact path. Now
  derived from the stem, and a derived path equal to the output is refused as the bug it is.

- **`emit --dts` and `emit --docs` wrote THROUGH symlinks too.** The first fix for this
  routed `emit`'s JS output through a safe boundary and left its two sibling writes on raw
  `writeFileSync`, twenty lines below — so `emit --dts` still destroyed a symlink's target
  and reported success. Every file the CLI writes now goes through one `writeEmitted`, and
  `src/cli/write-boundary.test.ts` enumerates the command files and fails on any raw
  `writeFileSync` rather than relying on anyone to remember the sweep. A companion check
  enumerates the `result.code` contract (never starts with `#!`, always embeddable in
  `new Function`), because that fragment has twelve consumer sites and the previous round
  tested four.

- **`emit`/`convert` wrote THROUGH symlinks in the output directory.** With `out/a.js` a
  link to `precious/keep.txt`, `tjs emit src -o out -r` overwrote the target and reported
  `1 emitted, 0 failed`, exit 0 — data loss reported as success, in the same command whose
  READ half refuses that exact escape by construction. Writes now go through one
  `writeEmitted` boundary that unlinks a symlink rather than following it.

## [0.13.1] — 2026-08-21

> **0.13.0 was published by mistake.** It was meant to be a release candidate and the
> version was labelled `0.13.0`; the publish also ran from the working tree rather than a
> pushed tag, so the full-suite gate in `.githooks/pre-push` never fired for it. `v0.13.0`
> has since been tagged retroactively at the commit the registry actually has, and 0.13.0
> **will be deprecated on npm** in favour of this release.
>
> A **seventh** pass then reviewed this patch before it shipped and blocked it on three more,
> all introduced by the fixes below
> ([report](https://github.com/tonioloewald/tjs-lang/blob/main/docs/reviews/0.13.1-review-7.md)):
> `tjs check` had started silently SKIPPING symlinked source files (green because it did not
> look), `emit`/`convert` still followed symlinks and could write output derived from outside
> the tree they were given, and `tjs emit` silently stripped the `#!` line this release
> advertises as newly supported. All three are fixed here. Five of seven rounds have now
> found a defect introduced by the previous round's fixes — which is the argument for the
> round, not against it.
>
> A sixth review pass, run AFTER publication
> ([report](https://github.com/tonioloewald/tjs-lang/blob/main/docs/reviews/0.13.0-review-6-post-publish.md)),
> found the blocker below plus every major fixed here. Reviewing after shipping is not the
> plan; it is what caught this.

### ⚠️ Upgrade from 0.13.0

- **`{ mode: 'a' | 'b', other: 1 }` did not compile in 0.13.0.** If you pinned it and hit a
  `signature example is inconsistent` error on an options object, this is why — and the
  workaround (reordering members) is no longer needed.

### Fixed

- **A nested literal union discarded every sibling after it.** `collapseUnions` handed the
  whole bracket body back to itself, found the first depth-0 `|` inside the container, and
  returned only what was left of it. Whether a file compiled depended on the ORDER of its
  members: `function cfg(o: { mode: 'a' | 'b', other: 1 })` threw, while the same members
  reversed passed. The array form was worse because it was SILENT — `['a' | 'b', 'c']`
  collapsed to a one-element array, so the signature test ran against a shorter argument and
  passed while checking less than it claimed. Every nested case in the test file put the
  union in a container by itself, which is why the whole multi-member class — the ordinary
  shape — shipped untested and green.

- **`IsNot` without `Is` emitted a module that threw on first call.**
  `needsIs = code.includes('Is(')` is false for `IsNot(`, and `IsNot` is implemented as
  `!Is(a,b)`, so emitted code raised `ReferenceError: Is is not defined` in Node and Bun,
  for both the call form and the `a IsNot b` infix form. `NotEq` escaped only by luck:
  `'NotEq('` does contain `'Eq('`.

- **A `#!` line was rejected everywhere except `tjs check`.** Hashbang is standard
  ECMAScript (ES2023) and acorn already parses it, so rejecting it made
  `tjs(src, { dialect: 'js' })` refuse legal JavaScript — a `PRINCIPLES.md` TJS ⊇ JS subset
  violation. It was handled in the `check` command alone, so `check` green-lit bin scripts
  that `emit`, `run`, `types` and `test` all died on. Now handled in `preprocess`, which
  every path goes through.

- **The shared directory walk mishandled symlinks — in three ways, across three commands.**
  A link to a real FILE is now collected (skipping it made `tjs check <dir>` print a tick and
  exit 0 without reading a source file that was there); a link to a DIRECTORY is not
  descended (descending escaped the tree the user named — `emit -r` wrote output derived from
  a file outside it while reporting success — and a cycle recursed 33 levels before `ELOOP`);
  a DANGLING link is skipped rather than fatal (it aborted the run and emitted zero files,
  losing valid siblings). `emit` and `convert` had been left on the old `statSync` walk when
  `check` moved, so the three disagreed; they now share one `readEntries`.

- **`tjs emit` silently stripped the `#!` line.** `preprocess` blanks it for offset
  stability and nothing put it back, so an emitted bin script opened with 19 spaces and died
  with a shell syntax error — exit 0, no warning. Worse than the bug it replaced: 0.13.0
  rejected such a file loudly, which at least names the problem.

- **`tjs convert <dir>` mirrored `node_modules` and dot-directories into its output** — 913
  real `.ts` files in this repo alone. It applied neither exclusion while `emit` applied
  both. Hoisted as `shouldDescend`, now shared by all three walks.

- **`--max-warnings` silently suppressed narration** for a single file, while `--help`
  asserted "a single file always narrates". A warning-budget flag doubling as a hidden
  verbosity switch; `--verbose` is the narration control.

- **The array diagnostic's `…` marker was missing on the four-kinds path**, so
  `[1,'a',true,null,{},Symbol()]` reported an exhaustive-looking list after scanning 4 of 6
  elements — contradicting the invariant the marker was added to establish.

- **`chargeHeapWalk` could refuse a heap write without setting `ctx.error`**, breaking the
  contract its callers document: the caller stopped and the run reported success with no
  explanation.

- **`tjs check` on an all-TypeScript directory** said "No source files found", which is true
  and reads like the path is wrong. It now names the extensions it wants and points at
  `tjs convert`.

- **`tjs-playground` ignored `TJS_CACHE_DIR`** — `defaultOutDir` was an independent copy of
  the cache-path policy `resolveCacheDir` was extracted in 0.13.0 to own, and it was the
  copy that writes tens of megabytes under `$HOME`.

### Performance

- **`rejectAt` was O(violations × filesize)** — `locAt` scans from offset 0, so 3200
  violations in a 343KB file took 540ms to build a 44,498-character message it was about to
  throw. One forward pass now, with the location list capped at 20 plus a total count.

### Internal

- One balanced-bracket matcher instead of four: `matchingBrace` takes its closer from its
  opener and handles `{`/`[`/`(`. The fourth private copy had been added in the same window
  that hoisted `splitTopLevelTrimmed` to prevent exactly that — and the untested copy was
  the one the nested-literal-unions feature ran on.
- `src/cli/walk.ts` and `tjs check`'s three 0.13.0 behaviours gained the tests they shipped
  without; `emitted-module-scope.test.ts` now parses, RUNS and loads emitted output in a
  real `node` subprocess, having previously only parsed — which is how it held `IsNot` in
  its corpus and passed.
- `perf.test.ts`'s intensive-loop test no longer prints a ratio: measured in-process it
  varied 54× for identical code depending on JIT history (2.18× alone, 116.75× in a full
  run), because the baseline folds away. The file's other ratios are unchanged and carry the
  same caveat, stated in its header; `bun run bench` is the authority for any number you
  plan to quote.

### Compatibility

- **Bun 1.4**: full suite green. `Bun.build()`'s native memory leak
  ([oven-sh/bun#34053](https://github.com/oven-sh/bun/issues/34053)) is fixed upstream — 300
  builds now cost ~15MB total rather than growing without bound. The `fetch` error-shape and
  shared-reference-recursion issues we filed remain open; our workarounds stay.

## [0.13.0] — 2026-08-19

> Reviewed FIVE times before tagging, each pass over the full diff since
> `v0.13.0-beta.1`. The first ([report](https://github.com/tonioloewald/tjs-lang/blob/main/docs/reviews/0.13.0-pre-release-review.md))
> returned BLOCK on five blockers; the second
> ([report](https://github.com/tonioloewald/tjs-lang/blob/main/docs/reviews/0.13.0-review-2-af46fa2.md)) BLOCKed on two more that the first
> round of fixes had introduced; the third ([report](https://github.com/tonioloewald/tjs-lang/blob/main/docs/reviews/0.13.0-review-3-full.md))
> BLOCKed on a parenthesised-arrow emit bug; the fourth
> ([report](https://github.com/tonioloewald/tjs-lang/blob/main/docs/reviews/0.13.0-review-4-final.md)) BLOCKed on four, **two of them
> regressions introduced by the third round's own fixes** — a `maxHeapBytes` bypass and a
> build failure that would have shipped a stale bundle; the fifth
> ([report](https://github.com/tonioloewald/tjs-lang/blob/main/docs/reviews/0.13.0-review-5-delta.md))
> BLOCKed on two — a `let` arrow with `:?` that crashed at module load (a regression from
> the fourth round's own fixes) and the shipped `tjs` binary hard-failing for anyone without
> the TypeScript compiler. All are fixed, along with every major and most minors each pass
> confirmed.
>
> That pattern — a fix round introducing the next blocker — happened in FOUR of the five
> rounds, and is the honest argument for reviewing again after fixing rather than treating
> the last green run as the answer.
>
> _Links are absolute because `docs/reviews/` is deliberately excluded from the npm
> package (`"!docs/reviews"` in `files`): relative links would be dead on npm and unpkg._

### ⚠️ Upgrading — read this first

11 changes alter behaviour. Most produce no type error, so recompiling does not catch
them; **one of them — a `Type` block that declares no example, predicate or default — is a
hard compile error on source that used to transpile**. All but the VM-budget change affect code that ran under **0.12.0**.

(The count and the "the last one" pointer were both stale: bullets were appended to this
list after it was written, so the positional reference had drifted off the item it named.
Positional references into a list that grows are a standing trap; the item is named now.)

- **`Timestamp` and `isValidTimestamp` now mean epoch MILLISECONDS, not an ISO 8601
  string.** Both signatures WIDENED (`(v: string)` → `(v: unknown)`), and
  `RuntimeType<T>.check(value: unknown)` never references `T`, so `tsc --strict` reports
  zero diagnostics — `isValidTimestamp(isoString)` simply returns `false` where it
  returned `true`. Use **`isValidISOTimestamp`** / **`TimestampISO`** for the string form,
  or `Date.parse(s)` to convert. As of 0.13.0 the epoch form warns once per process when
  handed a valid ISO string, naming the replacement.
- **`tosijs-schema` ≥ 1.5.0 enforces `additionalProperties: false`**, which the battery
  atoms' output schemas did not account for. An OpenAI-shaped message carrying
  `refusal`/`annotations` failed with `Output validation failed for 'llmPredictBattery'` —
  a hard `AgentError`, not a warning. Fixed here. **This affects already-released
  versions:** 0.12.0 and 0.13.0-beta.1 both declare `tosijs-schema: ^1.4.0`, which
  resolves to 1.5.x today, so a fresh `npm i` on an older tjs-lang can break with no
  change on the consumer's side. Upgrading to 0.13.0 is the fix.
- **VM budgets:** loop bindings (`map`/`filter`/`find`/`reduce`) no longer re-account the
  loop variable, so per-iteration fuel is size-insensitive again and matches 0.12.x. If
  you tuned a `fuel` budget against a 0.13.0 beta, it buys MORE work now, not less.
- **A declared `Type` now CHECKS when used as an annotation.** `Type Even { example: 0
predicate(v) { return v % 2 === 0 } }` followed by `function double(n: Even)` — before,
  `double(3)` returned `6`; now it returns a MonadicError. The annotation always looked
  like a contract; it now is one. Nothing to migrate if your values were already valid,
  but a previously-silent violation becomes a visible error at the call site.

- **`:?` validates the return value at runtime**, not only in the signature test. Two
  consequences worth knowing, because the wrapper REBINDS the function:

  - `f.length` becomes `0` (the wrapper takes `...args`), so anything reflecting on arity
    sees a different number.
  - a declared `async function` becomes a plain `Function` object — `await` still works
    and it still returns a promise, but `fn.constructor.name` is no longer
    `AsyncFunction`.

- **A `Type` block that declares no example, predicate or default is now an ERROR.** The
  interface spelling — `Type User { name: '' \n age: 0 }` — used to parse, silently
  discard its members, and produce a type that accepted **every** value (`User.check(42)`
  → `true`), while the real runtime threw at construction. Source that transpiled now
  fails, with the fix shown as code. An EMPTY or comments-only block is still accepted:
  that is what `fromTS` emits for a TypeScript type it cannot express, and it discards
  nothing.

- **`tjs check --max-warnings` exits 2 on a fumbled argument**, where it used to exit 1.
  A missing or non-numeric value made `Number()` produce `NaN`, and `0 > NaN` is false, so
  a bare `--max-warnings` failed a CLEAN file with "0 warnings exceeds --max-warnings
  NaN". Exit 2 now means "you invoked me wrong" and 1 still means "the check failed" —
  worth knowing if a script branches on the code.

- **Excess object keys are now accepted everywhere, and dictionary defaults no longer
  strip them.** `place({ x: 5, z: 9 })` against `place(args = { x: 0, y: 0 })` returns
  `{ x: 5, y: 0, z: 9 }`; in 0.12.0 the `z` was silently deleted (WebIDL §5.4 semantics,
  with a once-per-site recorder notice). A declared type with a non-empty object example
  likewise no longer rejects an extra key.

  Three reasons, in `docs/dictionary-defaults.md` → **"Where we diverge from WebIDL"**:
  WebIDL strips because a dictionary is a _wire format_, whereas a TJS `= {…}` parameter
  is an options bag inside one program; the notice was silent where it mattered (a log,
  once per site); and TypeScript cannot express the closed type this enforced — its
  excess-property check is a freshness lint on literals, not a property of the type, and
  there is no `Exact<T>`.

  Members are still validated, missing members still fill recursively, and the
  prototype-pollution keys are still rejected — that one is a security guard, not a
  normalisation policy. If you relied on a dictionary default to sanitise a payload,
  destructure explicitly: `const clean = ({ x, y }) => ({ x, y })`. The
  `dict-default-excess-key` lint still fires, now worded as the typo check it always
  really was.

- **Destructured `:` members are genuinely required now, and destructured params generate
  signature tests.** `function f({ a: 2, b = 3 })` called as `f({ a: 2 })` used to return
  `5`; a call omitting a `:` member now returns a MonadicError. Separately, a destructured
  parameter used to produce NO signature test at all (the extractor fell through and threw,
  and the throw was swallowed), so a previously-green build can go red on a signature that
  was never actually being checked. Both are the same correction: the annotation always
  looked like a contract and now is one.
- **Emitted `Is` and `Eq` no longer run a hostile `valueOf`, and no longer throw.** A
  boxed-primitive subclass that overrides `valueOf` used to have that method CALLED by
  emitted comparisons (`Is(new Liar(1), 999)` was `true`), and a Proxy faking
  `Boolean.prototype` made `==` throw a raw `TypeError` — out of an operator whose whole
  contract is that errors are RETURNED. Both now read the internal slot and fail soft. If
  you relied on `valueOf` being consulted by `==`, use `Is` with a
  `[Symbol.for('tjs.equals')]` method, which is the supported seam.
- **`MonadicError.actual` now describes an array's ELEMENTS, not just `'array'`.** It is a
  public field on a public error type, and the string changed: `f([1, 'bad', 3])` against
  `xs: [0]` reports `array of number | string` where it used to report `array`. That names
  the intruder next to the expectation, which is the pair a reader can act on — but any test
  asserting `err.actual === 'array'`, or matching the full message, will need updating. Very
  long arrays are summarised from the first 64 elements and marked with a trailing `…`, so
  the value never claims to have looked at more than it did.

Two bodies of work. **First**, the language stabilised in its own direction: the guiding
rule became _a form that parses must mean something_, and every construct that parsed
while validating nothing was either built or removed. **Second** (below, from "Everything
below came out of the full pre-release review"), the pre-release review of
`0.13.0-beta.1`.

The through-line is worth stating because it explains why so many entries are small: the
language now claims less by accident and checks more on purpose, and everything it claims
is asserted by something that runs.

### Added

- **`predicate => expr` and `predicate { return expr }`.** The terse spellings are real.
  The type name binds to the value under test, so `Type Even { example: 2\n predicate =>
Even % 2 === 0 }` reads as "an `Even` is a value where…". Both normalise into the
  function form, so they inherit predicate verification, fuel bounding and the
  `$predicate` schema path rather than re-implementing them. `predicate =>` previously
  parsed and accepted **every value**; it was then rejected outright; now it works.

- **A parameterized type derives its predicate from its example.**
  `Type Box<T> { example: { value: T } }` now checks its parameter — writing
  `predicate(x, T) { return T(x.value) }` alongside it was restating what the example
  already said. Previously a predicate-less parameterized type emitted
  `Generic([...], () => true)`: it accepted everything while looking like it checked.

- **Type arguments in an annotation: `b: Box<int>`.** A parameterized type applied to
  arguments is a call at run time, and a primitive argument becomes a **predicate** —
  the only representation available for a type that is not a value (`int` compiles to an
  inline check, so `Box(int)` would reference nothing). Predicates compose, so
  `Box<Box<int>>` works. The applied type is hoisted to a module-level `const` named after
  the annotation, so it is built once rather than per call and errors read
  `Expected Box_int`.

- **`T[]` — the most common annotation in TypeScript.** `function f(xs: number[])` did not
  parse at all. It now rewrites to the array-example spelling (`[0.0]`), inheriting item
  checking, `.d.ts` emit and JSON-Schema. Nests (`string[][]`), and `int[]` narrows where
  `number[]` deliberately does not.

- **Literal unions narrow.** `function f(x: 'yes' | 'no')` rejects `'maybe'`. This is the
  one place the examples model bends, and the line is **vacuity**: read as examples,
  `'a' | 'b'` widens to `string | string` and means what `''` means, so it says nothing and
  must have been meant as a set — whereas `0 | ''` widens to `integer | string`, which is a
  real statement, and stays a union of types. Membership is the language's `==`, which is
  a decision with consequences: `new String('yes')` is a member, `+0 | +1` is identical to
  `0 | 1`, and `1 | 1.0` is a ONE-member union.

### Changed

- **`new` is not allowed on a class declared in the same file.** A TJS class is _called_ —
  `P(1)` and `new P(2)` produce identical objects — so `new` was decoration with the look
  of significance, and it was meanwhile a hard error for `Date`. `unsafe new P(1)` is the
  per-site escape. Scoped to locally-declared classes: for a built-in, `new` is
  **mandatory** (`new Float32Array(4)` throws without it).

- **A rest parameter cannot have a default.** `...xs: number[] = [1]` compiled and did
  nothing — `f()` returned `[]`. A rest parameter is always bound, to `[]` when nothing is
  passed, so there is no absent case for a default to fill. JS rejects `...xs = [1]`
  already; only the annotated spelling slipped through.

### Fixed

- **An emitted module using both `==` and `Is` would not load in Node.** `Eq`, `Is` and
  `__oneOf` each prepended their own copy of the shared boxed-primitive unwrap, so a file
  using two of them declared `function __ub` twice at module top level. Bun runs that; Node
  refuses (`SyntaxError: Identifier '__ub' has already been declared`). Emitted modules were
  therefore dead on arrival for Node consumers while the whole suite stayed green — the same
  shape as the `typescript` import snowfox hit in production. Emitted output is now parsed as
  a MODULE in the guard, where a duplicate top-level declaration is an error rather than a
  shrug, and the helpers are driven pairwise because the defect only existed in combination.

- **A literal-union type check THREW on a hostile value** instead of returning a
  `MonadicError`. `__oneOf` carried the fifth hand-inlined copy of the boxed-primitive unwrap
  and was the only one still missing the fail-soft guard, so
  `pick(new Proxy({}, { getPrototypeOf: () => Number.prototype }))` produced a raw
  `TypeError: thisNumberValue called on incompatible object`. A throw out of a type check
  breaks the promise that errors are returned, not thrown, and it was reachable from any
  untrusted input. It now calls the shared `__ub`.

- **The shipped `tjs` binary hard-failed without the TypeScript compiler**, including
  `--help` and `--version`, which touch no TypeScript at all. `typescript` is a
  devDependency; the CLI entry imported `./commands/convert` statically, which reaches
  `emitters/from-ts`. `src/index-tsfree.test.ts` had guarded the library entry against
  exactly this since snowfox hit it in production; the CLI had no equivalent. `convert` is
  now loaded lazily and still fails clearly, naming the missing package, when actually
  invoked.

- **One exempt `new X\n  .Y()` silenced the no-`new` rule for an entire file.** The rewriter
  and the checker each had their own answer to "does this `new X` construct X?", and the two
  disagreed: the rewriter tested for `.` with no whitespace allowed (so
  `new Shape\n  .Circle(2)` became `Shape()\n  .Circle(2)`, changing what the program means,
  and `new Reg[key]()` became `Reg()[key]()`), while the reporter re-matched with `\s*\.`
  and so matched nothing. `tjs check` accepted files containing genuine violations. Both now
  call one shared predicate, and every violation is reported rather than only the first.

- **A `let` arrow with a `:?` return annotation crashed at module load** — a temporal
  dead-zone error introduced by the previous review round's own fix.

- **`tjs check <dir>` walked into `.ts` files** it cannot parse, and a shebang line broke
  offsets. It now takes the directory its own error text recommends.

- **Exported arrow consts reach the `.d.ts` ([GitHub #4](https://github.com/tonioloewald/tjs-lang/issues/4)).** `export const id = (x: 0) => x`
  emitted `id: any`, so a consumer got no types for exactly the declaration style modern TS
  code is written in. Guarded by `src/lang/dts-compiles.test.ts` ("exported arrows reach the
  .d.ts (issue #4)"), which compiles the emitted declarations rather than string-matching
  them.

- **Nested literal unions, and `| null` dropped from `.d.ts` output.**

- **A string containing `/* unsafe */` turned validation off for the whole function.**
  Per-function safety was decided by a raw substring search over the parameter source, and
  a parameter DEFAULT is part of that source — so `function h(n: 0, s = '/* unsafe */')`
  emitted `unsafe: true` and checked nothing, while the same function without the literal
  validated `n`. A nested arrow's default disarmed the OUTER function the same way. This
  is the one member of the literal-blindness class that turns checks OFF rather than
  garbling output, so its entire effect is the absence of something.

- **Five declaration transforms rewrote TJS syntax inside string literals** — `Type`,
  `FunctionPredicate`, `Generic`, `Union`, `Enum`, plus `const!`. A declaration written
  inside a template came out as the string's CONTENTS transformed; the single-quoted form
  injected unescaped quotes and failed to parse, **rejecting legal JavaScript** even under
  `dialect: 'js'`. For a language whose own docs and tests are full of illustrative
  declarations, "a declaration inside a string" is the normal case.

- **A declaration inside a doc template became a phantom exported type in the `.d.ts`.**
  Two `dts.ts` scanners detected on raw source while brace-matching a masked view, so a
  documentation template could emit `export type Ghost = (x: number) => any` — a type with
  no runtime, degraded as well, which a consumer's editor autocompletes and their build
  accepts.

- **The `expect` harness differed depending on which runner ran your test.** Two copies had
  drifted in opposite directions: one had `toThrow` and no `toBeNaN`, the other the
  reverse. `tjs test file.tjs` failed with `expect(...).toThrow is not a function` on a
  test that passed in the playground. Both documented as working. There is now one harness.

- **The converter emitted `.tjs` that does not parse for builtin return types.** Any class
  method returning `Response`, `URL`, `AbortSignal` (and others) produced
  `make():! new Response() {` — `new` is abolished in TJS — or `make():! AbortSignal.abort() {`.
  Three sites emitted return annotations and only one filtered anything.

- **The emitted call-stack array grew without bound.** The inline runtime's `pushStack`
  appended one entry per call forever — 201,000 calls left 201,000 entries — because the
  matching `popStack()` is emitted after the `return`. It is now the same bounded 64-entry
  ring the real runtime uses. Standalone emitted files are the shipping configuration, so
  this was a live leak in any long-running program built from them.

- **`tjs-playground` built into its own installed package directory.** Under pnpm and bun
  on Linux that is a hardlink into the machine-wide store. It now builds into an OS cache
  directory keyed by version, announces the path on stderr, and accepts `--out-dir`. It
  also no longer regenerates `demo/docs.json` when installed, which produced a DEGRADED
  file from a tarball that does not carry every markdown source.

- **`--force` could stop a stranger's dev server.** Port reclaim decided ownership from the
  executable name (`bun`/`node`/`deno`), which is an ecosystem, not an identity — so
  `tjs-playground --port 3000 --force` would `SIGTERM`→`SIGKILL` a consumer's Vite or Next
  dev server and report it as reclaiming its own. Identity is now the full command line,
  and reclaim refuses to signal its own process.

- **The model-audit cache littered the consumer's project and never expired on logic
  changes.** It was written to `process.cwd()/.models.cache.json` — a dotfile dropped into
  whatever repo you ran from — and keyed only on base URL plus a 24h TTL, so when
  `looksLikeVisionModel` was corrected this release an upgrader kept `vision: false` for a
  multimodal model for up to a day. It now lives in the OS cache directory
  (`~/Library/Caches/tjs-lang`, `$XDG_CACHE_HOME/tjs-lang`, `%LOCALAPPDATA%`), announces its
  path, and carries a probe version. **Override it with the new `TJS_CACHE_DIR`** if you
  want it somewhere specific; with no home directory at all (scratch containers, some CI
  images) it falls back to the OS temp dir rather than to `.`, which would have been the
  original bug wearing a different hat.

- **`extractTDoc` re-scanned the whole file prefix for every function.** Doc comments are
  now located once per source and binary-searched: 128.9ms → 4.5ms over 58 functions on a
  176KB file, and ~12% off a full TS→TJS→JS transpile of it.

- **Arrow and function-expression parameters are validated.** The same annotation was
  enforced or ignored depending purely on spelling: `function decl(n: 0)` rejected `'x'`
  while `const arrow = (n: 0) => n` accepted it. Only top-level `function` declarations
  ever got boundary checks. Arrows are most of real TypeScript, which made this the
  largest silent hole in the language. `const f = function (n: 0) {}` did not even parse.

- **Rest parameters enforce their element type.** `...xs: number[]` accepted `f(1, 'x')`.
  (Not a rest-param bug: `...xs: [0]` was correct all along — the failure was `T[]`.)

- **`Enum` and `Union` annotations are enforced.** `function f(c: Color)` emitted **no
  check** and warned that `Color` "could not be resolved to a runtime type" — the type
  declared three lines above it. `Color.check()` worked the whole time; nothing asked it.

- **`Type N { example: +0 }` rejects negatives.** `+0` means non-negative integer, and
  `+0 === 0`, so passing the example through as a value destroyed the narrowing before any
  runtime saw it — the idiomatic way to declare a count accepted `-1` everywhere, while
  `n: +0` (which reads the source token) was correct. The emitter now writes the check
  into the emitted code.

- **The inline runtime and the real runtime agree.** Emitted standalone `.js` accepted
  values the real runtime rejects: an integer example accepting a float, directly and
  through objects and arrays. Since emitted code calls `Type` **bare**, the inline stub
  always wins — so those were the shipped semantics, not a fallback. All disagreements
  are closed and the corpus is empty. (The fourth case, excess keys, was first closed by
  making the stub REJECT them and then resolved the other way — both checkers now ACCEPT
  them; see "Upgrading" above. Agreement is the invariant; the excess-key POLICY is the
  open one.)

- **`fromTS` emits TypeScript parameter properties.**
  `class P { constructor(public x: number) {} }` converted to an empty constructor body,
  so every such field was `undefined` at run time. Silent, and large for TS ports: a
  parameter property is the idiomatic dependency-injected field.

- **The `new Date()` remedy is runnable.** It advised `Timestamp.now()` without mentioning
  that `Timestamp` must be imported, so following it produced a second error —
  `Timestamp is not defined` — from the message meant to resolve the first. It now shows
  the import and both call forms.

- **The editors described a language that is not TJS.** The syntax lists were AJS plus a
  handful of JS keywords: no `Type`, `Generic`, `Enum`, `Union`, `FunctionPredicate`,
  `predicate`, `extend`, `wasm`, or any type name — `int`, `unsigned`, `float`. Meanwhile
  `->` shipped as a valid operator, and the return-type pattern matched `) -> Type`, so
  **real** return types went unhighlighted while an abandoned form was highlighted.
  Completions had the same shape: nothing for the declaration forms, the deprecated
  `isError` as the only error check, and the non-canonical `test('x')` snippet.

### Performance

- **`extractParamMarkers` was quadratic twice over.** A per-character `regions.some(…)`
  literal guard made it O(n × literals), and removing that exposed a second one: `out += …`
  built a rope while `out.endsWith(' ')` flattened it once per marker. A 622KB file took
  152ms and its per-byte cost ROSE with file size — the failure mode nobody notices until
  their file is big. Now 0.65ms and flat. Pinned by a differential test against the old
  implementation plus a growth-ratio assertion.

- **Array diagnostics no longer walk the whole array.** `describeActual` and the emitted
  `__arrKinds` stopped after four distinct element types, which bounds the message but not
  the work: a homogeneous `number[]` never reaches four, so a ten-million-element array was
  scanned end to end to conclude "array of number" — on the ERROR path, where a failure
  inside a loop pays it every iteration. Capped at 64 elements, with `…` marking a sampled
  answer so the message never overclaims.

### Documentation

- **[TJS vs TypeScript vs JavaScript](docs/tjs-vs-typescript.md)** — a generated comparison
  where every row is **executed** against `tsc --strict` and TJS on each test run. 18 rows.
  It doubles as the language-design surface: a row can be marked `proposed`, which asserts
  it red until someone builds it. All four proposals raised this cycle are now shipped.

- **[Type identity](docs/type-identity.md)** — which mechanism answers "does value `v`
  satisfy type `T`", which is authoritative, and where they disagreed. The load-bearing
  fact: the inline stub is not a fallback, it always wins in emitted code.

- **Equality invariants are pinned** (`src/lang/equality-invariants.test.ts`): `a === b`
  implies `a == b`, verified exhaustively rather than argued; `+1`, `1` and `1.0` are one
  value; and `==` is **not** `TypeOf(a) === TypeOf(b) && a == b` — under that rule
  `null == undefined` would be false, and it is deliberately true.

Everything below came out of the full pre-release review of `0.13.0-beta.1`. Seven
findings were blockers; the review also caught that the beta's own changelog entry
had omitted four VM security fixes entirely (now written up in their own section,
below, since they shipped there).

### Changed

- **A required destructured member is now genuinely required.** `function f({a: 2, b: 3})`
  called as `f({a: 2})` returned **5** — `b` had silently defaulted to its own example, so
  `:` (required) was unenforceable in the one parameter shape people destructure most. The
  colon value is a **type and a worked example, not a default**; conflating the two made
  "required" mean nothing. It now returns a `MonadicError`. `=` members are unaffected:
  `f({a: 2, b = 3})` called as `f({a: 17})` still gives 20.

- **Destructured parameters generate signature tests.** `function f({a: 2, b: 3}): 5`
  silently produced **no** signature test, while the near-identical
  `function f(o = {a: 2, b: 3}): 5` produced one — so the language's headline promise, that
  the annotation _is_ the test, quietly did not hold for destructuring. The generated call
  supplies required (`:`) members and **omits defaulted (`=`) ones**, so the defaults are
  exercised rather than bypassed — which is what would have caught the corrupted `'hello,'`
  default below without anyone writing a test.

### Fixed

- **A comma inside a string literal split the parameter list mid-literal.**
  `{what = 'hello,', who: 'alice'}` was split inside the string and the pieces rejoined with
  `', '`, putting the comma back **with a space after it, inside the literal** — so
  `greeting({who: 'fred'})` returned `"hello,  fred!"`. Silent: the output parsed, ran, and
  returned a plausible wrong answer, and the corrupted value reached the emitted `__tjs`
  metadata, the `.d.ts` and the JSON Schema. Templates and regexes were hit too —
  `a = /,/` became `a = /, /`, a **different regex** — and a lone brace in a string
  (`a = '{'`) broke bracket depth and failed the transpile outright.

  Same literal-blindness family as the fifteen call sites consolidated earlier in this cycle;
  it survived that sweep because it splits on **commas** rather than scanning quotes, so it
  did not look like a literal scanner. Both parameter splitters now scan a `maskLiterals()`
  view and slice from the original.

- **`tjs test <file>` ignored its argument and always exited 0.** It was built around
  `.test.tjs` wrapper files, so any other path fell into a branch that discarded it and
  reinterpreted it as a filter pattern — printing "No .test.tjs files found" and exiting
  **0**. A real file with a failing inline test and a path that did not exist produced
  identical output and the same success code, which made it useless as a CI gate and
  actively misleading as the first command a reader types. It now runs the file's inline
  tests and signature tests, reports each with a line number, and exits non-zero on failure,
  on a missing path, or on a directory scan that matches nothing.

### Security

- **The OOM guard allocated like the thing it was guarding against.** Rejecting an array
  that exceeded a 1,024-byte `membraneMaxBytes` by four orders of magnitude cost 549ms and
  103MB at 2,000,000 elements, linear in N — the walk called `Object.keys` first and
  checked the budget after. It now scans incrementally and abandons on the first overflow:
  **0ms and 0MB** at every size tested. A caller who set a small budget to bound their
  exposure was wrong in the one case they set it for.

- **An array's `length` was never budgeted.** A capability could return an array with
  `length = 1e9` holding three values; it passed the membrane on ~40 bytes and
  `structuredClone` then spent **6.5 seconds** materialising a billion-slot array —
  synchronous host work invisible to fuel, atom timeouts and `membraneMaxBytes` alike,
  behind the guard whose stated job is to reject before the clone allocates.

- **Two `vm.run` exit paths leaked the timeout timer and the caller's abort listener.** The
  root-op throw and the input-schema rejection both happened after the timer was created
  and before the `try`, so neither cleared it — while the comment beside the `finally`
  claimed it "guarantees on every exit path". A pending timer also keeps the event loop
  alive, so a host that validates a batch of agents and then exits did not exit.

- **The capability membrane billed array elements for the string form of their own
  index, cutting effective array capacity ~3.4×.** `readOwnData` charged
  `k.length * 2 + 8` for every own key, and an array's key list is its indices — but
  `structuredClone` copies an element as a slot and never materialises `"199999"`, so the
  charge was for bytes that do not exist. It compounded with length: **500,000 floats are
  3.81MB of data and were charged 13.14MB**, so an ordinary RAG return (300 documents ×
  768 floats, ~1.84MB) came back as `Capability boundary rejected the return of
'storeVectorSearch'` under the documented 4MB default — and the only remedy on offer was
  to raise `membraneMaxBytes`, i.e. to weaken the OOM guard to buy back capacity that was
  never being used. A canonical array index now costs **nothing**: the element's value is
  already priced when the walk reaches it. Non-index own properties on an array
  (`arr.meta`) keep their name charge, since those really are serialised by name. The guard
  is unchanged in strength — 1M floats are 8MB and still refused.

- **The capability membrane ran host code and defeated the byte budget on two of its
  three walk branches.** The object branch was hardened, then array _indices_ the next
  morning; two paths were never revisited. Affects **0.12.0 and earlier**, and both
  branches of `0.13.0-beta.1`.

  - An array's **non-index own enumerable properties were never visited at all**, while
    `structuredClone` serialises them. A capability returning `[1,2,3]` with an
    enumerable getter `meta` ran that getter and delivered `'HOST-CODE-RAN'` into guest
    state; a throwing variant leaked host exception text into `result.error.message`,
    which `malicious-actor.test.ts` explicitly forbids for the object branch. It was a
    budget bypass too — `arr.big = 'x'.repeat(5MB)` crossed a 4 MB cap cleanly.
  - **Map/Set were read with `for…of`**, which dispatches to a guest-overridable
    `Symbol.iterator`, while `structuredClone` reads the internal slots. A
    `class extends Map` with a lying iterator presented itself as **empty** to the walk
    while 20,000 entries crossed a 1024-byte `membraneMaxBytes` intact (verified in both
    JSC and V8). Three guarantees failed at once: the documented OOM guard was simply not
    enforced for Map/Set, `MEMBRANE_MAX_DEPTH` was evadable by nesting, and host code ran.

  One `readOwnData()` helper now serves the array and object branches, so they cannot
  diverge again; collections are read through `Map.prototype.entries.call(v)` /
  `Set.prototype.values.call(v)`, and a Map/Set whose prototype is not exactly the
  intrinsic is refused.

- **`xmlParse` was tagged `effects: 'pure'` while calling `ctx.capabilities.xml.parse`.**
  That tag is what routes a return through the membrane _and_ what the predicate verifier
  reads to certify a cluster safe to compile to native JS — so a `DOMParser` result reached
  guest state as a **live host `Document`**, prototype chain and all, with `methodCall`
  standing right there. Every atom in `atoms/browser.ts` was untagged as well.
  `atom-effects.test.ts` could not have caught it: it iterates the same constant that
  _assigns_ the tag, so it proves the list agrees with itself. New
  `atom-effects-scan.test.ts` reads each atom's **body** and asks whether it touches a
  capability, randomness, the clock, the network or the console.

- **The live-heap ceiling was bypassed completely by two of the four binding atoms.**
  `varSet`/`constSet` had both the prototype-pollution guard and heap accounting;
  `varsLet` and `varsImport` — the two atoms whose entire job is binding variables — had
  only the first, as did the loop binds and the catch binding. Verified: the identical
  doubling program routed through `varsLet` held a **1 GB string under the 64 MB default
  cap**. Every guest-scope write now goes through one `setStateVar()` helper, and
  `state-writes.test.ts` fails on any bare `ctx.state[…] =` outside it.

- **The heap-ceiling walker reintroduced the size-proportional fuel bypass** — the `==`
  bug class, in the function next door to the commit that closed it. `estimateBytes` was
  called with the absolute ceiling rather than remaining headroom, per-key accounting
  _replaced_ rather than accumulated (so re-binding an unchanged object re-walked it in
  full, forever), and the walk charged no fuel while being synchronous, so no timeout
  could preempt it. Measured: **500 rebinds of a 300k-element array cost 28,838 ms of
  pegged CPU for 50.2 fuel** — 574 ms per fuel unit, against 1 ms for a benign program
  charged identically. Now **53 ms**. Also fixes an accounting split where
  `createChildScope` copied the running total by value while sharing the per-key ledger by
  reference, letting the total drift negative and silently buy back budget.

- **`hash` and `omit` were flat-charged regardless of operand size.** `hash` digests every
  byte and returns 64 chars, so result accounting sees nothing — 1 KB and 1 MB both cost
  1.20 fuel. `omit` must walk the whole source object to know what to keep, so 100,000 keys
  in and one key out cost the same as 1,000. `cost-invariant.test.ts` now **enumerates the
  atom registry**: every atom needs either a case demonstrating marginal fuel growth or a
  `SIZE_INSENSITIVE` entry saying why not.

- **`vm.run` leaked an abort listener onto the caller's signal** — no `once`, no removal.
  Measured **41.6 MB retained after 20,000 runs** against one shared signal, versus 1.59 MB
  with no signal at all; a host running many short agents under a single cancellation scope
  is the normal case. Now 1.46 MB.

### Fixed

- **`compareVersions` ordered prereleases lexically**, so `'beta.2' > 'beta.10'` — the
  tenth beta looked _older_ than the second. Combined with `installRuntime`'s wholesale
  replacement, an older beta "upgrades" over a newer one and **discards the flight
  recorder and any applied `configure()`**. Now follows semver §11, pinned against the
  specification's own worked ordering example. (The equality case was fixed in the beta;
  this is the ordering case left behind.) Affects **every consumer of `0.13.0-beta.1`**.

- **`unsafe` stole the identifier `unsafe` from JavaScript** — a `PRINCIPLES.md` TJS ⊇ JS
  violation shipped by the escape hatch that exists to uphold compatibility, and present
  under `dialect: 'js'` too. `{unsafe: Date}` + `o.unsafe instanceof Function`,
  `let unsafe = Date; if (unsafe instanceof Function)`, and `unsafe in {a:1}` were all
  `SyntaxError`. A related span defect let one marker un-ban an entire nested closure:
  `unsafe makeHandler({ onClick: () => { eval(src); var leaked = 1 } })` transpiled with
  zero warnings, quietly reinventing the whole-file mode that `unsafe` replaced.

- **The literal-blindness class, consolidated onto one scanner — not ended.** A
  source-processing pass hand-rolls its own literal tracking and silently mis-reads code
  that _mentions_ the syntax it scans for. Since tjs-lang is code about code, its own
  source, tests and documentation hit this constantly. Every scanning call site now
  consumes one `scanLiterals()` in `src/strip-comments.ts`.

  This heading previously read "ended", and that was wrong — **at least fourteen instances
  landed in this cycle**, the last six found by review after the consolidation: a raw
  `.replace` rewriting the contents of user strings; all five declaration scanners
  detecting on unmasked source (the single-quoted form injected unescaped quotes and
  _rejected legal JavaScript_); `/* unsafe */` read out of a parameter default, turning
  validation off for the whole function; and two `.d.ts` scanners emitting a phantom
  exported type. A further nine surfaced at once when the dogfood conversion ratchet was
  finally given a CI lane — six of them labelled "undiagnosed" for weeks, all nine the same
  defect. See [#25](https://github.com/tonioloewald/tjs-lang/issues/25), whose
  pre-registered counter this answers, and `ASSUMPTIONS.md` E1.

  - `isInsideComment` had no notion of strings, so `const OPEN = '/*'` — or the ordinary
    glob `'**/*.ts'` — convinced it the rest of the file was one giant comment and **every
    `test { }` block after it vanished**: no error, no warning, no recorder entry. For a
    language whose thesis is that tests live in the source, silently reporting zero tests
    is the worst available failure mode.
  - The naive escape lookback `source[i-1] !== '\\'` in **fifteen** scanners across five
    files. It is wrong for exactly the input that matters: in `'\\'` the character before
    the closing quote _is_ a backslash, but an escaped one. `sep == '\\'` failed with
    "Unexpected token" forty characters away.
  - `computeBraceDepths` tracked strings but not regexes, so one `const R = /}/` — or the
    very common `/\$\{([^}]+)\}/g` — drove the depth negative and `generateDocs` returned
    an **empty document**. `tjs emit` writes a sidecar `.md` per file, so users' docs came
    out blank.
  - `extractEmbeddedTestComments` produced both a false negative and a false positive from
    one blind spot: `const q = /['"]/` **dropped** a real embedded test, and `const q = /'/`
    above a JSDoc **promoted a documentation example into a real emitted test**.
  - `maskWasmBodies` matched `wasm {` inside a string and brace-counted past it, swallowing
    the real code that followed. No error — the output still parsed.
  - Fixing `findFunctionBodyEnd` exposed three latent bugs it had been accidentally
    compensating for: the class, polymorphic-constructor and `extend` scanners were all
    matching declarations written inside `/*# … */` doc comments — the language's own
    documentation of those features.

  New `src/lang/literal-blindness.test.ts` pins the class in `test:fast` (41 cases): each
  trigger placed in a string, template, regex, comment and `wasm{}` body in turn.

- **The `Eval`/`SafeFunction` auto-import emitted JavaScript that does not parse.** Usage
  was detected with `\bEval\s*\(` over masked source, which never checked whether the name
  was already bound and matches after a `.`. `import { Eval } from 'tjs-lang/eval'` — the
  **documented** form in README, CLAUDE.md and TJS-FOR-TS.md — produced two imports and a
  `SyntaxError`, so the documented TS → TJS → JS chain had no correct authoring path. It
  also fired under `dialect: 'js'`, making legal JavaScript containing `function Eval(){}`
  un-transpilable. Now decided from the AST: inject only for a call whose callee is a bare
  identifier with no binding anywhere in the module.

- **`bigint` was inverted in both directions.** `TS_TYPE_NAMES` mapped it to
  `{ kind: 'number' }`, so `f(10n)` returned "Expected number … got bigint" and `f(10)` —
  a plain number — **passed**. In 0.12.0 the annotation degraded to `any` and simply
  worked, so this was working → 100% broken, on a type the beta's changelog advertised as
  checking at runtime. Two adjacent defects made it unusable end to end even once the
  check was right: `fromTS` emitted `x: 0n` that the return-position scanner rejected, and
  a single `0n` anywhere in a file took down the whole transpile with "JSON.stringify
  cannot serialize BigInt", naming no file and no line.

- **`n?: number` emitted JavaScript that throws on the happy path.** The colon shorthand
  rewrites an optional parameter to `n = <annotation>`, right for an example (`n?: 0` →
  `n = 0`) and a **dangling identifier** for a type name — so `g()` threw
  `number is not defined`. Long-standing, but this release made it far more likely: bare
  TS names now produce real checks, so the annotation _looks_ like it works, and
  `int`/`unsigned`/`float` are newly encouraged.

- **Predicate canonicalization alpha-renamed object-literal keys.** Field names are
  literals, not variables, and the two node types spell them differently, so the guard's
  `Property` arm was dead: `{ n: 10 }` canonicalized to `{ $0: 10 }` — the canonical AST
  read a field the source never named. That AST is forwarded verbatim by `storeQueryWhere`
  to `store.queryPredicate`, making it the silent filter failure its own comment calls "an
  authorization bug".

- **`tjs check` hid the release's flagship diagnostic.** The command CI and coding agents
  run printed `✓ file` for a file whose type had silently degraded, while `tjs run` on
  identical source printed the full remedy; `tjs emit` was silent too. That directly
  undercuts this release's own measured finding — a shown remedy is repaired ~80% of the
  time, a bare diagnostic 0%. Warnings now go to **stderr** from check/emit/convert (so
  `tjs emit f.tjs > out.js` still produces clean output), plus `--max-warnings N`.

- **`tjs convert` reported success while dropping files** (#24). `convertFile` caught its
  own error and returned normally whenever `outputPath` was set, so the caller's `catch`
  was unreachable: one good file and one bad file reported "2 converted, 0 failed" and
  exited 0, with the bad file silently missing. The failure surfaced two steps later as a
  bundler resolution error.

- **Unconditional rejections reported no location and stopped at the first occurrence.**
  Fixing a file with three violations took three `tjs check` runs, each printing an
  identical positionless message — in validator order, not source order. `var`, `new Date`
  and `eval` now throw a located error at the first occurrence and list the rest beneath it.

- **`LegacyDefault(...)` erased the parameter's type to `any`** — weaker than the plain-JS
  equivalent it exists to reproduce. The caller asked for atomic default semantics; they
  did not ask for the type to disappear.

- **The shipped editor artifacts taught a language that isn't TJS.**

  - The generated TextMate grammars **could never match anything**: `\\\\b` in a template
    literal produces the string `\\b`, a literal backslash — so every keyword, forbidden
    and builtin rule in both grammars was incapable of matching any input, for as long as
    they have existed. The extension's advertised red-squiggle highlighting was dead.
  - **`.tjs` had no VS Code support at all** — the grammar was regenerated on every build
    and referenced by nothing, in the release whose central idea is that the file extension
    _is_ the language gate.
  - The TJS keyword model encoded **AJS's** restrictions. Measured against the real
    compiler, **41 of 42 painted-red tokens are legal TJS**: `switch`/`case`/`default` are
    ordinary control flow, `type`/`module`/`is`/`as`/`keyof`/`never` ordinary identifiers.
  - The CodeMirror completion inserted `unsafe { … }`, a form the language rejects, and
    offered no completion for `unsafe <expr>` or any `Legacy*` bridge — so this release's
    entire escape vocabulary was undiscoverable in the editor.

- **Two AJS playground examples shipped truncated**, and the flagship `wasm-functions`
  example never compiled. `extractCodeBlock` was not fence-length aware, so examples
  opening with four backticks (precisely because their code contains three) were cut
  mid-expression; `extractWasmBlocks` compiled a `wasm { }` written in a **doc comment**,
  so the example whose prose necessarily says "inline `wasm { … }` blocks" printed "did not
  compile — running the fallback{} (JS)" on every run.

### Changed

- **`Timestamp` the runtime type is now a number, matching `Timestamp` the module.**
  `0.13.0-beta.1` flipped the representation to epoch milliseconds and announced it, but
  the runtime type in `Type.ts` — the one re-exported into `__tjs`, and therefore the one a
  `.tjs` file annotating `t: Timestamp` is checked against — still validated an ISO
  **string**. So `Timestamp.check(Timestamp.now())` was `false`: the type rejected the only
  value its own constructor produces, while the compiler's `new Date()` diagnostic pointed
  users at that constructor **by name**.

  | Before (`0.13.0-beta.1`)            | Now                                    |
  | ----------------------------------- | -------------------------------------- |
  | `Timestamp` — ISO 8601 string       | `Timestamp` — epoch milliseconds       |
  | (no equivalent)                     | `TimestampISO` — the ISO 8601 string   |
  | `isValidTimestamp(v: string)` — ISO | `isValidTimestamp(v)` — epoch ms       |
  | (no equivalent)                     | `isValidISOTimestamp(v: string)` — ISO |

  If you were annotating an ISO string as `Timestamp`, use `TimestampISO`. Both spellings
  now share one predicate with `src/types/Timestamp.ts`, so they cannot drift apart again.

- **The npm package now ships its own documentation.** `llms.txt` is the agent-facing
  navigation index and it ships — but **29 of its 43 links were 404 in the tarball**,
  including `CLAUDE-TJS-SYNTAX.md`, the file it names as the thing to read first. The
  guarding test resolved links against the repo root, certifying an artifact nobody
  installs. The user-facing docs (`DOCS-*`, `TJS-FOR-*`, `PRINCIPLES`, `ASSUMPTIONS`,
  `CHANGELOG`, `guides/`, `examples/`, `tjs-src/`) are now in `files`; repo-process docs
  (TODO/PLAN/AGENTS/UPSTREAM) are linked absolutely on GitHub instead; and
  `docs-index.test.ts` now resolves against `npm pack`'s own file list.

## [0.13.0-beta.1] — 2026-08-03

**Beta.** The language changed shape: all nine mode directives are gone and the file
extension is the only gate. Escapes are per-construct, so an accidental use is still
caught. Published as a beta because that shape change deserves real use before it is
called stable.

### Removed — BREAKING

- **All nine mode directives are abolished.** `TjsEquals`, `TjsClass`, `TjsDate`,
  `TjsNoeval`, `TjsNoVar`, `TjsStandard`, `TjsDictDefaults`, `TjsSafeEval` and
  `TjsSafeAssign` no longer exist. **The file extension is the gate** — a `.tjs` file gets
  every rule, unconditionally — the way ESM made `"use strict"` implicit. Writing an
  abolished directive is now an error that names the replacement rather than a bare
  identifier that fails at runtime.

  `TjsCompat` and `TjsStrict` survive, because they answer a different question — _which
  language is this?_ That is **dialect**, not a rule. Plain JS, TS-originated code and
  AJS/VM code still get JS semantics by default, so TJS remains a superset of JavaScript.

  **Migration is per-construct, not per-file.** The old ladder ("turn the rules off, then
  re-enable one at a time") is replaced by marking the individual sites that need the old
  behaviour — which is strictly better, because a modes-off file also silenced the _next_,
  accidental use.

### Security

> The four items immediately below shipped in `0.13.0-beta.1` and were **omitted from this
> entry at the time** — found by the pre-release review of the beta. They are recorded here,
> under the version that actually contains them, rather than backdated into `[Unreleased]`.

- **The capability membrane executed host code while inspecting it.** The pre-walk read
  every own key with `v[k]`, which **invokes a getter** — so the machinery whose entire job
  is keeping host code out of guest state was itself running host code, before
  `structuredClone` was reached and regardless of whether the value was ultimately accepted.
  The rejection path ran them too, so even a refused value had already executed. A getter
  can throw, mutate, or stall, making this a side-effect vector on the boundary rather than
  only a data leak. The walk now reads `Object.getOwnPropertyDescriptor` and **rejects
  accessor properties outright** — not evaluated-then-checked, because there is no way to
  learn what a getter returns without running it. **Breaking for capability authors:** see
  the migration note under _Changed_. Affects **0.12.0 and earlier**.

- **The run's `AbortController` was aborted only when the timeout fired.** Any other
  ending — fuel exhaustion, an atom error, or plain success — cleared the timer and left
  in-flight requests alive with nothing left to cancel them. A time box you can only rely on
  when it expires is not a time box. It now aborts in `finally`, on every exit path.
  Teardown **signals**; it does not await cleanup, because waiting is exactly how
  cancellation becomes a path that starts unmetered work. Affects **0.12.0 and earlier**.

- **Per-atom call quotas** (`quotas: { llmPredict: 3, httpFetch: 10 }`). Fuel meters work
  done _inside_ the VM and is blind to what an atom summons outside it: an `llmPredict`
  costing 50 fuel may cost real money, a `httpFetch` costing 10 may hammer someone else's
  service. Enforced in the atom exec wrapper **before** both fuel and execution — an
  exhausted quota must not have already made the call it exists to prevent, and must not
  also drain the budget. An unset op is unlimited, so this is purely additive.

  **Scope, honestly: a quota counts calls within ONE run.** A capability that starts a _new_
  `vm.run` gets a fresh counter, so an agent able to trigger re-entrancy can multiply its
  allowance. Pass the same `quotaUsed` object to each nested run to enforce a shared cap.
  Across a process or network boundary no such enforcement is possible — budget does not
  travel, only tokens and data do. Documented in DOCS-AJS.md and pinned by
  `src/vm/quotas.test.ts`.

- **`installRuntime` replaced the runtime with itself and discarded the flight recorder.**
  Identical prerelease versions did not compare equal, so a second import of the same
  version counted as an upgrade and wholesale-replaced the installed runtime — taking the
  error history and any applied `configure()` with it. (The _ordering_ half of this bug
  survived into the beta; see `[Unreleased]`.)

- **Fuel bypass: size-proportional atoms charged a flat cost** — the `==` bug class, found
  again by a cost-model audit. `defineAtom`'s `cost:` is charged once per call regardless of
  operand width, so any atom whose work scales with input size was effectively unmetered.
  Measured before the fix: **`jsonStringify` serialized a 2,000,000-element array for 1.2 fuel
  and completed under a 10-fuel budget.** `join`, `split`, `jsonParse` and `template` were the
  same. (The expression path already charged proportionally in `methodCall` — the atom path
  had diverged, which is how it survived.) Those atoms now charge via a shared
  `chargeForSize()` on both operand and allocated result, using the same per-char/per-element
  constants as the expression path; fuel now scales linearly with N. Affects 0.12.0 and
  earlier — anyone relying on fuel as a DoS bound against untrusted input should upgrade.
- **Live-heap ceiling (`maxHeapBytes`, default 64 MB)** — the _space_ budget to fuel's _time_
  budget. Fuel meters cumulative work, which bounds how much a program allocates over its
  lifetime but says nothing about how much it holds at once: `x = x + x` charges honestly, yet
  at ~10 KB-per-fuel a legitimate 100,000-fuel budget still buys roughly a gigabyte of live
  string. A run that exhausts host memory has taken the process down regardless of how honestly
  it paid. Guest scope writes (`varSet`/`constSet` and atom-result bindings) are now accounted
  against the ceiling with a bounded, cycle-safe estimator; accounting is **per key**, so
  overwriting a variable frees its budget and ordinary loops don't false-positive. Verified: 26
  doublings of 1 KB (~64 GB unchecked) stops at the ceiling with unlimited fuel.
- **New `src/vm/cost-invariant.test.ts`** pins the invariant mechanically: each size-sensitive
  atom is driven at growing N and must show _marginal_ fuel scaling (a flat-charged atom scores
  exactly 0 marginal fuel — the bug's signature). Cheap stand-in for a mechanized proof of the
  cost model; it catches the next flat-charged O(n) atom rather than relying on someone
  noticing. **Adding a size-sensitive atom means adding a case there.**

### Security / Chore

- **`bun audit` gate with time-gated exemptions.** A new pre-tag lane
  (`src/dependency-audit.test.ts`) fails the suite on any **high or critical** advisory that
  isn't covered by a live entry in `audit-exemptions.ts`. Exemptions are deliberate and dated:
  each carries a `reason` and an `until` date, and **lapses on that date** (the advisory then
  fails the gate again, forcing a re-fix or a renewed justification) — not a permanent silence.
  A dead exemption (advisory no longer reported) warns to be removed. The gate runs in the full
  `bun test` (pre-tag) run, is skipped by `test:fast` (`SKIP_AUDIT=1` — it needs the network),
  and self-skips offline so a network blip can't red the suite. The current exemptions are all
  dev/deploy-only transitive advisories (eslint→brace-expansion/flatted, firebase→undici/form-data)
  with no upstream fix yet.
- **Dropped `vitest` and `valibot` from devDependencies** — removing a whole vulnerable
  dependency chain (incl. a critical `vitest` UI-server advisory) that was dev-only and
  unused: the repo's framework is `bun:test`. Six files that imported `{ describe, it, expect }`
  from `vitest` (and thereby **errored out under `bun test`** — a silent coverage hole across
  the timeout/cost-override/request-context/store tests) were migrated to `bun:test` and now
  run. `valibot` was used only by a compile-only type-inference file, switched to the shipped
  `tosijs-schema`. `@happy-dom/global-registrator` bumped to a fixed happy-dom (≥20.8.9).
  (The published package's runtime deps — `acorn`/`acorn-loose`/`acorn-walk`/`tosijs-schema` —
  carry no advisories; consumers were never exposed.)

### Added

- **`unsafe <expression>` — the per-construct escape.** Marks one construct as deliberate
  at the site: `unsafe new Date(x)`, `unsafe var x = 1`, `unsafe eval(s)`. Zero runtime
  cost. Recognised only in expression position and only on the same line as its expression,
  so a variable named `unsafe` remains legal JavaScript.
- **`/* @tjs-unsafe */`** — the same marker for TypeScript source, which cannot contain
  TJS-only syntax because `tsc` rejects it.
- **Legacy equality bridges** — `DangerousLegacyEquals`, `DangerousLegacyNot`,
  `LegacyExactly`, `LegacyNotExactly`. A fixed _operator_ has no construct to mark, so the
  escape is a name. The coercing pair is named "Dangerous" because `==` invokes
  `valueOf()`/`toString()` on any object and can therefore throw or run arbitrary code; the
  strict pair is not, because `===` cannot.
- **`LegacyDefault(value)`** — per-parameter escape from dictionary defaults, restoring
  JavaScript's atomic semantics for one parameter rather than disabling a whole function's
  validation.
- **ASI guidance.** Statement boundaries are the one place TJS and JavaScript disagree
  (`const x = g` / `(a)` calls `g(a)` in JS, two statements in TJS). That case now warns at
  the site with a line number instead of changing meaning silently.

- **`int` and `unsigned` — the numeric types TypeScript never had.** TS has a single
  numeric type, so "this is a count / index / id" is inexpressible and ends up policed by
  comments or hand-written asserts. `n: int` rejects a float, `n: unsigned` (alias `uint`)
  rejects a negative, and `float` is an explicit spelling of `number`. These **extend**
  TypeScript rather than narrowing it — `number` still means number, so pasted TS is
  unaffected.

  - **The example forms are shorthand for exactly these, and carry a worked value too:**
    `n: int` ≡ `n: 5`, `n: unsigned` ≡ `n: +5`, `n: number` ≡ `n: 5.0`. That equivalence
    is pinned by a test: two spellings of one type that disagree would mean one of them is
    lying to the reader.

- **Canonical form for verified predicates** (`canonicalizePredicate` / `predicateKey`,
  exported from `tjs-lang/lang`). A verified predicate is pure, total, serializable and
  composable; giving it a **canonical form** makes it an _identity_, which is what lets one
  object serve as **cache key**, **pushdown payload** (send the predicate to `store.query`
  instead of dragging rows to the code), **auth object** (a permission _is_ a predicate), and
  the substrate for safe macro splicing. Predicates differing only in formatting, comments or
  local variable names now share a key; differences in operator, literal _value_, field name,
  or any helper in the cluster do not.

  - **Verification is a precondition, not an option** — identity implies "same input ⇒ same
    result", which an impure predicate doesn't satisfy however identical its syntax, so
    canonicalizing an unverified cluster throws `PredicateNotVerifiedError`.
  - **Deliberately not an optimizer:** commutative operands are _not_ reordered. That would be
    a claim about totality and cost, not just purity — and a canonicalizer you can't trust
    isn't usable as an auth object.
  - The convenience `key` is FNV-1a and **documented as non-cryptographic**: fine for cache
    bucketing (a collision costs a miss), insufficient where an adversary picks the input
    (cache poisoning, auth) — hash the `canonical` string with SHA-256 for those.

- **Predicate pushdown (`storeQueryWhere` + `store.queryPredicate`)** — send the _predicate_
  to the data instead of dragging rows to the code. The atom takes a **canonical verified
  predicate** and forwards it as data; the store evaluates it and can cache on its stable
  `key`, so two spellings of the same rule hit the same cache entry. **The VM never parses
  it** — that's what keeps the acorn-dependent canonicalizer out of the lean `tjs-lang/vm`
  bundle and lets the same payload travel to a remote store. `queryPredicate` is **optional**
  (progressive enhancement, like `$predicate` in JSON Schema); a store without it makes
  `storeQueryWhere` **fail loudly** rather than degrade to an unfiltered read — silently
  returning rows the caller meant to exclude is a data-exposure bug, not a fallback.
  - Known, deliberate limitation: canonicalization is **structural**, so refactoring a
    predicate (hoisting a subexpression into a local) mints a new identity. Collapsing those
    would mean inlining, i.e. optimizing — and a canonicalizer that rewrites more than
    spelling isn't one you can trust as an auth object.

### Changed

- **BREAKING for capability authors: the boundary takes plain data only — no accessor
  properties.** A getter is host code, so a membrane that ran one while inspecting a
  payload would be executing the thing it exists to keep out. This bites the obvious shape,
  which is exactly what a host wrapping a `Response` tends to write:

  ```js
  // Rejected: `status` is a getter — code wearing a data costume.
  return { ok: res.ok, get status() { return res.status }, body }

  // Fix: read it once, hand over the value.
  return { ok: res.ok, status: res.status, body }
  ```

  Spreading is not the fix and fails **silently**: a `Response` keeps `ok`/`status`/
  `headers` on its _prototype_, so `{ ...res }` is `{}` — it crosses cleanly and delivers
  nothing. Build the object literally, naming each field. Rejection is a `MonadicError`
  (`Capability boundary rejected the return of '<op>': … accessor property '<name>'`), not
  a throw.

- **`Timestamp` is a number (epoch milliseconds), not an ISO string.** `diff` is `a - b`,
  `isBefore` is `a < b`, sorting is the default comparator — and `Timestamp.now()` is a
  genuine drop-in for `Date.now()`, which it was not before. `iso()` renders the readable
  form; `isValidISO` validates it.

- **Diagnostics for constructs AJS deliberately lacks now SHOW the fix.** `Unsupported
statement type: ForStatement` was accurate and useless: an A/B over diagnostic text
  (`experiments/agent-legibility/error-message-ab.ts`) measured the repair rate each message
  actually produces — worked example **80%**, prose remedy 50%, our shipped message **0%**,
  saying nothing at all **0%**. On the `for`-loop case, prose advice scored 0/5 while the
  same remedy shown as code scored 5/5. `for`, `for...in`, `switch` and `do...while` errors
  now carry a worked correction. Pure message text; no compiler change.
  - Guarded by `src/lang/diagnostic-remedy.test.ts` — deterministic, no model needed: every
    remedy must contain real code, name a supported alternative, reach the thrown message,
    and **correspond to a construct the transpiler actually rejects**. That last check caught
    a first draft claiming `for...of` was unsupported (it isn't) — a diagnostic for a
    restriction that doesn't exist teaches a false limit and is worse than none.

### Fixed

- **`Eq` can no longer be made to run user code.** It unwrapped boxed primitives with
  `a.valueOf()`, which a subclass can override — so a comparison could throw, mutate, or
  lie about the value. It now reads the internal slot via the prototype method.
- **Optional chaining broke the `==`/`!=` rewrite.** `o?.b != null` did not compile: the
  operand scanner treated `?.` as a ternary boundary. Every form was affected.
- **Regex literals were read as comments.** A regex containing `*/` or `//` desynced the
  scanner, and an escaped backslash (`'\\'`) desynced the string scanner — between them
  these broke conversion of several of our own files.

- **Sound TypeScript type names now produce real runtime checks** — restoring a stated
  design goal that had quietly gone missing: _implement the parts of TypeScript that aren't
  Turing-complete damage, and best-effort only the rest._ In native TJS,
  `function f(s: string)` inferred **`any`**, so it transpiled cleanly, looked typed, and
  validated **nothing** — the worst possible outcome in a language whose pitch is that types
  survive to runtime, and it hit the annotation newcomers and models reach for first
  (ASSUMPTIONS.md A7). `string`, `number`, `boolean`, `bigint`, `object`, `null`,
  `undefined` and unions of them now check at runtime, agreeing exactly with the equivalent
  example type (`s: string` ≡ `s: ''`). `any`/`unknown`/`void`/`never` remain unconstrained
  because that is what they mean; an unresolvable user type still degrades to best-effort
  rather than erroring, which preserves TJS ⊇ JS.

  - **Deliberately still best-effort:** conditional types, mapped types, recursive
    templates, `infer` — the undecidable type-level metaprogramming TJS answers with a
    _predicate function_ you can read, test and run.
  - Known gap: `string[]` doesn't parse (use `['']`). It fails **loudly**, which is the
    acceptable interim state — a parse error tells you to fix something; the old silent
    `any` removed your type checking and said nothing.

- **Best-effort type degradation now teaches instead of happening silently.** When an
  annotation can't be resolved to a runtime type it still degrades to `any` (by design —
  TJS ⊇ JS), but the transpiler now emits a warning naming what was dropped and showing the
  ladder back to safety: an example (`foo: 3`), a sound type (`foo: number`), or a
  `Type … { predicate(v) { … } }`. The suggestion is **shown as code**, per the measured
  finding that a remedy shown repairs 80% where the same advice as prose repairs 50% and a
  bare diagnostic 0%. No warning when `any`/`unknown` was asked for explicitly — honouring
  `any` isn't a degradation, and warning there would train people to ignore the channel.

- **Bare-assignment auto-`const` no longer captures an all-caps alias** (#22). In native tjs,
  `B = BABYLON` was rewritten to `const B = …`; when `B` was declared in an enclosing/host
  scope the source-level transform can't see (e.g. a `/*# */` example inside a module that
  already `let B`s), the injected `const` shadowed the outer binding — it bit tosijs-3d demos.
  A bare-identifier RHS is now treated as an alias/reassignment and left alone; the feature
  still fires for definition RHSs (`Foo = Type(…)`, `Foo = { … }`, `Bar = mk()`).
- **`configure()` after a converted module loaded now warns instead of silently doing nothing**
  (#23). A converted module snapshots its config when it captures the runtime
  (`globalThis.__tjs.createRuntime()`) at import, so `configure()` called after the module graph
  evaluated reached nothing — which made tosijs's debug/safe bundles inert. It now emits a loud
  one-time `console.warn` (+ a recorder `warning`) pointing at the import-order requirement,
  reliably distinguishing the install (bare module-level `createRuntime()`) from a module's
  capture (the instance's `createRuntime()`), so configuring before any module loads never warns.
  (Making config a live post-eval read is a deeper change to the intentional per-instance
  isolation — deferred to 0.13.0; a silent no-op was the worst outcome and is now gone.)
- **`==` inside an inline `wasm { }` block is no longer rewritten to `Eq(...)`** (L807). In
  native tjs the `==`→`Eq()` (and `Is`/`IsNot`→call) transforms ran before inline wasm-block
  extraction, so a `wasm { if (a == b) … }` body became `Eq(a, b)` — which the wasm compiler
  can't compile, silently falling back to JS. Wasm bodies are now masked across just those two
  operator transforms and restored before extraction, so the wasm compiles; a following
  `fallback { }` (real JS) still gets the normal rewrite. `wasm function` declarations were
  already unaffected (extracted earlier).

## [0.12.0] — 2026-07-20

Minor bump with **breaking changes** — see **Changed**. Lands the `TjsDictDefaults` mode and
five VM-security fixes from a two-round adversarial review. Closes **zero** open GitHub issues
(this release is security + dict-defaults, both internally driven); the per-mode opt-out those
security/dict-defaults changes make more acute is tracked as #7, still open.

### Security

> **Affected versions:** the SSRF, ReDoS, capability-membrane, `methodCall`, and scope-name
> fixes below address vulnerabilities present in **0.11.0 and all earlier releases**. Pinned
> consumers (VM embedders) should upgrade.

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
  - **Lint catches excess keys at literal call sites** (`dict-default-excess-key`). The
    runtime strips an undeclared key with a once-per-site notice, but at a literal call site
    (`place({x, y, treshold})`) it's almost always a typo — the linter now flags it
    statically, recursing into nested object literals (`move({pos: {x, z}})` →
    `move.pos`). Mode-gated on `TjsDictDefaults`; skips arguments carrying a spread (the
    spread may supply the key) and non-literal arguments; covers named functions and
    arrow/function expressions bound to a const.

### Changed

- **Behavior change (native `.tjs` only): existing `= {object literal}` params now
  merge-on-partial, validate members, and strip excess keys.** This is the visible face of
  the `TjsDictDefaults` mode above, called out separately because it changes code that was
  already legal. Before, `function f(o = {x: 0, tag: ''})` treated the object as an atomic
  JS default with no validation; now:

  - `f({x: 5})` → `{x: 5, tag: ''}` (was `{x: 5}` — `tag` is filled from the default),
  - `f({x: 's'})` → `MonadicError` (was `{x: 's'}` — members are type-checked),
  - `f({x: 1, extra: 9})` → `{x: 1, tag: ''}` + a once-per-site recorder notice (was
    `{x: 1, tag: '', extra: 9}` — excess keys are stripped).

  It transpiles either way, so a break is only visible at runtime. **Migration:** to keep
  the old atomic-default semantics, set `dialect: 'js'`, add the `TjsCompat` directive, mark
  the function `unsafe` (skips all its validation, the merge included), or use a non-object
  default. There is no per-mode "off" directive to disable only `TjsDictDefaults` yet (see
  #7). The new excess-key lint (`dict-default-excess-key`) flags stray literal-call-site keys
  statically.

- **Behavior change (VM embedders): capability returns must be structured-cloneable data,
  and guest `methodCall` is allowlisted.** Repeated here from **Security** because it breaks
  custom-capability consumers: a capability that returned a live `Response` (or any object
  carrying methods / host references) now hard-fails at the boundary with `Capability
boundary rejected the return of '<op>'`. **Migration:** normalize returns to plain data
  (`Response` → `{ ok, status, body }`); the default `httpFetch` already does. Tune the size
  cap with the `membraneMaxBytes` run option (default 4 MB).
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

### Fixed

- Bare-assignment auto-`const` must not touch plain JS or redeclare bindings.
- A doc comment must start a line (mid-line `/*#` and `/**` are ignored).

## [0.8.6] — 2026-06-30

### Fixed

- TS→TJS (`fromTS`) never leaks raw TS into `Type`/`Generic` blocks.

## [0.8.5] — 2026-06-30

### Added

- Self-contained browser bundles for in-browser transpilation (`tjs-lang/browser`).

### Fixed

- AJS `==` is footgun-free (not structural), consistent with TJS. (Recorded that the
  old structural `==` was also a fuel-bypass DoS; a future `Is` atom must be fuel-metered.)

## [0.8.4] — 2026-06-26

### Added

- First-class **predicate-safety verifier** (`src/lang/predicate.ts`) + fuel-bounded,
  global-shadowed native predicate compiler.
- Atom `effects: 'pure' | 'io'` tag — the predicate-safety keystone.
- The `$predicate` JSON-Schema keyword + reference evaluator.
- `suggest()` — autocomplete completions mined from predicate clusters.
- Introspection-driven, destructuring-aware playground autocomplete (scope-aware
  symbol model + runtime-truth member completion via an introspection bridge).

### Changed

- `==` is footgun-free (not structural) — stale docs corrected and pinned with tests.

_(No `0.8.3` was tagged — the version was skipped.)_

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

> Entries below 0.8.0 are **backfilled coarsely from the git tags and log** (they
> predated this changelog). Only `v0.2.0`, `v0.7.6`, `v0.7.7`, `v0.7.8` were tagged
> before 0.8.0, so the long `0.2.0 → 0.7.6` span is summarized as one entry rather
> than split across untagged versions.

## [0.7.8] — 2026-04-30

### Added / Fixed

- AJS agent-loop fixes (PR #2): computed member access `arr[i]` in expressions,
  `while` error propagation (no more infinite fuel burn on a failing body), battery
  user type widened for multi-turn messages.
- Runtime: validate function-typed params on every call, pass-time function-shape
  checks, deep array validation (`arr: [0]` checks element types, not just
  array-ness), array-error propagation through nested params.
- Inference: rich function shapes (params + return types); `function` kind for
  arrow/function-expression defaults.
- Docs: classes and `test { }` blocks render as documentation; function-extraction fixes.
- Playground: SW-served iframe (all iframe fetches route through TFS), per-package /
  per-import CDN routing (JSDelivr `/+esm` default, esm.sh for React peer-dep dedup).

## [0.7.7] — 2026-04-27

### Fixed

- Protect string literals from code transformations.

## [0.7.6] — 2026-04-26

The long feature-accretion phase (202 commits since 0.2.0, no intermediate tags —
coarse summary):

### Added

- **Inline WASM**: compiled at transpile time (with WAT comments), SIMD (v128/f32x4)
  intrinsics, `wasmBuffer()` zero-copy memory + vector search (~5× speedup), iframe
  instantiation.
- **FunctionPredicate**: first-class function types, generic `FunctionPredicate<T>`,
  structural validation, `.d.ts` emission.
- **JSON Schema generation** from TJS types + function signatures; `Type.strip()`;
  ecosystem compat tests (Zod, Effect, Radash, Superstruct, ts-pattern, Kysely).
- **Complete `.d.ts` emission**: constants, type aliases, rest params, auto-populated
  declaration blocks for round-tripping; DOM type handling in `fromTS` (130+ types).
- **Error-history ring buffer** (flight recorder) for catching silent monadic errors.
- **Honest equality**: `==` split into `Eq` (honest equality) vs `Is` (structural),
  `tjsEquals` symbol protocol, VM structural equality; `typeof null === 'null'`;
  `NaN == NaN` is true; `IsBounded()`.
- `TjsNoVar` + `const!` (compile-time immutability, zero runtime cost); standalone JS
  output (emitted code runs without runtime setup); `@tjs` annotations and
  `/* @tjs ... */` mode directives in TS source.
- **Playground TFS service worker**: dynamic module resolution, specifiers rewritten
  directly to `/tfs/` URLs (import maps dropped); Firebase infra (Auth, Cloud
  Functions with `Eval`).

### Changed

- ASI protection fixes (was breaking WASM multiline expressions); predicate reason
  strings in diagnostic type errors.

## [0.2.0] — 2026-01-29

The foundational release: the TJS→JS transpiler (runtime type metadata), the
TypeScript→TJS converter, the AJS gas-metered VM (fuel metering, capability
injection, monadic errors), the builder API, stored procedures (AST-as-token),
`Eval()` safe eval, proportional fuel charging for memory-allocating ops, and the
playground + editor integrations (Monaco / CodeMirror / Ace, linter, autocomplete POC).

### Changed

- **BREAKING — VM return flattened to value-based** (`202e72a`): `return` now takes a
  value directly (`{ op: 'return', value: {...} }`) instead of schema-based state
  extraction. Removed the `__result__` wrapper and the nested `seq` blocks around
  returns, so `vm.run()`'s result is exactly the value you return — no envelope, no
  intermediate wrapping. This is the VM-return-flattening change; it landed in **0.2.0**
  (before 0.7.8) and was only recorded in the git log until this backfill.

[Unreleased]: https://github.com/tonioloewald/tjs-lang/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/tonioloewald/tjs-lang/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/tonioloewald/tjs-lang/compare/v0.10.1...v0.11.0
[0.10.1]: https://github.com/tonioloewald/tjs-lang/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/tonioloewald/tjs-lang/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/tonioloewald/tjs-lang/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.7...v0.9.0
[0.8.7]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.6...v0.8.7
[0.8.6]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.5...v0.8.6
[0.8.5]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.4...v0.8.5
[0.8.4]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.2...v0.8.4
[0.8.2]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/tonioloewald/tjs-lang/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/tonioloewald/tjs-lang/compare/v0.7.8...v0.8.0
[0.7.8]: https://github.com/tonioloewald/tjs-lang/compare/v0.7.7...v0.7.8
[0.7.7]: https://github.com/tonioloewald/tjs-lang/compare/v0.7.6...v0.7.7
[0.7.6]: https://github.com/tonioloewald/tjs-lang/compare/v0.2.0...v0.7.6
[0.2.0]: https://github.com/tonioloewald/tjs-lang/releases/tag/v0.2.0
