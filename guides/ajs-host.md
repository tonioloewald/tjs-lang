<!--{"parent": "embedding-the-vm.md", "order": 1}-->
<!-- TODO review -->

# Embedding the AJS VM

This chapter is for the host: the application or service that runs AJS agents written by
someone else, a user or a language model. It covers where to parse, every option `vm.run`
takes, what comes back, which failures an agent can catch and which end the run, how quotas
hold across nested runs, and where to put the VM.

Two other chapters sit beside this one. [The AJS Language](/DOCS-AJS/) is for the people and
models who write agents. [Capabilities and Custom Atoms](/ajs-capabilities/) covers giving
agents new powers: writing a capability and defining an atom. The guarantees the sandbox
makes, and the ones it does not, are listed once, in
[Safe Eval](/safe-eval/#what-the-sandbox-guarantees-and-what-it-does-not); the invariants
behind fuel and the heap ceiling are in [VM budgets](/vm-budgets/).

Five words carry most of this chapter:

- An **atom** is a named operation the VM can run, such as `httpFetch`, `storeGet` or
  `llmPredict`. An agent's calls are atom calls; the VM comes with a set of core atoms, and you
  can register your own.
- A **capability** is a host function an atom calls to reach the outside world: your `fetch`,
  your store, your model client. The VM has none of its own.
- The **membrane** is the copy-and-check every value goes through when it crosses between the
  agent and the host, in either direction.
- The **guest** is the agent's side of the membrane: its variables and the values it holds.
- `seq` is a block of steps. The root of every AST is one.

## A complete host

This host lets an agent fetch from one API and ask a model one question, and nothing else.
Everything below it in this chapter explains a piece of it.

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()

// 1. Transpile on the side that owns the source. Here it is a function in the same file;
//    in production it runs on the caller's machine, in a worker or in another process.
function compile(source) {
  try {
    const { ast } = transpile(source, {
      atoms: vm.atoms, // check calls against the atoms this VM really has
      maxSourceBytes: 16 * 1024, // refuse oversized source before parsing it
    })
    return { ast: JSON.stringify(ast) } // the wire and storage format
  } catch (e) {
    // e.g. "Unsupported statement type: ForStatement. AJS has no `for` loops. Use `while`
    //       with a counter: … at <source>:1:19"
    return { problem: e.message }
  }
}

// What a model might have written:
const { ast, problem } = compile(`
/**
 * Fetch a city's forecast and summarize it in one sentence.
 * @param city - the city to look up
 */
function forecast({ city: 'Paris' }): { city: '', summary: '' } {
  let data = httpFetch({ url: \`https://api.weather.example/v1/\${city}\` })
  let summary = llmPredict({ prompt: \`One sentence: \${JSON.stringify(data)}\` })
  return { city, summary }
}
`)
if (problem) throw new Error(problem)

// 2. The capabilities: the only ways out of the sandbox for this run.
const capabilities = {
  // A stand-in for your HTTP client. It returns the response BODY as plain data.
  fetch: async (url, init) => ({ city: url.split('/').pop(), high: 21, sky: 'clear' }),
  // A stand-in for your model client.
  llm: { predict: async (prompt) => 'Clear skies and a high of 21.' },
}

// 3. Run the stored AST on the VM that has no parser.
const { result, error, fuelUsed, trace } = await vm.run(
  JSON.parse(ast),
  { city: 'Oslo' },
  {
    fuel: 1000, // the work budget
    timeoutMs: 10_000, // someone is waiting for this answer
    capabilities,
    context: { allowedFetchDomains: ['api.weather.example'] }, // where fetch may go
    quotas: { llmPredict: 1, httpFetch: 2 }, // call caps, whatever the fuel allows
    trace: true, // keep an audit trail
  }
)

// 4. Branch on the outcome. vm.run returned; it did not throw.
if (!error) {
  console.log(result, fuelUsed)
  // { city: 'Oslo', summary: 'Clear skies and a high of 21.' }  about 105.6
} else if (error.message === 'Out of Fuel') {
  console.log('the agent ran out of budget at', error.op)
} else if (error.op === 'vm.run') {
  // refused by the VM itself: bad arguments, a broken result contract, the timeout
  console.log('refused:', error.message)
} else {
  // a step failed and the agent did not catch it; error.op names the step
  console.log(error.op, 'failed:', error.message)
}
console.log(trace.map((event) => event.op))
// [ 'varsImport', 'httpFetch', 'llmPredict', 'return', 'seq' ]
// varsImport binds the arguments; seq is the whole program, logged last because an
// event is recorded when its step finishes (see Tracing for audit).
```

`city: 'Paris'` is an **example**, not a default: it declares a required string parameter,
and `'Paris'` is what one looks like. A parameter written with `=` (`budget = 50.0`) has a
default instead and may be left out. The `: { city: '', summary: '' }` after the parameters
declares the shape of the result, and the VM checks it. Both become part of the AST (see
[Arguments and contracts](#arguments-and-contracts)); the language guide has the
[full rules](/DOCS-AJS/#inputoutput-contract).

Change one thing and a different branch runs:

| Change                                          | `error.op`   | `error.message`                                                    |
| ----------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| `allowedFetchDomains: ['other.example']`        | `httpFetch`  | `Fetch blocked: domain not in allowlist. Allowed: other.example`   |
| arguments `{ city: 5 }`                         | `vm.run`     | `Input validation failed: args do not match expected schema`       |
| a model stand-in that returns `42`              | `llmPredict` | `Output validation failed for 'llmPredict'` (it declares a string) |
| `timeoutMs: 20` and a model that never answers  | `vm.run`     | `Execution timeout after 20ms. …`                                  |
| `fuel: 50`                                      | `llmPredict` | `Out of Fuel`                                                      |

**What to branch on.** An `AgentError` has a `message`, an `op` and sometimes a `cause`, and
no machine-readable kind. So today a host tells fuel exhaustion from other failures by its
message, as step 4 does, and tells "refused by the VM" from "a step failed" by `op`. The
result does not say whether an uncaught failure was one the agent could have caught or one
that [ended the run](#catchable-failures-and-run-ending-refusals): a run-ending refusal at
`storeGet` arrives with `op: 'storeGet'`, like any failure there. A host rarely needs to
know: either way the run failed, and `op` says where.

## Transpile where parsing is safe

An AJS program crosses three places: it is **transpiled** where its source is handled, it
**travels** as a JSON AST, and it **runs** on the VM. Keep the first and the last apart.

Parsing is the one step whose cost the author of the source controls and that runs before any
budget exists: fuel, the timeout and the heap ceiling all start with `vm.run`. A run is
metered, a parse is not. So:

- **Run ASTs on `tjs-lang/vm-ast`.** It is the same `AgentVM` with no parser in its bundle
  (well under half the size of `tjs-lang/vm`). Passed a source string, it throws and says
  where to transpile instead. A VM that cannot parse has no parser defect for a payload to
  reach.
- **Transpile with `transpile` from `tjs-lang/lang`**, outside the process you cannot afford
  to lose: on the caller's machine, in a worker, or in a separate process. `transpile` has
  **no size cap by default**. If you must transpile untrusted source in-process, pass
  `maxSourceBytes`; over the cap, `transpile` throws before it parses anything. This is an
  option to `transpile`, separate from the `vm.run` option of the same name (see
  [Run options](#run-options)).
- **Pass `atoms: vm.atoms`.** The transpiler then checks every atom call against the atoms the
  VM will really have, and refuses an input the atom does not declare (`'scrape' has no input
  'href'. It takes scrape({ url })`). Core atoms are always checked; without `atoms`, a call
  to your own atom is not.
- **Store or send the AST as JSON.** It is versioned (`"$ajs": 2` at its root). A VM refuses
  an AST newer than it understands rather than guess at its meaning, and keeps running older
  versions, because stored ASTs must keep working.

`transpile` reports a bad program by throwing a `TranspileError` with a message, a line and a
column, and the message says what to write instead. That is where an agent author, or the
model you are prompting, gets help. The VM does not explain: it runs the AST as written, or
refuses it.

`vm.run(source)` on `tjs-lang/vm` still works and is deprecated. It parses inside the VM host,
capped at 8 KB (`maxSourceBytes`), and notes the deprecation once in the flight recorder (the
runtime's log of failures and near-misses, read with `__tjs.records()`). For agents you wrote
yourself, the `ajs` tagged template (from `tjs-lang`) returns the AST in one step.

Both VMs also accept a **procedure token** (`proc_…`) in place of an AST. The
`storeProcedure` atom returns one: it names an AST kept in a store inside the current
process, and it expires (after an hour by default). It is a handle within one process, not a
way to store an AST.

## Run options

`vm.run(ast, args, options)` reads every option once, checks it, and refuses a bad value as an
error value (`Invalid run option fuel: -1 — it must be a non-negative number`). An option
defined as a getter is refused too: run options are data. The few call mistakes that throw
instead are listed under [What `vm.run` returns](#what-vmrun-returns).

| Option             | Default                                         | What it bounds                                                                                                                                             |
| ------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fuel`             | `1000`                                          | Work. Every step costs fuel; the run stops at `Out of Fuel`. `Infinity` is no limit.                                                                       |
| `timeoutMs`        | twice the slowest atom's timeout, at least 60 s | Wall-clock time for the whole run, including time spent waiting on capabilities. `Infinity` is no limit. Unlike the two options below, `0` is not "off": it means already expired. |
| `maxHeapBytes`     | 64 MB                                           | Bytes the agent holds live at once. Fuel bounds total work, not peak memory.                                                                               |
| `membraneMaxBytes` | 4 MB                                            | The size of one value crossing to or from a capability (an atom's input going out, a capability's return coming in).                                      |
| `argsMaxBytes`     | 4 MB                                            | The run's arguments. The fuel bounds them too: one unit of fuel pays for 8,000 bytes, and a string counts about 2 bytes per character, so roughly 4,000 characters. |
| `maxSourceBytes`   | 8 KB                                            | Source strings: given to `vm.run` on `tjs-lang/vm`, or built by an agent for `runCode` or `transpileCode`. `0` disables it for trusted source; for agent-built source it can only be lowered. |
| `quotas`           | none                                            | Calls per atom, `{ llmPredict: 3 }`. An atom you do not list is unlimited; `0` forbids it.                                                                 |
| `quotaUsed`        | a fresh counter per run                         | The quota tally. Pass one object to several runs to share it (see [Quotas across nested runs](#quotas-across-nested-runs)).                                |
| `costOverrides`    | none                                            | Fuel cost per atom: a number, or `(input, ctx) => number`.                                                                                                 |
| `timeoutOverrides` | none                                            | Per-atom timeout in ms: a number or a function; `0` disables that atom's timeout.                                                                          |
| `signal`           | none                                            | An `AbortSignal`. Aborting ends the run with `Execution aborted by the caller (options.signal)`.                                                           |
| `trace`            | `false`                                         | Records every step (see [Tracing for audit](#tracing-for-audit)).                                                                                          |
| `capabilities`     | `{}`                                            | The only IO the agent has: `fetch`, `store`, `llm`, `agent` and any your own atoms read (see [Capabilities](#capabilities)).                               |
| `context`          | none                                            | Request-scoped data for the VM and your atoms (see [Fetch policy](#fetch-policy)).                                                                         |

**Sizing fuel.** Each atom has a cost, on `vm.atoms[name].cost`: a number, or a function of
the input. Data steps are fractions of a unit, `httpFetch` costs 5 and `llmPredict` 100,
which is why the host above spends about 105.6. To pick a budget, run the agent once with
`trace: true` on typical arguments, read `fuelUsed`, and allow headroom for the inputs that
make it loop longer.

**The default timeout is generous, on purpose.** Without `timeoutMs`, a run gets twice the
timeout of the slowest atom registered on the VM, and never less than a minute. Most core
atoms time out after one second (control atoms such as `seq` and `while` have no timeout of
their own). `httpFetch` and `llmPredict` are core atoms too, with 30 s and 120 s; the model
call is the slowest, so a VM with only core atoms gives a run 240 s, and registering a slower
atom raises it. That suits a background job. Anything a person waits on should pass its own
`timeoutMs`.

Each atom also has its own timeout. An atom that times out fails like any other step, and
the agent may catch it (`Atom 'llmPredict' timed out`); the run's own timeout ends the run.
When the run ends, for any reason, the VM aborts the run's `AbortSignal`, so nothing it
started is left running. A `fetch` capability receives that signal as `init.signal`; pass it on
to your HTTP client.

**The heap ceiling** is not a running total. The VM keeps a cheap estimate that only grows;
when the estimate crosses the ceiling, the VM measures the bytes the agent can still reach
and fails only if those are over. So a loop that keeps overwriting one variable does not trip
it. When it does fail, the message says how much the agent held:
`Heap limit exceeded: guest state holds ~2MB, limit 1MB`. How it stays true is in
[VM budgets](/vm-budgets/).

## Capabilities

The VM has no IO of its own. Each run gets the capabilities you pass and nothing else: `fetch`
for `httpFetch`, `store` for the store atoms, `llm` for `llmPredict`, `agent` for `agentRun`
with a named agent, and whatever your own atoms read. A missing one is an ordinary failure
(`Capability 'llm.predict' missing`). With no `store`, the store atoms use an in-memory store
that lasts one run, and the result's `warnings` says so.

`agent` is `{ run(agentId, input) }`, returning the sub-agent's `RunResult` (or its result
alone). An agent's `agentRun` names its sub-agent one of two ways:

```javascript
// A name: your agent capability decides what runs, as a new vm.run.
let short = agentRun({ agentId: 'summarize', input: { text } })
// An AST value the agent holds (passed in as an argument, or built with transpileCode):
// it runs inline, inside the current run, with no capability involved.
let out = agentRun({ agentId: helper, input: { text } })
```

The difference matters for [quotas](#quotas-across-nested-runs).

Everything a capability returns crosses the membrane, which builds a fresh copy: JSON data
plus `Date`. A `Response`, a `Map`, a class instance, a function or a getter is refused, and
that refusal ends the run (see
[Catchable failures and run-ending refusals](#catchable-failures-and-run-ending-refusals)).
The interface for each key, the rules for what a capability may return, and how to define
your own atoms are in [Capabilities and Custom Atoms](/ajs-capabilities/).

## Fetch policy

`context` is yours: put request metadata in it (a user id, a tenant) and your own atoms read
it as `ctx.context`. The VM itself reads four keys, all for `httpFetch`:

| Key                     | Type       | Effect                                                                                                                                                                  |
| ----------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allowedFetchDomains`   | `string[]` | The hosts `httpFetch` may reach. `api.example.com` admits the default port only; `api.example.com:8443` names one; `*.example.com` admits the domain and its subdomains. |
| `allowedFetchMethods`   | `string[]` | Methods beyond the default `GET` and `HEAD`. `CONNECT`, `TRACE` and `TRACK` are never admitted.                                                                         |
| `allowedRequestHeaders` | `string[]` | Header names beyond the default list (below).                                                                                                                           |
| `requestDepth`          | number     | How many agent hops deep this request already is. A fetch at depth 10 is refused; 9 is the last allowed.                                                               |

A list must be an array of strings; a single string is refused rather than read one character
at a time.

**The request is admitted the same way whoever sends it.** The scheme must be `http:` or
`https:`, the method must be admitted, and every header the agent sets must be on the list. A
header that is not on it is refused, not dropped. The default list:

| Kind          | Headers                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| Content       | `Accept`, `Accept-Language`, `Content-Language`, `Content-Type`, `Range`                     |
| Caching       | `Cache-Control`, `If-Match`, `If-Modified-Since`, `If-None-Match`, `If-Unmodified-Since`     |
| Credentials   | `Authorization`, `X-API-Key`                                                                |
| Tracing       | `User-Agent`, `X-Request-Id`, `X-Correlation-Id`, `X-Requested-With`                        |

The credential headers are there because calling an API needs them. An agent can only send a
credential it was given, in its arguments or in what a capability returned; it has no secrets
of its own. What stops a credential you gave it from going somewhere else is the domain
allowlist, so set one whenever an agent holds a key.

When `allowedFetchDomains` is set it applies on every path, your own `fetch` capability
included.

**Without a `fetch` capability**, `httpFetch` uses a built-in client meant for demonstrations.
It fetches nothing unless `allowedFetchDomains` is set, follows no redirects (a redirect comes
back to the agent as `{ redirect: true, status, location }`, and fetching `location` is a new
request, admitted again), sends no cookies or HTTP authentication, and reads the body under
`membraneMaxBytes`.

**With your own `fetch` capability**, the VM still admits the scheme, method and headers (and
the domain, when `allowedFetchDomains` is set), then calls your function with the admitted
request. Your function owns the rest: redirects, credentials and rate limits. What it
receives and what it must decide is in
[Capabilities and Custom Atoms](/ajs-capabilities/#writing-a-safe-fetch-capability).

> **Warning.** With your own `fetch` and no `allowedFetchDomains`, the VM checks no
> destination at all. An agent can then ask your function for any URL, internal hosts and
> cloud metadata addresses included, and only your function stands in the way. Set an
> allowlist, or make your `fetch` refuse what it should not reach.

**Agent depth.** Every request carries an `X-Agent-Depth` header one higher than
`context.requestDepth`, and an agent cannot set it. An endpoint that runs agents should read
the header from the incoming request and pass it back in as `requestDepth`; then a loop of
agents calling agents stops after ten hops (`Agent request depth exceeded (max 10)`). It is
cooperative: it stops accidental loops, not an endpoint that drops the header. In a browser
the built-in client sends it only to the page's own origin, because a custom header makes
every cross-origin request a CORS preflight.

[`Eval` and `SafeFunction`](/safe-eval/), the two-line wrappers over this VM, take the same
policy as `fetchPolicy: { domains, methods, headers }`, which becomes `allowedFetchDomains`,
`allowedFetchMethods` and `allowedRequestHeaders`. They cannot set `requestDepth`.

## What `vm.run` returns

`vm.run` resolves to a `RunResult` and does not throw for anything an agent does:

| Field      | What it holds                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `result`   | The agent's returned object. On failure, the same `AgentError` as `error`.                                                                                     |
| `error`    | `undefined` on success, or an `AgentError`: `message`, `op` (the step that failed, or `vm.run`), and `cause` (the host `Error` behind it, when there was one). |
| `fuelUsed` | Fuel spent, including what admitting the arguments cost.                                                                                                       |
| `trace`    | The step log, when `trace: true`.                                                                                                                              |
| `warnings` | Non-fatal notes, such as the default in-memory store being used.                                                                                               |

`result` holds the error on failure so that code which keeps only `result` (the function
`createAgent` returns resolves to it) still receives the failure rather than `undefined`. It
also means a failed run's `result` is not a successful value: always test `error`, or
`isAgentError(result)`, before using it.

An `AgentError` serializes as `{ "$error": true, "message": …, "op": … }`, so a result sent
over the network still says it is an error. `isAgentError(value)` (from `tjs-lang/vm-ast`,
`tjs-lang/vm` or `tjs-lang`) recognises both the object and its JSON form. `cause` stays on
the host side and is not serialized.

A bad option value comes back as an error value. `vm.run` **throws** only when what it was
handed cannot be a program to run, before anything runs:

- a source string on `tjs-lang/vm-ast`;
- on the deprecated `tjs-lang/vm` source path, source that does not transpile
  (`AJS transpilation failed: …`; oversized source comes back as an error value instead);
- an AST whose root is not a `seq`;
- an AST format newer than this build;
- `capabilities` that is not an object.

## Catchable failures and run-ending refusals

Inside an agent, `try`/`catch` catches **failures of the world**: a fetch that fails or is
blocked, a store that throws, a model that times out, a quota spent, an answer too large to
copy in. A program might reasonably retry or work around any of them. The agent's `catch`
receives the error's message, a capped string, not an `Error` object.

Some failures **end the run**, even inside a `try`. No `catch` block runs, and no later step.
Three rules decide which:

- **The budget ends the run.** Out of fuel, the run's own timeout, and your `signal`.
- **Every outbound refusal ends the run.** The agent chose what to send, so an atom input that
  does not match what the atom declares (`httpFetch({ url: 5 })`), or a value too large or not
  plain data to copy out to a capability, is the program's bug. An agent that sends
  `storeSet` a 5,000-character value under a 1,024-byte `membraneMaxBytes` ends with
  `'storeSet': the value exceeds the 1024-byte membrane budget`, and its `catch` never runs.
- **An inbound refusal ends the run only if plain JSON could not have done it.** A server can
  send back four megabytes, so an oversized answer is the world's and is catchable. A server
  cannot send back a `Map`, so a `Map` is a bug in your capability, and letting the agent
  catch it would let it loop on your bug.

Here is the same agent run against three stores:

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const { ast } = transpile(
  `
function lookup({ id: 'a1' }) {
  try {
    let record = storeGet({ key: id })
    return { record }
  } catch (err) {
    return { failed: err }
  }
}`,
  { atoms: vm.atoms }
)

const run = (get, options = {}) =>
  vm.run(ast, { id: 'a1' }, {
    capabilities: { store: { get, set: async () => {} } },
    ...options,
  })

// The world's failure: the store is down. The agent's catch runs.
const down = await run(async () => {
  throw new Error('store unavailable')
})
console.log(down.result) // { failed: 'store unavailable' }   err is the message string

// The world's failure: the answer is too large. Also catchable.
const big = await run(async () => 'x'.repeat(5000), { membraneMaxBytes: 1024 })
console.log(big.result.failed)
// "Capability boundary rejected the return of 'storeGet': the value exceeds the
//  1024-byte membrane budget"

// The host's bug: JSON cannot express a Map. The run ends; the catch never runs.
const map = await run(async () => new Map([['name', 'Ada']]))
console.log(map.error.op, map.error.message)
// storeGet "Capability boundary rejected the return of 'storeGet': capability return
//  contains a Map; only plain data (and Date) crosses, … use an object, or an array of
//  [key, value] pairs"
```

Every copy across the boundary is paid for in fuel, refused or not, so an agent that retries a
catchable refusal in a loop pays each time. A sub-agent served by your `agent` capability is a
separate run: a refusal ends that run, and the parent sees an ordinary, catchable failure.

## Arguments and contracts

The arguments cross the same membrane as a capability's return, before the agent runs:

- **They are copied.** The agent gets JSON data plus `Date`, never a live host object. A class
  instance is refused rather than thinned, because its getters and private fields would
  silently read as `undefined`: `Capability boundary rejected the run arguments: run argument
  contains an instance of Rec; … convert it to a plain object first`.
- **They are capped and charged**, by `argsMaxBytes` and by the run's fuel. Arguments the fuel
  cannot pay to admit end the run as `Out of Fuel` before the first step.
- **They are checked against the parameters.** The agent's parameter examples travel in the
  AST as `inputSchema`, and arguments that do not match are refused with
  `Input validation failed: args do not match expected schema`, from `vm.run`, before the
  agent runs. An example's kind is what it says: `40` declares an integer, so `8.5` is
  refused; write `40.0` for a number that may have a fraction.
- **A declared result is checked after.** `function forecast(…): { city: '', summary: '' }`
  puts an `outputSchema` in the AST; a successful run whose result does not match ends with
  `Result does not match the declared result type`. The check is paid from the fuel left.

What the two contracts accept, member by member, is in
[the language guide](/DOCS-AJS/#inputoutput-contract). Both live in the AST, so any VM that
runs it enforces them, wherever it was transpiled.

## Quotas across nested runs

A quota counts calls within **one run**. A sub-agent started inline (`agentRun` with an AST)
shares its parent's run and its counter. A sub-agent served by your `agent` capability is a
new `vm.run`, and a new run starts a fresh counter, so an agent that can reach one could
multiply its allowance. To hold a cap across the whole call tree, pass the same `quotaUsed`
object to every run in it:

```typescript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const compile = (source) => transpile(source, { atoms: vm.atoms }).ast
const agents = {
  summarize: compile(`
function summarize({ text: '' }) {
  let summary = llmPredict({ prompt: \`Summarize: \${text}\` })
  return { summary }
}`),
  triage: compile(`
function triage({ ticket: '' }) {
  let label = llmPredict({ prompt: \`Label: \${ticket}\` })
  let short = agentRun({ agentId: 'summarize', input: { text: ticket } })
  return { label, summary: short.summary }
}`),
}

let modelCalls = 0
const llm = {
  predict: async (prompt) => `answer ${++modelCalls}`,
}

function runAgent(name, input, quotaUsed) {
  return vm.run(agents[name], input, {
    quotas: { llmPredict: 1 },
    quotaUsed,
    capabilities: {
      llm,
      // A named sub-agent is a NEW run. Handing it the same quotaUsed makes it
      // draw on the parent's allowance instead of starting its own.
      agent: { run: (id, input) => runAgent(id, input, quotaUsed) },
    },
  })
}

const separate = await runAgent('triage', { ticket: 'login fails' })
console.log(modelCalls, separate.result)
// 2 { label: 'answer 1', summary: 'answer 2' }   one call per run

modelCalls = 0
const quotaUsed = {}
const shared = await runAgent('triage', { ticket: 'login fails' }, quotaUsed)
console.log(modelCalls, shared.error.op, shared.error.message, quotaUsed)
// 1 agentRun "Quota exceeded for 'llmPredict': 1 call allowed" { llmPredict: 1 }
```

`quotaUsed` is **trusted host state**. The VM checks each count as it reads it (a finite,
non-negative number) and refuses a frozen or read-only object up front. A run also keeps its
own count of the calls it made: if the shared object is reset to `0` mid-run, that run goes
on counting from its own tally. A nested run, though, starts with no tally of its own, so
one started with a doctored object believes it. Do not build `quotaUsed` from anything an
agent or a remote party can write. Across a process or network boundary there is nothing to
share: budget does not travel, only data does, so each side enforces its own.

## Agents as tools

`transpile` also returns a `signature`: the entry function's name, its JSDoc description, each
parameter's type, example or default and description, and the declared result. `createAgent`
and `getToolDefinitions` (both from `tjs-lang/lang`) turn it into something a model can be
offered:

```typescript
import { createAgent, getToolDefinitions } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const shortlist = createAgent(
  `
/**
 * Pick the items that fit a budget.
 * @param budget - the most to spend
 */
function shortlist({ items = [{ name: 'kettle', price: 40.0 }], budget = 50.0 }) {
  let fits = items.filter((item) => item.price <= budget)
  let names = fits.map((item) => item.name)
  return { names }
}`,
  new AgentVM(),
  { fuel: 1000 }
)

await shortlist({ items: [{ name: 'mug', price: 8.5 }], budget: 30 }) // { names: ['mug'] }
shortlist.signature.description // 'Pick the items that fit a budget.'
getToolDefinitions({ shortlist })
// [{ type: 'function', function: { name: 'shortlist',
//    description: 'Pick the items that fit a budget.',
//    parameters: { type: 'object', properties: {
//      items: { type: 'array', items: { type: 'object', properties: {
//        name: { type: 'string' }, price: { type: 'number' } } } },
//      budget: { type: 'number', description: 'the most to spend' } },
//    required: [] } } }]
```

`required` is empty because both parameters are written with `=` and have defaults.

One gap to know about: an **integer** example (`price: 40`, `budget = 50`) currently comes
out of `getToolDefinitions` with no `type` at all (`price: {}`), so the model is not told the
parameter is a number. Floats, strings, booleans, arrays and objects are typed.

The agent `createAgent` returns resolves to the run's `result`, which on failure is the
`AgentError`; check it with `isAgentError`. `createAgent` transpiles the source where it
runs, with no size cap, so use it for agents you wrote. For source you did not write, keep the
[transpile-then-run split](#transpile-where-parsing-is-safe): `getToolDefinitions` takes any
object with a `signature`, so the one `transpile` returned is enough.

```typescript
import { transpile, getToolDefinitions } from 'tjs-lang/lang'
import { AgentVM, isAgentError } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
// On the transpiling side:
const { ast, signature } = transpile(source, {
  atoms: vm.atoms,
  maxSourceBytes: 16 * 1024,
})
const tools = getToolDefinitions({ shortlist: { signature } })

// On the VM side, when the model calls the tool with arguments:
const { result, error } = await vm.run(ast, args, { fuel: 1000 })
```

## Tracing for audit

With `trace: true`, the result carries one event per step:

```javascript
{
  op: 'varsImport',
  input: { keys: ['city'] },
  stateDiff: { city: 'Oslo' }, // the variables the step changed
  result: undefined,
  error: undefined, // the message, when the step failed by throwing
  fuelBefore: 999.878, // not 1000: admitting the arguments already cost a little
  fuelAfter: 999.677,
  timestamp: 1793989773225, // epoch milliseconds
}
```

An event is recorded when its step finishes, so a block (`seq`, `if`, `try`) appears after
the steps inside it, and the last event is the whole program. `fuelBefore − fuelAfter` is
what a step and everything inside it cost; in the host example above, the model call is about
100 of the 105.6. Store the trace beside the AST and the arguments and you can show what an
agent did, step by step, after the fact.

## Where to run it

The VM runs in any JavaScript environment, browser or server, and the same AST behaves the
same in each. Choose by what you can afford to lose:

- **In-process.** The simplest shape, and enough when the source comes from you or from
  callers who transpile on their side. Fuel, the timeouts, the heap ceiling and the membrane
  all hold. If you transpile untrusted source in the same process, set `maxSourceBytes`.
- **A worker.** Move the transpile step (and the run too, if you like) into a worker. A
  hostile payload that makes parsing slow then costs the worker, not the thread serving your
  requests.
- **A separate process**, or a container. Use this when your threat model includes what a
  JavaScript-in-JavaScript sandbox cannot address: timing side channels, JavaScript-engine
  JIT bugs and memory-level attacks. Process isolation underneath is the only answer to those.

Because the agent only ever sees atoms, the same program can run against a client-side atom
that answers from data already loaded in the browser and a server-side one that queries the
datastore, under one capability model. That design, and what it bought in production, is in
[The universal endpoint](/universal-endpoint/).

## Further reading

- [Safe Eval](/safe-eval/): `Eval` and `SafeFunction`, the two-line entry points onto this VM,
  and the list of what the sandbox guarantees.
- [Capabilities and Custom Atoms](/ajs-capabilities/): writing capabilities and atoms.
- [AJS Patterns](/patterns/): retries, parallel calls and other work that belongs in the host.
- [VM budgets](/vm-budgets/): how fuel, the heap ceiling and the membrane stay true.
