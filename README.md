# Agent99

A **type-safe-by-design, cost-limited virtual machine** that enables the **safe execution of untrusted code** anywhere.

It's **safe eval** in the cloud.

Agent99 allows you to define complex logic chains, agents, and data pipelines—_computer programs_—using a fluent TypeScript builder. These definitions compile to a safe, JSON-serializable AST (Abstract Syntax Tree) that can be executed in the browser, on the server, or at the edge.

### Why do you care?

- **Service-as-a-Service:** Define a complete backend service—including database fetches, API calls, and logic—entirely as data, and execute it safely on a server.
- **Agents-as-Data:** Build AI agents entirely as JSON objects. Send them to a server to run instantly—no deployment, no build steps, no spin-up time.
- **Universal Runtime:** Run your agent logic in the browser for zero-latency UI updates, or move it to the server for heavy lifting. Because the AST is strongly typed JSON, it is easy to build a runtime for any language or hardware stack, or even compile it directly to LLVM.

### The Holy Grail

Agent99 solves fundamental problems in distributed computing:

- **Safe "Useful Mining":** Allows distributed nodes to execute productive, arbitrary work safely (sandboxed & gas-limited) — e.g. replacing Proof-of-Work with distributed data processing.
- **Code is Data:** Logic is defined as a portable AST, making execution language-agnostic and portable.
- **True Network Agents:** Write code that travels to the data, rather than moving petabytes of data to the code.
- **Type-Safe Composition:** Build robust pipelines where inputs and outputs are strictly validated at every step.

## Comparison: Agent99 vs LangChain

Consider building a "Research Agent" that searches for a topic, summarizes it, critiques the summary, and refines the search if needed.

### LangChain

Requires defining Tools, PromptTemplates, Chains (or Graph nodes), and wiring them up with complex state management classes. To refine the logic, you must redeploy the application code.

### Agent99

The entire logic is a single, fluent expression that compiles to JSON. You can refine the agent's behavior by simply sending a new JSON payload to the server—no deployment required.

```typescript
// Research Agent: Search -> Summarize -> Critique -> Loop
const agent = A99.take(s.object({ topic: s.string })).while(
  '!good && tries < 3',
  {},
  (loop) =>
    loop
      .storeSearch({ query: 'topic' })
      .as('results')
      .llmPredict({ system: 'Summarize', user: 'results' })
      .as('summary')
      .llmPredict({ system: 'Critique', user: 'summary' })
      .as('feedback')
      .if(
        'feedback == "OK"',
        {},
        (yes) => yes.varSet({ key: 'good', value: true }),
        (no) => no.llmPredict({ system: 'Refine', user: 'topic' }).as('topic')
      )
)
```

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
      // A99.args creates a pointer to the runtime value, ensuring the AST remains static while data is dynamic
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

| Category         | Atoms                                 | Description                                     |
| ---------------- | ------------------------------------- | ----------------------------------------------- |
| **Flow**         | `seq`, `if`, `while`, `return`, `try` | Control flow and loops.                         |
| **State**        | `varSet`, `varGet`, `scope`           | variable management.                            |
| **Math**         | `mathCalc`                            | Safe expression evaluation (e.g. `"a + b"`).    |
| **Logic**        | `eq`, `gt`, `and`, `not`, ...         | Boolean logic.                                  |
| **IO**           | `httpFetch`                           | HTTP requests.                                  |
| **Store**        | `storeGet`, `storeSet`                | Key-Value storage.                              |
| **AI**           | `llmPredict`, `agentRun`              | LLM calls and sub-agent recursion.              |
| **Utils**        | `random`, `uuid`                      | Random generation (Crypto-secure if available). |
| **Optimization** | `memoize`, `cache`                    | In-memory memoization and persistent caching.   |

## Capabilities & Security

Agent99 uses a **Capability-Based Security** model. The VM cannot access the network, file system, or database unless provided with a Capability.

**Zero Config Defaults:** The runtime provides sensible defaults for local development:

- `httpFetch` uses the global `fetch`.
- `store` uses an in-memory `Map` (ephemeral).
- `random`/`uuid` use `crypto` or `Math`.

In production, you should inject secure, instrumented, or cloud-native implementations (e.g., restricted fetch, Postgres, Redis).

## Batteries Included (AI & Vector Search)

For local AI development, Agent99 provides a standard library of "Batteries" that enable Vector Search and LLM features without external API keys.

- **Vector:** Local embeddings via `@xenova/transformers`.
- **Store:** In-memory Vector Store via `@orama/orama`.
- **LLM:** Bridge to LM Studio (`http://localhost:1234`).

### Usage

To use the batteries, register the atoms and provide the capabilities:

```typescript
import { AgentVM, batteries } from 'agent-99'
import { storeVectorize, storeSearch, llmPredictBattery } from 'agent-99'

const vm = new AgentVM({
  storeVectorize,
  storeSearch,
  llmPredictBattery,
})

await vm.run(ast, args, { capabilities: batteries })
```

### Structured Outputs

You can request structured JSON responses (e.g., JSON Schema) using `responseFormat`:

```typescript
const logic = builder.llmPredictBattery({
  system: 'Extract data.',
  user: 'John Doe, 30',
  responseFormat: {
    type: 'json_schema',
    json_schema: {
      name: 'person',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      },
    },
  },
})
```

### Performance & Tree Shaking

The core Agent99 runtime is extremely lightweight (~7KB gzipped).

The "Batteries" dependencies (transformers, Orama) are **lazy-loaded**. This means the heavy dependencies are only downloaded or bundled if you explicitly import and use the battery capabilities. If you only use the core runtime, your application bundle remains small.

## Self-Documentation for Agents

The VM can describe itself to an LLM, generating an OpenAI-compatible Tool Schema for its registered atoms.

```typescript
// Get all tools
const tools = vm.getTools()

// Get only flow control tools
const flowTools = vm.getTools('flow')

// Get specific tools
const myTools = vm.getTools(['httpFetch', 'mathCalc'])
```

## Implementing Real-World Atoms

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
chain.while('n > 0', { n: 'n' }, (loop) =>
  loop.mathCalc({ expr: 'n - 1', vars: { n: 'n' } }).as('n')
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
