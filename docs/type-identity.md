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

Three remain, all one-directional: **the stub is more permissive than the real runtime.**

| Type | Value | inline stub | real runtime |
| --- | --- | --- | --- |
| `Type Pt { example: { x: 1, y: 1 } }` | `{ x: 1.5, y: 1 }` | accepts | rejects |
| `Type Nums { example: [1] }` | `[1.5]` | accepts | rejects |
| `Type Pt { example: { x: 1, y: 1 } }` | `{ x: 1, y: 1, z: 9 }` | accepts | rejects |

Two causes:

1. **Numeric narrowing is lost.** `__match` bottoms out at `typeof v === 'number'`, so an
   example of `1` accepts `1.5`. This contradicts the documented rule that `42` is an
   *integer* example (`CLAUDE-TJS-SYNTAX.md`) — the stub is wrong against the spec, not
   merely different from #1. **Fixed for a top-level numeric example** (see below); still
   lost when the number is nested, which needs a structural walk of the example.
2. **Shapes are open.** `__match` checks the example's keys are present; #1 also rejects
   excess ones.

## A third kind: narrowing destroyed before either runtime sees it

`+0` means *non-negative integer* — and `+0 === 0`. The example was passed through as a
**value**, so the sign was gone before any runtime could infer from it, and #1 and #2 both
accepted `-1`. Not a disagreement: they agreed, and were both wrong.

| declaration | `-1` | `1.5` |
| --- | --- | --- |
| `function g(n: +0)` | rejects | rejects |
| `Type Count { example: +0 }` *(before)* | **accepts** | **accepts** |
| `Type Count { example: +0 }` *(after)* | rejects | rejects |

The parameter path was always right because it reads the source token. The `Type` block
did not, so the idiomatic way to declare a count accepted negatives everywhere.

**The fix is the general one**, and it is the move that makes #1 and #2 tractable: a
numeric example's kind is a fact about the *source*, so the emitter — the only place that
still knows — writes the check into the emitted code as a predicate, rather than handing a
bare value to two inference engines and hoping they agree. Both runtimes then give the same
answer by construction.

One consequence worth stating, because it looks like a regression: emitted code is now
**stricter** than `Type(name, undefined, +0)` called directly, since that call really was
handed `0`. The value-constructed API is the lossy arm there, not the authority. The test
marks those cases `sourceNarrowing` and checks the emitted side against the spec instead of
against a weaker sibling.

Note what is *not* in the table: a bare `n: int` parameter (#3) always narrowed correctly.
That was the clue — one constraint written two ways disagreed *within a single file*, which
is what pointed at the source/value boundary rather than at either runtime.

### Why this is a ratchet and not a blocker

More permissive means emitted code **under-validates**. It never rejects a value the
language accepts, so the subset invariant in [`PRINCIPLES.md`](../PRINCIPLES.md) holds: a
weaker promise, not a broken program. The test therefore asserts the direction as a hard
rule — *the stub must never be stricter* — and holds the remaining cases in a list that may
only shrink. (The exception is a `sourceNarrowing` case, where being stricter than a
value-constructed `Type()` is correct; those are checked against the spec instead.)

The list is individual cases, not a count, so a fixed one and a new one cannot cancel out.
Both directions are enforced: an unlisted disagreement fails, and a listed one that stops
happening also fails, asking to be deleted. (An entry that quietly stops applying is how an
expired exemption reserves slack for a future regression.)

## What this blocks

`Box<int>` — type arguments in an annotation — is listed as **proposed** in
[TJS vs TypeScript](./tjs-vs-typescript.md). Parsing and resolution were built and
reverted, and the reason is on this page rather than in the parser: the inline `Generic`
stub coerces a type argument with `v => typeof v === typeof a`, so `Box<int>` accepted a
float in standalone output. The syntax was never the blocker.

Fixing cause 1 above is most of that row.

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
