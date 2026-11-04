<!--{"parent": "ajs.md", "order": 5}-->

# AJS Patterns

This document covers common patterns and workarounds for features not directly supported in AJS.

<!-- TODO review -->
AJS leaves things out on purpose: each missing feature is either something the VM could not meter
(an unbudgeted conversion, a closure that outlives its scope) or something that belongs to the
host rather than to untrusted code (parallelism, timing, rate limits). So most patterns here are
one of two kinds: the AJS way to write what JavaScript would write differently, or the host-side
way to provide what an agent must not control itself. The AJS examples run on this page; examples
that need a language model print a message instead.

## Table of Contents

- [Parallel Execution](#parallel-execution)
- [Retry with Backoff](#retry-with-backoff)
- [Fetch Security](#fetch-security)
- [Rate Limiting](#rate-limiting)
- [Break/Continue](#breakcontinue)
- [Switch Statements](#switch-statements)
- [Error Handling Patterns](#error-handling-patterns)
- [Unsupported JavaScript Features](#unsupported-javascript-features)
- [Performance Patterns](#performance-patterns)
- [Testing Patterns](#testing-patterns)
- [Expression Limitations](#expression-limitations)

---

## Parallel Execution

**Status:** Not supported

AJS executes sequentially by design. This is intentional for:

- Predictable fuel consumption
- Deterministic execution order
- Simpler debugging and tracing

<!-- TODO review -->
**Workaround:** If you need parallel execution, do it in the host, behind an atom. The agent
cannot call a capability object directly (a capability is reached only through an atom), so
define one that takes the whole batch and fans it out:

```javascript
import { AgentVM, defineAtom, transpile } from 'tjs-lang'
import { s } from 'tosijs-schema'

// Host code: one atom call, many requests in parallel.
const fetchAll = defineAtom(
  'fetchAll',
  s.object({ urls: s.array(s.string) }),
  s.array(s.any),
  async ({ urls }, ctx) =>
    Promise.all(urls.map((url) => ctx.capabilities.fetch(url))),
  { cost: ({ urls }) => 5 * urls.length, effects: 'io' }
)
const vm = new AgentVM({ fetchAll })

// Agent code calls it like any other atom, with named inputs.
const source = `function compare({ cities = ['paris', 'tokyo'] }) {
  let urls = cities.map((c) => 'https://api.example.com/weather/' + c)
  let reports = fetchAll({ urls })
  return { reports }
}`
const { ast } = transpile(source, { atoms: vm.atoms })
```

<!-- TODO review -->
Three things make this safe. `effects: 'io'` puts the atom behind the capability boundary, so its
input arrives as a checked copy and its result is copied back as plain data. The `cost` function
charges for the whole batch, so a long list of URLs is not one cheap call. And the atom calls the
host's own `fetch` capability, which must enforce the destination policy itself: the built-in
`httpFetch` checks (allowlist, methods, headers) do not apply to an atom you write.

**Future:** Parallel execution may be added as an explicit atom (e.g., `parallel([...steps])`) where fuel is consumed for the most expensive branch.

---

## Retry with Backoff

**Status:** Manual pattern required

<!-- TODO review -->
AJS doesn't have built-in retry. Implement it with a `while` loop whose condition says when to
stop, and a `try`/`catch` inside it:

```ajs:inline
function fetchWithRetry({
  url = 'https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current_weather=true',
  maxAttempts = 3,
}) {
  let attempts = 0
  let result = null
  let lastError = null
  while (attempts < maxAttempts && result === null) {
    attempts = attempts + 1
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

<!-- TODO review -->
Change the URL to a host this page does not allow (say `https://example.com/`) and run it again:
all three attempts fail, each one is paid for in fuel, and the agent reports the last error.

**Note:** There is no backoff, because AJS has no `sleep`. Waiting is the host's time to spend,
not the agent's: a sleeping agent holds a run open without doing work that fuel can measure. Put
the retry-with-backoff in the host's `fetch` capability, where it belongs with the other network
policy, and the agent sees one call that either succeeds or fails.

---

## Fetch Security

**Status:** Capability responsibility

### The Problem: Recursive Agent Attacks

A malicious or buggy agent could use `fetch` to call other agent endpoints, creating:

- **Amplification attacks** - One request triggers many downstream requests
- **Ping-pong loops** - Two endpoints repeatedly calling each other
- **Resource exhaustion** - Consuming compute/tokens across multiple services

Fuel budgets only protect the _current_ VM, not downstream services. SSRF protection blocks private IPs but not public agent endpoints.

### The Solution: Capability-Level Enforcement

Since agents are untrusted code, security must be enforced at the **capability layer**:

1. **Depth tracking** - The fetch capability (not the agent) adds/increments an `X-Agent-Depth` header
2. **Domain allowlist** - Fetch only works for explicitly allowed domains
3. **Receiving endpoints** - Check depth headers and reject requests that are too deep

```typescript
// Host provides a secure fetch capability (your own wrapper; illustrative name; see
// guides/safe-eval.md for a complete, tested one)
capabilities: {
  fetch: createSecureFetch({
    allowedDomains: ['api.weather.com', 'api.github.com'],
    maxDepth: 5,
    currentDepth: requestDepth, // From incoming request header
  })
}
```

The agent cannot bypass this because:

- It only has access to the capability, not raw `fetch`
- The capability is trusted code provided by the host
- Headers are added automatically - the agent can't see or modify them

### Why This Can't Be Solved in Agent Code

- **Agent honors depth?** - A malicious agent would just not increment it
- **Agent checks allowlist?** - A malicious agent would skip the check
- **Request budget in agent?** - Agent could ignore or reset it

The **capability is the trust boundary**. Agent code is untrusted; capabilities are trusted code injected by the host.

### Built-in Fetch Behavior

The default fetch atom:

- Requires a domain allowlist (`ctx.context.allowedFetchDomains`); without one, every URL is refused
- Fetches only `http:` and `https:` URLs, and follows no redirects: a 3xx comes back as
  `{ redirect: true, status, location }`, and fetching `location` is a new, separately admitted
  request
- Is a demonstration capability, highly constrained by default: GET and HEAD only (a host
  enables more with `context.allowedFetchMethods`), a closed list of request headers (`Accept`,
  `Authorization`, `Content-Type`, `X-API-Key`, …; a host adds names with
  `context.allowedRequestHeaders`), the default port of each allowlisted domain unless the entry
  names one, and no browser cookies or HTTP auth. A host's own `fetch` capability gets the same
  admission of the agent's method and headers
- Reads the response under `membraneMaxBytes`
- Automatically adds `X-Agent-Depth` header based on `ctx.context.requestDepth`
- Rejects requests exceeding `MAX_AGENT_DEPTH` (default: 10)

<!-- TODO review -->
- Returns the response body whatever the status: a 404 or 500 is not an error, so check the body
  (an API's error object) before you use it

For production, always provide a custom fetch capability with appropriate restrictions.

---

## Rate Limiting

**Status:** Capability responsibility

<!-- TODO review -->
Rate limiting across runs (requests per second to a service, per user, per key) belongs in the
capability layer, not in AJS:

```javascript
// Inject a rate-limited fetch capability (your own wrapper; illustrative name)
const rateLimitedFetch = createRateLimitedFetch({
  requestsPerSecond: 10,
  burstSize: 5,
})

const run = await vm.run(ast, args, {
  capabilities: {
    fetch: rateLimitedFetch,
  },
})
```

**Rationale:** Rate limits are deployment-specific. A sandboxed agent shouldn't control its own rate limits since that would allow circumvention.

<!-- TODO review -->
Within a single run, the VM has a built-in cap: `quotas` limits how many times an atom may be
called, whatever fuel remains.

```javascript
const capped = await vm.run(ast, args, {
  fuel: 10000,
  quotas: { httpFetch: 10, llmPredict: 3 }, // an atom you do not list is unlimited
})
```

A quota counts calls within one run. A capability that starts a new `vm.run` gets a fresh count
unless you pass the same `quotaUsed` object to both runs; see the [AJS guide](/DOCS-AJS/).

---

## Break/Continue

**Status:** Not supported

<!-- TODO review -->
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
    i = i + 1
  }
  return { found, examined: i }
}
```

<!-- TODO review -->
And skip with an `if`, or filter first:

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

**Status:** Not supported

<!-- TODO review -->
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

<!-- TODO review -->
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

## Error Handling Patterns

### Monadic Error Flow

AJS uses monadic error handling. When an error occurs, subsequent atoms are skipped until a `try/catch` block handles it:

<!-- TODO review -->

```ajs:inline
function loadData({ url = 'https://example.com/data.json' }) {
  storeSet({ key: 'data', value: { cached: true } }) // as a previous run would have

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

<!-- TODO review -->
In the `catch`, `err` is the error's message, a string. An error that is never caught ends the
run, and the host reads it from the run's `error`; nothing is thrown into the host.

### Graceful Degradation

Use `try/catch` with fallbacks:

<!-- TODO review -->

```ajs:inline
function answer({ prompt = 'Explain fuel metering in one sentence.' }) {
  let result = null
  try {
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

<!-- TODO review -->
(This one needs a model, so on this page it prints a message instead of running.)

### Error Aggregation

Collect errors without stopping execution:

<!-- TODO review -->

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
      // Continue processing - nothing re-raises it
    }
  }

  return {
    results: results,
    errors: errors,
    success: errors.length == 0,
  }
}
```

<!-- TODO review -->
### Errors you cannot catch

A refusal at the capability boundary that means the code is wrong (an atom called with input it
does not declare, a value that cannot be copied out, a host capability returning something JSON
cannot express) ends the run, even inside a `try`. A program that could catch its own bugs could
retry them in a loop. Failures of the world (network errors, a refused domain, bad JSON, a model
that is down) stay catchable.

---

## Unsupported JavaScript Features

These JavaScript features are intentionally not supported:

<!-- TODO review -->

| Feature                             | Reason                                         | Alternative                                    |
| ----------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `async/await`                       | All atoms are already async                    | Direct calls work                              |
| `class`                             | OOP not needed for agent logic                 | Use plain objects                              |
| `this`                              | No object context                              | Pass data explicitly                           |
| `new`                               | No constructors                                | `Set(items)`, `Date(text)`, plain objects      |
| `import/export`                     | Single-file execution                          | Use capabilities                               |
| `eval`                              | Security                                       | `runCode`, if the host grants it               |
| `throw`                             | Use monadic errors                             | `Error('message')`                             |
| `instanceof`                        | No classes                                     | `Array.isArray(x)`, `typeof x`                 |
| `switch`, `break`, `continue`       | See the sections above                         | `if`/`else if`, loop conditions                |
| `for (;;)`, `for...in`, `do...while` | One loop form per job                          | `for...of`, `while`, `Object.keys(obj)`        |
| `obj.x = v`, `obj[k] = v`           | Only simple variable assignment                | `obj = { ...obj, x: v }`                       |
| Functions as values                 | No closures escape a call                      | Helper functions, called by name               |

<!-- TODO review -->
`typeof` is supported. `var` works but is not idiomatic: use `let` and `const`.

---

## Performance Patterns

### Memoization

Use the built-in `memoize` atom for expensive operations:

```javascript
// Builder API
Agent.take().memoize(
  (b) => b.llmPredict({ prompt: expensivePrompt }).as('result'),
  'expensive-key'
)

// Results are cached by key within the execution
```

<!-- TODO review -->
The key is required, and it is yours to choose: it must name everything the result depends on.
Two blocks with the same key share one result, even if their inputs differ.

### Caching

Use the `cache` atom with a TTL for persistence across executions. Like `memoize`, it takes a
list of steps, so it is written with the builder (AsyncJS source has no callbacks):

```javascript
// Builder API: cache for 1 hour
Agent.take().cache(
  (b) => b.httpFetch({ url: 'https://api.weather.com/' + city }).as('weather'),
  'weather-' + city,
  3600000
)
```

### Fuel Budgeting

Monitor and limit computation:

<!-- TODO review -->
A program cannot read its remaining fuel: the host sets the budget, and a run that exhausts it
stops with an `Out of Fuel` error the host sees. So bound the work in the program, cache what is
expensive, and let the host choose `fuel`, `timeoutMs` and per-atom `quotas`:

```ajs:inline
function sumSquares(n) {
  let total = 0
  let i = 1
  while (i <= n) {
    total = total + i * i
    i = i + 1
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

<!-- TODO review -->
Watch `fuelUsed`: the loop costs about half a unit per step. Raise `n` to 20,000 and this page's
budget (10,000 units) runs out before the loop does.

---

## Testing Patterns

<!-- TODO review -->
An agent is data plus a host, so test it the way you would test any function with injected
dependencies: give it fake capabilities and assert on what it returns.

### Mock Capabilities

<!-- TODO review -->

```javascript
import { expect, test } from 'bun:test'
import { AgentVM, transpile } from 'tjs-lang'

const source = `function cached({ key = 'greeting' }) {
  let hit = storeGet({ key })
  if (hit) {
    return { value: hit, cached: true }
  }
  storeSet({ key, value: 'hello' })
  return { value: 'hello', cached: false }
}`

test('a cache hit skips the write', async () => {
  const vm = new AgentVM()
  const { ast } = transpile(source, { atoms: vm.atoms })
  const data = new Map([['greeting', 'hi']])
  const store = {
    get: async (key) => data.get(key),
    set: async (key, value) => {
      data.set(key, value)
    },
  }
  const run = await vm.run(ast, {}, { fuel: 100, capabilities: { store } })
  expect(run.result).toEqual({ value: 'hi', cached: true })
})
```

A fake `llm` is a single function, `{ predict: async (prompt) => 'canned answer' }`, which makes
the logic around a model call testable without one.

### Snapshot Testing

<!-- TODO review -->

```javascript
import { expect, test } from 'bun:test'
import { transpile } from 'tjs-lang'

test('the agent compiles to the reviewed AST', () => {
  const { ast } = transpile(`function add({ a = 1, b = 2 }) {
  return { sum: a + b }
}`)
  // The AST is plain JSON: a snapshot shows exactly what the VM will run
  expect(ast).toMatchSnapshot()
})
```

### Trace Inspection

<!-- TODO review -->

```javascript
const traced = await vm.run(ast, {}, {
  fuel: 100,
  capabilities: { store },
  trace: true,
})

// Each event records the atom, its input, the state it changed and the fuel before and after
expect(traced.trace).toContainEqual(expect.objectContaining({ op: 'storeGet' }))
expect(traced.trace.some((e) => e.op === 'storeSet')).toBe(false)
```

---

## Expression Limitations

Some JavaScript expressions have limitations in AJS due to the compilation model.

<!-- TODO review -->
Earlier versions of this page listed template literals inside objects and computed member access
(`obj[key]`, `items[i]`) as unsupported. Both work now:

```ajs:inline
function lookup({ obj = { name: 'Ada', role: 'admin' }, key = 'role', items = [10, 20, 30] }) {
  const i = 1
  const card = { title: `${obj.name} (${obj[key]})`, second: items[i] }
  return card
}
```

What remains is a short list, and the transpiler or VM names each case when it meets it.

### Atom and Helper Calls in Expressions

<!-- TODO review -->
An atom call or a call to one of your helper functions must be the whole right-hand side of a
statement. Inside a larger expression it is refused: `1 + storeGet({ key })` fails when it runs,
and `{ v: double(n) + 1 }` fails to transpile. Lift the call to a variable first:

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

<!-- TODO review -->
`map`, `filter`, `find` and `reduce` take an arrow function, at statement level, one per
statement. A callback may call an atom, so a fetch per item is legal (and each one is metered):

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

Chaining, `items.filter(…).map(…)`, is refused: write two statements. `some`, `every` and a
`sort` comparator are not available; `sort()` with no argument is.

These limitations exist because AJS compiles to a JSON AST that executes step-by-step. Complex nested expressions would require runtime evaluation that could bypass fuel tracking and capability checks.
