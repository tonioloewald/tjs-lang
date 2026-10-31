<!--{"hidden": true}-->

# Probe: is `name: Type = default` read and written the way it means? (#3596)

**Run 2026-10-31.** `experiments/agent-legibility/typed-default-probe.ts`, five samples per arm.

The spelling is TypeScript's, so the bet was least surprise. The one place a reader could go
wrong is that TJS *checks* the type at runtime: someone importing the JavaScript prior would say
`grant('maybe')` returns `'maybe'`. The writer question is whether a model reaches for the
spelling unprompted when a spec asks for a constrained, defaulted parameter.

## Read

| arm              | gemma-4-e2b (correct / WRONG) | qwen3.8-27b (correct / WRONG) |
| ---------------- | ----------------------------- | ----------------------------- |
| js-control       | 5/5 / 0                       | 5/5 / 0                       |
| tjs-untyped      | 5/5 / 0                       | 5/5 / 0                       |
| tjs-typed        | 5/5 / 0                       | 5/5 / 0                       |
| tjs-typed-dflt   | 5/5 / 0                       | 5/5 / 0                       |

Controls clean on both models. No confident wrong answer on any arm. The read side holds.

## Write

Spec: `setTheme(theme)` must be `'light'` or `'dark'`, defaulting to `'light'`. Scored by
transpiling the answer and calling it (`()` → `'light'`, `('dark')` → `'dark'`,
`('blue')` → an error).

| model       | compiles | behaves | used `theme: T = d` |
| ----------- | -------- | ------- | ------------------- |
| gemma-4-e2b | 5/5      | 0/5     | 1/5                 |
| qwen3.8-27b | 4/5      | 4/5     | 5/5                 |

- **qwen**: every answer used `theme: 'light' | 'dark' = 'light'`, and every one that came back
  as code behaved. The non-compiling sample was a reasoning trace returned in place of code
  (the `reasoning_content` fallback), a harness artifact, not a language one.
- **gemma**: wrote `theme = 'light'` (four times) or `theme: string = 'light'` (once). All
  compile and run; none rejects `'blue'`, because none expresses the constraint at all. The
  small model doesn't reach for a literal union; it isn't misreading the syntax. Its one typed
  answer used the form correctly (TS-style `string`, which `TYPE_NAMES` resolves).

## Verdict

Ship as designed. Nothing was misread, and the form is what a capable model writes unprompted.
The small model's write failure is "didn't encode the constraint", the same thing it would do
in TypeScript, so it is not evidence against this spelling. Not a study: two models, N=5.
