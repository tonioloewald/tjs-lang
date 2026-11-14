<!--{"parent": "the-tjs-language.md", "order": 8, "book": ["default"]}-->
<!-- TODO review -->

# One runtime for many TJS libraries (proposed spike, after 1.0)

**Status (2026-11-06): PROPOSED, deliberately deferred.** What ships works: every emitted file
carries its own runtime, and a bundle can share one copy (`docs/runtime-fusion.md` §8). This is
an optimization, in the spirit of tosijs's blueprints, which were added after tosijs already
worked and have always been nice rather than necessary. It waits until after 1.0, for a reason
given below that is not only priority.

## The problem

An app that uses five libraries compiled from TJS carries five copies of the inline runtime.
Measured 2026-11-06: the full runtime is 20.5 KB (6.7 KB gzipped). A one-function module emits
3.9 KB standalone and 1.4 KB with `prelude: 'import'`. Inside one bundle, `prelude: 'import'`
already solves this. Across PUBLISHED packages it cannot, because of a deliberate choice:

- The import form is locked to the emitter's exact content hash (`createPrelude('d4d0…')`),
  because the prelude's internals change nearly every release and are not an API. A mismatch
  would silently change what a check returns, so it is a load error instead.
- So `tjs emit` does not offer it: a published library would depend on an exact tjs-lang
  version, and on the whole toolchain package (compiler, acorn and all) to get a 20 KB file.

Error identity across copies is already handled: `MonadicError` is fused through a
shape-versioned global slot (`runtime-fusion.md`).

## The idea

A library ships WITHOUT the runtime and comes in happily on whichever compatible runtime is
present, or fails loudly when the one present is incompatible.

## Why not a first-module loader

The obvious version has the first TJS module to load bring the runtime and every later module
accept it. The first module has to get the runtime from somewhere:

- **Bundled**: then every library must carry it in case it loads first. Nothing is saved.
- **Fetched**: module load becomes asynchronous and needs the network, which breaks offline
  use and strict content-security policies.
- **Installed by the host first** (the blueprint shape: the host injects tosijs). Works, but
  depends on load order. ES modules evaluate their imports first, so the host needs a separate
  setup module imported before everything else, the footgun `configure()` already warns about.

## The proposal

A blueprint is the host injecting a dependency. In ESM, the equivalent is a shared PEER
import, and the package manager decides which copy is the one.

1. **A small runtime package** (say `tjs-runtime`): the inline runtime and nothing else, no
   compiler. The emitted import points there, not at `tjs-lang/prelude`.
2. **Versioned by the runtime's SHAPE, not by tjs-lang releases.** Its major version moves only
   when the contract emitted code relies on changes. Libraries declare it as a peer dependency
   (`"tjs-runtime": "^1"`). npm installs one copy, and refuses the install (ERESOLVE) when two
   libraries need incompatible ones: the noisy failure, at the best time, install.
3. **A load-time handshake as the backstop.** Each module states the shape it was emitted
   against (`createPrelude({ shape: 1, features })`), and an incompatible runtime throws,
   naming both. It covers what install cannot see: CDNs, hand-copied files, nested duplicates.
   This relaxes today's exact content-hash lock to a compatibility range.
4. **Libraries default to the import form; apps and scripts keep the standalone default**,
   which needs no setup.

The shared runtime is the INLINE runtime's behaviour, not `tjs-lang/runtime`'s: the two are
deliberately not equivalent (CLAUDE.md, "The inline runtime is NOT the real runtime"), and
emitted code is written against the inline one.

## Why after 1.0

Point 2 is the real cost. It makes the inline runtime a PUBLIC CONTRACT with semver: every
change to what emitted code calls becomes a compatibility decision, where today it is a free
internal change locked by a hash. Before 1.0 the runtime changes nearly every release and
should; freezing it now would slow the language for a size win that bundles already get.

## The spike

1. Extract the generated prelude into a package; emit `createPrelude({ shape, features })`.
2. Decide what "shape" covers: the names and signatures emitted code calls, and the behaviour
   the differential tests pin. Write it down as the contract.
3. Two libraries built against shape 1, one app: one copy installed, one copy bundled; a
   shape-2 library refused at install and at load, with a clear message.
4. Measure the saving on a real multi-library app before deciding.

**Stop if** the contract cannot be stated without freezing internals the language still needs
to change. **Continue if** it can, and the measured saving is worth one more published package
and its compatibility discipline.
