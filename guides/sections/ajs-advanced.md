<!--{"parent": "ajs-examples.md", "order": 4}-->
<!-- TODO review -->

# Advanced

These examples combine a model with ordinary AJS code. Each one splits the work: the model does
what models are good at (reading, choosing, writing), and code does what has to be exact
(arithmetic, loops, checking shapes).

For an embedder, the point is that none of this needs a new trust decision. A program a model
wrote runs in the same VM as the agent that asked for it, under the same fuel budget, heap
ceiling and call quotas, and with only the capabilities the host passed. It cannot do anything the
agent could not already do. Running model output through `eval` gives it the whole host; running
it in AJS gives it a metered sandbox.

Before these, you should be comfortable calling atoms with named inputs, passing capabilities to
`vm.run`, setting fuel, fetching with `httpFetch`, and reading what `llmPredict` returns (a
string). Those are covered in [Basics](/ajs-basics/), [APIs](/ajs-api/) and [LLMs](/ajs-llm/).

## What you will see here

Every example needs a model, and the live editors on this site have none attached. So each one
reports that it needs a model and stops; that message is the expected result, not a bug in the
code. To run one for real, start a local model server ([LM Studio setup](/lm-studio-setup/) or
[MLX setup](/mlx-setup/)) and use the host code from [LLM Chat](/llm-chat/), with the extra
capability each page names. [Multi-Agent Pipeline](/multi-agent-pipeline/) also shows how to test
an agent with a scripted model instead of a real one.

## The examples

Start with [LLM with Tool](/llm-with-tool/). The model chooses the calculation and writes it down
as data; ordinary AJS code carries it out exactly; then the model phrases the answer around a
number it did not compute. Needs an `llm` capability.

[Multi-Agent Pipeline](/multi-agent-pipeline/) chains three model calls, each with its own prompt
and role: a researcher lists facts, a writer drafts a paragraph from them, and an editor revises
the draft. The roles are prompts in one agent, not separate programs, so the pipeline has one
budget and one trace, and every intermediate result is returned. New here: capping model calls
with `quotas`. Needs an `llm` capability.

[Vision: OCR](/vision-ocr/) and [Vision: Classification](/vision-classification/) fetch an image
with `httpFetch` and hand it to `llmVision`, which reads text from it or sorts it into categories.
New here: the batteries. `llmVision` is a battery atom, so the host registers `batteryAtoms` and
passes the `llmBattery` capability; the core `llm` capability is not enough. They need a
vision-capable model loaded.

The last two are about models that write AJS:

- [LLM Code Solver](/llm-code-solver/) asks a model for a small program and runs it with
  `runCode`. For a question like "the 10th Fibonacci number" that is more reliable than asking
  for the answer. This is the pattern from LLM with Tool again: the model writes the plan, as
  code this time, and the VM does the work. Needs the `llm` and `code` capabilities.
- [LLM Code Generator](/llm-code-generator/) asks a model to write AJS for a task and returns the
  source without running it. The page shows how a host checks generated code before running it:
  transpile it, list the atoms it calls, and run it with the fewest capabilities. Needs an `llm`
  capability.

<!-- prettier-ignore-start -->

<!-- toc -->
- [LLM with Tool](/llm-with-tool/)
- [Multi-Agent Pipeline](/multi-agent-pipeline/)
- [Vision: OCR](/vision-ocr/)
- [Vision: Classification](/vision-classification/)
- [LLM Code Solver](/llm-code-solver/)
- [LLM Code Generator](/llm-code-generator/)
<!-- /toc -->

<!-- prettier-ignore-end -->
