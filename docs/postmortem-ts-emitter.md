<!--{"section": "home", "order": 3, "navTitle": "Post-mortem: the borrowed emitter", "parent": "typescript-good-bad-ugly.md"}-->
<!-- TODO review -->

# Post-mortem: we spent nearly eight months testing TypeScript's compiler

TJS converts TypeScript in two steps: `fromTS` turns TypeScript into TJS, and `tjs` turns TJS
into JavaScript. This project checks that pipeline with several test suites it calls
**lanes**. Three of them were cited as evidence that the converter works:

- the **compat lane**, which converts real TypeScript projects (zod, effect, ts-pattern and
  others) and runs each project's own test suite on the result;
- the **Bootstrap Canary** (`src/use-cases/bootstrap.test.ts`, whose last section is titled
  "True self-hosting"), which converts the toolchain's own TypeScript source and runs it;
- the **dogfood ratchet**, which converts this repository's whole source tree.

For most of the project's life, the compat lane, described as **"the most honest evidence the
converter works that this repo has"**, was in the main evidence that `tsc` works. So was the
Bootstrap Canary. Neither was lying; both were pointed at the wrong program.

Nothing was broken in a way anyone could see. That is the point of writing it down.

> **Why a TypeScript evaluator should read this.** The compatibility figures this project now
> quotes for zod, effect, ts-pattern and the rest measure TJS's own converter, and this page is
> the record of how we know that. Until 2026-08-29 the JavaScript in those runs came from
> TypeScript's compiler, so the numbers of that time said little about TJS. If you are deciding
> whether to trust a converter with your codebase, how its evidence failed and was repaired
> tells you more than the evidence alone.

§1–§7 are the analysis. §8–§10 are a dated log of the repair and what was measured afterwards;
the current figures are in §10.

---

## 1. What happened

`fromTS` had two branches:

```ts
if (emitTJS) { tjsFunctions.push(transformFunctionToTJS(...)) }   // TS -> TJS
else         { metadata[funcName] = extractFunctionMetadata(...) } // TS -> JS, via tsc
```

The `else` side (call it the **tsc branch**) produced JavaScript with **`ts.transpileModule`**
— TypeScript's own emitter, sitting beside ours — and stapled `fn.__tjs = {…}` onto the result.

Two JavaScript emitters is a maintenance smell. That was the small half. The large half is
that **two of the three lanes we cited as evidence called the tsc branch**: the compat lane
and the Bootstrap Canary. Only the dogfood ratchet ran TS → TJS → JS through our own code.

## 2. Timeline

| event | date | time since the first commit |
| --- | --- | --- |
| `ts.transpileModule` enters the JS output path | 2026-01-09, `from-ts.ts`'s first commit | — |
| compat lane created, `--full` (the real path) defaulting **off** | 2026-03-30 | 2.7 months later |
| dogfood ratchet created — the first honest end-to-end lane | 2026-08-01 | 6.7 months later |
| a runner for all six compat scripts (`compat-all.ts`) added | 2026-08-28 | 7.6 months later |
| found and fixed (one path to JavaScript) | 2026-08-29 | **7.6 months** |

Without `--full`, each compat script asked `fromTS` for JavaScript directly, which meant the
tsc branch. With it, the script composed `fromTS` → `tjs`. The flag defaulted off from the
compat lane's first commit, and nothing ever passed it: when `compat-all.ts` arrived it
spawned every script with no arguments, and three of the six scripts never had the flag at
all.

## 3. Why it survived

**Because the tsc branch was load-bearing.** It was the only side that collected type
metadata — the TJS side returned no `types` at all. So anything that wanted types *and* a
transpile was forced through TypeScript's emitter. Deleting it was impossible without first
noticing that the two branches were not two renderings of one analysis but **two separate
programs that never both ran.**

That is the generalizable shape: *a redundant path that has one capability the good path
lacks is not redundant. It is a dependency.*

**And a comment said otherwise.** The Bootstrap Canary read:

```ts
// Transpile with TJS
const result = fromTS(source)
```

That `fromTS` call, with no options, took the tsc branch, so the line under the comment ran
`ts.transpileModule`.

## 4. What it cost

Forcing every lane onto our own emitter turned 52 tests red. Those 52 collapsed to **four**
defects, all previously invisible. Two more turned up a day later, once zod could be measured
at all; §8.2 lists all six.

In TJS a colon value is an **example**, not a type: `a: 0` means "an integer, for example 0",
and `0.0` is the example for a float. A return written `:!` is a type-only example: it is not
run as a test. That is the syntax the converter emits, and the syntax these defects are about:

- **TJS could not parse an annotated generator** (`function* f():! 0.0`) — the function matcher
  did not admit the `*`, and once it did, the `*` was dropped while rebuilding the header, so
  every `yield` became a reserved word.
- **TJS could not parse a destructured parameter with an inline type**
  (`function f({ a, b }: { a: 0, b: 0 })`) — it matched as one pattern, so the colon-shorthand
  rewrite ran *inside the type*.
- **An optional parameter converted to a required one.** `excited?: boolean` became
  `excited: boolean | undefined`, which preserves the type but is required — and the emitted
  `__tjs` said `required: true` while `fromTS`'s own metadata said `required: false`.
- **Interface members of unresolvable type emitted `any`.** A default for an optional object
  parameter must be made of literal values (TJS builds the merge of defaults from the
  declaration, so a default it cannot copy as data is a compile error), and `any` is not one.
  Such a parameter was therefore rejected at **graduation**, the step that turns a converted
  file into native TJS by removing its JS-semantics annotation.

**The converter was producing TJS that TJS could not read**, and no lane could see it, because
the lane that exercised the converter's output never fed it to our parser.

Re-running the compat lane on the real path found **15 files that failed to transpile across
five real codebases** (zod could not be measured yet), in two classes: declaration-merging
name collisions, and TS overloads our polymorphic dispatch reads as ambiguous. The old
numbers — ts-pattern 453/453 upstream tests passed, kysely 303/303 files transpiled, effect
363/363 files transpiled — measured `tsc`. (§8.3 is a different and wider measurement: every
file of six projects, zod included.)

## 5. Why the gap stayed small

Despite nearly eight months unseen, only six defects (§8.2) had piled up between what the lanes
measured and what was true. Two things kept the gap small:

1. **Only half the pipeline had a bypass.** TS → TJS was never shortcut — the CLI `convert` and
   the playground always used it. Only TJS → JS had the shortcut.
2. **The dogfood ratchet applied real pressure** for its four weeks of life, driving our whole
   source through TS → TJS → JS. A ratchet here is a minimum pass count that may only go up;
   its floor, the number of this repo's source files that must convert, compile and graduate,
   rose from 95 to 106.

But the sharp version, in files containing the shape (as counted on 2026-08-30; the
generator figure for our own source was an estimate, not an exact count):

```text
                                    our source   compat corpora
destructured param w/ inline type        0             6
annotated generators                    ~2             1
```

**The honest lane had a narrow corpus; the broad corpus was on the dishonest lane.** The
dogfood ratchet could never have found the destructuring bug — our own code does not contain
the shape. radash and effect do. Coverage and honesty were inversely distributed, which is
worse than either gap alone and invisible from inside either one.

## 6. Lessons

Ordered by how transferable they are.

1. **Name the program under test.** A lane that runs someone else's implementation measures
   theirs. "Does the converter work?" and "does `tsc` work?" have different answers and looked
   identical for nearly eight months.
2. **A redundant path with a unique capability is a dependency.** The tsc branch survived
   because it was the only source of type metadata. Look for what the "obsolete" path can do
   that the good one cannot; that is what is keeping it alive.
3. **The default is the only configuration that matters.** `--full` existed, worked, and was
   never once passed. An option that must be remembered will be forgotten; make the honest
   path the only path.
4. **A comment is not a control.** `// Transpile with TJS` sat directly above a call to `tsc`
   and was read by everyone who touched that file.
5. **Green that cannot go red is not a signal.** Even after the fix, `compat-all` printed
   `5 passed, 0 failed` while superstruct ran *zero* tests and ts-pattern failed on source that
   never transpiled. The scripts exit 0 regardless. Before quoting a number, check what would
   have to happen for it to fall.
6. **Ask what the honest lane's corpus contains.** Full marks on a corpus that lacks the shape
   is not evidence about the shape.
7. **When you cannot tell a converter defect from a language defect, you will blame the
   language.** During the fix, the agent doing it (an AI coding assistant) claimed a language
   bug three times — "optional object parameters are not writable in TJS". The spec,
   `docs/dictionary-defaults.md`, had settled it a month earlier: whether a parameter is
   required belongs to the parameter, not its members, so `(opts: {…})` is required and
   `(opts = {…})` is optional with every member defaulted. The language was correct every
   time; every failure was the converter emitting something the spec already forbade. *Read
   the spec before diagnosing, not after someone points at it.*

## 7. What now enforces this

- **`src/no-ts-emitter.test.ts`** — `fromTS` must refuse to emit JavaScript (with a control
  proving the composed path works), and only `from-ts.ts` may call `ts.transpileModule` at all.
  The remaining call sites, where `tsc` still strips types from function *bodies*, are a
  **ratchet that may only go down**: the count may not exceed a ceiling (currently 1), and a
  promote-check fails when the count drops below the ceiling, so the ceiling has to be
  lowered with it. That dependency is real, and shrinking it to zero means writing our own
  TypeScript statement stripper.
- **One path.** `fromTS` does TS → TJS; `tjs` does TJS → JS; callers compose them, so the route
  is visible at the call site. `emitTJS: false` throws and names the replacement.
- **All six compat scripts** run the real path, with no flag to get it wrong.
- The Bootstrap Canary genuinely self-hosts, and its comment is true.

What a caller writes now:

```javascript
import { fromTS } from 'tjs-lang/lang/from-ts'
import { tjs } from 'tjs-lang/lang'

const ts = 'function add(a: number, b: number): number { return a + b }'
const tjsSource = fromTS(ts).code
// /* tjs <- input.ts */
// …
// function add(a: number, b: number):! number { … }
const js = tjs(tjsSource).code

fromTS(ts, { emitTJS: false })
// throws: fromTS no longer emits JavaScript — it emits TJS. Compose the two steps: …
```

The conversion changes less than it looks. TJS accepts bare type names such as `number`, so
the parameters survive as written. The return becomes `:! number`, a type-only example,
because a TypeScript return type is not a worked example to test. And the
`/* tjs <- input.ts */` header marks the file as converted, which means it keeps JavaScript
semantics: no input validation unless you opt in (`/* @tjs TjsStrict */`) or graduate it.

## 8. Remediation

Recorded as it happened, because "we fixed it" is the part that rots first.

### 8.1 The pipeline had multiplied, not just drifted

The regression was not only wrong, it was **more work to be more wrong**. Three duplicated
paths, each a place for the two halves to disagree:

| duplicate | resolution |
| --- | --- |
| two JavaScript emitters (`ts.transpileModule` beside ours) | deleted; `fromTS` does TS → TJS, `tjs` does TJS → JS, callers compose |
| two metadata stories (only the tsc branch returned `types`) | metadata extraction is unconditional; the TJS path returns `types` and `classes` |
| two model-selection implementations (`demo/src/capabilities.ts` beside the batteries' audit) | **still duplicated** — see §9 |

The principle that keeps falling out: *we do not convert TS to JS. We convert TS to TJS.*
Everything downstream of that is one path. The browser entry (`browser-from-ts.ts`) needed no
change — it delegates to `fromTS`, so it inherited TS → TJS and can no longer emit JS even by
accident. The TS playground (`demo/src/ts-playground.ts`) already composed correctly.

### 8.2 What the honest lanes then found

Each of these is the same shape — **valid input the converter produces and the language could
not read** — and each was invisible while `tsc` did the emitting. The first four are the
defects behind the 52 red tests in §4; the last two appeared on 2026-08-30, once zod could be
measured.

| defect | found by | why it hid |
| --- | --- | --- |
| annotated generators (`function* f():! 0.0`) unparseable | the 52 red tests | our parser never saw converter output |
| destructured param with an inline type unparseable | the 52 red tests | ditto |
| optional param converted to a *required* one | the 52 red tests | metadata came from the extractor, JS came from tsc — they never had to agree |
| interface members of unresolvable type emitted `any` | the 52 red tests | rejected only at graduation, which nothing ran |
| `$` rejected in every declaration name | the corpus probe (§8.3) | zod names its internals `$ZodType`; the whole target was unmeasurable |
| interface + const of the same name collided | the corpus probe (§8.3) | the guard existed for type *aliases* and was never applied to interfaces |

The last two are worth separating: they are not new rules, they are **existing rules that were
never applied to the neighbouring case**. Look for the sibling site.

### 8.3 The corpus, measured honestly

The first honest measurement, from 2026-08-30: files that convert **and** parse, across six
real TypeScript projects. This probe did not cover whole trees. Four projects show exactly 150
files and the total is 634, against 1973 files in the full scan of §10, so it was sampled (most
likely capped at 150 files per project; the probe itself was not committed) and 89% is a figure
over that sample.

| project | files that convert and parse |
| --- | --- |
| effect | 97/150 (65%) |
| kysely | 148/150 (99%) |
| radash | 8/10 (80%) |
| superstruct | 150/150 (100%) |
| ts-pattern | 22/24 (92%) |
| **zod** | **138/150 (92%)** — previously unmeasurable |
| **total** | **563/634 (89%)** |

That leaves 71 failing files. The causes recorded at the time account for 70 of them: 57
parse, 10 ambiguous-overload, 3 already-declared. The record does not give a cause for the
71st. `effect` is the laggard, dominated by `class X extends Schema.Class<X>("X")({…})` — a
class extending a call expression with type arguments.

**Do not compare these to the old numbers.** ts-pattern 453/453 counted upstream tests passed
and kysely 303/303 counted files transpiled, and both measured `tsc`. This table counts files
that our converter turns into JavaScript that parses. 89% is the first figure this project has
published about its own converter. §10 records where it went next.

### 8.4 A probe that failed open, again

The first version of the corpus probe printed `0/0 files (100%)` for every target — its `find`
excluded `*test*`, which matched the `.compat-tests` directory itself. It read as a clean pass.
Fixed by making an empty file list print `NO FILES — probe broken, not a pass`. That makes three
measurements on this page that failed silently in the passing direction, after `--full`
defaulting off (§2) and `compat-all` reporting `5 passed` while superstruct ran zero tests
(lesson 5). Assume it of every new probe until shown otherwise.

## 9. Still open

Updated 2026-11-06. Each item as it was left in §8, and where it stands now.

- **The lane verdict (lesson 5).** *Closed.* `scripts/compat-all.ts` runs every compat
  script, prints a table, and exits non-zero if any target fails. An unmet prerequisite
  (zod needs `pnpm`) is reported as a skip, not a failure, because it says nothing about the
  converter. Each script also fails when its own transpile step fails, and the vitest-based
  scripts fail on a suite that did not load, not only on failed tests.
- **The two compat failure classes, and `superstruct src/utils.ts:188`** (a one-off
  `Unexpected token` parse failure in the compat lane, never diagnosed at the time). *Closed.*
  The per-file scan reached 1973/1973 on 2026-09-02 (§10).
- **The `ts.transpileModule` body-stripper ratchet, down to zero.** *Open.* One call site
  remains, inside the TS → TJS step, where `tsc` strips type annotations from function
  bodies. `src/no-ts-emitter.test.ts` holds it at a ceiling of 1. Reaching zero needs our own
  TypeScript statement stripper.
- **Two model-selection implementations** (§8.1). *Partly open.* The demo's vision probe now
  uses the batteries' shared `checkVision`; its chat-model resolution in
  `demo/src/capabilities.ts` is still its own.

## 10. Since then

Recorded so the figures in §8.3 are not read as current. Both lanes below run before every
release, as part of the suite `bun run release:ready` runs locally and attests; they do not
run on every commit or in CI. The figures are the last full runs as of their dates.

**Every file converts and parses.** `bun run test:compat-scan` (`scripts/compat-scan.ts`) runs
every non-test, non-declaration `.ts` source file in the six cloned projects (skipping
`tests/`, `dist/` and `node_modules/`) through TS → TJS → JS and checks that the result
parses. It is a ratchet in both directions: a file that newly fails is a regression, and a
file on its known-failure list that starts passing must be removed from the list. On
2026-09-02 it reached 1973/1973 files across the whole corpus and the known-failure list
became empty. Files over 400KB are skipped and named in the output, because the preprocessor
is quadratic in file size and hangs on them rather than failing. A skip that reads as a pass
is the failure this page is about, so the scan says so.

**The projects' own test suites pass on the converted code.** `bun run test:compat` clones each
project, converts it with `fromTS` and `tjs`, and runs that project's test suite against the
result. The last full run, on 2026-09-25:

| project | result |
| --- | --- |
| zod | 1959/1959 upstream tests, its first real run |
| ts-pattern | 453/453 upstream tests |
| superstruct | 225/225 upstream tests |
| radash | 340/340 upstream tests; 47 tests excluded: radash's own suite has broken fake timers under the vitest shim, and the harness subtracts only failures with that error message |
| effect | transpiles only: every source file converts; the lane does not run effect's tests (that needs `--test` and `pnpm`), and the run did not record a file count |
| kysely | transpiles only: 395/395 files; its tests need a database and are not run |

Two of these deserve a note. zod's first "pass" was not one: 105 of its suites failed to load,
and a suite that cannot load has no failed tests, so the harness counted it as green. That is
lesson 5 again, and it is why every vitest harness now fails on a failed suite. And
ts-pattern 453/453 is the same number §4 dismissed. Then it measured `tsc`; now it measures
our converter.
