# AsyncJS (.ajs) - A Better JavaScript for AI Agents

AsyncJS is a JavaScript subset designed for writing AI agent logic. It compiles to Agent99's secure JSON AST format, providing familiar syntax with cleaner semantics.

> **For LLM Integration:** See [ASYNCJS_LLM_PROMPT.md](./ASYNCJS_LLM_PROMPT.md) for a system prompt optimized for code generation.

## File Extension

AsyncJS files use the `.ajs` extension to distinguish them from standard JavaScript:

```
my-agent.ajs
search-tool.ajs
```

## Why AsyncJS?

| Problem with JavaScript       | AsyncJS Solution                                |
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
    system: 'Summarize these search results concisely',
    user: results,
  })

  return { summary, sources: results }
}
```

## Core Differences from JavaScript

### 1. Implicit Async

All function calls that invoke atoms are automatically awaited. No `async/await` keywords needed.

```javascript
// AsyncJS - clean and simple
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
  age: 21, // required number
  greeting = 'Hello' // optional string, defaults to 'Hello'
) {
  // ...
}
```

- **Colon (`:`)** = required parameter, example shows the type
- **Equals (`=`)** = optional parameter with default value

The example value IS the type. `age: 21` means "required number". `name: 'Anne'` means "required string".

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

Every function has a `.signature` property for self-documentation:

```javascript
/**
 * Search the knowledge base
 * @param query - The search query
 * @param limit - Max results to return
 */
function search(
  query: 'example query',
  limit = 10
) -> [{ title: 'Example Title', url: 'https://example.com' }] {
  // implementation
}

// Automatically gets:
search.signature = {
  name: 'search',
  description: 'Search the knowledge base',
  parameters: {
    query: { type: 'string', required: true, description: 'The search query' },
    limit: { type: 'number', required: false, default: 10, description: 'Max results to return' }
  },
  returns: { type: 'array', items: { type: 'object', shape: { title: 'string', url: 'string' } } }
}
```

## Type System Reference

### Parameter Types

| Syntax                  | Meaning          | Example                          |
| ----------------------- | ---------------- | -------------------------------- |
| `name: 'Anne'`          | Required string  | The example value shows the type |
| `age: 21`               | Required number  |                                  |
| `active: true`          | Required boolean |                                  |
| `tags: ['a', 'b']`      | Required array   |                                  |
| `user: { name: 'Bob' }` | Required object  |                                  |
| `limit = 10`            | Optional number  | Defaults to 10                   |
| `query = 'default'`     | Optional string  | Defaults to 'default'            |

### Destructured Parameter Defaults

AsyncJS supports default values in destructured object parameters. Unlike JavaScript/TypeScript where destructuring defaults can be tricky, AsyncJS makes them work reliably:

```javascript
function calculate({ a = 10, b = 5 }) {
  return { sum: a + b, product: a * b }
}

// Called with no arguments - uses defaults
calculate({})  // { sum: 15, product: 50 }

// Called with partial arguments - missing ones use defaults
calculate({ a: 20 })  // { sum: 25, product: 100 }

// Called with all arguments - no defaults used
calculate({ a: 3, b: 7 })  // { sum: 10, product: 21 }
```

This works seamlessly with type annotations too:

```javascript
function greet({ name: 'World', greeting = 'Hello' }) {
  return { message: `${greeting}, ${name}!` }
}

greet({})  // { message: "Hello, World!" }
greet({ name: 'Alice' })  // { message: "Hello, Alice!" }
greet({ greeting: 'Hi' })  // { message: "Hi, World!" }
```

### Return Types

Return types can be specified with arrow syntax:

```javascript
function search(query: 'search term') -> { results: [], count: 0 } {
  // Must return object with results array and count number
}
```

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
let { a, b } = obj // Destructuring (limited)
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

AsyncJS provides safe implementations of common JavaScript built-in objects:

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

AsyncJS provides `Set()` and `Date()` as factory functions - no `new` keyword needed.

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
// Supported: years, months, days, hours, minutes, seconds

// Comparison
let before = d.isBefore(later) // true
let after = later.isAfter(d) // true
let diffDays = d.diff(later, 'days') // -5

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
// { "tags": ["a", "b", "c"], "created": "2024-06-15T00:00:00.000Z" }
```

- **Sets** serialize to arrays
- **Dates** serialize to ISO 8601 strings

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

// Throws on validation failure (missing required fields)
let bad = filter({ name: 'Alice' }, { name: 'string', age: 0 })
// Error: Missing age
```

**Use cases:**

- Sanitize LLM outputs - strip unexpected properties from JSON responses
- API input validation - accept only the fields you expect
- Data projection - reduce objects to a known shape

**Note:** Return values are automatically filtered when a return type is declared. This makes return types act as projections:

```javascript
function getUser(id: 'user-123') -> { name: 'string', email: 'string' } {
  let user = fetchUser({ id })  // might return { name, email, password, ... }
  return { user }               // password automatically stripped
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
| `var`              | Scoping issues               | Use `let`           |

## API Usage

### transpile()

Full transpilation with signature and metadata:

```typescript
import { transpile } from 'tosijs-agent'

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
import { ajs } from 'tosijs-agent'

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

### agent\`\`

Tagged template for inline definitions:

```typescript
import { agent } from 'tosijs-agent'

const searchAST = agent`
  function search(query: 'example search', limit = 10) {
    let results = storeSearch({ query, limit })
    return { results }
  }
`
```

### getToolDefinitions()

Generate OpenAI-compatible tool schemas for LLM integration:

```typescript
import { getToolDefinitions, transpile } from 'tosijs-agent'

const { signature } = transpile(source)
const tools = getToolDefinitions([signature])

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
import { isAgentError } from 'tosijs-agent'

const { result, error } = await vm.run(ast, args)

if (isAgentError(result)) {
  // result itself is the error (when error occurs before return)
}
```

### Recovery with try/catch

Use `try/catch` in your AsyncJS code to handle errors gracefully:

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

Use the `Error()` built-in to trigger monadic error flow from your AsyncJS code:

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

AsyncJS intentionally does not support the `throw` statement. Instead, use `Error()`:

```javascript
// DON'T DO THIS - throw is not supported:
if (invalid) {
  throw new Error('Something went wrong')  // Transpiler error!
}

// DO THIS INSTEAD:
if (invalid) {
  Error('Something went wrong')  // Triggers monadic error flow
}
```

The `throw` keyword will show as an error in your editor (red underline) and the transpiler will provide a helpful error message pointing you to use `Error()` instead.

## Gotchas and Common Pitfalls

### Unavailable JavaScript Features

These common JavaScript APIs are **not available** in AsyncJS. The transpiler will catch these and provide helpful error messages:

| Feature          | Error Message              | Alternative                            |
| ---------------- | -------------------------- | -------------------------------------- |
| `setTimeout`     | Use the `delay` atom       | `delay({ ms: 1000 })`                  |
| `setInterval`    | Use while loops with delay | `while (cond) { delay({ ms: 1000 }) }` |
| `fetch`          | Use the `httpFetch` atom   | `httpFetch({ url })`                   |
| `RegExp`         | Use string methods         | `str.match()`, `str.replace()`         |
| `Promise`        | Implicit async             | All calls are automatically awaited    |
| `Map`            | Use plain objects          | `{ key: value }`                       |
| `require/import` | Register atoms with VM     | `new AgentVM({ customAtom })`          |

### The `new` Keyword

The `new` keyword is not supported. AsyncJS provides factory functions instead:

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

AsyncJS is purely functional. There's no `this`, no classes, no prototypes:

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

AsyncJS uses JavaScript's standard equality (`==` and `===`). There is no special deep equality:

```javascript
let a = { x: 1 }
let b = { x: 1 }
let same = a == b // false (reference comparison)

// For deep comparison, use JSON.stringify or write a comparison function
let equal = JSON.stringify(a) == JSON.stringify(b) // true
```

### Optional Chaining (`?.`)

Optional chaining is fully supported for safe property access:

```javascript
let x = obj?.nested?.value // Returns null if any step is null/undefined
let result = user?.profile?.name

// Works with method calls too
let len = items?.length
let upper = str?.toUpperCase()
```

**Note:** Nullish coalescing (`??`) is not yet supported. Use explicit checks:

```javascript
let x = obj?.nested?.value
if (x == null) {
  x = 'default'
}
```

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

AsyncJS compiles to Agent99's JSON AST, which executes in a completely sandboxed VM:

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

// After: AsyncJS
const ast = ajs(`
  function searchAgent(topic: 'climate change') {
    let results = search({ query: topic })
    if (results.length > 0) {
      let summary = summarize({ text: results })
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
