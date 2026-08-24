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

## `asCompared` — the missing half of a type

**Status:** designed, not built. Targeted as a patch after 0.13.3 — it is additive and
non-breaking, so it need not wait for 0.14.

### The gap

A type today answers one question: **membership** — does `v` satisfy `T`? That is what
`predicate` is. It cannot answer the other one: **equivalence** — are `a` and `b` the same,
*as T*?

Tonio's framing, which states it better than anything else here:

> a number is a number for comparison, but `-1` is not a positive integer

Those are independent. `-1` failing `Positive` is membership. `1` and `1.0` being the same
number is equivalence. A type that can only answer the first is half a type.

### The hook that exists, and why it cannot close the gap

`goIs` dispatches to `[Symbol.for('tjs.equals')]` or `.Equals` — a method **bound to the
value**, Java-style. Three things follow, and each is fatal on its own:

1. **Primitives cannot participate.** `customEquals` returns `null` for anything where
   `typeof x !== 'object'`. There is no way to say "compare these floats with tolerance".
2. **You must own the class.** Making a Firestore `Timestamp` compare as a timestamp would
   mean monkey-patching a prototype you do not own — prototype pollution, which this
   codebase treats as a security boundary (`FORBIDDEN_KEYS`).
3. **Equivalence is type-relative, so it cannot live on the value.** `1.0000001` and `1.0`
   are equal as `Approximate`, distinct as `Float`. Only the *comparator* knows which
   question is being asked. The current design put the answer in the wrong place.

### The language already does this — for three types, hardcoded

```ts
if (v instanceof String)  return String.prototype.valueOf.call(v)
if (v instanceof Number)  return Number.prototype.valueOf.call(v)
if (v instanceof Boolean) return Boolean.prototype.valueOf.call(v)
```

`unwrapBoxed` **is** a comparator registry with exactly three entries. It is precisely
"compare this object as something else" — a `String` instance normalised to a string before
comparison. The semantics were decided and shipped; what was never shipped is a way to add
a fourth entry.

`asCompared` generalises those three hardcoded cases into an open registry. They become its
base cases rather than a special rule.

### A projection, not a comparison

```ts
extend Timestamp {
  asCompared() { return this.seconds * 1000 + this.nanoseconds / 1e6 }
}
```

The name is deliberate: it says what the value **is, for comparison** — not how to compare
it. That distinction carries real weight:

- **It composes.** A deep walk normalises each node before comparing, exactly as
  `unwrapBoxed` already does. A `Timestamp` nested three levels inside an object just works.
  An `Equals(other)` predicate only fires where something remembers to dispatch it.
- **It generalises past equality.** Once a value can say what it is for comparison, ordering
  and range checks follow from the same hook. `Equals` could never give that.

### It is consumed by `Eq`, `Is` AND `toBool`

This is the part that makes it more than an equality feature, and it answers the question
that prompted the design — *why don't `Eq` and `toBool` use the computed comparator?* Because
there isn't one, and both need it.

`toBool` is `Boolean(unwrapBoxed(v))`. An errored service result is an object, objects are
truthy, so `if (result)` takes the **success** branch and the type cannot say otherwise:

```
toBool({ ok: false, error: 'timeout' })   ->  true
```

With `asCompared → false`, `if (result)` is correct. The same applies to any library's own
boolean wrapper, which `unwrapBoxed` cannot see because it only knows `Boolean`.

### Return type: a primitive, or nothing

**Allowed: `number`, `string`, `boolean`, `null`, `undefined`.**

| | why |
| --- | --- |
| `number` | ordering falls out free (`<`, `>`, sorting) |
| `string` | identity and normalisation — `URL → href`, case-insensitive keys; and it is what the existing `String` entry already returns |
| `boolean` | feeds `toBool`; errored results and foreign boolean wrappers |
| `null` / `undefined` | `Option`/`Maybe` — `None` projects to `null`, and `Eq` already treats the two as equal |

**Rejected:**

- **`bigint`** — the only case was nanosecond-exact timestamp equality. Almost nobody needs
  that precision, and anyone who does would not reach for `==`. Excluding it also removes a
  genuine trap: `1n === 1` is `false`, so two modules projecting the same type to `bigint`
  and to `number` would silently compare unequal. (For the record, the precision is real:
  a nanosecond epoch value overflows `MAX_SAFE_INTEGER` by ~198×, leaving a 128ns
  resolution. The judgement is that nobody is doing that with `==`.)
- **`symbol`** — no case that an object reference does not serve.
- **object references** — "compare as another object" defers the question rather than
  answering it.

The rule is simpler than the list: **project to a primitive, or to nothing.** Which is
exactly what `unwrapBoxed` already does.

Participation is signalled by whether the type **declares** `asCompared`, not by what it
returns — otherwise `null`/`undefined` would be ambiguous with declining.

### Resolved: a registry CHAIN, rooted at the host

The scoping question is settled, and the answer reframes what `asCompared` is.

**The registry chain is TJS's view of the type environment.**

```
module registry      ← `extend` lands here; local, does not leak
       ↑ inherits
globalThis.__tjs     ← the shared view, one of them, installed before anything runs
       ↑ inherits
host built-ins       ← String / Number / Boolean base entries
```

Lookup walks up; writes land locally. A module can say "a Firestore `Timestamp` compares as
millis" without any other module seeing it, while everyone inherits the shared view of
`String`.

The emitted preamble already encodes exactly this link:

```js
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { …inline stubs }
```

**Why the chain is only two levels deep — and must be.** A module's parent is `globalThis`,
not its importer. Modules form a flat GRAPH, not a tree: at runtime nothing knows who
imported it, and a module imported by two others would have two candidate parents. Which one
it got would then depend on **evaluation order** — the same module producing different
comparison semantics depending on who won the import race. `Is(a, b)` answering differently
by load order is about the worst property a comparator can have: nondeterministic, invisible
and unreproducible.

So lexical inheritance is not merely hard here, it is incoherent. The flat module graph
forces the flat chain, and each layer's determinism is then trivially statable: a module's
own extends are its own, the global layer is whatever was installed before anything ran, and
the base is fixed.

**What this makes true, that the earlier framing missed:**

- **`unwrapBoxed` is not a special case — it IS the root layer.** Its three entries are the
  host built-ins' comparison projections. "A `String` instance compares as a string" is
  TJS's view of a host type, which is precisely what the root is for. This feature does not
  *generalise* three hardcoded cases; those cases were always registry contents that had
  nowhere to be stored.
- **The inline-runtime blocker dissolves.** A standalone emitted file does not need a full
  registry — it needs its own local table plus the fixed base entries, which an inline stub
  can carry. With no shared runtime the chain degrades to module → base and still works.
- **It is the same layer as `docs/ambient-contracts.md`.** That document is about the DOM
  being pessimistically typed (`e.target.value` failing because `EventTarget` does not
  declare `value`) and proposes deriving contracts for ambient types. Membership contracts
  and comparison projections are two kinds of entry in ONE table, not two mechanisms.
- **It answers "local, or it is prototype pollution by another name."** A single flat global
  table that every module writes to and every module reads from would be exactly that. The
  chain gives sharing without leaking.

### Prerequisite: `extend`'s runtime half is dead code

**This must be fixed first, and it is not a parallel task.** Measured at 0.13.3:

| receiver | emitted | works? |
| --- | --- | --- |
| literal — `'hello'.cap()` | `__ext_String.cap.call('hello')` | yes |
| annotated param — `s: ''` | `s.cap()` | **no** — `s.cap is not a function` |
| untyped param | `s.cap()` | **no** |

Only a LITERAL receiver is rewritten. Even a parameter the transpiler knows is a string
emits an unrewritten call, which needs `String.prototype.cap` — deliberately absent.

The registry is **write-only**: emitted code calls `registerExtension`, and the emitter never
emits a `resolveExtension` call anywhere. Entries go in; nothing looks them up.
`CLAUDE-TJS-SYNTAX.md:656` claims "Runtime fallback via
`registerExtension()`/`resolveExtension()` for unknown types" — the resolver exists, is
exported, walks prototype chains correctly, and is never called.

So `extend` is currently local by ACCIDENT rather than design: local because the only working
mechanism is a lexical rewrite, and the mechanism that would make it non-local is unreachable.
Wiring the resolver without deciding the chain first would turn it into the flat global table
described above — the prototype pollution the feature exists to avoid.

`asCompared` cannot ride on `extend` until that half works, and fixing it is where the chain
model actually gets built.

### Still open

- **Declaration site.** `extend Timestamp { asCompared() { … } }` reuses the mechanism and
  needs no new syntax; a slot on `Type` serializes into the `$predicate` story and travels
  to the portable predicate VM. The chain model works for either.
- **Whose registry answers `Is(a, b)`** when the call is in module A and the value came from
  module B. The caller's, under this model — *you* choose how to compare, which is what
  "as compared" says. The alternative (the value's defining module) is defensible and
  disagrees, so it should be stated rather than left implicit.

### Implementation notes

- Probe fail-soft, invoke strictly — the discipline `goIs` already documents. Asking a Proxy
  whether it declares `asCompared` runs a trap that can throw, and a hostile object must not
  throw out of `==`. A declared hook that throws is the author's own bug and should surface.
- Five copies of the comparator exist by design (bundle isolation): `runtime.ts`,
  `tests.ts`'s `expectFunction`, `js-tests.ts`'s `__deepEqual`/`formatValue`, and the
  emitted inline `Is`. **All five move together or they drift.**
- The hot path must stay allocation-free. `Eq` is ~29ns; a lookup on every comparison is the
  main risk to watch.

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
