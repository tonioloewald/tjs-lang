# 0.14.0 — the deferred work

## The main goal: move onto the tosijs-ui dev/build system

**This is the headline item, not one of the numbered ones below.** Everything else here is
cleanup carried over from the 0.13.x reviews; this is the change that has a reason of its own.

The motivating symptom, found 2026-08-23: **the deployed playground was two releases stale**
and nothing said so. The live bundle contained zero occurrences of `collapseUnions` — the
nested-literal-union fix from 0.13.1 — so `tjs-platform.web.app` was still failing to compile
`{ mode: 'a' | 'b', other: 1 }` depending on member order, days after that was fixed and
published twice over. The local `.demo/` build was stale too.

Nothing detects this. `bun run make` does not build the demo; CI builds it only so that
`demo-bundle.test.ts` stops skipping itself; and a deploy is a manual step whose success
message says nothing about whether what it deployed is current. The staleness is invisible by
construction — which is the same shape as every other defect this release cycle: not a wrong
answer, an absent check.

Adopting the tosijs-ui dev/build system should make deployment a consequence of releasing
rather than a separate act someone has to remember.

**Whatever it looks like, it should make these two things impossible rather than unlikely:**

- a deploy that ships a bundle older than `main`
- a green build that proves nothing about what is live (the current
  `bun run deploy:hosting` prints "Deploy complete!" either way — the verification that
  caught this was a manual `curl` of the live bundle and a `grep` for a marker symbol)

Until it lands, verify a deploy by fetching the live bundle and grepping for a symbol
introduced by the release. That is what found this.

Branched from `v0.13.2`. Everything here was deliberately kept out of the 0.13.x patch
line because it changes behaviour, changes a dependency, or is a refactor with real blast
radius — the 0.13.x line is patch-only after 0.13.0 shipped by mistake.

Ordered by value, not by size. The first item is the most valuable thing on the list and
should probably land alone.

## 1. Unify `emitDirectory` and `convertDirectory`

**Why first:** these are structural twins, and across three releases the _same_ defect had
to be fixed twice, once per copy — the recursive-descent guard, the failure tally, the exit
code. Three times, only one copy got fixed. That duplication is the **generator** of the
sibling-site class that produced a blocker in four consecutive review rounds; every other
item on this list is an instance, and this is the thing that makes instances.

Shape: lift the walk into `src/cli/walk.ts` as something like
`walkTree(dir, { ext, skip, recursive, onFile }) → tally`, so descent policy, tally rollup
and exit code exist once. `readEntries` and `shouldDescend` already live there; this is the
loop they were extracted out of.

**Risk: real.** Both commands are documented build paths. Wants its own change and its own
review, not a slot in a batch.

## 2. `tjs run`: warn by default, `--strict`, `--skip-tests`

**Decided (2026-08-22):** the runner should run signature tests and WARN on failure by
default; `--strict` runs them and stops; `--skip-tests` does not run them at all. Builds and
the playground fail hard by default.

### What today looks like

Tested against `function add(a: 2, b: 3): 0` (wrong — it is 5):

| path                          | tests                                     | exit              |
| ----------------------------- | ----------------------------------------- | ----------------- |
| `tjs check`                   | enforced                                  | 1                 |
| `tjs emit`                    | enforced                                  | 1                 |
| `tjsx`                        | enforced                                  | 1                 |
| `tjs run`                     | `runTests: false`                         | 0, silent         |
| bun plugin (`import 'x.tjs'`) | `runTests: false`                         | 0, silent         |
| playground                    | reports, but `valid: errors.length === 0` | **reports VALID** |

`tjs convert` is **not** a gap: `fromTS` emits type-only returns, so converted TypeScript
produces zero signature tests. There is nothing for it to fail on. (A `return false` was
written for it and reverted — it was unreachable.)

### The blocker, and why the obvious fix is wrong

`runTests: false` in `run.ts` is deliberate and load-bearing. The signature harness
**evaluates the module** to reach the functions; `run` then writes a temp module and
evaluates it again. Turning tests on as-is means **two evaluations in one command** — the
`hi\nhi` bug the comment there records.

Two things that are NOT the objection: that a module evaluates when imported (that is JS,
and every test runner does it), and that functions have side effects when called with their
example arguments (if they do, you have other problems). The defect is narrower and duller:
one command, two evaluations.

The harness also **cannot resolve real imports** — given a file importing `./dep.mjs` it
reported a CORRECT signature test as failed. So enabling tests in `run` today would also
produce spurious failures on any file with an import.

### The fix: one evaluation, tests inside it

The machinery is half-built. `result.testRunner` is emitted as a string for explicit
`test { }` blocks and appended to the module, so those already run inside the single real
evaluation. **Signature tests are not emitted** — only `runAllTests(...)` settles them, at
transpile time, in its own context.

Extend `generateTestRunner(tests, mocks)` to take `sigTestInfos` and emit signature
assertions too. Then `run` appends the runner and evaluates ONCE. This also fixes the
imports problem for free, because the tests then run inside the real module where the
imports resolve.

Same shape as the `emit`/`convert` unification in item 1: two mechanisms doing one job,
where only one got the capability.

### Placement: INLINE, after each definition

The assertion for each function is emitted **immediately after that function's definition**,
not batched at the top or the end. This was the original intent and it is better than the
three shapes considered before it — it dissolves the question rather than trading against it.
Measured:

- **No TDZ problem.** The assertion sits after the initializer, so an arrow const
  (`const dbl = (n: 2): 4 => …`) tests exactly as well as a `function` declaration. Batching
  at the top could only test hoisted declarations; batching at the end could not stop
  anything.
- **True stop, uniformly.** A failing assertion throws at its definition site: verified that
  **zero** subsequent initialization steps run. No inconsistency by declaration form.
- **One evaluation.** No harness, no pre-pass, no double side effects.
- **It tests module SPIN-UP.** The assertions interleave with initialization, so a module
  whose init depends on a function being correct fails at the point that matters — inside
  the real module, where imports resolve. The transpile-time harness cannot do this: it
  reported a correct signature test as failed on a file importing `./dep.mjs`.

The three modes are then placement plus a handler, not three architectures:

| mode           | emitted                                                     |
| -------------- | ----------------------------------------------------------- |
| default        | inline assertion that WARNS and continues                   |
| `--strict`     | inline assertion that THROWS — stops at the definition site |
| `--skip-tests` | no assertion emitted                                        |

Builds and the playground use the throwing form by default.

### Scope

`src/lang/tests.ts` (`generateTestRunner`), `src/lang/emitters/js.ts` (wire `sigTestInfos`),
`src/cli/commands/run.ts` (three modes), `src/cli/tjs.ts` (flags + help), `demo/` (playground
fail-hard: `valid` must account for failing signature tests). Plus tests for each.

This touches the test-execution machinery, which is where four consecutive review rounds
found a defect. It wants a clear head and its own review, not the tail of a long session.

## 3. Adopt `tosijs-schema` ≥1.7.0, drop the `additionalProperties` workarounds

The `.open` seam shipped upstream on 2026-08-19 ([tosijs-schema#5], closed); we are pinned
at `^1.5.1` with 1.5.1 installed. Adopting lets the battery output schemas declare an open
object instead of emulating one.

**Risk: real.** The battery atoms' output validation is _exactly_ what the 1.5.0 tightening
broke, and that break reached published versions and needed an `npm deprecate` to reach
users. Bump, then verify the battery lane specifically, not just the suite.

## 4. `emit`'s signature-test narration pollutes stdout

`tjs emit f.tjs > out.js` can interleave test narration into the artifact, and `--jfdi`
writes the test report into it at **exit 0**. Signature tests execute the module in-process,
so a top-level `console.log` in the source lands on fd 1 inside the artifact.

The hashbang half of this finding is fixed in 0.13.2; this half is not. Route narration
through `console.error`, and capture guest stdout during signature-test execution. The
comment at `emit.ts` promising "Warnings to STDERR, so `tjs emit file.tjs > out.js` still
produces clean output" is currently false.

## 5. Extract the DCE-safe `compare()` into a shared bench harness

The measurement discipline this release paid for twice — folded-away baselines, DCE,
JIT-history dependence — exists only as a private function inside `bin/benchmarks.ts`.
`src/css/perf.bench.test.ts`, `src/linalg/vector-search.bench.test.ts` and
`experiments/dictionary-defaults/` all still wear the shape it was invented to fix.
`perf.test.ts` proved the cost by reporting a 116× overhead that was a folded-away baseline.

## 6. Curated CSS property list ([#5])

`isCssProperty('align-konten')` returns `true` — the predicate is shape-based, not
membership-based, so it converts a typo into a silent no-op. Verified still reproducing at
0.13.2. Same work as the curated-completions item, so they land together.

## 7. `wasmReady()` as public API ([#11])

`__`-prefixed globals are an internal-looking surface for something consumers need. 0.10.0's
synchronous instantiation means most callers no longer need to await readiness at all, which
is partial relief, but the public-API ask stands.

## 8. `$predicate` source-format spec ([#26])

Genuinely unspecified, and upstream's own fixtures disagree — `createPredicateEvaluator`
requires a named-function cluster while a bare arrow appears in examples. Write the spec
into `docs/`, link it from `llms.txt` and `CLAUDE.md`, and export a tosijs-schema-compatible
`createPredicateEvaluator`.

## 9. `toBool` hot-path tax ([#3])

Re-measured at 0.13.2: **~15 bytes per conditional asymptotically, ~4× runtime on a
conditional-dense loop.** The fix — skip the wrap when an operand is provably primitive — is
known and is a language-level change.

## Also carried over

- The flaky live-LLM lane: one full run reported 2 failures, **not captured** (piped through
  `tail`), never reproduced across six subsequent runs. Re-run against a warm server
  capturing everything, then either name them or extend the fallback so slowness cannot
  surface as a failure.
- `src/cli/cli-tsfree.test.ts` hard-codes `src/cli/tjs.ts`; `package.json` declares four JS
  bins. Drive the fixture over the `bin` map.
- `tjs-playground` accumulates a `playground-<version>/` per upgrade with no prune, no TTL
  and no mention in `--help`.

[tosijs-schema#5]: https://github.com/tonioloewald/tosijs-schema/issues/5
[#3]: https://github.com/tonioloewald/tjs-lang/issues/3
[#5]: https://github.com/tonioloewald/tjs-lang/issues/5
[#11]: https://github.com/tonioloewald/tjs-lang/issues/11
[#26]: https://github.com/tonioloewald/tjs-lang/issues/26
