<!--{"parent": "ajs.md", "order": 6.5}-->
<!-- TODO review -->

# Local models with MLX

An AJS agent never talks to a model directly. It calls an atom (`llmPredict`,
`llmPredictBattery`, `storeVectorize`), and the atom calls a capability the host passed to
`vm.run`. This chapter sets up a local model server on Apple silicon so those capabilities have
something real behind them.

A local model is useful while you build a host or write agents: calls cost nothing, the prompts
and data never leave your machine, and it works offline. It is also what tjs-lang's own live
LLM tests run against.

The capabilities come from the **batteries** (`tjs-lang/batteries`, re-exported from
`tjs-lang`): an optional module that supplies ready-made LLM, embedding and store capabilities
(`getBatteries()`) plus the atoms that read them (`batteryAtoms`), so a host does not have to
write its own. The batteries speak plain OpenAI-compatible HTTP to a local server, so which
server is a configuration choice, not a code change. The intended local backend is **MLX**
(Apple-silicon native, open source), served by `mlx-omni-server`. LM Studio works too and is
covered in [LM Studio setup](lm-studio-setup.md); use it for vision models and on machines that
are not Apple silicon.

The batteries send no API key (no `Authorization` header), so they cannot talk to a hosted API
that needs one. To use a hosted model, pass your own `llmBattery` or `llm` capability object to
`vm.run` instead; the atoms only care that it has the methods they call (see
[The core `llmPredict` atom](#the-core-llmpredict-atom) for the shape).

## Setup

Use `mlx-omni-server`: the batteries need both chat and embeddings, and it serves both behind
one OpenAI-compatible API on one port (10240 by default). Verified on macOS 26.5, Apple silicon.

Run the server in one terminal and leave it running; it stays in the foreground.

```bash
# 1. Install. uv manages its own Python, so the system python3 (often Xcode's 3.9,
#    too old for MLX) is neither used nor modified.
brew install uv
uv tool install mlx-omni-server

# 2. Put the server and its `hf` download tool on the PATH. uv installs the server
#    binary in ~/.local/bin, and `hf` only inside the tool's own environment.
export PATH="$HOME/.local/share/uv/tools/mlx-omni-server/bin:$HOME/.local/bin:$PATH"

# 3. Download the models first. The server will not fetch them (see gotcha 2).
hf download mlx-community/Qwen2.5-1.5B-Instruct-4bit   # chat,  ~840MB
hf download mlx-community/bge-small-en-v1.5-bf16       # embed, ~65MB

# 4. Run the server.
mlx-omni-server --port 10240
```

Then, in a second terminal (the one that will run your host), point the batteries at the
server and name both models:

```bash
export TJS_LLM_BASE_URL=http://localhost:10240/v1
export TJS_LLM_MODEL=mlx-community/Qwen2.5-1.5B-Instruct-4bit
export TJS_EMBEDDING_MODEL=mlx-community/bge-small-en-v1.5-bf16
```

The two models above are small enough to run on any Apple-silicon laptop. Any MLX chat or
embedding model from the `mlx-community` organisation on Hugging Face can replace them; the
model id you export is the Hugging Face repo id you downloaded.

Check the server from the second terminal before involving tjs-lang:

```bash
curl -s http://localhost:10240/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"mlx-community/Qwen2.5-1.5B-Instruct-4bit",
       "messages":[{"role":"user","content":"Say hi"}],"max_tokens":10}'
```

A JSON reply with `choices[0].message.content` means the server and the model work. The first
request for a model loads it, so it can take several seconds.

### The environment variables

The batteries read the first three once, when `tjs-lang/batteries` is first imported, so set
them before the host process starts.

| Variable              | Default                    | Meaning                                                  |
| --------------------- | -------------------------- | -------------------------------------------------------- |
| `TJS_LLM_BASE_URL`    | `http://localhost:1234/v1` | the server's `/v1` URL (the default is LM Studio's port) |
| `TJS_LLM_MODEL`       | none                       | chat model id                                            |
| `TJS_EMBEDDING_MODEL` | none                       | embedding model id                                       |
| `TJS_CACHE_DIR`       | OS cache directory         | where the model-audit cache is written                   |

At startup the batteries run a **model audit**: they ask the server's `/v1/models` which models
it has, probe each one, and pick a chat model and an embedding model. The result is cached on
disk for 24 hours. When **both** `TJS_LLM_MODEL` and `TJS_EMBEDDING_MODEL` are set, the
batteries use them as given and skip the audit. When only one is set, they audit and add the
named one to whatever the audit found.

On `mlx-omni-server` the audit finds nothing (gotcha 1), so **set both**. With only one set, the
other kind of call fails: with only `TJS_LLM_MODEL`, every embed fails with
`No embedding model available.`; with only `TJS_EMBEDDING_MODEL`, every chat call fails with
`No LLM available.`

`TJS_VISION_MODEL` also exists, but `getBatteries()` does not read it; only the vision tests
and the playground do, and vision does not work on MLX today (see the last section).

## Two gotchas

**1. `/v1/models` returns an empty list, so you must name your models.**

_Symptom:_ the server answers the `curl` check, but every chat call from an agent fails with
`No LLM available.` and every embed with `No embedding model available.` At startup the console
shows three warnings: `⚠️ No embedding model found.`, `⚠️ No LLM found.` and
`⚠️ No LLM with structured output support found.`, each followed by
`(set TJS_LLM_MODEL / TJS_EMBEDDING_MODEL if your server does not list models)`.

_Cause:_ LM Studio lists the models it has loaded, which is what the audit reads.
`mlx-omni-server` loads a model on demand from the id in each request, so it has nothing to
list and returns `{"object":"list","data":[]}`. Filed upstream as
[mlx-omni-server#130](https://github.com/madroidmaq/mlx-omni-server/issues/130).

_Fix:_ set both `TJS_LLM_MODEL` and `TJS_EMBEDDING_MODEL`, then restart the host.

The same `No LLM available.` appears when no server is listening at `TJS_LLM_BASE_URL` at all,
because the audit finds no models there either (the console then also shows
`❌ Failed to connect to the local LLM server`). With both models named there is no audit, so a
missing server shows up at the first call instead, as
`No local LLM server reachable at http://localhost:10240/v1. Start your backend (MLX: mlx-omni-server, or LM Studio) or set TJS_LLM_BASE_URL.`
Either way, run the `curl` check above first.

**2. The server does not download models; it serves what is cached.** It loads models with
Hugging Face's `local_files_only=True`, so a model id you have not downloaded fails with
"outgoing traffic has been disabled", even on a working connection. Download it with
`hf download <id>` (setup step 3; `hf` is on the `PATH` only after step 2).

One environment-specific failure: if `pyenv` is on your `PATH` without a usable `python` shim,
the server dies at startup with `Failed to inspect Python interpreter … pyenv: python: command
not found`. Put a real Python first on the `PATH`. The `export` in setup step 2 does this, since
the tool's own environment comes first.

## Wiring it into a VM

None of the code in this section runs on this site: it needs a model server on your machine.

`getBatteries()` (from `tjs-lang`) runs the audit, or takes the named models, and returns the
capabilities the battery atoms read. The audit runs once per process: later calls return the
same capabilities without asking the server again, so restart the host after you change the
environment variables or start the server.

| Capability key | Read by                                                                 | Contains                    |
| -------------- | ----------------------------------------------------------------------- | --------------------------- |
| `llmBattery`   | `llmPredictBattery`, `llmVision`                                        | `predict` and `embed`       |
| `vector`       | `storeVectorize`                                                        | `embed` only                |
| `store`        | `storeCreateCollection`, `storeVectorAdd`, `storeSearch`, `storeGet`, `storeSet` | a key-value and vector store |

The store is held in memory and is not persisted: its contents are gone when the host process
exits. It has nothing to do with the model server; `getBatteries()` returns it whatever server
you use.

`llmBattery` and `vector` are present even when no model was found. Each call then fails at
run time with the errors in gotcha 1. They are missing (`null` and `undefined`) only when local
endpoints are disabled, on an HTTPS page (see [Browser hosts](#browser-hosts)); a battery atom
then fails with `Capability 'llmBattery' missing or invalid.`, or for `storeVectorize`,
`Capability 'vector' missing. Ensure vector battery is loaded.`

All of these failures are ordinary atom errors. Without a `try`, the run ends with the message
in `run.error`. With one, the agent catches it: in AJS the caught value is the message string.

The battery atoms are not in the core VM; register them with `new AgentVM(batteryAtoms)`. This
host runs an agent that asks the chat model a question, then embeds the answer.
`llmPredictBattery` returns an OpenAI-style chat message, so the text is in `.content`:

```javascript
import { AgentVM, batteryAtoms, getBatteries, transpile } from 'tjs-lang'

// The agent, as AJS source text.
const source = `
function askAndEmbed({ question = 'What is a sandbox, in one sentence?' }) {
  let reply = llmPredictBattery({
    system: 'Answer in one short sentence.',
    user: question,
  })
  let vector = storeVectorize({ text: reply.content })
  return { answer: reply.content, dimensions: vector.length }
}
`

const vm = new AgentVM(batteryAtoms)
const batteries = await getBatteries()
const { ast } = transpile(source, { atoms: vm.atoms })
const run = await vm.run(ast, {}, { fuel: 500, capabilities: batteries })
console.log(run.error ? run.error.message : run.result)
// { answer: 'A sandbox is …', dimensions: 384 }
```

`bge-small-en-v1.5` produces 384-dimensional vectors; the answer text varies from run to run.

Passing `{ atoms: vm.atoms }` lets the transpiler check calls to atoms that are not in the core
set against their declared inputs. Without it, `storeVectorize({ txt: reply.content })`
transpiles cleanly and fails only at run time, with
`'storeVectorize': its input does not have the shape the atom declares`. With it, the
transpiler refuses the source and names the fix:
`'storeVectorize' has no input 'txt'. It takes storeVectorize({ text, model }).`

**Fuel and time.** Fuel counts work, not waiting: `llmPredictBattery` costs 100 fuel and
`storeVectorize` 20, however long the model takes, so 500 leaves room for the rest of the
agent. Time is limited separately. Each model call has its own timeout (120 seconds for
`llmPredictBattery`, `llmPredict` and `llmVision`; 60 seconds for `storeVectorize`), and a run
with no `timeoutMs` gets twice the slowest registered atom's timeout, 240 seconds here. That is
enough for the first call, which loads the model. Pass a `timeoutMs` only to lower that limit,
and leave room for the model load if you do.

### The core `llmPredict` atom

There are two LLM atoms because they read different capabilities. `llmPredictBattery` reads
`llmBattery`, takes `{ system, user }` and returns the whole chat message. The core atom
`llmPredict({ prompt })` reads `llm`, a capability any host can supply, and returns a string.
Use `llmPredictBattery` with the batteries; use `llmPredict` when the agent must run on hosts
that supply only `llm`.

`llm.predict(prompt, options)` must return a **string**. `getBatteries()` does not supply
`llm`, so adapt the battery in the host. The battery's own method is
`llmBattery.predict(system, user)`: a system prompt and the user text, returning the chat
message.

```javascript
const { llmBattery, ...rest } = await getBatteries()
const llm = llmBattery && {
  async predict(prompt) {
    const message = await llmBattery.predict('You are a concise assistant.', prompt)
    return message.content ?? ''
  },
}

const { ast } = transpile(`
function summarize({ text = 'AJS agents run in a fuel-metered sandbox.' }) {
  let summary = llmPredict({ prompt: 'Summarize in five words: ' + text })
  return { summary }
}
`)
const run = await vm.run(ast, {}, {
  fuel: 500,
  capabilities: { ...rest, llmBattery, llm },
})
```

The agent gets the model's text back as a string. An adapter that returns the whole message
object instead fails the atom's output check (`Output validation failed for 'llmPredict'`).

### Browser hosts

A host running in a web page cannot use `getBatteries()` with `mlx-omni-server` as it stands.
Environment variables are not readable in a browser, so the batteries use the default base URL
(LM Studio's port, 1234) and cannot name models, and this server lists none. On an HTTPS page
the batteries also skip local endpoints entirely, because the browser would block an HTTPS page
calling a plain-HTTP server. For a browser host, use LM Studio as described in
[LM Studio setup](lm-studio-setup.md#browser-hosts), or pass your own capability object. Either
way, a page calling `localhost:10240` needs CORS, which `mlx-omni-server` has off by default:
start it with `--cors-allow-origins="*"` (or the page's origin).

## Running the live LLM tests

This section is for contributors working in the tjs-lang repository; the published package has
no test scripts.

```bash
bun run test:llm      # live smoke: audit (or named models), one predict, one embed
```

This is the "our client still works against a real server" test. The HTTP client itself is
tested without any server (`src/batteries/llm-transport.test.ts`, an in-process fixture), so
`bun run test:fast` needs no MLX install.

`bun run test:grok` (which measures how often a small model writes valid AJS, and never fails
the build) can also target this server. Set `GROK_MODEL` and `TJS_LLM_MODEL` to the same MLX
model id: the test runs only if its model is in the batteries' model list, which on this server
holds only the named models. The default, `google/gemma-4-e2b`, is an LM Studio id.

## Vision: use LM Studio for now

No MLX vision model has worked with these batteries yet. `mlx-omni-server` rejects the standard
OpenAI `image_url` content block
([mlx-omni-server#128](https://github.com/madroidmaq/mlx-omni-server/issues/128)) and routes only
the `gemma4` architecture to its vision backend
([#129](https://github.com/madroidmaq/mlx-omni-server/issues/129)). The one gemma-4 build tried,
`mlx-community/gemma-4-e2b-it-4bit`, failed to load its weights on both `mlx-omni-server` and
`mlx-openai-server`. Run `llmVision` against LM Studio.
