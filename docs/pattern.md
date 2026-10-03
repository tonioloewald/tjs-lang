<!--{"parent": "ajs.md", "order": 8}-->

# Pattern: declarative matching for TJS and AJS, and regex as an opt-in

**Status: proposed (Tonio, 2026-10-02); priorities and packaging settled 2026-10-03, see below.** Regex is deprecated in AJS in 0.14 and removed from the
core VM in 0.15. Hosts that want it opt back in. Its replacement is `Pattern`: a grammar built as
DATA by a fluent builder and run by one engine. This note began as an imperative `Scanner`
proposal; an outside draft (Gemini, with Tonio's guidance) argued for a declarative builder, and
that is the better shape for this project. The draft's specifics were challenged; the outcomes
are recorded below.

## Priorities: a standalone library, dogfooded to diamond hardness (Tonio, 2026-10-03)

> "Our goal for Pattern is to build a code editing skill around it and share it across the repo.
> Pattern would become a standalone library and between using it to replace regex as much as
> possible in our compilation code and using it to edit code we should dogfood it to diamond
> hardness."

This restates what the note already argued (see "Design input: editing source": Pattern should
prevent the edit failures sed-style editing produces constantly) and settles the order and the
packaging. Pattern is a **standalone library** whose first and heaviest users are us. Three users,
each a different stress:

1. **Code editing.** A skill agents use to edit source in every repo: the code mode, unique-match
   edits, dry run, CLI. This is the daily load, measured by edits that apply the first time.
2. **Our compilation code.** Regex and hand-rolled scans in the TJS/AJS front ends are replaced
   wherever Pattern can, each replacement held byte-identical over the dogfood and compat
   corpora. This is the correctness load.
3. **AJS.** The VM builtin replacing guest regex, metered by construction. It comes last, and is
   hardened by the two above.

**Packaging (decided, Tonio 2026-10-03):** its **own repo and npm package** (working name
`tosijs-pattern`), zero dependencies, its own tests and releases. tjs-lang depends on it as it does
on tosijs-schema, and other repos (tosijs-ui, service-compris) can use it without tjs-lang. **The
code-editing skill ships with it**: a SKILL.md plus a small CLI in the same repo, so the skill and
the engine change together. tosijs-coding-practices points every repo at it.

## Regex is not a parser, and Pattern does not pretend it is (Tonio, 2026-10-03)

> "The worst features in Regex are basically workarounds to allow it to do slightly more terrible
> things to work around the fact that it's simply not a parser." "To the extent we can't just
> convert regex into Pattern it will reflect that regex does not correctly reflect intent."

- **What regex costs.** A backtracking regex always terminates, but its worst case is
  exponential, and with backreferences matching is NP-hard. Its cost cannot be read from its
  source, which is why this project spent review rounds metering it. Pattern's cost is a property
  of the engine.
- **The conversion rule.** Simple regexes convert to Pattern mechanically. Where one cannot, the
  converter does not approximate: it explains the site and points to the docs. An inconvertible
  regex is EVIDENCE that the regex does not state its intent (a lookaround standing in for
  structure, a backreference standing in for a grammar). The refusal is the useful output.
- **The long term.** Pattern paves the way to eliminating regex from TJS itself, not only from
  AsyncJS: the transpiler's own regex and hand-rolled scans first (see the priorities above), then
  the language surface.

## The goal: cost it accurately, for free

The point is not to stop ReDoS (Tonio, 2026-10-02). The point is that whatever a pattern
costs is **charged accurately, as a side effect of running it**, with no metering bolted on.
In the engine, one step of execution IS one unit of charge: the cost model and the execution
model are the same loop. A pattern that does exponential work is then not a vulnerability; it
runs out of fuel, and the run fails honestly with an error naming it. That is the same contract
every other AJS operation has.

Regex could not offer that for free. A backtracking engine's work is invisible to the caller.
Our own linear engine got there only after three review rounds added meters to every place it
did work and caps to every quantity that grew with the pattern. Each round found another place
the work was not being counted.

## Why replace regex

Regex was the most expensive surface of the 0.14.0 release. It took three review rounds
(`docs/reviews/0.14.0-rc.2-rereview-{6,7,8}.md`) and produced a 7 KB engine of its own, a
generated Unicode fold table, two differential fuzzers, and a long list of caps and meters. Even
metered, it is a second language inside the language, and every reviewer has to re-verify its
semantics against ECMAScript.

Regex is also hard to get right, for models and people alike, and its failures are silent: a
pattern that is almost right still parses and still matches. This release is evidence. A
star-height screen certified `/a*a*c/`; hand-written case-fold rules were wrong four ways; and the
engine itself diverged from JavaScript on nested quantifiers until a fuzzer looked.

## Why a declarative Pattern (not an imperative scanner)

A pattern is a value, not a procedure:

- **Serializable.** It can be persisted, cross the capability membrane, and travel inside a
  `$predicate`. The portable predicate VM (`docs/type-system-north-star.md`) can carry it, where
  it could never carry ECMAScript regex.
- **Readable.** `Pattern.number()` says what it matches. Captures come back as a NAMED
  dictionary, not as positional groups.
- **Diagnosable.** A failed match reports where and what was expected, not just `null`.
- **Usable for validation.** CSS predicates and `$predicate` can use it, which an imperative
  scanner could not.

## Semantics: PEG, stated plainly

The semantics are chosen for **predictability**, not as a safety mechanism (charging is the
safety mechanism). They make a pattern's cost easy to read off the pattern:

- **Repetition is possessive.** `oneOrMore(p)` takes as much as it can and never gives any back.
- **Choice is ordered.** `anyOf(a, b)` tries `a` first; if `a` succeeds, `b` is never tried, even
  if the rest of the pattern then fails.
- **No recursion in v1.** Patterns are finite trees. `Pattern.ref` (recursive rules, for nested
  parentheses) needs packrat memoization to stay bounded, and is deferred.

Consequences, documented wherever the API is:

- **Behaviour differs from regex, predictably.** `oneOrMore(digits())` then `exactly('5')` FAILS
  on `"1235"`: the digits already took the 5. The grok tasks include cases where this matters.
- **Anchored matching (`parse`) is linear** in the input times the pattern size.
- **Unanchored search (`replace`, `matchAll`) is O(n²) in the worst case**, because it attempts a
  match at each position. (A Pike VM does this in one pass; a PEG does not.) That is acceptable
  because every step is charged: the cost is accurate, not hidden. A first-character set
  computed from the pattern skips most start positions cheaply, as an optimisation.
- **Recursion (later) does not need memoization for safety.** Exponential re-parsing would be
  charged step by step and run out of fuel. Packrat memoization is a performance choice for
  grammars that need it.

## Primitives: loops over character ranges, never RegExp (decided)

Primitives are plain loops over merged character-range tables (the ones the regex engine already
builds), **not** sticky `RegExp` calls. Host regex inside the VM would bring back the dependency
this replaces and tie the portable VM to ECMAScript regex. Range loops are also faster than a
regex call per token, and port to any language in an afternoon.

## The API (draft)

Combinators take sub-patterns. There are no modifier flags that apply to "the next token": those
are stateful and order-sensitive, cannot group a sequence, and need getters, which the VM treats
as code. Each thing has one way to write it.

```js
const price = Pattern.exactly('foo:')
  .maybe(Pattern.spaces())
  .capture('amount', Pattern.number())

price.parse('foo: 42.5')
// { success: true, match: 'foo: 42.5', length: 9, captures: { amount: 42.5 }, error: null }
price.parse('foo: x')
// { success: false, error: 'expected number at 5', ... }

price.replace('Cost is foo: 42.50', '(USD {amount})')  // 'Cost is (USD 42.5)'
for (const m of price.matchAll(text)) { /* m.captures.amount */ }
```

| Builder | Matches |
|---|---|
| `exactly(str, { caseless? })` | the literal |
| `chars(set)` / `notChars(set)` | one or more characters in / not in a range string (`'a-z0-9_'`) |
| `digits(n?)`, `spaces()`, `word()`, `letters()` | named shortcuts over `chars` (`letters` is Unicode-aware) |
| `number()` | JSON's number grammar exactly (so `-1`, `1.5`, `1e5`; not `.5` or `+1`) |
| `until(str)` | everything up to (not including) a literal |
| `start()`, `end()` | anchors |
| `maybe(p)`, `oneOrMore(p)`, `zeroOrMore(p)`, `repeat(p, min, max)` | repetition (possessive) |
| `anyOf(p1, p2, …)` | ordered choice (strings are shorthand for `exactly`) |
| `not(p)` | negative lookahead: succeeds without consuming if `p` fails |
| `capture(name, p)` | names what `p` matched |
| `quoted(q, { escape? })` | a quoted span, no nesting; `escape` is a character (`'\\'`) or `'double'` (`""` inside `"…"`, as CSV does); captures the unescaped inside |
| `balanced(open, close, { escape?, quotes? })` | a NESTED span: `(a (b) c)` closes at its own `)`; `quotes` names quote characters whose contents are skipped, so `f(")")` closes correctly |
| `sepBy(p, sep)` | zero or more `p` separated by `sep`; captures an ARRAY |

- **Delimited spans are what regex cannot do** (Tonio, 2026-10-02; the capability matters, not
  the name). Balanced delimiters are not a regular language, so no regex matches `(a (b) c)` to
  its own closing parenthesis, and the usual workarounds are wrong on nesting, on escapes, or on
  delimiters inside quotes. `quoted` and `balanced` are each one linear pass: a depth counter, an
  escape rule, and (for `balanced`) quote characters whose contents are skipped. Cost is one
  charge per character scanned, like every primitive. They cover the common reason people reach
  for recursive grammars, without `Pattern.ref`.

  CSV, correctly (quoted fields, doubled-quote escapes, commas and newlines inside quotes):

  ```js
  const field = Pattern.anyOf(
    Pattern.quoted('"', { escape: 'double' }),
    Pattern.maybe(Pattern.notChars(',\n')) // an empty field (`a,,b`) is a field too
  )
  const row = Pattern.capture('fields', Pattern.sepBy(field, ','))
  const csv = Pattern.capture('rows', Pattern.sepBy(row, '\n'))

  csv.parse('name,quote\n"Ada","said ""hi"", then left"').captures.rows
  // [{ fields: ['name', 'quote'] }, { fields: ['Ada', 'said "hi", then left'] }]
  ```

  Captures nest: a `capture` inside each element of a `sepBy` yields one dictionary per element,
  so the result has the shape of the grammar.

  And a call's arguments, nested and quote-aware:

  ```js
  Pattern.word().capture('args', Pattern.balanced('(', ')', { quotes: '"\'' }))
    .parse('f(a, g(b), ")")')   // captures.args === 'a, g(b), ")"'
  ```

- **Typed captures:** a capture is a string, unless its primitive defines a value (`number()`
  captures a number).
- **Immutable:** every builder call returns a new pattern (a small, charged allocation in the VM).
- **`replace` takes a template** (`'{name}'` placeholders), not a callback. Anything more is a
  `matchAll` loop in ordinary code.
- **Cost in the VM:** every engine step is one charge, and every result goes through
  `allocate()`. There is no other work, so nothing can go uncounted.

## One engine, two hosts

`tjs-lang/pattern` is a library usable from plain JS and TJS. The VM exposes the same engine as a
builtin (a VM-built value, like `Set()` and `Date()`). There is one implementation, held honest
by a differential test, the same arrangement as predicates.

## Regex as an opt-in

- **`tjs-lang/regex` → `regexAtoms`**, registered like `batteryAtoms`. These are atoms on the
  linear engine (`src/vm/regex.ts`, moved out of the core), so they keep the run's fuel and heap
  budgets.
- **A host's own capability:** a host can inject native `RegExp` behind a capability. Fuel cannot
  see inside a capability, so a catastrophic pattern there is the host's to own, as with any
  capability.

## Migration: the transpiler converts what it can prove (Tonio, 2026-10-02)

The AJS transpiler detects each regex and either **converts it to the equivalent Pattern** or
**explains how to write it**, the same discipline as `switch-to-given` (`src/lang/switch-to-given.ts`):
rewrite only where the meaning provably does not change.

A conversion is exact when possessive matching cannot differ from backtracking. Regex can give
characters back to its continuation and retry later alternatives; a PEG cannot. They agree when
nothing would ever need giving back:

- a repetition's character set is **disjoint from the first set of what follows it** (`\d+px`
  converts; `\w+\d` does not — `\w+` would swallow the digit);
- an alternation's branches **cannot start the same way**, or each one is followed by nothing
  the others could also reach.

Everything else gets a diagnostic at the regex's location that names the problem ("`\w+` is
followed by `\d`, which `\w` also matches; a Pattern would take the digit too") and shows the
nearest Pattern. Backreferences and lookbehind have no Pattern equivalent, and the diagnostic
says so.

The oracle already exists: the converter is fuzzed against the linear regex engine (random
patterns, random inputs) and must agree everywhere it converts. In 0.14 the conversion is a
**suggestion** printed with the deprecation warning; in 0.15, when regex leaves the core, it is
what `tjs convert`-style migration applies.

## Sequencing

| Release | AJS core | Opt-in |
|---|---|---|
| 0.14 | Regex works (linear, metered); **the transpiler warns** on every use: "deprecated: use Pattern, or register regexAtoms". `Pattern` ships if the design settles, otherwise in 0.14.x. | — |
| 0.14.x | `Pattern` | `tjs-lang/regex` (`regexAtoms`) |
| 0.15 | **Regex removed**: literals, `regexMatch`, regex arguments to `match`/`search`/`replace`/`replaceAll`/`split`. The engine leaves `vm-ast` (~7 KB gzipped). | `tjs-lang/regex` |

**Removal gate:** `bun run test:grok` shows the pinned small model writes Pattern code that is
**correct on held-out inputs**, at a rate comparable to its regex rate. Score behaviour, not
compilation: a regex that compiles can still be subtly wrong, and scoring compilation would
count those as passes. Each grok task carries test inputs the model never sees, edge cases
included (possessive repetition among them), and both styles are scored on what they return. The
expectation (Tonio, 2026-10-02) is that Pattern wins this, not merely ties.

## Design input: editing source (Tonio, 2026-10-02)

Regex-driven edits fail often, for agents as much as people. One session's record (the agent
that wrote this note, editing this repo):

1. **Formatting drift** (most common): an exact-text edit fails because a formatter re-wrapped
   the line in between. The intent was "the call to `compileRegex` with these arguments", not
   "these characters". A pattern of tokens with flexible whitespace, plus `balanced('(', ')')`
   for the argument list, matches the intent regardless of line breaks.
2. **Escaping layers**: regex inside sed inside a heredoc, or inside a Python string, needs
   escaping at every layer, and several patterns needed a second try. A builder takes literals
   literally (`exactly('compileRegex(')`): there is nothing to escape.
3. **Semantic slips**: a replacement string `false && a || b` did not mean what was intended,
   because precedence inside a replacement is invisible. A structured edit replaces a node.

So Pattern should be good at editing code, not only at reading data:

- **A code mode**: whitespace and comments between tokens are skipped, and `balanced` and
  `quoted` understand the host language's strings, template literals and comments.
- **Edit safety**: an edit can require a unique match (or state how many), and a dry run shows
  each match in context before anything is written.
- **A CLI** (for example `tjs pattern replace <file> …`), so agents and people can use it
  outside the VM. That is also where its value is easiest to measure: edits that apply first time.

## Performance: expectations, to be measured (Tonio, 2026-10-02)

Native regex will win some cases: V8 compiles a pattern to machine code with fast literal
scanning, so short, simple, anchored patterns on short inputs (most CSS values) favour it on
constant factors. Pattern in JavaScript should win wherever regex backtracks, wherever it cannot
express the job (nesting, quoting), and wherever structured captures save a second pass. Its
cost is also the cost charged, where native regex is fast on average and unbounded at worst.

A Rust engine (to wasm; `docs/ajs-native-vm.md`) is where results may get interesting. Because a
pattern is DATA, the same grammar runs on it unchanged: the regular subset (no `balanced`)
compiles to a DFA — linear with a tiny constant, as Rust's `regex` crate does — and `balanced`
stays a depth counter. The catch is the boundary: copying a string into wasm memory per call can
dominate tiny inputs, so the wins are long inputs, batch validation (a whole theme per call), or
a VM that already lives in wasm. Swapping the engine never touches anyone's patterns, which is
hard to do with regex: any engine that runs one has to match ECMAScript's semantics exactly.

**Measure, don't guess:** one benchmark corpus — CSS values, CSV rows, log lines, nested calls —
run across native regex, the linear regex engine, Pattern in JavaScript, and later Pattern in
wasm, with results dated in `benchmarks.md`.

## Later: the transpiler itself (Tonio, 2026-10-02)

The same engine could replace the regex and hand-rolled scanning transforms in our own front
ends. That is where three of this project's chronic problems live:

- **Literal-blindness**, the dominant defect class (`src/lang/literal-blindness.test.ts`): a pass
  that mis-reads code mentioning the syntax it scans for. `quoted` and `balanced` make literal-
  and brace-awareness part of the grammar instead of something each pass re-implements.
- **Pre-budget parse cost.** Parsing runs before any budget exists, which is why the 0.14.0
  reviews spent nine rounds on super-linear shapes in the AJS preprocessor, and why front ends
  must run outside the VM host's trust boundary or behind `maxSourceBytes`. A Pattern-based front
  end charges every step, so transpiling untrusted AJS gets a fuel budget like everything else.
- **The parser-primitives direction** (`docs/parser-primitives.md`): scoped parsers for
  expression extent and colon disambiguation are grammar fragments; Pattern is the substrate.

The point is **correctness**; speed is the cost (Tonio, 2026-10-02). Native regex is fast and
a Pattern pass may be slower; that is measured and reported per pass, and accepted where the pass
becomes correct by construction. It is not a gate. Migration is per pass, each held to its old self
byte-for-byte over the dogfood and compat corpora: the AJS preprocessor first (four steps,
untrusted input), then the TJS transforms one at a time. Not before `Pattern` itself is solid.

## Out of scope for now: predicates

`compilePredicate`, `tjs-lang/css` and `$predicate` keep regex on the linear engine. JSON
Schema's `pattern` keyword is ECMAScript regex by definition. Moving predicates to `Pattern` is
a likely next step, since the pattern is data, but it is a separate decision, made after
`Pattern` exists.

## Open decisions

0. ~~The goal~~: **decided** — not to prevent ReDoS, but to charge whatever a pattern costs,
   accurately and for free (one engine step = one charge) (Tonio, 2026-10-02).
1. ~~Primitives via sticky RegExp~~: **decided** — range loops (Tonio agreed, 2026-10-02).
2. PEG semantics (possessive repetition, ordered choice), for predictability, with the
   documented O(n²) unanchored search.
3. Combinators taking sub-patterns, instead of modifier flags on the next token.
4. Primitive definitions: `number()` = JSON's grammar; a general `chars(set)`.
5. Typed captures (`number()` captures a number).
6. `replace` takes a template, not a callback.
7. One engine for `tjs-lang/pattern` and the VM builtin.
8. No recursion in v1.
