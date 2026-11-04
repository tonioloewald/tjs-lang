<!--{"section": "ajs", "type": "example", "group": "advanced", "order": 15, "requiresApi": true, "parent": "ajs-advanced.md"}-->

# Multi-Agent Pipeline

Two agents collaborate on a task (requires llm capability)

<!-- TODO review -->
Split a job into roles (a researcher, a writer, an editor), each with its own instructions, and
pass each one's output to the next. Narrow prompts are easier for a model to follow and easier
for you to debug. It needs an LLM, so on this site it prints a message instead of running; run it
locally with the host from [LLM Chat](/llm-chat/).

```ajs:inline
function collaborativeWriting({ topic = 'the future of renewable energy' }) {
  // Agent 1: Research Agent - generates key points
  let researchPrompt =
    'You are a research agent. Generate 3 key facts or points about: ' +
    topic +
    '\nFormat as a numbered list. Be concise.'
  let research = llmPredict({ prompt: researchPrompt })

  // Agent 2: Writer Agent - creates content from research
  let writerPrompt =
    'You are a writer agent. Using these research points:\n\n' +
    research +
    '\n\nWrite a short, engaging paragraph (2-3 sentences) about ' +
    topic +
    '.\nMake it informative and accessible.'
  let article = llmPredict({ prompt: writerPrompt })

  // Agent 3: Editor Agent - reviews and improves
  let editorPrompt =
    'You are an editor agent. Review this draft:\n\n"' +
    article +
    '"\n\nSuggest one specific improvement. Then provide the improved version.\nFormat: "Suggestion: [your suggestion]\n\nImproved: [improved text]"'
  let edited = llmPredict({ prompt: editorPrompt })

  return {
    topic,
    researchPoints: research,
    firstDraft: article,
    editedVersion: edited,
  }
}
```

<!-- TODO review -->
## What to notice

- **The roles are prompts, not separate programs.** This is one agent making three model calls in
  sequence; "agent" in the comments means a role. That is usually what you want: one budget, one
  trace, one place to read the whole pipeline.
- **Every intermediate result is returned.** The host gets the research, the draft and the edit,
  so a bad final answer can be traced to the step that went wrong.
- **Three model calls cost 300 units of fuel.** A run with less stops partway through with
  `Out of Fuel`, after the calls before it were made (and paid for). A host that pays per call
  caps it with `quotas: { llmPredict: 3 }`.

<!-- TODO review -->
## Separate agents

When the roles really are separate programs (written by different people, stored, reused), one
agent can run another with `agentRun({ agentId, input })`. `agentId` is a stored procedure token,
an AST, or an id the host's `agent` capability resolves. A sub-agent gets only the `input` it is
handed, never the caller's variables. One given as a token or an AST runs inside the caller's
run, on the same fuel budget and quotas; one the host's `agent` capability runs is a separate
run, with whatever budget the host gives it. AJS runs steps in sequence by design; there is no parallel fan-out inside an agent, so a
host that wants roles to run at once starts separate runs itself.

<!-- TODO review -->
## The gotcha

Each step feeds the next, so an early mistake compounds: a wrong "fact" from the researcher
becomes confident prose by the editor. Keep the early steps narrow and checkable (a list of
facts, not an essay), and if the result matters, check those facts against a source the agent
can fetch.
