<!--{"section": "ajs", "group": "docs", "order": 0, "navTitle": "Documentation"}-->

# AJS: The Agent Language

_Code as Data. Safe. Async. Sandboxed._

---

## What is AJS?

AJS (AsyncJS) is a JavaScript subset that compiles to a **JSON AST**. It's designed for untrusted code—user scripts, LLM-generated agents, remote logic.

```javascript
function searchAndSummarize({ query }) {
  let results = httpFetch({ url: `https://api.example.com/search?q=${query}` })
  let summary = llmPredict({ prompt: `Summarize: ${JSON.stringify(results)}` })
  return { query, summary }
}
```

This compiles to JSON that can be:

- Stored in a database
- Sent over the network
- Executed in a sandboxed VM
- Audited before running

---

## The VM

AJS runs in a gas-limited, isolated VM with strict resource controls.

```typescript
import { ajs, AgentVM } from 'tjs-lang'

const agent = ajs`
  function process({ url }) {
    let data = httpFetch({ url })
    return { fetched: data }
  }
`

const vm = new AgentVM()
const result = await vm.run(
  agent,
  { url: 'https://api.example.com' },
  {
    fuel: 1000, // CPU budget
    timeoutMs: 5000, // Wall-clock limit
  }
)
```

### Fuel Metering

Every operation costs fuel:

| Operation                | Cost |
| ------------------------ | ---- |
| Expression evaluation    | 0.01 |
| Variable set/get         | 0.1  |
| Control flow (if, while) | 0.5  |
| HTTP fetch               | 10   |
| LLM predict              | 100  |

When fuel runs out, execution stops safely:

```typescript
if (result.fuelExhausted) {
  // Agent tried to run forever - stopped safely
}
```

### Timeout Enforcement

Fuel protects against CPU abuse. Timeouts protect against I/O abuse:

```typescript
await vm.run(agent, args, {
  fuel: 1000,
  timeoutMs: 5000, // Hard 5-second limit
})
```

Slow network calls can't hang your servers.

### Capability Injection

The VM starts with **zero capabilities**. You grant what each agent needs:

```typescript
const capabilities = {
  fetch: createFetchCapability({
    allowedHosts: ['api.example.com'],
  }),
  store: createReadOnlyStore(),
  // No llm - this agent can't call AI
}

await vm.run(agent, args, { capabilities })
```

---

## Input/Output Contract

AJS agents are composable — one agent's output feeds into another's input. To ensure this works reliably:

- **Functions take a single destructured object parameter:** `function process({ input })`
- **Functions must return a plain object:** `return { result }`, `return { summary, count }`
- **Non-object returns produce an AgentError:** `return 42` or `return 'hello'` will fail
- **Bare `return` is allowed** for void functions (no output)

```javascript
// CORRECT — object in, object out
function add({ a, b }) {
  return { sum: a + b }
}

// WRONG — non-object returns are errors
function add({ a, b }) {
  return a + b  // AgentError: must return an object
}
```

---

## Syntax

AJS is a JavaScript subset. Familiar syntax, restricted features.

### What's Allowed

```javascript
// Functions
function process({ input }) {
  return { output: input * 2 }
}

// Variables
let x = 10
const y = 'hello'

// Conditionals
if (x > 5) {
  return { size: 'big' }
} else {
  return { size: 'small' }
}

// Loops
for (let i = 0; i < 10; i++) {
  total = total + i
}

for (let item of items) {
  results.push(item.name)
}

while (count > 0) {
  count = count - 1
}

// Try/catch
try {
  riskyOperation()
} catch (e) {
  return { error: e.message }
}

// Template literals
let message = `Hello, ${name}!`

// Object/array literals
let obj = { a: 1, b: 2 }
let arr = [1, 2, 3]

// Destructuring
let { name, age } = user
let [first, second] = items

// Spread
let merged = { ...defaults, ...overrides }
let combined = [...arr1, ...arr2]

// Ternary
let result = x > 0 ? 'positive' : 'non-positive'

// Logical operators
let value = a && b
let fallback = a || defaultValue
let nullish = a ?? defaultValue
```

### What's Forbidden

| Feature                    | Why Forbidden                                     |
| -------------------------- | ------------------------------------------------- |
| `class`                    | Too complex for LLMs, enables prototype pollution |
| `new`                      | Arbitrary object construction                     |
| `this`                     | Implicit context, hard to sandbox                 |
| Closures                   | State escapes the sandbox                         |
| `async`/`await`            | VM handles async internally                       |
| `eval`, `Function`         | Code injection                                    |
| `__proto__`, `constructor` | Prototype pollution                               |
| `import`/`export`          | Module system handled by host                     |

AJS is intentionally simple—simple enough for 4B parameter LLMs to generate correctly.

### Differences from JavaScript

AJS expressions differ from standard JavaScript in a few important ways:

**Null-safe member access.** All member access uses optional chaining internally. Accessing a property on `null` or `undefined` returns `undefined` instead of throwing `TypeError`:

```javascript
let x = null
let y = x.foo.bar // undefined (no error)
```

This is a deliberate safety choice — agents shouldn't crash on missing data.

**No computed member access with variables.** You can use literal indices (`items[0]`, `obj["key"]`) but not variable indices (`items[i]`). This is rejected at transpile time:

```javascript
// Works
let first = items[0]
let name = user['name']

// Fails: "Computed member access with variables not yet supported"
let item = items[i]
```

Workaround: use array atoms like `map`, `reduce`, or `for...of` loops instead of index-based access.

**Structural equality.** `==` and `!=` perform deep structural comparison, not reference or coerced equality. No type coercion: `'1' == 1` is `false`. Use `===` and `!==` for identity (reference) checks:

```javascript
[1, 2] == [1, 2]        // true (structural)
[1, 2] === [1, 2]       // false (different objects)
{ a: 1 } == { a: 1 }    // true (structural)
'1' == 1                 // false (no coercion, unlike JS)
null == undefined        // true (nullish equality preserved)
```

Objects with a `.Equals` method or `[Symbol.for('tjs.equals')]` handler get custom comparison behavior.

---

## Atoms

Atoms are the built-in operations. Each atom has a defined cost, input schema, and output schema.

### Flow Control

| Atom     | Description                    |
| -------- | ------------------------------ |
| `seq`    | Execute operations in sequence |
| `if`     | Conditional branching          |
| `while`  | Loop with condition            |
| `return` | Return a value                 |
| `try`    | Error handling                 |

### State Management

| Atom         | Description                |
| ------------ | -------------------------- |
| `varSet`     | Set a variable             |
| `varGet`     | Get a variable             |
| `varsLet`    | Batch variable declaration |
| `varsImport` | Import from arguments      |
| `varsExport` | Export as result           |
| `scope`      | Create a local scope       |

### I/O

| Atom        | Description                                 |
| ----------- | ------------------------------------------- |
| `httpFetch` | HTTP requests (requires `fetch` capability) |

### Storage (Core)

| Atom          | Description              |
| ------------- | ------------------------ |
| `storeGet`    | Get from key-value store |
| `storeSet`    | Set in key-value store   |
| `storeSearch` | Vector similarity search |

### Storage (Battery)

| Atom                    | Description                           |
| ----------------------- | ------------------------------------- |
| `storeVectorize`        | Generate embeddings from text         |
| `storeCreateCollection` | Create a vector store collection      |
| `storeVectorAdd`        | Add a document to a vector collection |

### AI (Core)

| Atom         | Description                                |
| ------------ | ------------------------------------------ |
| `llmPredict` | Simple LLM inference (`prompt` → `string`) |
| `agentRun`   | Run a sub-agent                            |

### AI (Battery)

| Atom                | Description                                    |
| ------------------- | ---------------------------------------------- |
| `llmPredictBattery` | Chat completion (system/user → message object) |
| `llmVision`         | Analyze images using a vision-capable model    |

### Procedures

| Atom                     | Description                    |
| ------------------------ | ------------------------------ |
| `storeProcedure`         | Store an AST as callable token |
| `releaseProcedure`       | Delete a stored procedure      |
| `clearExpiredProcedures` | Clean up expired tokens        |

### Utilities

| Atom      | Description              |
| --------- | ------------------------ |
| `random`  | Random number generation |
| `uuid`    | Generate UUIDs           |
| `hash`    | Compute hashes           |
| `memoize` | In-memory memoization    |
| `cache`   | Persistent caching       |

---

## Battery Atoms Reference

Battery atoms provide LLM, embedding, and vector store capabilities. They
require a separate import and capability setup.

### Setup

```javascript
import { AgentVM } from 'tjs-lang'
import { batteryAtoms, getBatteries } from 'tjs-lang'

const vm = new AgentVM(batteryAtoms)
const batteries = await getBatteries() // auto-detects LM Studio models

const { result } = await vm.run(agent, args, {
  fuel: 1000,
  capabilities: batteries,
})
```

The `getBatteries()` function auto-detects LM Studio and returns:

```javascript
{
  vector: { embed },       // embedding function (undefined if no LM Studio)
  store: { ... },          // key-value + vector store (always present)
  llmBattery: { predict, embed },  // LLM chat + embeddings (null if no LM Studio)
  models: { ... },         // detected model info (null if no LM Studio)
}
```

**Important:** `vector` and `llmBattery` will be `undefined`/`null` if LM Studio
isn't running or the connection is made over HTTPS (local LLM calls are blocked
from HTTPS contexts for security). Always check for availability or handle
the atom's "missing capability" error.

### Capability Keys

Battery atoms look up capabilities by specific keys that differ from the base
`Capabilities` interface:

| Capability key | Used by atoms                                            | Contains                        |
| -------------- | -------------------------------------------------------- | ------------------------------- |
| `llmBattery`   | `llmPredictBattery`, `llmVision`                         | `{ predict, embed }` (full LLM) |
| `vector`       | `storeVectorize`                                         | `{ embed }` only                |
| `store`        | `storeSearch`, `storeCreateCollection`, `storeVectorAdd` | KV + vector store operations    |
| `llm`          | `llmPredict` (core atom)                                 | `{ predict }` (simple)          |
| `fetch`        | `httpFetch` (core atom)                                  | fetch function                  |

The split exists because `storeVectorize` only needs the embedding function,
while `llmPredictBattery` needs the full chat API. If you're providing your own
capabilities (not using `getBatteries()`), wire the keys accordingly.

### `llmPredict` vs `llmPredictBattery`

There are two LLM atoms with different interfaces:

| Atom                | Input                   | Output         | Capability                |
| ------------------- | ----------------------- | -------------- | ------------------------- |
| `llmPredict`        | `{ prompt }`            | `string`       | `capabilities.llm`        |
| `llmPredictBattery` | `{ system, user, ... }` | message object | `capabilities.llmBattery` |

Use `llmPredict` for simple prompts. Use `llmPredictBattery` when you need
system prompts, tool calling, or structured output.

### `llmPredictBattery`

Chat completion with system prompt, tool calling, and structured output support.

**Input:**

| Field            | Type     | Required | Description                                   |
| ---------------- | -------- | -------- | --------------------------------------------- |
| `system`         | `string` | No       | System prompt (defaults to helpful assistant) |
| `user`           | `string` | Yes      | User message                                  |
| `tools`          | `any[]`  | No       | Tool definitions (OpenAI format)              |
| `responseFormat` | `any`    | No       | Structured output format                      |

**Output:** OpenAI chat message object:

```javascript
{
  role: 'assistant',
  content: 'The answer is 42.',    // null when using tool calls
  tool_calls: [...]                // present when tools are invoked
}
```

**Example:**

```javascript
let response = llmPredictBattery({
  system: 'You are a helpful assistant.',
  user: 'What is the capital of France?',
})
// response.content === 'Paris is the capital of France.'
```

**Cost:** 100 fuel

### `llmVision`

Analyze images using a vision-capable model.

**Input:**

| Field            | Type       | Required | Description                                     |
| ---------------- | ---------- | -------- | ----------------------------------------------- |
| `system`         | `string`   | No       | System prompt                                   |
| `prompt`         | `string`   | Yes      | Text prompt describing what to analyze          |
| `images`         | `string[]` | Yes      | URLs or data URIs (`data:image/...;base64,...`) |
| `responseFormat` | `any`      | No       | Structured output format                        |

**Output:** Same as `llmPredictBattery` (message object with `role`, `content`, `tool_calls`).

**Example:**

```javascript
let analysis = llmVision({
  prompt: 'Describe what you see in this image.',
  images: ['https://example.com/photo.jpg'],
})
// analysis.content === 'The image shows a sunset over the ocean...'
```

**Cost:** 150 fuel | **Timeout:** 120 seconds

### `storeVectorize`

Generate embeddings from text using the vector battery.

**Input:**

| Field   | Type     | Required | Description            |
| ------- | -------- | -------- | ---------------------- |
| `text`  | `string` | Yes      | Text to embed          |
| `model` | `string` | No       | Embedding model to use |

**Output:** `number[]` — the embedding vector.

**Example:**

```javascript
let embedding = storeVectorize({ text: 'TJS is a typed JavaScript' })
// embedding === [0.023, -0.412, 0.891, ...]
```

**Cost:** 20 fuel | **Capability:** `vector`

### `storeCreateCollection`

Create a vector store collection for similarity search.

**Input:**

| Field        | Type     | Required | Description                      |
| ------------ | -------- | -------- | -------------------------------- |
| `collection` | `string` | Yes      | Collection name                  |
| `dimension`  | `number` | No       | Vector dimension (auto-detected) |

**Output:** None.

**Cost:** 5 fuel | **Capability:** `store`

### `storeVectorAdd`

Add a document to a vector store collection. The document is automatically
embedded and indexed.

**Input:**

| Field        | Type     | Required | Description       |
| ------------ | -------- | -------- | ----------------- |
| `collection` | `string` | Yes      | Collection name   |
| `doc`        | `any`    | Yes      | Document to store |

**Output:** None.

**Example:**

```javascript
storeVectorAdd({
  collection: 'articles',
  doc: { title: 'Intro to TJS', content: 'TJS is...', embedding: [...] }
})
```

**Cost:** 5 fuel | **Capability:** `store`

### `storeSearch`

Search a vector store collection by similarity.

**Input:**

| Field         | Type       | Required | Description                    |
| ------------- | ---------- | -------- | ------------------------------ |
| `collection`  | `string`   | Yes      | Collection name                |
| `queryVector` | `number[]` | Yes      | Query embedding vector         |
| `k`           | `number`   | No       | Number of results (default: 5) |
| `filter`      | `object`   | No       | Metadata filter                |

**Output:** `any[]` — array of matching documents, sorted by similarity.

**Example:**

```javascript
let query = storeVectorize({ text: 'How does type checking work?' })
let results = storeSearch({
  collection: 'articles',
  queryVector: query,
  k: 3,
})
// results === [{ title: 'Type System', content: '...' }, ...]
```

**Cost:** 5 + k fuel (dynamic) | **Capability:** `store`

---

## Expression Builtins

AJS expressions have access to safe built-in objects:

### Math

All standard math functions:

```javascript
Math.abs(-5) // 5
Math.floor(3.7) // 3
Math.sqrt(16) // 4
Math.sin(Math.PI) // ~0
Math.random() // 0-1
Math.max(1, 2, 3) // 3
Math.min(1, 2, 3) // 1
```

### JSON

Parse and stringify:

```javascript
JSON.parse('{"a": 1}') // { a: 1 }
JSON.stringify({ a: 1 }) // '{"a": 1}'
```

### Array

Static methods:

```javascript
Array.isArray([1, 2]) // true
Array.from('abc') // ['a', 'b', 'c']
Array.of(1, 2, 3) // [1, 2, 3]
```

### Object

Static methods:

```javascript
Object.keys({ a: 1 }) // ['a']
Object.values({ a: 1 }) // [1]
Object.entries({ a: 1 }) // [['a', 1]]
Object.fromEntries([['a', 1]]) // { a: 1 }
Object.assign({}, a, b) // merged object
```

### String

Static methods:

```javascript
String.fromCharCode(65) // 'A'
String.fromCodePoint(128512) // emoji
```

### Number

Constants and checks:

```javascript
Number.MAX_VALUE
Number.isNaN(NaN) // true
Number.isFinite(100) // true
Number.parseInt('42') // 42
Number.parseFloat('3.14') // 3.14
```

### Set Operations

Set-like operations:

```javascript
Set.add([1, 2], 3) // [1, 2, 3]
Set.remove([1, 2, 3], 2) // [1, 3]
Set.union([1, 2], [2, 3]) // [1, 2, 3]
Set.intersection([1, 2], [2, 3]) // [2]
Set.diff([1, 2, 3], [2]) // [1, 3]
```

### Date

Date factory with arithmetic:

```javascript
Date.now() // timestamp
Date.create('2024-01-15') // Date object
Date.add(date, 1, 'day') // new Date
Date.format(date, 'YYYY-MM-DD')
```

### Schema

Build JSON schemas for structured LLM outputs:

```javascript
// From example
let schema = Schema.response('person', { name: '', age: 0 })

// With constraints
let schema = Schema.response(
  'user',
  Schema.object({
    email: Schema.string.email,
    age: Schema.number.int.min(0).max(150).optional,
    role: Schema.enum(['admin', 'user', 'guest']),
  })
)
```

---

## JSON AST Format

AJS compiles to a JSON AST. Here's what it looks like:

### Sequence

```json
{
  "$seq": [
    { "$op": "varSet", "key": "x", "value": 10 },
    { "$op": "varSet", "key": "y", "value": 20 },
    {
      "$op": "return",
      "value": { "$expr": "binary", "op": "+", "left": "x", "right": "y" }
    }
  ]
}
```

### Expressions

```json
// Literal
{ "$expr": "literal", "value": 42 }

// Identifier
{ "$expr": "ident", "name": "varName" }

// Binary operation
{ "$expr": "binary", "op": "+", "left": {...}, "right": {...} }

// Member access
{ "$expr": "member", "object": {...}, "property": "foo" }

// Template literal
{ "$expr": "template", "tmpl": "Hello, ${name}!" }
```

### Conditionals

```json
{
  "$op": "if",
  "cond": { "$expr": "binary", "op": ">", "left": "x", "right": 0 },
  "then": { "$seq": [...] },
  "else": { "$seq": [...] }
}
```

### Loops

```json
{
  "$op": "while",
  "cond": { "$expr": "binary", "op": ">", "left": "count", "right": 0 },
  "body": { "$seq": [...] }
}
```

---

## Security Model

### Zero Capabilities by Default

The VM can't do anything unless you allow it:

```typescript
// This agent can only compute - no I/O
await vm.run(agent, args, { capabilities: {} })

// This agent can fetch from one domain
await vm.run(agent, args, {
  capabilities: {
    fetch: createFetchCapability({ allowedHosts: ['api.example.com'] }),
  },
})
```

### Forbidden Properties

These property names are blocked to prevent prototype pollution:

- `__proto__`
- `constructor`
- `prototype`

### SSRF Protection

The `httpFetch` atom can be configured with:

- Allowlisted hosts only
- Blocked private IP ranges
- Request signing requirements

### ReDoS Protection

Suspicious regex patterns are rejected before execution.

### Execution Tracing

Every agent run can produce an audit trail:

```typescript
const { result, trace } = await vm.run(agent, args, { trace: true })

// trace: [
//   { op: 'varSet', key: 'x', fuelBefore: 1000, fuelAfter: 999.9 },
//   { op: 'httpFetch', url: '...', fuelBefore: 999.9, fuelAfter: 989.9 },
//   ...
// ]
```

---

## Use Cases

### AI Agents

```javascript
function researchAgent({ topic }) {
  let searchResults = httpFetch({
    url: `https://api.search.com?q=${topic}`,
  })

  let summary = llmPredict({
    system: 'You are a research assistant.',
    user: `Summarize these results about ${topic}: ${searchResults}`,
  })

  return { topic, summary }
}
```

### Rule Engines

```javascript
function applyDiscounts({ cart, userTier }) {
  let discount = 0

  if (userTier === 'gold') {
    discount = 0.2
  } else if (userTier === 'silver') {
    discount = 0.1
  }

  if (cart.total > 100) {
    discount = discount + 0.05
  }

  return {
    originalTotal: cart.total,
    discount: discount,
    finalTotal: cart.total * (1 - discount),
  }
}
```

### Smart Configuration

```javascript
function routeRequest({ request, config }) {
  for (let rule of config.rules) {
    if (request.path.startsWith(rule.prefix)) {
      return { backend: rule.backend, timeout: rule.timeout }
    }
  }
  return { backend: config.defaultBackend, timeout: 30000 }
}
```

### Remote Jobs

```javascript
function processDataBatch({ items, transform }) {
  let results = []
  for (let item of items) {
    let processed = applyTransform(item, transform)
    results.push(processed)
  }
  return { processed: results.length, results }
}
```

---

## Custom Atoms

Extend the runtime with your own operations:

```typescript
import { defineAtom, AgentVM, s } from 'tjs-lang'

const myScraper = defineAtom(
  'scrape', // OpCode
  s.object({ url: s.string }), // Input Schema
  s.string, // Output Schema
  async ({ url }, ctx) => {
    const res = await ctx.capabilities.fetch(url)
    return await res.text()
  },
  { cost: 5 } // Fuel cost
)

const myVM = new AgentVM({ scrape: myScraper })
```

Atoms must:

- Be non-blocking (no synchronous CPU-heavy work)
- Respect `ctx.signal` for cancellation
- Access I/O only via `ctx.capabilities`

---

## Builder API

For programmatic AST construction:

```typescript
import { Agent, s } from 'tjs-lang'

const agent = Agent.take(s.object({ price: s.number, taxRate: s.number }))
  .varSet({ key: 'total', value: Agent.expr('price * (1 + taxRate)') })
  .return(s.object({ total: s.number }))

const ast = agent.toJSON() // JSON-serializable AST
```

The builder is lower-level but gives full control over AST construction.

---

## Limitations

### What AJS Doesn't Do

- **No closures** - functions can't capture outer scope
- **No classes** - use plain objects
- **No async/await syntax** - the VM handles async internally
- **No modules** - logic is self-contained
- **No direct DOM access** - everything goes through capabilities
- **No computed member access with variables** - `items[i]` is rejected; use `items[0]` (literal) or `for...of` loops

### What AJS Intentionally Avoids

- Complex language features that enable escape from the sandbox
- Syntax that LLMs frequently hallucinate incorrectly
- Patterns that make code hard to audit

---

## Performance

- **100 agents in ~6ms** (torture test benchmark)
- **~0.01 fuel per expression**
- **Proportional memory charging** prevents runaway allocations

AJS is interpreted (JSON AST), so it's slower than native JS. But:

- Execution is predictable and bounded
- I/O dominates most agent workloads
- Tracing is free (built into the VM)

For compute-heavy operations in your platform code, use TJS with `wasm {}` blocks.

---

## Learn More

- [TJS Documentation](DOCS-TJS.md) — The host language
- [Builder's Manifesto](MANIFESTO-BUILDER.md) — Why AJS is fun
- [Enterprise Guide](MANIFESTO-ENTERPRISE.md) — Why AJS is safe
- [Technical Context](CONTEXT.md) — Architecture deep dive
