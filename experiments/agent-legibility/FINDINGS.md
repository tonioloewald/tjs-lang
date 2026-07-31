# Agent-legibility spike — findings

**Run:** 2026-07-31, `mlx-community/Qwen2.5-1.5B-Instruct-4bit` via mlx-omni-server, 4 tasks
× 2 arms, ≤3 attempts, temp 0.2. Harness: `harness.ts`.

**Hypothesis under test:** not "TJS beats TypeScript" (we wrote TJS; that number would be
worthless) but the _mechanism_ — do **executed verdicts** repair a model's wrong answer faster
than **static type complaints**?

**Verdict on the spike: the experiment as designed cannot answer that question.** Four
concrete reasons, each of which would have quietly wrecked the full study. That is the spike
working.

---

## 1. The apparatus failed closed — and looked like a result

First run: **0/8 solved.** The model was in fact emitting perfectly correct code. Both arms
were judged with a bare `new Function(code)`, and _neither_ arm's source is valid JavaScript —
TS has type annotations, TJS has example-value annotations. Every correct answer was scored
wrong.

Fixed by compiling per-arm before judging (`fromTS` / `tjs`), after which the same setup
scored 7/8.

**Lesson for the study:** an experimental harness needs a positive control — a known-good
solution that MUST score green — or a silent apparatus failure is indistinguishable from a
strong negative result. A 0/8 is much more likely to be your bug than their model.

## 2. The tasks are too easy, so the repair loop never ran

After the fix, **7 of 8 runs solved on attempt 1**. The repair loop — the entire hypothesis —
was exercised exactly once. `repairedAfterFail` was `n/a` for TS and 0% for TJS on a single
sample.

**The study needs tasks calibrated to fail first-try** at the model size under test: roughly a
40–70% first-attempt success rate is where iterations-to-green and repair-rate carry signal. At
100% or 0% both arms are indistinguishable no matter how good the feedback is.

## 3. `solved` is the wrong metric for the TJS arm — TJS ⊇ JS

Because plain JavaScript **is** valid TJS, a model can "succeed" in the TJS arm by ignoring TJS
entirely. Solve rate therefore measures _task difficulty_, not TJS legibility. Checking what
the models actually wrote:

| task      | signature the model produced                 | what it is                        |
| --------- | -------------------------------------------- | --------------------------------- |
| median    | `function median(nums: [number])`            | **hybrid** — TJS array, TS inside |
| titleCase | `function titleCase(s: string)`              | **TypeScript**                    |
| rle       | `function rle(s: ''): string`                | **hybrid** — TJS param, TS return |
| chunk     | `function chunk(items: any[], size: number)` | **TypeScript** (failed)           |

Not one produced a fully idiomatic TJS signature. The study must measure **idiom adoption**
separately from correctness — otherwise "TJS works great with agents!" can be true while no
agent ever writes TJS.

## 4. Training-data pull dominates at this model size

Told explicitly, with a worked example in the system prompt, that types are _example values_,
the 1.5B model still reverted to `items: any[], size: number`. This is the confound named up
front in the harness header, and at 1.5B it is not a confound — it is **the dominant effect**.

Note the asymmetry cuts a specific way: TJS's permissiveness means a hybrid often still
transpiles (`s: ''` with a `string` return worked), so the failure is quiet. `chunk` failed
loudly only because `any[]` isn't parseable as an example.

---

## What to change before running the real study

1. **Positive control** in the harness: a known-good solution per task per arm that must score
   green, asserted before any model is called.
2. **Calibrate task difficulty** per model size — target ~50% first-attempt success. Include a
   harder family (stateful/multi-step, edge-case heavy) so repair matters.
3. **Measure idiom adoption as a first-class metric**, not just correctness: did the output use
   TJS example-types, TS types, hybrid, or bare JS? Correctness conditional on idiom is the
   interesting cell.
4. **Separate the two claims.** (a) "Executed verdicts repair better than type errors" is
   testable _within_ TJS alone — same language, feedback string varied — which removes the
   training-data confound entirely. (b) "Models can write TJS" is a different, prompt-and-scale
   question. Conflating them is what made this spike ambiguous.
5. **Scale up the model** for the legibility question; keep a small model for the cost question.

**Recommended next experiment:** the _within-TJS_ A/B from (4a). Same language, same tasks, only
the feedback string differs (executed verdict vs. a types-only complaint). It isolates the
mechanism, is immune to the training-data asymmetry, and is cheap to run locally.

---

# Guidance A/B — optimizing our own documentation (2026-07-31)

`guidance-ab.ts`. Same model, tasks, samples and temperature; **only the guidance text
varies**. AJS (not TJS) because AJS is the language explicitly designed for small models.
Judged as production would: transpile → run in the VM → check the result.

| variant        | size | rate (N=9) | dominant failures               |
| -------------- | ---- | ---------- | ------------------------------- |
| **cheatsheet** | 0.6k | **67%**    | 2× wrong result, 1× syntax      |
| full (shipped) | 7.6k | 33%        | 3× ForStatement, 2× Out of Fuel |
| examplesOnly   | 5.7k | 33%        | 3× ForStatement, misc           |
| none           | 0.1k | 0%         | 6× ForStatement, 3× Out of Fuel |

## Findings

**1. A 0.6k cheat sheet beats our 7.6k shipped guide by 2×.** Twelve times shorter, twice
as effective, on the language we designed for small models.

**2. Guidance is worth a lot — but it isn't monotonic.** `none` scores 0%, so docs matter
enormously; yet the _longest_ guide is half as good as the shortest useful one. There is a
sweet spot, and we are on the wrong side of it.

**3. Adding the missing rule did NOT fix it — the negative result that matters.** The
dominant failure was `ForStatement` (models write `for` loops; AJS has none), and the
shipped guide had no explicit prohibition while the cheatsheet did. Obvious hypothesis:
add the rule. **Added it, re-measured, no change** — still 33%, still 3× ForStatement.

So the cheatsheet's advantage is _not_ the specific rule. The plausible mechanism is
**signal-to-noise**: a small model given 7.6k of prose loses the constraints; the same
constraints in 0.6k land. This is exactly the kind of thing intuition gets backwards —
"the guide is missing a rule, add a rule" is wrong, and we'd have shipped it believing
otherwise.

**Actionable:** ship a short cheat sheet as the _primary_ small-model prompt and demote
the long guide to reference. Verify with a higher-N run before committing to it.

**Caveat:** N=9 per variant. The rate gaps (67 vs 33) are suggestive, not conclusive; the
failure histograms are the robust part. Raise `GUIDANCE_SAMPLES` before acting on a
smaller gap than this one.

---

# The research programme this is really part of

The spike + A/B were single cells of a much larger matrix. Design it explicitly so results
compose instead of accumulating as anecdotes.

**Axis 1 — language:** JS · TS · TJS · AJS. (JS is the essential control: it is what every
model knows best, so it calibrates how much of any result is _familiarity_ rather than
_legibility_.)

**Axis 2 — capability.** Each needs its own task design and its own judge; conflating them
is what made the first spike ambiguous:

| capability             | question                                          | judged by                  |
| ---------------------- | ------------------------------------------------- | -------------------------- |
| origination            | can it write correct code from a spec?            | execute against cases      |
| bug reasoning          | given failing code + a verdict, can it repair?    | execute after repair       |
| syntax-error reasoning | given a compile error, can it fix it?             | compiles                   |
| syntax inference       | given only examples, can it produce valid syntax? | parses                     |
| syntax guessing        | given NO guidance, what does it assume?           | parses (+ what it assumed) |
| comprehension          | can it predict what code does?                    | matches actual output      |
| doc usefulness         | which guidance variant maximises the above?       | A/B, as above              |

**Axis 3 — model size.** The interesting result is not a single number but the
**transition boundary**: at what scale does each language become tractable? AJS should be
tractable far smaller than TJS; _where_ that crossover sits is a real, publishable finding
and directly informs how much to invest in making TJS legible to small models.

**Design rules learned the hard way (all four from the first spike):**

- Positive control per cell, or a broken harness reads as a strong negative result.
- Calibrate difficulty to ~50% first-attempt, or the repair loop never runs.
- Measure **idiom adoption** separately from correctness — TJS ⊇ JS means a model can
  "pass" the TJS arm without writing TJS.
- Vary ONE thing per experiment. The within-language feedback A/B (executed verdict vs
  type error) is confound-free; the cross-language comparison never will be.

---

# Surface-syntax probe — speculative language features (2026-07-31)

`surface-probe.ts`. One program (`sum of i² for i=1..4` = 30) rendered in six surfaces;
the model is asked only what it **returns**. Comprehension rather than generation, so
syntaxes that don't exist yet can be probed without writing a parser — including ones we
are merely considering.

| surface       | rate (N=5) | wrong answers      |
| ------------- | ---------- | ------------------ |
| braces        | 20%        | 20, 20, 20, 20     |
| bracesNoSemi  | 20%        | 20, 20, 20, 20     |
| endKeyword    | 20%        | 20, 20, 20, 20     |
| indent        | 0%         | 20, 20, 13, 20, 20 |
| indentNeutral | 0%         | **10** ×5          |
| sexpr         | 0%         | **10** ×5          |

## Read the error modes, not the rates

**The rates are not usable.** Everything scores 0–20%: at 1.5B the model can't reliably
trace a 4-iteration accumulator loop in ANY surface. Same calibration failure as the first
spike — the instrument is saturated at the floor, and a 20-vs-0 gap at N=5 is noise.

**The error modes are usable, and they're clean:**

- Familiar surfaces (braces / `end` / Python-indent) all fail the SAME way (`20`) — the
  model computes something structured but wrong.
- Unfamiliar surfaces (indentNeutral, sexpr) fail a DIFFERENT way (`10` ×5, unanimous):
  it **silently drops the `i * i` and sums `i`**. It loses a semantic detail rather than
  mis-executing.

That distinction is the interesting result. A surface that recruits a strong prior gets the
_structure_ attended to; an unfamiliar one degrades by quietly dropping content. For a
language whose pitch is agent-legibility, "fails by omission, silently" is a far worse
failure mode than "fails by arithmetic".

**Directly relevant to a choice we already made:** `braces` and `bracesNoSemi` are
indistinguishable (20%, identical error mode). No evidence semicolon-elision costs
comprehension — mild support for `TjsStandard`, which was chosen on taste.

**Familiarity is not separable here, and shouldn't be.** `indentNeutral` isolates layout
from vocabulary and does _worse_ than Python-shaped `indent`, which suggests the Python
result is largely vocabulary/prior transfer rather than indentation itself. A surface that
recruits a prior IS cheaper for the model — that's a genuine design finding, not a confound
to apologise for.

## Before this is worth anything

1. **Calibrate the program** so the baseline lands ~50–70%, not ~10%. Trace-a-loop is too
   hard at 1.5B; use fewer iterations or simpler arithmetic.
2. **Scale the model** — run the same probe across sizes. The _ordering_ of surfaces as
   models grow is the real question, and where a "transition boundary" would show up.
3. **N≥20 per cell** before believing any rate.
4. Then, and only then, promote a winning surface to a generation test — comprehension
   measures whether a model can read a surface, not whether it can write one.
