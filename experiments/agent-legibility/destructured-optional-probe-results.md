# Probe: is "all members defaulted ⇒ object optional" safe to infer?

**Run 2026-08-31.** `experiments/agent-legibility/destructured-optional-probe.ts`.

Question: in native `.tjs`, may `f({ a = 1, b = 2 })` be called as `f()`? Today it throws,
exactly as JavaScript does. The proposal was to infer optionality when every member has a
default; the alternative is an explicit mark, `f({ a = 1, b = 2 }?)`.

## Result

One question ("calling `f()` — does it work or throw?"), five samples per arm.

### gemma-4-e2b — inconclusive, controls dirty

| arm                    | correct | wrong | no-answer |
| ---------------------- | ------- | ----- | --------- |
| js-plain _(control)_   | 3/5     | 2     | 0         |
| js-default _(control)_ | 5/5     | 0     | 0         |
| tjs-plain              | 2/5     | 3     | 0         |
| tjs-marked             | 1/5     | 4     | 0         |

The control failed: the model got **plain JavaScript** wrong 2/5. The arms therefore carry no
weight, and the run is reported only because a discarded arm is still evidence about the
instrument. Re-ran on a stronger model.

### qwen3.8-27b — the finding

| arm                           | correct | **wrong** | no-answer |
| ----------------------------- | ------- | --------- | --------- |
| js-plain _(control)_          | 4/5     | 1         | 0         |
| js-default _(control)_        | 5/5     | 0         | 0         |
| **tjs-plain** — inferred rule | 0/5     | **4**     | 1         |
| **tjs-marked** — `{…}?`       | 0/5     | **0**     | 5         |

## Reading

Fixed before the run, from `docs/case-study-switch.md` §7: **correctness is stable,
willingness to commit is not.** So the wrong column is the one that decides, and the
no-answer column needs a much larger N before it means anything.

- **The inferred rule reads confidently wrong, 4/5.** Its shape is JavaScript's, so the reader
  applies JavaScript's rule. This is the same result the `switch` probe got (0/5 correct, 5/5
  confidently wrong) on the same mechanism: identical shape, changed meaning.
- **The explicit `?` produces zero wrong answers.** Five no-answers — the model will not commit
  on a mark it has never seen. That is the `given` result too: any new shape removed every
  confident wrong answer and moved the cost to "needs documentation".

Neither arm scored a single _correct_ answer, and that is not the interesting part. A
no-answer costs a lookup; a confident wrong answer ships a bug.

## Caveat

**The control is not clean.** `js-plain` scored 4/5 — the instrument is ~80% reliable on a
question it should get right every time, so treat the magnitudes as soft. The direction is
what carries: 4 wrong versus 0 wrong is a large gap, in the same direction as an independent
prior replication. One small-ish model and five samples is a spike, not a study.

## Decision

Do **not** infer optionality from "all members defaulted". If the feature is wanted, spell it
`f({ a = 1, b = 2 }?)`.

`?` and not `!`: `!` already means _skip validation_ at the head of a parameter list
(`function f(! a: 0)`), so `f({…}!)` would put the same character with near-opposite meanings
inside one parameter list — the C `*`/`^` problem, concretely. `?` already means _optional_ on
`name?:`, so the tail mark reads consistently with what exists.

No second marker is needed: absence already means required, which is both the current
behaviour and JavaScript's.
