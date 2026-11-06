<!--{"parent": "the-tjs-language.md", "order": 7}-->
<!-- TODO review -->

# Runtime fusion: what may be shared between TJS modules, and what may not

**If you only want to know what to do:** leave the default alone unless you build an
application bundle out of many TJS modules. By default every emitted `.js` file carries its own
copy of a small runtime, so it runs anywhere with no setup and a published library depends on
nothing. When you bundle many modules with Bun, `tjsPlugin({ sharedPrelude: true })` (from
`tjs-lang/bun-build-plugin`) makes them share one copy instead; the programmatic spelling is
`tjs(source, { prelude: 'import' })`. That output imports `tjs-lang/prelude` and is refused at
load by any other build of tjs-lang, so use it for your own bundle, never for files you
publish. It shrinks parse size, not download size (§8 has the numbers), and for two or three
small modules it is larger. How to set up the plugin is in
[TJS: Typed JavaScript → Module System](../DOCS-TJS.md) and
[Publishing a library](../guides/sections/ts-publishing-a-library.md). The rest of this page
is the design: what may be shared between modules, and why.

Every emitted `.js` file carries its own inline runtime — a self-contained prelude so the
output works with no setup. That is the right default and this note does not propose changing
it. It proposes a narrow exception, and more importantly it writes down the **rule** that
decides which parts of the runtime may ever be shared.

## 1. The measurement

Two libraries, each emitted from TJS, loaded together in Node:

| | bytes |
| --- | --- |
| one module alone | 3,504 |
| two bundled with esbuild | 8,806 |

The bundler emits `MonadicError` **and** `MonadicError2`, and declares `typeError` twice. A
bundler cannot dedupe these: they are textually separate top-level declarations in different
modules, so scope-hoisting renames them rather than merging them. Ten TJS-derived packages
means ten copies of an identical prelude, and ten distinct error classes.

```
  bundled + ran            : true
  same class after bundling: false
```

Nothing is broken by this — `isMonadicError` is duck-typed (`name === 'MonadicError'` plus
`'path' in v`) precisely so identity survives a module boundary. It is why an `instanceof`
check would be silently false for an error that crossed one, and why that failure would look
like "the error vanished" rather than like a type-identity problem.

## 2. The rule: code fuses, data unions

The distinction that decides every case:

- **Code is fungible.** Two versions of `MonadicError` implement the same shape, so it does
  not matter which one wins. Fusing by version — newest wins — is safe.
- **Data is not.** A module's types, and any id-to-shape map, belong to that module. "Newest
  wins" applied to data silently *drops* a library's types. Data must merge by **union**, or
  not merge at all.

`installRuntime()` already implements newest-wins for the runtime object, with a
major-version compatibility gate (`compareVersions` / `versionsCompatible`). This note extends
that same policy one level down, to the inline prelude — and states the limit: it stops at
code.

That limit is the reason a future id-based declaration table (a backlog card, imported from
`TODO.md`) must derive ids from
content rather than a counter. Content-derived ids let two modules' tables union with no
collisions; counter-derived ids both start at 1, so they can only be merged by discarding one.

## 3. Which prelude members qualify

Only members whose inline and canonical implementations are **observationally identical**.
This is a real constraint, not a formality — `CLAUDE.md`'s "the inline runtime is NOT the real
runtime" warning exists because most of them are not:

| member | identical? | may fuse? |
| --- | --- | --- |
| `MonadicError` | yes — same six constructor params, same order, same fields, same `name` | **yes** |
| `Type` | no — the real one throws where the stub is permissive | no |
| `FunctionPredicate` | no — real `.check()` returns a reason string, the stub returns `false` | no |
| `typeError` | no — reads config and the recorder off the global at call time | no |

So the exception is exactly one member. `MonadicError` is a plain data class: it carries
fields and does nothing else. That is what makes swapping it free of behaviour change, and it
is the only member of which that is true today.

## 4. Mechanism

A **shape-versioned** global slot, claimed with `??=`:

```js
const MonadicError = (globalThis.__tjs_MonadicError_1 ??= class MonadicError extends Error {
  /* … */
})
```

Properties that matter:

- **Standalone output is preserved.** No runtime need be installed; the first module to load
  defines the class and the rest reuse it. An emitted file on its own still works.
- **Load order is irrelevant.** Every candidate is identical, so whoever wins is correct.
- **The canonical runtime participates.** `runtime.ts` resolves through the same slot rather
  than always using its own class — otherwise a module that loaded before the runtime would
  still hold a different class, and `instanceof` would still be false.

### Why the key is a SHAPE version, not the package version

`__tjs_MonadicError_1` is versioned by the class's shape, and the number changes only if the
shape changes incompatibly. Keying on the package version would defeat the point — every
release would mint a new slot and nothing would ever be shared.

Fields have only ever been added, so a module built against an older tjs-lang reading a newer
class is fine: it reads the fields it knows and ignores the rest. If a field is ever *removed
or repurposed*, the slot number is bumped, and old and new libraries get separate slots
instead of the newer silently winning over code that cannot cope with it. That is the same
"compatible ⇒ fuse, incompatible ⇒ isolate" shape as `versionsCompatible`, expressed in a key.

## 5. What this buys, honestly

- `instanceof MonadicError` becomes true across module boundaries. `isMonadicError` already
  worked, so this is an ergonomic gain for consumers who reach for `instanceof` first, not a
  correctness fix.
- One class in a debugger instead of N.
- A small size win, bounded by one class declaration per module.

It does **not** dedupe the rest of the prelude — `typeError`, `__arrKinds`, the call-stack
ring — because those are not identical to their canonical versions. Sharing them would be a
behaviour change disguised as a size optimisation, which is the thing `CLAUDE.md` warns
against.

## 6. Keeping the two copies honest

The same way `unwrap-boxed.ts` does it: a **differential test**. The inline class and the
canonical class are constructed with identical arguments and compared field by field, so the
two cannot drift apart silently. Two copies of anything stay in sync because a test says so,
never because someone remembered.

## 7. The trust model of a global slot — and the `Predicate` sign-off it is waiting on

A shape-versioned slot is first-writer-wins: `globalThis.__tjs_X_1 ??= X`. So **any script that
runs earlier can pre-seed it**, and every TJS module loaded afterward adopts the impostor.

For `MonadicError` that was accepted when the slot was introduced: a pre-seeded class can make
`instanceof MonadicError` lie, but a script with that much reach can already monkey-patch far
more than one class, so the slot adds no capability an attacker in that position lacks.

`Predicate` (0.14.0) uses the same mechanism, and the 0.14.0 re-review (gap 4) asked the right
question: **nobody has signed off on it for a brand that type dispatch reads.** The difference
worth weighing:

- A pre-seeded `Predicate` decides `instanceof Predicate` program-wide, and — because
  `brandPredicate` does `Object.setPrototypeOf(fn, Predicate.prototype)` — it decides the
  prototype **every branded predicate inherits**, getters included. An accessor on that prototype
  runs on property reads of `isColor`, `Type(…)` and the rest.
- It does **not** decide the verdict. `check` is an own property (the function itself), and
  `checkType` dispatches on `'check' in expected` and calls it. A poisoned prototype can observe
  and interfere through inherited members, but the decision path reads own properties.
- The same-reach argument still mostly holds: code that can run before TJS loads can already
  replace `Function.prototype.call`, `JSON.stringify`, or `globalThis.__tjs` itself.

**Status: DECIDED 2026-09-25 (maintainer) — option 1, the MonadicError trust model.**

The deciding observation was the maintainer's: option 2 is option 1 plus robustness against
*honest* conflicts, not against an attacker. Code that runs before tjs-lang can build a class
that passes any structural check — so validating the slot's contents defends against nobody
hostile ("anything beyond that is just security theater"). And its failure mode is worse than
the thing it guards: a rejected slot splits the brand per bundle, which silently reinstates the
cross-bundle `instanceof` failure (B2). The shape-versioned key already absorbs most honest
conflicts — a different shape claims `_2`, not `_1`.

What remains is one guard, for the only honest accident left: a value under our exact key that
**cannot be a constructor at all** (a number, a plain object, an arrow). That is not adopted —
adopting it would break every predicate at the first `brandPredicate` — and is recorded in the
flight recorder (`source: 'type'`, `severity: 'warning'`). **Any** constructor is adopted, with
no check of what it is. Pinned both ways by `src/types/predicate-slot.test.ts`.

The options as they were weighed:

1. **Accept** the MonadicError trust model for `Predicate`, recorded here with the reasoning above.
2. **Harden the slot**: validate what is found there before adopting it (e.g. require a
   frozen class with an empty prototype chain up to `Function.prototype`, else ignore the slot
   and use the local class — losing fusion only in the hostile case).
3. **Drop fusion for the brand** and accept per-bundle `Predicate` classes, which is the B2
   cross-bundle `instanceof` failure, now pinned by `src/predicate-bundles.test.ts`.

## 8. A shared prelude: one copy per bundle (#3594, shipped in 0.14.0)

tosijs-native bundled six small `.tjs` modules with `Bun.build` and got `__tjs_rt` …
`__tjs_rt5`: six preludes, 69 KB raw. §5 said the rest of the prelude cannot be deduped *by
fusing with the canonical runtime*, and that still holds. This section dedupes it a different
way: every module shares **one copy of the inline prelude itself**, which by definition behaves
like the inline prelude.

### What the prelude actually is

Not one text. The emitter builds it from about twenty `needs*` flags, and three of them change
function BODIES rather than inclusion: `needsKind` (example-kind markers), `needsSolver` (the
recursive-Type solver) and `needsExampleSchema` (`toJSONSchema`/`strip`). It also holds
**per-file state**: `__ac`, the projection table `extend` writes, which an earlier fix made
per-file on purpose (a global table let one module's `extend` change another module's `if (x)`).

### Design

1. **Code fuses, state stays per module.** The shared artifact is a FACTORY,
   `createPrelude()`, exported by a new subpath `tjs-lang/prelude`. A module emitted with
   `prelude: 'import'` replaces its IIFE with

   ```js
   import { createPrelude as __tjs_createPrelude } from 'tjs-lang/prelude'
   const __tjs_rt = __tjs_createPrelude('<version>')
   ```

   so the CODE exists once in the bundle and each module still gets its own `__ac`, its own
   call-stack ring, its own everything. Nothing about which state is shared has to be audited
   member by member, because none is.
2. **One source.** The factory is the emitter's own prelude with every flag on, GENERATED from
   the same code path into `src/lang/prelude.generated.js` and checked for drift by a test (the
   `core-atom-inputs` pattern). There is no second hand-written copy.
3. **Maximal variant ⇒ a differential test.** A file that needed only the narrow `Type` now
   gets the full one. The flags only ADD handling (kind markers, the solver, schema methods),
   but "only adds" is a claim, so it is checked: a corpus is emitted both ways and every
   call's result, error message and path must agree. The risk measured first was the full
   variant's `if(v.__k)`, which could treat a user value with an own `__k` key as a kind
   marker; the corpus includes such values and the two forms agree on them.
4. **Locked to the exact code.** The emitted call passes a content hash of the prelude the
   emitter built (`createPrelude('d4d0b72127e3058a')`, say), not a version number, and the
   factory throws on any mismatch at load, naming both hashes. The prelude changes nearly
   every release and its internals are not an API, so a mismatch would silently change what a
   check returns; a load error is the honest failure. Under the build plugin the transpiler and
   `tjs-lang/prelude` are the same installed package (the plugin resolves the import to its
   own copy), so it cannot fire there.
5. **Opt-in, default unchanged.** `tjs(src, { prelude: 'inline' | 'import' })`, default
   `'inline'`: emitted files stay standalone, which is the default this doc's first line
   defends. `tjsPlugin({ sharedPrelude: true })` turns it on for a bundle. `tjs emit` does not
   does not offer it: a published package would then depend on an EXACT tjs-lang version,
   which is a packaging decision for its author, and the plugin case is what was asked for.
6. **What stays per file**: the bare aliases (`Type`, `Is`, …) and the `__tjs` fallback are
   built from this file's flags exactly as now; only the IIFE moves.

### What shipped, and how it is tested

- `tjs(src, { prelude: 'inline' | 'import' })`, default `'inline'`;
  `tjsPlugin({ sharedPrelude: true })`; and the `tjs-lang/prelude` entry point, generated into
  `src/lang/prelude.generated.js` by `bun run build:prelude`.
- `src/lang/prelude.test.ts`: the committed prelude matches what the emitter builds now; a
  differential corpus gives the same results inline and imported; one module's `extend` does
  not reach another module's `==` or `if`; a prelude from another emitter is refused at load,
  naming both hashes; import-mode output carries no prelude of its own.
- `src/bun-plugin/build-plugin.test.ts`: a five-module `Bun.build` carries five preludes
  inline and one with `sharedPrelude`, with the same results; and a wrong signature example
  still fails the build under `sharedPrelude` (the transpile-time tests run against the inline
  form, because an `import` cannot resolve where they run).
- Default output is unchanged; every other test in the suite runs it.

### Measured (2026-10-31)

tosijs-native's `index.tjs`, seven modules, `Bun.build`:

| | raw | gzip | preludes |
| --- | --- | --- | --- |
| inline (default) | 102,593 | 15,374 | 7 |
| `sharedPrelude` | 72,334 | 15,571 | 1 |

The raw size drops 30%; the gzip size does not move, because compression already folded the
seven identical-ish copies. So this is a parse-size and debugging win (one runtime to step
through), not a transfer win. The full prelude is about 20 KB raw (6.6 KB gzip), so a bundle
of two or three small modules comes out LARGER shared: five one-function modules measured
34.6 KB inline against 36.2 KB shared. A transfer win needs the bundler to tree-shake the
prelude, which a factory prevents. Getting it means splitting stateless helpers (top-level
exports a bundler can drop) from the stateful core (`__ac` and everything that reads it),
which is a follow-up, not part of this change.

### Self-critique

- *Why not import `tjs-lang/runtime`?* It is not the inline runtime (§3): `Type` throws where
  the stub is permissive. Swapping would change behaviour based on a build flag.
- *Why not union the flags across the bundle's modules?* It needs every module before emitting
  any, which `onLoad` does not offer, and buys a few KB once per bundle.
- *Cost for a one-module bundle:* larger, since it gets the full prelude. That is why it is
  opt-in and why the size row reports both cases.
