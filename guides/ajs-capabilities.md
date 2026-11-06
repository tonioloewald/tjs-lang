<!--{"parent": "ajs.md", "order": 6}-->
<!-- TODO review -->

# Capabilities and Custom Atoms

An agent can only do what its host hands it. This chapter is for the host: how to give an agent
network, storage and a model, what those functions may return, and how to add operations of your
own without opening a hole in the sandbox.

Two words carry the whole chapter:

- An **atom** is an operation an agent calls by name, such as `httpFetch({ url })`. It declares
  the inputs it takes, what it returns, and what it costs in fuel. The VM ships about fifty, and
  you can add more.
- A **capability** is a host function that an atom calls to reach the world: your `fetch`, your
  store, your model client. You pass capabilities to each run, in `capabilities`.

An agent never sees a capability. It calls `httpFetch`; the atom checks the request, calls the
`fetch` capability you passed for this run, and copies the answer back in as plain data. With no
`fetch` capability, `httpFetch` uses the built-in client, which fetches nothing unless the run
names the domains it may reach. With no `llm` capability, `llmPredict` fails with
`Capability 'llm.predict' missing`.

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
})
console.log(run.result)
// → { user: { name: 'Ada', role: 'admin' }, summary: '(model reply to 61 chars)' }
```

Capabilities are passed per run, not per VM. One `AgentVM` can serve many agents, each with a
different set.

---

## The Capabilities interface

These are the keys the built-in atoms look for. Any key you add is yours to read from your own
atoms.

| Key          | Signature                                                       | Used by                                                                            |
| ------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `fetch`      | `(url, init) => Promise<data>`                                  | `httpFetch`                                                                        |
| `store`      | `{ get, set, query?, queryPredicate?, vectorSearch? }`           | `storeGet`, `storeSet`, `storeQuery`, `storeQueryWhere`, `storeVectorSearch`       |
| `llm`        | `{ predict(prompt, options?) => Promise<string>, embed? }`      | `llmPredict`                                                                       |
| `agent`      | `{ run(agentId, input) => Promise<data> }`                      | `agentRun`, for an `agentId` that is neither an AST nor a stored procedure token   |
| `code`       | `{ transpile(source) => ast }`                                  | `runCode`, `transpileCode`                                                         |
| `xml`        | `{ parse(xml) => Promise<data> }`                               | `xmlParse`                                                                         |
| `llmBattery` | `{ predict(system, user, tools?, responseFormat?), embed }`     | `llmPredictBattery`, `llmVision` (battery atoms)                                   |
| `vector`     | `{ embed(text) => Promise<number[]> }`                          | `storeVectorize` (battery atom)                                                    |

What each atom sends and returns is in the [Atom Reference](/ajs-atoms/). What follows is what
your function receives.

### fetch

`httpFetch({ url, method, headers, body, responseType })` admits the request first: the URL must
be `http:` or `https:`, the method GET or HEAD unless the run allows more, and the headers from a
closed list ([Fetch policy](/ajs-host/#fetch-policy) has the run options that widen them).
Then it calls your function:

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

The built-in client (used when you pass no `fetch`) follows no redirects, sends no cookies, reads
the body under the run's size cap, and fetches only the domains in the run's
`context.allowedFetchDomains`. Your `fetch` replaces all of that, so it has to make the same
decisions. [Writing a safe fetch capability](#writing-a-safe-fetch-capability) does.

### store

```javascript
const store = {
  get: async (key) => value, //            storeGet({ key })
  set: async (key, value) => {}, //        storeSet({ key, value })
  query: async (query) => [rows], //       storeQuery({ query }), optional; what `query` means is yours
  queryPredicate: async ({ collection, predicate, limit }) => [rows], // storeQueryWhere, optional
  vectorSearch: async (collection, vector, k, filter) => [docs], //    storeVectorSearch, optional
}
```

Only `get` and `set` are required. `storeQuery` returns `[]` when your store has no `query`, and
`storeVectorSearch` returns `[]` without `vectorSearch`. `storeQueryWhere` is the exception: it
fails rather than return unfiltered rows, because a filter that silently does not filter is a
data leak. Its `predicate` is a canonical verified predicate built with `canonicalizePredicate`
from `tjs-lang/lang`; the store can evaluate it next to the data and cache on its `key`.

When you pass no `store`, each run gets its own in-memory store, discarded when the run ends.
This agent runs in the page that way, so it counts one visit every time:

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
back. Anything else fails output validation, which the agent can catch.

`options` arrives as the agent wrote it, after the VM has checked it. Only these keys are
admitted: `model`, `temperature`, `maxTokens`, `max_tokens`, `topP`, `top_p`, `stop`, `seed`,
`responseFormat`, `tools`. Any other key fails the call (an agent cannot pass `apiKey` or
`baseUrl` to your client). `responseFormat` and `tools` are checked as guest schemas before your
function sees them. Map them to your provider's request yourself; nothing is forwarded for you.

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
    })
    const json = await res.json()
    return json.choices[0].message.content // a string
  },
}
```

The API key lives in the capability, where the agent cannot read it. `embed` is part of the
interface for your own atoms; no core atom calls it.

### agent

`agentRun({ agentId, input })` runs a sub-agent. When `agentId` is an AST or a stored procedure
token, the sub-agent runs inside the current run on the same fuel and needs no capability. Any
other `agentId` (a name, a URL) goes to `agent.run(agentId, input)`, which receives copies of both.
Return the sub-agent's result; if you return a `RunResult` from your own `vm.run`, the atom
unwraps it and turns its `error` into an error in the caller.

A new `vm.run` inside `agent.run` starts a fresh fuel budget and fresh quotas. To hold a quota
across the nested run, pass the same `quotaUsed` object to both; see
[Quotas across nested runs](/ajs-host/#quotas-across-nested-runs).

### code

`runCode({ code, args })` and `transpileCode({ code })` let an agent compile AJS it wrote itself.
Both need `code.transpile(source)`, which returns the AST. Source over 8KB is refused before it
reaches you, because transpiling runs before fuel can stop it. Pass the VM's atoms so calls in
the generated code are checked like any other:

```javascript
const code = { transpile: (source) => transpile(source, { atoms: vm.atoms }).ast }
```

`runCode`'s program shares the run's fuel, heap budget and capabilities, but sees only the `args`
it is given. Leave `code` out and neither atom can run.

### llmBattery and vector (the batteries)

The batteries are the zero-config local setup: an OpenAI-compatible model server (LM Studio, MLX)
for chat and embeddings, plus an in-memory key-value and vector store. The battery atoms are
registered on the VM; the capabilities come from `getBatteries()`:

```javascript
import { AgentVM, batteryAtoms } from 'tjs-lang/vm-ast'
import { getBatteries } from 'tjs-lang/batteries'

const vm = new AgentVM(batteryAtoms)
const batteries = await getBatteries() // probes the local server once, then caches the audit

// batteries = {
//   llmBattery, // { predict(system, user, tools, responseFormat), embed } — null without a server
//   vector, //     { embed } — undefined without a server
//   store, //      key-value plus createCollection / vectorAdd / vectorSearch, always present
//   models, //     what the audit found — null without a server
// }
const run = await vm.run(ast, args, { fuel: 1000, capabilities: batteries })
```

`llmBattery` and `vector` are empty when no server answers, and always in a browser page served
over HTTPS, which cannot call a local `http:` endpoint. The atoms that need them then fail with a
"missing" error the agent can catch. `TJS_LLM_BASE_URL` picks the server; the setup guides are
[MLX](/mlx-setup/) and [LM Studio](/lm-studio-setup/).

`llmPredictBattery` returns the model's message object (`{ role, content, tool_calls }`), not a
string; `llmPredict` returns a string. To use the battery atoms with your own backends, supply
the same keys: `llmBattery.predict(system, user, tools, responseFormat)`, `vector.embed(text)`,
and a `store` with `createCollection(name, schema, dimension)`, `vectorAdd(collection, doc)` and
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
`Array` or `Date`, and objects from another realm (an iframe, a `node:vm` context). A
`JSON.parse(JSON.stringify(value))` round-trip turns any of those into plain data.

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
| `timeoutMs`     | `1000`   | Wall-clock limit per call, in milliseconds. `0` means none. A host can override it per run.                |
| `effects`       | `'io'`   | `'io'` puts the atom's inputs and return through the capability boundary. `'pure'` opts out.               |
| `resolveInputs` | `true`   | The VM evaluates the agent's inputs to values before calling you. `false` for atoms that take steps.       |
| `docs`          | `''`     | A description, shown by `vm.getTools()` and in tooling.                                                    |

### A pure atom

A pure atom computes from its inputs and nothing else. It is a good fit for a calculation that
would be slow or awkward in AJS:

```javascript
const slugify = defineAtom(
  'slugify',
  s.object({ text: s.string }),
  s.string,
  async ({ text }) =>
    text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  { effects: 'pure', docs: 'Turn a title into a URL slug' }
)
```

An agent calls it like any atom, with named inputs: `let slug = slugify({ text: title })`
returns `'hello-world'` for `'Hello, World!'`.

Mark an atom `'pure'` only when all three hold: it reads no capability, it gives the same output
for the same input, and it has no side effects. Two things depend on the tag:

- **The boundary.** A pure atom's return is not copied. That is right for a value computed from
  data already inside the run, and wrong for anything from outside: a "pure" atom that returns a
  `Map` hands the agent the live `Map`. Leave a host-data atom on the `'io'` default.
- **Predicates.** A verified predicate (see `tjs-lang/lang`'s predicate verifier) may call only
  pure atoms. It reads the tag through `effectfulFromAtoms(vm.atoms)`, so an IO atom tagged pure
  would let an impure predicate pass as verified.

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
// run.result → { daily: [{ date: '2026-11-06', maxC: 6.8 }, { date: '2026-11-07', maxC: 8.6 }] }
```

What the VM does around that call, in order:

1. **Quota and fuel.** A `quotas` entry for `forecast` is checked first; then `cost` is charged.
   The cost function sees the resolved input **before** it is checked against the schema, which
   is why it guards against a `days` that is not a number.
2. **The outbound copy.** The input is copied out of the run (the copy is charged too) and
   validated against the input schema. An input that does not match is the agent's bug, so the
   run ends: `'forecast': its input does not have the shape the atom declares`.
3. **The call**, under `timeoutMs`.
4. **The inbound copy.** The return crosses the boundary under the rules above, then is checked
   against the output schema. A mismatch there is the world's doing (an API that changed), so the
   agent can catch it: `Output validation failed for 'forecast'`.

Two rules for IO atoms are enforced when you call `defineAtom`:

- **An input schema is required.** Write `s.object({})` for an atom that takes nothing.
- **No `pattern` or `patternProperties` in it.** Validating would run that regex on the host's
  regex engine over strings the agent chose. Check the format in the atom's body instead.

### A step-taking atom

Control atoms (`if`, `while`, `try`) take **steps**, not values: lists of AST nodes to run. Such
an atom must set `resolveInputs: false`, or the VM evaluates the steps as data before you see
them. With it off, you resolve the value inputs yourself with `resolveValue(value, ctx)`.

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
        if (!ctx.error) return
        if (i < attempts) ctx.error = undefined // clear it and go again
      } finally {
        releaseScope(scope) // always: an unreleased scope stays counted against the heap
      }
    }
  },
  // pure: it touches no capability (the steps it runs are charged as they run)
  { resolveInputs: false, effects: 'pure', timeoutMs: 0, cost: 1 }
)
```

AJS source cannot pass steps to an atom, so a step-taking atom is called from the builder (or a
hand-built AST):

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
```

With a `flaky` atom that fails twice and then returns 3, the run's result is `{ result: 3 }`. The
builder writes a v1 AST, where a bare string such as `'n'` is a variable reference when a
variable by that name exists. Clearing `ctx.error` cannot revive a run that the boundary ended:
the next step sees the halt and stops.

### What else an atom can use

- **`ctx.capabilities`** is the object the host passed to `vm.run`, exactly as passed. The VM
  never copies or writes it. Check for your key and throw a clear error when it is missing.
- **`storeOf(ctx)`** returns the host's `store`, or the run's own in-memory store when there is
  none. Use it instead of `ctx.capabilities.store`, which is `undefined` in that case.
- **`ctx.signal`** is the run's `AbortSignal`. It aborts when the run times out, when the host
  cancels it, and when the run ends while your call is still in flight (after this atom's own
  timeout, for instance). Pass it to `fetch` and to anything else that can be cancelled.
- **`egressValue(ctx, op, value)`** copies a guest value out of the run, charged and capped at
  `membraneMaxBytes`. An IO atom with `resolveInputs: false` must pass everything it hands a
  capability through it, because the VM's automatic copy happens only for resolved inputs.
- **`createChildScope(ctx)` / `releaseScope(scope)`** give steps a scope of their own. Run steps
  on the context you received or on such a scope; running them on a copy of `ctx` is refused.
  Always release in a `finally`.

An atom must also be non-blocking: no long synchronous work, which no timeout can interrupt. Do
heavy computation in a worker, or in TJS with `wasm {}` blocks, and await it.

---

## Registering atoms

Pass atoms to the VM's constructor. They are added to the core atoms:

```javascript
const vm = new AgentVM({ slugify, forecast })
```

**The key is the name agents call.** `new AgentVM({ slug: slugify })` makes `slug({ text })`
work and `slugify({ text })` fail with `Unknown Atom: slugify`. Use the op code as the key,
which shorthand does for you. A key that matches a core atom replaces it, which is how a test
swaps in a fake `httpFetch`.

Then give the same atoms to the transpiler, so calls are checked where the source is compiled:

```javascript
const { ast } = transpile(source, { atoms: vm.atoms })
```

With `atoms`, a wrong call fails at transpile time with a message:

```text
'slugify' has no input 'txt'. It takes slugify({ text }).
'slugify' takes named arguments: write slugify({ name: value, … }), not slugify(a, b).
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
- **A bounded body**, so one large response cannot exhaust host memory before the boundary's own
  size cap applies.

```javascript
function createFetchCapability({
  allowedHosts, // host names, with the port when it is not the default: ['api.example.com']
  perSecond = 5, // spacing between requests, across every run that shares this capability
  retries = 2, // retries on 429 and 5xx, with exponential backoff
  maxBodyBytes = 1024 * 1024,
}) {
  const gap = 1000 / perSecond
  let next = 0
  const pause = (ms, signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms)
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(new Error('aborted'))
        },
        { once: true }
      )
    })

  return async (url, init = {}) => {
    const { protocol, host } = new URL(url)
    if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`Scheme not allowed: ${protocol}`)
    if (!allowedHosts.includes(host)) throw new Error(`Host not allowed: ${host}`)

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

      const res = await fetch(url, request)
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await res.body?.cancel()
        await pause(250 * 2 ** attempt, init.signal)
        continue
      }
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel()
        return { ok: false, status: res.status, location: res.headers.get('location') }
      }
      if (Number(res.headers.get('content-length') ?? 0) > maxBodyBytes) {
        await res.body?.cancel()
        throw new Error('Response too large')
      }
      const text = await res.text()
      if (text.length > maxBodyBytes) throw new Error('Response too large')
      const type = res.headers.get('content-type') ?? ''
      return { ok: res.ok, status: res.status, body: type.includes('application/json') ? JSON.parse(text) : text }
    }
  }
}

const fetchCap = createFetchCapability({ allowedHosts: ['api.example.com'] })
await vm.run(ast, args, { fuel: 1000, capabilities: { fetch: fetchCap } })
```

Against a test server, an agent calling `httpFetch({ url })` gets
`{ ok: true, status: 200, body: { … } }` after two 503s are retried, gets
`{ ok: false, status: 302, location: '…' }` for a redirect, and gets an error it can catch,
`Host not allowed: evil.test`, for anything off the list.

Every agent reading this capability's results reads `ok`, `status` and `body`, so the shape is
part of your API: tell agent authors (or the model's system prompt) what it is. In a browser,
`redirect: 'manual'` yields an opaque response with status 0 rather than the 3xx; treat that as a
redirect too. The wait for a rate limit counts against `httpFetch`'s 30-second timeout; raise it
with `timeoutOverrides: { httpFetch: … }` if your limiter queues for longer.

The VM also checks the request before your function runs, whatever capability you pass: the
scheme, the method (GET and HEAD unless `context.allowedFetchMethods` adds more) and the header
names (`context.allowedRequestHeaders` adds more). If you set `context.allowedFetchDomains`, it is
enforced on your capability's requests too. [Safe Eval](/safe-eval/) has a shorter `fetch`
capability built the same way, and the same policy stated as data with `fetchPolicy`.

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
