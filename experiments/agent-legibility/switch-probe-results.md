# `switch` comprehension probe — results log

Appended by `switch-probe.ts`. **The value of this file is the SERIES**, not any one run:
a single N=5 spike is suggestive, several across models and dates is evidence.

Each run answers: shown a `switch` and told only the file extension, does a model apply
C fallthrough or TJS's implicit `break`? And does a comment change that?

- **`correct`** — matched the semantics its file extension implies
- **`applied-other-rule`** — gave the _other_ language's answer. The diagnostic column:
  this is confident misreading, not confusion
- **`no-answer`** — the model returned no `content` (reasoning models), or the call failed.
  Kept separate because scoring it as wrong would invent a finding

Reproduce: `PROBE_STAMP=$(date +%F) bun experiments/agent-legibility/switch-probe.ts`
Env: `TJS_LLM_MODEL`, `PROBE_SAMPLES`, `PROBE_TIMEOUT_MS`, `TJS_LLM_BASE_URL`.

## Arms

| arm               | what it isolates                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `c_control`       | positive control — explicit `break`, read as `.js`. If this is not ~100%, ignore the rest |
| `tjs_bare`        | the shipping default: no `break`, read as `.tjs`                                          |
| `tjs_rule`        | + a one-line comment stating the rule                                                     |
| `tjs_header`      | + a file header NAMING tjs, stating no rule                                               |
| `tjs_header_rule` | + both — what `convert` would emit                                                        |
| `tjs_multi`       | `case 'a', 'b':` — the construct with no JS precedent                                     |
| `tjs_multi_rule`  | + a comment explaining multi-value                                                        |

`tjs_multi` asks about `f('b')`, deliberately: `case 'a', 'b':` is valid JS (a
SequenceExpression evaluating to `'b'`), so both readings give a real non-empty answer —
TJS `1`, JS `1,2`. An earlier version asked `f('a')`, where the JS answer is the empty
string, indistinguishable from "no answer" by this harness.

---

## 2026-08-26 — qwen/qwen3.8-27b, N=5 (thinking mode; partial)

The first run. `tjs_multi` unmeasured — the model emitted 7,277 chars of `reasoning_content`
and never filled `content`, exhausting a 2,000-token budget.

| arm           | expects | correct      | applied-other-rule |
| ------------- | ------- | ------------ | ------------------ |
| `c_control`   | `1`     | **5/5**      | 0                  |
| `c_fallthru`  | `1,2`   | **5/5**      | 0                  |
| `tjs_bare`    | `1`     | **0/5**      | 5                  |
| `tjs_rule`    | `1`     | **5/5**      | 0                  |
| `tjs_example` | `1`     | **5/5**      | 0                  |
| `tjs_multi`   | —       | _unmeasured_ | —                  |

**Read:** the extension carries nothing (0/5, all five confidently applying C fallthrough,
while both controls are 100%). A one-line comment restores it to 5/5. Prose rule and worked
example both saturate, so this run cannot rank them.

## 2026-08-27 — google/gemma-4-e4b, N=5

| arm               | call     | expects | correct | applied-other-rule | no-answer | other |
| ----------------- | -------- | ------- | ------- | ------------------ | --------- | ----- |
| `c_control`       | `f('a')` | `1`     | **5/5** | 0                  | 0         | —     |
| `tjs_bare`        | `f('a')` | `1`     | **0/5** | 5                  | 0         | —     |
| `tjs_rule`        | `f('a')` | `1`     | **0/5** | 5                  | 0         | —     |
| `tjs_header`      | `f('a')` | `1`     | **0/5** | 5                  | 0         | —     |
| `tjs_header_rule` | `f('a')` | `1`     | **0/5** | 5                  | 0         | —     |
| `tjs_multi`       | `f('b')` | `1`     | **0/5** | 5                  | 0         | —     |
| `tjs_multi_rule`  | `f('b')` | `1`     | **0/5** | 5                  | 0         | —     |

## 2026-08-27 — qwen/qwen3.8-27b, N=5

| arm               | call     | expects | correct | applied-other-rule | no-answer | other |
| ----------------- | -------- | ------- | ------- | ------------------ | --------- | ----- |
| `c_control`       | `f('a')` | `1`     | **5/5** | 0                  | 0         | —     |
| `tjs_bare`        | `f('a')` | `1`     | **0/5** | 5                  | 0         | —     |
| `tjs_rule`        | `f('a')` | `1`     | **5/5** | 0                  | 0         | —     |
| `tjs_header`      | `f('a')` | `1`     | **0/5** | 0                  | 5         | —     |
| `tjs_header_rule` | `f('a')` | `1`     | **5/5** | 0                  | 0         | —     |
| `tjs_multi`       | `f('b')` | `1`     | **0/5** | 0                  | 5         | —     |
| `tjs_multi_rule`  | `f('b')` | `1`     | **5/5** | 0                  | 0         | —     |
