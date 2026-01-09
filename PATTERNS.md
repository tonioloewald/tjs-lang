# AsyncJS Patterns

This document covers common patterns and workarounds for features not directly supported in AsyncJS.

## Table of Contents

- [Parallel Execution](#parallel-execution)
- [Retry with Backoff](#retry-with-backoff)
- [Rate Limiting](#rate-limiting)
- [Break/Continue](#breakcontinue)
- [Switch Statements](#switch-statements)
- [Error Handling Patterns](#error-handling-patterns)
- [Expression Limitations](#expression-limitations)

---

## Parallel Execution

**Status:** Not supported

AsyncJS executes sequentially by design. This is intentional for:

- Predictable fuel consumption
- Deterministic execution order
- Simpler debugging and tracing

**Workaround:** If you need parallel execution, orchestrate at the capability level:

```javascript
// Capability that handles parallelism
const parallelFetch = {
  fetchAll: async (urls) => {
    return Promise.all(urls.map((url) => fetch(url).then((r) => r.json())))
  },
}

// AsyncJS code calls the capability
const results = parallelFetch.fetchAll(urls)
```

**Future:** Parallel execution may be added as an explicit atom (e.g., `parallel([...steps])`) where fuel is consumed for the most expensive branch.

---

## Retry with Backoff

**Status:** Manual pattern required

AsyncJS doesn't have built-in retry. Implement with a while loop:

```javascript
let attempts = 0
let result = null
let success = false

while (attempts < 3 && !success) {
  attempts = attempts + 1

  try {
    result = fetch(url)
    success = true
  } catch (err) {
    // Exponential backoff: 100ms, 200ms, 400ms
    // Note: sleep is a capability, not built-in
    if (attempts < 3) {
      sleep(100 * Math.pow(2, attempts - 1))
    }
  }
}

if (!success) {
  console.error('Failed after 3 attempts')
}
return result
```

**Note:** The `sleep` capability must be injected. AsyncJS doesn't include timing primitives to keep the VM deterministic.

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
// Host provides a secure fetch capability
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

- Requires a domain allowlist OR restricts to localhost only
- Automatically adds `X-Agent-Depth` header based on `ctx.context.requestDepth`
- Rejects requests exceeding `MAX_AGENT_DEPTH` (default: 10)

For production, always provide a custom fetch capability with appropriate restrictions.

---

## Rate Limiting

**Status:** Capability responsibility

Rate limiting should be implemented in the capability layer, not in AsyncJS:

```typescript
// Inject a rate-limited fetch capability
const rateLimitedFetch = createRateLimitedFetch({
  requestsPerSecond: 10,
  burstSize: 5,
})

const result = await runAgent(ast, {
  capabilities: {
    fetch: rateLimitedFetch,
  },
})
```

**Rationale:** Rate limits are deployment-specific. A sandboxed agent shouldn't control its own rate limits since that would allow circumvention.

---

## Break/Continue

**Status:** Not supported

Use conditional logic instead:

```javascript
// Instead of break:
let found = null
let i = 0
while (i < items.length && found === null) {
  if (items[i].matches) {
    found = items[i]
  }
  i = i + 1
}

// Instead of continue (skip items):
for (const item of items) {
  if (!item.shouldProcess) {
    // Just don't do anything - effectively a continue
  } else {
    processItem(item)
  }
}

// Or use filter to pre-process:
const toProcess = items.filter((item) => item.shouldProcess)
for (const item of toProcess) {
  processItem(item)
}
```

---

## Switch Statements

**Status:** Not supported

Use chained if/else:

```javascript
// Instead of switch(action):
let result
if (action === 'create') {
  result = handleCreate(data)
} else if (action === 'update') {
  result = handleUpdate(data)
} else if (action === 'delete') {
  result = handleDelete(data)
} else {
  result = { error: 'Unknown action' }
}

// For many cases, consider a lookup object:
const handlers = {
  create: () => handleCreate(data),
  update: () => handleUpdate(data),
  delete: () => handleDelete(data),
}
const handler = handlers[action]
if (handler) {
  result = handler()
} else {
  result = { error: 'Unknown action' }
}
```

---

## Error Handling Patterns

### Monadic Error Flow

AsyncJS uses monadic error handling. When an error occurs, subsequent atoms are skipped until a `try/catch` block handles it:

```javascript
try {
  const data = fetch(url) // If this fails...
  const parsed = JSON.parse(data) // ...this is skipped
  storeSet('data', parsed) // ...this is skipped too
} catch (err) {
  console.warn('Fetch failed, using cached data')
  const cached = storeGet('data')
  return cached ?? { fallback: true }
}
```

### Graceful Degradation

Use `try/catch` with fallbacks:

```javascript
let result

try {
  result = llmPredict(prompt, { model: 'gpt-4' })
} catch (err) {
  // Fall back to simpler model
  try {
    result = llmPredict(prompt, { model: 'gpt-3.5-turbo' })
  } catch (err2) {
    // Fall back to static response
    result = "I'm unable to process your request right now."
  }
}

return result
```

### Error Aggregation

Collect errors without stopping execution:

```javascript
const errors = []
const results = []

for (const item of items) {
  try {
    const result = processItem(item)
    results.push(result)
  } catch (err) {
    errors.push({ item: item.id, error: err.message })
    // Continue processing - no re-throw
  }
}

return {
  results: results,
  errors: errors,
  success: errors.length === 0,
}
```

---

## Unsupported JavaScript Features

These JavaScript features are intentionally not supported:

| Feature         | Reason                         | Alternative           |
| --------------- | ------------------------------ | --------------------- |
| `async/await`   | All atoms are already async    | Direct calls work     |
| `class`         | OOP not needed for agent logic | Use plain objects     |
| `this`          | No object context              | Pass data explicitly  |
| `new`           | No constructors                | Use factory functions |
| `import/export` | Single-file execution          | Use capabilities      |
| `eval`          | Security                       | N/A                   |
| `throw`         | Use monadic errors             | `console.error()`     |
| `typeof`        | Limited runtime type info      | Use Schema validation |
| `instanceof`    | No classes                     | Use duck typing       |

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

### Caching

Use `cache` atom with TTL for persistence across executions:

```javascript
// Cache for 1 hour
const result = cache('weather-' + city, 3600000, () => {
  return fetch('https://api.weather.com/' + city)
})
```

### Fuel Budgeting

Monitor and limit computation:

```javascript
// Check remaining fuel before expensive operation
if (fuel.current < 100) {
  console.warn('Low fuel, using cached result')
  return storeGet('cached-result')
}

// Proceed with expensive operation
const result = complexComputation()
```

---

## Testing Patterns

### Mock Capabilities

```typescript
import {
  createMockStore,
  createMockLLM,
  createCapabilities,
} from 'tosijs-agent/test-utils'

const caps = createCapabilities({
  store: createMockStore({ key: 'value' }),
  llm: createMockLLM('mocked response'),
})

const result = await runAgent(ast, { capabilities: caps })
```

### Snapshot Testing

```typescript
const ast = ajs`
  const x = 1 + 2
  return x
`

// Snapshot the AST for regression testing
expect(ast).toMatchSnapshot()
```

### Trace Inspection

```typescript
const result = await runAgent(ast, {
  trace: true,
  capabilities: caps,
})

// Inspect execution trace
expect(result.trace).toContainEqual(expect.objectContaining({ op: 'storeGet' }))
```

---

## Expression Limitations

Some JavaScript expressions have limitations in AsyncJS due to the compilation model.

### Template Literals in Nested Expressions

Template literals work at statement level but not inside other expressions:

```javascript
// Works - statement level
const greeting = `Hello, ${name}!`

// Does NOT work - nested in object
const obj = { msg: `Hello, ${name}!` } // Error

// Workaround - assign first
const msg = `Hello, ${name}!`
const obj = { msg: msg } // Works
```

### Computed Member Access

Dynamic property access with variables is not supported:

```javascript
// Works - literal index
const first = items[0]
const name = user.name

// Does NOT work - variable index
const key = 'name'
const value = obj[key] // Error

// Workaround - use Object.entries or restructure
const entries = Object.entries(obj)
const found = entries.find((e) => e[0] === key)
const value = found ? found[1] : null
```

### Atom Calls in Expressions

Atom/function calls that produce side effects cannot be embedded in expressions:

```javascript
// Does NOT work - call inside expression
const result = items.map((x) => fetch(url + x)) // Error

// Workaround - use explicit loop
const results = []
for (const x of items) {
  const res = fetch(url + x)
  results.push(res)
}
```

These limitations exist because AsyncJS compiles to a JSON AST that executes step-by-step. Complex nested expressions would require runtime evaluation that could bypass fuel tracking and capability checks.
