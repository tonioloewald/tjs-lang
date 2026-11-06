<!--{"parent": "ajs.md", "order": 8}-->
<!-- TODO review -->

# Pattern: the planned replacement for regex in AJS

Regex in AJS is on its way out. This page says what that means for agents you write and VMs you
host today, then keeps the design history of its replacement, `Pattern`. Pattern is now its own
library, [tosijs-pattern](https://pattern.tosijs.net)
([source](https://github.com/tonioloewald/tosijs-pattern)), and its documentation is the
current reference for the design. Where it differs from the history below, it wins.

Why replace regex at all: regex is a second language inside AJS. Its cost is hard to meter (the
0.14.0 release spent three review rounds making the VM's engine charge for all of its work), and
its mistakes go unnoticed, because a pattern that is almost right still parses and still matches.
Pattern is a grammar built as data by a fluent builder, and every step the engine takes is
charged as fuel, so its cost is accounted for by construction. The long version is under
[Why replace regex](#why-replace-regex) in the design history.

A few terms used on this page, each covered in its own chapter: **fuel** is the VM's budget for
work, charged per operation, and a run stops when it runs out ([The Language](../DOCS-AJS.md));
an **atom** is a named operation the VM provides, called from AJS with named inputs
([Atom Reference](../guides/ajs-atoms.md)); the **membrane** is the copy-and-check every value
goes through when it crosses between the guest and the host, and an atom tagged
`effects: 'io'` has its inputs and outputs sent through it
([Capabilities and Custom Atoms](../guides/ajs-capabilities.md)).

## What changes for your agents

**Today (0.14.0-rc.10), nothing.** Regex literals work in AJS in `match`, `search`, `replace`,
`replaceAll` and `split`, and as the `pattern` of the `regexMatch` atom. They run on the VM's own
linear-time engine, never the host's, and their work is charged as fuel. The supported subset and
its limits are in [The Language](../DOCS-AJS.md) under "Regular expressions".

**The plan, which is not yet built:**

| Step | What happens | Status |
| --- | --- | --- |
| Deprecation | The transpiler warns on every regex use: literals, `regexMatch`, and regex arguments to the string methods. | Planned, not yet built: the transpiler does not warn today. Whether the warning lands in 0.14.0 or a 0.14.x patch is not decided. |
| The replacement | A `Pattern` builtin in AJS (planned name; it may change while the library is 0.x), running the tosijs-pattern engine with its steps charged as fuel. Regex literals that translate exactly become Pattern at compile time; the rest are compile errors that say why. | tosijs-pattern 0.1.0 exists as a library, not yet on npm. The AJS builtin does not exist. |
| Removal | Regex leaves the core VM: literals, `regexMatch`, and regex arguments to `match`/`search`/`replace`/`replaceAll`/`split`. | Planned for 0.15, but only once a gate passes; if it has not passed, removal waits. The gate: a small language model the project pins for this measurement writes Pattern code that is correct on held-out inputs at least as often as it writes correct regex (the project's `test:grok` lane). |

**What to do now.** Write agents that will survive the change:

- Prefer plain string methods where they do the job: `split(' ')`, `includes`, `startsWith`,
  `endsWith`, `slice`, `trim`, `toLowerCase`. They are not affected by any of this.
- Keep the regexes you do write simple: a character class, a repetition, a literal, an anchor.
  Those are the ones that translate to Pattern mechanically. A regex whose match depends on a
  repetition giving characters back (`\w+\d`: `\w+` must leave the last digit for `\d`) will
  not translate, and will need rewriting by hand.

## Migrating a regex: an example

The variation in [String Processing](../guides/examples/ajs/string-processing.md) uses three
regexes:

```javascript
let words = text.toLowerCase().match(/[a-z]+/g)
let slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
```

Here is the same work in tosijs-pattern 0.1.0. This is the **library**, run as ordinary
JavaScript; the AJS builtin does not exist yet, so this is not AJS code and will not run in an
agent. tosijs-pattern is not on npm yet, so to try this today, clone
[the repository](https://github.com/tonioloewald/tosijs-pattern) and, under Bun, import from its
`src/index.ts` in place of `'tosijs-pattern'`.

```javascript
import { pattern, fromRegex } from 'tosijs-pattern'

const text = 'The quick brown fox jumps over the lazy dog. The dog sleeps.'
const lower = text.toLowerCase()

// /[a-z]+/g: one or more lowercase letters, everywhere they occur
const words = pattern.lowercaseLetters().findAll(lower).map((m) => m.text)

// the slug: the runs of letters and digits, joined by '-'
// (charsIn matches one or more characters in the range string)
const slug = pattern.charsIn('a-z0-9').findAll(lower).map((m) => m.text).join('-')

// words.length === 12, new Set(words).size === 9
// slug === 'the-quick-brown-fox-jumps-over-the-lazy-dog-the-dog-sleeps'

// fromRegex converts a regex it can translate exactly, and toCode() returns
// the equivalent Pattern source as a string:
fromRegex(/[a-z]+/g).toCode() // 'pattern.lowercaseLetters()'
```

Two things to notice. `fromRegex` is the library's converter: it turns a regex into the
equivalent Pattern, or refuses one it cannot translate exactly (it refuses `/\w+\d/` and
converts `/\d+px/`). The simple regexes convert mechanically. And the slug is clearer once it is stated as
what it is: the regex version replaces the gaps with dashes and then trims stray dashes from the
ends; the Pattern version collects the words and joins them, so there are no stray dashes to
trim.

The literal translation of `/^-+|-+$/` works too. Each piece is available both as a function on
`pattern` and as a method, and chaining a method means "followed by", so
`pattern.start().oneOrMore('-')` is "the start, followed by one or more dashes":

```javascript
const ends = pattern.oneOf(pattern.start().oneOrMore('-'), pattern.oneOrMore('-').end())
ends.replaceAll('--a-b--', '') // 'a-b'
```

The vocabulary is at
[pattern.tosijs.net/vocabulary](https://pattern.tosijs.net/vocabulary/), and it is 0.x: names may
still change before the AJS builtin is built.

## For hosts: keeping regex after it leaves the core

Two ways are planned, both at the host's own risk:

- **`regexAtoms`**, from a planned `tjs-lang/regex` entry point, registered like `batteryAtoms`:
  the linear engine moved out of the core VM, still charged to the run's fuel and heap budgets.
  This entry point does not exist yet.
- **The host's own atom.** A host can already write an atom that runs the host's `RegExp`, and
  this works today. Fuel cannot see inside a host atom, so a catastrophic pattern there is the
  host's to own. Keep the pattern on the host side and let the guest supply only the text:

```javascript
import { AgentVM, defineAtom } from 'tjs-lang/vm-ast'
import { transpile } from 'tjs-lang/lang'
import { s } from 'tosijs-schema'

// The pattern is the host's; the guest only supplies the text. The length cap
// bounds how much work the host's backtracking engine can be asked to do.
const isSlug = defineAtom(
  'isSlug',
  s.object({ value: s.string }),
  s.boolean,
  async ({ value }) =>
    value.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
  { docs: 'true if value is a lowercase slug', effects: 'io' }
)

const { ast } = transpile(
  `function check({ slug = 'hello-world' }) {
    let ok = isSlug({ value: slug })
    return { ok }
  }`,
  { atoms: { isSlug } }
)
const vm = new AgentVM({ isSlug })
const { result } = await vm.run(ast, {}, { fuel: 100 }) // result: { ok: true }
const second = await vm.run(ast, { slug: 'Not A Slug' }, { fuel: 100 })
// second.result: { ok: false }
```

The atom is tagged `effects: 'io'` so that the guest's input crosses the membrane: the body
receives a checked copy that matches the declared schema, never a live guest value. That tag
also brings a restriction: an `effects: 'io'` atom's input schema may not contain a `pattern`
(`defineAtom` refuses it), because the membrane would run that pattern on guest-chosen strings
on the host's engine. Check patterns in the atom's body, as above. (Guest schemas refuse
`pattern` too.)

---

**Everything below is design history.** You don't need it to write or host agents today.

## Design history

What follows is the design record from tjs-lang, 2026-10-02 to 2026-10-04, kept because it
records what the AJS builtin must do and why. Pattern moved to its own repository on
2026-11-02, and tosijs-pattern's `CLAUDE.md` and `DECISIONS.md` are current where they differ
from it. The dated quotes are from Tonio Loewald, the project's author, whose decisions they
record.

**The names in this history are not the library's.** The examples below use the draft API, and
the "Fluency" section uses a third, illustrative vocabulary. The current (0.1.0) vocabulary is at
[pattern.tosijs.net/vocabulary](https://pattern.tosijs.net/vocabulary/). The main differences:

| Draft API (below) | "Fluency" section | Current (0.1.0) |
| --- | --- | --- |
| `exactly(str)` (a literal) | (not used) | `text(str)` |
| `capture(name, p)` | (not used) | `.as(name)` |
| `anyOf(a, b)` (ordered choice) | `oneOf` | `oneOf` |
| `oneOrMore(p)` | `atLeastOne(p)` | `oneOrMore(p)` |
| `zeroOrMore(p)` | `any(p)` | `zeroOrMore(p)` |
| `repeat(p, 3, 3)` | `exactly(3, digit)` | a count argument, e.g. `digits(3)` |
| `sepBy(p, sep)` | `sepBy` | `listOf(p, { separatedBy })` |
| `replace` | (not used) | `replaceAll` |

One behaviour changed as well: a replacement template inserts a capture's matched **text**, not
its typed value, so `$3.50` stays `'3.50'` (the draft's `price.replace` example below shows the
old behaviour).

The note began as an imperative `Scanner` proposal. An outside draft (written by Gemini, under
Tonio's direction) argued for a declarative builder, which is the better shape for this project;
the draft's specifics were challenged, and the outcomes are recorded below.

### Priorities (Tonio, 2026-10-03)

Pattern is a standalone library (now `tosijs-pattern`), and its first users harden it before the
AJS builtin is built: it is used to edit source code and to replace regex in tjs-lang's own
compiler, and the AJS builtin comes last. The library's own docs cover the first two.

### Regex is not a parser, and Pattern does not pretend it is (Tonio, 2026-10-03)

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
- **Why regex backtracks (Tonio, 2026-10-03: "the reason for backtracking is typically to solve
  problems caused by working around its lack of statefulness").** Plain regular expressions
  need no backtracking: Thompson's construction (1968) matches them in linear time, and so does
  our linear engine. Backtracking engines exist to serve the extensions that fake STATE or
  STRUCTURE: backreferences (memory), lookaround (context) and greedy/lazy capture (extracting
  structure by retrying). Even plain ambiguity, as in `(a|ab)c` or `.*foo`, is structure regex
  cannot state. Pattern removes the ambiguity instead of searching it: possessive repetition,
  ordered choice, and named stateful pieces (`quoted`, `balanced`, `sepBy`). A PEG (see
  "Semantics" below) re-reads input only within one choice, and can be memoised to linear time
  (packrat parsing: caching each rule's result at each position). So the
  converter's rule is: when a regex needs backtracking to be correct, NAME the structure it is
  encoding; never reproduce the retries.
- **The long term.** Pattern paves the way to eliminating regex from TJS itself, not only from
  AsyncJS: the transpiler's own regex and hand-rolled scans first (see the priorities above), then
  the language surface.

### The goal: cost it accurately, for free

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

### Why replace regex

Regex was the most expensive surface of the 0.14.0 release. It took three review rounds
(`docs/reviews/0.14.0-rc.2-rereview-{6,7,8}.md`) and produced a 7 KB engine of its own, a
generated Unicode fold table, two differential fuzzers, and a long list of caps and meters. Even
metered, it is a second language inside the language, and every reviewer has to re-verify its
semantics against ECMAScript.

Regex is also hard to get right, for models and people alike, and its failures are silent: a
pattern that is almost right still parses and still matches. This release is evidence. A
star-height screen certified `/a*a*c/`; hand-written case-fold rules were wrong four ways; and the
engine itself diverged from JavaScript on nested quantifiers until a fuzzer looked.

### Why a declarative Pattern (not an imperative scanner)

A pattern is a value, not a procedure:

- **Serializable.** It can be persisted, cross the capability membrane, and travel inside a
  `$predicate`. The portable predicate VM (`docs/type-system-north-star.md`) can carry it, where
  it could never carry ECMAScript regex.
- **Readable.** `Pattern.number()` says what it matches. Captures come back as a NAMED
  dictionary, not as positional groups.
- **Diagnosable.** A failed match reports where and what was expected, not just `null`.
- **Usable for validation.** CSS predicates and `$predicate` can use it, which an imperative
  scanner could not.

### Semantics: PEG, stated plainly

A PEG (Parsing Expression Grammar) is a grammar whose choices are tried in order and whose
repetitions never give input back. The semantics are chosen for **predictability**, not as a safety mechanism (charging is the
safety mechanism). They make a pattern's cost easy to read off the pattern:

- **Repetition is possessive** (it keeps what it took). `oneOrMore(p)` takes as much as it can and
  never gives any back.
- **Choice is ordered.** `anyOf(a, b)` tries `a` first; if `a` succeeds, `b` is never tried, even
  if the rest of the pattern then fails.
- **No recursion in v1.** Patterns are finite trees. `Pattern.ref` (recursive rules, for nested
  parentheses) is deferred. Fuel keeps a recursive grammar safe; packrat memoization keeps it
  fast (see the last consequence below).

Consequences, documented wherever the API is:

- **Behaviour differs from regex, predictably.** `oneOrMore(digits())` then `exactly('5')` FAILS
  on `"1235"`: the digits already took the 5. The grok tasks include cases where this matters.
- **Anchored matching (`parse`) is linear** in the input times the pattern size.
- **Unanchored search (`replace`, `matchAll`) is O(n²) in the worst case**, because it attempts a
  match at each position. (A Pike VM does this in one pass; a PEG does not.) That is acceptable
  because every step is charged: the cost is accurate, not hidden. A first-character set (the
  characters a match could begin with) computed from the pattern skips most start positions cheaply, as an optimisation.
- **Recursion (later) does not need memoization for safety.** Exponential re-parsing would be
  charged step by step and run out of fuel. Packrat memoization is a performance choice for
  grammars that need it.

### Primitives: loops over character ranges, never RegExp (decided)

Primitives are plain loops over merged character-range tables (the ones the regex engine already
builds; when the regex engine leaves the core, the tables move into Pattern), **not** sticky `RegExp` calls. Host regex inside the VM would bring back the dependency
this replaces and tie the portable VM to ECMAScript regex. Range loops are also faster than a
regex call per token, and port to any language in an afternoon.

### Fluency and natural mapping (Tonio, 2026-10-03)

> "Going from rail diagram to Pattern code should be trivial and reading a pattern invocation
> should read like a description of a clean regex read back by a fluent engineer. `[a-z]+` e.g.
> `atLeastOne(lowercase.letter)` where `atLeastOne` and `lowercase` are pieces of Pattern."

The names in this section are illustrative, not the library's; see the mapping table at the top
of the design history. The API is judged by two read-aloud tests:
- **Rail diagram to code is one-to-one.** Every element of a railroad diagram (a terminal, a
  sequence, a choice branch, a loop, an optional bypass) is exactly one Pattern piece, nested the
  way the diagram nests. Drawing the diagram from the code, or the code from the diagram, is
  mechanical. That also makes the diagram a free rendering of any Pattern, for docs and the
  playground.
- **Code reads as a description.** A pattern invocation reads like a fluent engineer reading a
  clean regex aloud: `[a-z]+` is `atLeastOne(lowercase.letter)`, `\d{3}` is
  `exactly(3, digit)`, `(,\s*)?` is `optional(sequence(',', any(whitespace)))`. Character
  classes are NOUNS with readable refinements (`lowercase.letter`, `digit`, `hex.digit`);
  repetition and choice are VERBS that take the noun (`atLeastOne`, `any`, `optional`,
  `oneOf`).
- **Names come from the reading, not from regex syntax.** No `plus`, `star` or `question`; no
  flags. Where a reader would say "a quoted string" or "a comma-separated list", there is a
  piece by that name (`quoted`, `sepBy`), which is also how inconvertible regexes get their
  structure named.

### The API (draft)

Combinators take sub-patterns. There are no modifier flags that apply to "the next token": those
are stateful and order-sensitive, cannot group a sequence, and need getters, which the VM treats
as code. Each thing has one way to write it.

```javascript
const price = Pattern.exactly('foo:')
  .maybe(Pattern.spaces())
  .capture('amount', Pattern.number())

price.parse('foo: 42.5')
// { success: true, match: 'foo: 42.5', length: 9, captures: { amount: 42.5 }, error: null }
price.parse('foo: x')
// { success: false, error: 'expected number at 5', ... }

price.replace('Cost is foo: 42.50', '(USD {amount})')  // 'Cost is (USD 42.5)'
// (in this draft, amount is a number capture, so 42.50 printed as 42.5; the
// library now inserts the matched text, giving '(USD 42.50)')
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

  ```javascript
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

  ```javascript
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

### One engine, two hosts

The library (planned here as `tjs-lang/pattern`, now the separate `tosijs-pattern` package) is
usable from plain JS and TJS. The VM will expose the same engine as a builtin, planned as
`Pattern`: a value the VM builds, as AJS's `Date()` and `Set()` are
([The Language](../DOCS-AJS.md)). There is one implementation, held honest
by a differential test, the same arrangement as predicates.

### Regex as an opt-in

The two options are described under [For hosts](#for-hosts-keeping-regex-after-it-leaves-the-core)
above: `regexAtoms` on the linear engine (`src/vm/regex.ts`, moved out of the core), or the host's
own atom running native `RegExp`.

### Migration: the transpiler converts what it can prove (Tonio, 2026-10-02)

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

### Sequencing

As planned on 2026-10-04; superseded by the table under
[What changes for your agents](#what-changes-for-your-agents), which is current.

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

### Design input: editing source (Tonio, 2026-10-02)

Regex-driven edits of source code fail often, through formatting drift, layers of escaping and
invisible precedence in replacement strings, so Pattern is also meant for editing code (a code
mode that skips whitespace and comments, unique-match edits, a dry run). That work belongs to
tosijs-pattern and is documented there.

### Performance: expectations, to be measured (Tonio, 2026-10-02)

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

### Later: the transpiler itself (Tonio, 2026-10-02)

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

### Serializable, and the answer to JSON Schema's `pattern` (Tonio, 2026-10-04)

**A Pattern serializes.** It is built as data by a fluent builder, so it has a canonical JSON
form that round-trips exactly (`Pattern.fromJSON(p.toJSON())` matches what `p` matches), carries
no code, and can be stored, sent to another process, or embedded in a schema. This is part of
the spec, not an afterthought: it is what lets a Pattern travel with an AST and run on any host
(including the Rust/wasm VM, `docs/ajs-native-vm.md`).

**JSON Schema's `pattern` keyword is ECMAScript regex by definition**, and running it on a
backtracking host engine is the door the 0.14.0 reviews kept closing. The direction:

- **Accept only a `pattern` that converts to a Pattern.** The converter (see Migration) either
  proves the regex equivalent and runs it on the Pattern engine, or refuses it and explains why,
  pointing at the docs. An inconvertible regex is evidence it does not state its intent.
- **A Pattern keyword for schemas** (working name `$pattern`): the serialized Pattern, the same
  progressive-enhancement shape as `$predicate`. Aware validators run the Pattern; naive ones
  can be given the equivalent regex where one exists.
- **A library of named Patterns for the classic entities**: email address, URL, UUID, ISO date
  and time, semver, hostname, IPv4/IPv6, hex colour, and so on. Each is written once, readable,
  tested against published corpora, and serializes like any other Pattern. The argument for
  Pattern replacing regex is made by these being better than the regexes people copy from
  Stack Overflow.

Until then, schemas that would run a `pattern` on guest strings are refused; see the end of
[For hosts](#for-hosts-keeping-regex-after-it-leaves-the-core).

### Out of scope for now: predicates

`compilePredicate`, `tjs-lang/css` and `$predicate` keep regex on the linear engine. JSON
Schema's `pattern` keyword is covered above. Moving predicates to `Pattern` is
a likely next step, since the pattern is data, but it is a separate decision, made after
`Pattern` exists.

### Open decisions

As they stood on 2026-10-04, with each item's status as recorded on this page. Items marked
"open here" may have been settled in tosijs-pattern since; its `DECISIONS.md` is the current
record, and the library's own tracker holds what is still open (naming, a look-behind piece).

0. The goal. **Decided:** not to prevent ReDoS, but to charge whatever a pattern costs,
   accurately and for free (one engine step = one charge) (Tonio, 2026-10-02).
1. Primitives. **Decided:** range loops, not sticky `RegExp` (Tonio agreed, 2026-10-02).
2. PEG semantics (possessive repetition, ordered choice), for predictability, with the
   documented O(n²) unanchored search. **Open here**; the library is built this way.
3. Combinators taking sub-patterns, instead of modifier flags on the next token. **Open here**;
   the library is built this way.
4. Primitive definitions: `number()` = JSON's grammar; a general `chars(set)`. **Open here.**
5. Typed captures (`number()` captures a number). **Open here**; note that replacement templates
   now insert the matched text, not the typed value.
6. `replace` takes a template, not a callback. **Superseded:** the library's `replaceAll` takes a
   `{name}` template or a function.
7. One engine for `tjs-lang/pattern` and the VM builtin. **Superseded** in part: the library is
   `tosijs-pattern`, not `tjs-lang/pattern`; one engine for both hosts still stands.
8. No recursion in v1. **Open here.**
