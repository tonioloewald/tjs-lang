# Design Principles & Invariants

Foundational, non-negotiable invariants for the tjs-lang language stack. Every
feature and tool must preserve these. A violation is a **bug**, not a feature
gap — fix the tool, don't ask the user to work around it.

## Language subset relationships

```
JavaScript          ⊆   TJS (no modes on)   ⊆   TJS (modes on)
AJS                 ⊆   TJS
```

Two hard invariants:

1. **TJS ⊇ JavaScript.** With no modes toggled on, every legal JavaScript
   program is legal TJS _with the same meaning_. TJS _adds_ capability
   (types-as-examples, runtime contracts, monadic errors) but never removes the
   ability to transpile valid JS, and never silently changes its semantics.
   TJS's footgun-removal modes (`TjsStandard`, `TjsEquals`, honest truthiness,
   …) _do_ change behaviour — so they are gated on the **dialect** (below), not
   applied to plain JS.

   `.tjs` is a **better language, not just JS** — choosing it (the `.tjs`
   extension, `dialect: 'tjs'`, or a bare string, which defaults to native TJS)
   is the opt-in to those modes. Plain JS reaches semantics-preserving transpile
   via `dialect: 'js'` (or the `TjsCompat` directive).

2. **TJS ⊇ AJS.** Every legal AJS source is legal TJS source. `ajs(src)` and
   `tjs(src)` may do _different and more_ with the same string — TJS may enforce
   `:` contracts, run signature tests, treat `:` like `->`, etc. — but TJS must
   never **reject** source that AJS accepts.

(TypeScript → TJS is a _conversion_, not a subset relation, and is explicitly
out of scope for these invariants.)

## The operative rule: "more, never illegal"

A subset relationship lets the superset do **more** with the same code, but
never makes subset-legal code **illegal** (a hard parse/transpile error).

So when a richer TJS feature evaluates subset code:

- A check that **runs and fails** (e.g. a function's example output ≠ its
  declared example) → a hard error is fine. The code is genuinely wrong.
- A check that **cannot run** (references TJS can't resolve at build time, a
  test harness that can't execute the module, etc.) → **inconclusive +
  warning**, never a hard error. Inconclusive ≠ failed.

### Worked example: signature tests

TJS runs a function's signature example as a build-time test (call with the
parameter examples, assert the result matches the return example). This is a
Very Good Thing™ — but it must obey the rule above:

- Self-contained, executable, self-consistent function → test runs; mismatch is
  a hard error. ✅
- Function references names TJS can't resolve at build time — e.g. AJS atoms
  (`httpFetch`, `llm`, `store`) — or the harness can't execute the module (e.g.
  multiple top-level functions) → the test is **inconclusive**, surfaced as a
  warning (including in the playground), **never** a transpile error.

Without this, AJS agents (which call atoms and may declare return types) and
multi-function helper sources would be illegal TJS — breaking invariant 2.

## Dialect resolution (how invariant 1 is operationalized)

The unit of opt-in is the **dialect**, and `tjs()` takes it explicitly:

| input                          | modes        | meaning                          |
| ------------------------------ | ------------ | -------------------------------- |
| `tjs(src, { dialect: 'js' })`  | OFF          | plain JS — semantics preserved   |
| `tjs(src, { dialect: 'tjs' })` | ON           | native TJS                       |
| `tjs(src)` (bare string)       | ON (default) | native TJS (back-compat default) |
| `fromTS(src)` then `tjs(...)`  | OFF          | TypeScript → TJS → JS            |

For **file-based tooling** (CLIs, bundler plugins, module loaders, doc systems),
the dialect is the file extension. There is one canonical mapping — exported as
`dialectForFilename` / `sourceKindForFilename` from `tjs-lang/lang` — that all
tools must share so `.js` is never silently "improved" into different semantics:

- `.js` / `.mjs` / `.cjs` → `dialect: 'js'` (preserve; TJS still reserves the
  right to add _better diagnostics_, never to change behaviour)
- `.tjs` → native TJS (the better language)
- `.ts` / `.mts` / `.cts` → `fromTS` (TS → TJS → JS)

A bare string defaults to native TJS only because it has no extension to consult;
any tool that knows the source's origin should pass `dialect` (or use the helper).

### Routing all three dialects (the canonical recipe)

There is intentionally **no one-call `js | ts | tjs` helper** in `tjs-lang/lang`:
the TS path needs the TypeScript compiler, and folding it in would drag TS into
the lean, TS-free `tjs-lang/lang` bundle. So a tool that handles all three (a doc
system, a bundler plugin) routes explicitly — `js`/`tjs` through `tjs()` (cheap,
no TS), `ts` through `fromTS` (imported from the separate, TS-aware entry):

```js
import { tjs, sourceKindForFilename } from 'tjs-lang/lang'
import { fromTS } from 'tjs-lang/lang/from-ts' // pulls in the TS compiler — only on the ts path

function transpileFence(source, kindOrFilename) {
  const kind = /\.[mc]?[jt]s$|\.tjs$/.test(kindOrFilename)
    ? sourceKindForFilename(kindOrFilename)
    : kindOrFilename // 'js' | 'ts' | 'tjs'
  if (kind === 'ts') return tjs(fromTS(source, { emitTJS: true }).code).code
  return tjs(source, { dialect: kind }).code // 'js' | 'tjs'
}
```

Importing `fromTS` from its own subpath keeps the TS compiler out of consumers
that only ever touch `js`/`tjs`. (A future `transpileSource` sugar may wrap this,
but only from a TS-aware entry — never from `tjs-lang/lang`.)

## Why this matters

- **AJS portability.** AJS agents ("code travels to data": sandboxed,
  atom-calling) must carry into the full TJS toolchain — editor support,
  `.d.ts`, docs — with zero rewrites.
- **JS adoption.** A developer must be able to drop existing `.js` into TJS and
  have it transpile, then add contracts incrementally.
- **Guardable.** These are testable properties: keep a fixture of representative
  AJS/JS snippets asserted to `tjs()` (and the JS to options-off TJS) **without
  throwing**, so a regression is caught immediately.

## The safety layer absorbs termination, so the surface layer optimizes for legibility

**AJS bans `for` and keeps `while`.** Against the prior art this looks backwards. Starlark
made the opposite call — `for` allowed, `while` banned — and was right to, because
Starlark's termination guarantee **lives in the syntax**: loops range over finite iterables,
so the bounded form is the safe one and the unbounded form must go.

Banning the bounded form and keeping the unbounded one would be indefensible under those
rules. It is correct under ours, because **our termination guarantee does not live in the
syntax — it lives in fuel** (see `S1`/`S4` in [ASSUMPTIONS.md](ASSUMPTIONS.md)). Every
evaluation step charges, and execution stops when the budget is gone. Bounded execution is a
precondition of running at all, so the halting question never reaches the grammar.

Once fuel carries the halting proof, syntax is **freed from having to encode safety** and can
be chosen on legibility for the authors alone. And for a small model `while` is one concept
(condition, body), where C-style `for` compresses three clauses of mutable-counter footgun
into a header. AJS's authors are small models, so `while` wins on the only axis left.

**The general rule, and why it is written down:** when a lower layer takes on a duty
completely, the layers above it stop paying for that duty and should be re-optimized for
something else. Concretely, **every construct choice in AJS may ignore termination entirely
and ask only: "what does a 4B model write correctly?"** That question has a measurable answer
(`experiments/agent-legibility/`), which makes this a design principle with a test attached
rather than a matter of taste.

The same shape recurs elsewhere: the capability membrane absorbs host-reference safety, so
atom authors write ordinary data-returning functions; verified predicates absorb purity, so
predicate authors write ordinary JavaScript. When you find yourself paying for a guarantee
twice, one of the two payments is the bug.

## Conversion contract: TS → equivalent-or-better TJS, with guidance to improve further

**Every conversion of TypeScript to TJS must produce code that behaves the same or strictly
better, and must point at the improvement it did not make for you.**

Three obligations, in priority order — a later one may never be bought with an earlier one:

1. **Equivalent.** The converted file behaves identically to the TypeScript it came from.
   Never silently change semantics. Where TJS reads a spelling differently, **rewrite it to
   preserve meaning** rather than letting the extension change it: `n = 5` (TypeScript
   `number`) converts to `n = 5.0`, which accepts floats and still defaults to `5`.
2. **Or better.** Where TJS can be safer at no cost to behavior, take it — runtime validation
   from annotations TypeScript erases, real types on the boundary, footguns closed where the
   fix is provably meaning-preserving.
3. **With guidance to improve further.** Where we _could_ be better but can't prove the
   rewrite safe, **say so at the site**: `// TJS: \`= 5\` narrows to an integer, \`= +5\` to
   unsigned`. A gnarly coercion we can't rewrite becomes a visible marker, not a silent
   pass-through.

**Why this is a principle and not a feature.** It is correct independently of any particular
roadmap — it improves the TS → TJS path no matter what else is or isn't built — and it makes
adoption a ladder instead of a leap. Combined with per-mode directives (`TjsCompat`, then one
mode at a time) it is the Crockford/JSLint dynamic: keep your code, be told what's bad and
why, tighten one rule at a time. Nobody rewrites a codebase to start.

It also decides questions that would otherwise be arguments. A spelling that TJS reads
differently is **not** a breaking change to schedule; it is a **conversion job**, and the
only remaining decision is rewrite-or-annotate. Obligation 1 is what makes obligations 2 and
3 safe to be ambitious about: you can afford to teach aggressively precisely because you have
promised never to surprise.

**Corollary — we do not erase TypeScript, we upgrade or annotate it.** Removing a construct
is permitted only when it is _genuinely_ a runtime no-op (`as`, `satisfies`, `!`, type-only
imports), and even then the removal is **noted at the site**, because the author wrote it and
a silent deletion discards intent the reader may need. Where the construct carries
information TJS can use, the correct treatment is an **upgrade**, not a deletion: `m = {} as M`
is a type annotation in disguise and should eventually become `m: M = {}`. Anything that is
not a no-op is never dropped — it is rewritten to preserve meaning, or flagged.

**Corollary — we do not add runtime type checking to TypeScript that crashes it.** Enforcing
annotations on converted TS would return errors where `tsc`-clean code ran fine; that is
obligation 1 violated, however well-intentioned. The value still gets delivered, but through
**observe mode** — check, record, return the original value — which is the only form of type
checking that cannot break the program it is inspecting. This is why TS-origin code has
validation off by default, and it is a design position, not an oversight.

**Enforcement (open):** obligation 1 is behavioral and therefore testable — run the
TypeScript and its conversion against the same inputs and require identical observable
results. Until that harness exists this is a contract we keep by hand, which is weaker than
it should be for something load-bearing.

## North star: JSON-Schema + predicates as the single source of truth for types

**A TJS type is canonically a JSON-Schema node, optionally carrying a `$predicate`
(a verified-pure predicate cluster) for the computational part JSON-Schema can't
express.** Examples-as-types, TS-derived types, `Type`/`Generic`, and
`TypeDescriptor` are surface syntax or internal _projections_ of that one form —
not competing sources of truth.

Use it as a **decision lens**: for any architecture/impl choice, ask _"does this
move types toward — or away from — being fully expressible as JSON-Schema +
`$predicate`?"_ New type power should come from a JSON-Schema keyword or a
predicate, never a bespoke `TypeDescriptor` field that can't round-trip. dts,
validation, inference, and autocomplete should _derive from_ the canonical form.

This is what makes types **data** (serializable, inspectable, cross-language). The
unlock is a small, portable **reference VM for the predicate subset** (pure,
loop-free, fuel-bounded — a few hundred lines in any language, ideally smaller than
a JS runtime), so `$predicate` runs anywhere — carried as a **serialized AST**, not
just source, so a non-JS runtime needn't embed a JS parser. Strategic (possibly
post-1.0); full design in [`docs/type-system-north-star.md`](docs/type-system-north-star.md).
