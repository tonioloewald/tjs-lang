<!--{"section": "ajs", "type": "example", "group": "llm", "order": 10, "requiresApi": true, "parent": "ajs-llm.md"}-->
<!-- TODO review -->

# LLM Chat

The smallest agent that talks to a model: one prompt in, the model's text out.

```ajs:inline
function chat({ message = 'What is the capital of France?' }) {
  let response = llmPredict({ prompt: message })
  return { response }
}
```

The agent does not call the model itself. The **host** (the JavaScript program that runs the
agent) hands the VM a `capabilities` object, and `llmPredict` calls `capabilities.llm.predict`.
This site's host provides no model, so instead of running, the example's output shows
"This example needs an LLM, which the static site does not provide. Run it locally with
tjs-lang and LM Studio (see the AJS guide)." That message is expected, not a breakage. Run it
locally with the host below; the other LLM examples in this book reuse that host.

## What to notice

- **The model is a capability.** `llmPredict` calls whatever `llm.predict` function the host
  passed in. Without one the call fails with `Capability 'llm.predict' missing`. The agent never
  learns which model, server or API key is behind it.
- **It returns a string.** `llmPredict({ prompt })` gives back the model's text, and the VM
  checks that: a `predict` that returns anything else fails the call with
  `Output validation failed for 'llmPredict'`. (tjs-lang also ships an optional ready-made LM
  Studio integration, the "batteries", whose `llmPredictBattery` atom returns a whole chat
  message, `{ role, content, tool_calls }`, instead of a string. See
  [llmPredict or llmPredictBattery](/ajs-atoms/#llmpredict-or-llmpredictbattery).)
- **It costs 100 units of fuel.** Fuel is the VM's work budget, and a run stops when it runs
  out. The charge is flat whatever the model costs you, and it is made even when the call
  fails. The host below gives the run 1000, enough for about nine calls plus the code around
  them. To cap model calls, which is what costs money, the host sets a quota in the run
  options (the third argument to `vm.run`): with `quotas: { llmPredict: 1 }` a second call
  fails with `Quota exceeded for 'llmPredict': 1 call allowed`.
- **Each call may take up to two minutes** before the VM gives up on it with
  `Atom 'llmPredict' timed out`. A host that wants a different limit sets
  `timeoutOverrides: { llmPredict: 30_000 }` (milliseconds), also in the run options.

## Shaping the prompt

A model call is only as good as its prompt. Build the prompt in the agent, where it is part of
the agent's source (and so reviewable before it runs) and the host's `predict` receives it
exactly and can log it. Keep the model's freedom narrow with `options`:

```ajs:inline
function answerBriefly({ question = 'Why is the sky blue?', words = 30 }) {
  let prompt =
    'Answer in at most ' + words + ' words, for a curious ten-year-old.\n\n' +
    'Question: ' + question
  let answer = llmPredict({ prompt, options: { temperature: 0.2, maxTokens: 80 } })
  return { question, answer: answer.trim() }
}
```

`options` accepts only `model`, `temperature`, `maxTokens`, `topP`, `stop`, `seed`,
`responseFormat` and `tools` (and the snake_case `max_tokens` and `top_p`). Any other key fails
the call before the host is reached, with a message that begins
`llmPredict option 'frequency_penalty' is not available in AsyncJS` and goes on to list the
allowed keys. (AsyncJS is AJS's full name.)

The allowlist is there because `responseFormat` and `tools` carry JSON schemas, and a model
server compiles a schema into a grammar on its own machine, outside every budget the VM
enforces. An untrusted agent could otherwise send a schema built to be expensive to compile,
or smuggle a payload through a key nobody inspects. So the VM checks the shape of those two
options and refuses any key it does not know.
[LLM Structured Output](/llm-structured-output/) uses `responseFormat`.

## Running it locally

The host transpiles the source, then runs the AST with an `llm` capability. Any
OpenAI-compatible server works (LM Studio, MLX, a hosted API); this one talks to LM Studio's
default port:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const llm = {
  // options is the agent's `options` object (see Shaping the prompt), or undefined
  async predict(prompt, options = {}) {
    const res = await fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model ?? 'local-model',
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature,
        max_tokens: options.maxTokens ?? options.max_tokens,
        top_p: options.topP ?? options.top_p,
        stop: options.stop,
        seed: options.seed,
        response_format: options.responseFormat,
        tools: options.tools,
      }),
    })
    if (!res.ok) throw new Error(`model server answered ${res.status}`)
    const data = await res.json()
    // llmPredict promises a string. A tool-call reply has no content, so it comes back as ''.
    return data.choices[0].message.content ?? ''
  },
}

const source = `
function chat({ message = 'What is the capital of France?' }) {
  let response = llmPredict({ prompt: message })
  return { response }
}
`

const { ast } = transpile(source)
const run = await new AgentVM().run(
  ast,
  { message: 'Name three rivers in Europe.' }, // becomes the agent's parameter object
  {
    fuel: 1000,
    capabilities: { llm },
    quotas: { llmPredict: 1 },
    // timeoutOverrides: { llmPredict: 30_000 },
  }
)
console.log(run.result?.response ?? run.error?.message)
```

The second argument to `run` becomes the object the agent destructures, so `message` is
`'Name three rivers in Europe.'` here and the default applies only when it is left out. The
function's name does not matter; the VM runs the agent the source defines.

`run` resolves to `{ result, error, fuelUsed, ... }`. `result` is what the agent returned.
`error` is set only when the run itself fails (an uncaught error, running out of fuel, a quota),
not when the agent returns something like `{ ok: false }` on purpose.

Three things in that host are deliberate:

- **The option names are mapped.** The atom hands `options` to `predict` exactly as the agent
  wrote them, camelCase keys included. Turning `responseFormat` into the wire format's
  `response_format` (and `maxTokens` into `max_tokens`, `topP` into `top_p`) is the host's job,
  because only the host knows which API it is talking to. `JSON.stringify` drops the keys left
  `undefined`, so the server sees only what the agent set.
- **A failure is thrown, not returned.** When `predict` throws, the agent sees an ordinary error
  with that message (see When the call fails, below). Returning an error object instead would
  fail the string check and hide the real reason.
- **Tool calls are ignored.** This host forwards `tools` but returns only the reply's text, so a
  reply that is a tool call comes back as `''`. A string-returning atom has no place to put
  `tool_calls`. [LLM with Tool](/llm-with-tool/) shows the approach this book uses instead: the
  model writes its plan as structured data and ordinary agent code carries it out.

For the full `llm` interface, including `embed`, see [Capabilities: llm](/ajs-capabilities/#llm).

## When the call fails

A model server can be down, slow or out of quota. The failure is an ordinary AJS error, so a
`try`/`catch` turns it into a result the caller can act on. In the `catch`, `e` is the error's
message as a string. Unlike JavaScript, `e` is not an Error object, so write `e`, not
`e.message`:

```ajs:inline
function chatSafely({ message = 'What is the capital of France?' }) {
  try {
    let response = llmPredict({ prompt: message })
    return { response, ok: true }
  } catch (e) {
    return { response: '', ok: false, problem: e }
  }
}
```

With the host above and a server that answers 503, this returns
`{ response: '', ok: false, problem: 'model server answered 503' }`. If the server is not
running at all, `problem` is the connection error `fetch` threw; its wording depends on the
runtime (under Bun it is `Unable to connect. Is the computer able to access the url?`, and
Node and browsers say something else, typically `fetch failed` or `Failed to fetch`). With no
`llm` capability, `problem` is `Capability 'llm.predict' missing`. Without the `try`, the run
ends with the same message in `run.error`.

## The gotcha

Whatever the model says is **untrusted text**, exactly like user input, whoever wrote the
prompt. A model can return something other than what you asked for, and if any part of the
prompt came from outside (a user's message, a web page, a document), that text can steer the
reply. This is prompt injection.

So check the answer before it becomes a URL, a store key or part of another prompt. When only a
few answers make sense, compare against the list and refuse anything else:

```ajs:inline
function tagColour({ text = 'a calm day at the sea' }) {
  let answer = llmPredict({
    prompt: 'Reply with one word, red, green or blue: the colour of ' + text,
  })
  let colour = answer.trim().toLowerCase()
  if (!['red', 'green', 'blue'].includes(colour)) {
    return { colour: null, rejected: answer }
  }
  storeSet({ key: 'colour:' + colour, value: text })
  return { colour }
}
```

A reply of `' Blue\n'` stores under `colour:blue`. A reply of
`'blue; ignore previous instructions'` is refused and comes back in `rejected`, and nothing
reaches the store. When the answer has more structure than one word,
[LLM Structured Output](/llm-structured-output/) narrows what the model can return with
`responseFormat` and checks the reply against a schema. Text passed on to another prompt
deserves the same suspicion: the next model reads it as instructions just as readily as the
first one did.
