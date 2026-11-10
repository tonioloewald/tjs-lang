<!--{"parent": "ajs.md", "order": 5}-->
<!-- TODO review -->

# AJS Patterns

AJS leaves things out on purpose. Each missing feature is either something the VM could not
meter, or something that belongs to the host rather than to untrusted code. An example of the
first kind: in JavaScript, `'x' + arr` makes the engine turn an array of any size into a string,
work nobody is charged for, so AJS refuses it. An example of the second: parallelism, timing and
rate limits are decisions an agent must not make for itself. So most patterns here are one of two
kinds: the AJS way to write what JavaScript would write differently, or the host-side way to
provide what an agent must not control itself.

The first half of this page is the first kind, and its examples run on this page (examples that
need a language model print a message instead). The second half is host code, in plain
JavaScript fences, for you to run in your own project.

## What you need to know first

This page assumes the [AJS guide](/DOCS-AJS/). Five words carry most of what follows:

- **Agent**: an AJS program. Its last top-level function is the entry point.
- **Atom**: an operation the VM provides, such as `httpFetch`, `storeGet`, `storeSet` or
  `llmPredict`. An atom is always called with one object of named inputs:
  `storeGet({ key })`. Builtins like `JSON.parse` and `Math.max` are not atoms; they take
  ordinary positional arguments.
- **Step**: one node of the compiled program (a statement, an atom call, a loop test) that the VM
  executes and charges for.
- **Fuel**: the work budget. Every step costs fuel; the host sets the budget, and a run that
  spends it stops with `Out of Fuel`.
- **Capability**: a function the host hands to the run, through which an atom reaches the outside
  world. `httpFetch` calls the host's `fetch` capability, `storeGet` its `store`, `llmPredict` its
  `llm`. The host also decides which domains `httpFetch` may reach; this page allows
  `api.open-meteo.com`, `api.github.com` and `itunes.apple.com`, and nothing else.

The full list of atoms is the [Atom Reference](/ajs-atoms/); the capabilities are in
[Capabilities and Custom Atoms](/ajs-capabilities/).

## Table of Contents

Writing AJS:

- [Break/Continue](#breakcontinue)
- [Switch Statements](#switch-statements)
- [Retry](#retry)
- [Error Handling Patterns](#error-handling-patterns)
- [Where Calls May Appear](#where-calls-may-appear)
- [What to Write Instead](#what-to-write-instead)
- [Fuel Budgeting](#fuel-budgeting)

In the host:

- [The Capability Is the Trust Boundary](#the-capability-is-the-trust-boundary)
- [Parallel Execution](#parallel-execution)
- [Rate Limiting](#rate-limiting)
- [Composing Agents](#composing-agents)
- [Memoization and Caching](#memoization-and-caching)
- [Testing Patterns](#testing-patterns)

---

## Break/Continue

`break` and `continue` are transpile errors. Put the stop condition in the loop itself:

```ajs:inline
function firstMatch({
  items = [
    { name: 'a', matches: false },
    { name: 'b', matches: true },
    { name: 'c', matches: true },
  ],
}) {
  // Instead of break: stop when found
  let found = null
  let i = 0
  while (i < items.length && found === null) {
    if (items[i].matches) {
      found = items[i]
    }
    i++
  }
  return { found, examined: i }
}
```

It returns `b` after examining two items: the loop stops as soon as `found` is set.

**The shape of an agent.** `firstMatch` is the agent. Its one destructured parameter is its
input: the host supplies it as the `args` of `vm.run(ast, args)`, and the defaults are what the
example runs with on this page. A parameter with a default is optional; one without, such as
`{ worker }` later on, is required. Helper functions (`handleCreate(data)` in the next section)
are ordinary functions called by name with positional arguments. Atoms always take one object of
named inputs. The entry function returns an object.

To skip an item, wrap the work in an `if`, or filter first:

```ajs:inline
function processSome({
  items = [
    { id: 1, shouldProcess: true },
    { id: 2, shouldProcess: false },
    { id: 3, shouldProcess: true },
  ],
}) {
  // Instead of continue: only act when the condition holds
  let processed = []
  for (const item of items) {
    if (item.shouldProcess) {
      processed.push(item.id)
    }
  }

  // Or filter first, then loop over what is left
  const toProcess = items.filter((item) => item.shouldProcess)
  let ids = []
  for (const item of toProcess) {
    ids.push(item.id * 10)
  }
  return { processed, ids }
}
```

---

## Switch Statements

`switch` is a transpile error, and the error suggests the chained `if`/`else` below. When each
case does different work, call a helper function per case:

```ajs:inline
function handleCreate(data) {
  return { created: data.id }
}

function handleDelete(data) {
  return { deleted: data.id }
}

function dispatch({ action = 'delete', data = { id: 7 } }) {
  let result = null
  if (action == 'create') {
    result = handleCreate(data)
  } else if (action == 'delete') {
    result = handleDelete(data)
  } else {
    result = { error: 'Unknown action' }
  }
  return result
}
```

When each case only picks a value, a lookup object is shorter and reads as a table:

```ajs:inline
function label({ action = 'update' }) {
  const labels = { create: 'Created', update: 'Updated', delete: 'Deleted' }
  const text = labels[action] ?? 'Unknown action'
  return { text }
}
```

A lookup table holds data, not functions: `{ create: () => … }` is refused, because a function is
not a value in AJS.

---

## Retry

AJS has no built-in retry. Write it as a `while` loop whose condition says when to stop, with a
`try`/`catch` inside it:

```ajs:inline
function fetchWithRetry({
  url = 'https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current_weather=true',
  maxAttempts = 3,
}) {
  let attempts = 0
  let result = null
  let lastError = null
  while (attempts < maxAttempts && result === null) {
    attempts++
    try {
      result = httpFetch({ url })
    } catch (err) {
      lastError = err
    }
  }
  if (result === null) {
    return { ok: false, attempts, error: lastError }
  }
  return { ok: true, attempts, weather: result.current_weather }
}
```

`httpFetch` returns the response body, already parsed when the server sends JSON, so
`result.current_weather` reads straight off it.

Change the URL to a domain this page does not allow (say `https://example.com/`) and run it again:
all three attempts fail, each one is paid for in fuel, and the agent reports the last error. A
blocked domain is an ordinary failure, which is why `catch` sees it; the errors a `catch` never
sees are listed under [Errors you cannot catch](#errors-you-cannot-catch).

There is no backoff, because AJS has no `sleep`. Waiting is the host's time to spend, not the
agent's: a sleeping agent holds a run open without doing work that fuel can measure. If you want
backoff, put it in the host's `fetch` capability, with the rest of the network policy, and the
agent sees one call that either succeeds or fails.

---

## Error Handling Patterns

The full treatment is the [error handling example](/ajs-error-handling/); these are the patterns
that come up most.

### How errors flow

When an atom fails, the steps after it are skipped until a `try`/`catch` handles the error:

```ajs:inline
function loadData({ url = 'https://example.com/data.json' }) {
  // Each run on this page starts with an empty store, so the example
  // writes the "cached" copy itself, as an earlier run would have.
  storeSet({ key: 'data', value: { cached: true } })

  try {
    const data = httpFetch({ url }) // fails: this page does not allow example.com
    storeSet({ key: 'data', value: data }) // ...so this is skipped
    return { data, fromCache: false } // ...and so is this
  } catch (err) {
    const cached = storeGet({ key: 'data' })
    return { data: cached ?? { fallback: true }, fromCache: true, why: err }
  }
}
```

This reads like JavaScript exceptions, and inside the agent it behaves like them. The difference
is what the error is. It is a value the VM carries through the run, not a JavaScript exception:
in the `catch`, `err` is the error's message, a string. An error that is never caught ends the
run, and the host reads it from the run's `error`; nothing is thrown into the host.

The store here is the in-memory one the VM provides when the host passes no `store` capability,
and it lasts one run. A host that passes its own `store` decides how long data lasts.

To fail on purpose, call `Error('message')` as a statement. AJS has no `throw`; `Error(…)` starts
the same error flow, so a surrounding `try` catches it and an uncaught one ends the run.

### Graceful Degradation

Nest `try`/`catch` to fall back step by step:

```ajs:inline
function answer({ prompt = 'Explain fuel metering in one sentence.' }) {
  let result = null
  try {
    // Model names are whatever your host's llm capability understands;
    // the host may also ignore them and choose for itself.
    result = llmPredict({ prompt, options: { model: 'large-model' } })
  } catch (err) {
    // Fall back to a smaller model
    try {
      result = llmPredict({ prompt, options: { model: 'small-model' } })
    } catch (err2) {
      // Fall back to a static response
      result = "I'm unable to process your request right now."
    }
  }
  return { result }
}
```

(This one needs a model, so on this page it prints a message instead of running.)

### Error Aggregation

Collect errors without stopping the loop:

```ajs:inline
function parseAll({ items = ['{"id":1}', 'not json', '{"id":3}'] }) {
  const errors = []
  const results = []

  for (const item of items) {
    try {
      const result = JSON.parse(item)
      results.push(result)
    } catch (err) {
      errors.push({ item, error: err })
      // nothing re-raises it, so the loop goes on
    }
  }

  return {
    results: results,
    errors: errors,
    success: errors.length == 0,
  }
}
```

### Errors you cannot catch

`try`/`catch` catches failures of the world, things a program might reasonably retry or work
around:

- a fetch that fails, or is blocked because its domain is not allowed;
- a capability that throws (a store that is down, a model that times out);
- a quota spent (`Quota exceeded for 'llmPredict': 3 calls allowed`);
- bad JSON, an `Error(…)` the program raised, a sub-agent that failed.

Some errors end the run even inside a `try`. No `catch` block runs, and no later step:

- `Out of Fuel`, the run's own timeout, and the host aborting the run;
- a refusal at the capability boundary that means the program is wrong: an atom called with input
  it does not declare (`httpFetch({ url: 5 })`), or a value that cannot be copied out to a
  capability;
- a capability returning something JSON cannot express (a function, a `Map`, a class instance).

The second group exists so that a program cannot retry its own bugs, or the host's, in a loop.
The rule and its exact edges are in the AJS guide under
[Errors: Catchable, and run-ending](/DOCS-AJS/#catchable-and-run-ending), and the
[error handling example](/ajs-error-handling/) demonstrates it.

---

## Where Calls May Appear

These rules exist because AJS compiles to a JSON AST that the VM executes one step at a time,
charging for each. A call buried inside an expression would be work done between steps, with no
step to charge it to; a function carried around as a value would be a closure the VM could not
account for.

What is not restricted: template literals, object and array literals, and computed member access
(`obj[key]`, `items[i]`) all work inside expressions:

```ajs:inline
function lookup({
  obj = { name: 'Ada', role: 'admin' },
  key = 'role',
  items = [10, 20, 30],
}) {
  const i = 1
  const card = { title: `${obj.name} (${obj[key]})`, second: items[i] }
  return card
}
```

Two kinds of call have rules about where they may appear: atom and helper calls, and callbacks.

### Atom and Helper Calls

An atom call, or a call to one of your helper functions, must be the whole value of its
statement: `const base = storeGet({ key })`, or a call on its own line. Inside a larger
expression it is refused:

- `{ v: double(n) + 1 }`, a helper call inside an expression, fails to transpile, because the
  transpiler sees every helper in the file.
- `1 + storeGet({ key })` and `results.push(httpFetch({ url }))`, an atom call inside an
  expression, fail to transpile too (`Atom 'storeGet' cannot be called inside an expression`).
  For a host's own atoms, pass them to the transpiler (`transpile(src, { atoms })`) so it knows
  their names.

Lift the call to a variable first:

```ajs:inline
function double(x) {
  return x * 2
}

function lifted({ n = 4 }) {
  storeSet({ key: 'base', value: 10 })
  const base = storeGet({ key: 'base' })
  const d = double(n)
  return { v: d + 1, total: base + d }
}
```

### Callbacks

An arrow function is allowed in exactly one place: as the argument of `map`, `filter`, `find` or
`reduce`, where that call is the whole value of its statement. The callback's body counts as a
statement position of its own, so it may call an atom: a fetch per item is legal, and each fetch
is metered. It may also read the variables around it:

```ajs:inline
function temperatures({ latitudes = [48.85, 35.68] }) {
  const reports = latitudes.map((lat) =>
    httpFetch({
      url: `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=0&current_weather=true`,
    })
  )
  const temps = reports.map((r) => r.current_weather.temperature)
  return { temps }
}
```

So `items.filter(…).map(…)`, `items.filter(…).length` and `items.find(…) != null` are refused:
write the callback call as its own statement, then use its result in the next one.

`some`, `every`, `findIndex` and a `sort` comparator are not available; `sort()` with no argument
is. The VM's method list is closed, and these were left off it; `find` and `filter` do the same
work:

```ajs:inline
function checks({ xs = [1, 2, 3] }) {
  const hit = xs.find((x) => x > 2) // instead of xs.some(...)
  const some = hit != null
  const failing = xs.filter((x) => x <= 0) // instead of xs.every(...)
  const every = failing.length == 0
  return { some, every }
}
```

Everywhere else a function is not a value: it cannot be stored in a variable, put in an object,
passed to an atom or returned. That is why the step-taking atoms (`memoize`, `cache`) have no
AJS source form; see [Memoization and Caching](#memoization-and-caching).

---

## What to Write Instead

The [AJS guide](/DOCS-AJS/) lists what is forbidden and why ("What's Forbidden"). This table is
the other half: what to write when you reach for one of those.

| You reach for                          | Write instead                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `async` / `await`                      | Leave `await` out: an atom call already waits                                 |
| `class`, `this`                        | Plain objects, passed explicitly                                              |
| `new Set(xs)`, `new Date(s)`           | `Set(xs)` (an array of the unique items), `Date(s)` (a data object); see [Set](/DOCS-AJS/#set) and [Date](/DOCS-AJS/#date) |
| `import` / `export`                    | An atom the host registers                                                    |
| `eval`                                 | `runCode({ code, args })`, only if the host provides the [`code` capability](/ajs-capabilities/#code) |
| `throw new Error('…')`                 | `Error('…')` as a statement                                                   |
| `x instanceof Array`                   | `Array.isArray(x)`, `typeof x`                                                |
| `switch`                               | `if` / `else if`, or a lookup object                                          |
| `break`, `continue`                    | A loop condition, an `if`, or `filter` first                                  |
| `for (;;)`, `do … while`               | `while` with a counter, or `for…of`                                           |
| `for (const k in obj)`                 | `for (const k of Object.keys(obj))`                                           |
| `const { a } = o`                      | `const a = o.a` (destructured parameters are fine)                            |
| `obj.x = v`                            | `obj = { ...obj, x: v }`                                                      |
| `obj[k] = v`                           | `const add = Object.fromEntries([[k, v]])`, then `obj = { ...obj, ...add }`   |
| `xs.some(f)`                           | `const hit = xs.find(f)`, then `hit != null`                                  |
| `xs.every(f)`                          | `const failing = xs.filter(…)` with the test negated, then `failing.length == 0` |
| `x++` or `x += 1` inside an expression | `x++` or `x += 1` as its own statement                                        |
| A function as a value                  | A helper function, called by name                                             |
| `items.filter(…).map(…)`               | Two statements                                                                |

`instanceof` is the one row the transpiler does not catch: it compiles, and the run fails with
`A function or builtin namespace is not a value`, which does not mention `instanceof`.

**What may change in place.** Assignment in AJS writes a variable; there is no step that writes
into an object, so `obj.x = v` and `obj[k] = v` are transpile errors
(`Only simple variable assignment is supported`). Methods that change their receiver, such as
`push`, are on the VM's method list and work, as the examples on this page show. Every compound
assignment (`+=`, `-=`, …) and `++`/`--` work as statements.

Do not write `obj = { ...obj, [k]: v }` for the computed-key case. Today the transpiler drops the
brackets and writes the key `"k"`, without an error; the `Object.fromEntries` form writes the key
that `k` holds.

`typeof` is supported. `var` works but is not idiomatic: use `let` and `const`.

---

## Fuel Budgeting

A program cannot read its remaining fuel: the host sets the budget, and a run that exhausts it
stops with an `Out of Fuel` error the host sees. So bound the work in the program, store what is
expensive, and let the host choose the limits: `fuel` (work), `timeoutMs` (wall-clock time for
the run) and `quotas` (calls per atom; see [Rate Limiting](#rate-limiting)). All three are
options to `vm.run`, described in [Run options](/ajs-host/#run-options).

```ajs:inline
function sumSquares(n) {
  let total = 0
  let i = 1
  while (i <= n) {
    total = total + i * i
    i++
  }
  return total
}

function expensive({ n = 200 }) {
  const key = 'sum-squares-' + n
  const cached = storeGet({ key })
  if (cached) {
    return { value: cached, cached: true }
  }
  const value = sumSquares(n)
  storeSet({ key, value })
  return { value, cached: false }
}
```

The output panel shows `fuelUsed` next to the result. Each pass through the loop costs about half
a unit, so `n = 200` uses a little over 100. Raise `n` to 20,000 and this page's budget (10,000
units) runs out before the loop does.

Running it again on this page does not hit the cache: each run here starts with an empty store.
With a host `store` capability that persists, a second run with the same `n` returns
`cached: true` and spends almost nothing.

---

## The Capability Is the Trust Boundary

From here on, the patterns are host code. They share one idea: anything an agent must not be
able to switch off belongs in a capability, because the agent is untrusted and the capability is
yours.

Take fetch. A malicious or buggy agent with network access could call other agent endpoints:
one request that triggers many downstream (amplification), two endpoints calling each other
(ping-pong), or compute and tokens burned across several services. Fuel bounds only the current
run, not the services it calls.

None of the defences can live in agent code:

- **An agent that honours a depth counter?** A malicious one would not increment it.
- **An agent that checks an allowlist?** A malicious one would skip the check.
- **A request budget kept by the agent?** It could ignore or reset it.

So they live in the capability. The agent reaches the network only through the `httpFetch` atom,
which calls the `fetch` capability the host injected; the agent cannot see that function, its
configuration, or the headers it adds.

One of those headers is `X-Agent-Depth`. Your `fetch` capability always receives it; the built-in
client used when you pass no `fetch` sends it everywhere on a server, and in a browser only to the
page's own origin. `httpFetch` refuses to fetch once the incoming depth reaches 10. An endpoint
that receives agent traffic should read the header and pass it back in through the run's
`context`:

```javascript
const depth = Number(request.headers.get('x-agent-depth') ?? 0)
const run = await vm.run(ast, args, {
  fuel: 1000,
  capabilities: { fetch },
  context: { requestDepth: depth },
})
```

What the built-in `httpFetch` admits, and what a host's own `fetch` capability must decide, is
documented in one place: [Fetch policy](/ajs-host/#fetch-policy) in Hosting the AJS VM. A
complete, tested `fetch` capability with a domain allowlist is in [Safe Eval](/safe-eval/), under
"Nothing reaches out unless you allow it".

---

## Parallel Execution

AJS runs steps in sequence, by design: fuel consumption is predictable, execution order is
deterministic, and a trace reads top to bottom. When you need work done at once, do it in the
host, behind an atom. The agent cannot call a capability directly (a capability is reached only
through an atom), so define one that takes the whole batch and fans it out:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM, defineAtom } from 'tjs-lang/vm-ast'
import { s } from 'tjs-lang/schema'

// Host code: one atom call, many requests in parallel.
const fetchAll = defineAtom(
  'fetchAll', // the name the agent calls it by
  s.object({ urls: s.array(s.string) }), // input schema: what the agent must pass
  s.array(s.any), // output schema: what the atom returns
  async ({ urls }, ctx) =>
    // ctx is the run: its capabilities, its context, its abort signal
    Promise.all(urls.map((url) => ctx.capabilities.fetch(url))),
  { cost: ({ urls }) => 5 * urls.length, effects: 'io' } // cost is in fuel
)
const vm = new AgentVM({ fetchAll })

// Agent code calls it like any other atom, with named inputs.
const source = `function compare({ cities = ['paris', 'tokyo'] }) {
  let urls = cities.map((c) => 'https://api.example.com/weather/' + c)
  let reports = fetchAll({ urls })
  return { reports }
}`
// Passing the VM's atoms lets the transpiler check calls to fetchAll.
const { ast } = transpile(source, { atoms: vm.atoms })

// Your fetch capability, here a stub that takes 100 ms per request.
// It must return plain data (the body), not a Response.
const fetch = async (url) => {
  await new Promise((resolve) => setTimeout(resolve, 100))
  return { url, temperature: 20 }
}
const started = Date.now()
const run = await vm.run(ast, {}, { fuel: 100, capabilities: { fetch } })
console.log(run.result.reports.length, Date.now() - started < 200)
// → 2 true: two 100 ms requests finished in about 100 ms
```

`cost: 5 * urls.length` is five units of fuel per URL, the same as one `httpFetch` call each,
against the run's budget of 100.

The transpiler already knows the core atoms. Pass `{ atoms: vm.atoms }` when the source calls an
atom you defined: the transpiler then refuses a call with the wrong inputs
(`fetchAll({ url })` names the input it takes) before the program runs. Without it, the call
compiles unchecked.

Three things make this safe. `effects: 'io'` (the default, written out here) keeps the atom
behind the capability boundary, so its input arrives as a checked copy and its result is copied
back as plain data. The `cost` function charges for the whole batch, so a long list of URLs is not
one cheap call. And the atom calls the host's own `fetch` capability, which must enforce the
destination policy itself: the `httpFetch` checks (allowlist, methods, headers) do not apply to an
atom you write.

**The `fetch` capability's contract.** It is `(url, init) => Promise<data>`, not the browser's
`fetch`. `httpFetch` calls it with the admitted URL and `{ method, headers, body, signal,
responseType }`, and the agent receives whatever it resolves to; return the body, or a small
object such as `{ ok, status, body }`, never a `Response`. An atom you write calls the same
function however it likes, as `fetchAll` does with a URL alone. The full contract is
[fetch](/ajs-capabilities/#fetch) in Capabilities and Custom Atoms.

---

## Rate Limiting

Rate limits across runs (requests per second to a service, per user, per key) belong in the
capability, for the same reason as the rest of the network policy: an agent that controlled its
own rate limit could lift it. Here is a small limiter that spaces calls out, wrapped around
whatever `fetch` capability you already have:

```javascript
// Spaces calls at least 1000 / perSecond ms apart, across every run that shares it.
function rateLimited(fetchImpl, { perSecond, maxWaitMs = Infinity }) {
  const gap = 1000 / perSecond
  let next = 0 // the earliest time the next call may start
  return async (url, init) => {
    const now = Date.now()
    const start = Math.max(now, next)
    if (start - now > maxWaitMs) {
      // Refuse instead of queueing: the agent sees an ordinary, catchable error.
      throw new Error('Rate limit: try again later')
    }
    next = start + gap
    if (start > now) {
      await new Promise((resolve) => setTimeout(resolve, start - now))
    }
    return fetchImpl(url, init)
  }
}

// `myFetch` is your existing fetch capability; `vm`, `ast` and `args` are
// whatever agent you run (for instance, the ones from Parallel Execution).
// One limiter per upstream service, shared by every run that calls it.
const fetch = rateLimited(myFetch, { perSecond: 4, maxWaitMs: 5000 })
const run = await vm.run(ast, args, { fuel: 1000, capabilities: { fetch } })
```

The wait counts against the call's timeout (30 seconds for `httpFetch`); a limiter shared by many
busy runs can queue past it. Raise the timeout with `timeoutOverrides: { httpFetch: … }`, or set
`maxWaitMs` so the limiter refuses instead of waiting. A refusal thrown from the capability is an
ordinary failure, which the agent can catch.

Within a single run, the VM has a built-in cap: `quotas` limits how many times an atom may be
called, whatever fuel remains.

```javascript
const capped = await vm.run(ast, args, {
  fuel: 10000,
  quotas: { httpFetch: 10, llmPredict: 3 }, // an atom you do not list is unlimited
})
```

A call past the quota fails with `Quota exceeded for 'httpFetch': 10 calls allowed`. The agent can
catch that, but the count does not reset, so every later call to that atom fails too. A quota
counts calls within one run; how to hold one across nested runs is the last part of the next
section.

---

## Composing Agents

One agent runs another with `agentRun({ agentId, input })`. The sub-agent gets only the `input`
it is handed, never the caller's variables, and its result is whatever it returns. `agentId` is
named for its last use, but it takes three kinds of value, and which one decides where the
sub-agent runs and whose budget it spends:

- **An AST, or a stored procedure token.** The sub-agent runs inside the caller's run, on the
  same fuel and the same quotas. A token is an AST stored with the `storeProcedure` atom; it is a
  string (`proc_…`), lives in this process's memory, and expires after an hour unless you pass
  `ttl`.
- **Anything else (usually a name).** The VM calls the host's `agent` capability,
  `agent.run(agentId, input)`, and the host decides what to run and with what budget. That is a
  separate run.

A token lets an agent hand an AST it was given to later steps, or to other agents, as a short
string:

```javascript
// Inside an agent that received a worker's AST as `worker`:
const token = storeProcedure({ ast: worker }) // → 'proc_0abf…'
const r = agentRun({ agentId: token, input: { text } })
```

Both routes, with one worker and one caller:

```javascript
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const vm = new AgentVM()
const compile = (source) => transpile(source, { atoms: vm.atoms }).ast

// The worker: one model call per document.
const summarize = compile(`function summarize({ text = '' }) {
  const summary = llmPredict({ prompt: 'Summarize in five words: ' + text })
  return { summary }
}`)

// The caller: runs the worker once per document. `worker` has no default,
// so the host must pass it.
const digest = compile(`function digest({ worker, docs = [] }) {
  let summaries = []
  for (const text of docs) {
    const r = agentRun({ agentId: worker, input: { text } })
    summaries.push(r.summary)
  }
  return { summaries }
}`)

const llm = { predict: async (prompt) => 'a five word summary here' }
const docs = ['first', 'second', 'third', 'fourth']
const quotas = { llmPredict: 3 }

// 1. Inline: pass the worker's AST (or a token for it). One run, one budget,
//    so the fourth model call exceeds the quota and the run fails.
const inline = await vm.run(
  digest,
  { worker: summarize, docs },
  { fuel: 1000, capabilities: { llm }, quotas }
)
console.log(inline.error.message) // → Quota exceeded for 'llmPredict': 3 calls allowed

// 2. Through the host: the agent names a worker, the host looks it up and runs it.
const registry = { summarize }
const agent = {
  run: async (id, input) => {
    const ast = registry[id]
    if (!ast) throw new Error(`No agent named ${id}`)
    return vm.run(ast, input, { fuel: 500, capabilities: { llm }, quotas })
  },
}
const hosted = await vm.run(
  digest,
  { worker: 'summarize', docs },
  { fuel: 1000, capabilities: { agent }, quotas }
)
console.log(hosted.result.summaries.length) // → 4: each run had its own quota of 3
```

**What `agent.run` returns.** Here it returns `vm.run`'s run record, `{ result, error, … }`.
`agentRun` unwraps it: the caller gets the record's `result` (so `r.summary` works), and a record
with an `error` becomes a failure in the caller. A plain object, the sub-agent's result itself,
is accepted too.

The second run made four model calls under a quota of three, because each `vm.run` the
capability starts counts its own calls. An agent that can make a capability re-enter the VM can
multiply its allowance that way. To hold the cap across the whole call tree, create one
`quotaUsed` object and pass it to every run:

```javascript
const quotaUsed = {} // one ledger for the outer run and every nested one
const shared = {
  run: async (id, input) =>
    vm.run(registry[id], input, {
      fuel: 500,
      capabilities: { llm },
      quotas,
      quotaUsed,
    }),
}
const capped = await vm.run(
  digest,
  { worker: 'summarize', docs },
  { fuel: 1000, capabilities: { agent: shared }, quotas, quotaUsed }
)
console.log(capped.error.message) // → Quota exceeded for 'llmPredict': 3 calls allowed
```

`quotaUsed` is trusted host state; what that requires of you is in
[Quotas across nested runs](/ajs-host/#quotas-across-nested-runs).

A sub-agent that fails, by either route, is an ordinary failure in the caller, which a
`try`/`catch` around `agentRun` catches. On the host route that includes the capability throwing,
as it does above for an unknown name. A quota refusal raised inside an inline sub-agent is
catchable too, but the count does not reset, so a caller that catches it and keeps looping gets
the same refusal on every later call.

Choose the inline route when one budget for the whole tree is what you want, and the capability
when the host should decide what a name means and what it may spend. For a pipeline where the
"agents" are only roles (three prompts in one program), you need neither; see the
[multi-agent pipeline example](/multi-agent-pipeline/).

---

## Memoization and Caching

`memoize` and `cache` run a block of steps once and reuse its result. They take the block itself
as input, and AJS source has no way to write a block of steps as a value (an arrow function is
only allowed as a direct argument to `map`, `filter`, `find` and `reduce`). So both are written
with the builder, in host code that produces the AST.

The builder (`vm.Agent`) is a fluent API that builds the same kind of AST the transpiler emits,
one step per method call. Each atom is a method taking that atom's named inputs; `.as(name)`
binds the previous step's result to a variable; `.return(schema)` ends the program, returning the
variables the schema names; `.toJSON()` gives the AST. `.memoize(block, key)` and
`.cache(block, key, ttlMs)` take the block as a function from a builder to a builder, and the
block's `return` is the cached value.

`memoize` caches for the rest of the run, by a key you choose:

```javascript
import { AgentVM } from 'tjs-lang/vm-ast'
import { s } from 'tjs-lang/schema'

const llm = { predict: async (prompt) => 'Fuel meters work.' } // or your model capability
const vm = new AgentVM()

const explain = (b) =>
  b
    .llmPredict({ prompt: 'Explain fuel metering.' })
    .as('answer')
    .return(s.object({ answer: s.string }))

const ast = vm.Agent.memoize(explain, 'explain-fuel')
  .as('first')
  .memoize(explain, 'explain-fuel') // same key: no second model call
  .as('second')
  .return(s.object({ first: s.any, second: s.any }))
  .toJSON()

const run = await vm.run(ast, {}, { fuel: 1000, capabilities: { llm } })
console.log(run.result)
// → { first: { answer: 'Fuel meters work.' }, second: { answer: 'Fuel meters work.' } }
//   from one model call
```

The key must name everything the result depends on. Two blocks with the same key share one
result, even if their inputs differ.

`cache` persists across runs, in the host's `store` capability, with a time to live in
milliseconds. Continuing with the `vm` and `s` from above:

```javascript
const weather = vm.Agent.cache(
  (b) =>
    b
      .httpFetch({
        url: 'https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current_weather=true',
      })
      .as('forecast')
      .return(s.object({ forecast: s.any })),
  'weather-paris',
  3600000 // one hour
)
  .as('report')
  .return(s.object({ report: s.any }))
  .toJSON()

// The store must outlive the runs: here a Map kept by the host.
const data = new Map()
const store = {
  get: async (key) => data.get(key),
  set: async (key, value) => {
    data.set(key, value)
  },
}
const context = { allowedFetchDomains: ['api.open-meteo.com'] }
await vm.run(weather, {}, { fuel: 1000, capabilities: { store }, context })
console.log([...data.keys()]) // → [ 'cache:weather-paris' ]
```

The first run fetches and stores the result under `cache:weather-paris`; later runs within the
hour read it from the store. A block that fails is not cached. With no `store` capability the VM
uses an in-memory store that lasts one run, so nothing is cached between runs. In AJS source, the
same effect is `storeGet` and `storeSet` around the work, as [Fuel Budgeting](#fuel-budgeting)
shows.

---

## Testing Patterns

An agent is data plus a host, so test it the way you would test any function with injected
dependencies: give it fake capabilities and assert on what it returns.

### Mock Capabilities

```javascript
import { expect, test } from 'bun:test'
import { transpile } from 'tjs-lang/lang'
import { AgentVM } from 'tjs-lang/vm-ast'

const source = `function cached({ key = 'greeting' }) {
  let hit = storeGet({ key })
  if (hit) {
    return { value: hit, cached: true }
  }
  storeSet({ key, value: 'hello' })
  return { value: 'hello', cached: false }
}`

const vm = new AgentVM()
const { ast } = transpile(source, { atoms: vm.atoms })
const data = new Map([['greeting', 'hi']])
const store = {
  get: async (key) => data.get(key),
  set: async (key, value) => {
    data.set(key, value)
  },
}

test('a cache hit returns the stored value', async () => {
  const run = await vm.run(ast, {}, { fuel: 100, capabilities: { store } })
  expect(run.result).toEqual({ value: 'hi', cached: true })
  expect(data.get('greeting')).toBe('hi') // and the stored value is unchanged
})
```

`storeGet` and `storeSet` need only `get` and `set`, both async; the other store methods are
optional and serve other atoms ([store](/ajs-capabilities/#store)). A fake `llm` is one function,
`{ predict: async (prompt) => 'canned answer' }`, which makes the logic around a model call
testable without a model.

### Trace Inspection

Pass `trace: true` and the run returns every step it executed:

```javascript
test('a cache hit never calls storeSet', async () => {
  const traced = await vm.run(ast, {}, {
    fuel: 100,
    capabilities: { store },
    trace: true,
  })
  // Each event records the atom, its input, the state it changed and the fuel before and after
  expect(traced.trace).toContainEqual(expect.objectContaining({ op: 'storeGet' }))
  expect(traced.trace.some((e) => e.op === 'storeSet')).toBe(false)
})
```

### Snapshot Testing

```javascript
test('the agent compiles to the reviewed AST', () => {
  // This agent calls no atom you defined, so `transpile` needs no `atoms`.
  const { ast } = transpile(`function add({ a = 1, b = 2 }) {
  return { sum: a + b }
}`)
  // The AST is plain JSON: a snapshot shows exactly what the VM will run
  expect(ast).toMatchSnapshot()
})
```
