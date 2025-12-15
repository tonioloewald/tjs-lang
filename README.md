# Agent99

A secure, portable, and Turing-complete runtime for AI Agents and Services-as-Code.

Agent99 allows you to define complex logic chains, agents, and data pipelines using a fluent TypeScript builder. These definitions compile to a safe, JSON-serializable AST (Abstract Syntax Tree) that can be executed anywhere—browser, server, or edge—within a sandboxed Virtual Machine.

## Features

-   **Environment Agnostic:** Runs in Node.js, Bun, Deno, and Browsers.
-   **Sandboxed VM:** No `eval()`. Safe math/logic parsing via `jsep`. Strict timeouts and gas limits.
-   **Type-Safe Builder:** Fluent API with TypeScript inference.
-   **JSON AST:** Logic is data. Serialize agents, send them over HTTP, or store them in a database.
-   **Capability-Based:** IO (Fetch, DB, AI) is injected at runtime, allowing perfect mocking and security control.

## Installation

```bash
bun add agent-99
# or
npm install agent-99
```

## Quick Start

### 1. Define Logic (The Builder)

Use the fluent builder to create a logic chain.

```typescript
import { A99, s } from 'agent-99'

// Define a simple calculation agent
const calculateTotal = A99.take(
  s.object({
    price: s.number,
    taxRate: s.number,
  })
)
  // Atoms use camelCase names
  .mathCalc({
    expr: 'price * (1 + taxRate)',
    vars: {
      price: A99.args('price'),
      taxRate: A99.args('taxRate'),
    },
  })
  .as('total')
  .return(s.object({ total: s.number }))

// Compile to JSON AST
const ast = calculateTotal.toJSON()
console.log(JSON.stringify(ast, null, 2))
```

### 2. Execute (The VM)

Run the AST in the VM. The VM is stateless and isolated.

```typescript
import { AgentVM } from 'agent-99'

const vm = new AgentVM()

const result = await vm.run(
  ast,
  { price: 100, taxRate: 0.2 }, // Input Args
  { fuel: 1000 } // Execution Options
)

console.log(result.result) // { total: 120 }
console.log(result.fuelUsed) // Gas consumed
```

## Core Atoms

The standard library includes essential primitives:

| Category | Atoms | Description |
| --- | --- | --- |
| **Flow** | `seq`, `if`, `while`, `return`, `try` | Control flow and loops. |
| **State** | `varSet`, `varGet`, `scope` | variable management. |
| **Math** | `mathCalc` | Safe expression evaluation (e.g. `"a + b"`). |
| **Logic** | `eq`, `gt`, `and`, `not`, ... | Boolean logic. |
| **IO** | `httpFetch` | HTTP requests. |
| **Store** | `storeGet`, `storeSet` | Key-Value storage. |
| **AI** | `llmPredict`, `agentRun` | LLM calls and sub-agent recursion. |
| **Utils** | `random`, `uuid` | Random generation (Crypto-secure if available). |

## Capabilities & Security

Agent99 uses a **Capability-Based Security** model. The VM cannot access the network, file system, or database unless provided with a Capability.

**Zero Config Defaults:** The runtime provides sensible defaults for local development:
*   `httpFetch` uses the global `fetch`.
*   `store` uses an in-memory `Map` (ephemeral).
*   `random`/`uuid` use `crypto` or `Math`.

In production, you should inject secure, instrumented, or cloud-native implementations (e.g., restricted fetch, Postgres, Redis).

### Implementing Real-World Atoms

To enable custom capabilities like Database Access or Web Scraping, you inject them into the `VM.run` call.

#### Example: Providing a Database

```typescript
import { AgentVM } from 'agent-99'

const vm = new AgentVM()

const capabilities = {
  store: {
    get: async (key) => {
      // Connect to Redis/Postgres here
      return await db.find(key)
    },
    set: async (key, value) => {
      await db.insert(key, value)
    },
  },
}

await vm.run(ast, args, { capabilities })
```

#### Example: Web Scraping Agent

You can expose a custom capability or use the standard `httpFetch` if trusted.

```typescript
const capabilities = {
  fetch: async (url, options) => {
    // Implement secure fetch, possibly with proxy rotation or rate limiting
    return fetch(url, options)
  },
}
```

## Custom Atoms

You can extend the runtime with your own atomic operations.

```typescript
import { defineAtom, AgentVM, s, A99 } from 'agent-99'

// 1. Define the Atom
const myScraper = defineAtom(
  'scrape', // OpCode
  s.object({ url: s.string }), // Input Schema
  s.string, // Output Schema
  async ({ url }, ctx) => {
    // Implementation logic
    const res = await ctx.capabilities.fetch(url)
    return await res.text()
  },
  { cost: 5 } // Gas cost
)

// 2. Register with Custom VM
const myVM = new AgentVM({ scrape: myScraper })

// 3. Use in Builder (via .step or A99.custom)
const builder = A99.custom({ ...myVM['atoms'] })

const logic = builder
  .scrape({ url: 'https://example.com' })
  .as('html')
  .return(s.object({ html: s.string }))
```

## Control Flow

### If / Else

```typescript
chain.if(
  'price > 100',
  { price: 'price' }, // Map variables for expression
  (then) => then.varSet({ key: 'discount', value: true }),
  (elseBranch) => elseBranch.varSet({ key: 'discount', value: false })
)
```

### While Loop

```typescript
chain.while(
  'n > 0',
  { n: 'n' },
  (loop) => loop.mathCalc({ expr: 'n - 1', vars: { n: 'n' } }).as('n')
)
```

### Try / Catch

```typescript
chain.try({
  try: (b) => b.httpFetch({ url: '...' }),
  catch: (b) => b.varSet({ key: 'error', value: 'failed' }),
})
```

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck

# Build blueprint
bun run make
```
