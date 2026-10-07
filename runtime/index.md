## seq (Sequence)

The root atom for all agent programs. Executes steps in order.

- Stops on `return` (when `ctx.output` is set)
- Stops on error (monadic error flow)
- Cost: 0.1

```javascript
// AsyncJS compiles to seq at the top level
const x = 1
const y = 2
return { sum: x + y }
```

## if (Conditional)

Conditional branching based on expression evaluation.

```javascript
if (count > 0) {
  console.log("Has items")
} else {
  console.log("Empty")
}
```

## while (Loop)

Repeats body while condition is truthy. Consumes fuel each iteration.

```javascript
let i = 0
while (i < 10) {
  console.log(i)
  i = i + 1
}
```

**Note:** No `break`/`continue`. Use condition variables instead.

## return

Ends execution and returns values from state. The schema defines which
state variables to include in the output.

```javascript
const result = compute()
return { result }  // Returns { result: <computed value> }
```

## try/catch

Error handling with monadic error flow. When an error occurs, subsequent
steps are skipped until caught.

```javascript
try {
  const data = fetch(url)
  processData(data)
} catch (err) {
  console.warn("Failed: " + err)
  return { error: err }
}
```

The catch block receives:
- `err` (or custom name): error message
- `errorOp`: the atom that failed

## for...of / map

Transforms each item in an array. The `result` variable in each iteration
becomes the new item value.

```javascript
const doubled = items.map(x => x * 2)

// Or with for...of:
const results = []
for (const item of items) {
  results.push(process(item))
}
```

## filter

Keeps items that match a condition.

```javascript
const adults = users.filter(u => u.age >= 18)
```

## reduce

Accumulates a single value from an array.

```javascript
const sum = numbers.reduce((acc, n) => acc + n, 0)
```

## find

Returns first item matching condition, or null.

```javascript
const admin = users.find(u => u.role === "admin")
```

## httpFetch

HTTP requests, through the host's `fetch` capability or the built-in client.

```javascript
const data = httpFetch({ url: 'https://api.example.com/data' })
// POST needs the host to enable it for the run: context.allowedFetchMethods: ['POST']
const posted = httpFetch({
  url: 'https://api.example.com/items',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: { name: 'New Item' }
})
```

Response types: `"json"` (default for JSON content-type), `"text"`, `"dataUrl"` (for images)

Security:
- Requires a `ctx.context.allowedFetchDomains` allowlist (or a custom `fetch` capability); without
  one, every URL is refused. Only `http:`/`https:`; no redirects are followed (a redirect returns
  `{ redirect: true, status, location }`, location absolute; a 304 is a response); a closed list of
  request headers (`context.allowedRequestHeaders` adds more); GET/HEAD only by default
  (`context.allowedFetchMethods` adds more); an allowlist entry admits the default port unless it
  names one; the body is read under `membraneMaxBytes`. A DEMONSTRATION capability: real
  deployments supply their own `fetch`, which gets the same admission of method and headers
- Automatically adds `X-Agent-Depth` header to prevent recursive agent loops
- A custom `fetch` capability receives the ADMITTED request (scheme, method and headers always;
  the domain allowlist when set) plus the depth header, and owns redirects, credentials and the
  destination policy when no allowlist is set

## storeGet / storeSet

Persistent key-value storage. Requires `store` capability.

```javascript
// Save data
storeSet({ key: 'user:123', value: { name: 'Alice', prefs: {} } })

// Retrieve later
const user = storeGet({ key: 'user:123' })
```

**Warning:** Default in-memory store is not suitable for production.

## storeQueryWhere (predicate pushdown)

Send the *predicate* to the data instead of dragging rows to the code.

`predicate` is a **canonical verified predicate** — build it at author/transpile time
with `canonicalizePredicate()` from `tjs-lang/lang`, then pass the resulting object.
Because it is verified pure and canonical, it is safe to ship, cheap to compare, and
carries a stable `key` the store can cache on (two spellings of the same predicate hit
the same cache entry).

```javascript
// canonical form produced outside the VM; the VM forwards it as data
const rows = storeQueryWhere({ collection: 'users', predicate: adultPredicate })
```

Requires a store that implements `queryPredicate`. If it doesn't, this fails with a
message pointing at the ordinary `storeQuery` + `filter` path rather than silently
returning everything — a filter that silently doesn't filter is an authorization bug.

## llmPredict

Call language model. Requires `llm` capability with `predict` method.

```javascript
const response = llmPredict("Summarize this: " + text)

// With options
const structured = llmPredict(prompt, {
  model: "gpt-4",
  temperature: 0.7,
  responseFormat: { type: "json_object" }
})
```

## transpileCode (Code to AST)

Transpiles AsyncJS code to an AST without executing it.
Useful for generating agents to send to other services via fetch.

```javascript
// Generate an agent and send it to a worker
let code = llmPredict({ prompt: 'Write an AsyncJS data processor' })
let ast = transpileCode({ code })
// POST is enabled by the host for the run (context.allowedFetchMethods: ['POST'])
let result = httpFetch({
  url: 'https://worker.example.com/run',
  method: 'POST',
  body: JSON.stringify({ ast, args: { data: myData } })
})
```

Security: Only available when the `code.transpile` capability is provided.

## runCode (Dynamic Code Execution)

Transpiles and executes AsyncJS code at runtime. The generated code is its
own program: it sees only the `args` it is given — not the caller's
variables or helpers — and shares the run's fuel, heap budget,
capabilities, and trace.

This enables agents to write and execute code to solve problems.

```javascript
// Agent writes code to solve a problem
let code = llmPredict({ prompt: 'Write AsyncJS to calculate fibonacci(10)' })
let result = runCode({ code, args: {} })
return { answer: result }
```

The code must be a valid AsyncJS function. The function's return value
becomes the result of runCode.

Security: Only available when the `code.transpile` capability is provided.
The transpiled code runs with the same permissions as the parent.
Recursion depth is limited to prevent stack overflow.

## memoize

In-memory caching within a single execution. Same key returns cached result.

```javascript
// Expensive computation cached by key
const result = memoize("expensive-" + id, () => {
  return heavyComputation(data)
})
```

## cache

Persistent caching across executions using store capability.

```javascript
// Builder API (cache takes steps, which AsyncJS source cannot express): 1 hour
Agent.take().cache(
  (b) => b.httpFetch({ url: 'https://api.weather.com/' + city }).as('weather'),
  'weather-' + city,
  3600000
)
```

## console.log / console.warn / console.error

Logging utilities that integrate with trace and error flow.

```javascript
console.log("Debug info: " + value)   // Adds to trace
console.warn("Potential issue")        // Adds to trace + warnings summary
console.error("Fatal: " + msg)         // Triggers monadic error flow
```

- `log`: trace only (no side effects)
- `warn`: trace + appears in `result.warnings`
- `error`: stops execution, sets `result.error`
