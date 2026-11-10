<!--{"parent": "the-tjs-language.md", "order": 6}-->
<!-- TODO review -->

# Type identity: who answers "does this value satisfy this type?"

_Internals. A design note for people changing the TJS runtime or emitter; you do not need it
to write TJS._

**If you only write TJS, this is what you need.** Code compiled from a `.tjs` file checks
its declared types with its own inline runtime (or the shared `tjs-lang/prelude` copy), not
with the `tjs-lang` library. For `.check`, the library's `Type` gives the same verdicts,
with one exception. In TJS a type is written as an example value, and the library receives
only the value: `0.0 === 0` and `+0 === 0`, so the library cannot tell "float" or
"non-negative" from "integer". Only the compiler, which reads the source text, can. You do
not need to act on this; it matters only if you call the library's `Type` directly.

What a type *exposes* still differs in four places (its `example`, its JSON Schema, the
`Predicate` brand, and whether `.toJSONSchema()` exists at all); see "Surface, not
decisions". The rest of the page is for people changing either implementation.

```tjs
Type Price = 0.0
Type Point { example: { x: 1, y: 1 } }

console.log(Price.check(9.99), Price.check('9.99'))   // true false: 0.0 is a float example
console.log(Point.check({ x: 1, y: 1, z: 9 }))         // true: an extra key is fine
console.log(Point.check({ x: 1.5, y: 1 }))             // false: x: 1 is an integer example
console.log(Point.check({ x: 1 }))                     // false: y is missing
```

## What this page measures

TJS answers the title's question in several places. This page names them, says which one is
authoritative, and records where they disagree. A page like this is where a stale claim
survives longest, so a test measures it: `src/lang/type-identity.test.ts` (the harness) runs
one corpus of declarations and values, written as `.tjs` source, through every mechanism on
each test run.

**Authoritative: the inline stub (#2), because it is what every emitted file actually
runs.** See "The inline stub is not a fallback".

## The mechanisms

| # | Mechanism | Where | Answers with |
| --- | --- | --- | --- |
| 1 | `Type(name, …, example).check(v)` | `src/types/Type.ts` (re-exported by `src/lang/runtime.ts`) | example-inference over tosijs-schema |
| 2 | **the inline stub** — `__match(v, ex)` | emitted into every standalone `.js`, inside the file's `__tjs_rt` object (`src/lang/emitters/js.ts`) | a self-contained re-implementation of #1 |
| 3 | a direct predicate | emitted for a bare `n: int` parameter | `Number.isInteger` and friends |
| 4 | `checkType(v, kind)` | `src/lang/runtime.ts` | string kind names, returns an error |
| 5 | `checkType(v, descriptor)` | `src/lang/inference.ts` | `TypeDescriptor`, returns a boolean |

#1 is the library's `Type`, built by inferring a tosijs-schema from the example. #4 is the
`checkType` you get from `tjs-lang/lang`; #5 is internal (see "One name, two
implementations").

Several implementations of one question is not by itself a problem — #3 exists because a
bare `int` needs no allocated type object, and #2 exists so an emitted file has no runtime
dependency. Them **disagreeing** is the problem.

### The unwrap contract, and proxy-shaped boxed values

A type check first has to decide what primitive a value stands for: a boxed primitive such
as `new Number(5)` (an object wrapping a primitive, held in an internal slot the engine
keeps) should count as 5. Every mechanism above sits downstream of that question, answered
by `unwrapBoxed` (`src/unwrap-boxed.ts`) and, above it, by `asCompared` (see the
`asCompared` section of [North star](/type-system-north-star/)). Two properties of that
contract are worth stating here, because "it's a `Number`, and `instanceof` agrees" is a
reasonable thing to believe right up until it isn't:

- **The value is read from the internal slot, never by calling `valueOf`.** A subclass can
  override `valueOf` and lie; a slot read cannot be intercepted.
- **A `Proxy` has no internal slot, and slots are not forwarded to its target.** So a proxy
  over `new Number(0)` passes `instanceof Number` and then makes the slot read *throw*. That
  is why the unwrap is fail-soft: a value that will not yield a primitive slot simply is not
  a boxed primitive, and is returned unchanged rather than throwing out of a comparison.

A proxy-shaped boxed value therefore cannot participate through the slot, and cannot be
reached through a `constructor.name`-keyed registry either (it reports its target's name).
It participates by **declaring `asCompared()`**, which a `get` trap can serve — the layer
added in 0.13.6 for exactly this shape (#33).

## The inline stub is not a fallback

You would expect emitted code to use the full runtime when one is loaded and fall back to
the stub otherwise. It does not:

> Emitted JS declares its own `Type`/`Generic`/`Enum`/`Union`/`FunctionPredicate` inside a
> per-file `__tjs_rt` object and calls them **through it**, so the inline stub always wins —
> even when a full runtime is installed.

So #2 is not a degraded path taken when `globalThis.__tjs` is missing. **It is the shipped
semantics of every emitted file**, and whatever #1 answers is unreachable from emitted code.
This is the fact that makes the disagreements below matter.

The stubs used to be module-scope declarations called by bare name, which collided with any
import of the same name (#39, `src/lang/rt-namespace.ts`). Moving them into `__tjs_rt`
changed the namespace, not the rule that the stub always wins. The object is deliberately
NOT `__tjs`, since `__tjs` resolves to the shared runtime when one is installed and routing
through it is precisely the "improvement" that would swap the semantics this page exists to
document.

It also makes them easy to mis-measure. Probing an emitted function with and without
`globalThis.__tjs` returns the same answer both times — which reads as agreement and is
actually the stub answering twice.

## Where they disagree today

**Nowhere in the corpus.** The harness's list of known disagreements is empty, and the
harness stays. This is about verdicts (does `v` satisfy `T`), which is what the harness
measures; differences in what a type exposes are a separate list, "Surface, not decisions"
below.

The table below is history. Four disagreements used to live in the list, plus one shared
wrong answer the corpus could not see (`Price`, where both rejected a valid value):

| Type | Value | was | cause |
| --- | --- | --- | --- |
| `Type Int { example: 1 }` | `1.5` | stub accepted | narrowing lost at the source→value boundary |
| `Type Price = 0.0` (and nested) | `9.99` | BOTH rejected | float lost at the source→value boundary (fixed 2026-09-25) |
| `Type Pt { example: { x: 1, y: 1 } }` | `{ x: 1.5, y: 1 }` | stub accepted | narrowing lost through a shape |
| `Type Nums { example: [1] }` | `[1.5]` | stub accepted | narrowing lost through an array |
| `Type Pt { example: { x: 1, y: 1 } }` | `{ x: 1, y: 1, z: 9 }` | stub accepted | shape left open |

("Narrowing" is what an example does to a type: the example `1` narrows number to integer.)
The integer rows closed in two moves, and the split is the useful part:

1. **Source-level facts** — `+0` (not a row above; it was handled in the same change) means
   non-negative, and `+0 === 0`, so nothing downstream can recover it. The emitter writes
   the check into the emitted code as a predicate. This is the only case that genuinely
   needed the source.
2. **Value-derivable facts** — the numeric-narrowing rows. `Number.isInteger(example)` is
   readable from the value the stub already holds, so `__match` enforces it directly. No
   source information required, and no second mechanism.

**Extra keys are allowed in `.check`; missing keys and wrong member types are errors.** The
last row (the extra `z` key) resolved this way (2026-08-14), after first being closed in the
opposite direction by making the stub reject the excess key. TypeScript's excess-property
check is a freshness lint on object literals, not a property of the type (route the same
object through a variable and it passes), and there is no `Exact<T>` — so a runtime check
that closes the shape is stricter than anything the type system it mirrors can express. Both
checkers now ACCEPT `{ x: 1, y: 1, z: 9 }` against `example: { x: 1, y: 1 }`.
(`toJSONSchema()` is not yet consistent with this in emitted code; see "Surface, not
decisions".) The stub stays open by construction, and the real runtime re-opens what
`s.infer` closes (`openInferredShapes` — tosijs-schema 1.5.0 began enforcing the
`additionalProperties: false` it emits). Agreement was the invariant worth keeping; which
way they agree was a language decision, made toward JavaScript.

The first attempt at (2) was a structural walk over the example AST, on the assumption that
narrowing through a shape needed the source the way `+0` did. It does not: an integer
example is still an integer when it arrives as a value. The walk was written and then
deleted in favour of six clauses in `__match`.

**Making the stub stricter broke nothing** — full suite, examples included. That is worth
recording, because it was the risk that justified treating this as a ratchet rather than a
fix: TJS promises that code that was valid keeps working (`PRINCIPLES.md`), so emitted code
that starts rejecting values can break that promise, and the reason it was safe here is that
every value newly rejected was one the real runtime already refused.

### Why the harness stays

An empty list is the goal state, not a reason to delete the apparatus. What it buys now is
that the NEXT divergence fails on the commit that introduces it, rather than being
discovered later by someone probing one case at a time. Both directions are still enforced:
an unlisted disagreement fails, and a listed one that stops happening also fails, asking to
be deleted — so a fix cannot rot into slack a regression could occupy.

### The gap, closed — and the half of it nobody had measured (2026-09-25)

`+0` nested in a shape (`{ count: +0 }`) was still lost after the moves above, and the
structural walk had been deleted because "an integer example is still an integer when it
arrives as a value". That sentence is true, and it is the whole reason the other half went
unseen: **a FLOAT example does not arrive as a float.** `0.0 === 0`, so `Type Price = 0.0`
narrowed to integer and rejected 9.99 — in both runtimes, at every emission site, nested or
not. The corpus had `Frac` (`1.5`), whose value is non-integral and therefore survives; it
had no integer-valued float, which is the only kind that doesn't.

It mattered because `fromTS` maps every TypeScript `number` to `0.0`. Every converted
interface with a number field rejected every non-integer the moment validation was on —
found when `TjsStrict` was fixed to turn validation on, and a converted example rejected its
own valid order.

So a walk exists again (`markExampleKinds`, `parser-transforms.ts`): it reads the example's
AST with the same rules as `inferTypeFromValue` and wraps only what the value cannot say in
a `__tjs_rt.__k(kind, …)` marker:

| kind | written as | checks |
| --- | --- | --- |
| `float` | `0.0` | any number |
| `nonneg` | `+0` | a non-negative integer |
| `undef` | `undefined` | the value is `undefined` |
| `any` | `any` | anything |
| `pred` | a type name with no example spelling (`object`) | that type's predicate |
| `set` | an all-literal union (`'a' \| 'b'`) | one of the literals |
| `union` | any other union (`0 \| ''`) | one of the members |
| `ref` | another type (`Node`) | that type, read when checked; cyclic data is accepted if every node checks out |

An example with none of these emits the same code it did before the walk. `Price`, `Cart`
and `Tally` are in the corpus; the spec is pinned site by site in
`src/lang/example-kinds.test.ts`.

### Recursive types — what `.check` does, and what the schema does not (yet)

For `Type Node { example: { next: Node | null } }`, `.check` accepts a list of any length,
and a cyclic one, as long as every node satisfies `Node`. It does this by iterative
refinement: inside a check every nested match is a lookup of a (value, subexample) pair,
assumed true until its own shape fails, with failures propagated to the pairs that consulted
it. There is no recursion into the data, so any depth works (a 50,000-deep list, on Node as
on Bun), in time linear in the data. Checked against a brute-force oracle on wide random
cyclic, shared graphs (`src/lang/example-kinds-oracle.test.ts`).

`toJSONSchema()` of a recursive type is NOT yet faithful: it truncates to `{}` at the
recursion point, so a JSON-Schema validator accepts values `.check` rejects. `$defs` +
`$ref` is the fix, not yet done. (Measured: for `Type Node { example: { next: Node | null }
}` the schema unrolls one level and then accepts anything at `next.next`.)

## Surface, not decisions

The list above is about **verdicts** — does `v` satisfy `T`. The two implementations can
also differ in what a type *exposes*, which no decision test can see. That list is short
and, unlike the verdict list, not empty. (The "witness" is the example value a type keeps;
the "brand" is the marker that makes `instanceof Predicate` work.)

| fact | real runtime | inline stub | consequence |
| --- | --- | --- | --- |
| a `Type`'s witness | `example` | `__ex` | `Age.example` is `undefined` in emitted code — and emitted code is the shipped semantics |
| `toJSONSchema()` of an example shape | `additionalProperties: true` (re-opened by `openInferredShapes`) | `additionalProperties: false` | a JSON-Schema validator fed an emitted type's schema rejects `{ x: 1, y: 1, z: 9 }`, which that type's own `.check` accepts (measured 2026-11-06) |
| the `Predicate` brand | `instanceof Predicate` is `true` | `false` — the stub builds its own callables and never reads the `__tjs_Predicate_1` slot | a check like `x instanceof Predicate` sees library types and misses every type declared in a `.tjs` file |
| whether `.toJSONSchema()` / `.strip()` exist | always | only if the declaring file's own source calls `.toJSONSchema(` or `.strip(` (`src/lang/emitters/js.ts`) | a type declared in one file and used from another has `toJSONSchema === undefined`, so the call throws `is not a function` (measured 2026-11-10) |

The schema row blurs the line: it is a surface difference that becomes a verdict difference
as soon as another validator reads the schema.

The witness is present under another name (`__ex`), so nothing is *lost*; it is not where
the documented surface says it is. The brand is genuinely absent from stub types. Unifying
them changes the serialised shape of every emitted type, so it is tracked on the project
board as a deliberate change rather than made in passing. Pinned by
`src/lang/predicate-callable.test.ts`, which asserts the divergence in both directions — the
stub has no `example`, the real runtime has no `__ex` — so closing it fails a test rather
than drifting.

Two surface gaps have already closed this way and are worth naming, because both were found
the same way: by asking what the stub omits rather than what it decides.

- `Enum.members` / `names` / `keys` — the real `Enum` documents `Color.members.Red` as
  **the** way to reference a member, and the stub carried only `values`, so the documented
  access returned `undefined` in every emitted file.
- `toJSON` — the real runtime got it and the stub did not, so `JSON.stringify(EmittedType)`
  returned `undefined` and the key silently vanished from any object containing one. The
  0.14.0 review caught it; the stub now serialises byte-identically to the pre-0.14.0 shape.

The general lesson is this page's thesis (the stub is what TJS actually does) applied one
level up: **a field the stub omits is a field the language does not have.** Adding one to
`src/types/Type.ts` alone adds it to the library only.

## Generic type arguments: `Box<int>`

This once blocked a feature; nothing now. `Box<int>` — type arguments in an annotation — was
the last **proposed** row in [TJS vs TypeScript](/tjs-vs-typescript/), and it shipped once
the disagreements above were closed. The blocker really was on this page rather than in the
parser: the inline `Generic` stub coerced a type argument with `v => typeof v === typeof a`,
so `Box<int>` accepted a float. It goes through `__match` now.

The other half was that `int` has no runtime binding at all — it compiles to an inline
check, so `Box(int)` would reference nothing. The answer generalises past this case: **a
type that cannot be represented as a value can be represented as a predicate over values**,
and the runtime was already predicate-shaped, so it needed no new mechanism. Predicates
compose, which is what makes them sufficient rather than a special case for primitives —
`Box<Box<int>>` works because a parameterized type is itself a valid type argument.

Measured by `src/lang/type-argument.test.ts`, which also pins `Box<int>` against `n: int` on
a shared corpus — two hand-rolled answers to "is this an int" being exactly how this page's
defect class starts.

## One name, two implementations

`checkType` is exported twice from `src/lang/index.ts` — once via `export * from
'./inference'` and once explicitly from `./runtime`. An explicit re-export wins, so **#5 is
unreachable from `tjs-lang/lang`**. The two have incompatible signatures (`boolean` over a
`TypeDescriptor`, versus an error-returning string matcher), so if the shadowing ever
flipped, every caller would break at runtime rather than at the type level.

If you import `checkType` from `tjs-lang/lang` you get #4 (string kinds, returns an
error); #5 is internal. This is asserted by the test rather than fixed: removing either is a
breaking change to a public surface. The assertion is what makes the collision impossible to
forget when that call is made.

## Adding a mechanism

Don't, if an existing one will do. If you must, add it to the corpus in
`src/lang/type-identity.test.ts` in the same commit — a mechanism that answers this question
without being in that harness is one that can drift from the others without anything going
red.
