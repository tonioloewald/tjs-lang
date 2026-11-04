<!--{"pin": "top", "order": 20, "book": ["default", "ajs"]}-->

# AJS (.ajs) - A Better JavaScript for AI Agents

AJS is a JavaScript subset designed for writing AI agent logic. It compiles to Agent99's secure JSON AST format, providing familiar syntax with cleaner semantics.

> **For LLM Integration:** See [ajs-llm-prompt.md](./ajs-llm-prompt.md) for a system prompt optimized for code generation.

## In this section

<!-- prettier-ignore-start -->

<!-- toc -->
- [AJS: The Agent Language](/DOCS-AJS/)
- [Safe Eval](/safe-eval/)
- [AJS LLM System Prompt](/ajs-llm-prompt/)
- [AJS Examples](/ajs-examples/)
- [The universal endpoint: isomorphic atoms, one security model](/universal-endpoint/)
- [AJS Native VM (Rust → wasm) — post-1.0 direction](/ajs-native-vm/)
- [Running the LLM test suite (LM Studio setup)](/lm-studio-setup/)
- [MLX as the local-AI harness](/mlx-setup/)
<!-- /toc -->

<!-- prettier-ignore-end -->

## File Extension

AJS files use the `.ajs` extension to distinguish them from standard JavaScript:

```
my-agent.ajs
search-tool.ajs
```

## Why AJS?

| Problem with JavaScript       | AJS Solution                                    |
| ----------------------------- | ----------------------------------------------- |
| `async/await` boilerplate     | All calls are implicitly async                  |
| Complex error handling        | Monadic error flow - errors propagate as values |
| No built-in type safety       | Types through example values                    |
| Security concerns with `eval` | Compiles to sandboxed VM                        |

## Quick Example

```javascript
// search-agent.ajs

/**
 * Search and summarize information about a topic
 * @param topic - The topic to research
 * @param maxResults - Maximum number of results
 */
function searchAgent(topic: 'climate change', maxResults = 5) {
  let results = search({ query: topic, limit: maxResults })

  if (results.length == 0) {
    return { summary: 'No results found', sources: [] }
  }

  let summary = llmPredict({
    prompt: `Summarize these search results concisely: ${JSON.stringify(results)}`,
  })

  return { summary, sources: results }
}
```

## Core Differences from JavaScript

### 1. Implicit Async

All function calls that invoke atoms are automatically awaited. No `async/await` keywords needed.

```javascript
// AJS - clean and simple
function agent(topic: 'machine learning') {
  let results = search({ query: topic })
  let summary = summarize({ text: results })
  return { summary }
}

// Equivalent JavaScript would require:
// async function agent(topic) {
//   let results = await search({ query: topic })
//   let summary = await summarize({ text: results })
//   return { summary }
// }
```

### 2. Types Through Example Values

Types are inferred from example values. The example shows both the type AND a realistic value:

```javascript
function greet(
  name: 'Anne Example', // required string
  age: 21, // required integer
  greeting = 'Hello' // optional string, defaults to 'Hello'
) {
  // ...
}
```

- **Colon (`:`)** = required parameter, example shows the type
- **Equals (`=`)** = optional parameter with default value

The example value IS the type. `age: 21` means "required integer" (`21.5` would mean any number). `name: 'Anne'` means "required string".

### 3. Monadic Error Flow

Errors propagate automatically as values. When an atom fails, subsequent steps are skipped and the error flows through to the result.

```javascript
function pipeline(topic: 'quantum computing') {
  let results = search({ query: topic }) // might fail
  let summary = summarize({ text: results }) // skipped if search fails
  let formatted = format({ content: summary }) // skipped if any above fails
  return { formatted }
}
// If search() fails, the error flows through without executing subsequent steps
// The result will have an `error` property containing the AgentError
```

The VM returns a `RunResult` with both `result` and `error` fields:

```typescript
const { result, error, fuelUsed } = await vm.run(ast, args)

if (error) {
  console.log('Failed:', error.message)
  console.log('Failed at atom:', error.op)
} else {
  console.log('Success:', result)
}
```

Use `try/catch` to recover from errors:

```javascript
function resilientPipeline(topic: 'neural networks') {
  let data = null
  try {
    data = fetchData({ topic })
  } catch (e) {
    data = fallbackData({ topic })
  }
  return { data }
}
```

### 4. Function Introspection

<!-- TODO review -->

The signature is data. `transpile()` returns it beside the AST, and `createAgent()` attaches
it to the callable it returns, as `.signature`. JSDoc descriptions are carried into it:

```typescript
import { createAgent, AgentVM } from 'tjs-lang'

const search = createAgent(
  `
  /**
   * Search the knowledge base
   * @param query - The search query
   * @param limit - Max results to return
   */
  function search(query: 'example query', limit = 10) {
    return { results: [] }
  }
`,
  new AgentVM()
)

search.signature
// {
//   name: 'search',
//   description: 'Search the knowledge base',
//   parameters: {
//     query: { type: { kind: 'string' }, required: true, example: 'example query',
//              description: 'The search query', … },
//     limit: { type: { kind: 'integer' }, required: false, default: 10,
//              description: 'Max results to return', … },
//   },
// }

await search({ query: 'tjs' }) // { results: [] }
```

## Type System Reference

### Parameter Types

| Syntax                  | Meaning          | Example                          |
| ----------------------- | ---------------- | -------------------------------- |
| `name: 'Anne'`          | Required string  | The example value shows the type |
| `age: 21`               | Required integer |                                  |
| `active: true`          | Required boolean |                                  |
| `tags: ['a', 'b']`      | Required array   |                                  |
| `user: { name: 'Bob' }` | Required object  |                                  |
| `limit = 10`            | Optional integer | Defaults to 10                   |
| `query = 'default'`     | Optional string  | Defaults to 'default'            |

### Destructured Parameter Defaults

AJS supports default values in destructured object parameters. Unlike JavaScript/TypeScript where destructuring defaults can be tricky, AJS makes them work reliably:

```javascript
function calculate({ a = 10, b = 5 }) {
  return { sum: a + b, product: a * b }
}

// Called with no arguments - uses defaults
calculate({}) // { sum: 15, product: 50 }

// Called with partial arguments - missing ones use defaults
calculate({ a: 20 }) // { sum: 25, product: 100 }

// Called with all arguments - no defaults used
calculate({ a: 3, b: 7 }) // { sum: 10, product: 21 }
```

This works seamlessly with type annotations too:

```javascript
function greet({ name: 'World', greeting = 'Hello' }) {
  return { message: `${greeting}, ${name}!` }
}

greet({ name: 'Alice' })  // { message: "Hello, Alice!" }
greet({ name: 'Bob', greeting: 'Hi' })  // { message: "Hi, Bob!" }
greet({ greeting: 'Hi' })  // refused: `name` is required ('World' is its example, not a default)
```

### Return Types

Return types can be specified with colon syntax:

```javascript
function search(query: 'search term'): { results: [], count: 0 } {
  // ...
}
```

The return type is recorded in the signature (and so in tool definitions and docs). The VM
does not check the returned value against it.

Or inferred from the return statement:

```javascript
function search(query: 'search term') {
  return { results: [], count: 0 } // Return type inferred
}
```

## Supported Constructs

### Variables

```javascript
let x = 5 // Variable declaration
x = 10 // Assignment
let a = obj.a // Destructuring declarations (`let { a } = obj`) are refused: read members
```

### Control Flow

```javascript
// Conditionals
if (condition) {
  // ...
} else {
  // ...
}

// Loops
while (condition) {
  // ...
}

for (const item of items) {
  // Becomes a map operation
}

// Error handling
try {
  // ...
} catch (e) {
  // ...
}
```

### Expressions

```javascript
// Arithmetic
a + b, a - b, a * b, a / b, a % b

// Comparison
a == b, a != b, a < b, a > b, a <= b, a >= b

// Logical
a && b, a || b, !a

// Member access
obj.property
obj.nested.property
arr[0]

// Optional chaining (safe access)
obj?.property
obj?.nested?.value
arr?.[0]

// Template literals
`Hello ${name}!`

// Function calls
atomName({ param1: value1, param2: value2 })
```

### Built-in Objects

AJS provides safe implementations of common JavaScript built-in objects:

#### Math

All standard Math methods and constants are available:

```javascript
let floor = Math.floor(3.7) // 3
let ceil = Math.ceil(3.2) // 4
let abs = Math.abs(-5) // 5
let max = Math.max(1, 5, 3) // 5
let sqrt = Math.sqrt(16) // 4
let pi = Math.PI // 3.14159...
let random = Math.random() // Cryptographically secure when available
```

**Note:** `Math.random()` uses `crypto.getRandomValues()` when available for cryptographically secure random numbers.

#### JSON

```javascript
let obj = { name: 'test', value: 42 }
let str = JSON.stringify(obj) // '{"name":"test","value":42}'
let parsed = JSON.parse(str) // { name: 'test', value: 42 }
```

#### Array Static Methods

```javascript
let isArr = Array.isArray([1, 2, 3]) // true
let arr = Array.from([1, 2, 3]) // Creates new array
let created = Array.of(1, 2, 3) // [1, 2, 3]
```

#### Object Static Methods

```javascript
let obj = { a: 1, b: 2, c: 3 }
let keys = Object.keys(obj) // ['a', 'b', 'c']
let values = Object.values(obj) // [1, 2, 3]
let entries = Object.entries(obj) // [['a',1], ['b',2], ['c',3]]
```

#### Number Static Methods

```javascript
let isInt = Number.isInteger(5) // true
let isNan = Number.isNaN(NaN) // true
let max = Number.MAX_SAFE_INTEGER // 9007199254740991
```

#### Global Functions

```javascript
let n = parseInt('42') // 42
let f = parseFloat('3.14') // 3.14
let encoded = encodeURIComponent('hello world') // 'hello%20world'
```

#### String Instance Methods

```javascript
let str = 'hello world'
let upper = str.toUpperCase() // 'HELLO WORLD'
let parts = str.split(' ') // ['hello', 'world']
let trimmed = '  padded  '.trim() // 'padded'
let replaced = str.replace('world', 'there') // 'hello there'
```

#### Array Instance Methods

```javascript
let arr = [3, 1, 4, 1, 5]
let joined = arr.join('-') // '3-1-4-1-5'
let has = arr.includes(4) // true
let idx = arr.indexOf(1) // 1
let sliced = arr.slice(1, 3) // [1, 4]
```

### Set and Date Builtins

AJS provides `Set()` and `Date()` as factory functions - no `new` keyword needed.

#### Set

Create sets with `Set([items])`. Sets have both mutable operations (modify in place) and immutable set algebra (return new sets):

```javascript
// Create a Set
let tags = Set(['javascript', 'typescript', 'rust'])
let empty = Set()

// Mutable operations (modify the set, return this for chaining)
tags.add('go') // Add item
tags.remove('rust') // Remove item
tags.clear() // Remove all items

// Query operations
let has = tags.has('typescript') // true/false
let count = tags.size // Number of items
let arr = tags.toArray() // Convert to array

// Immutable set algebra (return NEW sets)
let a = Set([1, 2, 3])
let b = Set([2, 3, 4])

let union = a.union(b) // Set([1, 2, 3, 4])
let inter = a.intersection(b) // Set([2, 3])
let diff = a.diff(b) // Set([1]) - items in a but not b
```

A set **is an array** of its items, whose methods the VM supplies, so it crosses JSON, a
store or a capability unchanged.

#### Date

Create dates with `Date()` or `Date(initializer)`. Date objects are **immutable** - methods like `add()` return new Date objects:

```javascript
// Create a Date
let now = Date() // Current date/time
let specific = Date('2024-06-15') // From ISO string
let fromTs = Date(1718409600000) // From timestamp

// Static methods
let timestamp = Date.now() // Current timestamp (number)
let parsed = Date.parse('2024-06-15T10:30:00Z') // Parse to Date object

// Component accessors (read-only)
let d = Date('2024-06-15T10:30:45Z')
d.year // 2024
d.month // 6 (1-12, not 0-11 like JS!)
d.day // 15
d.hours // 10
d.minutes // 30
d.seconds // 45
d.timestamp // Unix timestamp in ms
d.value // ISO string

// Immutable arithmetic (returns NEW Date)
let later = d.add({ days: 5, hours: 3 })
let earlier = d.add({ months: -1 })
// Supported: years, months, days, hours, minutes, seconds, ms

// Comparison
let before = d.isBefore(later) // true
let after = later.isAfter(d) // true
let diffDays = d.diff(later, 'days') // -5.125 (later is 5 days and 3 hours on)

// Formatting
let formatted = d.format('date') // '2024-06-15'
let iso = d.format('iso') // '2024-06-15T10:30:45.000Z'
let time = d.format('time') // '10:30:45'
```

**Note:** Unlike JavaScript's `Date`, months are 1-12 (not 0-11), and all methods are immutable.

#### Serialization

Sets and Dates serialize cleanly to JSON:

```javascript
let result = {
  tags: Set(['a', 'b', 'c']),
  created: Date('2024-06-15'),
}
// JSON.stringify(result) produces:
// { "tags": ["a", "b", "c"],
//   "created": { "value": "2024-06-15T00:00:00.000Z", "timestamp": 1718409600000,
//                "year": 2024, "month": 6, "day": 15, "hours": 0, "minutes": 0,
//                "seconds": 0, "dayOfWeek": 6 } }
```

- **Sets** are arrays, so they serialize as arrays
- **Dates** are data objects (every field in UTC), so they serialize as that object; `d.value`
  is the ISO 8601 string, and `Date(stored)` turns a stored date back into a date

### Schema Filtering

The `filter()` builtin validates and strips extra properties from objects based on a schema:

```javascript
// Strip extra properties from an object
let raw = { name: 'Alice', age: 30, secret: 'password', extra: 123 }
let clean = filter(raw, { name: 'string', age: 0 })
// clean = { name: 'Alice', age: 30 }

// Works with nested objects
let data = {
  user: { name: 'Bob', age: 25, ssn: '123-45-6789' },
  tags: ['a', 'b'],
  internal: 'hidden',
}
let filtered = filter(data, {
  user: { name: 'string', age: 0 },
  tags: ['string'],
})
// filtered = { user: { name: 'Bob', age: 25 }, tags: ['a', 'b'] }

// Fails on validation failure (missing required fields): a monadic error, catchable with try/catch
let bad = filter({ name: 'Alice' }, { name: 'string', age: 0 })
// error: "root: Missing age"
```

**Use cases:**

- Sanitize LLM outputs - strip unexpected properties from JSON responses
- API input validation - accept only the fields you expect
- Data projection - reduce objects to a known shape

**Note:** a declared return type does NOT filter the return value. To project a value onto
a shape, call `filter()` yourself:

```javascript
function getUser(id: 'user-123') {
  let user = fetchUser({ id }) // might return { name, email, password, ... }
  let safe = filter(user, { name: 'string', email: 'string' })
  return { user: safe } // password stripped
}
```

### Array Methods with Lambdas

```javascript
// Map - transform each element
items.map((x) => x * 2)
items.map((x) => {
  let doubled = x * 2
  return doubled
})

// Filter - keep elements matching condition
items.filter((x) => x > 5)
items.filter((x) => x % 2 == 0)

// Find - get first matching element
items.find((x) => x.id == targetId)
users.find((u) => u.age >= 18)

// Reduce - accumulate to single value
items.reduce((acc, x) => acc + x, 0)
items.reduce((sum, item) => sum + item.price, 0)

// Other array operations
items.push(newItem) // Add to array
str.split(',') // Split string to array
parts.join('-') // Join array to string
```

Lambdas support closures - they can access variables from the outer scope:

```javascript
function processItems({ items, threshold }) {
  let above = items.filter((x) => x >= threshold) // threshold from outer scope
  let scaled = above.map((x) => x * threshold) // still accessible
  return { scaled }
}
```

## Unsupported Constructs

These JavaScript features are intentionally not supported:

| Feature            | Reason                       | Alternative         |
| ------------------ | ---------------------------- | ------------------- |
| `class`            | Use functional composition   | Plain functions     |
| `this`             | Implicit state is confusing  | Explicit parameters |
| `new`              | Classes not supported        | Factory functions   |
| `import/require`   | Atoms must be registered     | Register with VM    |
| `async/await`      | Implicit async               | Just call functions |
| `yield/generators` | Complex control flow         | Use `map`/`while`   |
| `eval`             | Security (though VM is safe) | Use transpiler      |
| `with`             | Deprecated                   | Explicit references |

## API Usage

### transpile()

Full transpilation with signature and metadata:

```typescript
import { transpile } from 'tjs-lang'

const { ast, signature, warnings } = transpile(`
  function greet(name: 'World') {
    let msg = template({ tmpl: 'Hello {{name}}!', vars: { name } })
    return { msg }
  }
`)

console.log(signature.parameters.name.type) // 'string'
console.log(signature.parameters.name.required) // true
```

### ajs()

Convenience function returning just the AST (works as both a function and tagged template literal):

```typescript
import { ajs } from 'tjs-lang'

const ast = ajs(`
  function add(a: 5, b: 3) {
    let sum = a + b
    return { sum }
  }
`)

// Execute with VM
const vm = new AgentVM()
const result = await vm.run(ast, { a: 5, b: 3 })
console.log(result.result.sum) // 8
```

### createAgent()

<!-- TODO review -->

Transpile once and get a callable, with its signature attached:

```typescript
import { createAgent, AgentVM } from 'tjs-lang'

const double = createAgent(
  `function double({ value }) { return { result: value * 2 } }`,
  new AgentVM(),
  { fuel: 100 } // run options for every call
)

await double({ value: 21 }) // { result: 42 }
double.signature // { name: 'double', parameters: { … } }
```

### getToolDefinitions()

Generate OpenAI-compatible tool schemas for LLM integration:

```typescript
import { getToolDefinitions, transpile } from 'tjs-lang'

const { signature } = transpile(source)
const tools = getToolDefinitions({ search: { signature } })
// or pass agents made by createAgent(), which carry .signature: getToolDefinitions({ search })

// Returns format compatible with OpenAI/Anthropic tool calling:
// [{
//   type: 'function',
//   function: {
//     name: 'search',
//     description: 'Search the knowledge base',
//     parameters: { type: 'object', properties: {...}, required: [...] }
//   }
// }]
```

## Error Handling

### Monadic Error Flow

Agent99 uses monadic error flow - when an atom fails, the error becomes a value that propagates through the pipeline:

```typescript
const { result, error, fuelUsed } = await vm.run(ast, args)

if (error) {
  // error is an AgentError with:
  // - message: string - the error message
  // - op: string - the atom that failed
  // - cause?: Error - the original exception
  console.log(`Error in ${error.op}: ${error.message}`)
} else {
  // Success - use result
  console.log(result)
}
```

### Checking for Errors

```typescript
import { isAgentError } from 'tjs-lang'

const { result, error } = await vm.run(ast, args)

if (isAgentError(result)) {
  // result itself is the error (when error occurs before return)
}
```

### Recovery with try/catch

Use `try/catch` in your AJS code to handle errors gracefully:

```javascript
function resilientAgent({ query }) {
  let result = null

  try {
    result = riskyOperation({ query })
  } catch (e) {
    // e contains the error message
    result = safeDefault({ error: e })
  }

  return { result }
}
```

### Triggering Errors with Error()

Use the `Error()` built-in to trigger monadic error flow from your AJS code:

```javascript
function validateInput({ value }) {
  if (value < 0) {
    Error('Value must be non-negative')
    // Execution stops here - subsequent code is skipped
  }

  return { validated: value }
}
```

When `Error()` is called:

- The error message is stored in the context
- Subsequent operations are skipped (monadic error flow)
- The error can be caught with `try/catch` or returned to the caller

```javascript
function safeDivide({ a, b }) {
  if (b === 0) {
    Error('Division by zero')
  }
  return { result: a / b }
}

function calculate({ x, y }) {
  let result = null

  try {
    result = safeDivide({ a: x, b: y })
  } catch (e) {
    result = { result: 0, error: e }
  }

  return result
}
```

### Why No `throw` Statement?

AJS intentionally does not support the `throw` statement. Instead, use `Error()`:

```javascript
// DON'T DO THIS - throw is not supported:
if (invalid) {
  throw new Error('Something went wrong') // Transpiler error!
}

// DO THIS INSTEAD:
if (invalid) {
  Error('Something went wrong') // Triggers monadic error flow
}
```

The `throw` keyword will show as an error in your editor (red underline) and the transpiler will provide a helpful error message pointing you to use `Error()` instead.

## Gotchas and Common Pitfalls

### Unavailable JavaScript Features

These common JavaScript APIs are **not available** in AJS. The transpiler will catch these and provide helpful error messages:

| Feature          | Error Message              | Alternative                            |
| ---------------- | -------------------------- | -------------------------------------- |
| `setTimeout`     | Use the delay atom         | none built in: a host can define a `delay` atom |
| `setInterval`    | Use while loops with delay | a `while` loop calling a host `delay` atom      |
| `fetch`          | Use the `httpFetch` atom   | `httpFetch({ url })`                   |
| `RegExp`         | Use string methods or the regexMatch atom | regex literals: `str.replace(/a+/g, '-')` |
| `Promise`        | Implicit async             | All calls are automatically awaited    |
| `Map`            | Use plain objects          | `{ key: value }`                       |
| `require/import` | Register atoms with VM     | `new AgentVM({ customAtom })`          |

### The `new` Keyword

The `new` keyword is not supported. AJS provides factory functions instead:

```javascript
// DON'T DO THIS - the transpiler catches these with helpful errors:
let date = new Date() // Error: Use Date() or Date('2024-01-15') instead
let set = new Set([1, 2]) // Error: Use Set([items]) instead
let arr = new Array(5) // Error: Use array literals like [1, 2, 3] instead

// DO THIS INSTEAD - no 'new' needed:
let date = Date() // Current date/time
let date2 = Date('2024-06-15') // Specific date
let set = Set([1, 2, 3]) // Create a Set
let arr = [1, 2, 3, 4, 5] // Array literal
```

See [Set and Date Builtins](#set-and-date-builtins) for full documentation.

### No `this` or Classes

AJS is purely functional. There's no `this`, no classes, no prototypes:

```javascript
// DON'T DO THIS
class Agent {
  constructor(name) {
    this.name = name
  }
}

// DO THIS INSTEAD
function createAgent(name: 'Agent Smith') {
  return { name }
}
```

### Equality Semantics

AJS's `==` and `!=` are TJS's: no type coercion (`'1' == 1` is false), `null == undefined`
is true, and objects compare by reference, never by structure. There is no deep equality
(`Is` is TJS-only):

```javascript
let a = { x: 1 }
let b = { x: 1 }
let same = a == b // false (reference comparison)
let loose = '1' == 1 // false (no coercion, unlike JavaScript)

// For deep comparison, compare the fields you care about, or the JSON
let equal = JSON.stringify(a) == JSON.stringify(b) // true
```

### Optional Chaining (`?.`)

Optional chaining is fully supported for safe property access:

```javascript
let x = obj?.nested?.value // undefined if any step is null/undefined
let result = user?.profile?.name

// Works with method calls too
let len = items?.length
let upper = str?.toUpperCase()
```

Nullish coalescing (`??`) works too:

```javascript
let x = obj?.nested?.value ?? 'default'
```

(Plain member access is null-safe as well: `obj.nested.value` is `undefined`, not an error,
when `obj` is null.)

### Atom Calls vs Built-in Methods

Atoms use object parameter syntax, while built-ins use normal function syntax:

```javascript
// Atom call - object parameter
let result = search({ query: 'hello', limit: 10 })

// Built-in method - normal parameters
let floor = Math.floor(3.7)
let upper = str.toUpperCase()
```

### Async Is Implicit

All atom calls are automatically awaited. Don't use `async/await`:

```javascript
// DON'T DO THIS
async function search(query) {
  let result = await fetch(query) // Error: async/await not supported
}

// DO THIS INSTEAD
function search(query: 'https://api.example.com') {
  let result = httpFetch({ url: query }) // Automatically awaited
  return { result }
}
```

### Error Propagation

Errors propagate monadically - if one step fails, subsequent steps are skipped:

```javascript
function pipeline(input: 'raw data') {
  let a = stepOne({ input }) // If this fails...
  let b = stepTwo({ data: a }) // ...this is skipped
  let c = stepThree({ data: b }) // ...and this too
  return { c } // Result contains the error
}
```

Use `try/catch` to recover from expected errors:

```javascript
function resilient(input: 'user input') {
  let result = null
  try {
    result = riskyStep({ input })
  } catch (e) {
    result = fallback({ error: e })
  }
  return { result }
}
```

### Fuel Limits

All operations consume fuel. Complex operations may hit limits:

```javascript
// This might run out of fuel for large arrays
function processLarge({ items }) {
  let mapped = items.map((x) => complexOperation({ x }))
  return { mapped }
}

// Run with higher fuel limit
const result = await vm.run(ast, args, { fuel: 10000 })
```

## Security Model

AJS compiles to Agent99's JSON AST, which executes in a completely sandboxed VM:

- **No file system access** - unless explicitly provided via atoms
- **No network access** - unless explicitly provided via atoms
- **No global state** - each execution is isolated
- **Fuel-limited execution** - prevents infinite loops and runaway expressions
- **Type-checked at runtime** - invalid operations fail safely
- **Prototype access blocked** - `__proto__`, `constructor`, `prototype` are forbidden

The transpiler is permissive because security is enforced at the VM level, not the language level. Even if malicious code somehow made it through, the VM cannot execute dangerous operations unless atoms for those operations are registered.

### Fuel System

Every operation consumes fuel. When fuel runs out, execution stops with an `Out of Fuel` error:

```typescript
const result = await vm.run(ast, args, { fuel: 100 })
// Limits total computation to prevent infinite loops
```

Expression evaluation also consumes fuel (0.01 per node), preventing deeply nested or recursive expressions from running unchecked.

## Migration from TypedBuilder

If you have existing TypedBuilder code, here's how to convert:

```typescript
// Before: TypedBuilder
const ast = Agent.take()
  .varsImport(['topic'])
  .step({ op: 'search', query: 'topic', result: 'results' })
  .if('results.length > 0', { results: 'results' }, (b) =>
    b.step({ op: 'summarize', text: 'results', result: 'summary' })
  )
  .return({ properties: { results: {}, summary: {} } })
  .toJSON()

// After: AJS
const ast = ajs(`
  function searchAgent(topic: 'climate change') {
    let results = search({ query: topic })
    let summary = null
    if (results.length > 0) {
      summary = summarize({ text: results })
    }
    return { results, summary }
  }
`)
```

## Best Practices

1. **Use descriptive JSDoc comments** - They become part of the function signature for LLM agents
2. **Prefer explicit types** - Even though inference works, explicit types document intent
3. **Keep functions small** - Each function should do one thing
4. **Use meaningful variable names** - The VM state is inspectable during debugging
5. **Return structured objects** - Makes output types clear and composable
6. **Handle errors appropriately** - Use try/catch for expected failures, let others propagate
7. **Set appropriate fuel limits** - Balance between allowing complex operations and preventing abuse
