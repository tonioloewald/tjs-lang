<!--{"parent": "the-tjs-language.md", "order": 7}-->
<!-- TODO review -->

# Runtime fusion: what may be shared between TJS modules, and what may not

**If you only want to know what to do:** leave the default alone unless you build an
application bundle out of many TJS modules.

Every emitted `.js` file carries its own copy of a small runtime (the **inline prelude**): the
error class, the type-check helpers, and per-file state such as what the file's `extend`
blocks registered. That is why emitted output runs anywhere with no setup, and why a published
library depends on nothing. The cost is duplication: a bundle of N TJS modules holds N copies,
and before the fix in §4 it also held N different error classes, so `err instanceof
MonadicError` was false for an error made in another module.

When you bundle many modules with Bun, `tjsPlugin({ sharedPrelude: true })` (from
`tjs-lang/bun-build-plugin`) makes them share one copy instead; the programmatic spelling is
`tjs(source, { prelude: 'import' })`. That output imports `tjs-lang/prelude` and records a
hash of the exact prelude it was built with; it throws at load if the installed tjs-lang has a
different prelude (§8, item 4). So use it for your own bundle, never for files you publish. It
shrinks the code the browser has to parse (about 30% in the measurement below), not the
compressed download, because gzip already removes most of the duplication. For a handful of
small modules it is larger: five one-function modules measured larger shared than inline. How
to set up the plugin is in [TJS: Typed JavaScript → Module System](../DOCS-TJS.md#module-system)
and [Publishing a library](../guides/sections/ts-publishing-a-library.md).

**The rest of this page is the design record, mainly for contributors.** It covers three
things, all shipped:

1. **Fusing with the canonical runtime** (§1–§6): `MonadicError`, and only `MonadicError`, is
   shared program-wide through a global slot.
2. **The `Predicate` slot** (§7): the same mechanism for a different class, which lives in the
   library bundles rather than in the prelude.
3. **The shared prelude** (§8, 0.14.0): one copy of the inline prelude's code per bundle, with
   its state still kept per module.

Two terms used throughout. The **inline prelude** is the runtime copied into each emitted
file; emitted code calls it through a per-file object named `__tjs_rt`. The **canonical
runtime** is `tjs-lang/runtime`, which `installRuntime()` installs as `globalThis.__tjs`. They
are separate implementations and do not behave identically (see
[Type identity](type-identity.md)), which is the constraint this whole page works within.

## 1. The measurement (before the slot)

Two libraries, each emitted from TJS, loaded together in Node. Bytes of emitted output:

| | bytes |
| --- | --- |
| one module alone | 3,504 |
| two bundled with esbuild | 8,806 |

The bundler emitted `MonadicError` **and** `MonadicError2`, and declared `typeError` twice. A
bundler cannot dedupe these: they are textually separate top-level declarations in different
modules, so scope-hoisting renames them rather than merging them. A script that bundled both
modules, ran the result and compared the two error classes printed:

```
  bundled + ran            : true
  same class after bundling: false
```

By extrapolation, ten TJS-derived packages meant ten copies of an identical prelude and ten
distinct error classes.

Nothing was broken by this. Because there were two classes, `err instanceof MonadicError` was
false for an error from the other module. `isMonadicError(err)` still worked, because it checks
shape rather than class: an `Error` whose `name` is `'MonadicError'` and which has a `path`.
But `instanceof` is what most people reach for first, and when it fails the error seems to
vanish rather than to have a type-identity problem. §4 fixed the class identity; §8 deals with
the duplicated prelude.

## 2. The rule: code fuses, data unions

The distinction that decides every case:

- **Code is fungible.** Two copies of `MonadicError` with the same shape behave the same, so it
  does not matter which one is used.
- **Data is not.** A module's types, and any id-to-shape map, belong to that module. Keeping
  only one module's copy of data silently *drops* another library's types. Data must merge by
  **union**, or not merge at all.

Two policies decide which copy of code is used, and they differ:

- `installRuntime()` is **newest-wins** for the canonical runtime object, guarded by a
  major-version compatibility check.
- The global slots in §4 and §7 are **first-writer-wins**: whichever module loads first
  defines the class, and the rest adopt it. That is safe only because every candidate under one
  slot key is identical, so which one is first does not matter.

Both stop at code. For example, a table mapping ids to types, shared between modules, would
have to derive its ids from content rather than from a counter: content-derived ids let two
modules' tables union with no collisions, while counter-derived ids both start at 1, so the
tables could only be merged by discarding one.

## 3. Which prelude members qualify

Only members whose inline and canonical implementations are **observationally identical**.
This is a real constraint, not a formality: the inline prelude is a separate implementation
with different behaviour, so swapping one for the other changes results.

| member | identical? | may fuse? |
| --- | --- | --- |
| `MonadicError` | yes — same six constructor params, same order, same fields, same `name` | **yes** |
| `Type` | no — the real one throws where the stub is permissive | no |
| `FunctionPredicate` | no — real `.check()` returns a reason string, the stub returns `false` | no |
| `typeError` | no — the canonical one captures a call stack when `callStacks` or `debug` is configured; the inline one never does | no |

The `MonadicError` constructor is
`(message, path, expected?, actual?, callStack?, reason?)`; it sets `name = 'MonadicError'`
and stores the other five as fields of the same names. That list is the "shape" the slot key
in §4 is versioned by.

So among prelude members the exception is exactly one. `MonadicError` is a plain data class: it
carries fields and does nothing else. That is what makes swapping it free of behaviour change,
and it is the only prelude member of which that is true today. (`Predicate`, §7, is not a
prelude member; §8 shares the prelude's code without fusing it with the canonical runtime.)

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
- **Load order is irrelevant.** The slot is first-writer-wins, but every candidate is
  identical, so whichever wins is correct.
- **The canonical runtime participates.** `tjs-lang/runtime` also reads the class from this
  slot rather than always using its own. Otherwise a module that loaded before the runtime
  would still hold a different class, and `instanceof` would still be false.

### Why the key is a SHAPE version, not the package version

`__tjs_MonadicError_1` is versioned by the class's shape, and the number changes only if the
shape changes incompatibly. Keying on the package version would defeat the point: every
release would mint a new slot and nothing would ever be shared.

Fields have only ever been added, so a module built against an older tjs-lang reading a newer
class is fine: it reads the fields it knows and ignores the rest. If a field is ever *removed
or repurposed*, the slot number is bumped, and old and new libraries get separate slots
instead of the newer silently winning over code that cannot cope with it. That is the same
"compatible ⇒ fuse, incompatible ⇒ isolate" rule as `installRuntime()`'s version check,
expressed in a key.

## 5. What this buys, honestly

- `instanceof MonadicError` becomes true across module boundaries. `isMonadicError` already
  worked, so this is an ergonomic gain for consumers who reach for `instanceof` first, not a
  correctness fix.
- One class in a debugger instead of N.
- A small size win, bounded by one class declaration per module.

It does **not** dedupe the rest of the prelude (`typeError`, `__arrKinds`, the call-stack
ring) by fusing it with the canonical runtime, because those are not identical to their
canonical versions. Sharing them that way would be a behaviour change disguised as a size
optimisation. (§8 dedupes them a different way.)

## 6. Keeping the two copies honest

With a **differential test**, `src/lang/monadic-error-fusion.test.ts`. The inline class and
the canonical class are constructed with identical arguments and compared field by field, so
the two cannot drift apart silently. Two copies of anything stay in sync because a test says
so, never because someone remembered.

## 7. The trust model of a global slot, and the `Predicate` decision

A shape-versioned slot is first-writer-wins: `globalThis.__tjs_X_1 ??= X`. So **any script that
runs earlier can pre-seed it**, and every TJS module loaded afterward adopts the impostor.

For `MonadicError` that was accepted when the slot was introduced: a pre-seeded class can make
`instanceof MonadicError` lie, but a script with that much reach can already monkey-patch far
more than one class, so the slot adds no capability an attacker in that position lacks.

`Predicate` (0.14.0) is the class that marks a function as a TJS predicate: `Type(…)` results
and validators such as `isColor` (from `tjs-lang/css`) are functions whose prototype is
`Predicate.prototype`. That marking is the **brand**, and type checking uses it to recognise a
predicate. Each published bundle (`tjs-lang`, `tjs-lang/css`, …) carries its own copy of the
class, so `Predicate` uses the same kind of slot, `__tjs_Predicate_1`; without it,
`isColor instanceof Predicate` would be false for a consumer who imported `Predicate` from
one bundle and `isColor` from another. The class has no behaviour, so the copies are
identical.

A pre-release review asked whether the `MonadicError` trust model was acceptable for a brand
that type checking reads. The difference worth weighing:

- A pre-seeded `Predicate` decides `instanceof Predicate` program-wide, and, because branding
  sets each predicate's prototype to `Predicate.prototype`, it decides the prototype **every
  branded predicate inherits**, getters included. An accessor on that prototype runs on
  property reads of `isColor`, `Type(…)` and the rest.
- It does **not** decide the verdict. `check` is an own property (the function itself), and
  type checking finds it by `'check' in expected` and calls it. A poisoned prototype can
  observe and interfere through inherited members, but the decision path reads own properties.
- The same-reach argument still mostly holds: code that can run before TJS loads can already
  replace `Function.prototype.call`, `JSON.stringify`, or `globalThis.__tjs` itself.

The options weighed:

1. **Accept** the `MonadicError` trust model for `Predicate`.
2. **Harden the slot**: validate what is found there before adopting it (e.g. require a frozen
   class with an empty prototype chain up to `Function.prototype`, else ignore the slot and use
   the local class, losing fusion only in the hostile case).
3. **Drop fusion for the brand** and accept per-bundle `Predicate` classes, which brings back
   the cross-bundle `instanceof` failure (pinned by `src/predicate-bundles.test.ts`).

**Decided 2026-09-25 (maintainer): option 1.**

The deciding observation was the maintainer's: option 2 is option 1 plus robustness against
*honest* conflicts, not against an attacker. Code that runs before tjs-lang can build a class
that passes any structural check, so validating the slot's contents defends against nobody
hostile ("anything beyond that is just security theater"). And its failure mode is worse than
the thing it guards: a rejected slot splits the brand per bundle, which silently brings back
the cross-bundle `instanceof` failure. The shape-versioned key already absorbs most honest
conflicts: a different shape claims `_2`, not `_1`.

What remains is one guard, for the only honest accident left: a value under our exact key that
**cannot be a constructor at all** (a number, a plain object, an arrow). That is not adopted
(adopting it would break every predicate the first time one is branded) and is recorded in the
flight recorder (`source: 'type'`, `severity: 'warning'`). **Any** constructor is adopted, with
no check of what it is. Pinned both ways by `src/types/predicate-slot.test.ts`.

## 8. A shared prelude: one copy per bundle (#3594, shipped in 0.14.0)

tosijs-native bundled six small `.tjs` modules with `Bun.build` and got six per-file runtime
objects, `__tjs_rt` … `__tjs_rt5`: six preludes, 69 KB raw. (The measurement below was taken
later, when the project had seven modules.) §5 said the rest of the prelude cannot be deduped
*by fusing with the canonical runtime*, and that still holds. This section dedupes it a
different way: every module shares **one copy of the inline prelude itself**, which by
definition behaves like the inline prelude.

### What the prelude actually is

Not one text. The prelude differs per file depending on which features the file uses, and some
features change what a function does, not only whether it is included. It also holds
**per-file state**, such as what the file's `extend` blocks registered. That is per file on
purpose: an earlier global table let one module's `extend` change how another module's
`if (x)` treated a value.

(In the emitter: about twenty `needs*` flags decide the prelude, and three of them change
function bodies: `needsKind` (example-kind markers), `needsSolver` (the recursive-Type solver)
and `needsExampleSchema` (`toJSONSchema`/`strip`). The `extend` state is `__ac`.)

### Design

The default prelude is emitted as an immediately invoked function whose result is bound to
`__tjs_rt`.

1. **Code fuses, state stays per module.** The shared artifact is a FACTORY,
   `createPrelude()`, exported by a new subpath `tjs-lang/prelude`. A module emitted with
   `prelude: 'import'` replaces its immediately invoked function with

   ```js
   import { createPrelude as __tjs_createPrelude } from 'tjs-lang/prelude'
   const __tjs_rt = __tjs_createPrelude('d4d0b72127e3058a')
   ```

   so the CODE exists once in the bundle and each module still gets its own `extend` state,
   its own call-stack ring, its own everything. Nothing about which state is shared has to be
   audited member by member, because none is.
2. **One source.** The factory is the emitter's own prelude with every flag on, GENERATED from
   the same code path into `src/lang/prelude.generated.js`, with a test that regenerates it and
   fails on any difference. There is no second hand-written copy.
3. **Maximal variant ⇒ a differential test.** A file that needed only a minimal `Type` now gets
   the full one. The flags only ADD handling (kind markers, the solver, schema methods), but
   "only adds" is a claim, so it is checked: a corpus is emitted both ways and every call's
   result, error message and path must agree. The risk measured first was that the full
   variant tests values for an internal marker key (`__k`), so it could mistake a user value
   with an own `__k` key for a kind marker; the corpus includes such values and the two forms
   agree on them.
4. **Locked to the exact code.** The argument in the emitted call is a content hash of the
   prelude the emitter built (`'d4d0b72127e3058a'` above), not a version number, and the
   factory throws on any mismatch at load, naming both hashes. The prelude changes nearly
   every release and its internals are not an API, so a mismatch would silently change what a
   check returns; a load error is the honest failure. Under the build plugin the transpiler and
   `tjs-lang/prelude` are the same installed package (the plugin resolves the import to its
   own copy), so it cannot fire there.
5. **Opt-in, default unchanged.** `tjs(src, { prelude: 'inline' | 'import' })`, default
   `'inline'`: emitted files stay standalone, which is the default this page opens by
   defending. `tjsPlugin({ sharedPrelude: true })` turns it on for a bundle. `tjs emit` does
   not offer it: a published package would then depend on an EXACT tjs-lang version, which is
   a packaging decision for its author, and the plugin case is what was asked for.
6. **What stays per file**: the bare aliases (`Type`, `Is`, …) and the `__tjs` fallback are
   built from this file's flags exactly as before; only the prelude's code moves.

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
seven near-identical copies. So this is a parse-size and debugging win (one runtime to step
through), not a transfer win. The full prelude is about 20 KB raw (6.6 KB gzip), so a bundle
of a handful of small modules comes out LARGER shared: five one-function modules measured
34.6 KB inline against 36.2 KB shared. A transfer win needs the bundler to tree-shake the
prelude, which a factory prevents. Getting it means splitting stateless helpers (top-level
exports a bundler can drop) from the stateful core (the `extend` state and everything that
reads it), which is a follow-up, not part of this change.

### Self-critique

- *Why not import `tjs-lang/runtime`?* It is not the inline runtime (§3): `Type` throws where
  the stub is permissive. Swapping would change behaviour based on a build flag.
- *Why not union the flags across the bundle's modules?* It needs every module before emitting
  any, which `onLoad` does not offer, and buys a few KB once per bundle.
- *Cost for a one-module bundle:* larger, since it gets the full prelude. That is why it is
  opt-in and why the size row reports both cases.
