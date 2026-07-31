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
