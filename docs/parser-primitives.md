<!--{"parent": "the-tjs-language.md", "order": 11, "book": ["default"]}-->
<!-- TODO review -->

# Small parsers for the TJS preprocessor

> **Design note for maintainers of the TJS parser.** It does not teach the language, and you
> do not need it to write TJS. The question was whether to rewrite the `preprocess` stage of
> the parser (`src/lang/parser.ts`, `src/lang/parser-transforms.ts`,
> `src/lang/parser-params.ts`). This note says no: give it a small layer of shared syntactic
> helpers instead, and explains why.
>
> **Status (checked 2026-11-06): partly done.** See [Status](#status) at the end.

## The pipeline

TJS turns into JavaScript in three steps:

```text
TJS source  →  preprocess  →  acorn  →  emit
```

acorn is a standard JavaScript parser. It cannot read TJS syntax: in `function f(x: 0)`
the `: 0` is an example value, which is not JavaScript. So `preprocess` first rewrites
TJS-specific syntax into plain JavaScript (here `function f(x)`, with the example kept as
metadata), and only then does acorn parse it. `preprocess` is a long sequence of transforms,
each a regex or a hand-written character scan over the source text.

Converting TypeScript to TJS (`fromTS`) already works on the TypeScript compiler's syntax
tree, and everything after `preprocess` works on acorn's. Only `preprocess` is hand-rolled,
so only `preprocess` is in question.

## The diagnosis

The transforms worked while the rewrites were local. They stopped working, and the evidence
was not a hunch: it was the bug list from a single day (2026-09-02).

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

Glosses: a *dictionary member* is a parameter default written as an object
(`opts = { x: 0 }`, see [dictionary defaults](/dictionary-defaults/)); the *polymorphic merge*
combines same-named function declarations into one dispatcher; `:!` marks a return example
that is a type only, not a tested value. In the second row, `const { a: b } = o` (rename `a`
to `b`) looks to a regex exactly like a member with example `b`.

Most rows have since been fixed by targeted repairs; one has not (see [Status](#status)). The
table stays because it is the argument.

Every one is the same shape: **a scanner that knows characters but not grammar.** They reduce
to two questions that masking (blanking out strings and comments so a scan cannot misread
them) cannot answer, because both are about grammar, not about which characters are code:

1. **Where does this expression end?**
2. **What does this `:` mean here?**

## The layer that is missing

The repo already has a **lexical** layer, and it works. `src/strip-comments.ts` owns literals,
comments, balanced braces (`matchingBrace`) and depth-aware splitting (`splitTopLevel`).
Consolidating on it closed the whole *literal-blindness* family (a pass misreading code that
merely mentions the syntax it scans for, such as a `:` inside a string): six live bugs across
eight files at `0.13.0-beta.1`. `src/lang/literal-blindness.test.ts` keeps it closed.

What is missing is the layer above: **syntactic primitives**, built on the lexical ones and
used by the transforms.

```text
  transforms           — the preprocess rewrites
  syntactic primitives — expression extent, colon disambiguation   (src/lang/expression-context.ts)
  lexical primitives   — literals, comments, braces, splitting      (src/strip-comments.ts)
```

## Two primitives cover most of it

### 1. Expression extent

> Given a start offset, where does this expression end?

Respecting literals, nesting and, the case that kept biting, `=>`.

The reason that still holds is duplication. Two hand-written scanners answer a special case
of this question ("where is the top-level `=`?"): `topLevelDefaultEq` in
`parser-transforms.ts`, and `topLevelDefaultEquals` in `parser-params.ts` (added for typed
defaults, `name: Type = default`). Both should be deleted when the primitive lands.

Native `Generic` headers are the other open case. `Generic Box<T = () => 0> { … }` is still a
syntax error, parenthesised or not, because the `<…>` scan still stops at `=>`'s `>`.

Historical motivation, now fixed by other means:

- `<T = () => 0>` in converted TypeScript. `fromTS` rewrites the default to a
  `FunctionPredicate(…)` before the TJS parser sees it, and `parseGenericTypeParams` splits
  the parameter list with `splitTopLevelTrimmed` and finds the first top-level `=` that is not
  part of `=>`, `==`, `<=`, `>=` or `!=`.
- `function Array$(value):! { value: null } {`: where the return example ends and the body
  begins. This parses now.

**Not built.** Nothing in `src/` exports an expression-extent scanner.

### 2. Colon disambiguation

> Is this `:` a ternary's, a type annotation's, or an object key's?

One line can hold all three:

```text
function sign(x: 0) { return x < 0 ? { sign: -1 } : { sign: 1 } }
               ^                           ^      ^       ^
```

From left: an example value, an object key, the ternary's colon, another object key.

It needs little more than "have I seen an unmatched `?` at this depth". It resolved the
ternary/arrow mangling in two files of the compat corpus (real TypeScript projects such as
zod and effect that the repo converts as a test; `RpcServer.ts` and `commandExecutor.ts` are
from effect). It is also the question behind the destructuring-rename bug, which was fixed by
*guessing from the shape of the value* because nothing could answer it directly.

**Shipped 2026-09-02** as `src/lang/expression-context.ts`: `isTernaryColon(source, index)`
for one colon, `ternaryColons(source)`, which finds every ternary-alternative colon in one
forward pass so a caller asking about many colons pays O(n) once, and the reference
implementation `isTernaryColonScan`. `parser-params.ts` uses it. The first version walked
backwards per query and went quadratic on many colons in one expression; a process-wide memo
added to fix that was thrashed by nested sources and was removed. Its tests are
`src/lang/expression-context.test.ts`.

Each primitive is small and independently testable, and **not throwaway**. An
expression-extent scanner is a fragment of a Pratt parser (the standard operator-precedence
technique for parsing expressions), and a CST (concrete syntax tree: a parse tree that keeps
every character, so source can be rewritten losslessly) needs exactly that to parse
expressions. So the incremental work is a down payment on a rewrite, not scaffolding for one.

## The discipline that decides whether this works

The failure mode is proliferation: several half-parsers that disagree. This is not
hypothetical. It is how the current situation arose, recorded in
`literal-blindness.test.ts`: *"each pass had hand-rolled its own partial tracking."*

It nearly recurred twice on the day this note was written:

- `topLevelDefaultEq` is a private depth scanner, written instead of extending the shared one.
  This is still open, and has gained a sibling, `topLevelDefaultEquals`.
- Outside the parser, the same copy-drift: a `messageText` fix landed in `batteries/` and left
  six copies untouched in `demo/src/capabilities.ts`, which broke four LLM examples. That one
  is resolved; the demo now imports the shared `messageText`.

`splitTopLevel`'s own docstring records the subtler version: it was extracted to stop a fourth
copy of a scan, and then two callers immediately wrote byte-identical wrappers around it — *"a
consolidation that goes three-to-one and grows two wrappers has gone three-to-three."*

So the rule is not "write small parsers". It is:

> **One implementation per concept, in a shared leaf, in the shape callers actually reach for,
> with a guardrail test that fails when a second copy appears.**

That is what made the lexical layer succeed, and it is the only thing that will make this
layer succeed.

## The measurable payoff

`preprocess` is quadratic in file size on some inputs: doubling the input quadruples the
time. The input is prefixes of effect's 1.96MB generated `httpApiSwagger.ts`, which is one
long string literal.

| size | 2026-09-02 | 2026-11-06 |
| --- | --- | --- |
| 16KB | 182ms | 105ms |
| 32KB | 642ms | 397ms |
| 64KB | 2.5s | 1.6s |
| 128KB | 10.2s | 6.3s |
| 256KB | 39.4s | — |

The 2026-09-02 series extrapolated to about 37 minutes for the whole file. Ordinary code of
the same size is linear: about 64ms for 128KB of small functions. `scripts/compat-scan.ts`
skips corpus files over 400KB for this reason, and prints each skip.

Where the time goes is **not known**. Timing the individual `source = transform(source)`
steps on 2026-09-02 accounted for only about 15ms of it, so no single transform is to blame.
The hypothesis is that the cost lies in many transforms each re-scanning the source, and that
shared primitives which compute positions once would collapse it. That is a hypothesis to
measure, not a result: a slowdown triggered by one long string literal may well sit in the
lexical layer instead. Either way, this is the first parser work in this repo with a
benchmark attached rather than only a cleaner design.

## Sequencing

As proposed on 2026-09-02, with what has happened since:

1. **Done.** **`convert` validates its own output.** Orthogonal (reporting, not parsing), and
   it turns every remaining parse failure from a silent bad artifact into a named error.
   Before this, `tjs convert --emit-tjs` exited 0 and wrote a `.tjs` that `tjs check` then
   rejected. The converter owns both halves, so it can check itself; it now does
   (`src/cli/convert-self-check.test.ts`).
2. **Not started.** **Expression extent.** Proposed to fix `<T = () => 0>` and effect's
   `Schema.ts`, two of the seven corpus failures then remaining. Both were fixed by other
   means the same day. What it would deliver now: one scanner in place of the two top-level-`=`
   copies, native `Generic` headers with arrow defaults, and possibly the quadratic.
3. **Done.** **Colon disambiguation**, which fixed `RpcServer.ts` and `commandExecutor.ts`.
4. **Due.** Reassess. If the remaining failures still reduce to grammar questions, the
   primitives have earned a CST; if they do not, they were cheap and the transforms are
   cleaner anyway.

## Status

**Checked 2026-11-06: partly done.**

- The trigger was met on 2026-09-02: `PLAN.md`'s parser reassessment said revisit *if edge
  cases increase*, and the seven compat-corpus failures then remaining reduced to roughly six
  bugs, essentially all of this class.
- The same day the corpus reached 1973/1973 files converting and parsing, and the ratchet's
  known-failure list (`KNOWN` in `scripts/compat-scan.ts`) has been empty since. The corpus no
  longer argues for the work.
- Shipped: the convert self-check, and colon disambiguation (`src/lang/expression-context.ts`).
- Not shipped: expression extent. What remains of the case for it, none of it a corpus
  failure:
  - two top-level-`=` scanners where there should be one;
  - native `Generic` headers with an arrow default (`<T = () => 0>`) are still a syntax error;
  - two sites in `parser-transforms.ts` (the `FunctionPredicate` and `Generic` generic forms)
    still derive type-parameter names with a plain `.split(',')` then `.split('=')`, the
    mechanism in the table, instead of `parseGenericTypeParams(...).names`;
  - the quadratic on long string literals, whose cause is unmeasured.
- No decision has been taken on step 4. Until one is, nothing is scheduled.
