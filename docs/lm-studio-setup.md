<!--{"parent": "ajs.md", "order": 6.6}-->
<!-- TODO review -->

# Running a local model (LM Studio)

The LLM examples in this book call a model through a capability the host injects. The doc site
injects no model, so those examples print a message instead of running. (It could not use one on
your machine anyway: the site is served over HTTPS, and an HTTPS page cannot call a plain-HTTP
local server; see [Browser hosts](#browser-hosts).) To run them for real you need a model server
on your own machine and a host that talks to it. This page sets up **LM Studio** as the server
and uses the batteries for the host side.

**The batteries** are `tjs-lang/batteries`, an optional module. `getBatteries()` finds a local
model server, works out what its models can do, and returns ready-made capabilities. A set of
**battery atoms** (`llmPredictBattery`, `llmVision`, `storeVectorize` and others) uses those
capabilities; you register them on the VM.

Nothing in the code is specific to LM Studio. The batteries speak plain OpenAI-compatible HTTP
(`/v1/models`, `/v1/chat/completions`, `/v1/embeddings`), so any server that does the same works:
LM Studio, an MLX server (see [MLX setup](/mlx-setup/)), Ollama, or a hosted API behind a
compatible proxy.

The shell commands on this page are for macOS and Linux.

## What has to be true

- **A server answering at the base URL.** The default is `http://localhost:1234/v1`, LM
  Studio's default port. Set `TJS_LLM_BASE_URL` to point anywhere else, such as another machine
  on your network or an MLX server on its own port:

  ```bash
  export TJS_LLM_BASE_URL=http://192.168.1.20:1234/v1
  ```

  The variable is read once, when `tjs-lang/batteries` is first imported, so set it before your
  host starts. It works in Bun and Node only; a browser host sets the URL in code (see
  [Browser hosts](#browser-hosts)).
- **One chat model and one embedding model available.** The chat model serves the battery
  atoms `llmPredictBattery` and `llmVision`; the embedding model serves `storeVectorize` and
  vector search. An agent that only chats does not need the embedding model, but the batteries
  log a warning to the console when it is missing.
- **CORS enabled**, if the host runs in a browser page (see [Browser hosts](#browser-hosts)).
  A host running in Bun or Node does not need it.

## Install and start LM Studio

1. Download LM Studio from lmstudio.ai and install it.
   - **macOS:** the app runs both GGUF models and, on Apple silicon, MLX-format models.
   - **Linux:** it ships as an AppImage only (no `.deb`, apt or snap). On an Ubuntu 24.04 or
     Mint 22 base, install `libfuse2t64` first, then `chmod +x` the AppImage and run it. It
     needs an x86-64 CPU with AVX2 (`grep -w avx2 /proc/cpuinfo`).
   - **Windows:** run the installer. The app and server settings below are the same; in
     PowerShell, use `curl.exe` for the server check.
2. **Update the inference runtimes** before loading anything: Settings → Runtime → update all.
   A fresh install ships old engines, and recent model architectures (Gemma 3, 3n and 4, for
   example) will not load until they are updated.
3. Download and load a chat model and an embedding model. A small chat model is enough for the
   examples: `google/gemma-4-e2b` is what the project's own tests use. For embeddings, nomic
   embed text v1.5 works.
4. Developer → **Start Server** (port 1234). Turn on **Enable CORS** if a browser page will be
   the host.

Check the server from a terminal. It lists the id of every model the server offers:

```bash
curl -s http://127.0.0.1:1234/v1/models | grep -oE '"id": *"[^"]*"'
```

These ids are what the batteries and the `TJS_LLM_MODEL` overrides below use, and they can
differ from the name you downloaded: LM Studio reports the nomic model as
`text-embedding-nomic-embed-text-v1.5-embedding`, for example. The check uses `127.0.0.1`
because `localhost` can resolve to IPv6, where LM Studio is not listening (see
[Troubleshooting](#troubleshooting)).

LM Studio also has a command-line tool, `lms`. It is installed with the app but not put on your
`PATH`. Find the binary (`~/.lmstudio/bin/lms` on Linux, `~/.cache/lm-studio/bin/lms` on some
macOS installs; the location varies by version) and run it once as `<path>/lms bootstrap`,
which adds it to your `PATH`. Then:

```bash
lms server status   # "The server is running on port 1234."
lms ps              # loaded models, their size, device and idle TTL
```

## Two ways to call a model

An agent can reach a model through two different atoms:

| Atom                | Kind                        | Agent writes                        | Returns           | Host supplies                     |
| ------------------- | --------------------------- | ----------------------------------- | ----------------- | --------------------------------- |
| `llmPredict`        | core atom, always available | `llmPredict({ prompt })`            | a string          | an `llm` capability               |
| `llmPredictBattery` | battery atom, registered    | `llmPredictBattery({ system, user })` | a chat message    | the `llmBattery` from the batteries |

`llmPredictBattery` also takes `tools` and `responseFormat` (structured output: a JSON schema the
model's answer must follow), and `llmVision` uses the same capability for images. Most examples
in this book, starting with [LLM Chat](/llm-chat/), use the core atom `llmPredict`, so that comes
first.

### A host for `llmPredict`

`llmPredict` needs an `llm` capability whose `predict(prompt, options)` returns a **string**. The
batteries do not provide `llm` directly, but `llmBattery` adapts in a few lines:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'
import { getBatteries } from 'tjs-lang/batteries'

const batteries = await getBatteries() // audits the server once, then caches
const llm = {
  async predict(prompt) {
    const message = await batteries.llmBattery.predict(
      'You are a helpful assistant.',
      prompt
    )
    return message.content ?? ''
  },
}

const chat = `
function chat({ message = 'Hello' }) {
  let response = llmPredict({ prompt: message })
  return { response }
}
`
const result = await new AgentVM().run(
  transpile(chat).ast,
  { message: 'Say hello in French, in one word.' },
  { fuel: 1000, capabilities: { llm } }
)
console.log(result.error?.message ?? result.result)
// → something like { response: 'Bonjour' }; model output varies
```

This adapter ignores the agent's `options`. [LLM Chat](/llm-chat/) has a host that calls the
server directly and maps `temperature`, `maxTokens` and the rest onto the wire format.

### A host for the battery atoms

Register the battery atoms on the VM and pass the batteries as the capabilities:

```javascript
import { transpile } from 'tjs-lang/lang'
// batteryAtoms are atom definitions, so they ship with the VM; tjs-lang/batteries
// holds the capabilities they call.
import { AgentVM, batteryAtoms } from 'tjs-lang/vm-ast'
import { getBatteries } from 'tjs-lang/batteries'

const source = `
function ask({ question = 'Name one planet.' }) {
  let reply = llmPredictBattery({
    system: 'Answer in one short sentence.',
    user: question,
  })
  return { answer: reply.content }
}
`

const vm = new AgentVM(batteryAtoms)
const batteries = await getBatteries()
const { ast } = transpile(source, { atoms: vm.atoms })
const run = await vm.run(
  ast,
  { question: 'What colour is the sky?' },
  { fuel: 1000, capabilities: batteries, quotas: { llmPredictBattery: 1 } }
)
console.log(run.error?.message ?? run.result)
// → something like { answer: 'The sky is typically blue during the day.' }
```

- **`atoms: vm.atoms`** hands the transpiler the VM's atom table: the core atoms plus the ones
  registered with `new AgentVM(...)`. The transpiler always knows the core atoms such as
  `llmPredict`. It does not know battery atoms unless told, and then it cannot check their
  inputs: with the table, a misspelled `sytem:` is refused at transpile time
  (`'llmPredictBattery' has no input 'sytem'`); without it, the call compiles unchecked.
- **`quotas`** caps how many times an atom may run in one run, here one model call. A second
  call ends the run with `Quota exceeded for 'llmPredictBattery': 1 call allowed`. Fuel cannot
  express this: it measures VM work, so it says nothing about "at most N model calls". For an
  agent written by a model or a stranger, the quota is what bounds your model bill.
  [Run options](/ajs-host/#run-options) covers fuel, quotas and the other limits.

`llmPredictBattery` returns the model's whole chat message (`{ role, content, tool_calls? }`),
not a string, which is why the agent reads `reply.content`.

### What `getBatteries()` returns

These are the host-side capability objects, the things the battery atoms call. An agent never
calls them directly; it calls the atoms with named inputs, and the atoms call these.

| Key          | What it is                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `llmBattery` | `{ predict(system, user, tools?, responseFormat?), embed(text) }`, or `null` when no model server could be set up |
| `vector`     | `{ embed(text) }`, the embedding half on its own, for `storeVectorize`; `undefined` when `llmBattery` is `null` |
| `store`      | an in-memory key-value and vector store                                                        |
| `models`     | the audit results, for inspection                                                              |

## How the batteries pick a model

The first call to `getBatteries()` runs an **audit**: it asks the server for `/v1/models`, then
probes every model on that list with small requests to classify it as a chat model or an
embedding model, and to test structured output and vision. It prints a table of what it found to
the console. The audit's messages go to the console and there is no option to silence them.

- **The audit probes everything the server lists.** LM Studio can list every downloaded model,
  not only the loaded ones, and a probe can make it load a model on demand. With many large
  models downloaded the first audit is slow. Keep the list short, or name the models yourself
  (below).
- **Defaults are the first match**, with the model ids in plain string order (alphabetical,
  capitals before lower case): the first chat model for ordinary calls, the first chat model
  that passed the structured-output probe for calls with `responseFormat`, the first embedding
  model for embeddings. When the choice matters, name the models.
- **To choose, name them.** `TJS_LLM_MODEL` and `TJS_EMBEDDING_MODEL` take model ids exactly as
  `/v1/models` reports them (the `curl` check above). A named model wins over a discovered one.
  With both set, the audit is skipped entirely and nothing is probed, which is also what a
  server that lists no models needs (mlx-omni-server is one). A named chat model is assumed to
  support structured output, so `responseFormat` calls go to it; `llmVision` calls also go to
  it, untested, so name a vision-capable model if agents will send images.

  ```bash
  export TJS_LLM_MODEL=google/gemma-4-e2b
  export TJS_EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5-embedding
  ```

- **The result is cached for 24 hours**, keyed by the base URL, the list of model ids, and the
  version of the audit probes (so a tjs-lang upgrade that changes the probes re-runs the audit).
  A change to the list triggers a fresh audit; a change to a model behind the same id does not.
  An audit that reached the server is cached whatever it found, even if every model failed its
  probes; an audit that could not connect caches nothing.
- **Where the cache lives.** In Bun or Node it is a file, `.models.cache.json`, in the OS cache
  directory (`~/Library/Caches/tjs-lang` on macOS, `${XDG_CACHE_HOME:-~/.cache}/tjs-lang` on
  Linux, `%LOCALAPPDATA%\tjs-lang` on Windows), never in the working directory. `TJS_CACHE_DIR`
  moves it, and `XDG_CACHE_HOME`, when set, is used on every platform. Its path is printed the
  first time it is written. In a browser it is kept in `localStorage` under the key
  `.models.cache.json`.

To force a fresh audit, delete the cache:

```bash
# macOS
rm -f "${TJS_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/Library/Caches}/tjs-lang}/.models.cache.json"
# Linux
rm -f "${TJS_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/tjs-lang}/.models.cache.json"
```

On Windows, `Remove-Item "$env:LOCALAPPDATA\tjs-lang\.models.cache.json"` in PowerShell. In a
browser host, run `localStorage.removeItem('.models.cache.json')` in the page's console.

## When there is no server

`getBatteries()` does not fail when the server is down. What a model call does next depends on
whether an earlier audit is cached:

| State                                        | The run's `error.message`                                   | Fix                                     |
| -------------------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| Server down, no cached audit                 | `No LLM available.`                                         | Start the server, then restart the host |
| Server stopped after an audit was cached     | `No local LLM server reachable at <base URL>. …`            | Start the server                        |

In the first case the audit has already logged
`Failed to connect to the local LLM server (set TJS_LLM_BASE_URL to point at it).` and found no
models, and the host keeps that empty result until it restarts. Both errors can be caught in the
agent like any other; the catch binding is the message string, not an error object (see
[Errors](/DOCS-AJS/#errors)):

```javascript
function ask({ question = 'Name one planet.' }) {
  try {
    let reply = llmPredictBattery({ system: 'Answer briefly.', user: question })
    return { answer: reply.content }
  } catch (e) {
    return { failed: e } // e.g. { failed: 'No LLM available.' }
  }
}
```

## Browser hosts

A host can run in a web page, with three things to know:

- **The page must be served over HTTP**, not HTTPS. A browser blocks an HTTPS page from calling
  a plain-HTTP local server, so on an HTTPS page `getBatteries()` skips the audit and sets
  `llmBattery` to `null` (and `vector` to `undefined`); a model call then fails with
  `Capability 'llmBattery' missing or invalid.`
- **CORS must be on in LM Studio.** The page's origin differs from `localhost:1234`, so the
  browser sends a CORS preflight; without **Enable CORS** LM Studio answers it with `400` and
  the request is blocked ("Cross-Origin Request Blocked").
- **Environment variables do not reach a page.** `getBatteries()` in a browser always uses the
  default base URL, and `TJS_LLM_MODEL` / `TJS_EMBEDDING_MODEL` do not apply. A host whose
  server is elsewhere builds the capability itself from the same module:

  ```javascript
  import { LocalModels, getLLMCapability } from 'tjs-lang/batteries'

  const url = 'http://127.0.0.1:8080/v1'
  const models = new LocalModels(url)
  await models.audit()
  const llmBattery = getLLMCapability(models, url)
  // capabilities: { llmBattery, vector: { embed: llmBattery.embed } }
  ```

## Troubleshooting

### `curl localhost:1234` fails but the server is up

`localhost` can resolve to the IPv6 address `::1` while LM Studio listens on IPv4. Use
`127.0.0.1` for manual checks and in `TJS_LLM_BASE_URL`. On Linux, `ss -ltn | grep 1234` shows
whether anything is listening.

### Every call fails with "No LLM available" although models are loaded

The audit found no usable model, and that result is cached (see the cache rule above). This
happens when the models were still loading during the audit, or a model is listed (downloaded)
but cannot load. Make sure a chat model and an embedding model are loaded and answering, then
delete the cache file (above) and restart the host.

### "Error loading model. (Exit code: null)"

The loader process died partway through, almost always from running **out of GPU memory**
(rarely, an architecture the runtime cannot build; update the runtimes). Either free memory or
load the model on the CPU, which is slower but fits in system RAM:

```bash
lms load <model-id> --gpu off   # also: --gpu max, or a ratio such as 0.5
```

### GPU memory stays full after restarting LM Studio

LM Studio's embedding worker can leak GPU memory. It is a detached child process, so closing and
reopening the app does not stop it, and every later GPU load then fails. Quit LM Studio, find
the leftover workers, stop them by process id, then start LM Studio and the server and load
both models again. The Linux commands are under Hardware notes below.

### Hardware notes (Linux and NVIDIA, as of June 2026)

These are specific to one setup and will date.

- `nvidia-smi --query-gpu=memory.used,memory.free --format=csv` shows how much GPU memory is
  free.
- The Gemma 3n and 4 models are multimodal (they come with `mmproj-*.gguf` projector files) and
  need more memory than their size suggests. A 12 GB card runs them once its memory is actually
  free.
- RTX 50xx (Blackwell) cards need a recent driver; 595 with CUDA 13 worked.
- The leaking embedding worker is `~/.lmstudio/.internal/utils/node` running
  `embeddingworker.js`; it was seen holding 6.5 GB with 700 MB of embedding models loaded, and
  failed loads add to the leak. To clear it, with LM Studio quit:

  ```bash
  nvidia-smi --query-compute-apps=pid,used_memory,process_name --format=csv
  pgrep -fl '.lmstudio/.internal/utils/node'   # the stuck workers and their pids
  kill <pid> ...                                # the pids listed above
  nvidia-smi --query-gpu=memory.used,memory.free --format=csv   # used should drop to about 1 GB
  ```

## For contributors: the repository's LLM tests

This section is for working on tjs-lang itself, not for embedding it.

The repository's live-model tests use the same batteries and the same server. The base URL and
model overrides are read in `src/batteries/config.ts`.

```bash
bun run test:llm   # live smoke: audit, one chat completion, one embedding
bun test           # the full suite, which includes the live smoke and the
                   # playground-example tests under happy-dom (these need CORS on)
```

`test:fast` skips them (`SKIP_LLM_TESTS=1`). The full suite is the pre-release gate.

Many test files audit at once in a full parallel run. If the cache was just deleted, several
audits probe the server at the same moment, and under that load models come back misclassified
(embedding models tagged as chat models, for example). Write one clean cache first and do not
delete it before the full run:

```bash
rm -f "${TJS_CACHE_DIR:-$HOME/Library/Caches/tjs-lang}/.models.cache.json"
bun run test:llm   # writes one clean audit, in isolation
bun test           # reuses it
```

A cold server can fail the first run while it loads models; warm it with `test:llm` and judge
the second run.
