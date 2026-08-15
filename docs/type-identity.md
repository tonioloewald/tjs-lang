<!--{"section": "internals", "order": 4, "navTitle": "Type identity"}-->

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

## The inline stub is not a fallback

The one thing to know before reading further, because it inverts the obvious reading:

> Emitted JS declares its own `Type`/`Generic`/`Enum`/`Union`/`FunctionPredicate` and calls
> them **bare**, so the inline stub always wins — even when a full runtime is installed.

So #2 is not a degraded path taken when `globalThis.__tjs` is missing. **It is the shipped
semantics of every emitted file**, and #1's stricter answer is unreachable from emitted
code. `CLAUDE.md` states this under "The inline runtime is NOT the real runtime"; it is
repeated here because it is the fact that makes the disagreements below matter.

It also makes them easy to mis-measure. Probing an emitted function with and without
`globalThis.__tjs` returns the same answer both times — which reads as agreement and is
actually the stub answering twice.

## Where they disagree today

**Nowhere in the corpus.** The list is empty, and the harness stays.

Four cases used to live here:

| Type | Value | was | cause |
| --- | --- | --- | --- |
| `Type Int { example: 1 }` | `1.5` | stub accepted | narrowing lost at the source→value boundary |
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

### A gap the corpus does not yet cover

`+0` NESTED in a shape (`Type P { example: { count: +0 } }`) is still lost — the emitted
predicate covers a top-level scalar only. It is the one case that would need the
structural walk, and it is not currently measured. Adding it to the corpus is the honest
next step; building the walk before something measures it is not.

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
