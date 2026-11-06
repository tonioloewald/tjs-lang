<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 15, "requiresApi": true, "parent": "ajs-advanced.md"}-->
<!-- TODO review -->

# Multi-Agent Pipeline

Split a job into roles (a researcher, a writer, an editor), each with its own instructions, and
pass each one's output to the next. Narrow prompts are easier for a model to follow and easier
for you to debug.

The agent needs a model, which the **host** supplies: the host is the JavaScript program that
runs the agent in an `AgentVM` and decides what it may touch. On this site there is no model, so
the example prints a message instead of running. To run it yourself, use the scripted model in
[Testing it without a model](#testing-it-without-a-model) below, or a real one as in
[LLM Chat](/llm-chat/).

```ajs:inline
function collaborativeWriting({ topic = 'the future of renewable energy' }) {
  // Role 1: researcher. A short, checkable list, not an essay.
  let researchPrompt =
    'You are a research agent. Generate 3 key facts or points about: ' +
    topic +
    '\nFormat as a numbered list. Be concise.'
  let research = llmPredict({ prompt: researchPrompt })

  // Role 2: writer. Works only from the researcher's points.
  let writerPrompt =
    'You are a writer agent. Using these research points:\n\n' +
    research +
    '\n\nWrite a short, engaging paragraph (2-3 sentences) about ' +
    topic +
    '.\nMake it informative and accessible.'
  let article = llmPredict({ prompt: writerPrompt })

  // Role 3: editor. Reviews the draft and rewrites it.
  let editorPrompt =
    'You are an editor agent. Review this draft:\n\n"' +
    article +
    '"\n\nSuggest one specific improvement. Then provide the improved version.\nFormat: "Suggestion: [your suggestion]\n\nImproved: [improved text]"'
  let edited = llmPredict({ prompt: editorPrompt })

  return {
    topic,
    researchPoints: research,
    firstDraft: article,
    editorReply: edited,
  }
}
```

`llmPredict({ prompt })` calls the host's `capabilities.llm.predict(prompt)` with the prompt
string and returns the model's reply as a string, which is why `research` can be concatenated
straight into the writer's prompt.

## What to notice

- **The roles are prompts, not separate programs.** This is one agent making three model calls in
  sequence; "agent" in the prompts means a role. That is usually what you want: one budget, one
  place to read the whole pipeline, and one trace if you run it with `trace: true`.
- **Each call finishes before the next starts.** AJS has no `await`: atom calls are awaited for
  you, so `research` is the reply, not a Promise, by the time the writer's prompt is built.
- **Every intermediate result is returned.** The host gets the research, the draft and the
  editor's reply, so a bad final answer can be traced to the step that went wrong. The editor's
  reply is returned as the model wrote it, suggestion and improved text together, because the
  model may not follow the requested format exactly; split it on `Improved:` in the host if you
  need the two parts.
- **Each `llmPredict` costs 100 fuel**, so three calls cost 300, plus a little for building the
  prompts. A run with less stops partway through with `Out of Fuel`; the calls before it were
  made (and, with a paid model, paid for), and the call that ran out is refused before it reaches
  the model.
- **Fuel is not money.** Fuel measures work the VM does, so a budget large enough for the string
  work also admits more model calls. To say "at most N model calls" whatever the fuel, set a
  quota: `quotas: { llmPredict: 3 }`.

## The gotcha

Each step feeds the next, so an early mistake compounds: a wrong "fact" from the researcher
becomes confident prose by the editor. Keep the early steps narrow and checkable (a list of
facts, not an essay), and if the result matters, check those facts against a source the agent
fetches with `httpFetch`. The network is a permission too: the host grants it with a `fetch`
capability or a domain allowlist, as in [Weather API](/weather-api/).

## Testing it without a model

The model is a capability the host injects, so a test can inject a scripted one. Each reply here
says which call it was, which is enough to check that every role ran and its output reached the
result. Paste the agent above into the template string:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const source = `function collaborativeWriting(...) { ... }` // the agent above

let calls = 0
const llm = {
  async predict(prompt) {
    calls++
    return `reply ${calls} (${prompt.length} chars in)`
  },
}

const { ast } = transpile(source)
const run = await new AgentVM().run(ast, {}, { fuel: 1000, capabilities: { llm } })
console.log(run.result.firstDraft) // "reply 2 (… chars in)": the writer's call
console.log(run.fuelUsed) // a little over 300: three calls plus the string work
```

`vm.run` resolves to `{ result, error, fuelUsed, … }`; it does not throw. When a run fails, the
error is all you get back: the earlier replies are not in `result`. Run with `trace: true` to see
each step, its result and the fuel it used, including the steps before the failure.

The failures, with the same scripted model:

- `fuel: 250`: `run.error.message` is `'Out of Fuel'` from the third `llmPredict`, after two
  calls to the model. `run.fuelUsed` reports about 301, more than the budget, because the refused
  call's cost is still counted.
- `quotas: { llmPredict: 2 }`: the third call fails with
  `Quota exceeded for 'llmPredict': 2 calls allowed`, whatever the fuel.
- No `llm` capability: the first call fails with `Capability 'llm.predict' missing`.

## Separate agents

When the roles really are separate programs (written by different people, stored, reused), one
agent can run another with `agentRun({ agentId, input })`. Passing the sub-agent's AST keeps it
on this run's fuel and quotas. Passing a name hands it to the host, which starts a separate run
with its own fuel and its own quota counter, unless the host passes the same `quotaUsed` object
to both. [Composing Agents](/patterns/#composing-agents) shows both routes.

AJS runs steps in sequence by design; there is no parallel fan-out inside an agent. A host that
wants roles to run at once does it behind an atom (see
[Parallel Execution](/patterns/#parallel-execution)) or starts separate runs itself.
