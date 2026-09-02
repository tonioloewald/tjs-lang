# TJS-Lang TODO

# CRITICAL PATH: correctly handling TypeScript (2026-08-01)

**This is now front and centre.** It unlocks everything else and is the only route to
adopting TJS completely for our own projects — which makes **our own codebase the acceptance
test**, with numbers instead of opinions.

## Formalise the AJS AST (decision 2026-08-02)

- [ ] **Bootstrap canary is timing-fragile under subprocess load.** `src/use-cases/bootstrap.test.ts` > "should transpile all TJS lang modules" timed out once at 6.2s during a `test:fast` run,
      immediately after `src/lang/multi-module.test.ts` was added (that file runs one `bun build`
      plus nine `node` spawns). It passed in isolation both with and without SKIP_BENCHMARKS, and
      two subsequent full `test:fast` runs were clean — so it is contention, not a regression.
      Recorded rather than ignored because an intermittent red that nobody wrote down becomes
      "the suite is just flaky". Fix by giving the canary a load-independent budget, or by having
      multi-module.test.ts reuse a prebuilt runtime bundle instead of building one.

- [ ] **Stable declaration IDs with a metadata side-table** (user's proposal). Give each
      declaration an identity independent of its name, resolved through a table carrying the
      human-readable name and source location — so emitted bindings can be renamed freely
      (hygiene) while errors, `.d.ts` and docs still show the real name. The motivating case
      (type/value name collisions) turned out NOT to need it — the guard was simply blind to
      imports and destructured declarations — but the underlying distinction it encodes,
      _the name a caller writes is not the name that gets bound_, was the root of three
      separate defects on 2026-08-31 (destructured parameter renames, the checks emitted for
      them, and the value-binding scan). An identity layer makes that structural instead of
      something every pass has to remember. Feeds `docs/type-system-north-star.md` directly:
      canonical type representation wants exactly this addressability for `.d.ts` <-> runtime
      correlation. Assign IDs from content (name + kind + scope), NOT a counter — a counter
      shifts every downstream ID when a line is inserted, churning emitted output, `.d.ts` and
      the IndexedDB metadata cache on an unrelated edit. Does NOT help the overload cluster
      (type erasure) or renamed dictionary members (both names are load-bearing strings).

- [ ] **Validate destructured members that are RENAMED** (`{ size: size_ = 8 }`). Today a
      rename is treated as plain JavaScript destructuring and gets no dictionary-member
      validation, because the payload key (`size`) and the bound name (`size_`) are different
      names going to two different places: the key belongs in the metadata a caller reads, the
      binding is the only variable a runtime check can reference. Conflating them emitted
      `typeof size !== 'number'` into a body where `size` does not exist. Skipping is correct
      today (TJS ⊇ JS — plain destructuring must keep plain behaviour) but it is a gap: a
      renamed member is unvalidated where a shorthand one is not. Fix needs a `binding` field
      on `ParameterDescriptor`, distinct from the metadata key. See `inference.ts`'s
      `!prop.shorthand` guard and the tests in `dict-defaults.test.ts`.
      **Decision: the formal AST contract is AJS's, not TJS's** — see PRINCIPLES.md for why
      (TJS has no tree to specify; the ecosystem has four JS ASTs already; TS's real gap is type
      erasure, which the type-representation north star addresses instead).

**Binding consequence:** AJS's surface syntax may only grow into its AST — sugar that
desugars into existing nodes, or a deliberate, versioned, ADDITIVE extension. Anything else
does not ship. The AST is the spec; syntax is a projection of it.

- [ ] **Version the AST.** It is unversioned today, which makes "additive extension" an
      unenforceable promise. Prerequisite to everything else here.
- [ ] **Write the spec** — the node set is small enough to state completely:
      `arg`, `array`, `binary`, `call`, `conditional`, `ident`, `literal`, `logical`,
      `member`, `object`, `unary`.
- [ ] **Conformance suite** — the artifact that makes the spec real rather than aspirational,
      and the thing an outside implementer can run.
- [ ] **A guardrail test that the node set only grows**: a new kind is fine, a changed or
      removed shape fails. Same shape as the other invariant tests — the promise should be
      enforced, not documented.
- [ ] When proposing AJS ergonomics, state which category the change is (sugar / additive
      extension) **before** designing the syntax.

## Scoreboard (`src/lang/dogfood-convert.test.ts`, ratcheted)

| stage                                | now              | target                                      |
| ------------------------------------ | ---------------- | ------------------------------------------- |
| 1. TS → TJS emit                     | **100%** (92/92) | hold                                        |
| 2. converted output COMPILES         | **89%** (82/92)  | **100%** — anything less is a converter bug |
| 3. graduation to real TJS (modes on) | **74%** (68/92)  | 100%                                        |

Plus `ts-compat.test.ts` acceptance **12/25** and `ts-tightness.test.ts` **7/12**.

## Order of work (dependency order, not preference)

1. [x] **Stage-2 bugs — DONE 2026-08-01: 93/93 (100%), pinned at `toBe(1)`.** Seven bugs;
       FOUR were the same defect class (hand-rolled literal tracking) in four different
       scanners, now sharing one implementation in `src/strip-comments.ts`. Stage 3 rose to
       77/93 (83%) as a side effect, and every remaining graduation failure is now a
       legitimate footgun site — `new Date`/`Date.now` (9), `var` (4), `new Function` (3) —
       with no parse errors and no converter bugs left. That makes stage 3 a clean work
       queue for the rewrite-and-guidance pass (item 3) rather than a mix of real bugs and
       real work.

   - [x] **Regex literals read as comments** (`/\*\//`, `/\/\//`) — fixed; +2 files.
         Found by dogfood, invisible to unit tests.
   - [x] **`as` casts survived in parameter defaults** — `getText()` returns raw source,
         so `m = {} as M` emitted an unparseable default. Now dropped WITH a
         `/* TJS: dropped … */` note, per "we don't erase TypeScript". +1 file.
   - [x] **TS overloads with rest params (2).** `core.ts`/`index.ts`. The converter
         already maps TS overloads onto TJS polymorphic dispatch — a genuine UPGRADE,
         since TS erases overload signatures at runtime while TJS makes them real. What
         was missing is a FALLBACK when the upgrade isn't expressible: TJS dispatch
         rejects rest params, so `ajs(strings, ...values)` produced code our own language
         refuses. Now falls back to the implementation (which is all TypeScript actually
         runs) plus a comment naming the upgrade we skipped. +2 files.
   - [x] **Embedded-test extraction ignored line comments (1).** Documentation that
         _mentions_ the test syntax was extracted as a real test — `from-ts.ts` did it to
         its own doc comment.
   - [x] **Paren extraction wasn't regex-aware (1).** A `)` inside a character class
         closed the enclosing paren, handing the caller the fragment `/[` and leaving
         every later function untransformed.
   - [x] **Escaped backslash desynced the string scanner (3).** Closing strings via the
         lookback `source[i-1] !== '\\'` is wrong for `'\\'`, a line this codebase writes
         constantly. One fix cleared three files.
   - [x] **Polymorphic detection scanned string literals (1).** `create-app.ts` ships
         scaffolding templates containing `function greet(...)`. Fixed with a shared
         `maskLiterals` in `src/strip-comments.ts`.
   - [x] **Duplicate emission of `export function fromTS`.** The embedded-test regex
         matched a `/*test` written INSIDE this file's own JSDoc — which documents the
         syntax and spaces the closing marker (`}* /`) so it doesn't terminate the doc. The
         lazy `[\s\S]*?\*\/` then ran to the next REAL close hundreds of lines later,
         swallowed the region, and re-emitted it verbatim. Replaced the regex with a
         scanner: block comments are consumed whole, so anything written inside one can
         never be a candidate.
   - [x] **Location mapping "bug" — DISSOLVED.** The five past-end-of-line positions were
         a symptom, not a cause: a scanner desync upstream left later functions
         untransformed, so acorn failed far from the real damage. Fixing the scanners
         fixed the positions.

2. [ ] **Observe mode** — the zero-risk entry point, and the only value we can deliver to a
       TS coder who never converts anything. Independent of 1, so it can run in parallel.
3. [ ] **Converter rewrite + guidance pass** (`==`, `var`, `n = 5` → `5.0`) — obligations 1
       and 3 of the conversion contract. Needs 1 done to be meaningful.
4. [ ] **Acceptance gaps** — `T[]`, `n: T = default`, then angle brackets (4 gaps, 1 cause).
5. [ ] **Tightness** — arrow params first (they validate nothing today and arrows are
       everywhere), then literal unions / rest / tuples.
6. [ ] **`tjs-convert-in-place`** — UX on top; only worth it once 1–3 are solid.

# 1.0 release scope (2026-08-01)

## The list

- [ ] **Migrate to tosijs-ui for the build / demo system**
- [ ] **Emit our manifesto as _TypeScript: The Good Parts_**
- [ ] **Emit our tutorial as our K&R**
- [ ] **Make a backend available by default for the VM** so examples all just work
- [ ] **Finish and smooth the TS → TJS on-ramp** (acceptance 13/25, tightness 7/12, the
      ladder, the converter's rewrite+guidance pass)
- [ ] **Finish, smooth, and tighten the AJS VM**
- [ ] **Turn all errors into teaching points** where possible
- [ ] **Turn all doubt into guidance** where possible
- [ ] **Test our assumptions** about legibility, token usage, etc. — and **publish the
      harness and the findings**
- [ ] **Exemplify our own claims**: self-hosted for real, literate programming demonstrated,
      transparent, consistent

## Editor vocabulary — the remaining gap (2026-08-29)

`given` shipped with no highlighting and no completion, which is the language lying about
itself in the first place anyone looks. That is now hard to miss: `src/lang/keywords.ts` is
the registry, and `editors/vocabulary.test.ts` fails by name if a registered construct has no
proof snippet, is absent from an editor list, is missing from the BUILT grammar, or has no
completion — plus a source scan that catches a construct which never reached the registry at
all. All four guards mutation-checked.

One gap is named rather than closed:

- [ ] **Contextual completion inside `Type` / `Generic` blocks.** `predicate`, `example`,
      `description` and `declaration` are legal only inside one, so they correctly have no
      top-level completion — but inside a block the editor offers nothing at all. The
      completions guard is driven off `TJS_STATEMENT_KEYWORDS` for exactly this reason; when
      contextual completion lands, `TJS_BLOCK_MEMBERS` gets the same treatment.

## Optional object params — RESOLVED, was my misreading (2026-08-29)

I recorded "optional object parameters are not writable in TJS" as a language bug. That was
wrong, and the record is corrected here rather than quietly deleted. `docs/dictionary-defaults.md`
§5.1 already resolved it (2026-07-18, OQ1): required-ness lives at the PARAM level, `:`
required and `=` defaulted, and an optional options-bag is the motivating case for the whole
feature. Per-member defaults live in the DESTRUCTURE (`function f({ a = 3, b: 4 })`); the
`opts = {…}` param form exists because JS/TS destructuring defaults do not behave the way you
would want. Verified against the spec: fresh clone on absence (§5.5), merge-on-partial (§5.2),
identity when complete — and atomic JS defaults until graduation (§3).

Every failure I saw was the CONVERTER emitting things a dictionary default cannot hold, and
§6.1 rejecting them correctly. All three fixed: interface members of unresolvable type now map
to `null` (the inline-object path always did), object examples are taken in VALUE position so
members are values rather than type names (`{ a: number }` is `number is not defined` at
runtime), and an example that cannot be a pure literal at all falls back to the colon form
with a warning naming §6.1.

## `f({ a = 1, b = 2 })` called with nothing — MEASURED 2026-08-31, decided

**Today it throws, exactly as JavaScript does.** `= {}` on the pattern is what makes it
omittable. Per-member defaults DO work for partial payloads — `f({a: 9})` gives `{a: 9, b: 2}`,
matching the dictionary-default param form. Pinned by three tests in `parser.test.ts` so it
cannot change by accident.

### The measurement

`experiments/agent-legibility/destructured-optional-probe.ts`, results beside it. On
qwen3.8-27b, five samples, controls included:

| arm                         | correct | **wrong** | no-answer |
| --------------------------- | ------- | --------- | --------- |
| js-plain _(control)_        | 4/5     | 1         | 0         |
| **inferred rule** (no mark) | 0/5     | **4**     | 1         |
| **explicit `{…}?`**         | 0/5     | **0**     | 5         |

The inferred rule reads **confidently wrong**, because its shape is JavaScript's and the
reader applies JavaScript's rule. The explicit mark produces **no wrong answers at all** —
only refusals to commit. That is the `switch` → `given` result replicated on a second
construct: familiar shape with changed meaning ships bugs; a novel mark does not, it just
needs documenting.

Caveat recorded rather than buried: the control is 4/5, not 5/5, so magnitudes are soft. The
direction is what carries.

### Second probe: is the JS baseline itself clear? (2026-08-31)

Treating JavaScript as an ARM rather than a control changed the reading.
`destructured-baseline-probe.ts`, two questions:

| arm                     | arity correct | **arity wrong** | fill correct |
| ----------------------- | ------------- | --------------- | ------------ |
| js-plain                | 4/5           | 0               | 5/5          |
| **js-default** (`= {}`) | 3/5           | **2**           | 5/5          |
| ts-plain                | 3/5           | 0               | 5/5          |
| **tjs-marked** (`{…}?`) | 0/5           | **0**           | 5/5          |

- **Nobody is confused about the fill.** 5/5 on every arm, every language, including TJS.
  `f({a: 5})` giving `b === 2` is understood everywhere. The whole difficulty is arity.
- **JavaScript's own idiom is the worst arm.** Textbook `{ a = 1, b = 2 } = {}` drew the only
  confident wrong answers in the study. `= {}` reads as decoration, not as a signal.
- **The explicit mark never misleads** — zero wrong across both questions.

So the objection "TJS would diverge from a clear baseline" does not survive: the baseline is
not clear. On the column that ships bugs, `{…}?` (0 wrong) beats `= {}` (2 wrong).

### Decision

- [ ] **If built, spell it `f({ a = 1, b = 2 }?)`.** Do not infer it.
- **`?`, not `!`.** `!` already means _skip validation_ at the head of a parameter list
  (`function f(! a: 0)`), so `f({…}!)` would give one character near-opposite meanings inside
  a single parameter list. `?` already means _optional_ on `name?:`. No second marker is
  needed — absence means required, which is both today's behaviour and JavaScript's.
- **Converted code and `dialect: 'js'` keep throwing** regardless. Making `f()` work for
  TypeScript passing through TJS is a behaviour change, and those belong at graduation.
- Worth noting the risk here is milder than `switch`'s: a misread predicts a throw that does
  not happen, so the failure mode is code that used to crash now working. That is why this was
  worth measuring rather than refusing outright.

## A comment in a parameter list breaks a REGEX return type (2026-08-31)

```js
function f(a /* c */):! /example/ { return /x/ }   // annotation NOT stripped -> does not parse
function f(a):! /example/ { return /x/ }           // fine
function f(a /* c */):! '' { return '' }           // fine — only the regex example breaks
```

Pre-existing and narrow, and nothing emitted comments into parameter lists until the optional
object-param hint tried to. It does not any more — the hint goes to `warnings` instead —
because emitting code that does not parse in order to carry a comment is not a trade worth
making. zod's `packages/zod/src/v4/core/regexes.ts` is the file that found it.

- [ ] Fix the interaction, then reconsider putting the hint back inline where the reader is.
      `extractReturnTypeValue` handles a regex example correctly on its own; something about a
      preceding comment in the parameter list stops the annotation being reached at all.

## Demo model — DEPLOYED 2026-08-30, partly verified

`demoPredict` is live in `tjs-platform` (us-central1), on `gemini-3.5-flash-lite`, with the
`GEMINI_API_KEY` secret bound automatically at deploy. `health`, `agentRun`, `run` and `page`
were updated in the same deploy and all report success.

Verified against the live endpoint:

- `/health` -> `{"status":"ok", "tjsLang":"0.13.6"}`
- `demoPredict` unauthenticated -> **HTTP 401 UNAUTHENTICATED**, with the sign-in message

NOT yet verified, because it needs a signed-in user and the demo client is not deployed:

- [ ] **The Gemini call itself** — key, model ID and response shape. A wrong model ID returns
      the upstream message verbatim, so a failure here will name itself rather than look like
      an outage. This is the last unproven link.
- [ ] **The quota against real Firestore.** The counting logic has seven tests against an
      in-memory fake (`functions/src/demo-llm.test.ts`), but the fake cannot prove the
      transaction is atomic under contention — that is Firestore's job.
- [x] **Billing alerts** — already in place (confirmed 2026-08-31). The caps bound CALLS
      (100/user/day, 5000/day global); the alert is what bounds the surprise.
- [ ] Firestore at the global cap: 2 reads + 2 writes per call = 10k/10k per day, inside the
      free tier (50k/20k) but within 2x on writes. Check before raising `DAILY_GLOBAL`.

## The compat lane, now that it measures our own converter (2026-08-30)

The lane defaulted to `fromTS(source)`, which emitted JS through `ts.transpileModule`. Its
`--full` flag (TS → TJS → JS) defaulted OFF, three of the six scripts never had one, and
`compat-all.ts` spawns every script with no arguments — so the numbers CLAUDE.md cites as
"the most honest evidence the converter works" were largely evidence that the TypeScript
compiler works. There is now one path and no flag; `src/no-ts-emitter.test.ts` keeps it that
way.

**First honest re-baseline, all six targets.** 15 transpile failures across five codebases
(zod skipped — needs `corepack enable pnpm`). They collapse into two causes, which is the
useful part: fixing two things fixes nearly all of it.

- [ ] **`Identifier 'X' has already been declared` (9 failures — effect ×4, kysely ×5+).**
      TypeScript's declaration-merging idiom: `export const Console = …` beside
      `export interface Console`. The type is erased at runtime in TS, so the names never
      collide; converting the interface to a runtime `Type Console` makes them collide.
      `from-ts.ts` already has a guard for exactly this (`valueNames.has(typeName)` — "A TYPE
      and a VALUE may share a name in TypeScript"), so this is a gap in an existing rule
      rather than a missing one. Highest value: it is the single biggest blocker on the two
      largest corpora.
- [ ] **`Polymorphic function 'X': variants 1 and 2 have ambiguous signatures` (5 failures —
      radash `max`/`all`, superstruct `enums`, ts-pattern `when`, effect `next`).** TS
      overloads distinguished by type-parameter constraints, which the converter erases before
      dispatch sees them. Needs either constraint-aware dispatch or an honest decline.
- [ ] **`superstruct src/utils.ts:188` — `Unexpected token`.** One-off parse failure, not yet
      diagnosed.

### The remaining 16 (2026-08-30) — corpus 618/634, 97%

Measured on restored sources. No cluster larger than 2; each needs its own diagnosis. Use
the PREPROCESSED source to locate a failure — acorn's offsets are into that, not the TJS, and
reading the TJS line at that number sends you after ghosts (cost several wrong turns).

- [ ] **The converter emits invalid JavaScript in two shapes** (4 files). Not language gaps —
      `acorn` rejects them too. `const f = (a)\n  => a` puts `=>` on its own line, which is a
      SyntaxError in JS (`ArrowParameters [no LineTerminator here] =>`), and
      `const registered: Array = []` leaves a TypeScript annotation on a variable. Both
      convert CORRECTLY in isolation, so it is context — most likely a statement reaching a
      path that copies source text rather than transforming it. Highest value of what is
      left, because emitting invalid JS is worse than declining.
- [ ] **`FunctionPredicate(…)` inline as a parameter example** (2 files: zod `$constructor`,
      radash `objectify`). The converter emits it; the parser will not read it there.
- [ ] **`add(schema, ..._meta: [null])`** — rest parameter with an annotation in a METHOD.
      The same shape in a plain function is fine.
- [ ] **`defaultValue: (): boolean | "client" | "server" => false`** — arrow with a union
      return type inside an object literal.
- [ ] **2 remaining ambiguous overloads** (`onError` in two effect files) and **2
      already-declared** (kysely `Database`, effect `EntityRegistered`) — the guards land, but
      these two shapes still slip past.

- [x] **The compat clones are left DIRTY after every run, poisoning the next measurement.**
      DONE 2026-08-30 — every script now restores in a `finally`, so an interrupted or failed
      run cannot leave our own output sitting under a `.ts` name. (Three of six were dirty
      when this was found; ts-pattern read 23/24 contaminated, 24/24 clean.)
- [x] **The lane's verdict was meaningless.** DONE 2026-08-30 — a transpile failure now sets
      `process.exitCode = 1`, so `compat-all` reports the target as failed. It used to print
      `5 passed, 0 failed` while superstruct ran zero tests and ts-pattern failed on source
      that never transpiled. Verified: radash exits 1 with its one remaining failure.
- [x] **Test failures now fail the lane.** DONE 2026-08-30. A red suite, or one that ran
      ZERO tests, sets a non-zero exit.

**First honest verdict (2026-08-30): 0 passed, 5 failed, 1 skipped** — where the same lane
reported `5 passed, 0 failed` the day before. It did not get worse; it started telling the
truth. What each is actually failing on:

- [ ] **ts-pattern — converts cleanly, then BREAKS AT RUNTIME.** 24/24 files transpile, and
      the suite fails with `P.array is not a function or its return value is not iterable`.
      This is the most valuable failure in the lane: a fidelity defect that a parse-rate
      metric cannot see, and the clearest evidence that "100% parse" and "100% correct" are
      different targets. Chase this before chasing parse-rate.
- [ ] **superstruct — 8/8 files transpile and ZERO tests run.** A harness problem, not a
      converter one, but it made the target report green for months.
- [ ] **kysely — 5 transpile failures**, including `'super' keyword outside a method`, which
      suggests a class body is being emitted detached from its class.
- [ ] **effect — 3**, **radash — 1** (`src/array.ts`, partly fixed since this run).

## Value for the TS coder who NEVER switches (the wedge, 2026-08-01)

**The strategic question:** how much can we deliver to someone who keeps writing `.ts` and
renames nothing? Because that is what turns adoption from a decision into a local upgrade —
_"oh, if I change this one file to `.tjs` I get inline wasm."_

**Hard constraint (user):** _we are explicitly NOT adding runtime type checking to TS that
crashes TS._ Enforcement on TS-origin code would return `MonadicError`s where TypeScript ran
fine — breaking working code and violating obligation 1 of the conversion contract. Measured
2026-08-01: converted TS currently does **not** validate (the `/* tjs <- */` marker suppresses
it). **That is correct behavior, not a bug.**

**So the wedge is OBSERVE MODE, not enforcement** — the only form of type checking that
_cannot_ crash TS, because it records and returns the original value. It is the one feature
that makes "point TJS at your TypeScript" a zero-risk proposition.

What a non-switching TS coder could get, all without changing a line:

- [ ] **Observe mode** — every annotation they already wrote, checked at runtime, violations
      recorded, behavior unchanged. **TypeScript erases these; we don't.** This is the whole
      pitch, and it is safe by construction.
- [ ] **Flight recorder** — the report that makes observe mode worth turning on.
- [ ] **Docs from signatures**, generated from annotations they already have.
- [ ] **Inline tests via `/* @tjs test '…' { } */`** — the passthrough already exists as a
      mechanism; verify it survives the `.ts` path and make it a first-class story.
- [ ] Then, and only then, per-file graduation: rename ONE file to get inline wasm, safe
      eval, dict defaults. The switch stops being a migration and becomes a feature request.

**Open question, deliberately not "fixed":** an explicit `safety: 'inputs'` is currently
ignored for marker-bearing source (`dialect: 'tjs'` and stripping the marker both enable
validation, the explicit option does not). Explicit-beats-inferred is the usual rule, but
here the guard is protecting the no-crashing-TS constraint. Decide whether an explicit opt-in
should be honoured — it is the difference between "we won't do this to you" and "you may not
have this".

## `tjs-convert-in-place` — the file requests its own upgrade (idea, 2026-08-01)

Add a marker to a `.ts` file; the transpiler converts it **in place** on the next run and
leaves guidance comments. You read the diff and act on what it flagged.

**Why this is the right shape.** It removes the last piece of ceremony from the on-ramp:
no CLI incantation, no path arguments, no "which flag was it". It is per-file and
incremental — exactly the ladder — and **the diff is the review**, which is the artifact
developers already know how to read. It also puts the request where the work is, the same
reason converter guidance goes at the site rather than in a migration guide.

**Design decisions to make before building — this writes to source files, so the failure
modes are the whole design:**

- [ ] **Self-removing.** The marker must delete itself as part of the conversion, or every
      subsequent build re-converts an already-converted file. Non-negotiable.
- [ ] **Idempotent regardless**, because someone will re-add it or a merge will resurrect it.
      Converting converted code must be a no-op, not a double conversion.
- [ ] **Does the file get renamed to `.tjs`?** Leaving TJS content in a `.ts` file breaks
      `tsc`, the editor, and everything else pointed at it. Options: rename (clean, but the
      tool moves files), or emit **TjsCompat-level TJS that is still valid TS** and leave
      renaming to the human as the next rung. The second is more in keeping with the ladder
      and much less alarming.
- [ ] **Builds must not silently write source.** A build that mutates its inputs is a
      surprise with a bad blast radius (CI, watch loops, other people's checkouts). Gate it:
      refuse on a dirty git tree, or restrict to an explicit `tjs convert --in-place` /
      dev-server run, with the marker as the _selector_ rather than the trigger.
- [ ] **Guidance comments are the deliverable**, per the conversion contract's obligation 3.
      Every site we could not rewrite safely must be commented, so the diff is a to-do list.
- [ ] Play well with Prettier/ESLint — output should already be formatted the project's way,
      or the review diff is noise.

## Observe mode — check, record, keep going (MISSING; migration's bottom rung)

**Verified absent 2026-08-01.** `TJSConfig` offers exactly three behaviors — return a
`MonadicError` (default), also log it (`logTypeErrors`), or throw (`throwTypeErrors`). **All
three change program behavior**: the emitted check is `if (bad) return __tjs.typeError(...)`,
so a violation _replaces the function's result_.

There is no way to say **"validate everything, record every violation, and carry on with the
original value."** That is the mode you want when pointing TJS at a legacy codebase: a
complete report of every type violation, breaking nothing. It is JSLint for runtime types,
and it is the natural **bottom rung of the ladder** — the zero-risk step before `TjsCompat`.

It also completes the flight recorder's premise. The recorder exists because returned errors
are easy to ignore; observe mode is the setting where you _deliberately_ ignore them and read
the recording instead.

- [ ] Add the config (`observeTypeErrors`, or better a `mode: 'enforce' | 'observe'` — the
      boolean-soup shape is already at four flags).
- [ ] **Emitter change required.** `if (bad) return __tjs.typeError(...)` must become
      `if (bad) { const e = __tjs.typeError(...); if (e) return e }` so `typeError` can
      record and return falsy in observe mode. One extra branch per check.
- [ ] **Keep the inline runtime stub in sync** — emitted code calls the inline `typeError`
      bare, so observe mode must work in standalone output too, or it silently enforces
      there (see CLAUDE.md, "the inline runtime is NOT the real runtime").
- [ ] Report: aggregate the recording into "here is every type violation in your codebase",
      grouped by site — the deliverable that makes this worth turning on.

## Agent legibility — the open probes (2026-08-28)

- [ ] **Does a file-header link help an agent that can FETCH it?** Every header arm measured
      so far ran against a raw completions endpoint with no tools, so the finding "a pointer
      invites speculation, the inline rule is what works" is scoped to a model that cannot
      resolve the pointer. The real deployment is a coding agent in an IDE, which can — and
      that is the premise `llms.txt` rests on. Needs a **tool-using rig**, not a larger N;
      the current harness structurally cannot answer it. Until it is run, do not generalise
      the header result beyond "within a single file".
- [ ] **Where is the capability threshold?** A one-line rule comment takes comprehension from
      0/5 to 5/5 on a 27B and does nothing at all on a 4B (`ASSUMPTIONS.md` A15). Nothing
      locates the boundary between them, and it decides who our in-code guidance is for.
- [ ] **Rank comment WORDINGS.** Every "with comment" arm hits 5/5, so the instrument is
      saturated and cannot compare phrasings. Needs a harder task or a mid-size model before
      any micro-optimisation of the text is meaningful.

## Adoption-intent harness — "would you switch?" (assumption testing)

The legibility harness measures whether a model can _write_ TJS. This measures something we
have never tested and which is closer to the actual product question: **after working with
it, would you adopt it?** Give a model real tasks, then ask for a reasoned verdict.

**Tasks (each is also a DX probe):**

- [ ] Convert legacy TS/JS to TJS.
- [ ] Read an error and correct the code.
- [ ] Read the _emitted_ code and explain what it does.
- [ ] Interpret our comments and guidance (the converter's "upgrade" comments, remedies).
- [ ] Larger models only: **assess and reflect on the process** — where it helped, where it
      got in the way.

**Two levels of success, scored separately — they are different products:**

1. **"I'd use TJS instead of tsc for the DX alone"** — inline tests, docs from signatures,
   the flight recorder, observe mode. _This bar does not require anyone to believe in
   runtime types_, which makes it the easier and probably the more important one to clear
   first.
2. **"I'd switch for the capabilities"** — runtime type safety, inline WASM, fewer footguns,
   safe eval.

- [ ] Report **level-1 and level-2 rates separately**, plus the reasons given. The reasons
      are the real output: a "no" that names a specific missing thing is worth more than a
      "yes".
- [ ] Run it against the SAME tasks in plain TS as a control, or "would you switch?" measures
      nothing but agreeableness.
- [ ] Beware the obvious bias: a model asked "would you switch?" by the thing's author tends
      to say yes. Prefer forced comparisons and specific commitments ("which of these two
      files would you rather maintain, and why") over direct approval questions.

## Additions — what the list doesn't cover

Ordered by how much damage each does if 1.0 ships without it.

- [ ] **Close the security ledger, explicitly.** "Tighten the AJS VM" is doing a lot of
      quiet work here. The pitch is _safe eval_, so 1.0 should not ship with `S6`
      (🔍 untested — never externally red-teamed) as the headline caveat. Specifically:
      the **escape-attempt corpus** (vm2 CVEs, SES challenges), **§4 open-graph blast
      radius** — carried budgets and per-capability quotas, on which _no work has been
      done_ — the **membrane accessor-property gap**, and the **cost-invariant fuzzer**.
      An outside week of red-teaming is worth more than another thousand unit tests.
- [ ] **A stability contract — this is what 1.0 MEANS.** What is public API vs internal?
      What may change in a minor? Which surfaces are experimental? Right now nothing states
      it, and after 1.0 every accident becomes a promise. Include: the emitted `__tjs`
      metadata shape, the mode directives, `MonadicError`'s shape, and the atom set.
- [ ] **Version the curated error messages.** Follows directly from "errors as teaching
      points": once they teach, people depend on them, so at 1.0 they are spec and need
      versioning and fires-on-trigger tests — not just good copy.
- [ ] **Enforce the conversion contract mechanically.** The on-ramp's load-bearing promise
      (_equivalent_ behavior) is currently kept by hand. Needs the behavioral-equivalence
      harness before 1.0, or the guarantee is a claim rather than a property.
- [ ] **State the non-goals.** A short "what TJS deliberately does not do" (no sound type
      system, no type-level metaprogramming, no whole-program inference…). Cheap, and it
      converts a stream of "why doesn't it…" into a design position.
- [ ] **Upgrade path from 0.x**, given how much has moved since 0.12.0.
- [ ] **Resolve or soften the performance claim.** `L3` ("safe is fast") is ⚠️ nuanced —
      measured on exactly one workload. At 1.0 either finish the campaign or state the
      claim narrowly; a load-bearing marketing claim resting on one benchmark is the same
      failure class as the stale bundle table (`L4`).
- [ ] **Runtime/platform matrix.** Node, Bun, Deno, browsers, and a fresh-install check of
      the published tarball (Bun reads `src/`, which has hidden Node packaging bugs before).

## TypeScript++ — the release-shape decision (2026-08-01)

**Goal: TypeScript++, not JavaScript++.** Paste a `.ts` file in, change the extension, it
works — with TJS's extras available when you want them. **We are at 48% (12/25)** on an
ordinary-TypeScript corpus (`src/lang/ts-compat.test.ts`, which prints the score and fails
if a gap silently closes or a supported case regresses).

The failures are not exotic — `string[]`, `interface`, `type`, generics, `as`, class field
types, `enum`, `Record<K,V>`. **Essentially no real-world TS file pastes in clean today.**

### The distinction that drives release shape

- **Acceptance gaps** — TJS rejects syntax TS allows. Closing one is purely **additive**:
  nothing that worked stops working (guarded by `subset-invariant.test.ts`). **These never
  force a consumer to edit code**, so they can land in any release.
- **Semantic drift** — a spelling that is legal TS _and_ legal JS which TJS reads
  differently. Closing one **changes the behavior of code people already wrote**. This is
  the only category that creates churn.

**Release rule (adopted):** _every semantic realignment ships with or before the release
that claims TypeScript++, never after._ One migration, once, in the release that delivers
the payoff — instead of a trickle of small breaking changes, which is exactly the "bunch of
releases that require consumers to change syntax" we are avoiding.

### Semantic drift — a CONVERSION job, not a breaking change (resolved 2026-08-01)

`function f(n = 5)` is legal TS and legal JS: TypeScript infers `number`, TJS reads the
initializer as an example and narrows to an integer. That looked like a forced breaking
change. It isn't — **the converter just rewrites it:**

```
n = 5     (TS: number)   →   n = 5.0   // TJS: `= 5` narrows to an integer, `= +5` to unsigned
```

Verified: `5.0` accepts floats **and** still defaults to `5`, so meaning is preserved
exactly, and the comment teaches the finer grain **at the site where it is relevant** rather
than in a migration guide nobody reads.

**Consequence: there is currently NO required breaking change, so no forced migration and no
"break once" release.** The release-sequencing question dissolves — see below.

**The general converter rule, worth applying everywhere: _preserve meaning, and comment the
upgrade._** Same shape as errors-as-curriculum — show the better option at the point of
contact instead of documenting it elsewhere.

- [x] `n = 5` → `n = 5.0` + upgrade comment. Rewrite verified; pinned in `ts-compat.test.ts`.
- [ ] Implement it in the converter (currently only established as correct, not built).
- [ ] **Sweep for other spellings that need the same treatment** — any legal-TS/JS form TJS
      reads differently. Each one found is either a converter rewrite (good) or a genuine
      break (needs a decision). The `==`/`var` cases are already known; the modes sweep in
      the section above covers `TjsDate`/`TjsClass`/`TjsStandard`/`TjsDictDefaults`.

### Acceptance gaps, grouped by ROOT CAUSE (6 jobs, not 13)

- [ ] **(b) angle-bracket type arguments** — one root cause behind four failures
      (`Array<T>`, `Promise<T>`, `Record<K,V>`, `function f<T>()`). Highest leverage.
- [x] **(a) `T[]` suffix** — DONE 2026-08-09. Rewrites to the array-example spelling
      (`xs: number[]` -> `xs: [0.0]`), so item checking, `.d.ts` and JSON-Schema come for
      free. Also closed the "rest params are not validated" row, which was a misdiagnosis:
      `...xs: [0]` always worked; `...xs: number[]` failed because of `T[]`.
- [ ] **(f) `n: T = default`** — annotated param with a default; extremely common in pasted
      TS, and adjacent to the drift item above.
- [ ] **(c) type-level declaration forms** — `interface`, `type`, `enum`, `import type`.
- [ ] **(d) class member annotations + modifiers** — `x: number = 1`, `private readonly`.
- [ ] **(e) `as` casts** — also unblocks the decided `/…/ as string` regexp spelling.

## Tightness: catch everything tsc catches (2026-08-01)

**Acceptance is not enforcement.** `ts-compat.test.ts` measures whether syntax _parses_;
`ts-tightness.test.ts` measures whether an accepted declaration actually _rejects what
TypeScript would reject_. A type that parses and validates nothing is the `s: string` → `any`
failure again — it looks typed, transpiles clean, and protects nothing.

**Score: 10/12 simple declarations enforce as tightly as tsc.**

Tight today: `string` / `number` / `boolean`, object shapes (wrong member type **and**
missing member), unions of primitives, nullable unions.

**Goal: catch everything tsc catches**, minus the places tsc is stupidly strict — and those
must be named individually, not waved at, or "we're less strict on purpose" becomes cover for
every hole.

- [x] **BUG — optional param with a TS type name emits broken code.** FIXED (verified
      2026-08-09: `f()` returns normally). Was: `n?: number` emitted
      `function f(n = number)`; **omitting the argument** (the entire point of an optional
      param) threw `number is not defined`. Passing one is fine, which is why it hid.
      **The fix needs a side channel:** `processParamString` produces ONE string feeding both
      the acorn parse and the emitted source, so simply stripping the annotation drops the
      only carrier of the type and silently degrades the param to `any` (tried, reverted —
      loud beats silent). Record the type name alongside `ctx.requiredParams` so the emitter
      can omit the default while inference keeps the type.
- [x] **Arrow function params are not validated at all** — DONE 2026-08-09. `findAllFunctions`
      walked `program.body` for `FunctionDeclaration` and nothing else, so `const f = (n: 0) => n`
      accepted anything while the identical `function` rejected it. Now both are checked, incl.
      concise bodies (a block is grown around the expression), `const f = function (…)`, and
      exported bindings. `(!)` is honoured via the `/* unsafe */` marker the param transform
      already leaves, since `unsafeFunctions` is keyed by a name an arrow does not have.
      Was: only `function` declarations get boundary checks. Arrows are everywhere in real
      TypeScript, so this was likely the
      highest-impact row here.
- [ ] **Literal union `x: 'a' | 'b'` does not narrow.** Each literal is read as an EXAMPLE, so
      both widen to `string` and the union collapses. **The one place the examples model
      genuinely collides with TS semantics** — a TS literal union should probably be honoured
      as an enum. Design decision, not just a missing check.
- [ ] **Rest params `...xs: number[]` are not validated.**
- [ ] **Tuple `p: [number, string]` does not check position types.**
- [ ] **Then: expression-level linting** toward tsc parity — call sites first (we already
      have declared param types at transpile time, so `f('x')` vs `f(n: number)` needs no
      dataflow), then local flow. See the spike in `experiments/static-types/`.
- [ ] Extend the corpus past _simple_ declarations. Complex ones ("better than no effort
      where possible") are a harder problem and deserve their own pass — but the simple set
      must be airtight first, because that is what people paste.

## Two escape shapes, and the `===` → `==` rewrite (2026-08-02)

Abolishing a mode needs an escape, and there are **two kinds of rule**, needing two kinds:

| rule changes…                                        | escape                               | example               |
| ---------------------------------------------------- | ------------------------------------ | --------------------- |
| what is **allowed** (Date, `var`, `eval`)            | `unsafe <expr>` — mark the construct | `unsafe new Date(x)`  |
| what an operator **means** (`==`, `===`, truthiness) | **named legacy functions**           | `LegacyExactly(a, b)` |

The second is the missing piece for `TjsEquals`/`TjsStandard`: there is no construct to
mark, because the operator is still spelled the same — so the escape has to be a _name_.
`DangerousLegacyEquals(a, b)` = JS `==` with coercion; `LegacyExactly(a, b)` = JS `===` (NaN unequal,
boxed not unwrapped). Named, greppable, and the word _legacy_ does the teaching.

- [ ] Implement `DangerousLegacyEquals` / `LegacyExactly` in the runtime; they unblock abolishing
      `TjsEquals`.

### `===` → `==` rewrite during conversion (obligation 2: upgrade where it is free)

Measured where `===` and `Eq` differ — **exactly four cases**, everything else agrees:

| case                                                               | `===` | `Eq`                                         |
| ------------------------------------------------------------------ | ----- | -------------------------------------------- |
| `NaN` vs `NaN`                                                     | false | **true** (deliberate — "JS gets this wrong") |
| `null` vs `undefined`                                              | false | **true**                                     |
| boxed `String`/`Boolean` vs primitive                              | false | **true** (the fix)                           |
| everything else — same-type primitives, distinct objects, `0`/`-0` | agree | agree                                        |

So the rewrite is provably meaning-preserving for **statically-known strings and booleans**,
and NOT for anything else:

- [ ] **Rewrite `a === b` → `a == b` when both operands are annotated `string` or `boolean`.**
      Silent; behavior identical. We already extract these types, so the information is there.
- [ ] **Numbers: rewrite but COMMENT**, because of NaN. `Eq(NaN, NaN)` is true by design, so
      the rewrite changes behavior in exactly that case — arguably an improvement, but
      obligation 1 says say so rather than assume.
- [ ] **Never rewrite `x === null` / `x === undefined`** — `Eq` conflates them. Flag instead.
- [ ] **Unknown/other types: leave alone and flag.** Cannot prove, so do not touch.

### Removing now-unnecessary defensive conversions

Code written against JS's `==` often carries workarounds that TJS makes redundant:

- [ ] `a.valueOf() === b.valueOf()` → `a == b` — **safe**, `Eq` already unwraps boxed
      primitives. A genuine cleanup.
- [ ] `String(a) === String(b)` → `a == b` — **NOT safe**: that coerces, and `Eq` does not
      (`String(1) === String('1')` is true; `1 == '1'` is false). Flag it, do not rewrite.

## Abolishing the modes, one at a time (in progress, 2026-08-02)

**Goal: the file extension is the only gate**, the way ESM made `"use strict"` implicit.
A rule that can be dialed off per file is not a rule — and once a per-file lever exists it
needs a spelling, which is how the mode system grew in the first place.

**The enabler shipped: `unsafe <expression>`** (`src/lang/unsafe-escape.test.ts`). It marks
ONE construct as deliberate, at the site. That is what lets a rule become unconditional: a
whole-file opt-out would also silence the next, _accidental_ use.

**Procedure per mode** — remove the directive, keep the dialect-driven flag (plain JS and
TS-originated source must keep the old behavior or TJS stops being a superset), add an entry
to `ABOLISHED_DIRECTIVES` so the removed word teaches instead of becoming a runtime
`ReferenceError`, then run the suite and the dogfood corpus.

- [x] **`TjsDate`** — first one done. Raw `Date` is now always banned in `.tjs`; `unsafe new
Date(x)` is the escape; `dialect: 'js'` unaffected.
      **Audited 2026-08-02 — five are clear, two need a decision, one should not go.**

- [x] **`TjsNoVar`** — DONE 2026-08-02. `unsafe var x = 1` is the escape. `unsafe var x = 1` verified working (the marker handles
      statements, not just expressions).
- [x] **`TjsNoeval`** — DONE 2026-08-02. `unsafe eval(src)` is the escape. `unsafe eval(s)` verified working.
- [x] **`TjsEquals`** — DONE 2026-08-02 (`DangerousLegacyEquals`/`LegacyExactly` are the escapes). Was: clear. The `Legacy*` bridges are the escape and they ship.
- [x] **`TjsClass`** — DONE 2026-08-02 (purely additive — no escape needed). Was: clear, and needs NO escape: wrapping is purely **additive**. Both
      `Point(1,2)` and `new Point(1,2)` compile; explicit `new` is a lint warning, not a
      ban. There is nothing to opt out of.
- [x] **`TjsSafeAssign`** — DONE 2026-08-02 (declare `let Foo` to keep it mutable). Was: clear. The escape already exists and is documented: declare
      `let Foo` up front instead of relying on bare-assignment auto-`const`.

**Needs a decision before abolishing:**

-

[

]

-
- `T
j
s
S
t
a
n
d
a
r
d`

—

R
E
S
O
L
V
E
D

2
0
2
6

- 0
  8
- 0
  2
  ,

n
o

b
l
o
c
k
e
r
s
.

-
-

I
t

d
o
e
s

t
w
o

u
n
r
e
l
a
t
e
d

j
o
b
s
,

a
n
d

b
o
t
h

w
e
r
e

m
e
a
s
u
r
e
d
.

I

h
a
d

p
r
o
p
o
s
e
d

s
p
l
i
t
t
i
n
g

i
t

f
i
r
s
t
;

a
b
o
l
i
s
h
i
n
g

t
h
e

m
o
d
e

d
i
s
s
o
l
v
e
s

t
h
a
t

q
u
e
s
t
i
o
n
,

b
e
c
a
u
s
e

d
e
l
e
t
i
n
g

t
h
e

d
i
r
e
c
t
i
v
e

d
e
l
e
t
e
s

t
h
e

c
o
n
f
u
s
i
n
g

n
a
m
e

—

t
h
e
y

s
i
m
p
l
y

b
e
c
o
m
e

t
w
o

r
u
l
e
s

o
f

t
h
e

l
a
n
g
u
a
g
e
.

-
- A
  S
  I

p
r
o
t
e
c
t
i
o
n

-
-

c
h
a
n
g
e
s

b
e
h
a
v
i
o
r

i
n

e
x
a
c
t
l
y

O
N
E

s
i
t
u
a
t
i
o
n
:

a

l
i
n
e

b
e
g
i
n
n
i
n
g

`(`
,

`[`

o
r

a

b
a
c
k
t
i
c
k

t
h
a
t

J
a
v
a
S
c
r
i
p
t

w
o
u
l
d

j
o
i
n

t
o

t
h
e

p
r
e
v
i
o
u
s

l
i
n
e
.

`
`
`
j
s

c
o
n
s
t

x

=

g

(
a
)

/
/

J
S
:

c
a
l
l
s

g
(
a
)
.

T
J
S
:

t
w
o

s
t
a
t
e
m
e
n
t
s
.

`
`
`

O
p
e
r
a
t
o
r

c
o
n
t
i
n
u
a
t
i
o
n
s
,

m
e
t
h
o
d

c
h
a
i
n
s
,

m
u
l
t
i

- l
  i
  n
  e

t
e
r
n
a
r
i
e
s

a
n
d

a
r
g
u
m
e
n
t

l
i
s
t
s

a
r
e

u
n
t
o
u
c
h
e
d
,

a
n
d

`;
(
…
)`

i
s

i
d
e
n
t
i
c
a
l

i
n

b
o
t
h

—

s
o

P
r
e
t
t
i
e
r

- f
  o
  r
  m
  a
  t
  t
  e
  d

c
o
d
e

c
a
n
n
o
t

b
e

a
f
f
e
c
t
e
d
.

-
- H
  o
  n
  e
  s
  t

t
r
u
t
h
i
n
e
s
s

-
-

d
i
f
f
e
r
s

i
n

e
x
a
c
t
l
y

T
H
R
E
E

c
a
s
e
s
,

a
l
l

b
o
x
e
d

p
r
i
m
i
t
i
v
e
s
:

`
n
e
w

B
o
o
l
e
a
n
(
f
a
l
s
e
)
`
,

`
n
e
w

S
t
r
i
n
g
(
'
'
)
`
,

`
n
e
w

N
u
m
b
e
r
(
0
)
`

—

J
S

c
a
l
l
s

t
h
e
m

t
r
u
t
h
y
,

T
J
S

d
o
e
s

n
o
t
.

E
v
e
r
y

o
t
h
e
r

v
a
l
u
e

a
g
r
e
e
s

(
`0`
,

`N
a
N`
,

`'
'`
,

`[
]`
,

`{
}`
,

`0
n`
,

`n
u
l
l`
)
.

-
- N
  o

e
s
c
a
p
e

i
s

n
e
e
d
e
d

-
- :

n
o
b
o
d
y

w
a
n
t
s

`
i
f

(
n
e
w

B
o
o
l
e
a
n
(
f
a
l
s
e
)
)
`

t
o

e
n
t
e
r

t
h
e

b
r
a
n
c
h
.

-

[

]

W
r
i
t
e

t
h
e

A
S
I

d
e
t
e
c
t
o
r

—

w
a
r
n

w
i
t
h

a

c
o
m
m
e
n
t

a
t

t
h
e

s
i
t
e

(
o
b
l
i
g
a
t
i
o
n

3
)
.

-

[

]

T
h
e
n

a
b
o
l
i
s
h

t
h
e

d
i
r
e
c
t
i
v
e
.

- [x] **`TjsDictDefaults` — escape solved, mode now abolishable.** `LegacyDefault({...})`
      wraps a single parameter's default and restores JavaScript's atomic semantics. It is
      PER-PARAMETER, which was the whole problem: the previous escape (a leading `!` on the
      function) disabled _all_ of that function's validation rather than just the merge —
      an escape more destructive than the thing being escaped.
- [ ] **Converter: wrap object-literal defaults and invite the upgrade.** This is the
      graduation-time trap. Converted TS keeps atomic defaults only because modes are off;
      the moment a file graduates, `args = {x: 0, y: 0}` silently becomes a dictionary. So
      conversion should wrap the default AND name the upgrade at the site:

      ```js
      // TJS: remove `LegacyDefault(…)` for per-member defaults, member validation and
      // excess-key stripping — you probably want that.
      function f(args = LegacyDefault({ x: 0, y: 0 })) {}
      ```

      Obligation 1 (meaning preserved through graduation) plus obligation 3. The comment is
      the point: it makes the better behavior a one-word deletion rather than something to
      discover.

- [ ] Then abolish the `TjsDictDefaults` directive itself.

**Abolished 2026-08-02 by removing the need for it:**

- [x] **`TjsSafeEval`** — the mode existed only so `import { Eval, SafeFunction }` was
      opt-in. The emitter now detects actual usage (against a literal-masked copy) and
      imports **only what is called**, which answers that question exactly instead of asking
      the author to. Nothing left for the mode to do, so it is gone rather than relocated.

Superseded note — it had been filed as "should not be abolished, move it out of the mode
system". Making the import usage-driven was the better answer:

- [ ] ~~**`TjsSafeEval` is not a rule**~~ — it _includes_ `Eval`/`SafeFunction` in the runtime and
      adds an import. Always-on would put weight in every bundle for a feature most files
      never use. It is a build/bundling opt-in that happens to live in the mode list.
      **Move it out of the mode system rather than abolishing it**, so "no modes" ends up
      true.
- [ ] **Then `TjsStrict`/`TjsCompat` themselves** — the meta-directives are the last per-file
      levers. `TjsCompat` in particular overlaps with `dialect: 'js'`, which is
      extension-driven and should be the only way to say it.
- [ ] **Blocker for full self-hosting:** our own source is TypeScript, so it cannot contain
      `unsafe` (tsc rejects it). `Timestamp.ts`/`LegalDate.ts` therefore sit at 91/93 on
      stage 3. Needs the `/* @tjs … */` passthrough to inject TJS-only syntax from TS
      source, or those files must become `.tjs`.

## "TJS is TJS" — retiring modes into syntax (direction, 2026-08-01)

**End state: not a pile of modes, but one language that emits legal, correct TJS.** Modes are
a _migration device_ — the rungs of the ladder — not a permanent part of the language. Which
means **TJS's syntax has to absorb some of the work modes currently do.**

- [ ] Decide, per mode, whether it retires into syntax, stays a migration rung, or becomes a
      lint. (`TjsNoVar` is arguably syntax; `TjsDate` is arguably a lint; `TjsEquals` is
      genuinely semantic and may need to just _be_ the language.)
- [x] `(): number => Math.random()` and the other TS-annotated arrow shapes **already parse**
      — verified. The one family failure is `async (): Promise<void> =>`, which is the known
      angle-bracket root cause, not an arrow problem.
- [ ] Every retirement must keep the ladder: a mode that becomes syntax still needs a
      converter rewrite + guidance so existing code is carried across, per the conversion
      contract.

### Transpile-time type checking for variables — SPIKED, tractable

**Scoping decision that makes this cheap (user):** locals need **no runtime checks** —
boundary checks (params/returns) do the real work, and instrumenting every local assignment
would be a performance nightmare. So this is a **lint**: best-effort, no soundness
obligation, zero runtime cost, silent whenever unsure.

Spike: `experiments/static-types/local-flow.demo.test.ts` (~90 lines, 6 tests). It catches
type-changing reassignment, stays quiet on numeric widening and on un-inferable values.
**The scaffolding already exists** — `linter.ts` has the scope chain (`Scope`,
`Declaration`, `createScope`, `addDeclaration`), `inferTypeFromValue` turns an initializer
into a `TypeDescriptor`, and function signatures are available at transpile time.

- [ ] **Wire type flow into `linter.ts`** and reuse its scope chain. The spike's flat map
      leaks a shadowed type out of its block and then slanders the outer variable — a FALSE
      POSITIVE, which is the failure mode that matters: a missed error costs one bug, a
      false positive on correct code gets the whole check switched off.
- [ ] **Call-site checking is the highest-value case** and is _easier_ than local flow: we
      already have declared parameter types at transpile time, so `f('x')` against
      `f(n: number)` is a direct comparison with no dataflow at all. Do this first.
- [ ] Branch merging (a join at merge points) is the step from tree-walking to real
      dataflow. Scope it deliberately; it is where the cost jumps.
- [ ] Governing rule: **never report unless sure.** The spike encodes it (numeric widening
      is silent, un-inferable is silent) and it should stay a stated design constraint.

### Enforce the conversion contract (PRINCIPLES.md)

The contract — **TS → equivalent-or-better TJS, with guidance to improve further** — is now a
principle. Obligation 1 (_equivalent_) is behavioral, so it is testable rather than merely
promised, and until the harness exists we are keeping a load-bearing guarantee by hand.

- [ ] **Behavioral-equivalence harness**: run a TypeScript source and its conversion against
      the same inputs; require identical observable results. Any divergence is either a
      converter bug or a deliberate, documented "or better".
- [ ] Seed it with the footgun corpus (`==`, `var`, `n = 5`, dates, classes) and grow it as
      converter rewrites land — each rewrite arrives with the case that proves it preserved
      meaning.
- [ ] Where a rewrite can't be proven safe, the harness should assert a **guidance comment
      was emitted** at that site (obligation 3), so "we couldn't fix it" is never
      indistinguishable from "we didn't notice".

### The on-ramp is the product: TS → TJS as the Crockford/JSLint ladder

**Priority note (2026-08-01, user):** _getting this right matters more than speed to
release_ — this is the change that unblocks adoption personally, because it makes switching
to TJS feel exactly like reading _JavaScript: The Good Parts_ and adopting JSLint.

That analogy is the design spec. JSLint worked because adoption was **progressive**: you
kept your JavaScript, the tool **named each bad part and why**, and you tightened **one rule
at a time**. Nobody had to rewrite a codebase to start.

**The mechanism already exists** (pinned in `src/lang/ts-compat.test.ts`):

```
TjsCompat               → all modes OFF — your TypeScript semantics, unchanged
TjsCompat + TjsEquals   → opt back into exactly one mode
```

So the language supports the ladder today. **What is missing is the JSLint experience on top
of it** — the report and the site-level guidance. That is the actual work, and it is tooling,
not language design.

**Target flow:**

1. `tjs convert foo.ts` → `foo.tjs` that starts at **`TjsCompat`** — byte-for-byte the same
   behavior as the TypeScript it came from. **Adoption starts at zero risk.**
2. The converter emits a **report**: for each mode, how many sites it would affect, what
   would change at each, and which are auto-fixable.
3. You enable **one mode**, fix the (few, listed) flagged sites, re-run, commit. Repeat.
4. When every mode is on, the directive can be dropped — the file is real TJS. **Graduation,
   not a permanent crutch.**

Each rung is small, reviewable, and independently revertable. That is the whole point, and it
is why "convert then rename" beats "rename and hope".

### Sub-tasks (the seam acceptance alone does not close)

**Acceptance is necessary but not sufficient.** TJS deliberately fixes footguns TypeScript
keeps, and a `.tjs` extension turns those modes ON — so "paste your `.ts` and rename it" is
a semantic change disguised as a file operation. **The real flow is: transpile TS → TJS,
then change the extension.** The transpile step must carry the footgun rewrites, and today
it carries none. Both routes fail (pinned by tests in `src/lang/ts-compat.test.ts`):

| after `fromTS`                        | outcome                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **keep** the `/* tjs <- … */` marker  | modes stay OFF — safe, but the file never becomes real TJS. You get none of the fixes, forever. |
| **drop** the marker (tidy the header) | modes turn ON: `var` errors loudly (fine), and **`==` silently changes meaning** (not fine).    |

And `fromTS` emits **zero warnings** about any of it.

- [ ] **Rewrite comparisons during conversion.** `==`/`!=` mean different things either side
      of the boundary. Where intent is provable, rewrite (note `x != null` is already safe:
      TJS `Eq` treats null and undefined as equal, so the idiomatic null-ish guard survives
      — confirm and encode that). Where it isn't, see below.
- [ ] **Insert warning comments where a rewrite can't be perfect.** A gnarly coercion we
      can't prove should become a visible `// TJS: this comparison coerced in TS; verify`
      marker in the output, not a silent pass-through. This is the "errors are curriculum"
      rule applied to migration: show the site, don't just degrade.
- [ ] **Rewrite `var` → `let`/`const`** as part of conversion rather than erroring later
      (it's mechanical, and erroring after the rename is a worse experience than fixing it
      during the convert that exists to do exactly this).
- [ ] **Make the marker a graduation, not a permanent crutch.** There is currently no path
      from "TS-compat TJS" (modes off) to "real TJS" (modes on). Conversion should aim to
      produce a file that is _safe with modes on_, so the marker can be dropped — and should
      say what still blocks that.
- [ ] **`tjs convert` becomes the documented on-ramp**, not rename-and-hope. Wire the above
      into the CLI and the docs; it is the paved path.
- [ ] **Sweep the other modes for the same seam** — `TjsDate`, `TjsClass`, `TjsStandard`,
      `TjsDictDefaults`. Each is a footgun fix, so each is a potential silent meaning change
      on rename. `==` is the one we've confirmed; it is unlikely to be the only one.

### Release sequencing — dissolved (2026-08-01)

The plan was "break once, now, in 0.13.0" to keep the blast radius small. With `n = 5`
handled by a converter rewrite there is **no break to schedule**: every remaining item is
either additive acceptance (can't force an edit, guarded by `subset-invariant.test.ts`) or
converter work (opt-in by definition).

So releases are unblocked from the language question entirely, and the ordering is just:
ship the security fixes whenever convenient, land acceptance gaps as they finish, build the
ladder without deadline pressure. Per the user's priority note, **the ladder is the
valuable half — getting it right outranks shipping it early.**

- [ ] Cut a release carrying the two VM security fixes (fuel bypass, heap ceiling) — they
      exist only on `main`. No migration required of anyone. Note a clean backport onto
      `v0.12.0` is NOT feasible (19 intervening commits; both cherry-picks conflict), so
      this ships as 0.13.0 off `main` rather than a 0.12.1 patch.

## Action items — the "eval is solved _architecturally_" audit (list of 2026-07-29)

Verdict this list was answering: **halting — solved, and provably, not just practically.
Eval — solved architecturally; whether it is solved _in fact_ is what the items below
close.** The through-line: the gap between "we designed it out" and "we verified it's out".
Status re-checked against source 2026-07-31.

### 1. Cost-model soundness (the "by proof" gap) — MOSTLY DONE

- [x] **Audit atoms for the `==` bug pattern** (work proportional to operand _size_ charged
      at flat cost). Found a **live bypass in shipped 0.12.0**: `jsonStringify` serialized
      **2,000,000 elements for 1.2 fuel** under a 10-fuel budget. Fixed with
      `chargeForSize`/`sizeHint`; fuel now scales linearly (2.9 → 19.1 → 190.1).
- [ ] **Finish the sweep against the named list** — string concat, array spread,
      `Object.assign`, `JSON.parse`, `sort`, `join`, template literals, and
      `structuredClone` _in the membrane itself_. The bug class is fixed and the mechanism
      exists; what's missing is evidence that every listed site uses it.
- [x] **Allocation metering + hard live-heap cap.** `maxHeapBytes` (64MB default),
      `trackHeapWrite`, `estimateBytes`, per-key accounting. Refuted `S2` on the way: fuel
      is a _time_ budget, and at ~10KB/fuel a legitimate 100k budget bought ~1GB of live
      string. 26 doublings of 1KB now stops.
- [x] **Write the cost invariant down as one sentence** — _"every evaluation step charges
      fuel ≥ c·(work + allocation)"_ — and test marginal scaling
      (`src/vm/cost-invariant.test.ts`).
- [ ] **Property-test it by fuzzing** — generate programs, measure actual wall time and RSS
      against fuel charged, flag ratio blow-ups. **Not started** (no fuzz test exists). This
      is the cheap mechanical substitute for a mechanized proof, and the thing that finds
      the _next_ `==` before an attacker does. Highest-value remaining item in §1.
- [ ] **Write the AJS operational semantics as a document.** Not started. Doesn't need Coq.
      Implementation-as-spec means every refactor can silently move the security model.

### 2. Membrane hardening — PARTIAL

- [x] Membrane at one choke point; budgeted, cycle-safe pre-walk rejects functions and
      oversized payloads _before_ the clone allocates (`membraneMaxBytes`, 4MB default).
      OOM guard extended to TypedArray/ArrayBuffer/Map/Set real byte sizes.
- [x] **Reject accessor properties before cloning. DONE 2026-08-03** — and it was worse
      than described: the pre-walk read every own key with `v[k]`, so the machinery that
      exists to keep host code out of guest state was itself _executing_ host code, before
      `structuredClone` was reached and regardless of the verdict. Now reads
      `Object.getOwnPropertyDescriptor` and rejects accessors outright — there is no way to
      learn what a getter returns without running it. Two regression tests: a getter is
      never invoked, and a throwing getter yields a clean monadic rejection rather than an
      exception escaping the VM.
- [ ] **Enforce, don't assert, "pure atoms never return host references."** The membrane
      covers `effects: 'io'` atoms only. Add a debug-mode membrane on pure atoms that
      screams in CI, or membrane everything and eat the cost.
- [ ] **Fuzz the membrane directly** — cyclic, accessor-laden, revoked-proxy, giant, deeply
      nested, Symbol-keyed returns; every one must fail closed with bounded work.

### 3. Teardown — LARGELY OPEN

- [~] `ctx.signal` (AbortSignal) exists and the runtime checks it at execution points;
  "respect `ctx.signal`" is documented as part of the custom-atom contract. What's
  missing is that it's a _contract_, not an enforcement.
- [ ] **Bound teardown with a separate small non-refillable budget**; on exhaustion,
      abandon-and-signal. **Cancellation must never be a path that _starts_ unmetered work.**
- [x] **Fuel exhaustion cannot be caught and resumed — VERIFIED 2026-08-03.** `try` clears
      `ctx.error` whenever a catch block exists, _including_ `Out of Fuel`, so a loop
      wrapping its body in try/catch looked like it could run forever and defeat the
      termination guarantee (S1/S4) outright. It cannot: clearing buys exactly one atom,
      because the next charges against an already-exhausted budget and errors again. Pinned
      in `cost-invariant.test.ts` with a positive control — a loop that silently never ran
      would otherwise look like a passing security test.

### 4. Open-graph blast radius — THE BIGGEST GAP (essentially not started)

Named in the original priority-three. Almost nothing here has moved.

- [x] **~~Carry the budget in the request~~ — RE-SCOPED 2026-08-03: not achievable, and
      pretending otherwise was the real problem.** Budget cannot pass from one agent to
      another across a system boundary. All you can hand over is **tokens and data**; the
      other side takes care of itself. A fuel envelope is meaningful only inside one VM.

      **The honest blast radius is what we control ourselves**, and it is now three things:

      - **A time box.** `timeoutMs` bounds every run. This is the guarantee that always
        holds regardless of what is downstream.
      - **Shutting our own outbound work down.** DONE — the run now aborts its
        `AbortController` on *every* exit path, not only when the timeout fires. Previously
        a run ending by fuel exhaustion, an atom error or plain success cleared the timer
        and left in-flight requests alive with nothing left to cancel them. A time box you
        can only rely on when it expires is not a time box.
      - **Quotas on what we summon.** DONE — per-atom call caps (above).

      And the constraint on all of it: **grace must not become the vulnerability.** Teardown
      *signals*; it does not await cleanup. Waiting is precisely how cancellation turns into
      a path that starts unmetered work — a capability that never settles would otherwise
      hold the run open forever.

- [x] **Per-capability quotas — CALL COUNTS DONE 2026-08-03.** `quotas: { httpFetch: 3 }`
      as a run option; enforced in the atom exec wrapper BEFORE fuel and before execution,
      so an exhausted quota costs nothing and cannot have already made the call it exists to
      prevent. Unset ⇒ unlimited, so it is purely additive. This is the money-shaped hole:
      fuel meters work INSIDE the VM and cannot express "at most three model calls". - [ ] Byte budgets and spend caps still open. The membrane already walks and sizes
      every io return, so a byte quota can reuse that measurement rather than
      re-walking.
- [ ] **Attenuation as a first-class op** — a capability handed to a sub-agent should be
      wrappable with a smaller quota without bespoke wrapper code each time.
- [~] **Default-deny egress + per-run wall-clock ceiling.** SSRF-range blocking shipped
  (`isBlockedIPv4`/`isBlockedIPv6`) and a domain allowlist exists
  (`ctx.context.allowedFetchDomains`, `isDomainAllowed`), plus `timeoutMs`. Remaining
  question is whether the allowlist is genuinely VM-config-level and default-deny rather
  than opt-in.

### 5. Process — PARTIAL

- [~] **Adversarial review.** A structured 5-fix adversarial review ran and shipped in
  0.12.0 — but it was _internal_. The point of the item stands: **you wrote it, so you
  can't red-team it.** An outside human week still hasn't happened (`S6`, 🔍 untested).
- [ ] **Escape-attempt corpus as a permanent suite** — vm2 CVEs, SES challenges,
      prototype-chain tricks, translated into AJS attempts that must all fail.

      **Not starting from zero:** `malicious-actor.test.ts` already carries ~60 assertions
      (prototype access, SSRF ranges, ReDoS, the methodCall allowlist, and the membrane
      extensively). The corpus is for the classes we have NOT imagined, which is the whole
      vm2 lesson.

      **The translation is the value, not the copying.** AJS is an AST interpreter, not a
      sandboxed realm, so most vm2 escapes have no direct analogue — there is no `Function`
      to reach. Asking "what is the AJS *equivalent* of this CVE?" is what surfaces
      undefended classes. Demonstrated 2026-08-03: enumerating accessor-invocation sites
      found the array-index case, where the object-branch fix had already landed and nothing
      systematically asked "where else?".

      Candidate classes to enumerate, beyond what is covered:

      - [ ] **Accessors everywhere** — object keys ✅, array indices ✅; Map/Set entries and
            `Symbol`-keyed properties not yet audited.
      - [ ] **Coercion hooks** — `Symbol.toPrimitive` / `valueOf` / `toString` reached by
            binary operators or template interpolation during expression evaluation.
      - [ ] **Proxy returns** from a capability — what does the membrane do with a Proxy?
      - [ ] **Re-entrancy** — a capability that calls back into `vm.run` while the outer run
            is live: shared fuel, shared state, shared quota counters.
      - [ ] **Error paths** — anything building a stack trace or message from guest-supplied
            data (the shape of vm2's `Error.prepareStackTrace` kill).

- [x] **Fix the README numbers and the "self-hosting" wording.** Done, and made
      self-maintaining: `src/bundle-size.test.ts` re-measures the built bundles and fails on >10% drift, requiring a dated "Measured at vX" qualifier. Re-measured 2026-07-31
      (v0.13.0: VM 76 KB gz). Refuted `L4` — _every_ row of the original table was stale.

### Scorecard against the stated priority-three

| Priority                                      | Status                                     |
| --------------------------------------------- | ------------------------------------------ |
| **1** — allocation metering + atom cost audit | ✅ **done** (found a live bypass doing it) |
| **4** — carried budgets + capability quotas   | ❌ **not started** — now the biggest gap   |
| **5** — escape corpus                         | ❌ **not started**                         |

---

## Other open action items (2026-07-31)

### Ship it

- [ ] **Cut 0.13.0.** 42+ commits since v0.12.0, including **two security fixes to shipped
      code** (§1: the fuel bypass and the heap ceiling). Those are on `main` only. Full
      `bun test` gate (not `test:fast`), then user publishes.

### Errors as curriculum (upgrades)

Once an error message teaches, it is load-bearing **spec**, not a string.

- [x] Remedies show code, not prose (A1: 80% vs 50% for prose vs 0% for bare diagnostics).
- [x] **Every suggested repair actually compiles** — guarded per-construct in
      `diagnostic-remedy.test.ts`. A remedy that doesn't compile is worse than none: it
      spends the one repair attempt we get and teaches a wrong lesson with our authority.
- [ ] **Remedy = a transform of THEIR code, not a canonical example.** Small models paste
      literally, so a generic snippet's variable names overwrite theirs and the repair takes
      two round trips instead of one. We have the AST; the rewrite is mechanical. Start with
      `ForStatement` → the equivalent `while` over _their_ init/test/update.
- [ ] **Version the curated errors.** They're spec; spec gets versions so consumers can pin
      and diff what the compiler teaches.
- [ ] **Test that each curated error fires on its trigger** (we currently test the remedy's
      content and compilability, not that the intended construct produces it).
- [ ] **Give errors a seat in the benchmark harness**, keyed by
      **repair-rate-per-error-message** — the metric that says which lessons the curriculum
      teaches _well_, not which messages we like. Prediction worth publishing next to the A3
      result: errors that _show code_ beat errors that _explain rules_ by a wide margin.

### Cheap open questions (assumptions ledger)

- [ ] **A9 — does autocomplete help?** Testable **with no model at all**: truncate valid
      programs, measure hit@k of `suggest()` against the real next token. Cheapest open item
      on the board, and it feeds the autocomplete work A10's resolution reshaped.
- [ ] **A8 — do executed verdicts repair better than type errors?** Must be run
      **within-TJS** (same language, vary only the feedback string) or training-data
      asymmetry confounds it.

### Doc accuracy

- [ ] **Verify the "no computed member access with variables" gotcha in `CLAUDE.md`.**
      `ks[i]` compiles fine inside an AJS function (found 2026-07-31 while compile-testing
      remedies), so the note is stale, path-specific, or wrong. Agent-facing guidance that
      warns off a working construct is a real cost.

## Strategic: "TypeScript's good parts" as an on-ramp to types-by-example (2026-07-31)

Open question (ledger **A10**): would TJS be more discoverable if TS-style annotations were
first-class — `: string` meaning a string — with types-by-example kept as the power feature
(you also get the signature test and the doc) rather than the only way in?

- [ ] **Fix the silent hazard first — this is a bug regardless of the strategic call.**
      `function f(s: string)` currently infers `any` and validates NOTHING, while
      transpiling cleanly. The syntax models and newcomers reach for most naturally
      (measured: ledger A7) yields an unvalidated function in a language whose pitch is
      "types that survive to runtime". Either make it mean what it says, or reject it with
      a worked remedy — silently meaning `any` is the one unacceptable option.
- [ ] **Note the cheapness:** because `: string` means `any` today, teaching it to mean
      "string" is largely **non-breaking** — it adds checking where there was none rather
      than changing existing behaviour. The pivot is far smaller than it looks.
- [ ] **Test discoverability rather than argue it** (`experiments/agent-legibility/`):
      same tasks, no guidance, TS-style vs example-style — which does a model produce
      correctly without being taught? Do it at two model sizes; A7 says the answer may
      differ, and where it flips is the interesting number.
- [ ] **Close the paste-in-TS gap.** Measured 2026-07-31 — of 10 common TS constructs,
      **5 port by paste**: primitives, unions, optional params (`a?: string`), object
      literals, return types. Five fail, ranked by how often real TS code hits them: - [ ] **`T[]` — highest value by far.** The most common annotation after the
      primitives; currently a parse error. TJS spelling is `['']`, so this is a
      source rewrite (`X[]` → `[X]`) in annotation position, not a type-system change. - [ ] **`interface` declarations** — reserved word today. Erasable: an interface is a
      shape, so it can become a `Type` declaration or be stripped. - [ ] **`as` casts** — purely erasable; strip them. - [ ] **generics `<T>` / `Array<T>`** — the real design work, and where the
      "predicate instead of type-level metaprogramming" answer has to be concrete.
      Note `fromTS` (`tjs convert`) already handles the full language — this item is about
      making the _paste-it-in_ path work, which is a much lower-friction first experience
      than "run the converter", and is the on-ramp A10 is really about.
- [ ] **Asymmetric types have NO declaration syntax — and the plausible spelling
      silently does nothing.** Measured 2026-07-31: asymmetry works only where there is a
      real runtime getter/setter to annotate (`set value(v: '' | 0)` + `get value()` on a
      class — the computed-property case). For a plain data property on an ambient type —
      the motivating `<input>.value`, which _reads_ `string` but _accepts_ `string | number`
      — there is no way to express it.
      Worse, the obvious spelling **parses and is dropped**: `Type Field { get value(): ''
set value(v: '' | 0) }` emits `Type('Field')` — no shape, no asymmetry, no validation.
      Same failure class as `s: string` inferring `any`: looks like it works, does nothing.

  - [ ] Decide the declaration syntax (get/set inside a `Type` body is the natural
        candidate) and make it carry both types into the descriptor.
  - [ ] Until then it should **error**, not silently emit an empty Type.
  - This is load-bearing for the "TypeScript's good parts" positioning (A10) — asymmetric
    declarations are one of its three named pillars, and TS handles them badly, so it's a
    real differentiator rather than parity work. It also converges with
    `docs/ambient-contracts.md`, where `<input>.value` / `e.target.value` is the anchor case.

- [ ] **Numeric defaults: `n = 5` must infer NUMBER, not integer — TS compatibility.**
      **The governing principle: TJS may extend TypeScript, but must never be _narrower_
      than it.** `function f(n = 5)` is already legal TS/JS, where it infers `number`.
      Measured 2026-07-31: native TJS infers _integer_ and **rejects `f(5.5)`**, which
      TypeScript accepts — so pasted TS silently changes behaviour and starts refusing
      valid input. (`dialect: 'js'` is unaffected, so the JS invariant holds; this is a
      native-TJS/TS-porting bug.)

  - **This is narrower than the earlier "bare literal = float" proposal, and better
    justified.** The two positions are NOT the same case:
    - `n = 5` (default) — TS says `number`. TJS saying integer **narrows** it. Bug.
    - `n: 5` (annotation) — TS says the literal type _exactly 5_ (rejects 5.5); TJS says
      integer (also rejects 5.5). TJS is **wider** than TS here — a legitimate extension,
      and the sense in which `3`-means-integer "obviously extends TypeScript".
  - **So fix only the default position.** Blast radius drops accordingly: ~285 `= <int>`
    sites vs ~929 `: <int>` annotations that need not change at all.
  - Unsigned-with-positive-default remains available and explicit: `n = +5` (already works,
    prettier-safe). A bare positive integer can NOT signify unsigned, because TS/JS have
    already claimed it as `number`.

  - Measured 2026-07-31: **this is ONE change, not three.** `+5` already infers
    non-negative-integer and `-5` already infers signed integer — exactly the proposed
    scheme. Only the bare positive literal is wrong.
  - `(5)` for signed should NOT be added: parens are ambiguous (`(5)` ≡ `5` in JS) and
    `-5` already covers it.
  - **RESOLVED — the `=` case already works: `n = +5`.** Measured 2026-07-31: it infers
    `non-negative-integer` with `default = 5` — unsigned type, positive default — and
    **prettier preserves the unary `+`**. No new marker syntax is needed. (`n = -5` gives
    signed with default -5; `n = 5` signed; `n = 5.0` float.)
  - **Markers considered and eliminated, so this isn't re-litigated:**
    - `05` (repurposed legacy octal) — the "`.tjs` needn't be legal JS" argument is sound,
      but leading-zero is the worst free option _because_ it already means something,
      inconsistently: `05`→5, `08`→8 (luck — invalid octal digits fall back to decimal) but
      **`010`→8**, **`017`→15**. Silently misreads above 7, in the direction that yields a
      plausible wrong number rather than an error. Also a hard syntax error in strict mode,
      which is what modules are.
    - `(5)` — better than `05` in that parens never change the value, but **unrecoverable**
      twice over: prettier _strips_ redundant parens (`n = (5)` → `n = 5`, and our own build
      runs prettier), and acorn discards them before we see them (`(5)` parses to
      `Literal { value: 5, raw: "5" }` — `raw` is `"5"`, so there's nothing to recover).
      Detecting it would need raw-source inspection, the fragile hackery that has already
      bitten this repo twice. Secondary: in accounting convention `(5)` reads as _negative_
      five, backwards from the intent.
    - `5u` — the best candidate _if one is ever needed_: a clean syntax error today (no
      prior to fight), survives formatting, unambiguous at any magnitude, and borrows a
      helpful C/C++/Rust prior. Not needed now that `+5` is confirmed to work.
  - **On `3` meaning integer:** not legal TS (where `3` is a literal type meaning _exactly_
    3), but an obvious _extension_ of it — the example reads as "an integer, like 3". That
    is the current behaviour and it is defensible; the open question is only whether bare
    `3` should widen to float for alignment with `n: number` (below).
  - **Migration cost is real:** ~245 bare-integer examples in docs/examples, ~540 in
    `src`. Every intentional integer silently WIDENS — that fails safe (a lost check, not
    a false rejection) but it fails _quietly_. Wants a codemod (`: 0` → `: +0` where the
    intent is a count/index/id) plus a release note, not a flag day.
  - Sequence AFTER the A10 positioning call: if TJS leads with "TypeScript's good parts",
    aligning with `number` is clearly right; if examples stay the identity, `5` reading
    naturally as an integer is worth more.

- [ ] Decide only after the above. The two are not exclusive: accepting TS shapes does not
      require abandoning examples, and "TS's good parts + examples when you want the test
      for free" is a strictly larger pitch than either alone.

> Shipped/completed history lives in [`TODO-ARCHIVE.md`](./TODO-ARCHIVE.md) (and
> `CHANGELOG.md`, complete back to 0.2.0). This file is the **live backlog** only.

## MLX as the shared local-AI harness (direction, 2026-07-30)

tjs-lang is the most foundational + LLM-adjacent library in the stack, so its batteries
should be **the common LLM harness across projects**. Backend moves from LM Studio (closed
source) / llama (Meta-adjacent) to **MLX** (Apple-silicon native, open source) on the new Mac.

- [x] **Backend-agnostic config** — `src/batteries/config.ts` + `TJS_LLM_BASE_URL`; the
      batteries already speak plain OpenAI-compatible HTTP, so the backend is a config
      choice. User-facing "start LM Studio" guidance made backend-neutral.
      Setup: [`docs/mlx-setup.md`](docs/mlx-setup.md).
- [x] **(1) Agent-flow testing on MLX — WORKING (2026-07-30).** mlx-omni-server installed via
      uv, Qwen2.5-1.5B + bge-small pre-downloaded, live smoke (audit + predict + embed) green
      against MLX with no LM Studio. Needed `TJS_LLM_MODEL`/`TJS_EMBEDDING_MODEL` because
      mlx-omni-server returns an empty /v1/models (loads on demand) — see docs/mlx-setup.md.
      Remaining: point the grokkability lane at an MLX model (`GROK_MODEL`).
- [~] **(4) `speak()` capability — TTS with voice + acting directions** (ariosto).
  **Spiked 2026-07-30 — see `docs/mlx-setup.md` "TTS / voice".** Established: the speech
  endpoint forwards arbitrary model params (`extra = "allow"`), so a `speak()` capability
  needs no forked endpoint. Chatterbox (MIT) works and clones voices well, but its only
  control is an `exaggeration` scalar — measured acoustically across 6 emotion presets it
  moves _duration_ and almost nothing else, and sad↔happy came out barely more distinct
  than sad↔hesitant. **A scalar can't encode valence**, so parameter-mapping a direction is
  a dead end; with Chatterbox, emotion must come from a per-emotion reference-clip voice
  bank (+ exaggeration as an intensity trim).
  - [ ] **Audition an instruct-taking model — NEEDS EARS (blocked while remote).**
        `qwen3_tts` takes `instruct="<style text>"` + `voice` + `ref_audio` — a real
        acting-direction interface. Also `moss_tts`, `higgs_audio_v3`, `omnivoice`,
        `voxcpm2`, `zonos2`. Audition BEFORE designing the API: if direction-following is
        good, `speak(text, {voice, direction})` passes straight through; if not, fall back to
        the voice-bank design and the LLM selects clip + intensity instead.
- [ ] **(5) Local OCR** (low priority, noted 2026-07-30). Rides the same capability pattern —
      an MLX-VLM vision model, or a dedicated OCR model, behind an `ocr()`/vision capability.
- [ ] **(2) Offline/self-hosted coding** — a coding model through the same harness.
- [ ] **(3) Narrative engines (ariosto)** — consumption shape for another repo: VM
      capabilities, a direct client, or both? Decide when (1) is solid.
- [ ] **Harness export shape** — keep generalizing `tjs-lang/batteries`, or introduce a
      cleaner `tjs-lang/harness` (text + embed + vision + speech) that batteries and other
      projects both build on?

## Pre-release review follow-ups (0.12.0 — VM security + dict-defaults, 2026-07-20)

The 0.12.0 review (nine-lens, BLOCK) surfaced two blockers (dict-default uid collision;
VM star-height-2 ReDoS) — **both fixed before tag** — plus these follow-ups. Cheap docs /
correctness / dryness items were done in the same pass; the rest are deferred here:

- [ ] **Recorder `recordOnce(siteKey, entry)` seam** (ecosystem; ties to #17). The
      dict-default excess-key notice dedups via a private `globalThis.__tjsDDNoticed` outside the
      flight recorder — `__tjs.clearRecords()` doesn't reset it, and it's a third divergent
      "record once per site" mechanism. Give the recorder a `recordOnce` and route the notice
      (and future once-per-site notices) through it.
- [ ] **Coverage backfill (remaining)** (test-coverage): `TjsDictDefaults` standalone directive + `TjsStrict` escalation gating tests; nested-impure dict-default template compile error.
      (The membrane cyclic/shared-ref, depth-limit, container-budget, and real-`Response`-rejection
      tests landed with the 0.12.0 blocker fix.)
- [ ] **Membrane pre-walk garbage trim** (efficiency; safety>perf tradeoff kept): the
      budget pre-walk allocates a `{v,depth}` wrapper per node + an `Object.keys` array per
      object. Trim transient garbage (`for..in` + hasOwnProperty, parallel arrays) without
      changing the double-traversal.
- [ ] **Snowfox heads-up** (ecosystem): the capability-membrane contract change (a live
      `Response` return now hard-fails) affects the known VM embedder. Give them a heads-up /
      release-notes callout before they upgrade past 0.11.0.
- [x] **Extract one `isDictDefaultParam(type, default)` helper** (dryness, major) — DONE
      (`src/lang/types.ts`), imported by both the js and dts emitters so the runtime-merge
      gate and the deep-partial-type gate can't diverge.
- [x] **httpFetch-layer membrane test** (coverage) — DONE (`malicious-actor.test.ts`: a custom
      `fetch` returning a `Response`-shaped object with `.text()`/`.json()` is rejected).
- [x] **DOCS-AJS.md Capability Injection note** — DONE (structured-cloneable-only + the
      `membraneMaxBytes` large-JSON/`dataUrl` caveat). The open _decision_ — grow the 4MB
      default or exempt the `dataUrl` path — remains for a future release.
- [x] **Hoist `IDENT_RE` + `memberAccess`/`propKey` helpers** in `emitters/js.ts` (dryness nit)
      — DONE (the ident-safe member-access was triplicated).

**Resolved by this release** (retired from High Priority): `memory-gas-capability-limits` —
the budgeted, cycle-safe membrane pre-walk + `membraneMaxBytes` (default 4MB) caps capability
**payload** size and rejects oversized returns before the clone allocates. (Unbounded in-run
**state** growth — building large objects atom-by-atom — remains a separate, open gap.)

## Dictionary defaults — merge-on-partial object args (spec landed, Spike A done 2026-07-18)

WebIDL-dictionary semantics for options bags: `(args = {x: 0, y: 0})` + partial payload
merges per-member instead of JS's atomic default-or-payload. **A gated native-TJS mode**
(like TjsEquals) — measured reality: partials currently pass through with JS semantics, so
this changes valid-program meaning and must be off under `dialect: 'js'`/fromTS. Full spec:
[docs/dictionary-defaults.md](docs/dictionary-defaults.md) (incl. the finding that
member-level object-param validation doesn't exist today — the emitted check is
typeof-only while the full shape sits unused in `fn.__tjs.params`).

- [x] Spike A — semantics harness (`experiments/dictionary-defaults/`): standalone
      check-then-fill merge + 33-case table suite (absence/undefined/null matrix, recursion,
      arrays-as-values, all three excess-key policies, prototype-pollution via JSON vector,
      I1–I3 invariants, required-wrapper stand-in, JS-semantics mode-gate reference).
      Mutation-tested (aliasing bug caught by I2). Evidence collected for OQ2–OQ4.
- [x] Spike B — perf, DONE 2026-07-18 (`perf.bench.test.ts`, SKIP_BENCHMARKS-gated):
      benchmarked against CANONICAL CORRECT implementations per Tonio's directive (broken
      idioms are labeled reference rows only — a baseline must do the same job). Walker
      w/ full validation ~543ns/op complete vs ~284 unvalidated per-shape spread; no-arg
      clone 7× faster than structuredClone; I3 identity-return holds. **Conclusion: Stage 1
      emits shape-specialized merge+validate code (generateTypeCheckExpr precedent);
      descriptor walker is the generic fallback.** Bonus: the mandated agreement check
      caught a real hole — prototype-name payload keys (`toString`) dodged excess policy
      via `in`; fixed (null-prototype descriptor maps) + regression test.
- [x] Stage 0 — **member-level param validation. DONE 2026-07-18**: colon-form object
      params (positional + destructured) get recursive member checks with precise paths
      from the already-emitted shape metadata; `=` form untouched (scope-guarded by
      tests). Fixed the `Type.check` vs param-check inconsistency. 2515 tests green;
      one TS-chain test updated (it documented the old gap apologetically).
- [x] Stage 1 — transpiler CORE DONE 2026-07-19: TjsDictDefaults mode (native-on, dialect
      gated) + specialized merge codegen with inlined literal fills (no hoisted template
      needed — fills are fresh by construction), purity compile-error, excess-strip +
      once-per-site recorder notice, pollution rejection. **Measured: complete 91 ns/op —
      3× faster than the careful hand-roll (276), faster than the incorrect shallow spread
      (107), while validating members.** Deferred: excess-key literal-call-site lint;
      destructured-param dict defaults.
- [x] Stage 2 — RESOLVED 2026-07-19: subsumed by Stage 1's specialized codegen. The
      js-tests `__defaults` shallow merge is NOT a divergent copy — return-example
      defaults are top-level-only by grammar, so shallow assign matches exactly.
- [x] Stage 3 — dts DONE 2026-07-19: deep-partial caller-facing types for dict-default
      params (mode-gated via `result.tjsModes`, now on the transpile result; dialect-js
      unchanged). Fixture auto-generation dropped-not-deferred: it would re-test the
      language's merge (covered centrally), not user code.
- [ ] Stage 4 — dogfood on tosijs-3d options-heavy entry points.

## Pre-release review follow-ups (0.10.0, GO_WITH_FOLLOWUPS — 2026-07-16)

Verdict was GO with 0 blockers. The four confirmed majors were fixed before tag
(coverage test for the structural inline-runtime validator, CHANGELOG editor story,
CLAUDE.md releasing.md correction, and a narrow subpath-parity guard). These are the
tracked, non-blocking follow-ups.

**Correctness / coverage / dryness / DX:**

- [ ] **Make `transpiler.ts` the single source of truth for the shared `tjs-lang/lang`
      surface** — `index.ts` = `export * from './transpiler'` + only its from-ts/heavy
      extras, so the two can't drift (Major #2; only a narrow documented-name guard is in
      place now, in `src/package-exports.test.ts`). Verify `index-tsfree.test.ts` still
      passes (index.ts must keep NOT statically exporting `fromTS`).
- [ ] **Harden `src/cli/commands/run.ts` temp-module handling** (dedup of 4 review findings):
      (a) SIGINT/SIGTERM handler calling `cleanup()` (`process.exit()` and signals both skip
      `finally`); (b) startup-reap same-dir `.<name>.<pid>.tjsrun.mjs` strays whose pid is
      dead; (c) clearer EACCES message for read-only source dirs; (d) add `*.tjsrun.mjs` to
      `.gitignore`; (e) note the convention in `--help`/README.
- [ ] **Failing-first regression test** for `tjs run`: a fixture that throws / returns a
      MonadicError at runtime → assert non-zero exit AND no `.tjsrun.*` stray remains. The
      current examples guard only inspects state after _successful_ runs.
- [ ] **Editors drift guard in the pre-tag gate** — rebuild `editors/*.js`/`*.d.ts` to a
      temp dir and byte-compare against the committed artifacts (or `build:editors` +
      `git diff --exit-code editors/`). Bun tests exercise `.ts`; Node consumers get the
      committed `.js`; nothing catches the split today.
- [ ] _(track)_ Converge the emitted inline `Type`/`FunctionPredicate`/`Generic` stubs with
      the real runtime so a validator can't answer differently based on whether a runtime is
      installed. 0.10.0 narrows it (structural `check`); the divergence remains. Also: emitted
      `.toJSONSchema()`/`.strip()` exist only when the _declaring_ file references them
      (tree-shaking) — a `Type` exported to a file that calls them elsewhere won't carry them.
- [ ] _(nit)_ VM flight-recorder fires per-`AgentError` with no once-per-site dedup (unlike
      the wasm recorders) — dedup, or document that `'vm'` source is per-error by design.
- [ ] _(nit)_ `createRecorder` reads `size()` dynamically; snapshot once or clamp `all()` to
      `Math.min(count, size())` so a mid-session `maxErrors` change can't corrupt `records()`.
- [ ] _(nit)_ `js-wasm.ts` `__fail`: reuse the in-scope `__rec` helper instead of re-inlining
      the try/catch record-guard.
- [ ] _(nit)_ `prepare` unconditionally overwrites `core.hooksPath` on every install — set
      only when unset, or echo a notice, so a contributor's custom hooks path isn't clobbered.
- [ ] _(docs)_ Reconcile the `:!` return marker: `CLAUDE-TJS-SYNTAX.md:170` says
      "assertReturns (throws on mismatch)" but `examples/datetime.tjs` + `TJS-FOR-TS.md` (and
      actual behavior) teach "skip the signature test." Clarify FunctionPredicate-vs-function
      or correct the line.
- [ ] _(docs, longer-term)_ CI check `bun run docs && git diff --exit-code demo/docs.json` so
      the shipped `demo/docs.json` can't go stale again (it isn't regenerated by `make`).

**From review 9 (2026-08-22) — recorded so they do not evaporate:**

- [ ] **Unify `emitDirectory` and `convertDirectory`.** They are structural twins, and this
      is the THIRD release where one defect had to be fixed twice, once per copy (the
      recursive-descent guard, the failure tally, the exit code). The duplication is the
      GENERATOR of the sibling-site class that has now produced a defect in four consecutive
      review rounds — fixing instances while leaving the generator is why it keeps
      recurring. Real refactor, real risk: it deserves its own change and its own review,
      not a slot in a housekeeping batch.
- [ ] **Should `tjs run` enforce signature tests?** It currently exits 0 on a file whose
      signature example is wrong, while `tjs check` exits 1 — which is why CLAUDE.md's
      example-verification procedure had to be corrected to run `check` first. Making `run`
      enforce would make that step redundant, but it is a behaviour change.
- [ ] **Adopt `tosijs-schema` ≥1.7.0 and drop the `additionalProperties` workarounds.** The
      `.open` seam shipped upstream 2026-08-19 (issue #5, closed); we are pinned at ^1.5.1.
      A dependency bump with a real blast radius — the battery atoms' output validation is
      exactly what the 1.5.0 tightening broke — so it wants its own verification pass.
- [ ] **`emit`'s signature-test narration goes to stdout**, so `tjs emit f.tjs > out.js` can
      interleave test output into the artifact, and `--jfdi` writes the report into it at
      exit 0. The hashbang half of that finding is fixed; this half is not. Route the
      narration through `console.error` and capture guest stdout during signature-test
      execution.
- [x] **Delivered all ten issue dispositions** (2026-08-22). #4 closed as fixed in 0.13.0
      with the emitted `.d.ts` shown; #3, #5, #25 carry re-measured evidence rather than
      re-dated claims (#5 still reproduces exactly as reported); #11, #26, #27 carry real
      status; #13/#14/#18 say plainly that nothing has happened, because an open issue with
      no comment gives a reporter no way to tell "nobody looked" from "looked and deferred".
- [x] **Filed `tosijs-ui`#98** (2026-08-22) for the `^0.12.0` peer range that cannot reach
      0.13.x and now points at a deprecated version. Recorded in `UPSTREAM.md`.
- [x] **Filed `oven-sh/bun`#40105** (2026-08-22) for the resolver's cached directory listing,
      with the three-case repro and the finding that it is NOT a 1.4 regression.
- [x] **Practices write-back applied** — `tosijs-coding-practices@a3154cf`, covering
      `v0.13.0-beta.1..3b56d70`: microbenchmark validity in `performance.md`, and the
      sibling-site defect class in `code-quality.md`.

**Release sequence (decided 2026-08-24):**

- [ ] **0.13.3** — the `typeof obj[k]` always-true guard (#29, silently wrong since 0.8.1)
      and the Schema Validation example that shipped a wrong worked example. Both are in
      published 0.13.2. Cut it FIRST: one bump, one tag at the final commit, no re-tagging.
- [ ] **`asCompared` — NOT a patch. Rescoped 2026-08-24 after a first implementation attempt
      hit two structural blockers** (both written up in `docs/type-system-north-star.md`):
      the comparators are module-level and the extension registry is per-instance, so they
      cannot reach each other; and the inline runtime has no registry at all, so a
      runtime-only implementation would silently not work in emitted code — the exact
      "inline runtime always wins" trap. It is a runtime-architecture change plus an emitter
      change, not an additive hook. Decide the registry question first.
- [ ] ~~0.13.4 — `asCompared` as a patch~~ (superseded by the line above): Designed in `docs/type-system-north-star.md`. Additive and
      non-breaking (a type that does not declare it behaves exactly as today), so it does
      not have to wait for 0.14 even though it is 0.14-shaped work. Consumed by `Eq`, `Is`
      AND `toBool` — it is the seam whose absence was the answer to "why don't Eq and toBool
      use the computed comparator?". Watch: the five deliberate comparator copies must move
      together, the probe must be fail-soft, and `Eq`'s ~29ns hot path must stay
      allocation-free. The scoping question (file-local `extend` vs on the `Type`) is still
      open and should be settled before implementation, not during.

**Publish-time npm steps for 0.13.1 (user; needs auth) — DO THESE, don't defer:**

- [ ] `npm publish` from the `v0.13.1` tag.
- [ ] `npm deprecate 'tjs-lang@0.13.0' "…"` — 0.13.0 SPECIFICALLY. The other queued
      deprecation below uses `<0.13.0`, which is strict and therefore **excludes** 0.13.0.
      Running only that one leaves the CHANGELOG's claim about 0.13.0 unfulfilled.
- [ ] `npm deprecate 'tjs-lang@<0.13.0' "…"` — the 0.12.0 install-time break
      (tosijs-schema >=1.5.0). Owed since 0.13.0 and skipped then; `^0.12.0` cannot float to
      a fix under 0.x semver, so deprecate is the ONLY channel that reaches those users.
- [ ] `npm dist-tag rm tjs-lang beta` — it points at 0.13.0-beta.1, i.e. BEHIND `latest`,
      so `npm i tjs-lang@beta` hands out an older build than a plain install.
- [ ] Read the state back: `npm view tjs-lang@0.13.0 deprecated` and
      `npm view tjs-lang dist-tags`. The CHANGELOG makes claims about the registry; verify
      them rather than assuming the command took.

**Flaky lanes under full-suite load — seen again at the 0.13.4 gate (2026-08-25):**

- [ ] A full `bun test` reported **4 fail**, all timeout-shaped, and a re-run was clean
      (4305 pass / 0 fail). Named this time, unlike 2026-08-21:
      `(unnamed)` at exactly 30001ms (a 30s timeout), `docs-index.test.ts`'s
      "no relative link that 404s" at 5017ms (it shells out to `npm pack`), and two
      `spike B: check-then-fill` benchmark comparisons at ~7.3s each. All four pass in
      isolation.
      The shape is consistent: lanes that shell out or measure time, contending with the
      rest of the suite. Fix is probably per-lane budgets that scale with load, or moving
      the shell-out lanes out of the parallel set — not raising timeouts, which just moves
      the threshold.

**Flaky lane, seen at the 0.13.1 gate (2026-08-21) — NOT dismissed:**

- [ ] The LIVE LLM lane is intermittently red under a loaded model server. One full `bun test`
      reported **2 fail**; three subsequent full runs and three `test:fast` runs were clean,
      and the deterministic lanes have never wavered. Evidence it is the LLM lane: that run
      logged 2 mock fallbacks and 1 breach of the 45s live budget, and full-gate wall time
      swings 305s → 515s with model-server load.
      **The failures were not captured** — the run was piped through `tail`, so their names
      are lost. That is the second time in this session; the fix is to always
      `tee` a full-gate run before filtering.
      Next step: re-run the full gate against a warm server, capturing everything, and either
      name the two tests or extend the fallback so slowness cannot surface as a failure at
      all (the 45s budget converts most of it, evidently not all).

- [ ] **A MECHANISM for the LLM half, found 2026-08-26 — this is not (only) contention.**
      The default loaded model was `qwen/qwen3.8-27b`, a **reasoning** model. It returns the
      thinking in `reasoning_content` and leaves `content` **empty** when the token budget is
      spent reasoning:

      ```
      curl … -d '{"messages":[…],"max_tokens":5}'
      → "message": { "role": "assistant", "content": "",
                     "reasoning_content": "We need to respond" }
      ```

      That is exactly the observed `JSON Parse error: Unexpected EOF` — the example parses
      `content`, gets `''`, and dies. It reads as flakiness because whether reasoning eats
      the budget varies per prompt, and it reads as *contention* because it worsens under
      load (5 models were resident, so generation is slower and the budget binds sooner).
      **N:** the same example failed 2/2 in loaded full runs and passed 3/3 in isolation;
      `SKIP_LLM_TESTS=1` over the whole suite was 4339 pass / 0 fail.
      Two fixes, and the first is the real one: (a) the client should treat an empty
      `content` with a non-empty `reasoning_content` as a **reasoning-model response** and
      either surface it or fail with that diagnosis, rather than handing `''` downstream —
      right now a whole class of model behaviour is indistinguishable from a parse bug;
      (b) the live lanes should pin a non-reasoning chat model rather than taking whatever
      is default-loaded. Related: `src/batteries/llm-transport.test.ts` covers our client
      deterministically and has no fixture for this response shape.

**From review 6 (post-publish, 2026-08-21) — deferred, not dropped:**

- [ ] Add the **loop-with-helper** case to `bin/benchmarks.ts`, then delete the hand-measured
      table in `guides/benchmarks.md`. That page's whole thesis is that hand-copied numbers
      rot, and it currently carries four of them because no committed harness emits that
      comparison. It is dated and labelled meanwhile.
- [ ] Extract the DCE-safe `compare()` out of `bin/benchmarks.ts` into a shared
      `src/bench-harness.ts` and route `src/css/perf.bench.test.ts`,
      `src/linalg/vector-search.bench.test.ts` and `experiments/dictionary-defaults/` through
      it. The measurement discipline this release paid for twice exists only as a private
      function, so every other bench file still wears the shape it was invented to fix —
      `perf.test.ts` proved that by reporting a 116× overhead that was a folded-away baseline.
- [ ] `src/cli/cli-tsfree.test.ts` hard-codes `src/cli/tjs.ts`; `package.json` declares four
      JS bins. Drive the fixture over the `bin` map.
- [ ] `tjs-playground` accumulates a `playground-<version>/` per upgrade with no prune, no
      TTL and no mention in `--help`. (It now at least honours `TJS_CACHE_DIR`.)
- [ ] File the **Bun resolver bug** (directory listing cached on first module resolution, so
      a file created in that directory afterwards is invisible to `import()`); repro in
      `UPSTREAM.md`. Not a 1.4 regression — reproduced identically on 1.3.14.

**Incoming issues to touch (comments only; don't close in code):**

Dispositions as of 2026-08-19 (0.13.0 release prep). Every open issue carries one, which
is the rule this section exists for — #27 was opened mid-window and had none anywhere, so
"has anyone looked at this?" was unanswerable from the repo.

- [ ] **#4** (`generateDTS` ignores arrow-function consts) — **FIXED in 0.13.0**, guarded by
      `src/lang/dts-compiles.test.ts` ("exported arrows reach the .d.ts (issue #4)") and named
      in the release notes at `CHANGELOG.md`. Close at tag time, naming the version.
- [ ] **#26** (export a tosijs-schema-compatible `createPredicateEvaluator`; specify the
      `$predicate` source format) — three cheap halves, none landed: post the decision, write
      the format spec into `docs/` and link it from llms.txt + CLAUDE.md, and correct the
      version floor in llms.txt (**that last one is done** — it said `^1.4.0` where
      package.json requires `^1.5.1`). The spec is the load-bearing one: upstream's own
      fixtures disagree about whether a bare arrow or a named-function cluster is accepted.
- [ ] **#27** (schema islands enforced from inside a proxy — tosijs 1.8.0 contracts one layer
      too high) — opened 2026-08-17, mid-window. Read and understood; it is a DESIGN
      conversation about where enforcement belongs, not a defect, and it does not block
      0.13.0. Reply on the issue saying so rather than leaving it silent, and fold the
      question into the `$predicate`/north-star thread (`docs/type-system-north-star.md`)
      where it actually belongs.
- [ ] **#11** (WASM ready/enable as `__`-prefixed globals): comment that 0.10.0's sync
      instantiation means most callers no longer need to await readiness (partial relief); the
      public non-underscore `wasmReady()` ask stands. Leave open.
- [x] Close-comment the tosijs-ui issues fixed in 0.10.0 (#10/#12/#15/#16) — done at tag time.
      (#20 subsequently shipped in 0.11.0 as `tjs-lang/import-resolver`.)

**Shared `tosijs-coding-practices` — DONE (landed 2026-07-16, commit `bc2bb89`):**

- [x] `releasing.md` step 3 — the vector-search 27× benchmark-flake citation ("a skipped lane
      rots silently").
- [x] `practices/testing.md` — the **three-lane LLM taxonomy** (fixture-server client / tiny
      live smoke / advisory rate lane) + the k-of-n retry-mask anti-pattern; refreshed the
      tjs-lang project note.
- [x] `releasing.md` Tagging — the **pre-push tag-gate mechanism** (no `git tag` hook → gate the
      tag push via stdin ref lines + reachability preflight).
- [x] `UPSTREAM.md` convention — already generalized in `cross-project.md` (lines 88-111); not
      duplicated.

## Flight recorder (GitHub #17) — SHIPPED in 0.10.0 (2026-07-16)

The `__tjs` ring buffer is now a black box for the whole runtime, not a type-error
log. `record()` / `records(filter?)` / `clearRecords()` / `getRecordCount()` /
`getDroppedCount()`, tagged by `source` + `severity`.

**Why it matters:** monadic errors are _returned, not thrown_, which makes failures
trivially easy to ignore. The recorder is the antidote to our own central design
choice — and it records **near-misses**, not just errors, because the failures that
cost a week are the quiet ones (a `wasm{}` block that fell back to JS while the page
claims "⚡ SIMD"; a typed array copied every call and slower than the JS it replaced).
A false alarm costs one ring slot; a missing entry costs a debugging session with no
evidence.

- [x] Phase 1 — one `createRecorder()` shared by the module runtime and every
      `createRuntime()` instance (it was implemented twice); `errors()` stays
      type-errors-only so the documented clear→run→expect-none idiom survives
- [x] Phase 2 — emitted code wired in; instance recorders mirror to the global runtime
      (a page with 3 TJS modules had 3 separate black boxes); inline fallback reports
      once a runtime is installed, even if it loaded before one existed; de-duplicated
      the triplicated inline `MonadicError`/`typeError` core (latent `SyntaxError`)
- [x] Phase 3 — instruments: wasm fallback + wasm instantiation failure (was a bare
      `.catch(()=>{})`) + non-`wasmBuffer` copy penalty (#9); VM fuel/timeout/capability
      denial via the single `new AgentError()` choke point. Once per site, never per call.
- [x] Docs: CLAUDE.md, `guides/tjs.md`, CHANGELOG, playground example (`error-history.md`)
- [x] **DECIDED (2026-07-13): transpile-time issues do not belong in the ring.** The
      recorder is a _runtime_ black box. Anything we know at transpile time should be a
      warning or a lint error — you can fix that before you ship, which is strictly better
      than discovering it in a post-mortem. So predicate-verification misses stay in
      `result.warnings` / the verification report, and are NOT wired to `record()`.
      The boundary: **known at build time → lint. Only observable while running → record.**
- [ ] **#9 as a lint rule** — the copy penalty is the one case that wants both. It is
      _surfaced_ at runtime now (a notice, once per export), but it is often knowable
      statically: a `new Float32Array(...)` (i.e. not `wasmBuffer(...)`) flowing into a
      `wasm function` call in the same file is a local dataflow question. Make that a lint
      — a transpile-time error is the honest end state, since the failure mode is a
      performance _lie_ ("⚡ SIMD" while running slower than JS). Runtime notice stays as
      the backstop for arrays that arrive from elsewhere.
- [ ] Playground: a panel that shows `records()` live. The black box is only worth having
      if someone reads it.
- [ ] Consider: a `severity` floor in config (`recordLevel`) if notice volume ever becomes
      noise. Not speculative-building it until there's a real complaint.

## Playground vs the tosijs-ui doc system — DECIDED: hybrid. NOT gated (1.6.22 ships it)

Researched 2026-07-13. **The question was already half-answered, in the wrong direction:**
`bin/docs.js:1-8` says verbatim _"Adapted from tosijs-ui's docs.js"_ — it is a **fork of the
very system we were asking whether to adopt**, and it has fallen behind. Meanwhile tosijs-ui
has independently re-implemented five of the playground's mechanisms (split mode, iframe
execution, console capture, test harness, introspection autocomplete) and hand-rolled a
**worse copy of our own scope extractor because we don't export it** (that is GitHub #10).
**Both repos are reimplementing each other's work.**

**Decision: hybrid, and the improvements flow BOTH ways.**

- **Doc-site machinery → tosijs-ui owns it; we consume.** Its `site` system is a strict
  superset of ours: static prerendered pages per doc (we're a hash-routed SPA with no SEO),
  sitemap/robots/llms.txt/ePub, search, a `firebase` host preset, and `checkExamples` —
  which transpiles every example _at build time_, so a broken example fails the build
  instead of failing silently when someone opens the page. Replacing ~1,800–2,200 of our
  lines with something better on every axis.
- **Language machinery → we own it; tosijs-ui consumes.** Export `collectScopeSymbols`
  (#10), the completion source (#13), and the transpile seam. **This raises #10's priority:
  it isn't a nice-to-have, it is the thing forcing a downstream repo to maintain a worse
  fork.**
- **Import resolution (TFS) → ours. SHIPPED 2026-07-17 (#20 closed, commit `85350ad`)** as
  **`tjs-lang/import-resolver`** (+ raw worker asset `./import-resolver/worker`): one routing
  core (`src/import-resolver/resolve.ts`) replaced the three diverged copies; dev-server
  fallback aligned; playground dogfoods the export; `/iframe/` stayed demo-only; config
  travels via query string on the worker URL. Adoption is tosijs-ui's move now. Deferred
  follow-ups (non-blocking): IndexedDB persistent caching; promote `/iframe/` to an opt-in
  export if a second consumer wants it; delete the (aligned, likely-dead) `bin/dev.ts`
  fallback after confirming nothing hits it; a fixture SW-in-a-real-worker integration test.
- **The AJS VM playground stays bespoke.** Fuel, trace, capabilities, LLM batteries have no
  home in a component-library doc system, and pushing them there would invert the layering.

**NOT BLOCKED — the "gated on 1.7" note that was here was WRONG** (the research pass read the
local repo's beta branch, not npm; corrected 2026-07-13). **npm `latest` = `tosijs-ui@1.6.22`
and it ships the whole thing:** `dist/doc-system/` + `site/` (orchestrator, check-examples,
dev-server, epub) + `live-example/` — 66 files. It **already speaks TJS**: live-example
references `tjs-lang/browser`, `tjs-lang/browser/from-ts`, `__TJS_LOCAL_BASE` and a `dialect`
option — it already consumes our browser bundles. Only the CM6 / "first-class tjs" polish is
1.7-beta. We're pinned at `^1.4.7` (1.5.23 installed); bump to `^1.6.22`.

**First blocker, found by actually trying the bump:** `bun run build:demo` then fails with
`Could not resolve: "tjs-lang/browser"`. tosijs-ui's live-example imports it, and esbuild has
no `node_modules/tjs-lang` to resolve against from _inside_ the package. Needs a
self-reference alias in `scripts/build-demo.ts` — note `exports["./browser"]` has no `bun`
condition and points at built `dist/`, so the demo build would also start depending on
`build:bundles`.

**The right shape for AJS — a language-plugin registry in `live-example` (Tonio, 2026-07-13).**
Don't teach tosijs-ui about AJS: that makes a component library depend on `tjs-lang/vm` (a
gas-metered VM) and inverts the layering. Invert it instead — tosijs-ui exposes a plugin
contract and the **consumer** registers languages, so the VM dependency stays in our demo.
The contract must be bigger than "transform", because AJS is a different _execution model_,
not a dialect: it doesn't console.log, it returns a result + **trace** + **fuel**, and needs
**capabilities** injected. So a plugin owns `transform()`, optionally `run()`, and — critically
— its own **output panels**; otherwise the doc system has to understand what a trace is, which
is the same layering violation in a different coat. **The test that the abstraction is real:
`js`/`ts`/`tjs` must themselves be re-expressible as built-in plugins on that contract.**

- [x] Delete the dead playground code found on the way (1,479 lines: old regex autocomplete + its test, `service-host.ts`, `module-sw.ts`) — done, independent of this decision
- [x] File the language-plugin RFC upstream in tosijs-ui — **filed 2026-07-13 as
      [tosijs-ui#12](https://github.com/tonioloewald/tosijs-ui/issues/12)** ("RFC: language
      plugins for live-example — invert the hardcoded js|ts|tjs dialect switch"). Covers the
      `transform()`/`run()`/`panels` contract, the "js/ts/tjs must be re-expressible as
      plugins" acceptance test, and the reciprocal exports we owe (collectScopeSymbols #10 —
      done; completion source #13 — open; promote TFS import resolution to a real export — #20).
      Still OPEN with no upstream movement; adoption is tosijs-ui's call (don't drive from here).
- [ ] Bump `tosijs-ui` → `^1.6.22`; fix the `tjs-lang/browser` self-reference in the demo build
- [ ] Phase 1 = swap docs/nav/site (~1–2 wks); phase 2 = playground as an in-page component
      (~2–4 wks, riskier — and cheaper if the plugin RFC lands first)
- [ ] Migration hazards, known in advance: frontmatter taxonomy differs (`section`/`group`/
      `order` → `parent`/`pin`/`order`) so all 59 example files need rewriting **and CLAUDE.md
      documents the current format**; every hash deep-link (`#view=tjs&example=Foo`) breaks →
      needs redirects (net a large SEO win, but a real one-time break); `checkExamples: true`
      will likely fail the build on first adoption, exposing examples that only "worked"
      because nobody opened them (a benefit — budget for the cleanup)

## Formatting as part of the one pass (idea, 2026-07-13)

**The pitch:** the toolchain already compresses transpile + lint + test + docs into a
single pass. Formatting is the missing quarter. Make it an option — `tjs format`, or a
`format: true` transpile option — for people willing to live with our opinions. No config,
no plugin, no bikeshedding, no separate Prettier/ESLint dependency in the consuming repo.

**The strong argument isn't convenience, it's that no alternative exists.** Prettier
cannot format `.tjs` at all, and never will without a TJS parser: `function foo(x: 'World')`
is a syntax error to every JS/TS parser on earth, and so are `wasm {}`, `test '…' {}`,
`extend`, and `Type`/`Generic` blocks. Today `.tjs` files are formatted by hand or not at
all. **We already have the parser.** Formatting is close to free once the AST is in hand —
and it is the only tool that _can_ do it.

Dogfooding bonus: today's session found Prettier mangling markdown twice (fenced code
collapsed by ASI guards; a wrapped `+` eaten as a bullet). An opinionated formatter that
understands our own languages doesn't inherit someone else's edge cases.

**What makes it hard — be honest before starting:**

- A formatter needs **full-fidelity round-tripping**: comments, blank lines, doc blocks
  (`/*# … */`), and inline WASM must survive byte-exact where untouched. The current parser
  is regex-transforms + acorn in places and drops trivia — see the parser-architecture
  reassessment note. **This is the forcing function for a real lexer/CST**, not a side quest.
- **Idempotency is the whole ballgame:** `format(format(x)) === format(x)`, on every fixture,
  or people lose trust in one commit. Property-test it.
- Formatting must never change semantics. Same prime directive as the recorder.

**Non-goal:** options. One opinion, take it or leave it. The moment there's a config file
we've rebuilt Prettier and inherited its problems.

**But the opinion must be STABLE, not merely singular — this is the whole liability.**
Prettier's sin isn't having opinions, it's that they _changed_: v3 reflows the entire tree,
which is why every repo in this stack pins v2 and `practices/code-quality.md` says "don't
upgrade it." If TJS's canonical form drifts between versions, every upgrade rewrites
everyone's files and we've reinvented the pain with our own logo on it. So:

- **The canonical form is part of the compatibility surface.** Version it, freeze it, and
  change it only with the seriousness of a syntax change (i.e. essentially never; a major
  at the very least).
- Corollary: get it right before it ships, because "we'll tune the defaults later" is the
  exact failure mode. Cheap now, impossible to retrofit once files exist in the wild.

**What this deletes** (the measure of the win): `format:check`, the pre-commit hook,
`.prettierrc.json`, `.prettierignore`, every `<!-- prettier-ignore -->` escape hatch, the
"run format before committing" step in AGENTS.md, CI format gates, and formatting-only
diffs in review. All of that scaffolding exists _only because formatting is a bolt-on_.

**The precedent, and the half everyone forgets (Tonio, 2026-07-13):** HyperTalk and
RealBasic — two of the most productive environments ever built — simply said _we will
format your code_. But the thing they got right was **when**, not what. They reformatted a
line the moment you left it. The canonical form was the _only_ form you ever saw: no
unformatted state, nothing to diff against, no format-on-save, no pre-commit hook, no CI
check, no formatting noise in a merge. Formatting wasn't a tool you ran; it was a property
of the surface you typed into.

gofmt proves the opinionated half works — but gofmt is still **batch**. It concedes that
unformatted code exists and sweeps up afterwards. HyperCard and RealBasic never conceded
that. **Take both halves.**

We are unusually able to: we ship the editor integrations (Monaco/CodeMirror/Ace), the
parser, AND the playground. Nobody else can format `.tjs`, because nobody else can parse it.

- **Format-on-entry, not just `tjs format`.** The CLI/transpile-option version is table
  stakes; the editor version is the actual prize.
- The hard part is formatting code that is **momentarily invalid** mid-keystroke.
  HyperTalk dodged it by being line-oriented (reformat a line only on exit). Our dodge:
  `acorn-loose` is _already a dependency_ — the error-tolerant parse is sitting there.
- **Never reformat the line the caret is on.** Every format-as-you-type implementation dies
  by fighting the typist.

**Sequencing:** this is downstream of the parser question. Don't bolt a pretty-printer onto
regex transforms — it will be a source of subtle corruption exactly like the two Prettier
bugs found today.

## Predicate types — "AJS is JSON-Schema's missing piece"

The thesis (see the blog draft): JSON-Schema / TS can't express types that need
**computation**; verified-pure, composable AJS predicates can — serializable
(the AJS AST), safe (no IO, fuel-bounded), and compiled to native JS so they're
fast. CSS is the torture-test proof. The engine is built and green on `main`;
what remains is **delivery, measurement, and reach** — not invention.

**Done (engine):**

- [x] Atom `effects: 'pure' | 'io'` keystone — classified, guarded (`src/vm/atom-effects.test.ts`).
- [x] `verifyPredicate` / `compilePredicate` — `src/lang/predicate.ts`, exported from `tjs-lang/lang`. Transitive closure check, pure-method whitelist, registry-driven effects.
- [x] Fuel-bounded, global-shadowed native compiler (loops rejected; `__fuel()` at function entry; per-call budget; stack-overflow normalized to `PredicateFuelExhausted`). Zero measurable perf cost.
- [x] PoC + CSS torture set + perf ballpark in `experiments/predicates/` (theme ~0.13ms, ReDoS-linear).

**Remaining (delivery / north star):**

- [x] **#4 Autocomplete `suggest()` companion** — `src/lang/predicate.ts` (`suggest`, exported from `tjs-lang/lang`). Mines a cluster for completions: keyword sets (array literals + `==` literals) → `value` suggestions, `startsWith(...)` guards → open-ended `stub`s (`var(--`/`calc(`). Mined values are run through the compiled entry predicate so suggestions are _guaranteed valid_, not just enumerated. Beats both TS modes: a `string` fallback offers nothing, a finite union can't offer the open-ended stubs. Prefix-filtered + limited. Tests: `src/lang/suggest.test.ts`, demo `experiments/predicates/suggest.demo.test.ts`.
- [ ] **#4b Curated completions — per-value descriptions + cursor placement (0.13.0).**
      A predicate encodes _validity_; a curated table adds _presentation_. Extend `Suggestion`
      with `description?` (→ CM `info` / Monaco docs) and `template?` (a snippet string with a
      cursor stop, e.g. `fixed(${})` → caret inside the parens). Let a predicate declare an
      authored completion table, **merged with and validated against** the auto-mined set (mined
      values stay guaranteed-valid; curated entries layer description + template on top). The
      editor side is already done — the CodeMirror adapter uses `snippetCompletion(...)` with
      `${}` cursor stops and `info:` everywhere (e.g. `foo(${1})`, `isError(${value})`); this is
      just threading the two new fields from `suggest()` through the adapter mapping. Use the
      `${}`/`$0` snippet convention (not a bare `|`, which collides with real values). Motivating
      case: `'number'`/`'currency'`/`'fixed'` as plain values + `{value:'fixed()', description:
'fixed-point, N decimals', template:'fixed(${})'}`.
- [ ] **#4c AI-discoverability of curated descriptions via introspection (0.13.0).** The
      curated per-value descriptions (#4b) must land on the SAME introspection surface that
      already carries param/function descriptions, so an AI writing tjs can read them without an
      editor. **Already discoverable today:** doc-comment (`/*# */`/JSDoc) descriptions flow into
      `TypeDescriptor`/`ParameterDescriptor.description` (parser.ts), into `__tjs` param metadata
      (js.ts), and out as JSDoc `/** … */` in the emitted `.d.ts` (dts.ts:672). **Gap:** a
      predicate's _accepted-value set with per-value descriptions_ isn't attached anywhere
      introspectable — `suggest()` returns bare values. Wire the #4b table into `fn.__tjs`
      (e.g. `params[x].completions`) and consider surfacing it in the `.d.ts` (a JSDoc `@example`
      list or a union-of-literals with a trailing comment) so both runtime introspection and
      static `.d.ts` tooling can see "this param accepts number|currency|fixed|fixed(N); fixed(N)
      = fixed-point with N decimals."
- [~] **#5 Wire into `FunctionPredicate` / `Type`** — predicate bodies authored in this verified-safe substrate; the real consumer.
  - [x] **`Type … { predicate(x){…} }` — DONE 2026-07-02.** A `Type` predicate body now runs through the verifier at transpile time: if predicate-safe it compiles to a self-contained, fuel-bounded native guard (DoS-safe — a runaway input returns `false`, never hangs/throws to the caller); if not, it falls back to the raw arrow (never rejected — TJS ⊇ JS). New `emitVerifiedPredicate(source, entryName, opts)` in `src/lang/predicate.ts` (the transpile-time counterpart to `compilePredicate`, emits a self-contained IIFE **source string** — no engine/`__tjs` runtime dep), exported from `tjs-lang/lang`. Wired into both predicate branches of `transformTypeDeclarations` (the example schema-gate is preserved as an outer check). The verifier now whitelists the TJS-injected pure helpers `Eq`/`NotEq`/`Is`/`IsNot`/`TypeOf`, so native-TJS predicates using `==`/`typeof` still verify. Tests: `src/lang/emit-verified-predicate.test.ts` (7), `src/lang/type-verified-predicate.test.ts` (5); runtime-smoke verified `Pos.check(5)=true / check(-1)=false`.
  - [x] **Warn + strict-error on fallback (= #9 from the tosijs port) — DONE 2026-07-05/06.** `tjs()` surfaces per-predicate verification status: `result.predicates: PredicateVerification[]` (`{name, kind:'Type'|'Generic', verified, reason?}`), and each unverified predicate is mirrored into `result.warnings`. Plumbed transform → `preprocess` return (`predicates`) → `transpileToJS` result; `verifiedGuardExpr` reports verified/fallback with the verifier reason (internal `__pred_` name stripped). Exported `PredicateVerification` from `tjs-lang/lang`. **Strict escalation (2026-07-06):** under the explicit `TjsStrict` directive an unverifiable predicate throws a transpile error (subset invariant: warn by default, error only on opt-in). Added a distinguishing `tjsStrict` flag to `TjsModes` (native TJS has all modes on by default but is NOT strict unless the directive is written); checked in `transpileToJS`. Tests: `src/lang/predicate-report.test.ts` (8, incl. strict throws / non-strict warns / strict+safe passes).
  - [x] **Extend to `Generic` — DONE 2026-07-03.** Generic-Type predicates now verify too: the type-param checks (`T(x)` → `checkT(x)`) are passed as `knownPredicates`, so the verifier treats them as composition with another safe predicate. Safe → fuel-bounded guard, else raw fallback. `verifiedGuardExpr` gained a `knownPredicates` arg; wired into `transformGenericDeclarations`. Tests: `src/lang/generic-verified-predicate.test.ts` (3); verified the guard composes when given a real check fn (`guard({value:5}, isNum)=true`).
  - [ ] **`FunctionPredicate` — confirm no verify step.** It declares a function _shape_ (params/returns), not a boolean predicate body, so there's likely nothing to verify. Confirm and close.
  - [x] **Standalone `Generic` runtime passed raw type-args, not resolved check functions** —
        `Box(0).check({value:5})` threw `checkT is not a function`. FIXED in 0.10.0 (CHANGELOG:
        "Generics were dead on arrival in emitted code … the inline runtime spread the raw type
        arguments in").
- [x] **#6 (tjs-lang side) the `$predicate` keyword + reference evaluator** — `src/lang/predicate-schema.ts` (`compilePredicateSchema` / `validatePredicateSchema`, exported from `tjs-lang/lang`). A JSON-Schema node carries `$predicate` (predicate-cluster _source_; trivially serializable, the verifier makes it safe to run). Structural keywords (type/properties/required/items) validate for everyone; `$predicate` runs only for aware validators → progressive enhancement. Demoed on CSS (`experiments/predicates/css-schema.demo.test.ts`): same JSON, naive sees `string`, aware validates var()/calc()/!important + recursion. Gotcha noted: embed predicate source via `String.raw` (regex backslashes) — moot in real JSON.
- [x] **#6 (production) wire `$predicate` into tosijs-schema — DONE 2026-07-03.** The blog's payoff, working across both repos. Design constraint: **tjs-lang depends on tosijs-schema**, so tosijs-schema can't depend on tjs-lang (circular) — solved with a **pluggable evaluator**. tosijs-schema (sibling repo, committed, NOT published): `$predicate?: string` on `JSONSchema`, a `PredicateEvaluator` type + `setPredicateEvaluator`/`getPredicateEvaluator`, and a run-`$predicate`-after-type-check hook in `walk` — stays zero-dep; ignores `$predicate` until an evaluator is registered (progressive enhancement). tjs-lang: `createPredicateEvaluator(opts)` in `src/lang/predicate.ts` (verify+compile+cache per source; **fails closed** — unverifiable/runaway source → `false`, never throws mid-validation), exported from `tjs-lang/lang`. Tests: `src/lang/predicate-evaluator.test.ts` (4), tosijs-schema `src/predicate.test.ts` (6, incl. naive-vs-aware). **End-to-end verified**: real engine + real hook + `cssStyleSchema()` → good=true / bad-key=false / non-object=false; naive (evaluator cleared) passes bad-key on structure alone. Blocked on publishing tosijs-schema before tjs-lang can consume the hook from npm (don't publish without asking).
  - [x] **Pre-wired predicate-enhanced schema export — DONE 2026-07-03.** tosijs-schema `1.4.0` published (with the `$predicate` hook); tjs-lang dep bumped to `^1.4.0`. New **`tjs-lang/schema`** subpath (`src/schema/index.ts`): re-exports the whole tosijs-schema surface and auto-registers `createPredicateEvaluator()` on import (batteries-included — `import { s, validate } from 'tjs-lang/schema'` and `$predicate` nodes validate with zero wiring). `installPredicateSupport(opts)` for custom re-install; `predicateSupportInstalled()` to check. `tosijs-schema` externalized in the bundle (single instance → one global evaluator); the entry is in `sideEffects` (the auto-register must survive tree-shaking). Bundle `dist/tjs-schema.js` 5.7KB/2.7KB gz. Tested against the **real published** tosijs-schema (`src/schema/schema.test.ts`, 6): registers on import, validates cssColorSchema/cssStyleSchema out of the box, opt-out → structural-only, custom fuel. This closes the #6 north-star loop end-to-end.
- [~] **Real CSS predicate library** — productionize beyond the PoC corpus (the tosijs CSS replacement). New `tjs-lang/css` subpath (`src/css/`): `predicates.ts` holds the canonical **serializable source**, `index.ts` the compiled validators + `suggestColor` + `verifyCss`. Bundle `dist/tjs-css.js` (18.3KB/6.9KB gz) wired into `scripts/build.ts`; subpath + typesVersions in package.json. **Substantially done** — phases 1 (colors), 2 (dimensions), 3 (animation+transition shorthands), 4 (recursive structure + `$predicate` schema), 5 (perf: ~0.5ms/theme), **plus property-aware validation (2026-07-03)** all landed. Only remaining tail: `font`/`background` shorthands (slash-syntax + layers — messier) — a nice-to-have, not core.
  - [x] **Property-aware `isStyleValue` — DONE 2026-07-03.** `isStyleValueFor(prop, val)` in the combined style cluster (`style.ts`, which now composes the shorthand classifiers via the exported `CSS_SHORTHAND_FRAGMENT`) tightens only the **closed** value grammars — color props → `isColorValue`, `animation` → `isAnimation`, `transition` → `isTransition` — so `isStyleObject` now catches real value errors (`{color:'notacolor'}` → false, even nested), while keyword-heavy props (width/display/fontWeight) stay permissive to avoid false-rejecting valid idents. Universal escapes (global keyword/var/calc) pass on any prop; prop names normalized (lowercase, dashes stripped) so kebab === camelCase. Exported `isStyleValueFor` from `tjs-lang/css`. 14 tests (`src/css/property-aware.test.ts`); perf unchanged (~0.5ms/theme). Deferred extension: length/number props need per-property keyword sets to enforce precisely without false-rejects.
  - [x] **Phase 1 — color grammar. DONE 2026-07-03.** Full CSS-L4 named set (148) + hex (3/4/6/8) + rgb/rgba + hsl/hsla + modern fns (hwb/lab/lch/oklab/oklch/color/color-mix, by name+balanced-parens) + `var(--…)`, `!important`-tolerant. Verified predicate-safe **and ReDoS-clean** (flat char-classes), compiles to native validators, `suggestColor(prefix)` mines the named set + open functional stubs (validated through the compiled predicate). 39 tests (`src/css/css.test.ts`) incl. modern color fns + suggest. Proves the full vertical slice source→verify→compile→validate→suggest.
  - [x] **Phase 2 — dimensions / numbers / angles / times / keywords. DONE 2026-07-03.** `src/css/dimensions.ts`: `isLength` (full CSS Values 4 unit set — font-relative/viewport/container/absolute — + unitless `0` + `var`/`calc`), `isPercentage`, `isNumber`/`isInteger` (accept numeric values and numeric strings; reject `Infinity`/`NaN`), `isAngle`, `isTime`, `isResolution`, `isGlobalKeyword` (inherit/initial/unset/revert/revert-layer), and `isDimension` (any of them). ReDoS-clean numeric core `[+-]?(\d*\.\d+|\d+)`. `verifyCss()` now verifies **all** clusters (color + dimension), diagnostics namespaced by cluster. 31 tests (`src/css/dimensions.test.ts`); bundle 12.1KB/4.8KB gz.
  - [~] **Phase 3 — order-flexible shorthands. animation + transition DONE 2026-07-03.** `src/css/shorthands.ts` (cluster = dimension leaves + classifiers): `isAnimation`, `isTransition` (order-free tokens, comma-separated layers), `isTimingFunction` (keywords + `cubic-bezier`/`steps`/`linear(...)`). Key insight: **tokenize the whole value paren-aware, don't split** — `v.split(',')` breaks on commas inside `cubic-bezier(0.1, 0.7, 1, 0.1)`, and a paren-aware comma-_splitter_ regex `(?:[^,()]|\([^)]*\))+` is a nested quantifier the ReDoS verifier (correctly) rejects. So: one flat `.match` tokenizer (`[a-z-]+\([^)]*\)|[^\s,]+`) + a flat empty-layer guard. Schema builders `cssAnimationSchema()`/`cssTransitionSchema()` (pin the entry via an appended `__entry` alias, since `$predicate` uses last-function-as-entry). 20 tests (`src/css/shorthands.test.ts`); bundle 16.9KB/6.4KB gz. Deferred: `font`/`background` (slash-syntax + layers — messier); property-aware `isStyleValue` (use the right shorthand per property key).
  - [x] **Phase 4 — recursive style-object structure + `$predicate` JSON-Schema. DONE 2026-07-03.** `src/css/style.ts`: `CSS_STYLE_SOURCE` = color + dimension leaves + structure predicates (`isCssProperty` incl. custom `--props`, `isSelectorOrAtRule`, `isStyleValue`, recursive `isStyleObject` — entry). Validates the open recursive shape TS/JSON-Schema can't type (nested selectors/at-rules → nested rule; property → value; two-tier precision: strict structure, permissive leaf tail so shorthands aren't rejected). Schema builders `cssStyleSchema()` / `cssColorSchema()` / `cssDimensionSchema()` emit `$predicate` nodes. **The thesis demonstrated end-to-end** (`style.test.ts`, 13): a naive validator (`ignorePredicates`) passes an object with a bad key on `type: object` alone; the predicate-aware validator runs `isStyleObject` and catches it. 90 css+schema tests green; bundle 14.0KB/5.4KB gz.
  - [x] **Phase 5 — perf with the complete predicate set. DONE 2026-07-03.** `src/css/perf.bench.test.ts` (gated by `SKIP_BENCHMARKS`): validates a theme-sized style object (~50 rules × ~12 leaves + hover/focus/media nesting ≈ 600 values) with colors + dimensions + shorthands + recursive structure all live. **Numbers: ~0.5 ms/whole-theme (~1970 themes/sec); per-value isColor 0.41µs, isColorValue 0.52µs, isDimension 0.18µs, isAnimation 0.52µs.** Confirms "safe is fast" — a whole theme validates in half a millisecond, far under a 16ms frame. Loose 8ms ceiling (catastrophic-regression guard; hard thresholds are flaky under load). NOTE: measuring the _real_ tosijs-ui `baseTheme` is blocked by tosijs-ui's browser coupling (`theme.ts` needs `HTMLElement` at import) — would need a happy-dom shim; the self-contained synthetic theme is representative. (~0.5ms here vs the PoC's ~0.13ms because this theme is ~4× larger and fully nested.)
- [x] **Regex-linting in the verifier — DONE 2026-07-03.** `verifyPredicate` now analyzes every regex **literal** in a predicate and rejects catastrophic-backtracking patterns — the one unbounded primitive fuel can't interrupt (a single `.test`/`.match` is opaque to the function-entry fuel hook). Detector = conservative **star-height ≥ 2** (an unbounded quantifier nested inside an unbounded-quantified group: `(a+)+`, `(a*)*`, `([a-z]+)*`, `(.*)*`, `((a+))+`, `(a{2,})+`), which fails closed (over-flagging only costs the "verified" badge; certifying a dangerous one would be a broken promise). Dynamic `RegExp(...)` needs no analysis — already rejected (`new` banned, `RegExp` not a pure global). `src/lang/predicate.ts` (`reDoSRisk`); tests `src/lang/redos-lint.test.ts` (17, incl. end-to-end Type fallback + verified paths); CSS corpus unaffected (no false positives). **Known limitation (documented):** _polynomial_ ReDoS from adjacent overlapping quantifiers (`\d+\d+$`, `a.*a.*a`) and alternation-overlap (`(a|a)*`) is not caught — the exponential class is what the safety story commits to. So predicates are now strictly better than a bare `pattern`: the exponential footgun is refused, not silently certified.

## Ambient contracts — probe reality → verified predicate contracts (idea 2026-07-03)

Full design note: [`docs/ambient-contracts.md`](docs/ambient-contracts.md). The
itch: static types are pessimistic about ambient runtime environments (the DOM,
host objects) in ways that are ceremony without safety — `e.target.value` is a TS
error even though at runtime the value is either there or it isn't, and a pure
runtime predicate (`hasValueTarget(e)`) is the honest, total tool. The idea: tool
that **probes a real environment** (via the introspection iframe / Claude-in-Chrome)
and **derives serializable predicate contracts** for the surface a program
actually uses — then a **conformance harness** certifies a stand-in (happy-dom, a
VM capability) against the contract. Key distinction: predicates can be the
_contract/validator_, not the _behavioral shim_ (behavior stays a separate impure
diff-harness). Fits: introspection bridge exists, predicates are the serializable
contract form, the VM already validates capability boundaries, "types are
examples" ⇒ "contracts from observed values."

- [ ] **Spike: `event.target` demo** — `hasValueTarget` predicate compiles +
      verifies pure + is total; validates a real input event, rejects a `<div>`
      click. The predicate TS won't let you write cleanly is an ordinary verified
      predicate. (No browser needed for the unit; real browser confirms on live events.)
- [ ] **Spike: `CSSStyleDeclaration` probe** — introspect real `element.style` in
      a browser, derive a shape contract, diff a happy-dom `style` against it (where
      does the stub lie?). Leaf values ride the existing `tjs-lang/css` predicates —
      exercises probe→contract→conformance end-to-end. Would unblock the Phase-5
      real-`tosijs`-theme measurement (blocked by `theme.ts` needing `HTMLElement`).
- [ ] **Generalize**: probe record → `verifyPredicate`-certified contract cluster + `suggest()` leaves + a `$predicate` schema + `.d.ts`-ish editor view.

## tosijs 2.0 port feedback (DX log: `../tosijs/TJS-PORT-DX.md`, 2026-07-04)

Real dogfooding of native `.tjs` from the tosijs port + `tosijs-ui` live-examples.
Strongly validates the predicate-types/CSS/ambient direction (their §1b "ask the
browser via `CSS.supports`" is the ambient-contracts idea, independently; folded
into `docs/ambient-contracts.md`). Triaged items:

- [x] **#2 export `tjs-lang/runtime` + `tjs-lang/bun-plugin`** — DONE 2026-07-05.
      Subpaths + `tjs-runtime` bundle (26KB/8.9KB gz) so adoption is one line, not
      reaching into `src/`. (`tjs-lang/runtime` = createRuntime/Eq/Is/checkType/…;
      `tjs-lang/bun-plugin` = bun-only `.tjs` onLoad.)
- [x] **#3 `TjsDate` error mentions `performance.now()`** — DONE 2026-07-05. The
      `new Date()`/`Date.now()` messages now point at `performance.now()` for a
      monotonic counter (timing/id) alongside `Timestamp.now()` for wall-clock.
- [x] **#6 ship `tjs-lang/css`** — DONE this session (subpath + bundle); **needs an
      npm publish** before tosijs can adopt it (currently repo-only, not in 0.8.7).
- [x] **#8 `isStyleObject`/`shorthands.ts` standalone import** — resolved; builds
      clean on current `main` (was a point-in-time issue pre-refactor).
- [x] **#9 surface predicate verification in the `tjs()` result — DONE 2026-07-05.**
      `result.predicates: PredicateVerification[]` (per-Type/Generic verified status + reason) + unverified ones mirrored into `result.warnings`. See the #5
      warn-on-fallback entry above for details. (Strict-mode escalation still open.)
- [ ] **#7 `isCssProperty` is loose** — accepts `align-kontent` (any identifier).
      Wants a closed property set (+`--custom`/vendor prefixes). Natural home for
      the `CSS.supports`/ambient approach (§1b); the hand-set is the Node fallback.
- [ ] **#1 `toBool`-per-conditional hot-path tax** (~10% runtime, ~19% size on
      by-path). Skip the wrap when an operand is provably primitive/typed; and/or
      document the "`TjsCompat` for hot internals" pattern prominently.
- [ ] **#4 mode control is add-only** — want a per-mode `off` (e.g. `TjsStandard
off`); today it's `TjsCompat` + re-enable the rest.
- [ ] **#5 (their numbering) `Eq` ToPrimitive fallback** — nice-to-have; consult
      `Symbol.toPrimitive`/`valueOf` on objects, or an explicit `[TjsCompareValue]`
      protocol. tosijs works around it (box over a `Number` wrapper), NOT blocking.
- [x] **#10 export `generateDTS` from `tjs-lang/lang` — DONE 2026-07-05.** Added to
      `src/lang/transpiler.ts` (`generateDTS`/`typeDescriptorToTS`/`GenerateDTSOptions`);
      the `.d.ts` migration bridge is now reachable from the published `./lang` subpath.
- [x] **#11 bare params emitted as optional `.d.ts` (INVALID TS) — FIXED 2026-07-05.**
      Root cause: the dts derived optionality from the runtime `required` flag
      (`optional = !required`), leaking JS "wild-west" omittability into the dts. But
      **runtime `required` (a contract check — a bare JS param is `required:false`
      so it isn't runtime-rejected) is a different question from dts optionality (a
      deliberate optional _contract_).** Fix in `dts.ts:functionDeclToTS` (runtime
      untouched, so TJS ⊇ JS preserved): a param is dts-optional iff it has a
      `default`/`?` marker (both set `default`; a bare param has none) **and** no
      required param follows it (TS forbids optional-before-required, ts1016). Now
      `f(a, b: 0)` → `f(a: any, b: number)` (was `f(a?: any, …)` = invalid);
      `h(a=1, b)` → `h(a: number, b: any)` (a demoted). Repro + 3 tests in
      `dts.test.ts`. **Framing note (user):** judge TJS by its _native_ type system
      (examples/predicates), not by `.d.ts` polish — `.d.ts` is an express-controlled
      migration bridge (`declaration{}`/`// TS:`/keep `tsc`) — but the bridge must
      emit _valid_ TS, which this restores.
- [ ] **#12 dts emitter ignores arrow-const signatures** — `export const id = () =>`
      emits `id: any`; only `function` decls get a typed signature. Convenience-path
      roughness (per the reframing, not the yardstick), but worth honoring
      annotations on arrow consts so porting needn't rewrite them as `function`s.

**Reframing (user, 2026-07-05):** the end game is **replacing TS with a true JS
superset** (examples-as-types, predicates-as-functions), NOT being a better `tsc`.
So auto-`.d.ts` quality is a _migration-bridge convenience_, judged by correctness
(must emit valid TS — #11) not polish; the yardstick is TJS's native type system
(the predicate/CSS/ambient work). See `../tosijs/TJS-PORT-DX.md` header.

## "Safe is fast" — the campaign (measurement + propagation, not invention)

The architecture already makes the safe path the fast path: boundary-level checks
(a few comparisons per _call_, not per-op), verify→native for validation, inline
WASM/SIMD for hot loops, zero-cost happy-path errors. The strip-the-safety
transpiler option is the Obj-C-`IMP`-cache / Rust-`unsafe` move — it wins the perf
argument precisely because, in practice, you leave the safety on. What's left is
to **prove it and spread it**:

- [ ] **Systematic overhead benchmark** — TJS-checked function call vs raw call across representative code (not just predicates), so "safe is fast" is backed by numbers, not just architecture. (Doubles as the CSS-post perf data — re-run on the _real_ tosijs theme with the full predicate set, confirming the ~0.1ms claim on real data.)
- [ ] **Propagate verify→native** — weave it under the type system / tosijs so the capability is pervasive, not just an engine + PoC.
- [ ] Frame the announcement around data + a real framework running it, not a promise. The blog draft is the spec: its present-tense claims (#6, the CSS lib, the real-theme number) must be true before publishing.

## Compat tests — currency check (2026-07-02: all green against current HEAD)

Re-ran all six `scripts/compat-*.ts` with `--clean` (fresh `git clone --depth 1`,
i.e. current upstream HEAD). The TS→TJS path transpiles every library with **zero
failures** and passes **100% of runnable upstream tests**:

| Library     | Transpile          | Upstream tests             |
| ----------- | ------------------ | -------------------------- |
| zod         | 116 files/~30K LOC | 1959/1959 pass             |
| effect      | 363/363 files      | (transpile-only)           |
| ts-pattern  | 17/17 files        | 453/453 pass               |
| superstruct | 8/8 files          | 225/225 pass               |
| radash      | (all)              | 340/340 pass¹              |
| kysely      | 303/303 files      | (transpile-only; needs DB) |

¹ radash also surfaces 47 _pre-existing upstream_ failures in `src/tests/async.test.ts`
(broken fake-timers — "Can't install fake timers twice"); the harness annotates
these as not-our-fault. All 340 TJS-transpilation assertions pass.

- [ ] **Harness gap: compat scripts shell out to `pnpm` (zod, effect) which may not
      be in `$PATH`.** Worked around 2026-07-02 with a corepack-backed `pnpm` shim
      (`corepack pnpm` → 11.9.0). Consider making the scripts use `corepack pnpm`
      (or `bun`) directly so they run out-of-the-box. radash/superstruct/ts-pattern
      use `npm` (available); kysely/effect are transpile-only.
- [ ] **Compat tests are manual + unpinned (not in CI).** They clone HEAD, so they
      drift silently — re-run periodically (this was the first refresh since Mar 30).
      Optional: pin to release tags for reproducibility, or add a lightweight CI job.

## Testing - watch items (don't fix yet)

- [ ] **Flaky LLM assertion (low priority — leave unless it recurs).**
      `src/batteries/models.integration.test.ts:55` asserts `res.content.length > 5`
      for `predict('the color of the sky is')`. These tests have been reliable for
      a long time; a one-off failure (2026-06) was traced to non-deterministic /
      terse model output (isolated re-run passed, probe returned a normal 32-char
      reply) — most likely just a poor model choice that run, NOT a code bug. If it
      starts failing regularly: harden to assert non-empty string + tolerate empty
      `content` when a reasoning field is present (or use a prompt that demands a
      full sentence). Until then, leave as-is.

## Playground - Introspection-driven autocomplete

The current completion provider was regex-based and useless on real examples
(`extractVariables` matched only `const NAME =`, missing ALL destructuring — and
the tosijs examples bind everything via destructuring). Direction: introspection,
Chrome-console style — run the user's actual code and read real values; predicates
fill the value-grammar leaf (a runtime string can't reveal valid CSS colors). See
the `introspection-autocomplete` memory.

- [x] **Increment 1a — scope-aware symbol model** — `demo/src/scope-symbols.ts`
      (`collectScopeSymbols`, acorn + acorn-loose fallback, destructuring-aware,
      position-scoped, origin-tracking). Wired into `demo/src/autocomplete.ts`
      (replaces the regex extractors, with regex as never-go-blank fallback).
      `todoApp`, `h1`…`button` now complete; `h1` shows `∈ elements`. Tests:
      `demo/src/scope-symbols.test.ts` (11) + provider regression in
      `demo/autocomplete.test.ts`.
- [x] **Increment 1b — introspection bridge** — done. (i) path-aware member
      resolution in `ajs-language.ts` (`getPathBeforeDot`/`resolvePath`/
      `getCompletionsFromPath`) so `todoApp.items.` resolves, not just `todoApp.`.
      (ii) `editors/introspect-value.ts` (serializable, self-contained, injectable) + async `AutocompleteConfig.getMembers` + `demo/src/introspection-bridge.ts`
      (hidden disposable iframe, reuses the run pipeline, direct-`eval` handle into
      module scope, caches last good sandbox) wired via `getMembers` in the
      playground. Tested headlessly through the real `tjsCompletionSource`.
      **Verified working well live** (destructured locals + `todoApp.items.push` + proxy members).
- [ ] **Increment 2 — richer hints from real values** — function arity, `__tjs`
      metadata when present, signature help from the live function.
- [ ] **Increment 3 — argument-type-driven completion (PINNED) — the convergence
      point.** Infer an argument's type from the callee and complete inside it:
      `h1({ style: { color: ⎸ } })` → arg0 is `ElementPart` → suggest `style` →
      CSS values. A vanilla JS function exposes only `.length`/`.name`, so this
      needs the callee to carry `__tjs` whose param is a type-as-example (itself an
      introspectable value — the bridge reads its keys; `style`'s value is a CSS
      predicate → `suggest()`). **Precondition / the pin: rewrite tosijs `style` +
      the elementCreator in TJS** so creators carry `__tjs` example-typed params —
      then it's pure introspection + `suggest()`, no special-casing, no `.d.ts`
      parsing (the "smaller declaration files" payoff). Works TODAY for the user's
      OWN example-typed object-param functions via `getMetadata`/`getSignatureHelp`;
      the one missing primitive is **call-context detection** (enclosing call +
      callee path + arg index + nested-key-vs-value) — unit-testable like
      `collectScopeSymbols`. The `elementParts`/`style` CSS leaf rides this via the
      predicate-schema + `suggest()` work (`src/lang/predicate.ts`).
- [ ] **Increment 4 — completions-as-functions** — let a value/type carry a
      `suggest` hook (annotation / `__suggest`) the bridge calls; transpiles away
      under build options (dev-only, like the strip-safety pattern). The third leg
      of "a language, not a type system."

## Playground - Leverage tjs documentation system

- [ ] tosijs-ui essentially encapsulates most of what we've done with playgrounds in a more reusable way
- [ ] where necessary identify shortcomings in tosijs-ui's build / doc system
- [ ] fold in anything we add / need beyond the new build / doc system

## Playground - Error Navigation

- [ ] Test errors: click should navigate to source location
- [ ] Console errors: click should navigate to source location
- [ ] Error in imported module: click through to source

## Playground - Module Management

- [ ] Import one example from another in playground
- [ ] Save/Load TS examples (consistency with TJS examples)
- [ ] File name should be linked to example name
- [ ] New example button in playground
- [ ] UI for managing stored modules (browse/delete IndexedDB)
- [ ] Auto-discover and build local dependencies in module resolution
- [ ] **Wire `ModuleLoader` into the playground's `tjs()` invocation** for transpile-time cross-file `wasm function` composition (Phase 3 of the wasm-library plan). Today the playground resolves imports at runtime via the local-module store — correct but uses the "boundary form" with a JS↔wasm crossing per call. With a ModuleLoader, imported `wasm function`s would be composed into the consumer's own `WebAssembly.Module` at transpile time, enabling wasm-to-wasm calls (single-digit nanosecond per-call cost). The `wasm-library-consumer.md` example flags this as a known gap. See `src/lang/module-loader.ts` (already shipped) and `wasm-library-plan.md` § Phase 3.

## Transpiler catastrophic slow path — FOUND AND FIXED (2026-08-15)

The dogfood 180s was never "a big suite": our own transpiler was 161.3s of the 162s, the
TypeScript compiler 0.9s. A CPU profile (after every coarser probe missed) put **90 of
90.6 sampled seconds in two regexes** — the module-directive detectors:

```
47.0s  /^(\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*)\s*(TjsStrict|TjsCompat)\b/
43.1s  /^(...same comment prefix...)\s*safety\s+(none|inputs|all)\b/
```

The lazy `[\s\S]*?` in the block-comment alternative could extend a "comment" to ANY later
`*/` in the file, so the leading-comment run absorbed arbitrary prefixes in combinatorially
many ways before failing — and converted files carry a `/* line N */` marker per
declaration, which is why `emitters/ast.ts` (85 markers) took 116s while the much larger
`vm/runtime.ts` did not. **Both patterns were on the self-ReDoS ratchet's flagged list**;
the user's framing — "this is what fuel-bounded predicates would trip over, the analog of
the TS recursive type that blows up the language server" — was exactly right, and the
detector had already named the culprits before the profile confirmed them.

Fix: the directive scans run over the MASKED view, where comments are already spaces, so
no comment-matching exists to backtrack; splice-by-offset replaces the `$1` re-match (which
was a FOURTH copy of the pattern, built via `new RegExp` and invisible to the
literal-scanning ratchet). Semantics verified across seven directive shapes, including
`safety` inside a string (still ignored) and mid-file (still ignored).

**Measured: corpus 162.2s → 8.9s (18×); `ast.ts` preprocess 90.3s → 0.2s; both dogfood
ratchets green at 97/97 with the whole pair now 96s.** Self-ReDoS ceiling lowered 6 → 3 by
its own promote-check; the three left (extractTDoc adjacency, docs.ts member scan, `@tjs`
parse) are off hot paths and stay ratcheted.

- [ ] Rewrite the remaining three flagged regexes when convenient; each lowers the ceiling.

## 0.13.0 re-review (2026-08-13) — CLOSED 2026-08-16

Second review, base `af46fa2`, depth full: **63 findings, 2 blockers**. Both blockers were
introduced by the FIRST round of fixes and are closed (`fa34dfa`). Report filed at
`docs/reviews/0.13.0-review-2-af46fa2.md`.

### The three red tests — RESOLVED

All three pass (`type-identity`, `declared-type-annotation`, `dict-defaults`: 82 pass /
0 fail). The excess-key question they disagreed about was a language decision, and it was
made: **excess keys pass through**, per `04bcd20` — JavaScript expects them to, TypeScript
has almost no way to declare otherwise, and stripping them silently was the more surprising
behaviour. `docs/dictionary-defaults.md` carries the WebIDL-divergence note.

### The structural gap — CLOSED 2026-08-16

- [x] **Neither `test:fast` NOR CI could see a dogfood ratchet failure.** Both gated on
      `SKIP_BENCHMARKS`, which `test:fast` sets and CI inherits. They now run in their own
      CI lane (`bun run test:dogfood`), kept out of `test:fast` because together they are
      ~50s against that lane's ~25s. The cost of never running them was concrete: nine
      conversion failures — six of them carrying "undiagnosed" for weeks — turned out to be
      ONE defect (declaration scanners reading raw source), and the list would have invited
      that connection years sooner if anyone had seen it move.

### Majors from the re-review

Worked through 2026-08-14..16. Closed since: `--force` SIGKILLing any bun/node/deno
listener (identity is now the command line — `6596ae3`); issue #4's stale public comment
(correction posted); the five declaration transforms rewriting TJS inside string literals
(`64c6c5d`, six sites); the two `expect` harnesses (`27f89db`).

## Open findings at the 0.13.0 release — the decision

_One place, per the rule now in `AGENTS.md` and filed upstream as
tosijs-coding-practices#7: an unannotated open-findings list is indistinguishable from an
oversight._

Covering `v0.13.0-beta.1..d116494`. Per-item status for every finding lives in
`docs/reviews/0.13.0-review-3-full.md` and `docs/reviews/0.13.0-review-4-final.md`; the
deferrals named below are the subset that is NOT closed. The third review's 56 findings are tracked per-item in
`docs/reviews/0.13.0-review-3-full.md`; **every confirmed blocker and major is closed**,
along with every minor that turned out to be real on investigation.

**Deferred deliberately, and why:**

- **#4 stays OPEN until publish.** It is fixed on `main` and the public comment now says
  so, but `npm i tjs-lang` still gets 0.12.0, where all three failures are real. Closing
  it before the artifact exists would be closing ahead of the thing consumers can install.
  Close it, and post the second comment, **at publish time**.
- **#3 (toBool hot-path tax) — deferred past 0.13.0.** Re-measured at this commit rather
  than re-dated: ~15 B per conditional asymptotically, and 4× runtime on a
  conditional-dense loop. The fix (skip the wrap when an operand is provably primitive) is
  known and is a language-level change, not a release blocker.
- **#25 (parser architecture) stays open by design.** Its pre-registered counter has been
  answered — at least fourteen literal-blindness instances this cycle — and that answer is
  input to a post-1.0 decision, not to this release.
- **Practices write-backs are APPLIED upstream** (tosijs-coding-practices `6276f45`; issues
  #6/#7/#8 closed). Filing them was a misreading on my part: `cross-project.md`'s
  file-don't-fix rule protects CODE repos and names the practices repo _a standing
  exception_, and `review.md` routes lens 8 to _a change_ to it. An issue there is a
  deferral, not a write-back — its routing table now says so.

**Still to do AT PUBLISH (needs npm auth — user action):**

- `npm deprecate 'tjs-lang@<0.13.0'` naming the `Output validation failed` symptom, since
  that break fires on a consumer's fresh install with no change on their side.
- Close #4 with a second comment.

## 0.13.0 pre-release review — blockers CLEARED (2026-08-13)

Full report, with repro steps and verified evidence for every item:
[`docs/reviews/0.13.0-pre-release-review.md`](docs/reviews/0.13.0-pre-release-review.md).
59 findings, 5 blockers, 20 confirmed majors. **`v0.13.0` is still not tagged** — the
majors are next, then a re-review.

**All five blockers are fixed (2026-08-13), and three of them were bigger than filed:**

- B2 was TWO defects. Besides the shared ledger, `createChildScope` spread `error` into a
  detached slot that no call site copied back, so EVERY error raised inside any child
  scope vanished and the run reported success — verified for the heap ceiling, for
  `Unknown Atom`, and for the `__proto__` security guard. A source scan then found three
  scope-construction sites beyond the ones the report named.
- B1 was two defects. Besides the name-keyed side channel, CLASS METHODS never got the
  parameter rewrites at all, so `m(value?: string)` shipped as `m(value = string)` — a
  `ReferenceError` on the happy path, no collision required.
- B4's re-triage found the harness did not cover `guides/tjs.md` or
  `guides/benchmarks.md` at all, which is how a performance guide came to quote a
  measured overhead for a construct that does not parse.

### Blockers — all five landed

- [x] **B1 `typeNameOptionals` is keyed by parameter NAME** (`src/lang/emitters/js.ts:993`,
      regression from e120602). One function's `n?: number` deletes ANOTHER function's real
      default: `function b(n = fallback)` emits `function b(n)` and `b()` returns
      `undefined`. Silent — no warning, no recorder entry — and `b.__tjs` degrades to
      `any`. Also hits arrow functions and class methods (a method emits
      `m(value = string)`, a `ReferenceError` at call time). Legal JS whose meaning
      changes: a `PRINCIPLES.md` TJS ⊇ JS violation.
      **Fix:** key the side channel by SOURCE POSITION (`Set<number>` of `right.start`),
      not by name. Regression test: two functions sharing a parameter name.

- [x] **B2 `maxHeapBytes` is bypassable by any guest program** (`src/vm/runtime.ts:1668`,
      regression from 70ab7fd). `heapPerKey` is keyed by variable NAME and shared by
      reference across `createChildScope`, so a child-scope bind of an existing name
      REPLACES the parent's accounted size while the parent value stays live. Measured
      against a 6MB cap: **RSS +672MB, 112× over**. Reachable from ordinary transpiled AJS
      (`one.map(k0 => k0)` shadowing an outer name), not just hand-built AST. Every
      child-scope binder is a vector: `map`/`filter`/`find`/`reduce` `as`, `callLocal`
      params. Defeats a guarantee advertised in `DOCS-AJS.md` and `CHANGELOG.md`, in the
      same release that hardened three other heap-ceiling holes.
      **Fix:** scope-qualify the ledger — per-`RuntimeContext` map released on scope
      discard, or key `${scopeId}:${key}`. Test: N keys each shadowed once must still trip.

- [x] **B3 `demo/docs.json` is stale AND ships ~6MB of Effect's documentation.** Twelve
      documents differ from HEAD; the shipped `CLAUDE-TJS-SYNTAX.md` still contains
      `new Point(10, 20) // Still works, but linter warns` and the never-implemented
      `const add = wasm (…)` — the two claims `src/doc-snippets.test.ts` cites as its
      reason for existing. Separately, a clean-tree regeneration yields 106 entries where
      the committed file has 225: the extra 119 are `.compat-tests/effect/**`, whose
      changelogs are the five largest entries in the shipped file. `package.json` `files`
      includes `demo`, so `npm pack` carries a 7.1MB `docs.json`.
      **Fix:** add `.compat-tests/` to `bin/docs.js`'s ignore list, regenerate from a clean
      tree, commit — then add a freshness gate (see below).

- [x] **B4 `unsafe { … }` is taught in five shipped docs; the compiler rejects it.**
      `DOCS-TJS.md:317`, `TJS-FOR-JS.md:485`, `guides/tjs.md:368/393/542`,
      `guides/benchmarks.md:43,63` — the last inventing semantics AND quoting measured
      overhead for a form that does not parse. `CLAUDE-TJS-SYNTAX.md:211` states it
      correctly, and the fix travelled to exactly one file.
      **And two of those blocks were annotated `<!-- tjs-doc: fragment -->` by the
      auto-annotation pass in 3cad86c, so the new harness looks away from them.** That is
      the exact risk flagged when that pass ran ("`fragment` says not-a-whole-program,
      which is true, but it does not check them") and it materialised immediately.
      **Fix:** correct all five docs; re-triage every auto-annotated `fragment` for
      teaching-rejected-syntax rather than genuine fragmentation.

- [x] **B5 `tjs-playground` `kill -9`s processes it does not own**
      (`src/cli/playground.ts:74-82`, byte-identical at `bin/dev.ts:28-37`). Bare
      `lsof -ti:PORT` with no `-sTCP:LISTEN`, no identity check, no opt-out, kill block runs
      unconditionally. Verified: Chrome's NetworkService helper is matched FIRST and
      SIGKILLed. `--port` is unvalidated, so `tjs-playground --port 3000` kills a
      consumer's dev server, announcing it as "Killing existing process on port 3000".
      Undocumented in `--help`, README and CHANGELOG. Not introduced this cycle, but 0.13.0
      publishes the bin.
      **Fix:** ONE shared helper — `-sTCP:LISTEN`, positively identify the victim
      (`ps -p PID -o comm=` must be bun/node), SIGTERM with grace before SIGKILL, and
      **default to complaining rather than killing** (`--force` to reclaim). Document it.

### Majors — code majors DONE (2026-08-13)

All correctness, efficiency, DX and blast-radius majors are fixed. Several were larger
than filed; each fix carries a guard that fails without it.

- [x] **Correctness (5).** ASI spliced a `;` into template-literal CONTENTS (`` `a\n` ``
      evaluated to `"a\n;"`); `test { }` bodies truncated at a `}` in a regex or comment so
      the runner reported `passed: true` having run no assertion; `tjs convert` emitted TJS
      `tjs check` rejects (two implementations of one rule, now one module); the
      declared-type TDZ guard threw the ReferenceError it existed to prevent; arrows did
      not enforce `:` as required and discarded their return annotation.
- [x] **Efficiency (4).** `extractTests` 6.89 → 0.84ms; `dropRedundantNew` 75.6 → 0.7ms
      (108×); `generateDocs` 539 → 31.9ms at 534KB and now LINEAR; `scanLiterals` memoized
      (transpile 14–47% faster). VM loop fuel back to 101.2 flat, matching v0.13.0-beta.1
      exactly — and the accounting was wrong, not merely slow (a loop variable aliases the
      array being iterated, so charging for it double-counted).
- [x] **DX (3).** Generated `.d.ts` now compiles under `tsc` with `skipLibCheck: false`
      (was TS2749/TS2552/TS2304); the `Timestamp` meaning flip warns once naming its
      replacement; `tjs --version` reported **0.6.45** from a 0.13.0 package, and
      `--max-warnings` was in no help text.
- [x] **Blast radius (1).** CHANGELOG now opens with "Upgrading — read this first",
      covering the Timestamp flip, the `tosijs-schema` `additionalProperties` breakage
      (which affects ALREADY RELEASED versions via floating `^1.4.0`), and the VM budget
      change.
- [x] **CI artifact-drift gate.** CI ran `bun run make` and never checked whether it
      CHANGED anything, which proves only that the build does not crash — with
      `demo/docs.json` twelve documents stale underneath it. Now `git diff --exit-code` on
      the generated set, as `code-quality.md` prescribes.

### Practices findings — written back to the shared repo (2026-08-13)

All four landed in `../tosijs-coding-practices` as `cdd77eb` (committed there, not pushed —
that is the user's call). Done AFTER the remediation wave, which is what `review.md:402`
requires and what the finding was about.

- [x] Lens-8 write-back now postdates the last blocker/major fix.
- [x] Three stale CI claims corrected (`00-stack.md`, `review.md`, `model-priors.md`) —
      tjs-lang gained `ci.yml` in 0.13.0 and now has TWO gates with different coverage,
      which nothing enumerated.
- [x] **A ratchet measures a RATE, not a count** — new `testing.md` section. `grep -rin
ratchet` over the practices repo had returned ZERO hits.
- [x] **Documentation snippets are code, so compile them** — new `testing.md` section,
      including the escape-hatch hazard (a bulk `fragment` pass hid the exact defect the
      harness was built for).
- [x] Bonus, found while checking parallel mentions: `development.md` cited tjs-lang as an
      example of gating generated artifacts in CI **while tjs-lang was not doing it**. True
      as of today's CI change; the entry now states what the gate actually is.

**The coverage lens returned NO findings** — the report flags this as a completeness gap
rather than a clean bill of health. Re-run that lens alone before tagging.

## Language

- [ ] **Stateful parsing primitives — stop hand-rolling depth counters** (direction,
      2026-08-12). `maskLiterals` solved "where are the literals" and has 37 call sites.
      Nothing solves "what is the STRUCTURE", so every caller re-implements it:
      **106 hand-rolled `depth++`/`depth--` counters across 10 files**, only 2 of them in
      `strip-comments.ts` where they belong.

      The evidence is not archaeological — I wrote FIVE of them in this session alone:
      `leadingSuperCallLength` (balanced parens, from-ts), `topLevelPredicateOffsets`
      (depth-0 token, parser-transforms), `topLevelAssignment` (depth-0 `=`, parser-params),
      the top-level comma split in `applyTypeArguments`, and a chunker in a probe —
      **and the probe one was wrong**, counting `{}` but not `()[]`, which sent the
      `type-identity.test.ts` diagnosis after three phantom targets. Someone who had spent
      the whole day on this exact hazard still got it wrong on the sixth try. That is a
      missing primitive, not carelessness.

      Proposed, in `strip-comments.ts` (it already owns the masked view every one of these
      needs), each literal- and comment-aware by construction:
      - `findMatching(src, openPos)` — the balanced closer for `(`/`[`/`{`
      - `splitTopLevel(src, sep)` — split at depth 0 (params, array elements, union members)
      - `topLevelOffsets(src, pattern)` — pattern occurrences at depth 0
      - `enclosingSpan(src, pos)` — the block containing a position

      Then migrate call sites opportunistically, **as parsing bugs appear** rather than in
      a big-bang rewrite — the same way `maskLiterals` absorbed fifteen sites. Grow the
      lexer where it hurts; do not stop and write one.

      Related and cheap, do first: live bypasses of `maskLiterals` that strip comments
      with a raw regex — `parser-transforms.ts:745` (detectCaptures),
      `parser-transforms.ts:~4310` (const! mutation check). Each is the exact shape of the
      ASI bug fixed in c64bcd3. Add a guard test that fails on any raw `//`-stripping
      regex outside `strip-comments.ts`.

      **`emitters/js-tests.ts` is DONE (2026-08-15)**, and it needed a new primitive
      rather than a call-site fix: it wants comments GONE and literals INTACT, which
      neither masking view offers. `stripComments` is that third view, built on
      `scanLiterals`. Two incidental comment-skipping regexes in `emitters/from-ts.ts`
      (`/^(\/\*[\s\S]*?\*\/\s*)?/`, duplicated) went with it. The justification was
      no longer theoretical: the same hand-rolled shape in the module-directive detectors
      cost 90 seconds of a 116-second transpile.

- [x] **`parser-transforms.ts` fails self-hosting graduation (94/95)** — FIXED 2026-08-11.
      Root cause: the ASI guard read a `//` inside a TEMPLATE LITERAL as a comment when
      inspecting the previous line for a trailing operator, so
      `` const m = `a // b` + `` looked like it ended in a backtick and got a defensive
      semicolon that split the expression. Graduation back to 95/95. Original notes: Converts and
      compiles as TypeScript; the converted TJS does not parse. Diagnosed this far: - Reported at `if (!(e instanceof globalThis.SyntaxError))`, but that location is
      MISATTRIBUTED — the construct compiles standalone, and so does the whole enclosing
      function (`genericPredicateFromExample`). - Bisection: the prefix + target passes; the failure appears only once
      `normalizePredicateForms` (the next function) is added. **Minimal repro is those
      two complete functions together** — either alone is fine. - With the pair, the error moves to a COMMENT containing
      `` `example: { predicate: '' }` ``. That comment in isolation compiles fine. - So: an interaction between two adjacent functions, with the error location wrong.
      Smells like a scanner span (regex-vs-division, or backticks in comments) opening in
      one function and closing in the other. Every constituent piece converts standalone,
      which is why it resisted four rounds of isolation.
      Recipe: `fromTS(readFileSync('src/lang/parser-transforms.ts'), { emitTJS: true })`,
      then `tjs()` the result; or slice the two functions out of the converted output.

- [ ] **Two test files fail conversion** (`lang/abandoned-syntax.test.ts`,
      `lang/type-identity.test.ts`). Isolated 2026-08-12 to ONE top-level `describe` each: - `abandoned-syntax.test.ts` lines 83..130 of the converted output
      ("every predicate form checks — and an unbuilt one still fails closed") - `type-identity.test.ts` lines 129..156
      ("Type blocks preserve source-level numeric narrowing")
      Both blocks hold TJS source as DATA — the pathological case for any scanner.

      **Method note, because it cost time twice.** An earlier pass reported three culprits
      in `type-identity.test.ts`; that was an artifact. The chunker counted only `{`/`}`,
      so a `const X = new Set([...])` declaration swallowed the rest of the file and was
      scored as failing. Count `(`/`[` too, over a `maskLiterals` view. Same lesson as the
      `parser-transforms.ts` hunt: **the reported failure location is not where the bug
      is**, so isolate by construction and re-check the isolation itself.

      Ruled out so far: brace-skew from comments (`maskLiterals` masks comments); a
      trailing `\` in a line comment; TJS source inside a template literal, with and
      without `${}` interpolation; the ASI/`//`-in-template bug fixed in c64bcd3 (these
      two still fail after it, `parser-transforms.ts` does not).

      Recipe: `fromTS(readFileSync(f), { emitTJS: true })` then `tjs()`; or slice the
      named line range out of the converted output.

- [x] **Vision playground examples FAIL rather than self-skip** — FIXED 2026-08-11, and
      the diagnosis was wrong twice over: the skip logic was correct (`Vision:
google/gemma-4-e2b → works`) and the model was fine. The atoms' OUTPUT schema
      rejected the response, because gemma-4 returns `reasoning_content` and
      `s.object()` closes the shape. See UPSTREAM.md.

- [ ] **`&&` inside a required parameter's DEFAULT corrupts emitted source.** While
      building `Box<int>`, an annotation rewritten to `b = X(((v) => a && b))` produced
      `Generi…c(['T` — a boolean-coercion patch applied at an offset belonging to a
      different part of the file. Hand-written equivalent source does NOT corrupt, and the
      shipped feature avoids the shape entirely by hoisting to a top-level `const`, so
      nothing user-facing depends on it today. Still a real defect in the
      insertions/deletions patching path, and it will bite the next transform that puts a
      logical operator in a parameter default. Repro: make `typeArgumentSource` return an
      `&&` predicate and inline it into the annotation instead of hoisting.
      Features

- [x] Honest boolean coercion (TjsStandard) — `Boolean(new Boolean(false))` and friends now return false. Source rewriter wraps every truthiness context (`if`/`while`/`for`/`do`/`!`/`&&`/`||`/`?:`, `Boolean(x)` calls) with `__tjs.toBool` which unwraps boxed primitives. Always-on under `TjsStandard`. Demo: `examples/js-footguns-fixed.tjs`. Doc: `guides/footguns.md`.
- [ ] Intra-function type safety — bring TJS to parity with TS / good linters
  - [ ] **Tier 1 (lint):** `TjsTypedLet` mode — warn/error on `let` without type annotation. Follows the `TjsNoVar` precedent (`src/lang/parser.ts:214`). Severity gated by mode (info under `TjsStandard`, error under `TjsStrict`). ~30 lines in `src/lang/linter.ts`.
  - [ ] **Tier 2 (compile-time inference):** infer `TypeDescriptor` from initializer (already have `src/lang/inference.ts`), store per-decl in scope, walk subsequent `AssignmentExpression` nodes, warn on type-incompatible reassignment. ~200–300 lines, linter-only, no codegen changes.
  - [ ] **Tier 3 (runtime checks, long-term):** rewrite `let x = e` / `x = e` in the JS emitter to `__tjs.checkType(...)` so out-of-band assignments return MonadicError. Open design questions: closed-over `let`s, uninitialized `let x`, perf cost of per-assignment call. Defer until we see how Tier 1+2 land.
- [ ] Audit monadic-error propagation when an error is nested inside a parameter (esp. arrays)
  - Rule: a MonadicError reaching a checked boundary should surface as ONE error, not as data containing an error (e.g. `[5, <error>, 7]`).
  - Caveat: if the function never inspects the param, no error needs to fire — propagation is on-check, not eager.
  - Partial coverage today: input-validation in emitted JS scans top-level array params for an embedded MonadicError and re-propagates it (commit `3db372d`). Other paths likely miss this — return values, deeper nesting (object fields, arrays-of-arrays), function-typed params whose callbacks return arrays containing errors, etc.
  - Investigate: where does a MonadicError survive past a boundary as data? Audit `checkType` in `src/lang/runtime.ts`, the emitted-JS validation prefix in `src/lang/emitters/js.ts`, and `checkFnShape` interaction with array returns.
- [x] Portable Type predicates — expression-only AJS subset (no loops/async, serializable). **Done** as the predicate engine — see the "Predicate types" section above (`src/lang/predicate.ts`).
- [x] Sync AJS / AJS-to-JS compilation — verified-pure predicates compile to native JS with fuel-injection points. **Done** (`compilePredicate`); see "Predicate types" above. (Generalizing this to arbitrary type-checked AJS beyond predicates is the future "propagate verify→native" item.)
- [ ] Self-contained transpiler output (no runtime dependency)
  - Currently transpiled code references `globalThis.__tjs` for pushStack/popStack, typeError, Is/IsNot
  - Requires runtime to be installed or a stub (see playground's manual \_\_tjs stub)
  - Goal: TJS produces completely independent code, only needing semantic dependencies
  - Options: inline minimal runtime (~1KB), `{ standalone: true }` option, or tree-shake
  - See: src/lang/emitters/js.ts TODO comment for details
- [x] WASM compilation at transpile time (not runtime)
  - [x] Compile wasm {} blocks during transpilation
  - [x] Embed base64-encoded WASM bytes in output
  - [x] Include WAT disassembly as comment for debugging/learning
  - [x] Self-contained async instantiation (no separate compileWasmBlocksForIframe)
- [x] Expand WASM support beyond POC
  - [x] For loops with numeric bounds
  - [x] Conditionals (if/else)
  - [x] Local variables within block
  - [x] Typed array access (Float32Array, Float64Array, Int32Array, Uint8Array)
  - [x] Memory operations
  - [x] Continue/break statements
  - [x] Logical expressions (&& / ||)
  - [x] Math functions (sqrt, abs, floor, ceil, min, max, sin, cos, log, exp, pow)
- [x] WASM SIMD support (v128/f32x4)
  - 12 f32x4 intrinsics: load, store, splat, extract_lane, replace_lane, add, sub, mul, div, neg, sqrt
  - Explicit intrinsic approach (users call f32x4\_\* in wasm blocks)
  - Disassembler handles 0xfd prefix with LEB128 sub-opcodes
  - 16-byte aligned memory for v128 loads/stores
  - Demos: starfield SIMD rotation, vector search cosine similarity
- [ ] WASM SIMD vector search (batteries)
  - Replace JS vectorSearch battery with WASM SIMD implementation
  - SIMD cosine similarity demonstrated in vector search demo
  - TODO: integrate as a battery atom with auto-detect + fallback

## Cross-file WASM Libraries (v0.8.0)

Shipped in v0.8.0 — design + history in `wasm-library-plan.md`, user-facing reference in `DOCS-WASM.md`.

- [x] Module consolidation: one `WebAssembly.Module` per file with N exports (was N separate modules sharing memory)
- [x] Transpile-time `ModuleLoader` (`src/lang/module-loader.ts`) — opt-in `.tjs`/`.ts`/`.js` resolution
- [x] `(export)? wasm function NAME(params): RetType { body }` declaration syntax
- [x] Purity enforcement (backend already rejects host imports) + `(!)` unsafe marker reserved
- [x] Cross-file composition: `import { dot } from 'tjs-lang/linalg'` resolves at transpile time
- [x] Wasm-to-wasm `call <index>` instructions (Phase 1.5) — no JS↔wasm boundary on intra-module calls
- [x] Tree-shaking + transitive dep walking in cross-file composition (only reached functions get pulled in)
- [x] Boundary distribution form: same source → self-contained `.js` for non-tjs consumers
- [x] `tjs-lang/linalg` MVP — `dot`, `norm_sq`, `dot_at`, `norm_sq_at` (f32x4 SIMD)
- [x] Canonical 3-way vector-search benchmark proves composed-WASM matches inline perf
- [x] DOCS-WASM.md + TJS-FOR-JS.md additions + playground examples (`wasm-functions.md`, `wasm-library-author.md`, `wasm-library-consumer.md`)
- [x] JSDoc `/** */` blocks extracted by playground docs renderer

### Deferred follow-ups

- [ ] Wire `ModuleLoader` into the playground's `tjs()` invocation so cross-file composition works inside the playground (today the playground resolves imports at runtime — works but uses the boundary form). See `Playground - Module Management` section above for the full note. **High priority — the canonical wasm-library demo runs at boundary-form perf in the playground until this lands.**
- [ ] `i32` / `f32` / `v128` return types in wasm bytecode emitter (currently all returns are f64-or-void). Parsed today via `: RetType` annotation but not driving emission. Needed for top-K (i32 indices) and any wasm function that naturally returns f32 from SIMD.
- [ ] `tjs-lang/linalg` expansion beyond MVP:
  - Vector: `norm`, `normalize`, `add`, `sub`, `scale`, `lerp` (use `out` parameter for buffer results)
  - Matrix: `matmul`, `transpose`, `identity`, `inverse_3x3`, `inverse_4x4`
  - 3D: `cross`, `quat_mul`, `mat4_from_quat`, `look_at`, `perspective`
  - Batched kernels: `cosine_search(corpus, query, count, dim) → bestIdx`, `top_k_cosine(corpus, query, count, dim, k, outIdx, outScores)` (one boundary crossing for the whole workload regardless of K)
- [ ] gl-matrix benchmark — measure linalg vs the standard JS vector library at realistic scale
- [ ] Production `dist/tjs-linalg.js` bundle wired into `scripts/build.ts` (currently `bun` resolves the `.tjs` source directly; production consumers need the pre-transpiled `.js`)
- [ ] SIMD tail-loop for `n` not a multiple of 4 (today callers must pad)
- [ ] Inline `wasm{}` blocks still subject to `==` → `Eq()` rewrite (the inline-block extractor runs after `transformEqualityToStructural`; the new `wasm function` extractor runs before it). Fix: move `extractWasmBlocks` earlier in `preprocess()` too. Pre-existing bug, not introduced by v0.8.0.

## Editor

- [ ] Embedded AJS syntax highlighting

## Documentation / Examples

- [ ] Create an endpoint example
- [ ] Fold docs and tests into one panel, with passing tests collapsed by default (ts -> tjs inserts test; tjs -> js turns test blocks into documentation along with outcomes).
- [ ] Dim/hide the preview tab if nothing ever changed it
- [ ] Single source of truth for version number. I note the badge displayed in console is not matching the version. No hardwired versions -- version number is pulled from package.json and written to version.ts somewhere and that is the single source of truth.

## Production integration feedback (snowfox-app)

Outstanding items from real-world VM integration. See conversation notes; ranked by hours-burned.

- [ ] **`resolveValue` doesn't recurse into plain object literals** — atoms with structured input get `{$expr}` children unresolved. Need canonical `deepResolve(value, ctx)` helper.
- [ ] **Browser-safe entry point (`tjs-lang/browser`)** — main entry pulls `node:fs/promises` (CLI/playground); breaks webpack 4 and similar bundlers.
- [ ] **`evaluateExpr` diagnostics** — when a node has missing required fields, wrap with op name + step location instead of raw `Cannot read properties of undefined`.
- [x] **`typescript` not resolvable from the main entry** _(confirmed live in 0.8.0–0.8.2 via fresh `npm install` + Node import)_ — `import 'tjs-lang'` threw `Cannot find package 'typescript' imported from dist/index.js`. Cause: the main entry (`src/index.ts` → `export * from './lang'` → `src/lang/index.ts`) statically re-exported `fromTS`, dragging the TS compiler into `dist/index.js` (externalized in `scripts/build.ts`'s `index` target, but only a devDependency so Node consumers without it crashed at import — and it pulled TS at import time → also broke Cloud Run). **Fixed 2026-07-02** via option (a): `src/lang/index.ts` now re-exports only the **types** (`export type { FromTSOptions, FromTSResult }`, erased at build → no runtime dep); the `fromTS` **value** is reachable only via the documented `tjs-lang/lang/from-ts` subpath. Mild breaking change for anyone doing `import { fromTS } from 'tjs-lang'` (docs already steer to the subpath; repo grep found no other consumers). Reproduction + guard: `src/index-tsfree.test.ts` (bundles the main entry with esbuild, asserts no `typescript` import). Internal test importers repointed to `./emitters/from-ts`.
- [ ] **`const` inside `while` loop body** — `constSet` re-runs each iteration and throws "Cannot reassign const variable". Either compile-time error or per-iteration scope.
- [ ] **AgentVM: warn on unknown atoms referenced in source** — currently fails at execution time with `Unknown Atom: foo` and no hint about `batteryAtoms` / user-defined atoms.

## Language subset invariant (TJS ⊇ AJS) — see PRINCIPLES.md

**Invariant:** every legal AJS source must be legal TJS source (and options-off
TJS ⊇ JS). TJS may do _more_ with the same source but must never _reject_ it.
Engraved in `PRINCIPLES.md`. **Now holds** — restored via the signature-test
changes below; guarded by `src/lang/subset-invariant.test.ts`.

- [x] **Signature tests: inconclusive (not error) when un-runnable** — a signature test that can't execute (undefined references like AJS atoms `httpFetch`, or a harness that can't run the module) is now reported as `inconclusive: true` (a warning carrying the reason), never a transpile error. Only a test that _runs and mismatches_ stays a hard failure. New `inconclusive` field on `TestResult`; the strict-mode throw in `js.ts` skips inconclusive results. (Playground: surface the `inconclusive` flag distinctly — see playground TODO.)
- [x] **Multi-function signature-test harness** — the realistic newline-separated multi-function source already executed and validates correctly; only the _same-line_ `} function` edge case failed the harness ("Unexpected keyword 'function'"). That failure is now inconclusive (non-fatal) rather than a transpile error, so the invariant holds either way. (Making same-line two-functions actually execute is a nice-to-have, not required.)
- [x] **Subset guard test** — `src/lang/subset-invariant.test.ts`: representative AJS snippets (helpers with typed sigs, atom-call + return type, helper calling an atom) asserted valid as _both_ AJS and TJS; plain JS asserted valid under options-off TJS; plus controls (un-runnable → inconclusive, genuine mismatch → still throws).

- [x] **Playground: surface inconclusive signature tests** — `renderTestResults` (demo/src/playground-shared.ts) now counts inconclusive separately, renders them with a distinct amber `test-inconclusive`/`test-note` style and a `—` icon (not the ✗ failure), keeps them out of the failure count and editor error markers, and turns the tests-tab indicator amber when only inconclusive. Verified with a happy-dom unit test incl. real transpiler output (`demo/src/playground-test-results.test.ts`).
- [x] **Source dialect (`dialect: 'js' | 'tjs'`)** — public transpile option that sets the modes-on/off default explicitly. `'js'` preserves plain-JS semantics; `'tjs'` (and the bare-string default) is native TJS. Plus extension→dialect helpers `dialectForFilename`/`sourceKindForFilename` from `tjs-lang/lang`, wired into the CLI (check/types/emit/run) so a `.js` file is never silently given TJS semantics. Makes plain JS first-class for hosts (e.g. the tosijs doc system replacing sucrase). `src/lang/dialect.ts`, `src/lang/dialect.test.ts`.
- [ ] **`transpileSource` one-call `js | ts | tjs` sugar** — deferred. A single async call wrapping the route in PRINCIPLES.md ("Routing all three dialects"). It must NOT live in `tjs-lang/lang`: esbuild emits single-file bundles (no code-splitting), so a `fromTS` import — even a dynamic one — gets inlined and drags the TypeScript compiler into the lean, TS-free lang bundle (this broke the `tjs-lang`/`tjs-eval`/`tjs-vm` builds when first attempted). Correct home is a TS-aware entry (the main `tjs-lang` entry already bundles fromTS + externalizes typescript), or switch the bundler to code-splitting. Until then, consumers use the explicit recipe (tjs for js/tjs, fromTS+tjs for ts).

### Deferred enrichment (parity, not invariant)

AJS and TJS share one parser, so AJS already _accepts_ the full signature syntax — input `(!`/`(?` and return `)-!`/`)-?`/`)->` markers, colon/return examples — they just aren't _enforced_ in AJS. Closing that is a nice-to-have, separate from the subset invariant above.

TJS return-marker semantics (reference for when AJS enforcement lands): `)-!` never checks the return + **bypasses the build-time signature test**; `)-?` always checks at runtime; `)->` checks only under global `safety: 'all'`; plain `): T` captures the type + runs the build-time signature test but isn't runtime-asserted (default `safety: 'inputs'`). In AJS today every signature behaves like `)-!` on the return and gets only coarse JSON-Schema validation on inputs (and `n: 0` integer examples currently emit a no-op `{}` schema — a bug).

- [ ] **Signature-as-test in AJS** — TJS already runs the signature example as a transpile-time test (`scale(x:1.5,factor:0.5):0.75` with an inconsistent body fails with "Expected 0.75, got 1.5", `isSignatureTest:true`). AJS runs nothing. The VM can execute the function with the example inputs directly, so AJS is well-positioned to run the same check. Opt-in at first (don't break existing untested agents).
- [ ] **Enrich AJS entry input schema** — `parametersToJsonSchema` currently coarsens examples (`1.5`→`{type:number}`) and, worse, `n: 0` (integer example) emits `{}` — a no-op that validates nothing. JSON Schema can express `{type:integer}` and `{minimum:0}`; capture int / non-negative / number distinctions so the entry contract isn't silently dropped. (Full predicate parity with TJS `checkType` isn't reachable in JSON Schema — defer.)
- [ ] **Validate helper params** — helper bodies currently bind args by position with no validation (only arity is checked at transpile). For least-astonishment, helpers should honor their param examples like the entry function once AJS enforcement lands.

### Completed in current session

- [x] **Local helper functions / `TOOL_LIBRARY` pattern** — AJS agent source may now declare multiple top-level functions: the **last** is the entry point, the rest are helpers. Implemented **option 2** (by-reference `callLocal` + per-agent helper table), chosen over inlining because it supports recursion (bounded by fuel/timeout + a `MAX_CALL_DEPTH=256` host-stack guard) and keeps the AST compact (helper bodies stored once, not duplicated per call site — matters since AJS AST travels as data). Helpers run in isolated scopes (top-level siblings, no closure over caller locals). Helper calls must live at statement level (can't be nested in expressions, like template literals); recursion is a runtime loop, not a transpile error. See `src/use-cases/local-helpers.test.ts`, `extractFunctions` (parser), `ensureHelperTransformed`/`callLocal` emit (emitters/ast.ts), `callLocal` atom (vm/runtime.ts).
- [x] `llmPredictBattery` now has `timeoutMs: 120000` (was using default 1000ms — broken for any real LLM call) + regression test in `batteries.test.ts`.
- [x] `typesVersions` fallback in `package.json` so legacy `moduleResolution: node` consumers can resolve `tjs-lang/vm`, `tjs-lang/lang`, `tjs-lang/batteries` etc.
- [x] **Per-atom `timeoutMs` override** — `vm.run({ timeoutOverrides: { llmPredictBattery: 60000 } })` now works, mirroring the existing `costOverrides` pattern. Supports `number` and `(input, ctx) => number`; `0` disables the per-atom timeout. New `TimeoutOverride` type exported from `tjs-lang/vm`. See `src/use-cases/timeout-overrides.test.ts`.
- [x] **Replaced `vm.run` default `timeoutMs = fuel × 10ms` formula** — now derived from the registered atoms as `max(per-atom timeoutMs) × 2`, floored at 60s (`AgentVM.defaultRunTimeout`). A fixed 60s default (interim) was shorter than the 120s `llmVision`/`llmPredictBattery` budgets, so vision/LLM calls timed out mid-call on slower models; the atom-derived default always covers the slowest atom (and a chained pair) and self-adjusts to custom slow atoms. Updated timeout error message to point at `timeoutMs` / `timeoutOverrides` instead of "increase fuel".
- [x] **`storeVectorize` / `storeVectorAdd` get `timeoutMs: 60000`** — both make embedding network calls but had the 1s atom default, so a cold embedding model timed out. (Same class as the llmVision/llmPredict 120s budgets, missed for the store atoms.) Local ops (`storeSearch`, `storeCreateCollection`) keep the default.

- [x] **Vision-detection probe used a degenerate 1×1 PNG** — real vision preprocessors reject it (gemma-4-e4b: HTTP 400 "Cannot handle this data type: (1,1,1)"), so a genuinely multimodal model was false-negatived as `vision: false` and vision examples skipped with "no vision model available". Probe now uses a valid 32×32 PNG (gemma returns 200). `src/batteries/audit.ts`.

### Deferred (surfaced this session)

- [ ] **Model-audit vision detection still only checks `res.ok`** (`audit.ts` checkVision) — a text model that _tolerates_ the multimodal format without erroring would false-positive. Stronger: check the _response content_ (does the model actually describe the image?). Lower priority now that the 1×1 false-negative is fixed.

## Infrastructure

- [ ] Make playground components reusable for others
- [ ] Web worker for transpiles (freezer - not needed yet)
- [x] Retarget Firebase as host platform (vs GitHub Pages)
- [ ] Universal LLM endpoint with real LLMs (OpenAI, Anthropic, etc.)
- [ ] ESM-as-a-service: versioned library endpoints
- [ ] User accounts (Google sign-in) for API key storage
- [ ] AJS-based Firestore and Storage security rules
- [ ] npx tjs-playground - run playground locally with LM Studio
- [ ] Virtual subdomains for user apps (yourapp.tjs.land)
  - [ ] Wildcard DNS to Firebase
  - [ ] Subdomain routing in Cloud Function
  - [ ] Deploy button in playground
  - [ ] Public/private visibility toggle
- [ ] Rate limiting / abuse prevention for LLM endpoint
- [ ] Usage tracking / billing foundation (for future paid tiers)

## Dependencies & Tooling

Follow-ups from the ESLint 8 → 10 + typescript-eslint 5 → 8 flat-config migration:

- [ ] **Decide package-lock.json policy.** Repo is bun-primary (bun.lock is canonical). The committed `package-lock.json` is stale (still references the old eslint v5 tree) and a fresh npm re-resolve balloons it by ~6k lines (full firebase-admin/google-cloud tree) and needs `--legacy-peer-deps` (pre-existing `tosijs-ui` wants `marked@^16` vs pinned `marked@9`). Either regenerate it in its own commit or remove it and let bun.lock be the sole lockfile.
- [ ] **Clean up 22 pre-existing lint warnings** (unused vars/imports, prefer-const) — surfaced by `bun eslint src`, predate the migration (same `no-unused-vars`/`^_` config), all warnings not errors. Low-risk dead-code sweep across ~10 files.
- [ ] **Dev-dependency vulns (none shipped to consumers).** `npm audit` shows 28, all dev/peer: Firebase SDK + admin stack, the vitest/vite/esbuild/rollup chain (vitest _critical_, genuinely used by 5 test files → needs v3 major), happy-dom, valibot, ws. Plus one eslint-transitive straggler: `flatted@3.3.3` via `file-entry-cache → flat-cache` (non-major fix).
- [ ] **Resolve the `marked` peer conflict** — `tosijs-ui` peers on `marked@^16`, repo pins `marked@9.1.6` (bun warns + installs; npm refuses without `--legacy-peer-deps`).

## Self-hosting (TS feature coverage)

Four `it.skip` cases in `src/use-cases/self-hosting.test.ts` — advanced TS that the
TS→TJS path can't yet handle. Un-skip as support lands:

- [ ] Class with private fields and methods (gated on class support)
- [ ] Builder pattern with method chaining (gated on class support)
- [ ] Complex decorator patterns (requires `experimentalDecorators`)
- [ ] Module augmentation (type-only, no runtime code)

(Also 4 unconditional skips in `src/lang/metadata-cache.test.ts` — the transpile
metadata-cache feature is stubbed: store/retrieve, version-invalidation, merge,
prune.)

## Batteries / LLM tests

- [ ] **Audit misclassifies models under concurrent probing.** Many test files call `LocalModels.audit()` at once, sharing one `.models.cache.json` (cwd, 24h TTL). Clearing the cache before a parallel `bun test` makes several audits probe LM Studio simultaneously and classifications come back scrambled (embedding models tagged `LLM`, an LLM tagged `Embedding`). Tests stay green only by luck of ordering. Fix: serialize the audit, harden the probes, or isolate the cache per run. Workaround documented in [`docs/lm-studio-setup.md`](docs/lm-studio-setup.md). Surfaced 2026-06-10 while getting the LLM suite green.

---

### Pattern-constrained string types (`/…/ as string`) — DESIGN DECIDED, parser work open

TypeScript cannot express "a string matching this pattern" without template-literal-type
gymnastics, and what it does express is erased before it can protect anything. This is the
finest grain on the example ladder, and it maps onto JSON Schema's **native `pattern`
keyword** — no `$predicate` extension needed, so even a naive validator enforces it.

**Spelling (decided 2026-07-31).** A bare `/…/` must NOT mean this: a regexp is a legitimate
_value_, so under the example rule `s: /^\d+$/` denotes a **RegExp**, exactly as `s: 5`
denotes a number. The pattern meaning is explicit:

- `s: /^\d{5}$/ as string` — a string matching the pattern
- `s: /^\d{5}$/ as '12345'` — same, **plus a worked example**; the example is surfaced as the
  default by autocomplete and can drive signature tests

Legal-TS-ness is not a constraint here (TS has no regexp types), and `as` reads naturally to
a TS user.

- [x] Descriptor/emitter/JSON-Schema plumbing (`pattern`/`flags` on `TypeDescriptor`,
      runtime check, native `pattern` in JSON Schema, flags → looser type since JSON Schema
      has no flag equivalent). Tested at descriptor level in `ts-type-names.test.ts`.
- [ ] **Parser pre-transform** — this is the whole remaining job, and it is NOT an inference
      change. Annotations are parsed as part of the **whole-source** acorn parse (params
      become `AssignmentPattern`s, `src/lang/inference.ts:290`), so `s: /re/ as string`
      breaks the entire function parse. `as` must be rewritten to something acorn accepts
      **before** the parse — in `src/lang/parser.ts`'s colon-shorthand transform, e.g. to a
      sentinel `CallExpression` that `inferTypeFromValue` recognises.
- [ ] Autocomplete: surface the example as the default completion.
- [ ] Signature tests from the example.

### Asymmetric get/set types — RE-SCOPED (no longer a positioning pillar)

Per A12: the general case is already covered — **computed properties work**, and **proxy
behaviour is effectively computed types**. Asymmetry is chiefly wanted for **autocomplete**
and for **describing external/ambient types**, which is a tooling/contracts concern.

- [ ] Fold into `docs/ambient-contracts.md` rather than pursuing as a language feature.
- [ ] Still true and still bad: the plausible declaration spelling
      (`Type Field { get value(): ''; set value(v: '' | 0) }`) silently emits
      `Type('Field')` — no shape, no validation. **Make it an ERROR** (same silent-nothing
      class as `s: string` → `any`). This is worth doing regardless of the re-scope.
