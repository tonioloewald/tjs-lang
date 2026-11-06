<!--{"parent": "the-tjs-language.md", "order": 11}-->
<!-- TODO review -->

# Small scoped parsers, not a rewrite

> **Design note for maintainers of the TJS parser.** It does not teach the language, and you
> do not need it to write TJS. It records why the `preprocess` stage of the parser
> (`src/lang/parser.ts`, `src/lang/parser-transforms.ts`, `src/lang/parser-params.ts`) is
> being given a small syntactic layer instead of being rewritten.
>
> **Status (checked 2026-11-06): partly done.** The convert self-check and the
> colon-disambiguation primitive have shipped; the expression-extent primitive has not been
> built; `preprocess` is still quadratic on long string literals. Details in
> [Status](#status) at the end.

## The diagnosis

The `preprocess` stage rewrites TJS-specific syntax into JavaScript before acorn ever sees
it. It does this with a long sequence of transforms built from regexes and character scans.
That worked while the rewrites were local. It stopped working, and the evidence was not a
hunch — it was the bug list from a single day (2026-09-02). Every bug below has since been
fixed, most of them by targeted repairs; the table is kept because it is the argument.

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

What was missing is the layer above: **syntactic primitives**, built on the lexical ones and
consumed by the transforms.

```text
  transforms           — the preprocess rewrites
  syntactic primitives — expression extent, colon disambiguation   (src/lang/expression-context.ts)
  lexical primitives   — literals, comments, braces, splitting      (src/strip-comments.ts)
```

This is not a rewrite. TS → TJS already runs on the TypeScript AST; TJS → JS already ends at
acorn. Only the middle is hand-rolled, and only the middle needs to change.

## Two primitives cover most of it

### 1. Expression extent

> Given a start offset, where does this expression end?

Respecting literals, nesting, and — the case that kept biting — `=>`. The cases that
motivated it:

- `<T = () => 0>`: the extractor counted brackets where it should consume an expression.
  (Fixed on 2026-09-02 another way: `parseGenericTypeParams` now splits the parameter list
  with `splitTopLevelTrimmed` and finds the first top-level `=` that is not part of `=>`,
  `==`, `<=`, `>=` or `!=`.)
- `function Array$(value):! { value: null } {`: where the return example ends and the body
  begins. (Parses today.)
- `topLevelDefaultEq` in `parser-transforms.ts`, written by hand on 2026-09-02, which is a
  degenerate case of this and should be deleted when the primitive lands.

**Not built.** Nothing in `src/` exports an expression-extent scanner, and the hand-written
scanners it would replace have multiplied rather than gone: `topLevelDefaultEq` is still in
`parser-transforms.ts`, and `parser-params.ts` now has a second copy of the same question,
`topLevelDefaultEquals` (added for typed defaults, `name: Type = default`).

### 2. Colon disambiguation

> Is this `:` a ternary's, a type annotation's, or an object key's?

It needs little more than "have I seen an unmatched `?` at this depth". It resolves the
ternary/arrow mangling in effect's `RpcServer.ts` and `commandExecutor.ts` — and it is the
same question behind the destructuring-rename bug, which was fixed by *guessing from the shape
of the value* because nothing could answer it directly.

**Shipped 2026-09-02** as `src/lang/expression-context.ts`: `isTernaryColon(source, index)`
for one question, and `ternaryColons(source)`, which finds every ternary-alternative colon in
one forward pass so a caller asking about many colons pays O(n) once. `parser-params.ts` uses
it. The first version walked backwards per query and went quadratic on many colons in one
expression; a process-wide memo added to fix that was thrashed by nested sources and was
removed. Its tests are `src/lang/expression-context.test.ts`.

Both are a few dozen lines, independently testable, and **not throwaway**: an expression-extent
scanner is a Pratt-parser fragment, and a CST builder needs exactly these. The incremental
work is a down payment on the rewrite, not scaffolding for it.

## The discipline that decides whether this works

The failure mode is proliferation — several half-parsers that disagree. This is not
hypothetical. It is how the current situation arose, recorded in
`literal-blindness.test.ts`: *"each pass had hand-rolled its own partial tracking."*

And it nearly recurred twice on the day this note was written (both since resolved):

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

`preprocess` is quadratic in file size on some inputs — a clean 4× per doubling. Measured on
2026-09-02 against effect's 1.96MB generated `httpApiSwagger.ts` (which is one long string
literal): 16KB 182ms, 32KB 642ms, 64KB 2.5s, 128KB 10.2s, 256KB 39.4s, extrapolating to ~37
minutes for the whole file. Re-measured 2026-11-06 on prefixes of the same literal: 16KB
105ms, 32KB 397ms, 64KB 1.6s, 128KB 6.3s — faster, still 4× per doubling. Ordinary code of
the same size is linear (about 64ms for 128KB of small functions). `scripts/compat-scan.ts`
skips corpus files over 400KB for this reason, and prints each skip.

It has never been localised to any single transform; the individual
`source = transform(source)` steps measured on 2026-09-02 summed to ~15ms — which is what you would
expect when the cost is **the shape** rather than one pass.

Many transforms each re-scanning the source is the shape. Shared primitives that compute
positions once are the natural place for that cost to collapse. That makes this the first
parser work in this repo with a benchmark attached rather than only a cleaner design — and it
should be measured, not assumed.

## Sequencing

As proposed on 2026-09-02, with what has happened since:

1. **Done.** **`convert` validates its own output.** Orthogonal — reporting, not parsing — and it turns
   every remaining parse failure from a silent bad artifact into a named error. Today
   `tjs convert --emit-tjs` exits 0 and writes a `.tjs` that `tjs check` then rejects. The
   converter owns both halves and can check itself for free. (Now it does:
   `src/cli/convert-self-check.test.ts`.)
2. **Not started.** **Expression extent**, taking `<T = () => 0>` and `Schema.ts` with it — two of the seven
   remaining corpus failures, and the proof the approach pays. (Both were fixed by other
   means the same day; see above.)
3. **Done.** **Colon disambiguation**, taking `RpcServer.ts` and `commandExecutor.ts`.
4. **Due.** Reassess. If the remaining failures still reduce to grammar questions, the primitives have
   earned a CST; if they do not, they were cheap and the transforms are cleaner anyway.

## Status

**Checked 2026-11-06: partly done.**

- The trigger was met on 2026-09-02: `PLAN.md`'s parser reassessment said revisit *if edge
  cases increase*, and the seven compat-corpus failures then remaining reduced to roughly six
  bugs, essentially all of this class.
- The same day the corpus reached 1973/1973 files converting and parsing, and the ratchet's
  known-failure list (`KNOWN` in `scripts/compat-scan.ts`) has been empty since. The bug list
  no longer argues for the work.
- Shipped: the convert self-check, and colon disambiguation (`src/lang/expression-context.ts`).
- Not shipped: expression extent. The duplication it was meant to remove has grown (two
  top-level-`=` scanners), and the quadratic it was meant to collapse is still there. Those two,
  not corpus failures, are what remains of the case for it.
