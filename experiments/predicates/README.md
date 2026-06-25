# PoC: composable predicate-safe validators (AJS as the missing piece of JSON Schema)

**Thesis.** A _predicate_ is a pure, synchronous function of its inputs. If a
cluster of predicates is statically verified to use only pure builtins + other
predicate-safe predicates (no IO, no async, no escape), it has earned the
**native fast path**: compile to plain synchronous JS, where ergonomic
composition (`isHex(v) || isVar(v)`, `tokens.every(isToken)`, recursion) just
works. The serializable AJS AST is the portable form (code-travels-to-data, like
JSON Schema); native JS is the execution form. So you get JSON Schema's
serializability **plus** bounded, composable _computation_ — which is exactly
what JSON Schema and TS structural types lack.

**Torture test: CSS** — the case TS/JSON-Schema most spectacularly fail. Two
failure modes, both dissolved by predicates:

- _Open value grammars_ (`var()`, `calc()`, `!important`) → just more `||`
  branches; `||` doesn't explode like `|`.
- _Order-flexible shorthands_ (`animation`) → tokenize + `every(classify)`.
- _Open recursive structure_ (nested selectors, keyframes) → a self-referential
  predicate (`isStyleObject`), bounded by fuel/depth in the real runtime.

`bun test experiments/predicates/predicate-poc.test.ts` → 7/0:
`#3a3 !important`, `var(--brand)`, `3s ease-in 1s infinite alternate slidein`,
and a nested styleSpec all validate; an IO-using "predicate" is **rejected at
definition time** with a source location.

## What the spikes established about AJS today

Works in AJS now: `typeof`/structural `==`, string methods, **regex
`/.../.test()`**, `.split`, `.includes` (Set replacement), `||` chains,
**recursive helpers**. Two ergonomic gaps — both VM-_interpreter_ artifacts, not
fundamentals, and both natural once compiled to native JS:

1. **calls in expressions** (`isHex(v) || isVar(v)`) — the VM expression
   evaluator forbids calls (sandbox); lifting each to a temp works but is the
   copy-paste regression we want to avoid.
2. **named predicate as callback** (`tokens.every(isToken)`) — helpers aren't
   first-class VM values.

The verifier is pure static analysis, so it has neither restriction — it accepts
the ergonomic source and certifies safety; native compilation runs it.

## PoC simplifications (→ productionization)

- **Member calls treated as pure.** A real verifier whitelists receiver+method
  (String/Array/Object/Math/RegExp/JSON) and rejects unknown receivers.
- **Effectful set is a static list.** Real system: the atom `effects: 'none' |
'io'` tag (the keystone, ~40 atoms) drives this.
- **Native via `new Function(source)`.** Works because the CSS predicates are
  pure string/regex where AJS≡JS semantics. The rigorous path is an AJS-AST→JS
  emitter preserving AJS semantics (structural `==`, null-safe access) **+ fuel
  decrements injected at call/loop boundaries** for runtime CPU-bounding.
- **Transitive verification reuses the `callLocal`/`ensureHelperTransformed`
  shape** — cycle-safe (recursion ⇒ "already trusted"), so recursive/mutual
  predicates are fine; runtime recursion is bounded by `MAX_CALL_DEPTH` + fuel.

## Autocomplete (the other half)

Validation is total (includes the open cases); autocomplete is the _enumerable_
leaves (`NAMED_COLORS`, timing keywords, `var(--`/`calc(` stubs) exposed as a
`suggest()` companion. Splitting the two jobs is why predicates beat the TS
`string` fallback on **both** axes — precise validation **and** useful
suggestions — instead of trading one for the other.

## Performance (ballpark — native-compiled predicates)

Two phases: **verification** is one-time at definition/build (irrelevant);
**validation** is the only hot path, and CSS validation runs at theme-define /
style-apply time, not per frame. Micro-bench on a theme-sized spec (50 selectors,
450 leaf values), PoC predicates, `bun`:

| op                                          | cost                    |
| ------------------------------------------- | ----------------------- |
| validate whole theme `isStyleObject(theme)` | ~0.13 ms (~8K themes/s) |
| per-value `isColorValue`                    | 0.1 µs (~12M/s)         |
| per-value `isAnimation` (tokenize + every)  | 0.6 µs (~1.7M/s)        |
| ReDoS check: 100K-char adversarial string   | 0.195 ms (linear)       |

Not a performance monster — a whole theme is a fraction of a ms. Notes:

- This is the **native-compile payoff** measured; through the VM interpreter it
  would be orders of magnitude slower.
- Cost scales with **branches-per-value**, not library size (validating a
  `color` never touches the animation predicates), so a complete CSS impl is not
  meaningfully slower per-value.
- **Regexes are the one lever to watch — for _safety_, not speed.** They're the
  only unbounded-compute primitive and **fuel can't interrupt mid-`.test()`**.
  These are linear; a catastrophic-backtracking regex would be a ReDoS hole
  fuel-bounding can't catch → "lint predicate regexes for catastrophic patterns"
  belongs in the verifier's safety checks.

**TODO when the full CSS impl exists:** re-run this against a real production
theme (e.g. tosijs's) with the complete predicate set, to confirm on real data.

## Files

- `verify.ts` — `verifyPredicates` (transitive, located diagnostics) +
  `compilePredicates` (verify → native fast path) + `effectfulFrom(registry)`.
- `css.predicates.ts` — the CSS torture corpus (named-composition style).
- `predicate-poc.test.ts` — the proof + the real-atom-`effects`-tag wiring.
