<!--{"parent": "ajs.md", "order": 5}-->
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
    return { problem: e.message } // e.g. "AJS has no `for` loops. Use `while` …"
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
```

Change one thing and a different branch runs:

| Change                                          | `error.op`  | `error.message`                                                     |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| `allowedFetchDomains: ['other.example']`        | `httpFetch` | `Fetch blocked: domain not in allowlist. Allowed: other.example`    |
| arguments `{ city: 5 }`                         | `vm.run`    | `Input validation failed: args do not match expected schema`       |
| a model stand-in that returns `42`              | `llmPredict` | `Output validation failed for 'llmPredict'` (it declares a string) |
| `timeoutMs: 20` and a model that never answers  | `vm.run`    | `Execution timeout after 20ms. …`                                   |
| `fuel: 50`                                      | `llmPredict` | `Out of Fuel`                                                      |

## Transpile where parsing is safe

An AJS program crosses three places: it is **transpiled** where its source is handled, it
**travels** as a JSON AST, and it **runs** on the VM. Keep the first and the last apart.

Parsing is the one step whose cost the author of the source controls and that runs before any
budget exists: fuel, the timeout and the heap ceiling all start with `vm.run`. A run is
metered, a parse is not. So:

- **Run ASTs on `tjs-lang/vm-ast`.** It is the same `AgentVM` with no parser in its bundle
  (about a quarter of the size of `tjs-lang/vm`). Passed a source string, it throws and says
  where to transpile instead. A VM that cannot parse has no parser defect for a payload to
  reach.
- **Transpile with `transpile` from `tjs-lang/lang`**, outside the process you cannot afford
  to lose: on the caller's machine, in a worker, or in a separate process. If you must
  transpile untrusted source in-process, set `maxSourceBytes`; over the cap, `transpile`
  throws before it parses anything.
- **Pass `atoms: vm.atoms`.** The transpiler then checks every atom call against the atoms the
  VM will really have, and refuses an input the atom does not declare (`'scrape' has no input
  'href'. It takes scrape({ url })`). Core atoms are always checked; without `atoms`, a call
  to your own atom is not.
- **Store or send the AST as JSON.** It is versioned (`"$ajs": 2` at its root). A VM refuses
  an AST newer than it understands rather than guess at its meaning, and keeps running older
  ones, which are persisted and so a promise.

`transpile` reports a bad program by throwing a `TranspileError` with a message, a line and a
column, and the message says what to write instead. That is where an agent author, or the
model you are prompting, gets help. The VM does not explain: it runs the AST as written, or
refuses it.

`vm.run(source)` on `tjs-lang/vm` still works and is deprecated. It parses inside the VM host,
capped at 8 KB (`maxSourceBytes`), and notes the deprecation once in the flight recorder. For
agents you wrote yourself, the `ajs` tagged template (from `tjs-lang`) returns the AST in one
step.

## Run options

`vm.run(ast, args, options)` reads every option once, checks it, and refuses a bad one as an
error value (`Invalid run option fuel: -1 — it must be a non-negative number`). An option
defined as a getter is refused too: run options are data.

| Option             | Default                                            | What it bounds                                                                                                   |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `fuel`             | `1000`                                             | Work. Every step costs fuel; the run stops at `Out of Fuel`. `Infinity` is no limit.                             |
| `timeoutMs`        | twice the slowest atom's timeout, at least 60 s    | Wall-clock time for the whole run, including time spent waiting on capabilities. `0` means already expired.      |
| `maxHeapBytes`     | 64 MB                                              | Bytes the agent holds live at once. Fuel bounds total work, not peak memory.                                     |
| `membraneMaxBytes` | 4 MB                                               | The size of one value crossing a capability, in either direction (an atom's input out, a capability's return in). |
| `argsMaxBytes`     | 4 MB                                               | The run's arguments. The fuel bounds them too: one unit of fuel pays for 8,000 bytes.                            |
| `maxSourceBytes`   | 8 KB                                               | Source strings: given to `vm.run` on `tjs-lang/vm`, or built by an agent for `runCode`. `0` disables it for trusted source; for agent-built source it can only be lowered. |
| `quotas`           | none                                               | Calls per atom, `{ llmPredict: 3 }`. An atom you do not list is unlimited; `0` forbids it.                       |
| `quotaUsed`        | a fresh counter per run                            | The quota tally. Pass one object to several runs to share it (see [Quotas across nested runs](#quotas-across-nested-runs)). |
| `costOverrides`    | none                                               | Fuel cost per atom: a number, or `(input, ctx) => number`.                                                       |
| `timeoutOverrides` | none                                               | Per-atom timeout in ms: a number or a function; `0` disables that atom's timeout.                                |
| `signal`           | none                                               | An `AbortSignal`. Aborting ends the run with `Execution aborted by the caller (options.signal)`.                 |
| `trace`            | `false`                                            | Records every step (see [Tracing for audit](#tracing-for-audit)).                                                |
| `capabilities`     | `{}`                                               | The only IO the agent has: `fetch`, `store`, `llm`, `agent` and any your own atoms read.                          |
| `context`          | none                                               | Request-scoped data for the VM and your atoms (see [Fetch policy](#fetch-policy)).              |

**The default timeout is generous, on purpose.** Without `timeoutMs`, a run gets twice the
timeout of the slowest atom registered on the VM, and never less than a minute. Most core
atoms time out after one second (control atoms such as `seq` and `while` have no timeout of
their own), `httpFetch` after 30 s and `llmPredict` after 120 s, so a VM with only core atoms
gives a run four minutes, and registering a slower atom raises it.
That suits a background job. Anything a person waits on should pass its own `timeoutMs`.

Each atom also has its own timeout. An atom that times out fails like any other step, and
the agent may catch it (`Atom 'llmPredict' timed out`); the run's own timeout ends the run.
When the run ends, for any reason, the VM aborts the run's `AbortSignal`, so nothing it
started is left running. A `fetch` capability receives that signal as `init.signal`; pass it on
to your HTTP client.

**The heap ceiling** measures what is actually reachable when it fires, not a running total,
so a loop that keeps overwriting one variable does not trip it. When it does fire, the message
says how much the agent held: `Heap limit exceeded: guest state holds ~2MB, limit 1MB`. How it
stays true is in [VM budgets](/vm-budgets/).

## Fetch policy

`context` is yours: put request metadata in it (a user id, a tenant) and your own atoms read
it as `ctx.context`. The VM itself reads four keys, all for `httpFetch`:

| Key                     | Type       | Effect                                                                                                  |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `allowedFetchDomains`   | `string[]` | The hosts `httpFetch` may reach. `api.example.com` admits the default port only; `api.example.com:8443` names one; `*.example.com` admits the domain and its subdomains. |
| `allowedFetchMethods`   | `string[]` | Methods beyond the default `GET` and `HEAD`. `CONNECT`, `TRACE` and `TRACK` are never admitted.         |
| `allowedRequestHeaders` | `string[]` | Header names beyond the default list (below).                                                           |
| `requestDepth`          | number     | How many agent hops deep this request already is. The VM refuses to fetch at 10.                        |

A list must be an array of strings; a single string is refused rather than read one character
at a time.

**The request is admitted the same way whoever sends it.** The scheme must be `http:` or
`https:`, the method must be admitted, and every header the agent sets must be on the list:
`Accept`, `Accept-Language`, `Authorization`, `Cache-Control`, `Content-Language`,
`Content-Type`, `If-Match`, `If-Modified-Since`, `If-None-Match`, `If-Unmodified-Since`,
`Range`, `User-Agent`, `X-API-Key`, `X-Request-Id`, `X-Correlation-Id` and
`X-Requested-With`. A header that is not on it is refused, not dropped. When
`allowedFetchDomains` is set it applies on every path, your own `fetch` capability included.

**Without a `fetch` capability**, `httpFetch` uses a built-in client meant for demonstrations.
It fetches nothing unless `allowedFetchDomains` is set, follows no redirects (a redirect comes
back to the agent as `{ redirect: true, status, location }`, and fetching `location` is a new
request, admitted again), sends no cookies or HTTP authentication, and reads the body under
`membraneMaxBytes`.

**With your own `fetch` capability**, the VM still admits the scheme, method and headers (and
the domain, when `allowedFetchDomains` is set), then calls your function with the admitted
request. Your function owns the rest: redirects, credentials, rate limits, and the destination
when no allowlist is set. What it receives and what it must decide is in
[Capabilities and Custom Atoms](/ajs-capabilities/#writing-a-safe-fetch-capability).

**Agent depth.** Every request carries an `X-Agent-Depth` header one higher than
`context.requestDepth`, and an agent cannot set it. An endpoint that runs agents should read
the header from the incoming request and pass it back in as `requestDepth`; then a loop of
agents calling agents stops at ten hops (`Agent request depth exceeded (max 10)`). It is
cooperative: it stops accidental loops, not an endpoint that drops the header. In a browser
the built-in client sends it only to the page's own origin, because a custom header makes
every cross-origin request a CORS preflight.

`Eval` and `SafeFunction` take the same policy as `fetchPolicy: { domains, methods, headers }`,
which becomes `allowedFetchDomains`, `allowedFetchMethods` and `allowedRequestHeaders`. They
cannot set `requestDepth`.

## Capabilities

The VM has no IO of its own. Each run gets the capabilities you pass and nothing else: `fetch`
for `httpFetch`, `store` for the store atoms, `llm` for `llmPredict`, `agent` for `agentRun`
with a named agent, and whatever your own atoms read. A missing one is an ordinary failure
(`Capability 'llm.predict' missing`). With no `store`, the store atoms use an in-memory store
that lasts one run, and the result's `warnings` says so.

Everything a capability returns crosses a membrane that builds a fresh copy: JSON data plus
`Date`. A `Response`, a `Map`, a class instance, a function or a getter is refused, and that
refusal ends the run (next section). The interface for each key, the rules for what a
capability may return, and how to define your own atoms are in
[Capabilities and Custom Atoms](/ajs-capabilities/).

## What `vm.run` returns

`vm.run` resolves to a `RunResult` and does not throw for anything an agent does:

| Field      | What it holds                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `result`   | The agent's returned object. On failure, the same `AgentError` as `error`.                         |
| `error`    | `undefined` on success, or an `AgentError`: `message`, `op` (the step that failed, or `vm.run`), and `cause` (the host `Error` behind it, when there was one). |
| `fuelUsed` | Fuel spent, including what admitting the arguments cost.                                           |
| `trace`    | The step log, when `trace: true`.                                                                 |
| `warnings` | Non-fatal notes, such as the default in-memory store being used.                                  |

An `AgentError` serializes as `{ "$error": true, "message": …, "op": … }`, so a result sent
over the network still says it is an error. `isAgentError(value)` (from `tjs-lang/vm-ast`,
`tjs-lang/vm` or `tjs-lang`) recognises both the object and its JSON form. `cause` stays on
the host side and is not serialized.

`vm.run` throws only for mistakes in the host's own call, before anything runs: a source
string on `tjs-lang/vm-ast`, an AST whose root is not a `seq`, an AST format newer than this
build, or `capabilities` that is not an object.

## Catchable failures and run-ending refusals

Inside an agent, `try`/`catch` catches **failures of the world**: a fetch that fails or is
blocked, a store that throws, a model that times out, a quota spent, an answer too large to
copy in. A program might reasonably retry or work around any of them.

Some failures **end the run**, even inside a `try`. No `catch` block runs, and no later step:

- **Out of fuel**, and the run's own timeout or your `signal`.
- **The program's bug at the capability boundary**: an atom called with input that does not
  match what it declares (`httpFetch({ url: 5 })`), or a value too large or not plain data to
  copy out to a capability.
- **The host's bug at the capability boundary**: a capability that returns something JSON
  cannot express.

The test that sorts a refusal into one group or the other is one question: **could plain JSON
have done this?** A server can send back four megabytes, so an oversized answer is the world's
and is catchable. A server cannot send back a `Map`, so a `Map` is a bug in your capability,
and letting the agent catch it would let it loop on your bug. Here is the same agent run
against three stores:

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
console.log(down.result) // { failed: 'store unavailable' }

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
  agent runs.
- **A declared result is checked after.** `function forecast(…): { city: '', summary: '' }`
  puts an `outputSchema` in the AST; a successful run whose result does not match ends with
  `Result does not match the declared result type`. The check is paid from the fuel left.

What the two contracts accept, member by member, is in
[the language guide](/DOCS-AJS/#input-output-contract). Both live in the AST, so any VM that
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
non-negative number) and refuses a frozen or read-only object up front, and a run never counts
below its own tally, but a nested run believes what it is given. Do not build it from anything
an agent or a remote party can write. Across a process or network boundary there is nothing to
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
function shortlist({ items = [{ name: 'kettle', price: 40 }], budget = 50 }) {
  let fits = items.filter((item) => item.price <= budget)
  let names = fits.map((item) => item.name)
  return { names }
}`,
  new AgentVM(),
  { fuel: 1000 }
)

await shortlist({ items: [{ name: 'mug', price: 8 }], budget: 30 }) // { names: ['mug'] }
shortlist.signature.description // 'Pick the items that fit a budget.'
getToolDefinitions({ shortlist })
// [{ type: 'function', function: { name: 'shortlist',
//    description: 'Pick the items that fit a budget.',
//    parameters: { type: 'object', properties: { items: {…},
//      budget: { description: 'the most to spend' } }, required: [] } } }]
```

The agent `createAgent` returns resolves to the run's `result`, which on failure is the
`AgentError`; check it with `isAgentError`. `createAgent` transpiles the source where it
runs, with no size cap, so use it for agents you wrote. For source you did not write, keep the
[transpile-then-run split](#transpile-where-parsing-is-safe) and build tool definitions from
the `signature` that `transpile` returned.

## Tracing for audit

With `trace: true`, the result carries one event per step:

```javascript
{
  op: 'varsImport',
  input: { keys: ['city'] },
  stateDiff: { city: 'Oslo' }, // the variables the step changed
  result: undefined,
  error: undefined, // the message, when the step failed by throwing
  fuelBefore: 999.878,
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
