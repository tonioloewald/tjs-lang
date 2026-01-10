<!--{"pin": "top", "hidden": true}-->

# tosijs-agent

[github](https://github.com/tonioloewald/tosijs-agent#readme) | [npm](https://www.npmjs.com/package/tosijs-agent) | [discord](https://discord.gg/ramJ9rgky5)

<img src="/tosijs-agent.svg" alt="tosijs-agent logo" width="300" height="300">

A **type-safe-by-design, cost-limited virtual machine** that enables the **safe execution of untrusted code** anywhere.

It's **safe eval** in the cloud.

And it's **tiny**, ![bundlejs bundle including dependencies](https://deno.bundlejs.com/badge?q=tosijs-agent).

tosijs-agent allows you to define complex logic chains, agents, and data pipelines—_computer programs_—using a fluent TypeScript builder. These definitions compile to a safe, JSON-serializable AST ([Abstract Syntax Tree](https://en.wikipedia.org/wiki/Abstract_syntax_tree)) that can be executed in the browser, on the server, or at the edge.

For a deeper dive into the architecture and security model, see the [Technical Context](./CONTEXT.md).

### Why do you care?

- **Service-as-a-Service:** Define a complete backend service—including database fetches, API calls, and logic—entirely as data, and execute it safely on a server.
- **Agents-as-Data:** Build AI agents entirely as JSON objects. Send them to a server to run instantly—no deployment, no build steps, no spin-up time.
- **Universal Runtime:** Run your agent logic in the browser for zero-latency UI updates, or move it to the server for heavy lifting. Because the AST is strongly typed JSON, it is easy to build a runtime for any language or hardware stack, or even compile it directly to LLVM.

### The Holy Grail

tosijs-agent solves fundamental problems in distributed computing:

- **Safe "Useful Mining":** Allows distributed nodes to execute productive, arbitrary work safely (sandboxed & gas-limited) — e.g. replacing Proof-of-Work with distributed data processing.
- **Code is Data:** Logic is defined as a portable AST, making execution language-agnostic and portable.
- **True Network Agents:** Write code that travels to the data, rather than moving petabytes of data to the code.
- **Type-Safe Composition:** Build robust pipelines where inputs and outputs are strictly validated at every step.

## Comparison: tosijs-agent vs LangChain

Consider building a "Research Agent" that searches for a topic, summarizes it, critiques the summary, and refines the search if needed.

### LangChain

Requires defining Tools, PromptTemplates, Chains (or Graph nodes), and wiring them up with complex state management classes. To refine the logic, you must redeploy the application code.

### tosijs-agent

The entire logic is a single, fluent expression that compiles to JSON. You can refine the agent's behavior by simply sending a new JSON payload to the server—no deployment required.

```typescript
// Research Agent: Search -> Summarize -> Critique -> Loop
const agent = Agent.take(s.object({ topic: s.string })).while(
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

## Interactive Example: Cover Version Finder

This example shows the complete loop: a UI form captures user input, AsyncJS code processes it (calling an API and using an LLM to analyze results), and displays the output with album artwork.

```css
.cover-finder {
  padding: 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}
.cover-finder form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.cover-finder input {
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  flex: 1;
  min-width: 120px;
}
.cover-finder button {
  padding: 8px 20px;
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.cover-finder #results {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.cover-finder .cover-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}
.cover-finder .cover-card {
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.cover-finder .cover-card img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}
.cover-finder .cover-card .info {
  padding: 10px;
  flex: 1;
}
.cover-finder .cover-card .track {
  font-weight: bold;
  font-size: 0.9em;
  margin-bottom: 4px;
  line-height: 1.2;
}
.cover-finder .cover-card .artist {
  color: #666;
  font-size: 0.85em;
  line-height: 1.2;
}
```

```html
<div class="cover-finder">
  <form id="cover-search">
    <input type="text" id="song" placeholder="Song name" value="Yesterday" />
    <input
      type="text"
      id="artist"
      placeholder="Original artist"
      value="Beatles"
    />
    <button type="submit">Find Covers</button>
  </form>
  <div id="results"></div>
</div>
```

```js
// Wire up the form to AsyncJS
// Uses demoRuntime which gets LLM settings from the Settings dialog
import { ajs } from 'tosijs-agent'

// The AsyncJS code - searches iTunes and uses LLM to find covers
const findCovers = ajs`
  function findCovers({ song, artist }) {
    let query = song + ' ' + artist
    let url = \`https://itunes.apple.com/search?term=\${query}&limit=25&media=music\`
    let raw = httpFetch({ url, cache: 3600 })
    let itunesData = JSON.parse(raw)
    
    let results = itunesData.results || []
    
    // Build track list with indices for the LLM
    let tracks = []
    let i = 0
    for (let x of results) {
      tracks.push(\`[\${i}] "\${x.trackName}" by \${x.artistName} (\${x.collectionName})\`)
      i = i + 1
    }
    let trackList = tracks.join('\\n')
    
    // Schema.response builds the responseFormat structure from an example
    let schema = Schema.response('cover_versions', {
      covers: [{ index: 0, track: '', artist: '', album: '' }]
    })
    
    let prompt = \`Search results for "\${song}" by \${artist}:

\${trackList}

List cover versions (tracks NOT by \${artist}). Include the index number.\`

    let llmResponse = llmPredict({ prompt, options: { responseFormat: schema } })
    let parsed = JSON.parse(llmResponse)
    
    // Return covers with itunesData for artwork lookup in JS
    return { song, artist, covers: parsed.covers, itunesData }
  }
`

// Handle form submission
document.getElementById('cover-search').onsubmit = async (e) => {
  e.preventDefault()
  const resultsDiv = document.getElementById('results')
  resultsDiv.textContent = 'Searching...'

  // demoRuntime uses API keys from Settings dialog
  const { result, error } = await demoRuntime.run(
    findCovers,
    {
      song: document.getElementById('song').value,
      artist: document.getElementById('artist').value,
    },
    { fuel: 5000 }
  )

  if (error) {
    resultsDiv.textContent = `Error: ${error.message}`
  } else if (result.covers.length === 0) {
    resultsDiv.textContent = 'No cover versions found.'
  } else {
    const itunesResults = result.itunesData?.results || []
    // Match covers to artwork using index from results
    const covers = result.covers.map((c) => {
      const source = itunesResults[c.index]
      return {
        ...c,
        artwork: source?.artworkUrl100?.replace('100x100', '200x200'),
      }
    })
    resultsDiv.innerHTML = `<h3>Cover versions of "${result.song}":</h3>
      <div class="cover-grid">${covers
        .map((c) =>
          c.artwork
            ? `
        <div class="cover-card">
          <img src="${c.artwork}" alt="${c.album || 'Album art'}">
          <div class="info">
            <div class="track">${c.track || 'Unknown track'}</div>
            <div class="artist">${c.artist || 'Unknown artist'}</div>
          </div>
        </div>`
            : `
        <div class="cover-card">
          <div class="info" style="padding-top:60px">
            <div class="track">${c.track || 'Unknown track'}</div>
            <div class="artist">${c.artist || 'Unknown artist'}</div>
          </div>
        </div>`
        )
        .join('')}
      </div>`
  }
}
```

This demonstrates:

- **Safe execution**: The AsyncJS code runs in a sandboxed VM with fuel limits
- **Structured output**: JSON schema guarantees valid response format from the LLM
- **Capability injection**: LLM access is provided by the host, not the untrusted code
- **Portable logic**: The `findCovers` AST could be sent to a server for execution instead

## Example Project

To see a complete, working example of how to build an agent with a simple UI, check out the official playground project:

**[https://github.com/brainsnorkel/agent99-playground](https://github.com/brainsnorkel/agent99-playground)**

## Installation

```bash
bun add tosijs-agent
# or
npm install tosijs-agent
```

## Quick Start

### 1. Write Logic (AsyncJS)

Write agents in AsyncJS—a JavaScript subset that compiles to a safe, serializable AST.

```typescript
import { ajs, AgentVM } from 'tosijs-agent'

// Define a calculation agent using familiar JavaScript syntax
const calculateTotal = ajs`
  function calculate({ price, taxRate }) {
    let total = price * (1 + taxRate)
    return { total }
  }
`

// Run it
const vm = new AgentVM()
const result = await vm.run(calculateTotal, { price: 100, taxRate: 0.2 })

console.log(result.result) // { total: 120 }
console.log(result.fuelUsed) // Fuel consumed
```

AsyncJS supports most JavaScript expressions, loops, try/catch, and more. See [ASYNCJS.md](./ASYNCJS.md) for the full language reference.

### 2. Advanced: The Builder API

For programmatic AST construction (e.g., dynamic agent generation, metaprogramming), use the fluent builder:

```typescript
import { Agent, s } from 'tosijs-agent'

const calculateTotal = Agent.take(
  s.object({ price: s.number, taxRate: s.number })
)
  .varSet({
    key: 'total',
    value: {
      $expr: 'binary',
      op: '*',
      left: Agent.args('price'),
      right: {
        $expr: 'binary',
        op: '+',
        left: { $expr: 'literal', value: 1 },
        right: Agent.args('taxRate'),
      },
    },
  })
  .return(s.object({ total: s.number }))

const ast = calculateTotal.toJSON() // JSON-serializable AST
```

The Builder is lower-level but gives you full control over AST construction.

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
| **Expressions**  | ExprNode (`$expr`)                                                 | Safe expression evaluation via AST nodes (binary, unary, member, etc.).                                               |
| **Logic**        | `eq`, `gt`, `and`, `not`, ...                                      | Boolean logic.                                                                                                        |
| **IO**           | `httpFetch`                                                        | HTTP requests.                                                                                                        |
| **Store**        | `storeGet`, `storeSet`                                             | Key-Value storage.                                                                                                    |
| **AI**           | `llmPredict`, `agentRun`                                           | LLM calls and sub-agent recursion.                                                                                    |
| **Utils**        | `random`, `uuid`, `hash`                                           | Random generation, UUIDs, and hashing.                                                                                |
| **Optimization** | `memoize`, `cache`                                                 | In-memory memoization and persistent caching. Keys are optional and will be auto-generated if not provided.           |

## Expression Builtins

AsyncJS expressions have access to safe built-in objects:

| Builtin  | Description                                                                 |
| -------- | --------------------------------------------------------------------------- |
| `Math`   | All standard math functions (`abs`, `floor`, `sqrt`, `sin`, `random`, etc.) |
| `JSON`   | `parse()` and `stringify()`                                                 |
| `Array`  | `isArray()`, `from()`, `of()`                                               |
| `Object` | `keys()`, `values()`, `entries()`, `fromEntries()`, `assign()`              |
| `String` | `fromCharCode()`, `fromCodePoint()`                                         |
| `Number` | Constants and type checks (`MAX_VALUE`, `isNaN`, `isFinite`, etc.)          |
| `Set`    | Set-like operations with `add`, `remove`, `union`, `intersection`, `diff`   |
| `Date`   | Date factory with arithmetic and formatting                                 |
| `Schema` | Schema builder for structured LLM responses (see below)                     |
| `filter` | Schema-based data filtering                                                 |

### Schema Builder

The `Schema` builtin exposes [tosijs-schema](https://github.com/nicholascross/tosijs-schema)'s fluent API for building JSON Schemas. This is especially useful for LLM structured outputs.

```javascript
// Simple: build responseFormat from an example object
let schema = Schema.response('person', { name: '', age: 0 })

// With constraints: use the fluent API
let schema = Schema.response(
  'user',
  Schema.object({
    email: Schema.string.email,
    age: Schema.number.int.min(0).max(150).optional,
    role: Schema.enum(['admin', 'user', 'guest']),
  })
)
```

**Available methods:**

| Category        | Methods                                                                   |
| --------------- | ------------------------------------------------------------------------- |
| **Primitives**  | `string`, `number`, `integer`, `boolean`, `any`                           |
| **String**      | `.min(n)`, `.max(n)`, `.pattern(regex)`, `.email`, `.url`, `.uuid`        |
| **Number**      | `.min(n)`, `.max(n)`, `.step(n)`, `.int`                                  |
| **Combinators** | `array(items)`, `object(props)`, `record(value)`, `tuple(items)`          |
| **Union/Enum**  | `union([...])`, `enum([...])`, `const(value)`                             |
| **Metadata**    | `.title(s)`, `.describe(s)`, `.default(v)`, `.optional`                   |
| **Helpers**     | `response(name, schema)`, `fromExample(example)`, `isValid(data, schema)` |

## Capabilities & Security

tosijs-agent uses a **[Capability-Based Security](https://en.wikipedia.org/wiki/Capability-based_security)** model. The VM cannot access the network, file system, or database unless provided with a Capability.

**Zero Config Defaults:** The runtime provides sensible defaults for local development:

- `httpFetch` uses the global `fetch`.
- `store` uses an in-memory `Map` (ephemeral).
- `random`/`uuid` use `crypto` or `Math`.

In production, you should inject secure, instrumented, or cloud-native implementations (e.g., restricted fetch, Postgres, Redis).

### Execution Timeout

The VM enforces a hard timeout to prevent hung agents—safeguarding against code that effectively halts by waiting on slow or non-responsive IO.

- **Automatic Safety Net:** Defaults to `fuel × 10ms` (e.g., 1000 fuel ≈ 10s budget). _Note: For IO-heavy agents with low fuel costs, explicitly set `timeoutMs` to prevent premature timeouts._
- **Explicit Control:** Pass `timeoutMs` to enforce a strict Service Level Agreement (SLA).
- **Cancellation:** Pass an `AbortSignal` to integrate with external cancellation controllers (e.g., user cancellation buttons or HTTP request timeouts).

**Resource Cleanup:** When a timeout occurs, the VM passes the abort signal to the currently executing atom (via `ctx.signal`). Atoms implementing cancellation (like `httpFetch`) will abort their network requests immediately.

```typescript
// 1. Default Safety Net (good for compute-heavy logic)
await vm.run(ast, args, { fuel: 1000 })

// 2. SLA Enforcement: "This agent must finish in 5s or we drop it"
await vm.run(ast, args, { fuel: 5000, timeoutMs: 5000 })

// 3. User Cancellation: connect UI "Stop" button to the Agent
const controller = new AbortController()
stopButton.onClick(() => controller.abort())
await vm.run(ast, args, { signal: controller.signal })
```

**Fuel vs Timeout:** Fuel protects against CPU-bound abuse (tight loops). Timeout protects against IO-bound abuse (slow network calls). Together they ensure the VM cannot be held hostage.

### Cost Overrides

Default fuel costs are context-agnostic guesses. In production, you'll want to tune costs for your specific deployment—an LLM call to a local model vs OpenAI has very different resource implications.

```typescript
// Static overrides
await vm.run(ast, args, {
  fuel: 1000,
  costOverrides: {
    httpFetch: 50, // We pay per API request
    llmPredict: 500, // LLM calls are expensive
    storeGet: 0.5, // Redis is cheap
  },
})

// Dynamic overrides based on input
await vm.run(ast, args, {
  costOverrides: {
    llmPredict: (input) => (input.model?.includes('gpt-4') ? 1000 : 100),
    storeSet: (input) => JSON.stringify(input.value).length * 0.001,
  },
})
```

This lets operators tune fuel costs for their reality rather than relying on universal defaults.

### Request Context

For production deployments, you often need to pass request-scoped metadata (auth, permissions, request IDs) to atoms. The `context` option provides a clean mechanism for this.

```typescript
// Pass auth/permissions from your request handler
await vm.run(ast, args, {
  context: {
    userId: 'user-123',
    permissions: ['read:data', 'fetch:external'],
    requestId: crypto.randomUUID(),
  },
})
```

Atoms access context via `ctx.context`:

```typescript
const secureFetch = defineAtom(
  'secureFetch',
  s.object({ url: s.string }),
  s.any,
  async (input, ctx) => {
    const permissions = ctx.context?.permissions ?? []
    if (!permissions.includes('fetch:external')) {
      throw new Error('Not authorized for external fetch')
    }
    return ctx.capabilities.fetch(input.url)
  }
)
```

Use cases:

- **Authorization:** Check user permissions before executing sensitive operations
- **Multi-tenancy:** Route storage/database calls to tenant-specific resources
- **Audit logging:** Include request IDs in all log entries
- **Dynamic costs:** Combine with `costOverrides` for user-tier-based pricing

**Security Note:** The sandbox protects against malicious _agents_, not malicious _atom implementations_. Atoms are registered by the host and are trusted to be non-blocking and to respect `ctx.signal` for cancellation.

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

When you first import the `batteries` from `tosijs-agent`, the runtime performs a one-time audit of the models available on your LM Studio server. It automatically detects which models are for embeddings and which are for chat, and caches the results to avoid re-auditing during the same session.

This allows Agent99 to automatically select the correct models for different tasks without any configuration. The cache uses `localStorage` if available (in a browser environment), or a simple in-memory cache otherwise.

### 3. Usage

The `batteries` export contains the necessary capabilities. To use them, register the `batteryAtoms` with the `AgentVM` and pass the `batteries` object to the `run` method's capabilities.

> **Note on Breaking Change:** Previously, battery atoms were exported individually. They are now consolidated into a single `batteryAtoms` object. This simplifies registration with the `AgentVM`.
>
> **Old Way:**
>
> ```typescript
> import { AgentVM, batteries, storeVectorize, storeSearch } from 'tosijs-agent'
> const vm = new AgentVM({ storeVectorize, storeSearch, ... })
> ```
>
> **New Way:**
>
> ```typescript
> import { AgentVM, batteries, batteryAtoms } from 'tosijs-agent'
> const vm = new AgentVM(batteryAtoms)
> ```

```typescript
import { AgentVM, batteries, batteryAtoms, Agent } from 'tosijs-agent'

// Register the battery atoms
const vm = new AgentVM(batteryAtoms)

// The batteries are audited on import.
const logic = vm.Agent.storeVectorize({ text: 'Hello' }).as('vector')

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
const logic = vm.Agent.llmPredictBattery({
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
const myTools = vm.getTools(['httpFetch', 'template'])
```

## Implementing Real-World Atoms

To enable custom capabilities like Database Access or Web Scraping, you inject them into the `VM.run` call.

#### Example: Providing a Database

```typescript
import { AgentVM } from 'tosijs-agent'

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
import { defineAtom, AgentVM, s, Agent } from 'tosijs-agent'

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
// The `vm.Agent` property is the recommended way to get a builder
// that includes any custom atoms you have registered.
const builder = myVM.Agent

const logic = builder
  .scrape({ url: 'https://example.com' })
  .as('html')
  .return(s.object({ html: s.string }))
```

## Control Flow

Atoms like `if` and `while` evaluate expression strings. For security and predictability, these expressions are not granted access to the full agent state. Instead, you must use the `vars` parameter to explicitly pass in any state variables that the expression needs.

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
// Use ExprNode for arithmetic operations
chain.while('n > 0', { n: 'counter' }, (loop) =>
  loop.varSet({
    key: 'counter',
    value: {
      $expr: 'binary',
      op: '-',
      left: { $expr: 'ident', name: 'counter' },
      right: { $expr: 'literal', value: 1 },
    },
  })
)
```

### Try / Catch

```typescript
chain.try({
  try: (b) => b.httpFetch({ url: '...' }),
  catch: (b) => b.varSet({ key: 'error', value: 'failed' }),
})
```

## Editor Support

tosijs-agent includes syntax highlighting for AsyncJS (the JavaScript subset used by `ajs` template literals).

### Quick Install

```bash
# VS Code
npx ajs-install-vscode

# Cursor
npx ajs-install-cursor
```

Features:

- Syntax highlighting for `.ajs` files
- Embedded highlighting inside `ajs`...`` template literals
- Error highlighting for forbidden syntax (`new`, `class`, `async`, etc.)

### Web Editors

**Monaco:**

```typescript
import { registerAjsLanguage } from 'tosijs-agent/editors/monaco'
registerAjsLanguage(monaco)
```

**CodeMirror 6:**

```typescript
import { ajs } from 'tosijs-agent/editors/codemirror'
// Use ajs() in your extensions
```

### Tree-sitter Editors (Zed, Nova, Helix)

Associate `.ajs` files with JavaScript syntax in your editor config. See [editors/README.md](./editors/README.md) for details.

> **Note:** If you modify AsyncJS syntax (e.g., adding/removing forbidden keywords), update the grammar files in `editors/` to match. See [editors/README.md](./editors/README.md) for grammar locations.

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
