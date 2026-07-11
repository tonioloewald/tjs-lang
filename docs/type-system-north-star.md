# North star: JSON-Schema + predicates as the single source of truth for types

> **Status: strategic direction (2026-07-06, user-set). Possibly post-1.0. Use as
> a decision lens NOW.** Related: `$predicate` keyword
> (`src/lang/predicate-schema.ts`), `createPredicateEvaluator`, the `tjs-lang/css`
> library, `docs/ambient-contracts.md`, PRINCIPLES.md.

## The principle

**A TJS type is, canonically, a JSON-Schema node — optionally carrying a
`$predicate` (a verified-pure predicate cluster) for the computational part that
plain JSON-Schema can't express.** Everything else — examples-as-types (`x: 0`),
TS-derived types, `Type`/`Generic` declarations, `TypeDescriptor` — is **surface
syntax or an internal projection** of that one canonical form, not a competing
source of truth.

- **Structure** (shape, required keys, enums, ranges, nesting) → JSON-Schema
  keywords, which any validator understands.
- **Computation** (open value grammars, cross-field invariants, recursive
  grammars — the things TS/JSON-Schema cave to `string`/`any` on) → `$predicate`,
  which a predicate-aware validator runs.

Together they express the full range of what TJS types mean, in a **standard,
serializable, inspectable, cross-language** form.

## The decision lens

For any architecture or implementation choice, ask:

> **Does this move types toward — or away from — being fully expressible as
> JSON-Schema + `$predicate`?**

Concretely, *toward* looks like:

- New type capabilities are added by (a) a JSON-Schema keyword, or (b) a
  predicate — never a bespoke `TypeDescriptor` field that can't round-trip to
  JSON-Schema + `$predicate`.
- `TypeDescriptor` is treated as a **lossless projection** of the canonical form
  (a convenient in-memory shape), not a superset. If something can live in
  `TypeDescriptor` but not in JSON-Schema + `$predicate`, that's a smell.
- `.d.ts` emission, runtime validation, inference, and autocomplete all **derive
  from** the canonical form rather than from a parallel representation.
- The predicate subset stays **small and portable** (see below) so `$predicate`
  can run anywhere — expanding it is a cost, not a free win.

*Away* looks like: a TJS-only internal type IR that accretes features JSON-Schema
+ `$predicate` can't carry; validation logic that only the JS runtime can do;
predicate features that need a full JS engine.

## Why this is the right endgame

- **Types as data.** JSON-Schema + `$predicate` is just JSON — it travels, it's
  inspectable, it's diffable, it survives a network hop or a file. Types stop
  being a compile-time-only artifact.
- **Cross-language by construction.** Any language with a JSON-Schema validator
  gets TJS *structure* for free; add a small predicate VM (below) and it gets the
  *computational* half too. TJS types become a contract multiple runtimes share.
- **Standard, not bespoke.** We ride the JSON-Schema ecosystem (tooling, docs,
  editors) instead of reinventing it, and add exactly the one thing it lacks.
- **It's already real.** `tjs-lang/css` is a working JSON-Schema + `$predicate`
  artifact; `tosijs-schema` (via `createPredicateEvaluator`) already runs it;
  `cssStyleSchema()` produces exactly this shape. The endgame exists in miniature.

## The priority that unlocks it: a small, portable predicate VM

For "types across language boundaries" to be real, `$predicate` must **run
anywhere**, not just in JS. The priority is a **reference implementation of a tiny,
portable VM that safely evaluates the predicate subset** — ideally smaller than a
JS runtime, implementable in a few hundred lines in any language.

It's tractable precisely because the predicate subset is deliberately minimal
(the verifier enforces it): pure, synchronous, **no loops** (recursion + array
methods only), fuel-bounded, no IO, a whitelist of pure operations (member access,
comparisons, `&&`/`||`/ternary, `typeof`, a fixed set of string/array/Math/regex
methods). That's a small tree-walking interpreter — no closures-over-mutable-state,
no async, no allocation surprises, no host access.

**Key architectural implication — carry the AST, not (only) the source.** Today
`$predicate` is predicate *source* (JS/AJS text). A portable VM in Rust/Go/Python
shouldn't have to embed a JS parser. So the canonical portable form of a predicate
should be its **serialized AST** (JSON) — which is the original AJS thesis ("code
travels as data") applied here. Source stays the authoring form; the serialized
AST is the wire/exec form the small VM walks. A `$predicate` could carry either,
with the AST as the portable default.

## Open questions

- **`TypeDescriptor`'s fate:** keep it as a cached projection of JSON-Schema +
  `$predicate`, or eventually retire it? At minimum, guard that it can't express
  what the canonical form can't.
- **The predicate ISA:** pin down the exact minimal node set + operation whitelist
  the reference VM must support (a spec), and a **conformance suite** every port
  runs — so "TJS types" means the same thing in every language.
- **AST format:** settle the serialized predicate AST schema (it should itself be
  describable — turtles: the AST format as a JSON-Schema).
- **Fuel across languages:** the fuel model must be spec'd (per-node cost) so a
  runaway predicate is bounded identically everywhere.
- **Structure/predicate split:** conventions for what belongs in JSON-Schema
  keywords vs `$predicate` (prefer standard keywords; reach for `$predicate` only
  for the genuinely computational).
