# AsyncJS (.ajs) - A Better JavaScript for AI Agents

AsyncJS is a JavaScript subset designed for writing AI agent logic. It compiles to Agent99's secure JSON AST format, providing familiar syntax with cleaner semantics.

## File Extension

AsyncJS files use the `.ajs` extension to distinguish them from standard JavaScript:

```
my-agent.ajs
search-tool.ajs
```

## Why AsyncJS?

| Problem with JavaScript | AsyncJS Solution |
|------------------------|------------------|
| `async/await` boilerplate | All calls are implicitly async |
| `null` vs `undefined` confusion | Just `null` |
| `==` vs `===` confusion | `==` does deep equality, `===` is reference |
| No built-in type safety | Types through example values |
| Complex error handling | Monadic error flow |
| Security concerns with `eval` | Compiles to sandboxed VM |

## Quick Example

```javascript
// search-agent.ajs

/**
 * Search and summarize information about a topic
 * @param topic - The topic to research
 * @param maxResults - Maximum number of results
 */
function searchAgent(
  topic: 'string',
  maxResults = 5
) {
  let results = search({ query: topic, limit: maxResults })
  
  if (results.length == 0) {
    return { summary: 'No results found', sources: [] }
  }
  
  let summary = llmPredict({
    system: 'Summarize these search results concisely',
    user: results
  })
  
  return { summary, sources: results }
}
```

## Core Differences from JavaScript

### 1. Implicit Async

All function calls that invoke atoms are automatically awaited. No `async/await` keywords needed.

```javascript
// AsyncJS - clean and simple
function agent(topic: 'string') {
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

### 2. Types Through Values

Types are expressed as example values, not annotations. No TypeScript needed.

```javascript
// Required parameters: null && type
function agent(
  name: 'string',                    // required string (colon shorthand)
  age = null && 0,                   // required number (explicit form)
  tags = null && ['string'],         // required array of strings
  user = null && { name: 'string', age: 0 }  // required object shape
) { ... }

// Optional parameters: just provide a default
function agent(
  limit = 10,                        // optional number, defaults to 10
  includeImages = false              // optional boolean, defaults to false
) { ... }

// Nullable parameters
function agent(
  filter = null && ('string' || null),  // required, but can be null
  id = null && ('string' || 0)          // required string-or-number union
) { ... }
```

### 3. Simplified Equality

```javascript
// == does deep value comparison
{ a: 1 } == { a: 1 }  // true (compares values)

// === is reference identity  
let x = { a: 1 }
let y = x
x === y  // true (same reference)
```

### 4. No null/undefined Split

There is only `null`. Accessing missing properties returns `null`, not `undefined`.

```javascript
let obj = { name: 'Alice' }
obj.age      // null (not undefined)
obj.name     // 'Alice'
```

### 5. Monadic Error Flow

Errors propagate automatically. No try/catch needed for most cases.

```javascript
function pipeline(topic: 'string') {
  let results = search({ query: topic })      // might return Error
  let summary = summarize({ text: results })  // if Error, passes through
  let formatted = format({ content: summary }) // if Error, passes through
  return formatted                             // Error or result
}
// If search() fails, the Error flows through without executing subsequent steps
```

### 6. Function Introspection

Every function has a `.signature` property for self-documentation:

```javascript
/**
 * Search the knowledge base
 * @param query - The search query
 * @param limit - Max results to return
 */
function search(
  query: 'string',
  limit = 10
) -> [{ title: 'string', url: 'string' }] {
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

### Type Patterns

| Pattern | Meaning | Example |
|---------|---------|---------|
| `param: 'string'` | Required string | `name: 'string'` |
| `param: 0` | Required number | `age: 0` |
| `param: true` | Required boolean | `active: true` |
| `param: ['string']` | Required string array | `tags: ['string']` |
| `param: { k: 'v' }` | Required object shape | `user: { name: 'string' }` |
| `param = value` | Optional with default | `limit = 10` |
| `param: 'type' \|\| null` | Nullable | `filter: 'string' \|\| null` |
| `param: 'string' \|\| 0` | Union type | `id: 'string' \|\| 0` |

### Colon Shorthand

The colon syntax is sugar for `null && type`:

```javascript
// These are equivalent:
function agent(topic: 'string') { }
function agent(topic = null && 'string') { }
```

### Return Types

Specify return types with arrow syntax:

```javascript
function search(query: 'string') -> [{ title: 'string' }] {
  // Must return array of objects with title property
}
```

Or let them be inferred from the return statement:

```javascript
function search(query: 'string') {
  return { results: [], count: 0 }  // Return type inferred
}
```

## Supported Constructs

### Variables

```javascript
let x = 5           // Variable declaration
x = 10              // Assignment
let { a, b } = obj  // Destructuring (limited)
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

// Optional chaining
obj?.property?.nested

// Template literals
`Hello ${name}!`

// Function calls
atomName({ param1: value1, param2: value2 })
```

### Array Methods

```javascript
items.map(x => transform(x))    // Becomes map atom
items.push(newItem)             // Becomes push atom
items.filter(x => x.active)     // Becomes filter atom
str.split(',')                  // Becomes split atom
parts.join('-')                 // Becomes join atom
```

## Unsupported Constructs

These JavaScript features are intentionally not supported:

| Feature | Reason | Alternative |
|---------|--------|-------------|
| `class` | Use functional composition | Plain functions |
| `this` | Implicit state is confusing | Explicit parameters |
| `new` | Classes not supported | Factory functions |
| `import/require` | Atoms must be registered | Register with VM |
| `async/await` | Implicit async | Just call functions |
| `yield/generators` | Complex control flow | Use `map`/`while` |
| `eval` | Security (though VM is safe) | Use transpiler |
| `with` | Deprecated | Explicit references |
| `var` | Scoping issues | Use `let` |

## API Usage

### transpile()

Full transpilation with signature and metadata:

```typescript
import { transpile } from 'agent-99'

const { ast, signature, warnings } = transpile(`
  function greet(name: 'string') {
    let msg = template({ tmpl: 'Hello {{name}}!', vars: { name } })
    return { msg }
  }
`)

console.log(signature.parameters.name.type)  // 'string'
console.log(signature.parameters.name.required)  // true
```

### js()

Convenience function returning just the AST:

```typescript
import { js } from 'agent-99'

const ast = js(`
  function add(a: 0, b: 0) {
    let sum = mathCalc({ expr: 'a + b', vars: { a, b } })
    return { sum }
  }
`)

// Execute with VM
const vm = new AgentVM()
const result = await vm.run(ast, { a: 5, b: 3 })
console.log(result.sum)  // 8
```

### agent\`\`

Tagged template for inline definitions:

```typescript
import { agent } from 'agent-99'

const searchAST = agent`
  function search(query: 'string', limit = 10) {
    let results = storeSearch({ query, limit })
    return { results }
  }
`
```

### getToolDefinitions()

Generate OpenAI-compatible tool schemas for LLM integration:

```typescript
import { getToolDefinitions, transpile } from 'agent-99'

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

## Security Model

AsyncJS compiles to Agent99's JSON AST, which executes in a completely sandboxed VM:

- **No file system access** - unless explicitly provided via atoms
- **No network access** - unless explicitly provided via atoms  
- **No global state** - each execution is isolated
- **Fuel-limited execution** - prevents infinite loops
- **Type-checked at runtime** - invalid operations fail safely

The transpiler is permissive because security is enforced at the VM level, not the language level. Even if malicious code somehow made it through, the VM cannot execute dangerous operations unless atoms for those operations are registered.

## Migration from TypedBuilder

If you have existing TypedBuilder code, here's how to convert:

```typescript
// Before: TypedBuilder
const ast = new TypedBuilder('searchAgent')
  .varSet({ key: 'results', value: { $kind: 'call', atom: 'search', args: { query: { $kind: 'arg', path: 'topic' } } } })
  .if({
    condition: 'len > 0',
    vars: { len: 'results.length' },
    then: (b) => b.varSet({ key: 'summary', value: { $kind: 'call', atom: 'summarize', args: { text: 'results' } } })
  })
  .return({ schema: { properties: { results: {}, summary: {} } } })
  .build()

// After: AsyncJS
const ast = js(`
  function searchAgent(topic: 'string') {
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
