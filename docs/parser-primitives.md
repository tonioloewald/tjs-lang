# Small scoped parsers, not a rewrite

## The diagnosis

The `preprocess` stage rewrites TJS-specific syntax into JavaScript before acorn ever sees
it. It does this with roughly seventeen transforms built from regexes and character scans.
That worked while the rewrites were local. It has stopped working, and the evidence is not a
hunch — it is the bug list from a single day (2026-09-02):

| bug | the mechanism that failed |
| --- | --- |
| `new E({x:1})` in a class field read as a method head | regex plus a **single-character** look-back |
| a destructuring rename rewritten as a dictionary member | `^(\w+)\s*:\s*(.+)$` — cannot tell a rename from an example |
| the polymorphic merge grouping across scopes | a regex sweep over the whole file with **no notion of scope** |
| a generic type-param list split inside its own braces | `.split(',')`, not depth-aware |
| a generic default containing `=>` silently dropped | `.split('=')`, not depth-aware |
| `<T = () => 0>` unparseable | the `<…>` scan reads `=>`'s `>` as the closing bracket |
| a ternary's `:` consumed as an annotation | no way to know which kind of `:` this is |
| `:!` return example runs into the body | no way to know where an expression ends |

Every one is the same shape: **a scanner that knows characters but not grammar.** And they
reduce to two questions that no amount of masking can answer:

1. **Where does this expression end?**
2. **What does this `:` mean here?**

## The layer that is missing

The repo already has a **lexical** layer, and it works. `src/strip-comments.ts` owns literals,
comments, balanced braces (`matchingBrace`) and depth-aware splitting (`splitTopLevel`).
Consolidating on it closed the whole literal-blindness family — six live bugs across eight
files at `0.13.0-beta.1` — and `src/lang/literal-blindness.test.ts` keeps it closed.

What is missing is the layer above: **syntactic primitives**, built on the lexical ones and
consumed by the transforms.

```
  transforms          (exist)  — the ~17 preprocess rewrites
  syntactic primitives (NEW)   — expression extent, colon disambiguation
  lexical primitives  (exist)  — strip-comments.ts
```

This is not a rewrite. TS → TJS already runs on the TypeScript AST; TJS → JS already ends at
acorn. Only the middle is hand-rolled, and only the middle needs to change.

## Two primitives cover most of it

### 1. Expression extent

> Given a start offset, where does this expression end?

Respecting literals, nesting, and — the case that keeps biting — `=>`. It resolves:

- `<T = () => 0>`: the extractor counts brackets where it should consume an expression.
- `function Array$(value):! { value: null } {`: where the return example ends and the body
  begins.
- `topLevelDefaultEq` in `parser-transforms.ts`, written by hand on 2026-09-02, which is a
  degenerate case of this and should be deleted when the primitive lands.

### 2. Colon disambiguation

> Is this `:` a ternary's, a type annotation's, or an object key's?

It needs little more than "have I seen an unmatched `?` at this depth". It resolves the
ternary/arrow mangling in `RpcServer.ts` and `commandExecutor.ts` — and it is the same
question behind the destructuring-rename bug, which was fixed by *guessing from the shape of
the value* because nothing could answer it directly.

Both are a few dozen lines, independently testable, and **not throwaway**: an expression-extent
scanner is a Pratt-parser fragment, and a CST builder needs exactly these. The incremental
work is a down payment on the rewrite, not scaffolding for it.

## The discipline that decides whether this works

The failure mode is proliferation — several half-parsers that disagree. This is not
hypothetical. It is how the current situation arose, recorded in
`literal-blindness.test.ts`: *"each pass had hand-rolled its own partial tracking."*

And it nearly recurred twice on the day this note was written:

- `topLevelDefaultEq` is a private depth scanner, written instead of extending the shared one.
- The `messageText` fix landed in `batteries/` and left six copies untouched in
  `demo/src/capabilities.ts`, which is what broke four LLM examples.

`splitTopLevel`'s own docstring records the subtler version: it was extracted to stop a fourth
copy of a scan, and then two callers immediately wrote byte-identical wrappers around it — *"a
consolidation that goes three-to-one and grows two wrappers has gone three-to-three."*

So the rule is not "write small parsers". It is:

> **One implementation per concept, in a shared leaf, in the shape callers actually reach for,
> with a guardrail test that fails when a second copy appears.**

That is what made the lexical layer succeed, and it is the only thing that will make this
layer succeed.

## The measurable payoff

`preprocess` is quadratic in file size — a clean 4× per doubling, measured: 16KB 182ms, 32KB
642ms, 64KB 2.5s, 128KB 10.2s, 256KB 39.4s. Four files in the compat corpus are skipped
because of it, the largest extrapolating to ~37 minutes. It has never been localised to any
single transform, and the seventeen `source = transform(source)` steps sum to ~15ms — which is
what you would expect when the cost is **the shape** rather than one pass.

Seventeen transforms each re-scanning the source is the shape. Shared primitives that compute
positions once are the natural place for that cost to collapse. That makes this the first
parser work in this repo with a benchmark attached rather than only a cleaner design — and it
should be measured, not assumed.

## Sequencing

1. **`convert` validates its own output.** Orthogonal — reporting, not parsing — and it turns
   every remaining parse failure from a silent bad artifact into a named error. Today
   `tjs convert --emit-tjs` exits 0 and writes a `.tjs` that `tjs check` then rejects. The
   converter owns both halves and can check itself for free.
2. **Expression extent**, taking `<T = () => 0>` and `Schema.ts` with it — two of the seven
   remaining corpus failures, and the proof the approach pays.
3. **Colon disambiguation**, taking `RpcServer.ts` and `commandExecutor.ts`.
4. Reassess. If the remaining failures still reduce to grammar questions, the primitives have
   earned a CST; if they do not, they were cheap and the transforms are cleaner anyway.

## Status

Proposed, not started. Trigger condition met: `PLAN.md`'s parser reassessment says revisit
*if edge cases increase*, and the seven remaining compat-corpus failures reduce to roughly six
bugs, essentially all of this class.
