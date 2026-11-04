<!--{"section": "ajs", "type": "example", "group": "llm", "order": 10, "requiresApi": true, "parent": "ajs-llm.md"}-->

# LLM Chat

Chat with AI (requires llm capability)

<!-- TODO review -->
The smallest agent that talks to a model: one prompt in, the model's text out. On this site it
prints a message instead of running, because a static page has no model to call. Run it
locally with a host that provides one (below).

```ajs:inline
function chat({ message = 'What is the capital of France?' }) {
  // Requires llm.predict capability to be configured
  let response = llmPredict({ prompt: message })
  return { response }
}
```

<!-- TODO review -->
## What to notice

- **The model is a capability.** `llmPredict` calls whatever `llm.predict` function the host
  injected. Without one the call fails with `Capability 'llm.predict' missing`. The agent never
  learns which model, server or API key is behind it.
- **It returns a string.** `llmPredict({ prompt })` gives back the model's text. (The battery atom
  `llmPredictBattery` returns a whole chat message instead; see the [AJS guide](/DOCS-AJS/).)
- **It costs 100 units of fuel**, a flat charge whatever the model costs you. To cap what a
  model call costs in money, the host sets a quota: `quotas: { llmPredict: 3 }`.

<!-- TODO review -->
## Running it locally

The host transpiles the source, then runs the AST with an `llm` capability. Any
OpenAI-compatible server works (LM Studio, MLX, a hosted API); this one talks to LM Studio's
default port:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const llm = {
  async predict(prompt, options = {}) {
    const res = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model ?? 'local-model',
        messages: [{ role: 'user', content: prompt }],
        response_format: options.responseFormat,
      }),
    })
    const data = await res.json()
    return data.choices[0].message.content // a string, as llmPredict promises
  },
}

const { ast } = transpile(source) // source: the agent above
const run = await new AgentVM().run(
  ast,
  { message: 'Name three rivers in Europe.' },
  { fuel: 1000, capabilities: { llm }, quotas: { llmPredict: 1 } }
)
console.log(run.result?.response ?? run.error?.message)
```

The other LLM examples in this book use the same host.

<!-- TODO review -->
## A variation

A model call is only as good as its prompt. Build the prompt in the agent, where the host can
audit it, and keep the model's freedom narrow:

```javascript
function answerBriefly({ question = 'Why is the sky blue?', words = 30 }) {
  let prompt =
    'Answer in at most ' + words + ' words, for a curious ten-year-old.\n\n' +
    'Question: ' + question
  let answer = llmPredict({ prompt, options: { temperature: 0.2 } })
  return { question, answer: answer.trim() }
}
```

`options` accepts only `model`, `temperature`, `maxTokens`, `topP`, `stop`, `seed`,
`responseFormat` and `tools` (and the snake_case `max_tokens` and `top_p`); anything else is
refused.

<!-- TODO review -->
## The gotcha

Whatever the model says is **untrusted text**, exactly like user input. If the answer goes into a
URL, a store key or another prompt, treat it as you would a form field.
