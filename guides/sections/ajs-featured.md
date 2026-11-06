<!--{"parent": "ajs-examples.md", "order": 0}-->
<!-- TODO review -->

# Start Here: Two AJS Examples

AJS is a JavaScript subset for agent code: it compiles to data (a JSON syntax tree) and runs in
a sandboxed VM that meters its work and has no IO except what the host grants. The host is the
program that embeds the VM and decides what an agent may reach. An agent is an AJS program the
host runs: it takes arguments, calls the operations it was given, and returns an object. See
[AJS](/ajs/) for the overview.

AJS exists to run code you did not write, such as agents submitted by users or written by an
LLM. These two examples show that such code always stops, and that it can still do real work
within the limits the host sets.

[Fuel Limits](/fuel-limits/) runs a loop that never ends, and the VM stops it. Every operation
costs fuel, the host sets the budget for the run, and when the budget is spent the run ends with
an `Out of Fuel` error value. The VM returns the error to the host rather than throwing it, so a
runaway agent cannot hang the page or crash the program that embeds it. The other limits, such
as quotas on model calls and the list of domains an agent may fetch from, build on this one: a
host can reason about what an agent will do only if the agent is certain to finish. This example
runs live in your browser, so start there.

[LLM + API Data](/llm-api-data/) is the shape of a real agent: fetch facts from an API, let a
model judge them, and return structured data. The VM has no model or network access of its own.
The host passes in an `llm` capability, and the built-in fetch reaches only the domains the host
lists, so the agent can do only what the host allows. Because it needs a model, the doc site does
not run it and shows a note saying so. The page includes the host code to run it yourself
against a local OpenAI-compatible model server, such as LM Studio or MLX (see
[MLX setup](/mlx-setup/) and [LM Studio setup](/lm-studio-setup/)).

After these, browse the rest of the [AJS examples](/ajs-examples/), or read
[Embedding the VM](/ajs-host/) to run agents from your own program.

<!-- prettier-ignore-start -->

<!-- toc -->
- [LLM + API Data](/llm-api-data/)
- [Fuel Limits](/fuel-limits/)
<!-- /toc -->

<!-- prettier-ignore-end -->
