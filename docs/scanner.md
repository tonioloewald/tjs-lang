<!--{"parent": "ajs.md", "order": 8}-->

# Scanner: structured parsing for AJS, and regex as an opt-in

**Status: proposed (Tonio, 2026-10-02).** Deprecate regex in AJS in 0.14; remove it from the core VM
in 0.15; move it to an opt-in module for hosts that want it.

## Why

Regex was the most expensive surface of the 0.14.0 release. It took three review rounds
(`docs/reviews/0.14.0-rc.2-rereview-{6,7,8}.md`) and produced a 7 KB engine of its own, a
generated Unicode fold table, two differential fuzzers, and a long list of caps and meters. Even
metered, it is a second language inside the language, and every reviewer has to re-verify its
semantics against ECMAScript.

A scanner is linear **by construction**. Each call consumes what it consumes and is charged for
exactly that. There are no closures to walk, no captures to copy, and no case-folding semantics
to match. It is also easier to port: the portable predicate VM (`docs/type-system-north-star.md`)
cannot re-implement ECMAScript regex exactly in another language, but it can implement a scanner.

## The API (draft)

A VM-built wrapper, like `Set()` and `Date()`, so there is no new execution model:

```js
let p = Scanner(s)
p.skip(' \t\n')          // skip characters in a set; returns the count skipped
let n = p.take('0-9')    // the run of characters in the set ('' if none)
let w = p.takeUntil(',') // up to (not including) a literal, or to the end
if (p.literal('px')) {}  // true and advances on an exact match; false and stays otherwise
p.peek()                 // the next character, or ''
p.pos, p.done            // the position; whether the input is exhausted
p.rest()                 // the remaining input
p.reset(pos)             // back up to an earlier position (bounded backtracking, written by hand)
```

- **Character sets are strings with ranges** (`'a-zA-Z_'`, `'^0-9'` for negation), not regex
  syntax. They compile to the merged range tables the regex engine already uses.
- **Case-insensitivity is explicit**: call `lower()` on the input. There are no fold tables.
- **Cost:** every call is O(characters consumed), plus O(log ranges) per character, charged as
  fuel. Results are charged through `allocate()`. Nothing else allocates.
- **Common cases need no scanner**: `trim`, literal `split`/`replaceAll`, `startsWith`,
  `includes`, and helpers such as `isDigits(s)` / `isAlnum(s)`.

## Regex as an opt-in

- **`tjs-lang/regex` → `regexAtoms`**, registered like `batteryAtoms`
  (`new AgentVM({ ...regexAtoms })`). These are atoms on the linear engine (`src/vm/regex.ts`,
  moved out of the core), so they keep the run's fuel and heap budgets. This is the safe way to
  add regex back.
- **A host's own capability:** a host can also inject native `RegExp` behind a capability. Fuel
  cannot see inside a capability, so a catastrophic pattern there is the host's to own, as with
  any capability. The docs say so wherever capabilities are introduced.

## Sequencing

| Release | AJS core | Opt-in |
|---|---|---|
| 0.14 | regex works (linear, metered); **the transpiler warns** on every regex use: "deprecated: use Scanner, or register regexAtoms". `Scanner` ships if the design settles, otherwise in 0.14.x. | — |
| 0.14.x | `Scanner` | `tjs-lang/regex` (`regexAtoms`) |
| 0.15 | **regex removed**: literals, `regexMatch`, regex arguments to `match`/`search`/`replace`/`replaceAll`/`split`. The engine leaves `vm-ast` (~7 KB gzipped). | `tjs-lang/regex` |

**Removal gate:** `bun run test:grok` shows that the pinned small model writes Scanner code that
is **correct on held-out inputs**, at a rate comparable to its regex rate. AJS's premise is that a
small model can write it. `guides/ajs-llm-prompt.md` carries most of that weight.

Measure correctness, not compilation. A regex fails silently: a pattern that is almost right still
parses and still matches, so "the model wrote a regex that compiles" would score subtly wrong
answers as passes. Each grok task therefore carries test inputs the model never sees, edge cases
included, and both styles are scored on what they return. The expectation (Tonio, 2026-10-02) is
that the scanner wins this, not merely ties. Models, like people, are worse at regex than they
believe. This release is evidence: a star-height screen certified `/a*a*c/`, hand-written
case-fold rules were wrong four ways, and the engine itself diverged from JavaScript until a
fuzzer looked. Each of those failures was silent.

## Out of scope: predicates

`compilePredicate`, `tjs-lang/css` and `$predicate` keep regex on the linear engine for now. JSON
Schema's `pattern` keyword is ECMAScript regex by definition. Whether predicates move to `Scanner`
is a separate decision, made after it exists.
