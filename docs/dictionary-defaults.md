# Dictionary Defaults (Merge-on-Partial Object Arguments)

**Status:** Spike A in progress (`experiments/dictionary-defaults/`)
**Feature class:** Language semantics + runtime — **a gated native-TJS mode**
**Characterization:** JS footgun pave

> Provenance: drafted 2026-07-17 (without the syntax docs at hand), revised
> 2026-07-18 against empirical findings from the codebase. Claims in the
> original draft that contradicted existing grammar or measured behavior have
> been corrected rather than argued with; the corrections are marked.

---

## 1. Problem statement

JavaScript default parameters are atomic: `(args = {x: 0, y: 0})` means
_default or payload, wholesale_. A partial payload `{x: 5}` silently discards
the default for `y`, yielding `y === undefined`. Nobody passing a partial
options object intends this.

The consequences in the wild:

- Every options-bag function hand-rolls a merge, and the hand-rolls are where
  bugs live:
  - `Object.assign(defaults, payload)` mutates the shared default object in
    place, corrupting all future calls.
  - Spread (`{...defaults, ...payload}`) merges one level only; nested
    defaults silently vanish.
  - `structuredClone(defaults)` per call is safe but pays full clone cost on
    every invocation, including complete payloads.
- The declaration side is equally painful: expressing "each property
  individually optional with its own default" in TypeScript requires a
  `Partial<T>` parameter type plus a separate defaults constant plus merge
  logic — three artifacts for one idea.

This is a pattern that is universally wanted, universally reimplemented, and
reliably botched. That is the definition of a pave target.

### The platform precedent

The DOM already has the correct semantics. Every options-bag Web API is a
WebIDL dictionary, and WebIDL dictionaries default _per member_:

- `addEventListener(type, fn, {once: true})` — `capture` and `passive` retain
  their defaults.
- `new IntersectionObserver(cb, {threshold: 0.5})` — `rootMargin` stays
  `'0px'`.
- `fetch(url, {method: 'POST'})` — every other `RequestInit` member keeps its
  default.

JS developers already have merge-semantics intuition drilled in by the entire
platform API surface. Only _userland_ functions exhibit atomic
default-or-nothing, because JS function defaults cannot express what WebIDL
dictionaries do. **The JS behavior is the anomaly. tjs adopts the platform's
model.**

---

## 2. What current tjs actually does (measured 2026-07-18)

The original draft assumed partial payloads "in current tjs produce type
errors." **Measured, they do not** — and the finding reshapes both the framing
and the implementation plan:

```js
// = form
function place(args = { x: 0, y: 0 }) {
  return args
}
place({ x: 5 }) // → {x: 5}         (y === undefined — plain JS semantics)
place() // → {x: 0, y: 0}   (JS evaluates the literal per call)

// colon form (required param, example)
function placeB(args: { x: 0, y: 0 }) {
  return args
}
placeB({ x: 5 }) // → {x: 5}         (no missing-member error)
placeB({ x: 's', y: 1 }) // → passes through (no member type check!)
placeB({ x: 5, y: 1, z: 9 }) // → passes through (no excess-key handling)
placeB(5) // → MonadicError    (the ONLY check that fires)
```

The emitted validation for an object param is, in its entirety,
`typeof args !== 'object' || args === null || Array.isArray(args)`. The full
member shape **is** emitted into `fn.__tjs.params` metadata
(`kind: 'object', shape: {…}`) — the check just never consumes it.

Two consequences:

1. **This feature is a semantics change to valid native-TJS programs**, not an
   occupation of free space. Partial payloads work today, with JS semantics.
   That is fine — it is exactly what native-TJS modes are _for_ (`TjsEquals`
   changed `==` itself; `TjsDate` bans `new Date()`) — but it must be framed
   and gated as a mode (§3).
2. **Member-level object validation must be built regardless** (Stage 0). The
   merge is a phase of a validator that does not yet validate members. Bonus:
   as of 0.10.1, the inline `Type(...).check()` stub IS strict-structural
   (fixed under #21-adjacent work), so `Type` checks and param checks of the
   same shape currently disagree — Stage 0 resolves that inconsistency.

---

## 3. Mode gating (the missing section, now load-bearing)

Dictionary defaults are a **native-TJS mode** (working name: `TjsDictDefaults`),
ON by default in native `.tjs` (like `TjsEquals` etc.), OFF under
`dialect: 'js'` and for `fromTS`-originated code, and disabled by `TjsCompat`.

This is required by PRINCIPLES.md: `dialect: 'js'` must preserve plain-JS
semantics, and merge-on-partial observably changes them (`y === undefined` →
`y === 0`). The subset invariant is satisfied the same way `==` satisfies it —
choosing `.tjs` is the opt-in.

The §6.1 purity restriction (compile error on impure default literals) is
likewise native-mode-only; `TjsDate` banning `new Date()` is the precedent for
a mode making a JS-legal construct a compile error.

---

## 4. Design principles

1. **No new syntax.** The existing declaration `(args = {x: 0, y: 0})` already
   contains the shape, the types, and the defaults. The feature changes what
   the runtime does with it, not how it is written.
2. **A mode, honestly labeled.** Changes the meaning of partial-payload calls
   in native tjs only (§3). Ship with a CHANGELOG "Changed" entry, not buried
   in "Added".
3. **Defaults are data, not effects.** Default objects are restricted to
   structurally clonable literals (§6.1). This is what makes hoisting sound.
4. **Zero cost on the happy path.** A complete payload passes through
   untouched: validation scan only, no allocation, no clone.
5. **The default object is inviolate.** Neither the runtime nor user code can
   corrupt it. Dev builds enforce this mechanically (§7.2).

---

## 5. Semantics

### 5.1 Member states

| State         | Declaration                                 | Absent key             | Present key                  |
| ------------- | ------------------------------------------- | ---------------------- | ---------------------------- |
| **Defaulted** | `x: 0`                                      | Filled with default    | Type-checked against example |
| **Required**  | _(marker TBD — OQ1; spike uses a wrapper)_  | **Runtime type error** | Type-checked                 |

> The draft had a third "Unchecked" state marked `x!`. **Dropped:** `!` does
> not parse inside object literals (verified), and it is the param/access
> safety marker, not a member marker. If an unchecked-member state proves
> necessary it needs its own grammar argument; it is not carried by default.

### 5.2 Trigger condition

A member's default fires **only when the key is absent** from the payload.

- **Absent key** → fill with default.
- **Present, `undefined`** → treated as absent (fills). Matches both JS
  default-parameter and WebIDL dictionary behavior; JSON payloads cannot
  express `undefined` anyway.
- **Present, `null`** → real value. Type-checked: passes iff the member type
  admits null. In types-by-example terms the natural rule (adopted by Spike A,
  confirm at Stage 1): **a member admits null iff its default example is
  `null`**. Never silently replaced — replacement would mask caller bugs.

### 5.3 Recursion

Nested object literals in the default merge recursively, per-key, per-level:

```js
const place = (args = { pos: { x: 0, y: 0 }, label: '' }) => {}
place({ pos: { x: 5 } })
// → {pos: {x: 5, y: 0}, label: ''}
```

**Arrays are values, not merge targets.** A payload array replaces the default
array wholesale (element types still checked against the example element, per
existing inference convention). Index-wise merging is explicitly rejected.

### 5.4 Excess keys

Keys present in the payload but absent from the default literal. The draft
proposed "error in dev, strip in prod"; **revised recommendation** (pending
Spike A evidence, OQ2): no dev/prod behavior split — this repo deliberately
avoids behavior matrices. Instead:

- **Strip always** (merged result has exactly the declared shape;
  `additionalProperties: false` is already tjs's emitted-schema posture, and
  `Type().strip()` is precedent), **and**
- **record a flight-recorder notice, once per site** (`source: 'type'`,
  `severity: 'notice'`) — the recorder's documented job is exactly this class
  of "not an error, but you'll want it after the fact", **and**
- **transpile-time lint error when the call-site payload is an object
  literal** — catches the classic `{treshold: 0.5}` typo statically, where it
  is actually detectable.

### 5.5 Top-level absence

Calling with no argument: the function receives a **fresh clone** of the full
default. (JS already produces a fresh object per no-arg call — the literal is
evaluated per call — so hoist-plus-clone is observably identical. Verified.)

### 5.6 Prototype safety

Only own enumerable string keys participate. `__proto__`, `constructor`, and
`prototype` in a payload are rejected outright — reusing the existing
`FORBIDDEN_PROPERTIES` set (`src/vm/runtime.ts`), not a new list. Merge is
exactly where prototype pollution lives; this closes the class cheaply.

---

## 6. Restrictions

### 6.1 Default expressions must be pure literals

The default must be an object literal composed of structurally clonable
literals: primitives, object literals, array literals. Compile-time error
otherwise (function calls, identifiers referencing live objects, `new`,
`Date.now()`, getters/setters, computed keys). Native-mode-only (§3).

Rationale: JS evaluates default expressions per call; tjs hoists them (§7.1).
For pure literals the two are observationally identical; for effectful
expressions they diverge silently. The restriction closes the divergence at
compile time.

_(Escape valve if per-call computed defaults prove necessary: an explicit
thunk form. Out of scope for v1.)_

---

## 7. Runtime design

### 7.1 Hoisted template + shape descriptor

At transpile time, each qualifying default literal is hoisted to a
module-level **template** (evaluated once — sound because §6.1 guarantees
purity) plus a compact **shape descriptor** (member names, states, types,
nested descriptors). **The descriptor largely exists already**: it is the
`fn.__tjs.params[…].type` metadata the emitter produces today — Stage 0's job
is making the emitted check consume it.

### 7.2 Template integrity

Dev builds: template deep-frozen at creation — any attempted write throws at
the write site instead of corrupting call N+1. Production: freeze elided;
§7.4's invariants and §7.3 guarantee the runtime never writes it and user code
never receives it.

### 7.3 No-arg calls clone

A no-payload call receives a **structural clone of the template**, never the
template itself — otherwise a function mutating its own args poisons every
future call (the exact bug this paves, reintroduced through the back door).

### 7.4 Check-then-fill

Per call with a payload:

1. **Scan** payload against the descriptor: validate present members' types,
   note absent defaulted members, error on absent required members, apply the
   excess-key policy. Recurse into nested dictionaries.
2. **Complete payload** → return the payload as-is. Zero allocation. This is
   the hot path and must stay a pure read-only scan.
3. **Members absent** → build ONE fresh output object: present members from
   the payload, absent members cloned from the template (never aliasing
   mutable template substructure into the result).

Invariants (encoded as tests in Spike A):

- **I1:** Runtime never writes into the template or the caller's payload.
- **I2:** No output object aliases a mutable substructure of the template.
- **I3:** Complete payload ⇒ no allocation (payload returned by reference).

### 7.5 Failure mode

All violations (missing required, null-where-not-nullable, member type
mismatch, excess key under a strict policy) surface through the existing
runtime type-error channel (`__tjs.typeError` → `MonadicError`) with a path
(`args.pos.y`). No new error machinery.

---

## 8. Interactions

- **Signature-test defaults merge.** `js-tests.ts` already contains a
  _shallow_ defaults-merge for return examples (`__defaults` +
  `Object.assign`). It must be subsumed by (or reconciled with) this
  machinery, or it becomes another divergent copy — the disease #20/#21 just
  spent a week killing.
- **`.d.ts` emission.** `generateDTS` must emit **deep-partial** caller-facing
  parameter types for dictionary-default params while the body-facing type
  stays complete. (Draft gap, now tracked.)
- **Implicit test generation.** Defaults are ready-made fixtures: no-arg call,
  complete-payload call, one-member-absent per defaulted member,
  absent-required (expect error), null-injection per member. The descriptor
  drives generation directly.
- **JSON Schema.** The descriptor maps onto schema `default` / `required`
  keywords; declared defaults surface in emitted schemas. The literal remains
  the single source of truth.
- **WASM blocks.** Merged args crossing into inline WASM are guaranteed
  complete — no `undefined` members to trap on.
- **tosijs consumption.** Options-bag-heavy tosijs/tosijs-3d APIs are the
  first-order beneficiary; migration is deleting merge boilerplate.

---

## 9. Open questions

1. **Required marker (OQ1).** `!` is unavailable (does not parse in literals).
   Spike A represents required-ness via a transpiler-recognizable wrapper —
   `required(example)` — which costs nothing to recognize statically since the
   transpiler already evaluates the literal for the §6.1 purity check. Whether
   that wrapper (or another spelling) becomes the grammar is a Stage 1
   decision. **Blocking for Stage 1, not for the spikes.**
2. **Excess-key policy (OQ2).** §5.4 carries the recommendation
   (strip + record + literal-call-site lint); Spike A implements all three
   candidate policies behind a switch to generate comparative evidence.
3. **Null admission (OQ3).** §5.2 adopts "example is null ⇒ admits null" for
   the spike; confirm against real tosijs option shapes at Stage 4.
4. **Non-dictionary defaults (OQ4).** `(x = 0)`, `(list = [])` keep unchanged
   JS semantics — the feature triggers only on object-literal defaults.
   Encoded in Spike A.

---

## 10. Implementation plan

Spike-first; each stage lands independently.

- **Spike A — semantics harness** (`experiments/dictionary-defaults/`,
  no transpiler changes). Standalone `merge(descriptor, template, payload)` +
  exhaustive table-driven suite encoding §5 in full: absence/undefined/null
  matrix, recursion, arrays-as-values, excess keys under each candidate
  policy, prototype-pollution attempts, invariants I1–I3, and the js-dialect
  gate (JS semantics preserved when the mode is off). The suite is the spec's
  executable form and survives into the final implementation.
- **Spike B — perf validation.** Check-then-fill benchmarked **against a
  canonical CORRECT implementation** — the careful hand-written per-shape
  merge (`{...D, ...p, pos: {...D.pos, ...p.pos}}`) and a correct generic
  recursive merge — on realistic tosijs-3d option shapes: complete payload
  (must be ≈ validation-only, zero output allocation), one-absent, no-arg.
  The broken idioms (shallow spread, mutating assign) may appear as reference
  rows only, clearly labeled incorrect: **benchmarking against code that
  doesn't do the job is meaningless** — a baseline must produce the same
  result to be a baseline. `structuredClone`-then-fill is the safe-but-slow
  correct variant and stays in the comparison.

  Per direction, the benchmark reports a **three-tier cost story** (now also a
  shared practice — `tosijs-coding-practices/practices/performance.md`,
  "Benchmarking a footgun-pave"): tier 1 = the status-quo footguns, timed but
  labeled incorrect with their breakage demonstrated by test (shallow spread
  loses nested defaults; mutating assign corrupts the shared defaults object);
  tier 2 = the clean correct hand-roll (the honest bar); tier 3 = the feature.
  **The sentence the numbers support: dictionary defaults cost ~531 ns/op vs
  the footguns' ~85 and the careful hand-roll's ~276 — and buy member
  validation, merged nested defaults, and incorruptible shared defaults.**

  **Results (2026-07-18, M1 Pro, bun 1.3.14, 8-member/3-nested shape, 200k
  iterations):** the descriptor-driven walker WITH full member validation runs
  ~543 ns/op on a complete payload vs ~284 for the canonical per-shape spread
  (which validates nothing) and ~1990 for structuredClone-then-fill; no-arg
  clone beats `structuredClone` 7× (241 vs 1773); I3 holds (complete payload
  returned by identity — zero output allocation). **Design conclusion:** the
  ~2× premium over hand-written merge is the price of the generic walk, not of
  validation per se — so Stage 1 should emit **shape-specialized
  merge+validate code** per signature (exact precedent:
  `generateTypeCheckExpr` already emits per-shape validation), with the
  descriptor-driven walker as the generic/runtime fallback. Two bonus
  findings from the agreement check the directive forced: all correct
  implementations must agree before timing — and making them agree exposed a
  real semantics hole (payload keys named after `Object.prototype` members,
  e.g. `toString`, matched the descriptor's prototype chain via `in` and
  dodged both validation and the excess policy; fixed with null-prototype
  descriptor maps + a regression test).
- **Stage 0 — member-level param validation** (prerequisite, valuable alone).
  Make the emitted check consume the already-emitted shape descriptor:
  member types, requiredness. Fixes the current `Type.check` ↔ param-check
  inconsistency. Mode-gated where it changes acceptance.
- **Stage 1 — transpiler.** Purity check (§6.1) with compile errors; template
  hoisting; descriptor emission; dev-build deep-freeze; required-marker
  grammar per resolved OQ1; the excess-key literal-call-site lint.
- **Stage 2 — runtime integration.** Wire the Spike A merge into the
  validation pass as a phase. Subsume the js-tests shallow defaults-merge.
- **Stage 3 — test generation + dts.** Descriptor-driven fixtures; deep-partial
  `.d.ts` emission.
- **Stage 4 — dogfood.** Convert tosijs-3d options-heavy entry points; delete
  their hand-rolled merges; diff under existing suites.

Out of scope for v1: computed/thunked defaults, call-site default overrides,
array merge strategies (rejected, not deferred).
