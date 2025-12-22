# Agent99

[github](https://github.com/tonioloewald/agent-99#readme) | [npm](https://www.npmjs.com/package/agent-99) | [discord](https://discord.gg/ramJ9rgky5)

<div style="text-align: center;"><img alt="Agent-99 Action Figure" src="https://raw.githubusercontent.com/tonioloewald/agent-99/main/agent-99.webp" style="max-height: 50vh; max-width: 50vw; height: 900px; aspect-ratio: 2 / 3"></div>

A **type-safe-by-design, cost-limited virtual machine** that enables the **safe execution of untrusted code** anywhere.

It's **safe eval** in the cloud.

And it's **tiny**, ![bundlejs bundle including dependencies](https://deno.bundlejs.com/badge?q=agent-99).

Agent99 allows you to define complex logic chains, agents, and data pipelines—_computer programs_—using a fluent TypeScript builder. These definitions compile to a safe, JSON-serializable AST ([Abstract Syntax Tree](https://en.wikipedia.org/wiki/Abstract_syntax_tree)) that can be executed in the browser, on the server, or at the edge.

For a deeper dive into the architecture and security model, see the [Technical Context](./CONTEXT.md).

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

## Example Project

To see a complete, working example of how to build an agent with a simple UI, check out the official playground project:

**[https://github.com/brainsnorkel/agent99-playground](https://github.com/brainsnorkel/agent99-playground)**

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

## Tracing and Debugging

For debugging and testing, you can enable trace mode to get a detailed log of the agent's execution path.

```typescript
const { result, trace } = await vm.run(
  ast,
  { price: 100, taxRate: 0.2 },
  { trace: true } // Enable trace mode
)

console.log(trace)
```

The `trace` output is an array of `TraceEvent` objects, where each event records the state of the agent before and after an atom's execution, along with the inputs, outputs, and fuel consumption.

```typescript
interface TraceEvent {
  op: string
  input: any
  stateBefore: any
  stateAfter: any
  result?: any
  error?: string
  fuelBefore: number
  fuelAfter: number
  timestamp: string
}
```

## Core Atoms

The standard library includes essential primitives:

| Category         | Atoms                                                              | Description                                                                                                           |
| ---------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Flow**         | `seq`, `if`, `while`, `return`, `try`                              | Control flow and loops.                                                                                               |
| **State**        | `varSet`, `varGet`, `varsLet`, `varsImport`, `varsExport`, `scope` | Variable management, including batch operations for importing variables from arguments and exporting them as results. |
| **Math**         | `mathCalc`                                                         | Safe expression evaluation (e.g. `"a + b"`).                                                                          |
| **Logic**        | `eq`, `gt`, `and`, `not`, ...                                      | Boolean logic.                                                                                                        |
| **IO**           | `httpFetch`                                                        | HTTP requests.                                                                                                        |
| **Store**        | `storeGet`, `storeSet`                                             | Key-Value storage.                                                                                                    |
| **AI**           | `llmPredict`, `agentRun`                                           | LLM calls and sub-agent recursion.                                                                                    |
| **Utils**        | `random`, `uuid`, `hash`                                           | Random generation, UUIDs, and hashing.                                                                                |
| **Optimization** | `memoize`, `cache`                                                 | In-memory memoization and persistent caching. Keys are optional and will be auto-generated if not provided.           |

## Capabilities & Security

Agent99 uses a **[Capability-Based Security](https://en.wikipedia.org/wiki/Capability-based_security)** model. The VM cannot access the network, file system, or database unless provided with a Capability.

**Zero Config Defaults:** The runtime provides sensible defaults for local development:

- `httpFetch` uses the global `fetch`.
- `store` uses an in-memory `Map` (ephemeral).
- `random`/`uuid` use `crypto` or `Math`.

In production, you should inject secure, instrumented, or cloud-native implementations (e.g., restricted fetch, Postgres, Redis).

## Batteries Included (Zero-Dependency Local AI)

For local AI development, Agent99 provides a "Batteries Included" setup that runs out-of-the-box with **zero external dependencies or API keys**. It features a built-in vector search and connects to [LM Studio](https://lmstudio.ai/) for local model inference.

### 1. Setup LM Studio

To use the batteries, you need to have LM Studio running in the background.

1.  **Download and Install:** Get LM Studio from [lmstudio.ai](https://lmstudio.ai/).
2.  **Download Models:** You'll need at least one LLM and one embedding model. We recommend:
    - **LLM:** Search for a [GGUF](https://github.com/ggerganov/ggml/blob/master/docs/gguf.md) model like `Meta-Llama-3-8B-Instruct.Q4_K_M.gguf` for a good balance of performance and size.
    - **Embedding:** Search for `nomic-embed-text-v1.5.Q8_0.gguf`.
3.  **Start the Server:** Go to the "Local Server" tab (icon: `<-->`) and click "Start Server".

### 2. How it Works

When you first import the `batteries` from `agent-99`, the runtime performs a one-time audit of the models available on your LM Studio server. It automatically detects which models are for embeddings and which are for chat, and caches the results to avoid re-auditing during the same session.

This allows Agent99 to automatically select the correct models for different tasks without any configuration. The cache uses `localStorage` if available (in a browser environment), or a simple in-memory cache otherwise.

### 3. Usage

The `batteries` export contains the necessary capabilities. To use them, register the `batteryAtoms` with the `AgentVM` and pass the `batteries` object to the `run` method's capabilities.

> **Note on Breaking Change:** Previously, battery atoms were exported individually. They are now consolidated into a single `batteryAtoms` object. This simplifies registration with the `AgentVM`.
>
> **Old Way:**
>
> ```typescript
> import { AgentVM, batteries, storeVectorize, storeSearch } from 'agent-99'
> const vm = new AgentVM({ storeVectorize, storeSearch, ... })
> ```
>
> **New Way:**
>
> ```typescript
> import { AgentVM, batteries, batteryAtoms } from 'agent-99'
> const vm = new AgentVM(batteryAtoms)
> ```

```typescript
import { AgentVM, batteries, batteryAtoms, A99 } from 'agent-99'

// Register the battery atoms
const vm = new AgentVM(batteryAtoms)

// The batteries are audited on import.
const logic = vm.A99.storeVectorize({ text: 'Hello' }).as('vector')

const { result } = await vm.run(logic.toJSON(), {}, { capabilities: batteries })

console.log(result)
```

### 4. Vector Search Performance

The built-in vector search is implemented with a highly optimized **[cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity) function** that operates directly on arrays. It is designed for serverless and edge environments where low-latency is critical. Benchmarks run on a 2023 M3 Max using `bun test` show the following performance characteristics:

| Vector Count | Dimensions | Search Time |
| :----------- | :--------- | :---------- |
| 10,000       | 500        | ~15 ms      |
| 10,000       | 1000       | ~22 ms      |
| 100,000      | 500        | ~101 ms     |

These results demonstrate that the in-memory vector store is suitable for a wide range of real-time applications without requiring a dedicated vector database.

> **cosine similarity** is the most popular algorithm for vector search, but there are many others (along with strategies for dealing with extremely large data-sets). For more information you can start with this Wikipedia article [Vector database](https://en.wikipedia.org/wiki/Vector_database).

### 5. Structured Outputs

You can request structured JSON responses (e.g., JSON Schema) from compatible models using `responseFormat`:

```typescript
const logic = vm.A99.llmPredictBattery({
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

### 5. Troubleshooting

- **Connection Error:** If you see an error like `Failed to connect to LM Studio`, make sure the LM Studio server is running on the default port (`1234`).
- **No Models Found:** Ensure you have downloaded compatible GGUF models and they are loaded in LM Studio. The audit process will warn you if it cannot find suitable LLM or embedding models.

## Self-Documentation for Agents

The VM can describe itself to an LLM, generating an [OpenAI-compatible Tool Schema](https://platform.openai.com/docs/guides/function-calling) for its registered atoms.

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

// 3. Use in Builder (Types are inferred!)
// The `vm.A99` property is the recommended way to get a builder
// that includes any custom atoms you have registered.
const builder = myVM.A99

const logic = builder
  .scrape({ url: 'https://example.com' })
  .as('html')
  .return(s.object({ html: s.string }))
```

## Control Flow

Atoms like `if`, `while`, and `mathCalc` evaluate expression strings. For security and predictability, these expressions are not granted access to the full agent state. Instead, you must use the `vars` parameter to explicitly pass in any state variables that the expression needs.

This mapping allows you to alias variables, making your expressions cleaner and more readable.

### If / Else

```typescript
chain.if(
  'p > 100 && itemsLeft > 0',
  { p: 'product.price', itemsLeft: 'inventory.stockCount' }, // Map state to expression variables
  (then) => then.varSet({ key: 'discount', value: true }),
  (elseBranch) => elseBranch.varSet({ key: 'discount', value: false })
)
```

### While Loop

```typescript
// The `vars` map works identically here, creating a scope for the condition.
chain.while('n > 0', { n: 'counter' }, (loop) =>
  loop.mathCalc({ expr: 'n - 1', vars: { n: 'n' } }).as('counter')
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

### Testing

The test suite includes performance benchmarks for the in-memory vector search. These benchmarks can be sensitive to the performance of the host machine and may fail in slower CI/CD environments. To avoid this, you can skip the benchmark tests by setting the `AGENT99_TESTS_SKIP_BENCHMARKS` environment variable.

```bash
# Run tests
bun test

# Skip benchmark tests
AGENT99_TESTS_SKIP_BENCHMARKS=1 bun test

# Type check
bun run typecheck

# Build blueprint
bun run make
```
