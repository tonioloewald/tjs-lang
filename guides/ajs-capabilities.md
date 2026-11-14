<!--{"parent": "embedding-the-vm.md", "order": 2}-->
<!-- TODO review -->

# Capabilities and Custom Atoms

An agent can only do what its host hands it. This chapter is for the host: how to give an agent
network, storage and a model, what those functions may return, and how to add operations of your
own without opening a hole in the sandbox.

Two words carry the whole chapter:

- An **atom** is an operation an agent calls by name, such as `httpFetch({ url })`. It declares
  the inputs it takes, what it returns, and what it costs in fuel. The VM ships about fifty core
  atoms, plus six battery atoms, and you can add more.
- A **capability** is a host function that an atom calls to reach the world: your `fetch`, your
  store, your model client. You pass capabilities to each run, in `capabilities`.

Three more terms recur:

- **Fuel** is the run's work budget. Every atom and every expression step spends some, and the
  run stops with `Out of Fuel` when it is gone. A run gets 1000 by default; a `storeGet` costs 5,
  an `httpFetch` 5 and an `llmPredict` 100. The full table is in
  [What a run costs](/DOCS-AJS/#what-a-run-costs).
- The **guest** is the agent: its code and every value it holds.
- The **boundary** is the copy that every value crossing between guest and capability goes
  through, in both directions. An atom tagged `'io'` (the default) puts its inputs and its return
  through it.

An agent never sees a capability. A call to an IO atom goes like this:

1. The agent calls the atom with named inputs: `httpFetch({ url })`.
2. The VM checks the call's quota and charges its fuel.
3. **Outbound copy.** The inputs are copied out of the guest and checked against the atom's
   input schema.
4. The atom's body runs and calls the capability you passed for this run.
5. **Inbound copy.** Whatever the capability returns is copied back in as plain data and checked
   against the atom's output schema.
6. The agent gets the copy.

When a capability is absent, the atom decides what happens. With no `fetch`, `httpFetch` uses
the built-in client, which fetches nothing unless the run names the domains it may reach. With no
`llm`, `llmPredict` fails with `Capability 'llm.predict' missing`.

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const source = `function lookup({ id = 'u1' }) {
  let user = storeGet({ key: 'user:' + id })
  let summary = llmPredict({ prompt: 'Describe this user in one line: ' + JSON.stringify(user) })
  return { user, summary }
}`

const data = new Map([['user:u1', { name: 'Ada', role: 'admin' }]])

const vm = new AgentVM()
// atoms: vm.atoms lets the transpiler check every atom call (see Registering atoms)
const { ast } = transpile(source, { atoms: vm.atoms })
const run = await vm.run(ast, { id: 'u1' }, {
  fuel: 1000,
  capabilities: {
    store: {
      get: async (key) => data.get(key),
      set: async (key, value) => void data.set(key, value),
    },
    llm: { predict: async (prompt) => `(model reply to ${prompt.length} chars)` },
  },
  // request-scoped data for the VM: here, the only domains the built-in client may fetch
  context: { allowedFetchDomains: ['api.example.com'] },
})
console.log(run.result)
// → { user: { name: 'Ada', role: 'admin' }, summary: '(model reply to 61 chars)' }
```

`vm.run` resolves to `{ result, error, fuelUsed, … }` and does not throw for anything the agent
does; [What `vm.run` returns](/ajs-host/#what-vmrun-returns) has every field.

Capabilities are passed per run, not per VM. One `AgentVM` can serve many agents, each with a
different set. This chapter refers to several other run options (`context`, `quotas`,
`quotaUsed`, `timeoutOverrides`, `membraneMaxBytes`, `maxHeapBytes`); each is described in
[Run options](/ajs-host/#run-options).

---

## The Capabilities interface

These are the keys the built-in atoms look for. Any key you add is yours to read from your own
atoms. In the table, `data` means plain data, as defined in
[What a capability may return](#what-a-capability-may-return).

| Key          | Signature                                                   | Used by                                                                                                     | When absent                                                                              |
| ------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `fetch`      | `(url, init) => Promise<data>`                              | `httpFetch`                                                                                                 | The built-in client, limited to `context.allowedFetchDomains`                            |
| `store`      | `{ get, set, query?, queryPredicate?, vectorSearch?, … }`   | `storeGet`, `storeSet`, `storeQuery`, `storeQueryWhere`, `storeVectorSearch`; battery atoms `storeSearch`, `storeCreateCollection`, `storeVectorAdd` | A fresh in-memory store for each run                                                     |
| `llm`        | `{ predict(prompt, options?) => Promise<string>, embed? }`  | `llmPredict`                                                                                                | `llmPredict` fails: `Capability 'llm.predict' missing`                                   |
| `agent`      | `{ run(agentId, input) => Promise<data> }`                  | `agentRun`, for an `agentId` that is neither an AST nor a stored procedure token                            | `agentRun` with such an id fails: `Capability 'agent.run' missing`                       |
| `code`       | `{ transpile(source) => ast }`                              | `runCode`, `transpileCode`                                                                                  | Both fail: `Capability 'code.transpile' missing. …`                                      |
| `xml`        | `{ parse(xml) => Promise<data> }`                           | `xmlParse`                                                                                                  | `xmlParse` fails: `Capability 'xml.parse' missing`                                       |
| `clock`      | `{ now() => number }`, synchronous                          | `Date.now()`, `Date()` with no argument                                                                     | Those calls fail: `Date.now() needs the 'clock' capability: …`                           |
| `random`     | `{ next() => number }`, synchronous, in [0, 1)              | `Math.random()`, `random`, `uuid`                                                                           | Those calls fail: `Math.random() needs the 'random' capability: …`                       |
| `llmBattery` | `{ predict(system, user, tools?, responseFormat?), embed }` | `llmPredictBattery`, `llmVision` (battery atoms)                                                            | Those atoms fail                                                                         |
| `vector`     | `{ embed(text) => Promise<number[]> }`                      | `storeVectorize` (battery atom)                                                                             | `storeVectorize` fails                                                                   |

Every failure in the last column is an ordinary error the agent can catch. What each atom sends
and returns is in the [Atom Reference](/ajs-atoms/). What follows is what your function
receives.

### fetch

`httpFetch({ url, method, headers, body, responseType })` admits the request, then calls your
function:

```javascript
fetch(url, {
  method, //       'GET', 'POST', … (upper case), or undefined when the agent gave none
  headers, //      the agent's headers, plus X-Agent-Depth (added by the VM)
  body, //         the agent's body AS DATA: an object stays an object; serialize it yourself
  signal, //       the run's AbortSignal: pass it on, so a timed-out run cancels the request
  responseType, // 'json' | 'text' | 'dataUrl' if the agent asked, else undefined
})
```

Whatever your function resolves to is what the agent's `httpFetch` returns. Return the body, or
a small object such as `{ ok, status, body }`; never the `Response` (see
[What a capability may return](#what-a-capability-may-return)). A throw becomes an ordinary error
the agent can catch, with your message.

**The VM checks these whatever `fetch` you pass:**

- The URL is `http:` or `https:`. A plain relative path (`/users/1`) is also handed to your
  function when no allowlist is set, so decide what it means or refuse it.
- The method is GET or HEAD, unless `context.allowedFetchMethods` adds more.
- Every header name is on a closed list: `accept`, `accept-language`, `authorization`,
  `cache-control`, `content-language`, `content-type`, the four `if-…` conditional headers,
  `range`, `user-agent`, `x-api-key`, `x-request-id`, `x-correlation-id` and
  `x-requested-with`. `context.allowedRequestHeaders` adds names.
- The request depth (`context.requestDepth`) is below 10.
- When `context.allowedFetchDomains` is set, the host is on it.

**Your `fetch` owns everything else:** which hosts it reaches when no allowlist is set,
redirects, cookies and other ambient credentials, how much of the body it reads, rate limits and
retries, and what `responseType` means. The boundary still refuses a return over
`membraneMaxBytes` (4MB by default), but only after your function has read it into memory.

The built-in client makes those decisions like this: it follows no redirects and returns one as
`{ redirect: true, status, location }` with `location` made absolute; it sends no cookies; it
reads at most `membraneMaxBytes` of the body; it returns parsed JSON for a JSON content type or
`responseType: 'json'`, a `data:` URL for `responseType: 'dataUrl'`, and text otherwise.
[Writing a safe fetch capability](#writing-a-safe-fetch-capability) builds one that makes the
same decisions. [Fetch policy](/ajs-host/#fetch-policy) has the run options in full.

### store

```javascript
const store = {
  get: async (key) => value, //       storeGet({ key })
  set: async (key, value) => {}, //   storeSet({ key, value })
  // optional:
  query: async (query) => [rows], //  storeQuery({ query }); what `query` means is yours
  queryPredicate: async ({ collection, predicate, limit }) => [rows], // storeQueryWhere
  vectorSearch: async (collection, vector, k, filter) => [docs], // storeVectorSearch passes no
  //                                     filter; only the battery atom storeSearch passes one
}
```

Only `get` and `set` are required. `storeQuery` returns `[]` when your store has no `query`, and
`storeVectorSearch` returns `[]` without `vectorSearch`. `storeQueryWhere` is the exception: the
agent calls `storeQueryWhere`, the VM calls your `queryPredicate`, and without one it fails
(`Capability 'store.queryPredicate' missing …`) rather than return unfiltered rows, because a
filter that silently does not filter is a data leak. Its `predicate` is a canonical verified
predicate, built with `canonicalizePredicate` from `tjs-lang/lang`: a pure function in a
normalized form, with a `key` that is the same for any two predicates that mean the same thing.
The store can evaluate it next to the data, and cache results on that `key`.

When you pass no `store`, each run gets its own in-memory store, discarded when the run ends. So
this agent, run without a store, always returns a count of 1, because every run starts empty:

```ajs
function visits({ page = '/home' }) {
  let before = storeGet({ key: page })
  let count = (before ?? 0) + 1
  storeSet({ key: page, value: count })
  return { page, count }
}
```

It returns `{ page: '/home', count: 1 }`. Pass a `store` and the count survives between runs.

### llm

`llmPredict({ prompt, options })` calls `llm.predict(prompt, options)` and must get a **string**
back. Anything else, including `null`, fails output validation, which the agent can catch.

`options` arrives as the agent wrote it, after the VM has checked it. Only these keys are
admitted: `model`, `temperature`, `maxTokens`, `max_tokens`, `topP`, `top_p`, `stop`, `seed`,
`responseFormat`, `tools`. Any other key fails the call (an agent cannot pass `apiKey` or
`baseUrl` to your client). `responseFormat` arrives in OpenAI's `response_format` shape, one of
`{ type: 'text' }`, `{ type: 'json_object' }` or `{ type: 'json_schema', json_schema: { name,
schema } }`, and its schema and any `tools` schemas have already been checked against the
restricted schema dialect agents may use. Map them to your provider's request yourself; nothing
is forwarded for you.

`predict` receives no `AbortSignal`. When the run times out, or `llmPredict`'s own 120-second
timeout passes, the agent stops waiting, but your request keeps going unless you bound it
yourself, as the example does with `AbortSignal.timeout`:

```javascript
const llm = {
  async predict(prompt, options = {}) {
    const res = await fetch('https://llm.internal/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: 'house-model', // the host picks the model; ignore options.model if you prefer
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature,
        max_tokens: options.maxTokens ?? options.max_tokens,
        response_format: options.responseFormat,
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`model server: HTTP ${res.status}`)
    const json = await res.json()
    // content is null when the model answers with tool calls: turn that into a string
    return json.choices[0].message.content ?? ''
  },
}
```

The API key lives in the capability, where the agent cannot read it. `embed` is part of the
interface for your own atoms; no core atom calls it.

### agent

`agentRun({ agentId, input })` runs a sub-agent. When `agentId` is an AST, or a token returned
by `storeProcedure` (see [Stored procedures](/ajs-atoms/#stored-procedures)), the sub-agent runs
inside the current run on the same fuel and needs no capability. Any other `agentId` (a name, a
URL) goes to `agent.run(agentId, input)`, which receives copies of both. Return the sub-agent's
result. If you return the `RunResult` of your own `vm.run` (the `{ result, error, … }` object),
the atom unwraps it and turns its `error` into an error in the caller.

A new `vm.run` inside `agent.run` starts a fresh fuel budget and fresh quotas. To hold a quota
(a cap on calls per atom, such as `quotas: { llmPredict: 3 }`) across the nested run, pass the
same `quotaUsed` counter object to both runs; see
[Quotas across nested runs](/ajs-host/#quotas-across-nested-runs).

### code

`runCode({ code, args })` and `transpileCode({ code })` let an agent compile AJS it wrote itself.
Both need `code.transpile(source)`, which returns the AST. Pass the VM's atoms so calls in the
generated code are checked like any other:

```javascript
const code = { transpile: (source) => transpile(source, { atoms: vm.atoms }).ast }
```

This puts a parser back on the agent's path. `tjs-lang/vm-ast` has none, so that nothing an
agent sends can reach parser code, and this capability runs the parser on source the agent
chose. Source over 8KB is refused before it reaches you, because parsing runs before fuel can
stop it; a run's `maxSourceBytes` can lower that cap but not raise it. Where a slow parse would
hurt, run `transpile` in a worker. [Transpile where parsing is safe](/ajs-host/#transpile-where-parsing-is-safe)
explains the trade-off.

`runCode`'s program shares the run's fuel, its heap budget (`maxHeapBytes`, the bytes the agent
may hold at once) and its capabilities, but sees only the `args` it is given.

### xml

`xmlParse({ str })` calls `xml.parse(str)` with the agent's string and returns what it resolves
to, under the same rules as every other capability: plain data only, through the boundary.

### clock and random

An agent has no clock and no random number generator of its own: time and randomness are
granted, like everything else. `clock.now()` returns milliseconds since the epoch and
`random.next()` a number from 0 up to 1. Both are called synchronously, from inside an
expression, so they must return a number, not a Promise; what they return is checked, and a
string, `NaN`, a Promise or a value out of range is refused.

```javascript
import { AgentVM, systemClock, systemRandom } from 'tjs-lang/vm-ast'

// the real ones
await vm.run(ast, args, { capabilities: { clock: systemClock, random: systemRandom } })

// a simulation clock that the host advances, and a seeded random source
let tick = 0
const clock = { now: () => tick * 16 } // 16 ms per frame
let seed = 42
const random = { next: () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646 }
await vm.run(ast, args, { capabilities: { clock, random } })
```

Withholding them is the default: a run with neither cannot read the time or draw a random
number, so it cannot time anything and its result depends only on its inputs. `Eval`,
`SafeFunction` and the batteries grant `systemClock` and `systemRandom` unless you pass your own
(or `clock: undefined` to withhold one). A `cache` entry's expiry uses the granted clock when
there is one, so a replay sees the same hits and misses. Why this is a capability, and what it
protects against, is in [The Sandbox](/ajs-sandbox/#time-and-randomness-are-capabilities).

### llmBattery and vector (the batteries)

The batteries are the zero-config local setup: an OpenAI-compatible model server (LM Studio, MLX)
for chat and embeddings, plus an in-memory key-value and vector store. The battery atoms are
registered on the VM; the capabilities come from `getBatteries()`:

```javascript
import { AgentVM, batteryAtoms } from 'tjs-lang/vm-ast' // also exported by tjs-lang/vm
import { getBatteries } from 'tjs-lang/batteries'

const vm = new AgentVM(batteryAtoms)
const batteries = await getBatteries() // probes the local server once, then caches the audit

// batteries = {
//   llmBattery, // { predict(system, user, tools, responseFormat), embed }
//   vector, //     { embed }
//   store, //      key-value plus createCollection / vectorAdd / vectorSearch
//   models, //     what the audit found
// }
const run = await vm.run(ast, args, { fuel: 1000, capabilities: batteries })
```

`llmBattery` and `models` are `null`, and `vector` is `undefined`, only in a browser page served
over HTTPS, which cannot call a local `http:` endpoint. The battery atoms then fail with a
"missing" error the agent can catch. Anywhere else the capabilities are always present: when no
server answers, `getBatteries()` logs that it could not connect and still returns them, and each
call then fails at the connection, again as an error the agent can catch. `TJS_LLM_BASE_URL`
picks the server; the setup guides are [MLX](/mlx-setup/) and [LM Studio](/lm-studio-setup/).

`llmPredictBattery` returns the model's message object (`{ role, content, tool_calls }`), not a
string; `llmPredict` returns a string. To use the battery atoms with your own backends, supply
the same keys: `llmBattery.predict(system, user, tools, responseFormat)`, `vector.embed(text)`,
and a `store` with `createCollection(name, schema, dimension)` (`storeCreateCollection` always
passes `undefined` for `schema`), `vectorAdd(collection, doc)` and
`vectorSearch(collection, vector, k, filter)`.

---

## What a capability may return

Everything a capability returns is copied into the run before the agent sees it. The copy is
built from what the VM reads, one value at a time, and only these values cross:

- plain objects (prototype `Object.prototype` or `null`) and arrays, from the VM's own realm;
- strings, numbers, booleans, `null` and `undefined`;
- `Date`, copied by its time value.

Shared references and cycles are kept. Everything else is refused: functions, `Map`, `Set`, typed
arrays, `ArrayBuffer`, `RegExp`, `Error`, class instances (including a `Response`), subclasses of
`Array` or `Date`, and objects from another realm (an iframe, a `node:vm` context).

Convert such a value yourself, field by field: a `Map` to an object or to an array of
`[key, value]` pairs, an instance to the fields the agent needs. A
`JSON.parse(JSON.stringify(value))` round-trip is not a fix. It loses data silently: a `Map` or
`Set` becomes `{}`, a `Date` becomes a string, and functions vanish.

A refused return is a bug in the host, so it **ends the run**, even inside the agent's `try`. A
return that is merely too large (over `membraneMaxBytes`, 4MB by default) or too deeply nested is
the world's doing, and the agent can catch it.

The common mistake is returning the `Response`:

```javascript
// Wrong: a Response is a class instance. The run ends with
// "capability return contains an instance of Response; only plain data (and Date) crosses".
const fetchCap = async (url, init) => fetch(url, init)
```

Spreading it is worse, because it fails silently. A `Response` keeps `ok`, `status` and
`headers` on its prototype, so the spread copies nothing:

```javascript
// Wrong, silently: the agent receives {}
const fetchCap = async (url, init) => ({ ...(await fetch(url, init)) })
```

A getter is refused too. It is host code, and the copy never runs host code to find out what a
value is:

```javascript
// Wrong: "capability return has an accessor property 'status'"
const fetchCap = async (url, init) => {
  const res = await fetch(url, init)
  return { ok: res.ok, get status() { return res.status }, body: await res.json() }
}
```

Read each field once and name it:

```javascript
// Right: plain data, built field by field
const fetchCap = async (url, init) => {
  const res = await fetch(url, init)
  return { ok: res.ok, status: res.status, body: await res.json() }
}
```

The same rule covers what a capability **receives**. An atom's inputs are copied out of the run
before your function is called, so a capability never holds a live object the agent can still
change.

---

## Which failures an agent can catch

A failure is either catchable, so the agent's `try`/`catch` sees it as a string, or it **ends the
run**: nothing after it runs, not even a `catch` block, and the host gets it as `run.error`. The
rule is who caused it. The world's failures are catchable; bugs, in the agent or in the host, end
the run, because a program that could catch a bug could loop on it.

| Failure                                                       | Whose fault | Result         | Message, for an atom `forecast`                                    |
| ------------------------------------------------------------- | ----------- | -------------- | ------------------------------------------------------------------ |
| The capability throws                                         | the world   | catchable      | your message, such as `HTTP 503`                                   |
| The atom's body throws (a missing capability, a bad value)    | the world   | catchable      | the body's message, such as `Capability 'weather' missing`         |
| The return is too large or too deeply nested                  | the world   | catchable      | `… the value exceeds the 4194304-byte membrane budget`             |
| The return does not match the output schema                   | the world   | catchable      | `Output validation failed for 'forecast'`                          |
| The atom's own timeout passes                                 | the world   | catchable      | `Atom 'forecast' timed out`                                        |
| A quota is used up                                            | the world   | catchable      | `Quota exceeded for 'forecast': 0 calls allowed`                   |
| An IO atom's input does not match its input schema            | the agent   | ends the run   | `'forecast': its input does not have the shape the atom declares`  |
| The capability returns a value that is not plain data         | the host    | ends the run   | `… capability return contains a Map; only plain data (and Date) crosses …` |
| Fuel runs out, or the run's timeout passes                    | the budget  | ends the run   | `Out of Fuel`, `Execution timeout after …`                         |

In AJS, a caught error is a string, the error's message. This agent asks for a page its host does
not allow and catches the refusal:

```ajs
function tryFetch({ url = 'https://not-on-the-list.example/' }) {
  try {
    let page = httpFetch({ url })
    return { page }
  } catch (err) {
    return { failed: err }
  }
}
```

It returns `{ failed: 'Fetch blocked: …' }`, with a message that says why: no allowlist was
configured, or the domain is not on it. [Catchable failures and run-ending refusals](/ajs-host/#catchable-failures-and-run-ending-refusals)
covers the host's side, and [Catchable, and run-ending](/DOCS-AJS/#catchable-and-run-ending) the
agent's.

---

## Writing an atom

`defineAtom` takes five arguments:

```javascript
import { defineAtom } from 'tjs-lang/vm-ast'
import { s } from 'tjs-lang/schema'

const atom = defineAtom(
  'opCode', //          the name it is registered and called by
  inputSchema, //      a tosijs-schema builder: what the agent must pass
  outputSchema, //     what the atom returns, or undefined for nothing
  async (input, ctx) => result, // the implementation
  { cost, timeoutMs, effects, resolveInputs, docs } // all optional
)
```

| Option          | Default  | Meaning                                                                                                    |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `cost`          | `1`      | Fuel charged per call. A number, or `(input, ctx) => number` computed from the resolved input.             |
| `timeoutMs`     | `1000`   | Wall-clock limit per call, in milliseconds. `0` means none. Core atoms set their own (`httpFetch` 30 s, `llmPredict` 120 s), and a host can override any atom's per run with `timeoutOverrides`. |
| `effects`       | `'io'`   | `'io'` puts the atom's inputs and return through the boundary. `'pure'` opts out.                          |
| `resolveInputs` | `true`   | The VM evaluates the agent's inputs to values before calling you. `false` for atoms that take steps.       |
| `docs`          | `''`     | A description, shown by `vm.getTools()` and in tooling.                                                    |

The VM checks the output schema on every call. It checks the input schema, through the outbound
copy, **only for IO atoms**. For a pure atom the input schema is what the transpiler and
`vm.getTools()` use, but at run time the body gets whatever the AST holds (a hand-built AST, or
source transpiled without `atoms`, can pass anything), so a pure atom checks its own inputs.

### What an atom can use

The implementation receives its input and `ctx`, the run's context:

- **`ctx.capabilities`** is the object the host passed to `vm.run`, exactly as passed. The VM
  never copies or writes it. Check for your key and throw a clear error when it is missing.
- **`storeOf(ctx)`** returns the host's `store`, or the run's own in-memory store when there is
  none. Use it instead of `ctx.capabilities.store`, which is `undefined` in that case.
- **`ctx.signal`** is the run's `AbortSignal`. It aborts when the run times out, when the host
  cancels it, and when the run ends while your call is still in flight (after this atom's own
  timeout, for instance). Pass it to `fetch` and to anything else that can be cancelled.
- **`ctx.error`** is how errors travel. An error in AJS is a value, not an exception: a failing
  step sets `ctx.error`, and the steps after it skip until a `catch` takes it. A throw from your
  body becomes such an error. Child scopes share `ctx.error` with the context they came from, so
  an atom that runs steps reads their failure there.
- **`egressValue(ctx, op, value)`** copies a guest value out of the run, charged and capped at
  `membraneMaxBytes`. An IO atom with `resolveInputs: false` must pass everything it hands a
  capability through it, because the VM's automatic copy happens only for resolved inputs.
- **`createChildScope(ctx)` / `releaseScope(scope)`** give steps a scope of their own. Always
  release in a `finally`.

Run steps only on the `ctx` you received or on a `createChildScope(ctx)` scope, never on a copy
such as `{ ...ctx }`. With `resolveInputs: true` a copy is refused by name. With
`resolveInputs: false`, the case for step-taking atoms, nothing stops you, and a copy loses
the steps' errors: a step that fails sets `error` on the copy, and the run carries on as if it
had succeeded.

An atom must also be non-blocking: no long synchronous work, because no timeout can interrupt
it. Do heavy computation in a worker, and await it.

### A pure atom

A pure atom computes from its inputs and nothing else. It is a good fit for a calculation that
would be slow or awkward in AJS:

```javascript
const slugify = defineAtom(
  'slugify',
  s.object({ text: s.string }),
  s.string,
  async ({ text }) => {
    if (typeof text !== 'string') throw new Error('slugify: text must be a string')
    return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  },
  { effects: 'pure', docs: 'Turn a title into a URL slug' }
)
```

An agent calls it like any atom, with named inputs: `let slug = slugify({ text: title })`
returns `'hello-world'` for `'Hello, World!'`.

The regexes here run on the host's engine over a string the agent chose, and that is fine: they
are your code, and simple enough to run in linear time. Keep any regex in an atom's body that
way, because a synchronous match cannot be interrupted by a timeout. (The `pattern` ban on IO
atom schemas, below, is about regexes the VM itself would run during validation.)

Mark an atom `'pure'` only when all three hold: it reads no capability, it gives the same output
for the same input, and it has no side effects. Two things depend on the tag:

- **The boundary.** A pure atom's return is not copied. That is right for a value computed from
  data already inside the run, and wrong for anything from outside: a "pure" atom that returns a
  `Map` puts that `Map` into the agent's state and the run's result, without the shape and size
  checks the boundary would have made. Leave a host-data atom on the `'io'` default.
- **Predicates.** A verified predicate may call only pure atoms, so an IO atom tagged pure would
  let an impure predicate pass as verified.

> Verified predicates are small pure functions that `tjs-lang/lang` certifies and compiles to
> native JavaScript, for uses such as `storeQueryWhere` filters. The verifier reads atom tags
> through `effectfulFromAtoms(vm.atoms)`.

### An IO atom over a REST API

An IO atom is how host data comes in. Give it a narrow input, build the request in the atom so
the agent chooses values rather than URLs, and reach the world through a capability so the host
decides per run whether the atom works at all:

```javascript
const forecast = defineAtom(
  'forecast',
  s.object({ latitude: s.number, longitude: s.number, days: s.number.optional }),
  s.array(s.object({ date: s.string, maxC: s.number })),
  async ({ latitude, longitude, days = 3 }, ctx) => {
    const weather = ctx.capabilities.weather
    if (!weather) throw new Error("Capability 'weather' missing")
    if (!Number.isInteger(days) || days < 1 || days > 16)
      throw new Error('forecast: days must be a whole number from 1 to 16')
    return weather.daily({ latitude, longitude, days }, ctx.signal)
  },
  {
    // charged before the call, from the resolved input: more days, more fuel
    cost: ({ days }) => 5 + (Number.isInteger(days) ? Math.min(Math.max(days, 1), 16) : 3),
    timeoutMs: 10_000,
    docs: 'Daily maximum temperature for a location',
  }
)

// The capability: the only code here that touches the network.
const weather = {
  async daily({ latitude, longitude, days }, signal) {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily: 'temperature_2m_max',
      forecast_days: String(days),
      timezone: 'UTC',
    }).toString()
    const res = await fetch(url, { signal, redirect: 'error', credentials: 'omit' })
    if (!res.ok) throw new Error(`forecast: HTTP ${res.status}`)
    const { daily } = await res.json()
    return daily.time.map((date, i) => ({ date, maxC: daily.temperature_2m_max[i] }))
  },
}
```

```javascript
const vm = new AgentVM({ forecast })
const { ast } = transpile(
  `function berlin({ days = 2 }) {
    let daily = forecast({ latitude: 52.52, longitude: 13.41, days })
    return { daily }
  }`,
  { atoms: vm.atoms }
)
const run = await vm.run(ast, {}, { fuel: 100, capabilities: { weather } })
// run.result → { daily: [{ date: '…', maxC: 6.8 }, { date: '…', maxC: 8.7 }] }  (live data)
```

What the VM does around that call follows the steps at the top of this chapter:

1. **Quota and fuel.** A `quotas` entry for `forecast` is checked first; then `cost` is charged.
   The cost function sees the resolved input **before** it is checked against the schema, which
   is why it guards against a `days` that is not a number.
2. **The outbound copy.** The input is copied out of the run (the copy is charged too) and
   validated against the input schema. An input that does not match is the agent's bug, so the
   run ends: `'forecast': its input does not have the shape the atom declares`.
3. **The call**, under `timeoutMs`. An error the body throws, such as the `days` check, is
   catchable.
4. **The inbound copy.** The return crosses the boundary under the rules above, then is checked
   against the output schema. A mismatch there is the world's doing (an API that changed), so the
   agent can catch it: `Output validation failed for 'forecast'`.

Two rules for IO atoms are enforced when you call `defineAtom`:

- **An input schema is required.** Write `s.object({})` for an atom that takes nothing.
- **No `pattern` or `patternProperties` in it.** The VM validates the schema itself, before your
  body runs and outside fuel, and that would compile the pattern on the host's regex engine and
  run it over strings the agent chose. Check the format in the atom's body instead.

### A step-taking atom

Control atoms (`if`, `while`, `try`) take **steps**, not values: lists of AST nodes to run. You
write one to add a new kind of control flow, such as a retry loop, for hosts that build agents
as ASTs. AJS source cannot pass steps to an atom, so a step-taking atom is called from the
builder (`vm.Agent`, the fluent API that writes ASTs; see
[Builder API](/DOCS-AJS/#builder-api)) or from a hand-built AST.

Such an atom must set `resolveInputs: false`, or the VM evaluates the steps as data before you
see them. With it off, you resolve the value inputs yourself with `resolveValue(value, ctx)`.
Being pure, it also gets no input check from the VM, so it checks `attempts` itself.

This one runs its steps up to `attempts` times, until a pass ends without an error:

```javascript
import { defineAtom, seq, resolveValue, createChildScope, releaseScope } from 'tjs-lang/vm-ast'

const retry = defineAtom(
  'retry',
  s.object({ attempts: s.any, steps: s.array(s.any) }),
  undefined,
  async (step, ctx) => {
    const attempts = resolveValue(step.attempts, ctx)
    if (typeof attempts !== 'number' || attempts < 1 || attempts > 5)
      throw new Error('retry: attempts must be a number from 1 to 5')
    for (let i = 1; i <= attempts; i++) {
      const scope = createChildScope(ctx) // variables set by the steps stay in here
      try {
        await seq.exec({ op: 'seq', steps: step.steps }, scope)
        if (!ctx.error) return // the scope shares ctx.error
        if (i < attempts) ctx.error = undefined // clear it and go again
      } finally {
        releaseScope(scope) // always: an unreleased scope stays counted against the heap
      }
    }
  },
  // pure: it touches no capability (the steps it runs are charged as they run)
  { resolveInputs: false, effects: 'pure', timeoutMs: 0, cost: 1 }
)

// A test atom: fails on its first two calls, then returns 3.
let calls = 0
const flaky = defineAtom('flaky', s.object({}), s.number, async () => {
  if (++calls <= 2) throw new Error(`flaky: failure ${calls}`)
  return 3
})
```

```javascript
const vm = new AgentVM({ retry, flaky })
const ast = vm.Agent.retry({
  attempts: 3,
  steps: vm.Agent.flaky({}).as('n').storeSet({ key: 'answer', value: 'n' }).steps,
})
  .storeGet({ key: 'answer' })
  .as('result')
  .return(s.object({ result: s.number }))
  .toJSON()

const run = await vm.run(ast, {}, { fuel: 100 })
// run.result → { result: 3 }
```

`flaky` fails twice, the third pass succeeds, and the run's result is `{ result: 3 }`. With
`attempts: 2` the run ends with `flaky: failure 2`.

Watch the strings. The builder writes a v1 AST, where a bare string is a variable reference when
a variable by that name is in scope, and a literal otherwise. `value: 'n'` stores the value of
`n`; `key: 'answer'` stays the literal `'answer'` only because no variable named `answer`
exists. (The transpiler writes v2 ASTs, where a bare string is always a literal.)

Clearing `ctx.error` cannot revive a run that ended: a run-ending refusal is recorded on the run
itself, and the next step sees it and stops.

---

## Registering atoms

Pass atoms to the VM's constructor. They are added to the core atoms:

```javascript
const vm = new AgentVM({ slugify, forecast })
```

**The key is the name agents call.** `new AgentVM({ slug: slugify })` makes `slug({ text })`
work and `slugify({ text })` fail with `Unknown Atom: slugify`. Use the op code as the key, which
object shorthand (`{ slugify }`) does for you. A key that matches a core atom replaces it, which
is how a test swaps in a fake `httpFetch`.

Then give the same atoms to the transpiler, so calls are checked where the source is compiled:

```javascript
const { ast } = transpile(source, { atoms: vm.atoms })
```

With `atoms`, a wrong call fails at transpile time with a message and its location:

```text
'slugify' has no input 'txt'. It takes slugify({ text }). at <source>:1:31
'slugify' takes named arguments: write slugify({ name: value, … }), not slugify(a, b). Positional arguments are for local functions. at <source>:1:31
```

Without it, core atoms are still checked, but a call to your atom is compiled as written and
fails only when it runs. `vm.getTools()` lists every registered atom with its input schema in
the OpenAI tool format, which is a quick way to tell a model what it may call.

---

## Writing a safe fetch capability

A `fetch` capability is where network policy lives, because it is the one part of the system the
agent cannot see or change. An agent that was asked to check an allowlist, count its requests or
back off could simply not. Put each rule here:

- **An allowlist** of hosts, checked on every request, including the port.
- **No redirects.** Following one sends the agent's request somewhere you did not check. Return
  the redirect as data and let the agent make a new, separately checked request.
- **No ambient credentials.** No cookies or HTTP auth from the environment. Add an API key here
  if a service needs one; the agent never sees it.
- **The depth header.** The VM adds `X-Agent-Depth` to every request and refuses once the
  incoming depth reaches 10. Forward the headers you were given; an endpoint that runs agents
  should read the header it received and pass it into its own run as `context.requestDepth`.
- **Rate limits, retries and backoff**, shared by every run that uses the capability. An agent
  that controlled its own retry loop could turn it into a flood.
- **A bounded body**, read in chunks and abandoned once it passes the limit, so one large
  response cannot exhaust host memory before the boundary's own size cap applies.

```javascript
function createFetchCapability({
  allowedHosts, // host names, with the port when it is not the default: ['api.example.com']
  perSecond = 5, // spacing between requests, across every run that shares this capability
  retries = 2, // retries on 429 and 5xx, with exponential backoff
  maxBodyBytes = 1024 * 1024,
}) {
  const gap = 1000 / perSecond
  let next = 0

  // Wait `ms`, or reject as soon as the run is aborted.
  const pause = (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('aborted'))
      const onAbort = () => {
        clearTimeout(timer)
        reject(new Error('aborted'))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      signal?.addEventListener('abort', onAbort, { once: true })
    })

  // Read at most maxBodyBytes, and stop reading the moment the body passes it.
  async function readBody(res) {
    const reader = res.body?.getReader()
    if (!reader) return ''
    const chunks = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBodyBytes) {
        await reader.cancel()
        throw new Error('Response too large')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks) {
      bytes.set(chunk, at)
      at += chunk.byteLength
    }
    return new TextDecoder().decode(bytes)
  }

  return async (url, init = {}) => {
    const target = new URL(url) // a relative URL throws here, so it is refused
    if (target.protocol !== 'https:' && target.protocol !== 'http:')
      throw new Error(`Scheme not allowed: ${target.protocol}`)
    if (!allowedHosts.includes(target.host)) throw new Error(`Host not allowed: ${target.host}`)
    if (init.responseType === 'dataUrl') throw new Error('responseType dataUrl is not supported')

    const request = {
      method: init.method ?? 'GET',
      headers: init.headers, // includes X-Agent-Depth
      body: init.body === undefined || typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
      redirect: 'manual',
      credentials: 'omit',
      signal: init.signal,
    }

    for (let attempt = 0; ; attempt++) {
      const now = Date.now()
      const start = Math.max(now, next)
      next = start + gap
      if (start > now) await pause(start - now, init.signal)

      const res = await fetch(target, request)
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await res.body?.cancel()
        await pause(250 * 2 ** attempt, init.signal)
        continue
      }
      // A redirect, in the built-in client's shape. A browser hides it: type 'opaqueredirect',
      // status 0, no location.
      const location = res.headers.get('location')
      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400 && location)) {
        await res.body?.cancel()
        return { redirect: true, status: res.status, location: location && new URL(location, target).href }
      }
      if (Number(res.headers.get('content-length') ?? 0) > maxBodyBytes) {
        await res.body?.cancel()
        throw new Error('Response too large')
      }
      const text = await readBody(res)
      const json =
        init.responseType === 'json' ||
        (init.responseType !== 'text' && (res.headers.get('content-type') ?? '').includes('application/json'))
      if (!json) return { ok: res.ok, status: res.status, body: text }
      try {
        return { ok: res.ok, status: res.status, body: JSON.parse(text) }
      } catch {
        throw new Error(`${target.host} sent a body that is not valid JSON`)
      }
    }
  }
}

const fetchCap = createFetchCapability({ allowedHosts: ['api.example.com'] })
await vm.run(ast, args, { fuel: 1000, capabilities: { fetch: fetchCap } })
```

Against a test server on Bun, an agent calling `httpFetch({ url })` gets
`{ ok: true, status: 200, body: { … } }` after two 503s are retried, gets
`{ redirect: true, status: 302, location: 'http://…/flaky' }` for a redirect, and gets errors it
can catch for a host off the list (`Host not allowed: evil.test`), a body that streams past the
limit with no `content-length` (`Response too large`) and malformed JSON. In a browser the
redirect arrives as `{ redirect: true, status: 0, location: null }`, because the browser hides
it.

Every agent reading this capability's results reads `ok`, `status` and `body`, so the shape is
part of your API: tell agent authors (or the model's system prompt) what it is. The wait for a
rate limit counts against `httpFetch`'s 30-second timeout. If your limiter queues for longer,
raise it for the run:

```javascript
await vm.run(ast, args, {
  fuel: 1000,
  capabilities: { fetch: fetchCap },
  timeoutOverrides: { httpFetch: 60_000 },
})
```

[Safe Eval](/safe-eval/) has a shorter `fetch` capability built the same way, and the same policy
stated as data with `fetchPolicy`.

---

## Testing with fake capabilities

An agent is data plus a host, so test it like any function with injected dependencies: pass fake
capabilities and assert on the result. Nothing here needs a network or a model.

```javascript
import { expect, test } from 'bun:test'
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM({ forecast })
const { ast } = transpile(
  `function packFor({ days = 3 }) {
    let daily = forecast({ latitude: 52.52, longitude: 13.41, days })
    let cold = daily.filter((d) => d.maxC < 10)
    return { coat: cold.length > 0, coldDays: cold.length }
  }`,
  { atoms: vm.atoms }
)

const fakeWeather = (temps) => ({
  daily: async ({ days }) =>
    temps.slice(0, days).map((maxC, i) => ({ date: `2026-01-0${i + 1}`, maxC })),
})

test('a cold day means a coat', async () => {
  const run = await vm.run(ast, {}, { fuel: 100, capabilities: { weather: fakeWeather([12, 8, 15]) } })
  expect(run.result).toEqual({ coat: true, coldDays: 1 })
})

test('an upstream failure is an error the host can see', async () => {
  const broken = { daily: async () => { throw new Error('HTTP 503') } }
  const run = await vm.run(ast, {}, { fuel: 100, capabilities: { weather: broken } })
  expect(run.error?.message).toBe('HTTP 503')
})

test('a capability that breaks the contract ends the run', async () => {
  const leaky = { daily: async () => new Map() }
  const run = await vm.run(ast, {}, { fuel: 100, capabilities: { weather: leaky } })
  expect(run.error?.message).toContain('Map')
})
```

A fake `store` is a `Map` behind `get` and `set`, as in the first example on this page. A fake
`llm` is one function, `{ predict: async (prompt) => 'canned answer' }`, which makes the logic
around a model call testable without a model. To test the atom rather than the agent, register a
fake under the same name: `new AgentVM({ httpFetch: fakeFetchAtom })` replaces the core atom for
that VM.

[Patterns](/patterns/) shows trace inspection (`trace: true`, to assert which atoms ran) and
snapshot tests of the AST.
