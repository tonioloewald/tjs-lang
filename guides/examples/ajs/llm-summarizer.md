<!--{"section": "ajs", "type": "example", "group": "llm", "order": 11, "requiresApi": true, "parent": "ajs-llm.md"}-->
<!-- TODO review -->

# LLM Summarizer

Fetch a document, hand it to a model, return the gist: the pattern behind most "read this for
me" agents.

An agent runs inside the VM; the **host** is the JavaScript program that embeds the VM and
starts the run. The host passes in **capabilities** (IO functions it injects, such as a model),
sets policy for the VM's built-in IO (which domains a fetch may reach), and sets a **fuel**
budget (a meter of the work the agent does; the run stops when it is spent).

Every example on this page calls a model, which this static site does not have, so none of
them run here. Each prints this instead, which is expected, not a broken example:

```text
This example needs an LLM, which the static site does not provide. Run it locally with
tjs-lang and LM Studio (see the AJS guide).
```

Deleting the `llmPredict` line to watch the fetch on its own does not help either: the
site's fetch allowlist does not include `tjs.tosijs.net`. Run them locally with the host below.

```ajs:inline
function summarize({ source = 'coffee-origins' }) {
  // The sample documents served by this site
  let sources = ['coffee-origins', 'ai-history', 'renewable-energy']
  if (!sources.includes(source)) {
    return { source, error: 'Unknown source; try one of: ' + sources.join(', ') }
  }
  let url = 'https://tjs.tosijs.net/texts/' + source + '.txt'
  let text = httpFetch({ url })

  let prompt = 'Summarize the following text in 2-3 sentences:\n\n' + text
  let summary = llmPredict({ prompt })
  return { source, summary }
}
```

## What to notice

- **Two kinds of IO, two decisions for the host.** The agent fetches and calls a model, and
  the host decides each separately. `httpFetch` is built into the VM, so it needs no
  capability; what the host sets is its policy, the list of domains it may reach
  (`context.allowedFetchDomains`). The model is not built in: the host must inject it as the
  `llm` capability, or there is none. Each is metered on its own: a fetch costs 5 units of
  fuel, a model call 100.
- **Text in, text out.** The built-in fetch returns the body as a string unless the server says
  the body is JSON (`application/json`), in which case it parses it. The sample documents are
  served as `text/plain`, so `text` is a string and goes straight into the prompt.
- **The URL is absolute.** The built-in fetch has no page to resolve a relative path against, so
  `'/texts/coffee-origins.txt'` fails with `Invalid URL`. The sample documents live on this
  site, `tjs.tosijs.net` (its `texts/` folder), with CORS open, so a VM running in a browser can
  fetch them too.
- **The agent checks its input before spending anything.** An HTTP error status is not a
  failed fetch: `httpFetch` returns the body of an error page as readily as the body of a
  document. Asked for a file that does not exist, it hands back the server's 404 page, and the
  model would summarize that. Refusing unknown sources up front costs under 1 unit of fuel and
  no model call.

## Running it locally

The host transpiles the agent on its own side and hands the VM only the AST: `tjs-lang/vm-ast`
contains no parser, so nothing in the sandbox parses source. The source string holds one
function, and that function is the agent.

The agent's `llmPredict` call becomes a call to the capability's `llm.predict(prompt, options)`,
which must return a string. Any object of that shape works; the `llm` in
[LLM Chat](/llm-chat/) talks to any OpenAI-compatible server. A stand-in is enough to watch
the plumbing:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const agentSource = `
function summarize({ source = 'coffee-origins' }) {
  // ...the agent above...
}`

// Replace with the llm from LLM Chat to call a real model
const llm = {
  async predict(prompt, options) {
    return `(a summary of ${prompt.length} characters)`
  },
}

const { ast } = transpile(agentSource)
const run = await new AgentVM().run(
  ast,
  { source: 'ai-history' },
  {
    fuel: 1000, // plenty: a run uses about 107
    capabilities: { llm },
    context: { allowedFetchDomains: ['tjs.tosijs.net'] }, // where httpFetch may go
    quotas: { llmPredict: 1 }, // at most one model call per run
    membraneMaxBytes: 1024 * 1024, // the largest value that may cross in or out (default 4 MB)
  }
)
if (run.error) console.log('run failed:', run.error.message)
else if (run.result.error) console.log('agent refused:', run.result.error)
else console.log(run.result.summary)
```

With the stand-in, this prints `(a summary of 1332 characters)`. With a real model,
`run.result` looks like this:

```text
{ source: 'ai-history', summary: 'Artificial intelligence began as…' }
```

An agent can fail in two ways, and the host checks for both. The agent can return an error as
data: with `{ source: 'nope' }`, the run succeeds and `run.result.error` is
`'Unknown source; try one of: coffee-origins, ai-history, renewable-energy'`. Or
the run can fail: any error the agent does not catch ends the run, and `vm.run` still resolves
normally, with the failure in `run.error`. Your code never sees a thrown exception.

A run uses about 107 units of fuel: 100 for the model call, 5 for the fetch, the rest for
expressions. The budget of 1000 is headroom, not a target; set it well above what a normal run
uses, and low enough to stop a runaway one. If fuel runs out, the run ends with `run.error`
whose message is `Out of Fuel`. Leave out `allowedFetchDomains` and the fetch is refused with
`Fetch blocked: no allowedFetchDomains configured`; leave out `llm` and the model call fails
with `Capability 'llm.predict' missing`. This agent catches neither, so both arrive in
`run.error`.

## Long documents

Long documents cost tokens and can exceed a model's context. Cut the text before you send it,
and tell the model what you did:

```ajs
function summarizeUrl({
  url = 'https://tjs.tosijs.net/texts/renewable-energy.txt',
  maxChars = 600,
}) {
  let text = httpFetch({ url })
  let truncated = text.length > maxChars
  let excerpt = text.slice(0, maxChars)
  let note = truncated ? ' (the text was cut short)' : ''
  let prompt = 'Summarize in 3 bullet points' + note + ':\n\n' + excerpt
  let summary = llmPredict({ prompt, options: { temperature: 0.2 } })
  return { url, truncated, summary }
}
```

The sample document is about 1,300 characters, so the default `maxChars` of 600 cuts it and
`truncated` is `true`; pass `maxChars: 8000` and it is sent whole. Counting characters is a
rough stand-in for counting tokens, but it needs nothing from the host.

`options` is handed to the host's `llm.predict` as written; what it accepts depends on the host
(see [LLM Chat](/llm-chat/)). A low `temperature` gives steadier, less inventive summaries.

This agent takes any `url`, so it cannot check its input against a known list as `summarize`
does. The host's `allowedFetchDomains` is what keeps a caller from pointing it anywhere, and a
URL on an allowed domain that does not exist still returns a 404 page, which the model will
summarize.

## When the world fails

A fetch can be refused or fail, and a model can be down. Both are failures of the world, so
`try`/`catch` handles them, and the agent can return a readable reason instead of ending the
run with `run.error`. The rule for `httpFetch`: a refused domain, a network failure or a body
over the size cap throws; an HTTP error status does not, and returns the body.

```ajs
function summarizeSafely({ url = 'https://tjs.tosijs.net/texts/ai-history.txt' }) {
  let text = ''
  try {
    text = httpFetch({ url })
  } catch (e) {
    return { url, error: 'Could not fetch: ' + e }
  }
  try {
    let summary = llmPredict({ prompt: 'Summarize in one sentence:\n\n' + text })
    return { url, summary }
  } catch (e) {
    return { url, error: 'The model failed: ' + e }
  }
}
```

The `catch` receives the error's message as a string, so it is `+ e`, not `+ e.message` (see
[Error Handling](/ajs-error-handling/)). Run it with the host above and a `url` on another
domain, such as `https://example.com/x`, and `error` is `"Could not fetch: Fetch blocked:
domain not in allowlist. Allowed: tjs.tosijs.net"`. With no `llm` capability it is `"The model
failed: Capability 'llm.predict' missing"`.

What `try` does not catch: a URL that does not exist on an allowed domain. The fetch succeeds,
returns the 404 page, and `summarizeSafely` summarizes it. Some failures also end the run
whatever the agent does, `try` or not: running out of fuel or time, and bugs in the code such
as calling an atom with the wrong input. The full list is in
[Error Handling](/ajs-error-handling/).

## Limits

- **Size.** `membraneMaxBytes` is the `vm.run` option that caps any value crossing between
  host and agent (4 MB by default). The built-in fetch reads a response body under it and stops
  reading when it passes the cap, so an oversized document is refused before
  it is copied in (`httpFetch: response too large`). That is the world's doing, so it is
  catchable like any failed fetch.
- **Cost.** Fuel charges a flat 100 units per model call, however many tokens or dollars the
  call uses, so fuel cannot express a spending limit. A quota caps the number of calls
  (`quotas: { llmPredict: 1 }`, as the host above sets); a second call then fails with
  `Quota exceeded for 'llmPredict': 1 call allowed`.
- **Text you did not write.** A page can contain instructions aimed at your model ("ignore the
  above and…"). Summarizing it is reading it to the model, so treat the summary as untrusted
  output. The agent cannot do more than its capabilities allow, which is the reason to give a
  summarizer a fetch allowlist and a model, and nothing else.
