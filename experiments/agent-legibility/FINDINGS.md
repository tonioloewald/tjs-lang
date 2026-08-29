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

---

# It was never the syntax: state-threading beats mutation 4:1 (2026-07-31)

Recalibrated the probe (`sum 1..4 = 10`; the `i*i` version pinned every surface at 0–20%,
and an instrument at its floor measures nothing). Re-run, N=5:

| surface             | style              | rate |
| ------------------- | ------------------ | ---- |
| **sexpr**           | recursive/threaded | 80%  |
| **bracesRecursive** | recursive/threaded | 80%  |
| braces              | mutation           | 20%  |
| bracesNoSemi        | mutation           | 20%  |
| indent (Python)     | mutation           | 20%  |
| indentNeutral       | mutation           | 20%  |
| endKeyword          | mutation           | 20%  |

## The result, and the near-miss

First reading was "**s-expressions win 80% vs 20% — Lisp really is better for agents.**"
That would have been wrong, and wrong in a way that flattered a hypothesis we already
liked.

The s-expr variant differed from the others in **two** ways: parenthesised surface _and_
functional state-threading (a recursive loop with an explicit accumulator) instead of
mutating variables. Adding `bracesRecursive` — ordinary JS braces, same recursive style —
separates them. It scores **80%, identical to s-expr**.

**So the advantage is the paradigm, not the syntax.** Parentheses contributed nothing.
Every surface that _mutates_ state across iterations scores 20%; every surface that
_threads_ state explicitly scores 80%, regardless of how it's spelled.

Mechanically this is unsurprising in hindsight: mutation requires the model to maintain a
hidden register across iterations, while threaded state puts every value in the text it's
attending to. But it was invisible until one variable was changed at a time.

## Why this matters more than a syntax result

- It is **actionable for both languages**: constructs that thread state explicitly are
  dramatically more legible to models than mutation loops. AJS has no `for`, and its
  `map`/`filter`/`reduce` atoms are already threaded — this says lean _harder_ that way,
  and that a `while`-with-counter idiom is the expensive one to teach. (Note the guidance
  A/B's dominant failure was models reaching for `for` loops — the construct this probe
  says is also the hardest for them to reason about.)
- It **reframes the Lisp hypothesis**. Lisp may well suit agents, but on this evidence
  because of its functional idiom, not its uniform syntax or its scarcity of priors.
  Worth separating those in any future test.
- It **weakens the indentation question**. Python-shaped layout scored the same 20% as
  braces once paradigm was held constant — the earlier apparent Python effect was
  vocabulary/prior transfer, and neither layout nor brackets moved the needle here.

## Standing caveats

N=5, one 1.5B model, comprehension only. The 80/20 split is large and the mechanism is
plausible, but this needs N≥20 and a model sweep before it's load-bearing. Specifically
untested: whether the gap **narrows with scale** (a bigger model may track mutation fine,
making this a small-model-only effect) — which is exactly the transition-boundary question
and the single most valuable follow-up.

Still untested from the speculative list: **adversarial indentation** (mixed tabs/spaces,
where Python's whitespace sensitivity should become a liability), and a **Python-subset
analog of AJS** compared against AJS proper.

---

# Our error messages are worth exactly nothing (2026-07-31)

`error-message-ab.ts`. Broken code + ONE error-message variant → ask for a fix → judge by
transpiling and running. Message text is the only variable. N=10 per variant.

| variant     | repair rate |                                     |
| ----------- | ----------- | ----------------------------------- |
| withExample | **80%**     | ours + a worked correction          |
| withFix     | 50%         | ours + prose telling you what to do |
| silent      | 0%          | "that didn't work"                  |
| **actual**  | **0%**      | **what we ship today**              |

**Our diagnostics perform identically to saying nothing.** They are accurate — `Unsupported
statement type: ForStatement at <source>:3:2` correctly names the defect — and they cause
zero repairs. Accuracy without remedy is decoration.

The per-case breakdown sharpens it. For the `for`-loop defect:

- prose remedy ("AJS has no `for` loops — rewrite as a `while` with a counter"): **0/5**
- the same remedy _shown_ as three lines of code: **5/5**

Telling didn't work. Showing did.

## The pattern across three experiments

This is now the third independent result pointing the same way:

1. Guidance A/B: adding the missing prose rule changed nothing; the terse sheet **with an
   example** doubled the success rate.
2. Surface probe: models fail by silently dropping semantics they can't pattern-match.
3. Error messages: prose remedy 50%, **worked example 80%, status quo 0%**.

**Models repair from examples, not from rules.** Every place we currently spend prose —
guides, diagnostics, docs — is a candidate for "replace the paragraph with three lines of
code".

## Actionable

Attach a worked correction to the diagnostics for the constructs AJS deliberately lacks
(`for`/`for…of`, non-object returns, `new`, `class`, `await`). This is pure message text —
no compiler change — and the measured delta is 0% → 80% on repair.

## Limitation: this is single-shot, and real coding iterates

Each cell here is one attempt: broken code → one message → one fix. Real use is a loop —
fix, re-run, get the _next_ error, fix again. That matters because a diagnostic's value
compounds or decays across turns: a message that gets you 60% of the way may beat one that
solves it outright but teaches nothing transferable, and a bad message may waste the whole
budget. **The iterated version is the more honest experiment**, and it's the same shape as
the `harness.ts` repair loop — wire the message variants into that loop and measure
_iterations-to-green_ rather than one-shot repair rate.

---

# `switch` semantics probe — can a model READ native-TJS `switch`? (2026-08-27)

`switch-probe.ts`, `qwen/qwen3.8-27b` via LM Studio, N=5 per arm, temp 0.3. Run while
implementing #43, to decide whether making `break` implicit is safe to ship.

| arm           | expects | result         | notes                                                        |
| ------------- | ------- | -------------- | ------------------------------------------------------------ |
| `c_control`   | `1`     | **5/5 = 100%** | explicit `break`, read as `.js`. Positive control.           |
| `c_fallthru`  | `1,2`   | **5/5 = 100%** | no `break`, read as `.js`.                                   |
| `tjs_bare`    | `1`     | **0/5 = 0%**   | no `break`, read as `.tjs`. **All 5 applied C fallthrough.** |
| `tjs_rule`    | `1`     | **5/5 = 100%** | + a one-line prose comment stating the rule.                 |
| `tjs_example` | `1`     | **5/5 = 100%** | + the same fact as a worked example.                         |
| `tjs_multi`   | `1`     | —              | unmeasured; see §3.                                          |

## 1. The file extension communicates nothing. Zero, not "poorly"

`tjs_bare` did not score badly — it scored the **worst possible number**, and not from
uncertainty: both controls are 100%, so the model traces `switch` perfectly when it knows
which language it is in. Shown the identical text as `.tjs`, it applied C fallthrough 5
times out of 5, confidently.

The reasoning transcript says why, and it is worth quoting because no rate captures it:

> _"…maybe has 'case' with comma to group multiple cases? There is a language 'TJS' by 'TJS'
> (maybe 'TJS: A TypeScript-like language')…"_

**There is no prior for `.tjs`.** The extension is our out-of-band mode marker — the thing
that makes TJS able to fix `==` where `"use strict"` could not — and to a reader it carries
no information at all. That is a real cost of the design, and it had not been measured.

## 2. A one-line comment takes it from 0% to 100% — and the plain rule is enough

Both comment arms hit the ceiling. **The prose rule is sufficient; the worked-example form
buys nothing here.** So `convert` should emit the short comment.

Note the instrument is saturated at the ceiling, so this run **cannot** rank rule vs example
— it can only say both clear the bar on this task at this model size. Ranking them needs a
harder task or a weaker model. (A2/A3 rank worked examples above prose rules for _repair_;
this is comprehension, and the question stays open.)

**Correction to an earlier reading of our own findings:** the first draft of this probe
predicted the comment would fail, citing A3. That misreads A3. Guidance helps enormously
(`none` = 0%, cheatsheet = 67%); what A3 refutes is narrower — prose _rules_ underperform
_worked examples_. "Comments do not help" was never a finding here.

## 3. The apparatus trap, again, in a new costume

`tjs_multi` (`case 'a', 'b':`) returned five nulls. Not a failure — **no answer**: the model
emitted 7,277 characters of `reasoning_content` and never filled `content`, exhausting a
2,000-token budget. Scoring those as wrong would have produced "models cannot read
multi-value cases", a confident finding from an instrument that never ran.

Same root cause as the live-LLM flakiness diagnosed the day before (see `TODO.md`): a
reasoning model puts the answer in `reasoning_content` and leaves `content` empty. Nulls are
now counted in their own column. Raising the budget to 12,000 made the _call_ time out
instead, so this arm is still unmeasured and is the open question — it is the one construct
with no JS analogue at all.

## What this changed

- The explanatory comment is **load-bearing**, not decoration: it is the difference between
  0% and 100% agent comprehension. `convert` must emit it.
- A hand-written `.tjs` file carries no such comment, so the docs and cheat sheet have to.
- Every future `.tjs`-only semantic change should be probed this way before shipping. The
  extension will not carry it.

---

# `switch` probe, round 2 — two models, the header hypothesis, and multi-value (2026-08-27)

`switch-probe.ts`, `/no_think`, N=5. Full tables in `switch-probe-results.md`, which is
append-only so the series accumulates.

| arm                               | qwen3.8-27b         | gemma-4-e4b |
| --------------------------------- | ------------------- | ----------- |
| `c_control` (apparatus)           | 5/5                 | 5/5         |
| `tjs_bare`                        | **0/5**             | **0/5**     |
| `tjs_rule` (one-line comment)     | **5/5**             | **0/5**     |
| `tjs_header` (names tjs, no rule) | 0/5 — _5 no-answer_ | 0/5         |
| `tjs_header_rule`                 | **5/5**             | 0/5         |
| `tjs_multi` (`case 'a','b':`)     | 0/5 — _5 no-answer_ | **0/5**     |
| `tjs_multi_rule`                  | **5/5**             | 0/5         |

## 1. `tjs_bare` = 0/5 replicated across two models and three runs

The extension carries nothing, and this is now robust rather than a single spike. Both
controls are 100% in both models, so it is not an instrument problem: shown identical text
as `.js` a model traces it perfectly, and as `.tjs` it applies C fallthrough every time.

## 2. Guidance works — above a capability threshold. This QUALIFIES the round-1 finding

Round 1 concluded "a one-line comment takes it from 0% to 100%". True at 27B. At 4B the
same comment does **nothing**: every TJS arm 0/5, the JS prior unmoved by anything in the
file. So the honest claim is _guidance-in-code works for models capable of acting on it_,
which extends A7 (small models cannot WRITE TJS) to reading.

Practical consequence: the comment is worth emitting, and it is not a substitute for the
extension carrying meaning to small models — nothing in the file achieves that.

## 3. Naming the language WITHOUT stating the rule is worse than saying nothing

`tjs_header` scored 0/5 with **five no-answers** on the 27B — not wrong answers, _no_
answers. Naming a language with no training-corpus presence sends the model into the
"wtf is tjs" spiral we saw verbatim in round 1, and it never reaches a conclusion.

`tjs_header_rule` is 5/5. **The rule does the work; the header alone is a liability.**

So the proposed `// tjs is a new js-family language, see …` file header should NOT ship on
its own. Either pair it with the specific rules a reader needs, or omit it. A pointer to
documentation the model cannot read is an invitation to speculate.

## 4. Multi-value `case 'a', 'b':` needs the comment MORE than implicit break does

Finally measured, after two apparatus failures. Bare: 0/5 on both models (no-answers on the
27B — it will not commit). With a one-line comment: 5/5 on the 27B.

This is the construct with no JS precedent, so there is no prior to correct — only a gap to
fill — and the gap is fillable. Note the 4B stays 0/5 even with the comment.

## 5. Apparatus notes, since two runs were lost to them

- **Reasoning models need `/no_think`** (or an equivalent). Without it `content` comes back
  empty while the answer sits in `reasoning_content`, which this harness reads as no answer.
- **A transport failure must cost one sample, not the sweep.** Two runs died partway and
  lost every arm after the failure, which is why `tjs_multi` was unmeasured twice.
- **`tjs_multi` must ask about `f('b')`, not `f('a')`.** `case 'a', 'b':` is valid JS (a
  SequenceExpression evaluating to `'b'`), so the JS reading of `f('a')` is the empty
  string — indistinguishable from "no answer". Its `confusion` value was mis-specified too.

## What to do with this

- `convert` should emit the one-line rule comment on rewritten switches, and on multi-value
  cases especially. **Not** a bare "this is tjs" header.
- Re-run when a new model lands; the threshold between 4B and 27B is the interesting
  unknown, and nothing here locates it.

---

# Header form does not matter; the inline rule does (2026-08-28)

Follow-up testing a **self-contained** header — reassurance rather than reference:

```
// ts converted to tjs (a new JavaScript)
// changes from ts are explained inline
```

The idea being _"don't worry, we'll tell you what you need to know"_, which needs no tools
to act on. qwen3.8-27b, N=5.

| arm                      | correct | applied-other-rule | no-answer |
| ------------------------ | ------- | ------------------ | --------- |
| `c_control`              | 5/5     | 0                  | 0         |
| `tjs_bare`               | 0/5     | 5                  | 0         |
| `tjs_selfcontained`      | **0/5** | 1                  | **4**     |
| `tjs_selfcontained_rule` | **5/5** | 0                  | 0         |

## The result

Reassurance behaves essentially like the link version: header alone still fails, still
mostly by NOT ANSWERING. Collecting every header run:

|                       | alone                      | with the inline rule |
| --------------------- | -------------------------- | -------------------- |
| link header           | 0/5 (5 no-answer)          | 5/5                  |
| self-contained header | 0/5 (4 no-answer, 1 wrong) | 5/5                  |
| _no header at all_    | 0/5 (5 wrong)              | **5/5**              |

**The inline rule is necessary and sufficient. The header is neither.** Every arm carrying
the rule scores 5/5 whether or not a header is present, and no header rescues an arm without
it. That is a cleaner result than either hypothesis predicted.

## A confound in the previous round, corrected

Round 2 concluded a header is "worse than silence" because it points at documentation the
model cannot read. **That reasoning was partly an artefact of this harness** — a model here
has no fetch tool, whereas a real coding agent does. The self-contained arm removes the
confound entirely, and the header still does not help, so the conclusion survives while its
stated _reason_ does not. Worth keeping visible: the finding was right for the wrong reason,
and only testing the mechanism separated them.

## What the failure mode actually is

Both header-alone arms fail by **not committing** rather than by answering wrongly, while
bare `.tjs` fails by answering wrongly 5/5. So naming the language does change behaviour —
it converts confident error into paralysis. That is arguably an improvement in honesty and
is certainly not an improvement in usefulness.

The risk flagged before running — that "changes are explained inline" makes an *un*annotated
construct positively imply "unchanged" — did **not** dominate: only 1 of 5 committed to the
JS reading. The promise did not produce confident wrong answers, it produced no answers.
Still a reason to annotate exhaustively if such a header ever ships.

## Actionable

- `convert` emits the **inline rule** at each changed construct. That is the whole
  intervention; nothing else measured moves the number.
- A file header is optional and buys nothing measurable here. If one ships for human
  readers, it must not be relied on for comprehension.
- **Untested, and it is the real deployment: does a header help an agent that can FETCH the
  link?** Every header result here comes from a model with no tools, so "a pointer invites
  speculation" is a property of THIS HARNESS, not of the header. A coding agent in an IDE
  resolves the URL and reads the page — which is the whole premise of `llms.txt` and of
  shipping documentation at all. Testing it needs a tool-using agent rather than a raw
  completions endpoint, so it is a different rig, not a bigger N. Until then the honest
  scope is: _within a file, a link buys nothing; the inline rule is what works._ Nothing
  here says a link is useless to an agent that can follow it.

---

# Naming vs. contradiction: when guidance is actually needed (2026-08-28)

`exactly-probe.ts`, qwen3.8-27b, N=5, `/no_think`. Asked "is `f('z')` valid?" — validity
rather than return value, because a model cannot be expected to know TJS returns a
`MonadicError`. Exact reading -> no; example reading -> yes.

| arm               | expects | result                         |                                      |
| ----------------- | ------- | ------------------------------ | ------------------------------------ |
| `ts_control`      | no      | **5/5**                        | apparatus                            |
| `exactly_bare`    | no      | **4/5** (0 wrong, 1 no-answer) | `Exactly('a','b')`, no comment       |
| `exactly_comment` | no      | **5/5**                        | + the one-line rule                  |
| `pipe_bare`       | no      | **5/5**                        | `'a' \| 'b'` read as TypeScript      |
| `example_bare`    | yes     | **0/5** (5 wrong)              | `x: 'a'` — the example rule, unaided |

## 1. A good name does the work of a comment — where there is no prior to fight

`Exactly` scores 4/5 cold with **zero wrong answers**; the miss was a no-answer. Compare
`switch`, which was 0/5 with **five confident errors**.

The difference is not difficulty, it is direction. `switch` CONTRADICTS a prior every model
holds; `Exactly` fills a gap with a self-describing word. So the rule is cheaper than
"comment everything":

> **Guidance is needed where we contradict an existing habit, not where we add a well-named
> novelty.**

That is worth applying to `convert`: annotate the constructs whose meaning CHANGED, not
every construct that is unfamiliar.

## 2. The example rule is not inferable. At all

`example_bare` — plain `x: 'a'` in a `.tjs` file — scored **0/5, wrong every time**. Models
read it as TypeScript's literal type: _exactly_ `'a'`. That is the precise opposite of what
TJS means, and it is the language's most central idea.

This is a floor measurement nobody had taken. Types-as-examples is not merely unfamiliar; on
first contact it is read as its own inverse.

## 3. A measured cost for proposal B

Under B (`|` never closes; `Exactly` required), `'a' | 'b'` would mean "any string".

The probe says a model reads `'a' | 'b'` as a closed set **5/5** — which today is also what
TJS means, so they agree. B would make that construct mean the opposite, converting an arm
models currently get RIGHT into one they would get WRONG, with the same confident-error shape
as `switch`.

So the diagnostic B needs is not a migration aid that can later be retired — the misreading
would be permanent, because the prior is permanent. That does not settle the design question
(B's consistency argument stands on its own, and the transition surprise it removes is real),
but the trade is now measured rather than assumed: **B buys internal consistency and pays a
permanent legibility cost on the most familiar spelling in TypeScript.**

---

# `match` vs `switch`: the keyword and the shape have to agree (2026-08-29)

Testing #48's rename against a fixed-`switch`, with a syntax that drops `case`, colons and
implicit blocks: `match x { 'a' { … } 'b' { … } } else { … }`. qwen3.8-27b, N=5, `/no_think`,
same question as the switch probe (_what does `f('a')` return?_ — `1` if arms do not fall
through, `1,2` if they do).

| arm                             | correct | **wrong** | no-answer |
| ------------------------------- | ------- | --------- | --------- |
| `switch`, C syntax, in `.tjs`   | 0/5     | **5**     | 0         |
| `switch`, NEW syntax, in `.tjs` | 0/5     | 0         | **5**     |
| `match`, NEW syntax, in `.tjs`  | **4/5** | **0**     | 1         |

## 1. "If it behaves differently it should look different" is confirmed

Changing the SHAPE eliminated every confident wrong answer — 5 to 0 — in both arms that used
it. That is the failure mode worth caring about: a reader who answers wrongly and is sure.
The familiar C shape produced five of those, every time, because the shape is a promise the
semantics no longer keep.

## 2. But the keyword must agree with the shape

`switch` with the new syntax scored 0/5 by NOT ANSWERING, five times out of five. The model
cannot reconcile "this is `switch`" with "this does not look like `switch`", and stalls. That
is the same paralysis the `tjs_header` arm produced when a language was named but not
explained — a conflict it cannot resolve rather than a gap it can fill.

So the two available honest options are **keep C's shape and C's meaning**, or **change both
the shape and the name**. Keeping the name while changing the shape is the worst of the three
measured — it does not even produce an answer to be wrong about.

## 3. The regex worry did not materialise

The concern that `match` reads as string-matching to a JavaScript developer is reasonable and
is not visible here: **zero wrong answers** on that arm, and nothing in the responses
suggested `String.prototype.match`. N=5 on one model, so this is weak evidence of absence —
but it is not the confident misreading `switch` produces, which is strong evidence of presence.

## 4. The two reading situations are not symmetric, and only one is at risk

- **Code you transpiled.** Under #48 `convert` emits `switch` UNCHANGED with C semantics, so
  transpiled output is never misread. The rename removes this case entirely.
- **`.tjs` handed to you.** This is the case measured above, and the only one where the
  reader must know which language they are in.

## Caveats

N=5, one model, one program shape. The no-answer counts are high across every arm, so the
instrument is noisier here than on the original switch probe — treat the 4/5 as "does not
produce confident errors" rather than as a precise rate. What is robust across both probes,
now nine arms, is the direction: **the C shape reliably produces confident wrong answers in
`.tjs`, and changing the shape reliably stops that.**

## Keyword candidates, and why the score is not the whole decision (2026-08-29)

Same program, same question, only the keyword varying. qwen3.8-27b, N=5.

| keyword                            | correct | **wrong** | no-answer |
| ---------------------------------- | ------- | --------- | --------- |
| `match`                            | 4/5     | **0**     | 1         |
| `when`                             | 3/5     | **0**     | 2         |
| `given`                            | 1/5     | **0**     | 4         |
| `switch` (C syntax, for reference) | 0/5     | **5**     | 0         |

**Every new keyword produced ZERO wrong answers.** They differ only in willingness to commit.
So the ranking measures how much prior a word recruits, not whether the construct is
legible — and the two failure modes are not equivalent:

- A **wrong** answer is a model writing broken code with confidence. It does not self-correct.
- A **no answer** is a model declining to guess about a word it has never seen. That resolves
  the moment documentation, a cheat sheet, or one example exists — and A2 already measured
  that guidance takes comprehension from 0% to 67%.

Read that way, `given`'s 1/5 is _hesitation about an unfamiliar word_, which is the correct
response to an unfamiliar word, while `switch`'s 0/5 is _confident error_, which is the only
outcome that ships bugs. This probe measures COLD reading with zero context, which is the
worst case for a novel keyword and the best case for a familiar one.

## Two arguments that do not depend on the score

**Collision risk, counted in our own source:**

| keyword  | occurrences | as a METHOD call     |
| -------- | ----------- | -------------------- |
| `match`  | 417         | **33** (`.match(…)`) |
| `when`   | 423         | 0                    |
| `given`  | 21          | 0                    |
| `select` | 7           | 0                    |

None are reserved words, so detection must exclude every other use. `match` is by far the
worst, and specifically in the dangerous way — 33 method calls in one codebase.

**Semantics.** This construct compares VALUES with `Eq`. It does not destructure, bind, or
guard. `match` names the thing Rust, Python and Scala do, which is pattern matching, so it
over-promises: a reader arriving with that prior expects capabilities we do not have. `given`
promises what we deliver.

**RETRACTED 2026-08-29 — the ranking above is noise.** The identical `given` arm re-ran at
**4/5** having scored **1/5**: a swing of three in a sample of five, same model, same prompt.

What the re-run establishes is a property of the INSTRUMENT rather than of the keywords:
**correctness is stable, willingness to commit is not.** Every candidate produced zero wrong
answers in every run; only the no-answer count moved, and it moved a lot. A probe scored as
"correct out of N" therefore mixes a stable signal with a noisy one, and the two columns must
be read separately — the no-answer column needs a far larger N before it means anything.

No ranking among `match` / `when` / `given` survives, so the keyword decision falls to the
structural arguments below. **The score should be re-taken once a cheat sheet exists**, because the no-answer mode is exactly
what guidance fixes — and the collision and over-promise problems are not fixable at all.
