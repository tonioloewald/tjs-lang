# Design Principles & Invariants

Foundational, non-negotiable invariants for the tjs-lang language stack. Every
feature and tool must preserve these. A violation is a **bug**, not a feature
gap — fix the tool, don't ask the user to work around it.

## The type system is not the source of truth. Reality is.

**A type system is documentation, autocomplete and lint assistance. It is never
evidence about what a program does.** If the type system says A and the running
program does B, **the type system is wrong** — not the program. TJS is the
attempt to take that seriously rather than merely admit it.

TypeScript inverts this in practice, not by design but by erasure: its
annotations make claims that are never checked against anything, so a wrong
annotation is indistinguishable from a right one until a consumer's runtime
disagrees. `as`, `!`, `any` and a stale `.d.ts` are all the same failure — a
claim outranking the thing it describes.

**A TJS type is an example: a real value that exists at runtime.** An example is
not a claim about a value, it _is_ a value, so there is nothing for it to be
wrong about. That is the whole design, and everything below follows from it.

### Why the drift is structural, not carelessness

There is a second and stronger reason the annotation loses, and it holds even for
a type system with perfect checking and no erasure:

**TypeScript's types are declarative. The code they describe is imperative.** So
a programmer documenting what imperative code does is forced to re-express it in
a _different language_ — one with different semantics, different expressiveness
and different failure modes — and then keep two artifacts in two paradigms
agreeing by hand. That translation will tend to fail. Not through carelessness:
it is a hand translation between paradigms, performed continuously, by someone
whose actual job is the other one.

**Which is why the code is the more trustworthy artifact.** The code is the
thing. The types are a second description of it, written in a foreign language,
maintained manually.

The tell is what happens when a constraint gets hard. Expressing it drags you
into conditional types, mapped types and template-literal types — a
Turing-complete metalanguage with **no debugger, no runtime, and no way to
execute a case and look at it.** You cannot `console.log` a type. The tools for
testing types are themselves written in the type language, so a bug in your
description and a bug in your description-of-the-description are the same
activity. At that point the annotation is a program nobody can run, asserting
things about a program everybody runs.

### The sharper form: the incentive, not the entropy

> **TypeScript is the set of lies you tell `tsc` to get your code to lint.**

Saying the translation "tends to fail" is too kind, because it sounds like decay.
It does not drift randomly — it drifts in a **direction**, and the direction is
whatever makes the checker stop complaining. At the moment of writing an
annotation the programmer's objective is not _"describe this accurately"_, it is
_"clear the error."_ Those are different goals and only one of them is being
optimized.

That is the same defect this project already knows in another costume: **a gate
that alters the thing it measures.** `tosijs-ui` changed its semver policy after
finding versions were being chosen to dodge a review, so the number stopped
describing the change. A type checker is a gate, and the annotations are authored
to satisfy it. `as`, `any`, `!`, `@ts-ignore`, and an over-broad type that
"works" are not failures of the system — they are its **equilibrium**.

**You cannot lie to a worked example.** There is no `as` that makes `add(2, 3)`
equal `0`. An example is not a claim you can weaken until it passes; it holds or
it does not, and the checker is the program itself.

**So the difference is not that TJS has no escape hatches — it is that ours are
confessions.** `unsafe`, `!`, `:!`, `DangerousLegacyEquals`, `LegacyDefault`,
`/* @tjs-unsafe */`: each is named, greppable, and deliberately ugly (see _"Make
stupid stuff stand out"_ below). `as Foo` looks like ordinary code, which is
precisely what makes it dangerous — the lie and the truth are visually
indistinguishable, so nothing accumulates as evidence and no reviewer can grep
for the debt.

The uncomfortable corollary, and it is the right behaviour: **`fromTS` preserves
the lies rather than laundering them.** A TypeScript `: string` becomes `:!`,
because a set is not a worked example and inventing one would be manufacturing a
truth we do not have. Converted code is therefore honest about how much of it is
still assertion — which is the point of the conversion contract below, where TJS
is _equivalent-or-better_ and tells you where to improve rather than pretending
the improvement already happened.

**TJS's answer is to delete the translation, not to improve it.** A type is
written in the language it describes:

- **An example is a value.** `function greet(name: 'Alice')` — `'Alice'` is
  JavaScript, evaluated by JavaScript, present at runtime. There is no second
  language and therefore no translation step to drift.
- **A predicate is code.** `predicate(x) { return typeof x === 'number' && x > 0 }`
  is imperative code describing imperative code, in the same paradigm, and it
  runs, and you can debug it, and it can have tests.

That is also the honest reading of the north star below: JSON-Schema is the
declarative half and cannot express computation, so `$predicate` is not an
extension bolted on — it is the imperative half, without which the same
translation problem reappears inside our own type system.

And it is why `fromTS` degrades the way it does. Converting a declarative TS
annotation into a TJS example is translating _back_, and often the information
simply is not there — `: string` names a set, not a worked example. `:!` records
that loss explicitly instead of inventing a value and pretending.

### It adjudicates. That is what makes it a principle rather than a mood.

When two mechanisms disagree, this rule says which one is the bug — and it
already decides three live cases that were each carrying their own local rule:

- **A signature example that does not hold is an error, not a type pattern.**
  `function add(a: 2, b: 3): 0` **must fail**, because `add(2,3)` is 5. It is
  perennially tempting to "fix" that canary into a type match; the temptation is
  exactly the inversion this principle forbids. `:!` exists to say _"I have only
  a claim here, not a worked example"_ — which is also what `fromTS` must emit
  for TypeScript's `: string`, and the marker records the loss honestly.
  (`src/lang/features.test.ts`, "signature test canaries".)
- **Where the inline stub and the real `Type` disagree, the stub is right.**
  Not because it is better, but because emitted code calls it, so it is what
  runs. `docs/type-identity.md` measures four such disagreements; CLAUDE.md's
  instruction — _"the stubs are the contract for emitted code; fix them"_ —
  is this principle, and now has a reason attached rather than standing on
  authority.
- **Do not widen a known-disagreement list to make red go away.** A disagreement
  is a fact about the system. Recording it as permitted does not make it stop
  being one; it just reserves slack for a future regression to occupy silently.
  (`src/lang/equality-invariants.test.ts`.)

### Applied to our own documentation

The same rule binds what we say about the language. `docs/tjs-vs-typescript.md`
is **generated from data that is executed** — every row runs against `tsc
--strict` and against TJS (`src/lang/differences.ts`,
`src/lang/differences.test.ts`), so a documented claim cannot drift from the
language without a test going red. A comparison table is the most inviting place
in a project for a false claim to live undisturbed, which is why that one is
data rather than prose.

### The direction it points

Probe reality, then derive the contract — never the reverse. This is what
`docs/ambient-contracts.md` is for: TypeScript's `e.target.value` pessimism is a
claim, and a measured, verified predicate over the real object is a fact. When
the two conflict the annotation loses, and the useful artifact is the one you can
execute.

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
   TJS's footgun-removal rules (statement termination, honest equality, honest truthiness,
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

## Make stupid stuff stand out, and look ugly and clumsy

**The safe path gets the short, pretty spelling. The dangerous path is deliberately
awkward.** Ergonomics is a safety mechanism: what a language makes _easy_ is what will be
written, so the shape of the syntax is incentive design whether or not anyone intended it.

`dangerouslySetInnerHTML` is the canonical example — nobody types it by accident, nobody
skims past it in review, and its ugliness is doing real work.

Applied here:

| the good thing       | the escape           |
| -------------------- | -------------------- |
| `a == b`             | `LegacyEquals(a, b)` |
| `Timestamp.now()`    | `unsafe new Date()`  |
| a validated function | `function f(! x: 0)` |

Each escape is longer, noisier, and harder to skim past than the thing it replaces. That is
not an accident to be tidied up later.

**Two consequences, both load-bearing:**

1. **Never optimize the ergonomics of an escape hatch.** A short alias (`Leq`, `@unsafe`)
   makes the dangerous path as cheap as the safe one and quietly deletes the entire
   mechanism. Requests to add one are requests to remove the safety.
2. **If the dangerous thing is easier to write than the safe thing, the design is wrong** —
   and the fix belongs in the _safe_ path, not in a warning. This is why `Timestamp.now()`
   became a drop-in for `Date.now()` instead of us writing a better diagnostic: the correct
   response to "the unsafe way is more convenient" is to make the safe way convenient.

The principle also says when NOT to add friction. An escape that is merely _unfamiliar_
rather than _dangerous_ is just an obstacle — the ugliness has to be proportional to the
risk, or it becomes noise people learn to ignore.

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

## The formal AST contract is AJS's, and syntax is subordinate to it

**AJS's JSON AST is the specified artifact. TJS does not get one, and does not need one.**

Why the scope is drawn there:

- **TJS has no AST to specify.** It runs ~16 source-text transforms (`const!`, `!.`,
  `==`→`Eq`, wasm extraction, parameter rewriting) and hands JS-parseable text to acorn.
  Type information lives in `TypeDescriptor`, not in a syntax tree. Specifying a TJS AST
  means building a real parser first — a large, separate decision.
- **The ecosystem does not need a fifth JavaScript AST.** ESTree, Babel, SWC and
  typescript-estree already compete; adding another dialect unifies nothing.
- **TypeScript's conspicuous gap is not its AST — it is type erasure.** The formal artifact
  worth offering is a serializable _type_ representation (JSON Schema + `$predicate`), which
  is the north star below. That is a thing TS genuinely cannot do.
- **AJS is small, subset-by-design, already JSON, and already has a consumer** — the VM
  executes it. It is specifiable, and a spec would be load-bearing rather than decorative.

### The consequence: AJS's surface syntax may only grow into its AST

Making AJS _nicer_ — a better on-ramp for JS and TJS authors — is bounded by the contract.
A proposed nicety must be one of:

1. **Sugar that desugars into existing nodes.** Free: the AST is unchanged, and every
   consumer keeps working.
2. **A deliberate, versioned, ADDITIVE extension** — new node kinds only, never a changed
   shape for an existing one, so previously-valid ASTs stay valid.

If a nicety is neither, it does not ship. **The AST is the specification and the surface
syntax is a projection of it** — not the other way round, which is how contracts erode: the
usual failure is syntax growing first and the tree being patched to follow.

Current node set (unversioned today — versioning it is prerequisite work):
`arg`, `array`, `binary`, `call`, `conditional`, `ident`, `literal`, `logical`, `member`,
`object`, `unary`.

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
