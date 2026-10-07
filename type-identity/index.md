<!--{"section": "internals", "order": 6, "navTitle": "Type identity", "parent": "the-tjs-language.md"}-->

# Type identity: who answers "does this value satisfy this type?"

TJS answers that question in several places. This page names them, says which one is
authoritative, and records where they currently disagree — with a link to the test that
measures it, because a page like this is exactly where a stale claim survives longest.

Measured by [`src/lang/type-identity.test.ts`](../src/lang/type-identity.test.ts), which
runs one corpus through every mechanism on each test run.

## The mechanisms

| # | Mechanism | Where | Answers with |
| --- | --- | --- | --- |
| 1 | `Type(name, …, example).check(v)` | `src/lang/runtime.ts` | example-inference over tosijs-schema |
| 2 | **the inline stub** — `__match(v, ex)` | emitted into every standalone `.js` (`src/lang/emitters/js.ts`) | a ~400-byte re-implementation of #1 |
| 3 | a direct predicate | emitted for a bare `n: int` parameter | `Number.isInteger` and friends |
| 4 | `checkType(v, kind)` | `src/lang/runtime.ts` | string kind names, returns an error |
| 5 | `checkType(v, descriptor)` | `src/lang/inference.ts` | `TypeDescriptor`, returns a boolean |

Several implementations of one question is not by itself a problem — #3 exists because a
bare `int` needs no allocated type object, and #2 exists so an emitted file has no runtime
dependency. Them **disagreeing** is the problem.

### The unwrap contract, and proxy-shaped boxed values

Every mechanism above sits downstream of one shared question — *what primitive does this
value stand for?* — answered by `unwrapBoxed` (`src/unwrap-boxed.ts`) and, above it, by
`asCompared` (see `type-system-north-star.md`). Two properties of that contract are worth
stating here, because "it's a `Number`, and `instanceof` agrees" is a reasonable thing to
believe right up until it isn't:

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

The one thing to know before reading further, because it inverts the obvious reading:

> Emitted JS declares its own `Type`/`Generic`/`Enum`/`Union`/`FunctionPredicate` inside a
> per-file `__tjs_rt` object and calls them **through it**, so the inline stub always wins —
> even when a full runtime is installed.

So #2 is not a degraded path taken when `globalThis.__tjs` is missing. **It is the shipped
semantics of every emitted file**, and #1's stricter answer is unreachable from emitted
code. `CLAUDE.md` states this under "The inline runtime is NOT the real runtime"; it is
repeated here because it is the fact that makes the disagreements below matter.

The namespace changed when the preamble moved into `__tjs_rt` (#39); the property did not. These were module-scope
declarations called by bare name, which made them collide with any identically-named import
the author wrote (#39, `src/lang/rt-namespace.ts`). They are now scoped to the file's own
runtime object — which is deliberately NOT `__tjs`, since `__tjs` resolves to the shared
runtime when one is installed and routing through it is precisely the "improvement" that
would swap the semantics this page exists to document.

It also makes them easy to mis-measure. Probing an emitted function with and without
`globalThis.__tjs` returns the same answer both times — which reads as agreement and is
actually the stub answering twice.

## Where they disagree today

**Nowhere in the corpus.** The list is empty, and the harness stays.

_On decisions_ — which is what this page is about, and what the harness measures. Surface
disagreements are a separate, shorter list; see "Surface, not decisions" below.

Four cases used to live here:

| Type | Value | was | cause |
| --- | --- | --- | --- |
| `Type Int { example: 1 }` | `1.5` | stub accepted | narrowing lost at the source→value boundary |
| `Type Price = 0.0` (and nested) | `9.99` | BOTH rejected | float lost at the source→value boundary (fixed 2026-09-25) |
| `Type Pt { example: { x: 1, y: 1 } }` | `{ x: 1.5, y: 1 }` | stub accepted | narrowing lost through a shape |
| `Type Nums { example: [1] }` | `[1.5]` | stub accepted | narrowing lost through an array |
| `Type Pt { example: { x: 1, y: 1 } }` | `{ x: 1, y: 1, z: 9 }` | stub accepted | shape left open |

They closed in two moves, and the split is the useful part:

1. **Source-level facts** — `+0` means non-negative, and `+0 === 0`, so nothing downstream
   can recover it. The emitter writes the check into the emitted code as a predicate.
   This is the only case that genuinely needed the source.
2. **Value-derivable facts** — the numeric-narrowing rows. `Number.isInteger(example)` is
   readable from the value the stub already holds, so `__match` enforces it directly. No
   source information required, and no second mechanism.

The FOURTH row resolved in the opposite direction (2026-08-14). It was first closed by
making the stub reject the excess key — and then the policy itself was reversed: **excess
keys are fine, everywhere**. TypeScript's excess-property check is a freshness lint on
object literals, not a property of the type (route the same object through a variable and
it passes), and there is no `Exact<T>` — so a runtime check that closes the shape is
stricter than anything the type system it mirrors can express. Both checkers now ACCEPT
`{ x: 1, y: 1, z: 9 }` against `example: { x: 1, y: 1 }`; missing keys and wrong member
types are still errors. The stub stays open by construction, and the real runtime re-opens
what `s.infer` closes (`openInferredShapes` — tosijs-schema 1.5.0 began enforcing the
`additionalProperties: false` it emits). Agreement was the invariant worth keeping; which
way they agree was a language decision, made toward JavaScript.

The first attempt at (2) was a structural walk over the example AST, on the assumption
that narrowing through a shape needed the source the way `+0` did. It does not: an integer
example is still an integer when it arrives as a value. The walk was written and then
deleted in favour of six clauses in `__match`.

**Making the stub stricter broke nothing** — full suite, examples included. That is worth
recording, because it was the risk that justified treating this as a ratchet rather than a
fix: emitted code that starts rejecting values is a subset violation, and the reason it
was safe here is that every value newly rejected was one the real runtime already refused.

### Why the harness stays

An empty list is the goal state, not a reason to delete the apparatus. What it buys now is
that the NEXT divergence fails on the commit that introduces it, rather than being
discovered later by someone probing one case at a time. Both directions are still
enforced: an unlisted disagreement fails, and a listed one that stops happening also fails,
asking to be deleted — so a fix cannot rot into slack a regression could occupy.

### The gap, closed — and the half of it nobody had measured (2026-09-25)

This section used to record that `+0` NESTED in a shape (`{ count: +0 }`) was still lost,
and that the structural walk had been deleted because "an integer example is still an
integer when it arrives as a value". That sentence is true, and it is the whole reason the
other half went unseen: **a FLOAT example does not arrive as a float.** `0.0 === 0`, so
`Type Price = 0.0` narrowed to integer and rejected 9.99 — in both runtimes, at every
emission site, nested or not. The corpus had `Frac` (`1.5`), whose value is non-integral
and therefore survives; it had no integer-valued float, which is the only kind that
doesn't.

It mattered because `fromTS` maps every TypeScript `number` to `0.0`. Every converted
interface with a number field rejected every non-integer the moment validation was on —
found when `TjsStrict` was fixed to turn validation on, and a converted example rejected
its own valid order.

The walk now exists (`markExampleKinds`, `parser-transforms.ts`): it reads the example's
AST with the same rules as `inferTypeFromValue` and wraps only what the value cannot say as
`__tjs_rt.__k(kind, …)` markers — `float`, `nonneg`, `undef`, `any`, `pred` (a sound type
name), `set` (an all-literal union), `union`, and `ref` (another type, read when CHECKED, and
checked coinductively so cyclic data terminates). An example with none of these emits
byte-identical code.
`Price`, `Cart` and `Tally` are in the corpus; the spec is pinned site by site in
`src/lang/example-kinds.test.ts`.

### Recursive types — what `.check` does, and what the schema does not (yet)

A `ref` (another Type named in an example) is checked coinductively — cyclic data is
accepted when every node satisfies its type — by iterative refinement: inside a check every
nested match is a lookup of a (value, subexample) pair, assumed true until its own shape
fails, with failures propagated to the pairs that consulted it. There is no recursion into the
data, so any depth works (a 50,000-deep list, on Node as on Bun), in time linear in the data.
Checked against a brute-force oracle on wide random cyclic, shared graphs
(`example-kinds-oracle.test.ts`).

`toJSONSchema()` of a recursive type is NOT yet faithful: it truncates to `{}` at the
recursion point, so a JSON-Schema validator accepts values `.check` rejects. `$defs` + `$ref`
is the fix (TODO).

## Surface, not decisions

The list above is about **verdicts** — does `v` satisfy `T`. The two implementations can also
differ in what a type *exposes*, which no decision test can see. That list is short and, unlike
the verdict list, not empty:

| fact | real runtime | inline stub | consequence |
| --- | --- | --- | --- |
| a `Type`'s witness | `example` | `__ex` | `Age.example` is `undefined` in emitted code — and emitted code is the shipped semantics |
| the `Predicate` brand | `instanceof Predicate` is `true` | `false` — the stub builds its own callables and never reads the `__tjs_Predicate_1` slot | a check like `x instanceof Predicate` sees library types and misses every type declared in a `.tjs` file |

Same information under two names, so nothing is *lost*; it is simply not where the documented
surface says it is. Unifying them changes the serialised shape of every emitted type, so it is
tracked in `TODO.md` as a deliberate change rather than made in passing. Pinned by
`predicate-callable.test.ts`, which asserts the divergence in both directions — the stub has no
`example`, the real runtime has no `__ex` — so closing it fails a test rather than drifting.

Two surface gaps have already closed this way and are worth naming, because both were found
the same way: by asking what the stub omits rather than what it decides.

- `Enum.members` / `names` / `keys` — the real `Enum` documents `Color.members.Red` as **the**
  way to reference a member, and the stub carried only `values`, so the documented access
  returned `undefined` in every emitted file.
- `toJSON` — the real runtime got it and the stub did not, so `JSON.stringify(EmittedType)`
  returned `undefined` and the key silently vanished from any object containing one. The 0.14.0
  review caught it; the stub now serialises to byte-identically the pre-0.14.0 shape.

The general lesson is the page's own thesis applied one level up: **a field the stub omits is a
field the language does not have.** Adding one to `src/types/Type.ts` alone adds it to the
library only.

## What this blocks

Nothing, now. `Box<int>` — type arguments in an annotation — was the last **proposed**
row in [TJS vs TypeScript](./tjs-vs-typescript.md), and it shipped once the disagreements
above were closed. The blocker really was on this page rather than in the parser: the
inline `Generic` stub coerced a type argument with `v => typeof v === typeof a`, so
`Box<int>` accepted a float. It goes through `__match` now.

The other half was that `int` has no runtime binding at all — it compiles to an inline
check, so `Box(int)` would reference nothing. The answer generalises past this case: **a
type that cannot be represented as a value can be represented as a predicate over values**,
and the runtime was already predicate-shaped, so it needed no new mechanism. Predicates
compose, which is what makes them sufficient rather than a special case for primitives —
`Box<Box<int>>` works because a parameterized type is itself a valid type argument.

Measured by `src/lang/type-argument.test.ts`, which also pins `Box<int>` against `n: int`
on a shared corpus — two hand-rolled answers to "is this an int" being exactly how this
page's defect class starts.

## One name, two implementations

`checkType` is exported twice from `src/lang/index.ts` — once via `export * from
'./inference'` and once explicitly from `./runtime`. An explicit re-export wins, so **#5 is
unreachable from `tjs-lang/lang`**. The two have incompatible signatures (`boolean` over a
`TypeDescriptor`, versus an error-returning string matcher), so if the shadowing ever
flipped, every caller would break at runtime rather than at the type level.

This is asserted by the test rather than fixed: removing either is a breaking change to a
public surface. The assertion is what makes the collision impossible to forget when that
call is made.

## Adding a mechanism

Don't, if an existing one will do. If you must, add it to the corpus in
`type-identity.test.ts` in the same commit — a mechanism that answers this question without
being in that harness is one that can drift from the other four without anything going red.
