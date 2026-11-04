<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 14, "requiresApi": true, "parent": "ajs-advanced.md"}-->

# LLM with Tool

LLM uses a calculator tool (requires llm capability)

<!-- TODO review -->
Models are bad at arithmetic and good at reading. So let the model read the question and write
down the calculation as data, let ordinary code (the "tool") do the arithmetic exactly, and let the
model phrase the answer. It needs an LLM, so on this site it prints a message instead of running;
run it locally with the host from [LLM Chat](/llm-chat/).

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
    return acc / value
  }
  Error('unknown operator')
}

function mathAssistant({ question = 'What is 23 * 47 + 156?' }) {
  // 1. The model turns the question into a plan, as data.
  let schema = Schema.response(
    'calculation',
    Schema.object({
      start: Schema.number,
      steps: Schema.array(
        Schema.object({
          op: Schema.enum(['+', '-', '*', '/']),
          value: Schema.number,
        })
      ),
    })
  )
  let planPrompt =
    'Turn this question into a calculation: the first number as start, then each ' +
    'operation in the order it must be applied (respect precedence).\nQuestion: ' +
    question
  let planText = llmPredict({
    prompt: planPrompt,
    options: { responseFormat: schema },
  })
  let plan = JSON.parse(planText)

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

<!-- TODO review -->
## What to notice

- **The tool is a helper function.** Functions declared before the entry function are helpers
  the agent calls by name. They see only their own parameters, may return any value, and run
  under the same fuel budget.
- **The model never does arithmetic.** It produces a plan in a declared shape (`Schema.response`
  with `Schema.enum` limiting the operators); the plan is data the program can check, log, or
  refuse. `23 * 47 + 156` becomes `start: 23`, then `* 47`, then `+ 156`, and the code computes
  1237.
- **`Schema.number`, not an example.** A schema built from the example `{ value: 0 }` would
  demand an integer. The plan may contain `2.5`, so the schema is written out.

<!-- TODO review -->
## Why not native tool calling?

OpenAI-style tool calling (the model answering with `tool_calls`) needs the full chat message
back, and `llmPredict` returns only text. The battery atom `llmPredictBattery` returns the whole
message, `tool_calls` included, when the host provides the batteries. The pattern here works with
any model that can follow a schema, and keeps the decision of what runs in your code.

<!-- TODO review -->
## The gotcha

The plan comes from a model, so it can be wrong in ways a schema cannot catch: the right
operators in the wrong order, a number misread from the question. The program is exact about
the plan it was given, not about the question. For anything that matters, show the plan
alongside the answer, as this agent does.
