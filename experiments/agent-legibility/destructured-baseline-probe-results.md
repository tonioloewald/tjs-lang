# Probe: is JavaScript's own destructured-default behaviour misread?

**Run 2026-08-31.** `experiments/agent-legibility/destructured-baseline-probe.ts`,
qwen3.8-27b, five samples per cell.

The first probe asked whether TJS could _infer_ "all members defaulted ⇒ object optional".
It could not — 4/5 confidently wrong. Its controls were not clean either, and that was written
off as instrument noise. **That was the wrong call.** If the JavaScript baseline is itself
unreliable, "TJS diverges from JS" is a much weaker objection: you cannot lose a clarity that
was never there. `new Boolean(false)` being truthy is the canonical case, which is why
`guides/footguns.md` exists at all.

So this probe treats JavaScript as an **arm**, not a control, and asks two questions.

## Result

| arm                     | question  | correct | **wrong** | no-answer | expected |
| ----------------------- | --------- | ------- | --------- | --------- | -------- |
| js-plain                | arity     | 4/5     | 0         | 1         | no       |
| js-plain                | fill      | 5/5     | 0         | 0         | 2        |
| **js-default** (`= {}`) | **arity** | 3/5     | **2**     | 0         | yes      |
| js-default              | fill      | 5/5     | 0         | 0         | 2        |
| ts-plain                | arity     | 3/5     | 0         | 2         | no       |
| ts-plain                | fill      | 5/5     | 0         | 0         | 2        |
| **tjs-marked** (`{…}?`) | **arity** | 0/5     | **0**     | 5         | yes      |
| tjs-marked              | fill      | 5/5     | 0         | 0         | 2        |

- **arity** — "can `f()` be called with no arguments?"
- **fill** — "inside `f({ a: 5 })`, what is `b`?"

## Findings

**1. Nobody is confused about the fill. Everybody is confused about the arity.**
`fill` is **5/5 on every arm, in every language, including TJS**. The partial-payload
semantics — `f({a: 5})` gives `b === 2` — are understood perfectly. The entire difficulty is
whether the object parameter may be omitted.

**2. JavaScript's own idiom is the WORST arm on the metric that matters.**
`function f({ a = 1, b = 2 } = {})` — textbook, idiomatic, correct JavaScript — drew **two
confident wrong answers**, the only arm in the study to do so. `= {}` is not a clear signal;
it is a quiet one that reads as decoration.

**3. The explicit TJS mark never misleads.** `{…}?` produced **zero** wrong answers across
both questions. Five no-answers on arity: the model will not commit on a mark it has never
seen. That is the `given` result again — a novel shape moves the cost from _wrong_ to
_needs documentation_.

## What this changes

The first probe's conclusion ("do not infer it") stands and is now better supported: an
inferred rule scored 4/5 wrong. But the framing around the explicit mark was wrong. It is not
a regression from a clear baseline — **the baseline is not clear**. On the only column that
ships bugs, `{…}?` (0 wrong) beats JavaScript's `= {}` (2 wrong).

## Caveats

One model, five samples, one construct. The `arity` question is plainly harder than `fill`
for everything, which is itself worth noting: a difference that large between two questions
about the same three lines suggests the difficulty is in the CONSTRUCT, not the notation.

A model is also not a person. What this measures is whether a careful reader with enormous
JavaScript exposure predicts the behaviour — which is the relevant proxy for "will this
mislead someone", but not the same as asking working programmers.
