<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 14, "requiresApi": true, "parent": "ajs-advanced.md"}-->
<!-- TODO review -->

# LLM with Tool

Models are bad at arithmetic and good at reading. So let the model read the question and write
down the calculation as data, let ordinary code (the "tool") do the arithmetic exactly, and let the
model phrase the answer. This is not OpenAI-style tool calling, where the model picks which tool
runs; here the program decides. [Why not native tool calling?](#why-not-native-tool-calling)
explains the trade.

The agent runs inside a host: the JavaScript program that transpiles it, supplies the `llm`
capability (the function that actually talks to a model) and calls
`vm.run(ast, args, { capabilities, fuel })`. Every operation costs fuel, and the run stops when
the fuel runs out. [LLM Chat](/llm-chat/#running-it-locally) has a complete host for a local
model server; [Embedding the AJS VM](/ajs-host/) covers the host side in full.

On this page the first example shows a "requires an LLM" message instead of running, because a
static page has no model to call. The `try` example further down needs no model and runs here.

```ajs:inline
// The tool: exact arithmetic, in code the host can read and the VM meters.
function applyOp(acc, op, value) {
  if (op == '+') {
    return acc + value
  }
  if (op == '-') {
    return acc - value
  }
  if (op == '*') {
    return acc * value
  }
  if (op == '/') {
    if (value == 0) {
      Error('division by zero') // ends the run, like a throw; see "When the tool refuses"
    }
    return acc / value
  }
  Error('unknown operator')
}

function mathAssistant({ question = 'What is 23 * 47 + 156?' }) {
  // 1. The model turns the question into a plan, as data.
  let calculation = Schema.object({
    start: Schema.number,
    steps: Schema.array(
      Schema.object({
        op: Schema.enum(['+', '-', '*', '/']),
        value: Schema.number,
      })
    ),
  })
  let planPrompt =
    'Turn this question into a calculation: the first number as start, then each ' +
    'operation in the order it must be applied (respect precedence).\nQuestion: ' +
    question
  let planText = llmPredict({
    prompt: planPrompt,
    options: { responseFormat: Schema.response('calculation', calculation) },
  })
  let plan = JSON.parse(planText)
  if (!Schema.isValid(plan, calculation)) {
    Error('the model returned a plan in the wrong shape')
  }

  // 2. The tool does the arithmetic.
  let result = plan.start
  for (const step of plan.steps) {
    result = applyOp(result, step.op, step.value)
  }

  // 3. The model phrases the answer around a number it did not compute.
  let answerPrompt =
    'The user asked: "' +
    question +
    '"\nThe exact result is: ' +
    result +
    '\nWrite a brief, friendly answer that states this result.'
  let answer = llmPredict({ prompt: answerPrompt })

  return { question, plan, result, answer }
}
```

The plan is a chain of operations applied left to right. That is a deliberate simplification:
it keeps the schema small, and it fits questions like this one. [The gotcha](#the-gotcha) shows
where it stops fitting.

## What to notice

- **The tool is a helper function.** A source file may declare several functions; the last one
  is the entry function, which the host calls with the run's arguments (here `mathAssistant`,
  and in the `try` example below, `tryStep`). The functions before it are helpers, called by
  name. A helper sees only its own parameters, never the caller's variables, so pass it
  everything it needs. It may return any value, and it runs under the same fuel budget.
- **A helper call stands alone.** It must be a statement of its own, as in
  `result = applyOp(...)`. Writing it inside a larger expression, such as
  `return { r: applyOp(...) }` or `1 + applyOp(...)`, fails at transpile time; assign the
  result to a variable first, then use the variable.
- **The model never does arithmetic.** It produces a plan in a declared shape, with
  `Schema.enum` limiting the operators. `23 * 47 + 156` becomes `start: 23`, then `* 47`, then
  `+ 156`, and the code computes 1237.
- **The response format asks the server for that shape.** `Schema.response(name, schema)` builds
  an OpenAI-style structured-output request, `{ type: 'json_schema', json_schema: { name,
  strict, schema } }`; the name is a label the server requires. The agent passes it as
  `responseFormat`, and the host turns that into the wire format's `response_format`.
- **The plan is checked before it runs.** A response format is a request to the model server, not
  a guarantee, so the agent checks the parsed plan with `Schema.isValid` against the same schema.
  A plan with `"%"` as an operator, or `"2"` (a string) as a value, stops the run there, after
  one model call. If the model's text is not JSON at all, `JSON.parse` ends the run with a parse
  error before the check is reached; wrap it in `try` to handle that case yourself.
- **`Schema.number`, not an example value.** `Schema.object` also accepts example values in place
  of schemas, as in `Schema.object({ value: 0 })`, but an example `0` means an integer, so that
  schema rejects `2.5`. A plan may contain `2.5`, so the field is written as `Schema.number`.
- **The model calls are the cost.** `llmPredict` costs 100 fuel per call by default (a host can
  change that with `costOverrides: { llmPredict: … }`), and everything else here costs about 6,
  so a run takes about 206 fuel. A budget of 500 leaves room. To cap model calls, which is what
  costs money, the host sets `quotas: { llmPredict: 2 }`.

The host side of a run looks like this, with `llm` as in [LLM Chat](/llm-chat/#running-it-locally):

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const { ast } = transpile(source) // source: the agent above, as a string
const run = await new AgentVM().run(
  ast,
  { question: 'What is 12.5 * 4 - 7?' },
  { fuel: 500, quotas: { llmPredict: 2 }, capabilities: { llm } }
)
if (run.error) console.log('failed:', run.error.message, 'fuel used:', run.fuelUsed)
else console.log(run.result.answer, run.result.plan)
```

## When the tool refuses

`applyOp` ends in `Error('unknown operator')`, and `/` by zero raises `Error('division by zero')`.

Why not let the guard divide anyway? Dividing by zero in JavaScript gives `Infinity`, which JSON
cannot express: it would reach the host as `null` in the result.

`Error(...)` does not return: like a `throw`, it puts the program into its error state. Nothing
in the loop or the entry function catches it, so the rest of the program is skipped (the
remaining loop iterations, the second model call and the `return`), and the run ends with that
error. The host sees no `answer`. It reads `run.error.message`, which is `'unknown operator'` or
`'division by zero'`, and `run.fuelUsed`, the fuel spent so far. `run.result` is not empty: it
holds the same error as `{ $error: true, message, op: 'Error' }`, so check `run.error` before
using the result.

With the schema check in place a well-formed plan never reaches the unknown-operator branch. It
stays because the tool should not trust its caller either: a helper that guards its own input is
still correct when someone reuses it.

To recover instead of failing, wrap the call in `try`. The error from the helper propagates to
the caller's `catch`. Unlike JavaScript, the caught value is the message string itself, not an
Error object, so use `err`, not `err.message` (which is `undefined`):

```ajs:inline
function applyOp(acc, op, value) {
  if (op == '+') {
    return acc + value
  }
  Error('unknown operator')
}

function tryStep({ op = '%' }) {
  let result = 0
  try {
    result = applyOp(1, op, 2)
  } catch (err) {
    return { error: err }
  }
  return { result }
}
```

This returns `{ error: 'unknown operator' }`; with `op: '+'` it returns `{ result: 3 }`.

## Why not native tool calling?

In OpenAI-style tool calling the model answers with `tool_calls`, naming which tool to run and
with what arguments, and the program runs it. That needs the model's whole chat message back,
and `llmPredict` returns only its text.

The batteries can do it. They are optional atoms a host registers for a local model server, and
their `llmPredictBattery` returns the whole message, `tool_calls` included (see the
[AJS guide](/DOCS-AJS/)). The difference is who decides: with native calling the model chooses
which tool runs and when; in the pattern here the program fixes the steps, and the model only
fills in data that a schema checks. It also works with any model that can follow a schema,
including ones with no tool-calling support.

## The gotcha

The plan comes from a model, so it can be wrong in ways a schema cannot catch: the right
operators in the wrong order, a number misread from the question. The program is exact about
the plan it was given, not about the question. For anything that matters, show the plan
alongside the answer, as this agent does.

The question is also untrusted text, and it goes straight into both prompts. The schema check
and the exact arithmetic limit what a hostile question can make the code do: it can only produce
a plan of four operators and numbers, run under the host's fuel and quotas. They do nothing for
the phrased `answer`, which is still model output and can say anything.

The plan's shape also limits what it can say. It is a chain applied left to right, so
`23 * 47 + 156` fits directly but `10 - 2 * 3` does not: the product has to come first, so the
chain must be reordered (`start: 2`, then `* 3`, `* -1`, `+ 10`), and a model will not find that
reliably. When it misses, the plan computes something else, exactly. A tree-shaped plan would
lift the limit, but a guest schema cannot refer to itself (there is no `$ref`), so it could
describe only a fixed depth. Keep the questions to ones a chain can express, or show the plan.
