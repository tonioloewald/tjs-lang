# Ambient Contracts — probe reality, derive verified predicate contracts

> **Status: design note / idea (2026-07-03).** Not built. Captures the direction
> and a concrete first spike (CSS + DOM). Related: the predicate engine
> (`src/lang/predicate.ts`), the `tjs-lang/css` library (`src/css/`), the
> autocomplete introspection bridge (`demo/src/introspection-bridge.ts`,
> `editors/introspect-value.ts`), and the VM capability model (`src/vm/`).

## The itch

Static types are pessimistic about ambient runtime environments (the DOM, Node
globals, `window`, host objects) in ways that create ceremony without safety.
The canonical example:

```ts
element.addEventListener('input', (e) => {
  const value = e.target.value // ❌ TS: Property 'value' does not exist on 'EventTarget'
})
```

`e.target` is typed `EventTarget | null`, and `EventTarget` has no `.value`, so
TypeScript forces `(e.target as HTMLInputElement).value` or a `instanceof` dance.
But the honest situation is: **at runtime the value is either there or it
isn't, and if it isn't you find out immediately.** The cast doesn't make it
safer — it just silences a compiler that can't see the real object. A runtime
predicate is the truthful tool here:

```tjs
// pure, total, verifiable — reads props, no cast, no lie
function hasValueTarget(e) {
  return e != null && e.target != null && typeof e.target.value === 'string'
}
// usage: hasValueTarget(e) ? e.target.value : undefined  — no ceremony
```

That predicate is exactly what the verifier accepts (member access is pure;
`typeof` → `TypeOf`), compiles to native, and — crucially — is **serializable**.
So the thought: instead of hand-writing these, could tooling **probe a real
ambient environment and derive the predicate contracts automatically?**

## The payoff: author against an environment you're not running in

The headline use (user, 2026-07-03): **type-checking and autocompletion against a
non-ambient runtime — editing in a Node-based toolchain while _targeting_ the
browser** (or the reverse, or Electron, or a specific Bun). Normally you have no
target environment to introspect, so you fall back to a hand-maintained
`.d.ts` (`lib.dom`) that drifts from what the engine actually does.

Because a probed contract is a **serializable predicate**, it decouples _capture_
from _consumption_ in time and space: probe the real target once (locally or in
CI), bottle the contract, and a Node-side editor/typechecker consumes it with **no
target present**. It beats a `.d.ts` on three axes:

- **Grounded in reality, not a drifting spec** — it's what the target _actually_
  exposes (we watched happy-dom diverge 678 vs 1 own-keys from real Chrome; a
  captured contract is the real number).
- **Target-specific and versioned** — capture from the _actual_ target (this
  browser, this Electron, this Bun), selectable/pinned, not a lowest-common-
  denominator lib.
- **The same artifact validates at runtime** — a `.d.ts` evaporates; a predicate
  contract can stay as a boundary guard, and its enumerable leaves feed
  `suggest()` completions with real values.

Why it's plausible _here_ and not a research project: the contract format already
exists (`$predicate` / `tjs-lang/schema`), the autocomplete provider already has
an introspection hook (`getMembers` — point it at a captured contract instead of a
live object), and this is exactly the metadata the pinned "argument-type-driven
completion" item wants (e.g. `createElement`'s tag→type return shapes), sourced
from reality instead of hand-authored. See [[introspection-autocomplete]].

## Contract vs. shim — the distinction that decides feasibility

"A predicate that stands in for the DOM" can mean two very different things:

1. **A contract / validator** — "does this value behave enough like an
   `HTMLElement` / an input event / a `CSSStyleDeclaration`?" Predicates are
   _pure validators_, so this is squarely in scope: shape, property presence,
   method arity, pure invariants.
2. **A behavioral substitute** — something that, when code calls
   `document.createElement('div')`, actually _does_ it. Predicates **cannot** be
   this (they're pure, stateless, effect-free). That's a shim — happy-dom/jsdom
   territory.

The valuable, on-thesis move is **#1 as the bridge to #2**: probe the real
environment, emit a serializable predicate _contract_, and use it to **certify a
stand-in** in whatever setting. The predicate isn't the DOM — it's the portable,
verifiable spec a substitute must satisfy, auto-derived from reality and from the
surface a given program actually touches.

## Why it fits this project

- **The introspection probe already exists.** The autocomplete work runs code in
  a real iframe and reads live scope (`introspect-value.ts`,
  `introspection-bridge.ts`); Claude-in-Chrome can drive a _real_ browser. That's
  the "kick the tires" mechanism.
- **Predicates are the serializable contract form** — verified, ReDoS-safe,
  compile-to-native, travel as data (the `$predicate` keyword already embeds them
  in JSON Schema, now evaluated by `tosijs-schema` via `tjs-lang/schema`).
- **The VM already models this as capabilities.** It injects `fetch`/`store`/
  `llm`; "DOM-as-capability, predicate-validated at the boundary" is the same
  pattern. A headless setting swaps the stub; the predicate catches divergence.
- **"Types are examples" already** — deriving a contract from _observed_ real
  values is the same philosophy as `inferTypeFromValue`, sourced from a live probe
  instead of a literal.

## The honest constraints

- **Most of the DOM's contract is _behavioral_** (layout, events, mutation),
  which a pure predicate can't capture — only shape + pure invariants. So:
  - **Scope to the used surface.** Trace which ambient APIs the code actually
    touches (in the real iframe) and derive a contract for _that slice_, not all
    of `lib.dom.d.ts`.
  - **Behavioral conformance is a separate, impure harness** — run the same probe
    battery against the real env and a candidate stub, diff the outputs. The
    predicate is the pure shape-gate; the harness is the behavior-gate.
- **Snapshots drift.** Browsers evolve; a captured contract is a dated snapshot.
  Fine — it's re-derivable, and versioning it is a feature (conformance over
  time).
- **Non-determinism / side effects** must stay outside predicates (the `effects`
  tag already enforces this): a predicate validates the _data_ crossing the
  boundary, never performs the effect.

## Shape of the tooling (sketch)

1. **Probe** — in a real environment (browser via Claude-in-Chrome, or the
   introspection iframe), walk an ambient object / a program's used surface and
   record: property names + `typeof`, method names + `.length` (arity), and a few
   sampled input→output pairs for pure-ish accessors.
2. **Derive** — turn the probe record into a predicate cluster (shape checks +
   `typeof` guards + membership sets), run it through `verifyPredicate` (so the
   emitted contract is itself certified safe), and `suggest()`-mine it for the
   enumerable leaves.
3. **Emit** — a `$predicate` schema (naive validators see structure, aware ones
   run the contract) + optionally a `.d.ts`-ish view for editors.
4. **Conform** — a harness that validates a stand-in (happy-dom, a hand stub, a
   VM capability) against the contract, failing loud where it diverges. This is
   what would have unblocked the Phase 5 real-`tosijs`-theme measurement (blocked
   because `theme.ts` needs `HTMLElement` at import).

## First spike — CSS + DOM (the convergence point)

`element.style` (`CSSStyleDeclaration`) is the ideal first target: it's an
ambient, stateful host object, and we _already have a full CSS value grammar as
predicates_ (`tjs-lang/css`). So the loop is concrete and small:

- **`event.target` demo** — show the `hasValueTarget` predicate compiles, is
  verified pure, is total, and validates a real input event while rejecting a
  click on a `<div>`. The predicate TypeScript won't let you write cleanly is a
  perfectly ordinary verified predicate. (This is the "asinine" antidote, and
  needs no browser — synthetic event-shaped objects suffice for the unit; a real
  browser confirms on live events.)
- **`CSSStyleDeclaration` probe** — introspect real `element.style` in a browser,
  derive a shape contract, and diff a happy-dom `style` against it: where does the
  stub lie? Leaf _values_ ride the existing CSS predicates (`isColorValue`,
  `isDimension`, …), so this exercises probe → contract → conformance end-to-end
  while reusing what phases 1–5 built.

## Findings from the first spike (2026-07-03)

Built in `experiments/ambient/` (`probe.ts` + two demo tests, 7 green):

- **The `event.target` predicate is ordinary.** `hasValueTarget(e)` (reads
  `e.target.value`, the thing TS rejects) verifies pure/safe, compiles native, and
  is total — no throw on a missing target. The cast TS demands buys nothing a
  predicate doesn't. (`event-target.demo.test.ts`.)
- **Host objects hide their surface on the prototype.** Probed a real
  `CSSStyleDeclaration` via happy-dom: `Object.keys(style)` is nearly empty, yet
  `typeof style.color === 'string'` and `typeof style.setProperty === 'function'`.
  So a naive own-enumerable probe derives an empty contract — **the probe must
  walk the prototype chain** (`getOwnPropertyNames` per proto) or check a scoped
  key list. `probeShape` now does both.
- **Scope to the used surface — the full proto chain is huge.** An `HTMLElement`'s
  chain is hundreds of props; a whole-shape contract would be enormous and
  over-specified. A `keys: [...]` scope (the surface a program actually touches,
  traced from the real env) is the right input. Demonstrated: a 4-key contract for
  `style` verifies safe, accepts a real happy-dom `style` and a conforming hand
  stub, rejects a plain object missing the methods.
- **Reading accessors during a probe can have side effects** (`offsetWidth` forces
  layout). A scoped key list bounds this; a stricter probe would read property
  _descriptors_ rather than the values. Getters that throw are skipped.
- **CSS convergence holds.** Leaf values off the real object ride the existing
  `tjs-lang/css` predicates (`isColorValue(style.color)`), so shape-gate (contract)
  + value-grammar (css) compose — the recursive style structure from CSS phase 4
  is the same shape a DOM-derived contract would target.

Net: the probe→derive→verify→conform loop works end-to-end on a real host object;
the open work is sourcing the used-surface scope (trace) and the behavioral half.

### Real-browser findings (via haltija `/eval`, live Chrome — 2026-07-03)

Confirmed against a real browser (not happy-dom), which sharpened three points:

- **Builtins don't honor `new`.** `new HTMLDivElement()` → `TypeError: Failed to
  construct 'HTMLDivElement': Illegal constructor`. You **don't need `new`** — the
  shape is on the constructor's `.prototype` chain
  (`HTMLDivElement → HTMLElement → Element → Node → EventTarget`), readable
  statically, no instance, no side effects. Cleaner than instantiating.
- **The manager vends the type.** `document.createElement('div').constructor ===
  HTMLDivElement` (and `'a' → HTMLAnchorElement`, `'input' → HTMLInputElement`).
  So a factory's output gives you _both_ a live example (real default values — the
  "types are examples" leaf) _and_ the type identity (`.constructor` → name +
  `.constructor.prototype` → the surface). Two complementary probe sources that
  cross-check.
- **Structural contracts are realm-portable; `instanceof` is not — proved.** An
  `<iframe>`'s input: `instanceof HTMLInputElement` (top realm) = **false**, but
  the structural predicate (`typeof x.value === 'string' && x.tagName === 'INPUT'`)
  = **true**. This is the whole argument in one line: nominal DOM types are
  realm-bound (the stand-in problem _is_ a realm problem), a derived structural
  predicate crosses realms. (happy-dom couldn't show this — it shares one
  `HTMLInputElement` across `Window`s; the real browser does.)
- **Bonus — the stand-in already diverges from reality.** Real Chrome's `style`
  has **678 own keys** (CSS properties as own props); happy-dom's had ~1 (on the
  proto). Same object, wildly different probe result — exactly the conformance gap
  the harness exists to catch, and proof that you must probe _reality_, not a
  stand-in, to derive the contract.

### Generalizes beyond the DOM — Node/Bun internals

The probe is environment-agnostic: `process`, `Buffer`, `node:fs`, `Bun.*`,
`globalThis` are ambient objects with the same shape. Derive a used-surface
contract from the _real_ runtime and certify a stand-in — e.g. "does my `process`
usage survive in the browser polyfill?" or "does Bun's `process` satisfy the
contract my code derived from Node's?". It's the realm/stand-in problem one level
up: cross-_runtime_ portability instead of cross-_frame_. Same tool.

## Open questions

- Where's the line between "derive automatically" and "author, then verify
  against reality"? The probe likely _proposes_ a contract a human trims.
- Method behavior: can we derive useful pure invariants for methods
  (idempotence, `getComputedStyle(x)` shape) or only signatures?
- Editor story: a derived `$predicate` contract as the source of both validation
  _and_ autocomplete (the introspection-autocomplete north star) for host objects
  that ship no good `.d.ts`.
