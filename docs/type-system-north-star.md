<!--{"parent": "the-tjs-language.md", "order": 8}-->
<!-- TODO review -->

# North star: JSON-Schema + predicates as the single source of truth for types

> **Status: strategic direction (2026-07-06, set by the language's author, Tonio Loewald).
> Possibly post-1.0. Use as a decision lens NOW.** Related: `$predicate` keyword
> (`src/lang/predicate-schema.ts`), `createPredicateEvaluator`, the `tjs-lang/css`
> library, `docs/ambient-contracts.md`, PRINCIPLES.md.

This is a design note about where TJS types are heading. You do not need it to write TJS.
Read it if you want to know why types behave as they do, or if you are changing how they
work. Dated decisions below are the author's.

Each section below carries its own status, because this note mixes three kinds of material:

| status | meaning | sections |
| --- | --- | --- |
| **direction** | the goal and the lens; nothing here is a promise about a release | the principle, the decision lens, why, the portable predicate VM, Predicate as data |
| **shipped** | built and released; the section records why it is shaped as it is | `asCompared`, the registry chain, `Predicate` as the umbrella |
| **open** | undecided; listed so the question is stated rather than assumed | each "Still open" list, and the open questions at the end |

The lens is the first two sections. The rest is the design record for the pieces of it that
have been built.

## The principle

_Status: direction._

**A TJS type is, canonically, a JSON-Schema node — optionally carrying a
`$predicate` (a verified-pure predicate cluster) for the computational part that
plain JSON-Schema can't express.** Everything else — examples-as-types (`x: 0`),
TS-derived types, `Type`/`Generic` declarations, `TypeDescriptor` — is **surface
syntax or an internal projection** of that one canonical form, not a competing
source of truth.

The terms: **JSON Schema** is a standard JSON format that describes the shape of data. A
**predicate** is a function that answers yes or no about a value. **Verified-pure** means a
verifier has checked it has no side effects; a **cluster** is a set of predicates that call
each other. **`TypeDescriptor`** is TJS's internal in-memory type record.

Two real outputs show the two halves. `Type('user', { name: '', age: 0 }).toJSONSchema()` is
plain structure; `cssColorSchema()` from `tjs-lang/css` adds a `$predicate`, because "is this a
CSS colour" is not something structure can say:

```text
{ "type": "object",
  "properties": { "name": { "type": "string" }, "age": { "type": "integer" } },
  "required": ["name", "age"], "additionalProperties": true }

{ "type": "string", "title": "CSSColor", "$predicate": "var CSS_NAMED_COLORS = [ … ] …" }
```

- **Structure** (shape, required keys, enums, ranges, nesting) → JSON-Schema
  keywords, which any validator understands.
- **Computation** → `$predicate`, which a predicate-aware validator runs. This is the part
  TypeScript and plain JSON Schema can only call `string` or `any`: open value grammars (a
  CSS colour), cross-field invariants (an end date after its start date), and recursive
  grammars (nested expressions).

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
- The subset of JavaScript that predicates may use stays **small and portable** (see
  below) so `$predicate`
  can run anywhere — expanding it is a cost, not a free win.

*Away* looks like: a TJS-only internal type IR that accretes features that JSON-Schema
plus `$predicate` can't carry; validation logic that only the JS runtime can do;
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

_Status: direction, not built._

For "types across language boundaries" to be real, `$predicate` must **run
anywhere**, not just in JS. The priority is a **reference implementation of a tiny,
portable VM that safely evaluates the predicate subset** — ideally smaller than a
JS runtime, implementable in a few hundred lines in any language.

It's tractable precisely because the predicate subset is deliberately minimal
(the verifier enforces it): pure, synchronous, **no loops** (recursion + array
methods only), fuel-bounded (fuel is a work budget that stops a runaway computation), no
IO, a whitelist of pure operations (member access, comparisons, `&&`/`||`/ternary, `typeof`,
a fixed set of string/array/Math/regex methods). Regex is on that list today and is planned
to be replaced by Pattern (next section but one). That's a small tree-walking interpreter — no closures-over-mutable-state,
no async, no allocation surprises, no host access.

**Key architectural implication — carry the AST, not (only) the source.** Today
`$predicate` is predicate *source* (JS/AJS text). A portable VM in Rust/Go/Python
shouldn't have to embed a JS parser. So the canonical portable form of a predicate
should be its **serialized AST** (JSON) — the idea behind AJS, TJS's sandboxed agent
language, which compiles to a JSON syntax tree so that code can travel as data. Source stays the authoring form; the serialized
AST is the wire/exec form the small VM walks. A `$predicate` could carry either,
with the AST as the portable default.

## Predicate as DATA — Pattern's sibling (2026-10-04)

_Status: decided direction, not built. `docs/pattern.md` is itself a proposal, so `$pattern`
below is a planned keyword, not one that exists today._

Pattern (`docs/pattern.md`) is the planned replacement for regex: a grammar built as data and
run by TJS's own engine, which charges fuel for its work ("metered"), never by JavaScript's
`RegExp`. That decision argues for the same shape here: **`Predicate` becomes the
first-class, serializable, safely executable representation of a predicate.**

- **The serialized form is what executes, not a by-product.** Today a `$predicate` carries
  SOURCE, which compiles to native JS. Verification checks that well-meaning code is pure; it
  cannot make hostile code safe, because native JavaScript has routes no syntactic check
  closes. So the `$predicate` paths run only source the host has registered with
  `trustPredicate`, and refuse the rest: "verified" is a promise to an author, not a sandbox.
  A Predicate as data (the predicate-subset AST, the same AST family as AJS) runs on the
  metered engine, so an UNTRUSTED predicate is safe to evaluate. Running untrusted predicates
  is planned; this makes it structural.
- **One engine.** It runs on the AJS VM, so on the Rust/wasm VM once that ships
  (`docs/ajs-native-vm.md`). That is the "small portable predicate VM" above, and it does not
  have to be a separate VM.
- **It composes with Pattern.** A string predicate's matching is a Pattern (data), never a regex
  literal, so a serialized Predicate gives untrusted input no way to reach JavaScript's regex
  engine.
- **Same delivery as Pattern:** a fluent builder and the TJS/AJS source forms author it; `toJSON`
  and `fromJSON` round-trip exactly; JSON Schema carries it as `$predicate`, alongside
  `$pattern`.
- **Home: tjs-lang (2026-10-04).** AJS is the runtime that executes it, so Predicate lives
  with the VM rather than in tosijs-schema; tosijs-schema keeps its `$predicate` evaluator slot
  (`setPredicateEvaluator`), which tjs-lang fills. (Pattern is different: it has users that are
  not schemas, so it is its own leaf package.)
- **Native compilation stays an optimisation for TRUSTED predicates.** A verified predicate from
  a trusted author may still compile to JS for speed. The data form is the contract, and the
  compiled form must agree with it (a differential test, as with the inline runtime).

## `asCompared` — the missing half of a type

_Status: shipped._ `extend Foo { asCompared() {…} }` landed in 0.13.4; 0.13.5 made the
registry file-local (0.13.4 shipped it process-global by mistake); 0.13.6 added the type's
own `asCompared()` method as the layer beneath the registries. The section below is the
design record, kept because it explains the choices.

Some TJS background the section relies on. In native TJS, `==` is not JavaScript's: it
compiles to `Eq`, which unwraps boxed primitives and treats `null` and `undefined` as equal,
but neither coerces types nor compares objects by structure. `Is(a, b)` is deep structural
equality. Conditions (`if`, `?:`, `&&`) decide truthiness through `toBool`, which also unwraps
boxed primitives. An `extend Foo { … }` block adds methods to a class locally, without editing
its prototype. And a class is called without `new`.

### The gap

A type today answers one question: **membership** — does `v` satisfy `T`? That is what
`predicate` is. It cannot answer the other one: **equivalence** — are `a` and `b` the same,
*as T*?

The author's framing, which states it better than anything else here:

> a number is a number for comparison, but `-1` is not a positive integer

Those are independent. `-1` failing `Positive` is membership. `1` and `1.0` being the same
number is equivalence. A type that can only answer the first is half a type.

### The hook that exists, and why it cannot close the gap

A class can define an `Equals(other)` method (or `[Symbol.for('tjs.equals')]`), and `Is`
calls it. That is a method **bound to the value**, Java-style. Three things follow, and each
is fatal on its own:

1. **Primitives cannot participate.** The hook is only consulted for objects. There is no way
   to say "compare these floats with tolerance".
2. **You must own the class.** Making a Firestore `Timestamp` compare as a timestamp would
   mean monkey-patching a prototype you do not own — prototype pollution, which this
   codebase treats as a security boundary (`FORBIDDEN_KEYS`).
3. **Equivalence is type-relative, so it cannot live on the value.** `1.0000001` and `1.0`
   are equal as `Approximate`, distinct as `Float`. Only the *comparator* knows which
   question is being asked. The current design put the answer in the wrong place.

### The language already does this — for three types, hardcoded

In essence (`src/unwrap-boxed.ts` has the full version, which fails soft and reads the
internal slot rather than trusting `instanceof`):

```javascript
if (v instanceof String)  return String.prototype.valueOf.call(v)
if (v instanceof Number)  return Number.prototype.valueOf.call(v)
if (v instanceof Boolean) return Boolean.prototype.valueOf.call(v)
```

`unwrapBoxed` **is** a comparator registry with three host entries. (It now also sees through
tosijs proxies via `Symbol.for('xin-value')`; that came later and is a fourth, library-specific
case.) It is precisely
"compare this object as something else" — a `String` instance normalised to a string before
comparison. The semantics were decided and shipped; what was missing until 0.13.4 was a way to add
a fourth entry.

`asCompared` generalises those three hardcoded cases into an open registry. They become its
base cases rather than a special rule.

### A projection, not a comparison

```tjs
class Timestamp {
  constructor(seconds, nanoseconds) {
    this.seconds = seconds
    this.nanoseconds = nanoseconds
  }
}

extend Timestamp {
  asCompared() { return this.seconds * 1000 + this.nanoseconds / 1e6 }
}

const a = Timestamp(1, 500000000)
const b = Timestamp(0, 1500000000)

console.log(a == b)                          // true: both project to 1500
console.log(Is({ when: a }, { when: b }))    // true: the deep walk projects nested values
```

(`Timestamp` here is a local class standing in for one you do not own, such as Firestore's.
`a` and `b` are two representations of the same instant: 1 × 1000 + 500000000 / 1e6 and
0 × 1000 + 1500000000 / 1e6 are both 1500. Their fields differ, so without the `extend` block
both lines print `false`.)

The name is deliberate: it says what the value **is, for comparison** — not how to compare
it. That distinction carries real weight:

- **It composes.** A deep walk normalises each node before comparing, exactly as
  `unwrapBoxed` already does. A `Timestamp` nested three levels inside an object just works.
  An `Equals(other)` predicate only fires where something remembers to dispatch it.
- **It can generalise past equality.** Once a value can say what it is for comparison,
  ordering and range checks could follow from the same hook, which `Equals` could never
  give. That is a possible future use: today only `==`, `Is` and truthiness read it, and
  `<`, `>` and sorting compare the value as JavaScript does.

### It is consumed by `Eq`, `Is` AND `toBool`

This is the part that makes it more than an equality feature. The design started from a
question: why don't `Eq` (what `==` compiles to) and `toBool` (what conditions use) use a
type's comparator? Because there wasn't one, and both need it.

`toBool` is `Boolean(unwrapBoxed(v))`. An errored service result is an object, objects are
truthy, so `if (result)` takes the **success** branch and the type cannot say otherwise:

```text
toBool({ ok: false, error: 'timeout' })   ->  true
```

A plain object like that stays truthy. The fix needs the result to be a type that declares
`asCompared`; with `asCompared → false`, `if (result)` is correct. This example declares it as
a method on the class itself, the second of the two ways (the first is an `extend` block, as
above; see the registry chain below):

```tjs
class Result {
  constructor(ok) { this.ok = ok }
  asCompared() { return this.ok }
}

const failed = Result(false)
console.log(failed ? 'success branch' : 'failure branch')  // failure branch
```

The same applies to any library's own boolean wrapper, which `unwrapBoxed` cannot see because
it only knows `Boolean`.

### Return type: a primitive, or nothing

**Allowed: `number`, `string`, `boolean`, `null`, `undefined`.**

| | why |
| --- | --- |
| `number` | quantities and instants; would also let ordering use the same hook (not done: `<`, `>` and sorting do not read it today) |
| `string` | identity and normalisation — `URL → href`, case-insensitive keys; and it is what the existing `String` entry already returns |
| `boolean` | feeds `toBool`; errored results and foreign boolean wrappers |
| `null` / `undefined` | `Option`/`Maybe` — `None` projects to `null`, and `Eq` already treats the two as equal |

**Rejected:**

- **`bigint`** — the only case was nanosecond-exact timestamp equality. Almost nobody needs
  that precision, and anyone who does would not reach for `==`. Excluding it also removes a
  genuine trap: `1n === 1` is `false`, so two modules projecting the same type to `bigint`
  and to `number` would silently compare unequal.
- **`symbol`** — no case that an object reference does not serve.
- **object references** — "compare as another object" defers the question rather than
  answering it.

The rule is simpler than the list: **project to a primitive, or to nothing.** Which is
exactly what `unwrapBoxed` already does.

Participation is signalled by whether the type **declares** `asCompared`, not by what it
returns — otherwise `null`/`undefined` would be ambiguous with declining.

### Resolved: a registry CHAIN, rooted at the host

_Status: shipped (0.13.5 and 0.13.6)._

The scoping question is settled, and the answer reframes what `asCompared` is.

**The registry chain is TJS's view of the type environment.**

```text
1. module registry    ← `extend` lands here; local, does not leak (SHIPPED GLOBAL in
                        0.13.4 by mistake — fixed in 0.13.5; see the CHANGELOG)
2. globalThis.__tjs   ← the shared view, one of them, installed before anything runs
3. the type ITSELF    ← `class Foo { asCompared() {…} }` (0.13.6)
4. host built-ins     ← String / Number / Boolean base entries
```

Lookup tries each layer in that order and the first match wins; writes land in the module's
own layer. The global layer is written only by a host calling `registerProjection` (from
`tjs-lang/runtime`) before modules run; `extend` never writes it. A module can say "a Firestore `Timestamp` compares as
millis" without any other module seeing it, while everyone inherits the shared view of
`String`.

**The type's own method is the layer beneath the registries**, and it is the one that makes
the chain complete rather than merely long. The registries are keyed by `constructor.name` —
that is a *third party* describing a type it does not own, which is why a registration is an
override and is consulted first. A method is the type answering for itself, so it is the
default everyone inherits, exactly like the host entries below it.

It is also the only layer a JavaScript **Proxy** can supply: a proxy has no internal slot for
the base layer to read, and it reports its target's `constructor.name` to the registries, but
its `get` trap can serve a method. That is why this layer is a method and not another table.
(The case that proved it, tosijs's boxed scalars, #33, is now also handled by the base layer's
`Symbol.for('xin-value')` see-through; the reasoning holds for proxies in general.)

**Duck-typed on the name, deliberately.** `[tjsEquals]` and `.Equals` are dispatched the same
way, and the line this codebase draws is the right one: *a hook a type declares about itself*
is categorically different from *a boxed primitive intercepting a comparison it never agreed
to join*. Nobody writes `asCompared` by accident — unlike `valueOf`, which every `Date` and
`Number` already has, and which is precisely why `unwrapBoxed` reads the internal slot
instead of calling it. Containment is unchanged either way: the probe and the call are both
fail-soft, and a projection that is not a primitive is ignored rather than honoured.

Each compiled `.js` file carries a small built-in ("inline") runtime of its own, and uses a
shared runtime instead when one is installed. The emitted preamble encodes exactly this link:

```javascript
const __tjs = (globalThis.__tjs?.abi >= 2 ? globalThis.__tjs.createRuntime?.() : undefined) ?? { …inline stubs }
```

The module layer is a table in that same inline runtime (`__tjs_rt.__ac`); an
`extend Timestamp { asCompared() {…} }` block writes its entry there, so it is file-local by
construction.

**Why a module's parent is the global layer, never its importer — and must be.** Above the
type itself, the chain has exactly two registry levels: the module, then `globalThis`. Modules form a flat GRAPH, not a tree: at runtime nothing knows who
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

### Finding: `extend`'s method dispatch has no runtime half

_Status: still true (re-measured 2026-11). It did not block `asCompared`, which reads its
own table rather than dispatching extension methods._

`asCompared` in an `extend` block works, as the `Timestamp` example shows. Calling an
`extend` method on a variable does not, today. Measured first at 0.13.3, and unchanged since:

| receiver | emitted | works? |
| --- | --- | --- |
| literal — `'hello'.cap()` | `__ext_String.cap.call('hello')` | yes |
| annotated param — `s: ''` | `s.cap()` | **no** — `s.cap is not a function` |
| untyped param | `s.cap()` | **no** |

Only a LITERAL receiver is rewritten. Even a parameter the transpiler knows is a string
emits an unrewritten call, which needs `String.prototype.cap` — deliberately absent.

For method calls the registry is **write-only**: emitted code calls `registerExtension`, and
the emitter never emits a `resolveExtension` call. The resolver exists, is exported, walks
prototype chains correctly, and is never called. `TJS-SYNTAX.md` documents the literal-only
behaviour. (The docstring of `transformExtensionCalls` in `src/lang/parser-transforms.ts`
still promises a runtime fallback and says typed variables are rewritten; neither is true.)

So `extend` is local by ACCIDENT rather than design: local because the only working
mechanism is a lexical rewrite, and the mechanism that would make it non-local is unreachable.
Wiring the resolver without the chain model above would turn it into a flat global table —
the prototype pollution the feature exists to avoid. If extension methods ever dispatch at
runtime, they should use the same module → global → type → host chain.

### Still open

- **Declaration site.** Two are shipped: `extend Timestamp { asCompared() { … } }` (no new
  syntax) and a class's own `asCompared()` method. A slot on `Type` is not; it would
  serialize into the `$predicate` story and travel to the portable predicate VM. The chain
  model works for all three.
- **Whose registry answers `Is(a, b)`** when the call is in module A and the value came from
  module B. As shipped it is the caller's: each file's comparators consult that file's own
  table, so *you* choose how to compare, which is what "as compared" says. The alternative
  (the value's defining module) is defensible and disagrees; it is recorded here so the
  choice is explicit.
- **The test harness ignores `asCompared`.** `expect(…).toEqual(…)` compares structurally
  where `==` and `Is` project (see the implementation notes).

### Implementation notes

_Written before the build; the first point records where the shipped code differs from the
plan._

- Probe fail-soft — asking a Proxy whether it declares `asCompared` runs a trap that can
  throw, and a hostile object must not throw out of `==`. The plan was to invoke strictly,
  so that a declared hook that throws surfaces as the author's bug. **As shipped, the call is
  fail-soft too:** a projection that throws, or returns something other than a primitive, is
  ignored and the value compares as itself (0.13.4 CHANGELOG: a hook that breaks `==` for
  every value is worse than one that does not apply).
- Several copies of the comparator exist by design (bundle isolation):
  - `runtime.ts`
  - `tests.ts`'s `expectFunction`
  - `emitters/js-tests.ts`'s `__deepEqual` (and `formatValue`, which prints the values)
  - the emitted inline `Is`

  **They must move together or they drift, and they already have:** the two test-harness
  copies do not consult `asCompared`, so in an inline test
  `expect(Ts(1, 0)).toEqual(Ts(0, 1000))` fails for a type whose `==` and `Is` call those two
  values equal. This is open (see "Still open").
- The hot path must stay allocation-free. `Eq` is ~29ns; a lookup on every comparison is the
  main risk to watch.

## `Predicate` is the umbrella — and it already exists, unnamed

_Status: the umbrella is shipped as the `Predicate` class (`src/types/predicate-brand.ts`,
exported from `tjs-lang`); whether it gets a declaration keyword is open (end of section)._

**Design position (2026-09-19):** *predicates stay plain functions under the hood, but
within TJS they are instances of `Predicate`.* "Instance" here means a plain function whose
prototype chain includes `Predicate.prototype` (the code is further down). Everything that answers **"does `v` satisfy X"**
is a predicate; the declaration forms differ only in how they are constructed and how much they
can tell you about themselves.

This started as an argument for renaming `FunctionPredicate` to `FunctionType`, on the grounds
that it declares a function *type*. That argument proves too much: `Type Age 0` (the
declaration form of `Type('Age', 0)`; the declaration syntax is in `TJS-SYNTAX.md`) also produces a
runtime checker, so if producing a check disqualifies something from being a predicate, nothing
in the language is one. The taxonomy was wrong at the root, and the rename was abandoned
mid-flight.

### The finding: the interface is already implemented

In the full runtime (`src/types/`, what `import { Type } from 'tjs-lang'` gives you), every
declaration form returns a value sharing **six members** (besides a function's own `name`
and `length`):

    __runtimeType   check   description   strip   toJSONSchema   toJSON

(`toJSON` is what `JSON.stringify` uses; for a `Type` it gives the description and example,
not the JSON Schema) and each
adds its own introspection on top:

| form | adds |
| --- | --- |
| `Type Age 0` | `example`, `examples`, `default`, `schema`, `predicate` |
| `Enum Colour 'a colour' { Red = 'red' … }` | `values`, `keys`, `names`, `members`, and each member by name (`Colour.Red`) |
| `Union Direction 'a direction' 'north' \| 'south'` | `values` |
| `FunctionPredicate Formatter { params: … returns: … }` | `params`, `returns`, `returnContract` |

The inline runtime that emitted `.js` carries is smaller: its declarations have
`__runtimeType`, `check` and `description` plus their own introspection (a `Type` has
`default` but no `example`, `strip` or `toJSONSchema`), and `Predicate` is not in scope in
emitted code. This is the "inline runtime is not the real runtime" rule
(`docs/type-identity.md`): the shared six are a property of the full runtime.

One member is already odd: a `FunctionPredicate` implements `strip`, though a function has no
shape to strip.

So the common concept is not hypothetical — it is built, consistent across four constructs, and
branded (`__runtimeType: true`). **It has no name.** That is the gap.

### Why naming it is not cosmetic

A named umbrella gives one answer where there are currently four parallel ones:

- **One thing to serialise.** `$predicate` needs a subject; today each form implements
  `toJSONSchema` separately and nothing says they are the same kind of thing.
- **One thing to compose.** `verifyPredicate` certifies clusters of plain functions, and there
  is currently no expressible relationship between a verified `isColor` and a `Type` — though
  both answer the same question.
- **One thing to introspect.** Editor tooling, `suggest()`, and `.d.ts` generation all want
  "give me the check and whatever else you know", which is precisely this interface.
- **One thing to document.** The book currently needs a declarations chapter that explains four
  constructs and then separately explains predicates, when it should explain one idea with four
  constructions.

### What "plain functions under the hood" buys, and must not cost

The constraint that keeps this honest: a `Predicate` must remain **an ordinary JavaScript
function** underneath. Not a class instance requiring a runtime, not a wrapper that has to be
unwrapped at a boundary. That is what lets a verified predicate compile to native JS, travel as
`$predicate`, and be called by code that has never heard of TJS — and it is the same
"inside JavaScript" commitment the rest of the language rests on (`guides/why-tjs.md`).

`FunctionPredicate` then stops looking like an outlier and reads correctly: **a `Predicate` whose
subject happens to be a function, distinguished by richer introspection** — it can report
`params` and `returns`, not merely "yes, that is a function". The specialisation is in what it
knows, not in what kind of thing it is.

### The concrete difference: a `Type` is a `Predicate` that carries a WITNESS

**Decided 2026-09-20.** The relationship between `Type` and `Predicate` is not a hierarchy. It
is *what the predicate additionally carries*, which makes it an **instances** story rather than
a subclass one.

A **`Predicate` can decide** — `check(v) -> boolean`, and that is the entire contract. `n % 2
=== 0` has nothing else to offer; you cannot ask it for an even number.

A **`Type` is built from an example**, so it carries a **witness value** (a sample value known
to pass the check) — and every other capability it has follows from that one fact:

    Type('age', 0).check(5)   -> true      it decides, like any predicate
    Type('age', 0).example    -> 0         it carries a witness
    Type('age', 0).default    -> 0         ...so it can GENERATE a valid value
                                           ...so it can STRIP (remove fields its shape lacks)
                                           ...so it can describe STRUCTURE in JSON Schema

Generalised, the four existing forms differ only in what they carry:

| carries | can additionally |
| --- | --- |
| `Predicate` — nothing | — |
| `Type` — one example | generate, strip, describe structure |
| `Enum` / `Union` — the whole finite domain | generate, **enumerate → autocomplete for free** |
| `FunctionPredicate` — a signature | describe `params`/`returns` (its `check` only tests that the value is a function; see below) |

Capabilities are **properties present or absent**, not subclasses. `instanceof Predicate`
comes from a **real prototype chain**: `brandPredicate` (`src/types/predicate-brand.ts`) sets a
predicate's prototype to `Predicate.prototype`, which itself links to `Function.prototype`, so a
predicate keeps `call`/`apply`/`bind` and stays a function to everything that does not know
better.

The class is claimed through a shape-versioned global slot so it is the SAME class across
bundles (`docs/runtime-fusion.md`). (A first draft used `Symbol.hasInstance` instead of a real
prototype chain; it stopped being needed once runtime types became functions.)

### Autocomplete is NOT in the minimum, and that is load-bearing

A predicate drives autocomplete **iff it carries values**. `Enum` does, for free. A bare
predicate does not — and `suggest()` already covers that case by **mining the source** (keyword
sets, `startsWith` guards) rather than asking the predicate for something it cannot know.

Suggestion is therefore a capability some predicates *have* and others have *recovered by
analysis*. Requiring it of the minimum would force every predicate to answer a question most
cannot.

### Sensible defaults: the minimum is ONE member

| member | default |
| --- | --- |
| `check` | **required** — it *is* the function |
| `description` | `fn.name` |
| `toJSONSchema` | `{ $predicate: … }` — claims no structure, which is exactly the progressive-enhancement story |
| `strip` | identity — you cannot strip what you cannot describe |
| `example` / `values` | **absent**; presence *is* the capability |

This also resolves the `strip`-on-a-`FunctionPredicate` oddity noted above: it is identity
there, and should be **inherited by default** rather than separately implemented on each form.
The observed shared members stop being an accidental intersection and become one required
member plus defaults (`toJSON` follows from `toJSONSchema` and `description`).

### `Type` is already a `Predicate` with more attached — so nothing needs restructuring

**Settled 2026-09-20.** *"Can't `Type` just be a predicate with more information
attached?"* — it can, and it already is. The extra information is **properties on the object**,
so there is nothing to construct *through*. The "is `Type` built on `Predicate` or does it
merely satisfy it" question does not need an answer; it dissolves.

| | |
| --- | --- |
| **`Predicate`** | a function, with `check` pointing to itself |
| **`Type`** | a `Predicate` with an **example** attached |
| **`Enum` / `Union`** | a `Predicate` with a **finite domain** attached |
| **`FunctionPredicate`** | a `Predicate` with a **signature** attached |

**Predicates are FUNCTIONS WITH PROPERTIES, not objects with a callable test.** That was the
original conception and it is the right one; an earlier draft of this section argued against it
and was wrong on every count. The objections, and what measuring them showed:

| objection raised | measured reality |
| --- | --- |
| Two guards branch on `typeof === 'object'` (`runtime.ts`, and the inline `__match` stub) | a **two-line widening** (`\|\| typeof ex === 'function'`), backward compatible — object-shaped types still match |
| `Object.setPrototypeOf` is expensive | **2.7ms vs 0.7ms per 20,000 declarations** (~0.1µs each), at module-init only. Non-issue |
| Old emitted files would not recognise a callable type | **no exposure.** Emitted types are file-local `const`s, never exported, and the param check calls `.check()` directly rather than going through `__match`. A file only ever checks against types its own stub built |

The shape, which needs no `eval` and no `new Function` (as built in `src/types/Type.ts`):

    const Age = (v) => /* the test */
    Object.setPrototypeOf(Age, Predicate.prototype) // real prototype chain
    Object.assign(Age, { description: 'age', example: 0, check: Age, __runtimeType: true })

    Age(5)                   // true   — callable, the natural JS idiom
    Age.check(5)             // true   — same function, cannot drift
    Age instanceof Predicate // true   — real instanceof, no Symbol.hasInstance
    Age instanceof Type      // false  — `Type` is a factory, not the prototype

(`Predicate` is exported from `tjs-lang`; it is not in scope inside emitted code.)

**Why this is better than the object-shaped alternative**, beyond taste:

- A verified plain function like `isColor` becomes a `Predicate` by **attaching properties** —
  no wrapping, no lifting, no two populations to reconcile. The "remaining loose end" an earlier
  draft recorded simply does not arise.
- `check` **is** the function, so there is one implementation that cannot drift from itself.
  This repo has paid for two copies of one runtime before (`docs/runtime-fusion.md`).
- `instanceof` comes from a real prototype chain rather than `Symbol.hasInstance` standing in
  for one.

**The one genuine finding**, which is worth fixing on its own merits: a callable `Type` satisfies
`FunctionPredicate.check`, because that check is literally `v => typeof v === 'function'` and so
already accepts **any** function regardless of signature. Callable predicates add one more
category to a check that is already too permissive. The defect is the weak `check`, and it
exists today.

Minor and known: functions carry `name` and `length` as own properties. Both are configurable
and no declaration form uses `.name` today, but a property named `name` would need care.

### Open, and genuinely undecided

- **Is there a `Predicate` declaration keyword, or is the umbrella type-level only?** A keyword
  (`Predicate isEven(n: 0) { … }`) makes the concept first-class but competes with "it is just a
  function", which would contradict the rule that a predicate is a plain function. The alternative is that `verifyPredicate` *lifts* a plain
  function into a `Predicate` and nothing new appears in the grammar.
- ~~**What is the minimal interface?**~~ **Answered above:** one required member (`check`) plus
  defaults. `strip` on a `FunctionPredicate` was indeed incidental — identity, inherited.
- **Does `Type` become a constructor of `Predicate`, or stay parallel to it?** The *conceptual*
  answer is settled (a `Type` is a `Predicate` carrying a witness). The implementation question
  is smaller than it looks. The type checkers (the full `Type` and the inline stub) used to
  disagree in four measured cases (`docs/type-identity.md`); all four were closed in 2026-08,
  and `src/lang/type-identity.test.ts` checks that they agree across its corpus.

  So unifying them is closer to a refactor than to a behaviour change, and the remaining
  question is design (should `Type` be constructed *through* `Predicate`, or merely satisfy
  it?) rather than "which semantics win". Branding stays orthogonal either way; it is a real
  prototype chain (see "The concrete difference: a `Type` is a `Predicate` that carries a
  WITNESS" above).

## Open questions

- **`TypeDescriptor`'s fate:** keep it as a cached projection of JSON-Schema +
  `$predicate`, or eventually retire it? At minimum, guard that it can't express
  what the canonical form can't.
- **The predicate instruction set:** pin down the exact set of AST nodes and operations
  the reference VM must support (a spec), and a **conformance suite** every port
  runs — so "TJS types" means the same thing in every language.
- **AST format:** settle the serialized predicate AST schema (it should itself be
  describable: the AST format as a JSON Schema).
- **Fuel across languages:** the fuel model must be spec'd (per-node cost) so a
  runaway predicate is bounded identically everywhere.
- **Structure/predicate split:** conventions for what belongs in JSON-Schema
  keywords vs `$predicate` (prefer standard keywords; reach for `$predicate` only
  for the genuinely computational).
