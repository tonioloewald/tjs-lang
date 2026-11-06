<!--{"parent": "ajs-examples.md", "order": 3}-->
<!-- TODO review -->

# LLMs

These examples show an agent asking a language model for text or JSON, with the host deciding
which model the agent gets and how many times it may ask.

Each example has two parts. The **agent** is AJS, and could have been written by a model or a
stranger. The **host** is your JavaScript: it creates the VM and passes in a model to call. The
VM has no IO of its own, so an agent cannot reach a model unless the host passes one in as the
`llm` capability. Here is the whole agent side of a model call:

```ajs
function ask(question: 'What is the capital of France?') {
  let answer = llmPredict({ prompt: question })
  return { answer }
}
```

## What an agent may spend

A model call is where an untrusted agent could run up your bill, so the host limits it three
ways:

- **A quota caps the number of calls.** With `quotas: { llmPredict: 3 }` in the `vm.run`
  options, a fourth call fails with `Quota exceeded for 'llmPredict': 3 calls allowed`. This is
  the knob that bounds model spend. The examples here use `quotas: { llmPredict: 1 }`.
- **Fuel caps the agent's total work.** Each `llmPredict` call costs a flat 100 units of fuel,
  whatever the call costs you, so fuel bounds the agent but does not measure tokens or money.
  See [Fuel Limits](/fuel-limits/).
- **A timeout caps each call.** A model call may take up to two minutes by default;
  `timeoutOverrides: { llmPredict: 30_000 }` changes that.

All three are `vm.run` options, described in [Embedding the AJS VM](/ajs-host/).

## Running the examples

This site runs in your browser with no model server behind it. On these pages, the examples that
call a model print a notice instead of a result: "This example needs an LLM, which the static
site does not provide." That notice is expected, not a failure. Examples that make no model call
still run.

To run them yourself you need:

- an OpenAI-compatible model server running on your machine. On Apple silicon, use
  [MLX setup](/mlx-setup/); otherwise use [LM Studio setup](/lm-studio-setup/).
- a chat model loaded in it. None of these three examples needs an embedding model.

Start with [LLM Chat](/llm-chat/). It shows the host code once: transpiling the agent, an `llm`
object whose `predict` posts to the server, and the `vm.run` call that passes it in. That host
posts to LM Studio's default address (`http://localhost:1234`); for MLX or another server,
change the URL in it. The other two pages show only the agent and tell you to use that same
`llm` object, so copy it from LLM Chat.

<!-- prettier-ignore-start -->

<!-- toc -->
- [LLM Chat](/llm-chat/)
- [LLM Summarizer](/llm-summarizer/)
- [LLM Structured Output](/llm-structured-output/)
<!-- /toc -->

<!-- prettier-ignore-end -->

What each one teaches:

- **LLM Chat**: one prompt in, one string out, plus the host, quotas, prompt options and
  catching a server failure.
- **LLM Summarizer**: fetch a page, then ask a model to summarize it. The agent uses two
  capabilities, and the host decides each one separately.
- **LLM Structured Output**: pass a JSON schema as `responseFormat`, parse the reply, and check
  it against the schema, so the agent gets data back instead of prose.

More LLM examples are in other sections. Tool calls, vision and code generation are in
Advanced ([LLM with Tool](/llm-with-tool/), [Vision: OCR](/vision-ocr/)). Combining a model with
an API call is in Featured ([LLM + API Data](/llm-api-data/)).
