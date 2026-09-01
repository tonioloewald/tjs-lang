# Runtime fusion: what may be shared between TJS modules, and what may not

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

That limit is the reason a future id-based declaration table (`TODO.md`) must derive ids from
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
