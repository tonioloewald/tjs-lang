<!--{"parent": "the-tjs-language.md", "order": 12}-->
<!-- TODO review -->

# Ambient Contracts — probe reality, derive verified predicate contracts

> **Status: exploratory design note (written 2026-07-03, checked 2026-11-06).**
> This describes a direction, not a feature you can use today. The contract
> tooling is not built: there is no probe, derive or conform step in the package,
> only an experimental spike (see the contributor note at the end). What you can
> use today is the pieces it builds on: verified predicates (`verifyPredicate` in
> `tjs-lang/lang`) and the CSS validators in `tjs-lang/css`, which shipped after
> this note was written (0.9.0, 2026-07-06).

Terms used throughout. An **ambient** object is one the environment hands your
code rather than one you created: the browser's `document`, an event, Node's
`process`. A **predicate** is a function that answers true or false about a
value. A **verified** predicate is one TJS has checked is pure: it only reads,
never changes anything and never throws. A **contract** is a predicate that
describes what an object must look like.

## The itch

Static types are pessimistic about ambient runtime environments (the DOM, Node
globals, `window`, host objects) in ways that create ceremony without safety.
The canonical example:

```ts
element.addEventListener('input', (e) => {
  const value = e.target.value // ❌ TS: Property 'value' does not exist on 'EventTarget'
})
```

In TypeScript, `e.target` is declared as a generic `EventTarget | null`, and
`EventTarget` has no `.value`, so the compiler rejects this until you assert the
type with `(e.target as HTMLInputElement).value` or narrow it with
`if (e.target instanceof HTMLInputElement)`. But the honest situation is: **at
runtime the value is either there or it isn't, and a one-line runtime check can
tell you which; the cast tells you nothing.** It silences a compiler that can't
see the real object. A runtime predicate is the truthful tool here, and it is
plain JavaScript, which is the point:

```tjs
// Pure and total: it only reads properties, and it never throws.
function hasValueTarget(e) {
  return e != null && e.target != null && typeof e.target.value === 'string'
}

// Event-shaped objects, like the ones a browser hands a listener.
const inputEvent = { type: 'input', target: { tagName: 'INPUT', value: 'hi' } }
const clickOnDiv = { type: 'click', target: { tagName: 'DIV' } }

console.log(hasValueTarget(inputEvent)) // true
console.log(hasValueTarget(clickOnDiv)) // false: a <div> has no value
console.log(hasValueTarget(null)) // false, not a crash

// The usage: no cast, and no crash when the value is missing.
const e = inputEvent
console.log(hasValueTarget(e) ? e.target.value : undefined) // hi
```

"Pure" means it changes nothing; "total" means it gives an answer for every
input. That predicate is exactly what the verifier accepts: `verifyPredicate`
(from `tjs-lang/lang`) reports it safe, because member access and `typeof` are
pure. It compiles to native JavaScript, and it is **serializable**: it is source
text, so it can be captured in one place and used in another (see the next
section).

Hand-writing a predicate for every host object you touch is tedious, and the
result drifts from what the browser really does. So the thought: could tooling
**probe a real ambient environment and derive the predicate contracts
automatically?**

## The payoff: author against an environment you're not running in

The headline use: **type-checking and autocompletion against a
non-ambient runtime — editing in a Node-based toolchain while _targeting_ the
browser** (or the reverse, or Electron, or a specific Bun). Normally you have no
target environment to introspect, so you fall back to a hand-maintained
`.d.ts` (`lib.dom`: TypeScript's hand-written description of the browser APIs)
that drifts from what the engine actually does.

Because a probed contract is a **serializable predicate**, it decouples _capture_
from _consumption_ in time and space: probe the real target once (locally or in
CI), bottle the contract, and a Node-side editor/typechecker consumes it with **no
target present**. It beats a `.d.ts` on three axes:

- **Grounded in reality, not a drifting spec** — it's what the target _actually_
  exposes. happy-dom, a simulated browser used for testing in Node, reported
  about 1 own key on an element's `style` where real Chrome reports 678 (see
  the real-browser findings below); a captured contract records the real one.
- **Target-specific and versioned** — capture from the _actual_ target (this
  browser, this Electron, this Bun), selectable/pinned, not a lowest-common-
  denominator lib.
- **The same artifact validates at runtime** — a `.d.ts` evaporates; a predicate
  contract can stay as a runtime check, and it can feed autocomplete:
  `suggest()` (from `tjs-lang/lang`) reads a predicate and lists the concrete
  values it accepts, so a check for `x === 'red' || x === 'blue'` yields the
  completions `red` and `blue`.

Why it's plausible _here_ and not a research project: TJS can already embed a
predicate inside a JSON Schema (the `$predicate` keyword, via `tjs-lang/schema`),
so the contract format exists. The playground's autocomplete already asks a live
object for its members; it could ask a captured contract instead. And a planned
feature, argument-type-driven completion (for example, knowing that
`createElement('input')` returns an input element), needs exactly this metadata,
taken from reality instead of written by hand.

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
  `introspection-bridge.ts`), and any automated real browser (a headless Chrome,
  say) can do the same against the real target. That's the "kick the tires"
  mechanism.
- **Predicates are the serializable contract form** — verified, compile to
  native, and travel as data (the `$predicate` keyword already embeds them in JSON
  Schema, evaluated by `tosijs-schema` via `tjs-lang/schema`). See the trust
  constraint below.
- **The AJS VM already models this as capabilities.** AJS, TJS's sister
  language, runs code in a sandbox (the VM) that gets outside powers such as
  `fetch` or a store only when the host passes them in explicitly. "The DOM as a
  capability, checked by a predicate where it is passed in" is the same pattern:
  a headless setting passes in a stub, and the predicate catches where it
  differs from the real thing.
- **"Types are examples" already.** In TJS, `function greet(name: 'Alice')`
  means "name is a string like `'Alice'`": the type comes from an example. A
  probed contract does the same, with the example taken from the real
  environment instead of written in the source.

## The honest constraints

- **Most of the DOM's contract is _behavioral_** (layout, events, mutation),
  which a pure predicate can't capture — only shape + pure invariants. So:
  - **Scope to the used surface.** Trace which ambient APIs the code actually
    touches (in the real iframe) and derive a contract for _that slice_, not all
    of `lib.dom.d.ts`.
  - **Behavioral conformance is a separate, impure harness** — run the same probe
    battery against the real env and a candidate stub, diff the outputs. The
    predicate is the pure shape-gate; the harness is the behavior-gate.
- **A contract is code, so trust matters.** TJS's `$predicate` paths run a
  predicate's source only if you have marked it trusted (registered with
  `trustPredicate`, or the `trustAllPredicates` option). Verification is a
  promise to the author about their own code, not a sandbox for hostile source.
  So share contracts only from probes you ran yourself; accepting untrusted
  ones would need predicates to run on the AJS VM, which is planned, not built.
- **Snapshots drift.** Browsers evolve; a captured contract is a dated snapshot.
  Fine — it's re-derivable, and versioning it is a feature (conformance over
  time).
- **Non-determinism / side effects** must stay outside predicates (the `effects`
  tag already enforces this): a predicate validates the _data_ crossing the
  boundary, never performs the effect.

## Shape of the tooling (sketch)

1. **Probe** — in a real environment (an automated real browser, or the
   introspection iframe), walk an ambient object / a program's used surface and
   record: property names + `typeof`, method names + `.length` (arity), and a few
   sampled input→output pairs for getters whose value depends only on the
   object.
2. **Derive** — turn the probe record into a predicate cluster (shape checks +
   `typeof` guards + membership sets), run it through `verifyPredicate` (so the
   emitted contract is itself certified safe), and `suggest()`-mine it for the
   enumerable leaves.
3. **Emit** — a `$predicate` schema (naive validators see structure, aware ones
   run the contract) + optionally a `.d.ts`-ish view for editors.
4. **Conform** — a harness that validates a stand-in (happy-dom, a hand stub, a
   VM capability) against the contract, failing loud where it diverges. This is
   what lets you test code that expects `HTMLElement` to exist from Node, where
   it doesn't.

## First spike — CSS + DOM (the convergence point)

Both parts of this spike were built; the results are under Findings below.

`element.style` (`CSSStyleDeclaration`) is the ideal first target: it's an
object the browser provides, its contents change as styles are set, and we
_already have a full CSS value grammar as predicates_ (`tjs-lang/css`). So the
loop is concrete and small:

- **`event.target` demo** — show the `hasValueTarget` predicate compiles, is
  verified pure, is total, and validates a real input event while rejecting a
  click on a `<div>`. The predicate TypeScript won't let you write cleanly is a
  perfectly ordinary verified predicate. (This needs no browser: synthetic
  event-shaped objects suffice for the unit; a real browser confirms on live
  events.)
- **`CSSStyleDeclaration` probe** — introspect real `element.style` in a browser,
  derive a shape contract, and diff a happy-dom `style` against it: where does the
  stub lie? Leaf _values_ ride the existing CSS predicates (`isColorValue`,
  `isDimension`, …), so this exercises probe → contract → conformance end-to-end
  while reusing the colour, dimension, shorthand and style-object validators
  `tjs-lang/css` already ships.

## Asking the browser directly: `CSS.supports`

`CSS.supports(property, value)` is a standard browser function that tells you
whether the browser accepts a CSS declaration. It is the strongest form of
"probe reality" for CSS: exact, always current with the engine's real support
(vendor prefixes, new features, the full `calc()`/`var()` grammar), and
zero-maintenance. It closes the gap the hand-written grammar has (checked
2026-11-06):

```javascript
import { isCssProperty } from 'tjs-lang/css'

isCssProperty('align-kontent') // true: it only checks the name looks like a property
CSS.supports('align-kontent', 'center') // false in a real browser
```

Property names for autocomplete come from the same place (a throwaway element's
`.style` keys / `CSSStyleDeclaration.prototype`). The tosijs 2.0 port reached
the same idea independently; its notes live in the `tosijs` repository.

This sharpens the contract-vs-fallback split by **when** validation runs:

- **Runtime, in a browser** → `CSS.supports` is ground truth (exact, free). A
  `CSS.supports`-based check is harmless to run, but it can't be _verified_: the
  verifier only certifies code whose behaviour it can see, and `CSS.supports` is
  a call into the browser it cannot inspect, so it counts as outside the
  verified world.
- **Transpile-time / SSR / Node** → no `CSS`, so the hand-authored grammar
  predicates (`isColor`/`isLength`/`isStyleValueFor`) are the portable fallback.

So the ideal CSS-value check (not built; `tjs-lang/css` has only the grammar
half) prefers `CSS.supports` when `typeof CSS !== 'undefined'`
and falls back to the grammar predicate otherwise — which is exactly the
probe-reality / portable-fallback pairing this whole note is about, one leaf down.
**Caveat (verified, and it's the same "the stand-in lies" finding): happy-dom
stubs `CSS.supports` to return `true` for everything** (even `width: banana`) — so
tests can't rely on it; ground truth needs a real browser or a real CSS engine.

## Findings from the first spike (2026-07-03)

Built in `experiments/ambient/` (`probe.ts` plus two demo tests, 7 tests, still
green on 2026-11-06). Nothing below has moved out of `experiments/` since:

- **The `event.target` predicate is ordinary.** `hasValueTarget(e)` (reads
  `e.target.value`, the thing TS rejects) verifies pure/safe, compiles native, and
  is total — no throw on a missing target. The cast TS demands buys nothing a
  predicate doesn't.
- **Host objects hide their surface on the prototype.** Probed a real
  `CSSStyleDeclaration` via happy-dom: `Object.keys(style)` is nearly empty, yet
  `typeof style.color === 'string'` and `typeof style.setProperty === 'function'`.
  So a naive own-enumerable probe derives an empty contract — **the probe must
  walk the prototype chain** (`getOwnPropertyNames` per proto) or check a scoped
  key list. `probeShape`, a helper in the spike (not part of the package), now
  does both.
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
  plus value-grammar (css) compose. The recursive style-object structure in
  `tjs-lang/css` is the same shape a DOM-derived contract would target.

Net: the probe→derive→verify→conform loop works end-to-end on a real host object;
the open work is sourcing the used-surface scope (trace) and the behavioral half.

### Real-browser findings (live Chrome, 2026-07-03)

Confirmed against a real browser (not happy-dom), by evaluating code in a live
Chrome tab. This sharpened three points:

- **Builtins don't honor `new`.** `new HTMLDivElement()` → `TypeError: Failed to
  construct 'HTMLDivElement': Illegal constructor`. You **don't need `new`** — the
  shape is on the constructor's `.prototype` chain
  (`HTMLDivElement → HTMLElement → Element → Node → EventTarget`), readable
  statically, no instance, no side effects. Cleaner than instantiating.
- **A factory tells you the type.** `document.createElement('div').constructor ===
  HTMLDivElement` (and `'a' → HTMLAnchorElement`, `'input' → HTMLInputElement`).
  So a factory's output gives you _both_ a live example (real default values — the
  "types are examples" leaf) _and_ the type identity (`.constructor` → name +
  `.constructor.prototype` → the surface). Two complementary probe sources that
  cross-check: the factory's result, and the class its `.constructor` names.
- **Structural contracts are realm-portable; `instanceof` is not — proved.** Each
  window or iframe gets its own copy of the built-in classes (its own "realm"),
  so an input created inside an iframe is an instance of the iframe's
  `HTMLInputElement`, not the parent page's. An `<iframe>`'s input: `instanceof HTMLInputElement` (top realm) = **false**, but
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
- Method behaviour: can a probe derive useful facts about what methods do (that
  calling one twice gives the same result, say, or the shape of what
  `getComputedStyle(el)` returns), or only their signatures?
- Editor story: a derived `$predicate` contract as the source of both validation
  _and_ autocomplete for host objects that ship no good `.d.ts`.

## For contributors

The spike is `experiments/ambient/`: `probe.ts` (`probeShape`,
`deriveShapeContract`), `event-target.demo.test.ts` and
`css-style-probe.demo.test.ts`. Related code: the predicate engine
(`src/lang/predicate.ts`), the autocomplete introspection bridge
(`demo/src/introspection-bridge.ts`, `editors/introspect-value.ts`; the
playground's `getMembers` hook), and the VM capability model (`src/vm/`).
