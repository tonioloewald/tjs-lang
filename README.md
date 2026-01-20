<!--{"section": "home", "order": 0, "navTitle": "Home"}-->

# tosijs-agent

![tosjijs-agent logo](/tosijs-agent.svg)

[github](https://github.com/tonioloewald/tosijs-agent#readme) | [npm](https://www.npmjs.com/package/tosijs-agent) | [discord](https://discord.gg/ramJ9rgky5)

---

## The Problem

JavaScript is too **fragile** for agents—types evaporate at runtime, leaving you with `undefined is not a function` in production.

JavaScript is too **dangerous** to run remotely—no sandbox, no resource limits, one infinite loop and your server hangs forever.

---

## The Solution

### TJS — The Language

Write your infrastructure. Typed JavaScript with zero build step, runtime metadata, and monadic errors.

```typescript
// Types are examples, not annotations
function greet(name: 'World') -> '' {
  return `Hello, ${name}!`
}

// Types survive to runtime
console.log(greet.__tjs.params)  // { name: { type: 'string' } }

// Errors are values, not exceptions
const result = greet(123)        // { $error: true, message: 'Invalid input' }
```

- **Types as examples** — `name: 'Alice'` means "name is a string like 'Alice'"
- **Zero build step** — Transpiles in the browser, no webpack/Vite/Babel
- **Runtime metadata** — `__tjs` enables autocomplete from live objects
- **Monadic errors** — Type failures return error objects, not exceptions
- **TS compatible** — Convert existing TypeScript with `tjs convert`

**→ [TJS Documentation](DOCS-TJS.md)**

---

### AJS — The Payload

Write your mobile logic. A JS subset that compiles to JSON AST and runs in a gas-limited sandbox.

```typescript
const agent = ajs`
  function searchAndSummarize({ query }) {
    let results = httpFetch({ url: 'https://api.example.com/search?q=' + query })
    let summary = llmPredict({ prompt: 'Summarize: ' + results })
    return { query, summary }
  }
`

// Run with resource limits
const result = await vm.run(agent, { query: 'climate change' }, {
  fuel: 1000,      // CPU budget
  timeoutMs: 5000  // Wall-clock limit
})
```

- **Code is JSON** — Store agents in databases, diff them, version them
- **Fuel metering** — Every operation costs gas, loops can't run forever
- **Capability-based** — Zero I/O by default, grant only what's needed
- **LLM-friendly** — Simple enough for 4B parameter models to generate

**→ [AJS Documentation](DOCS-AJS.md)**

---

## Why?

| You are a... | You want... | Read this |
|--------------|-------------|-----------|
| **Builder** | Speed. No build tools, instant deploys, types without ceremony. | [Builder's Manifesto](MANIFESTO-BUILDER.md) |
| **CTO** | Safety. Sandboxed execution, audit trails, resource limits. | [Enterprise Guide](MANIFESTO-ENTERPRISE.md) |

---

## Quick Start

```bash
npm install tosijs-agent
```

### Run an Agent (AJS)

```typescript
import { ajs, AgentVM } from 'tosijs-agent'

const agent = ajs`
  function double({ value }) {
    return { result: value * 2 }
  }
`

const vm = new AgentVM()
const { result } = await vm.run(agent, { value: 21 })
console.log(result)  // { result: 42 }
```

### Write Typed Code (TJS)

```typescript
import { tjs } from 'tosijs-agent'

const code = tjs`
  function add(a: 0, b: 0) -> 0 {
    return a + b
  }
`

// Transpiles to JavaScript with __tjs metadata
```

### Try the Playground

No install needed: **[Open Playground](demo/)**

---

## At a Glance

|  | TJS | AJS |
|--|-----|-----|
| **Purpose** | Write your platform | Write your agents |
| **Trust level** | Trusted code you control | Untrusted code from anywhere |
| **Compiles to** | JavaScript + metadata | JSON AST |
| **Runs in** | Browser, Node, anywhere | Sandboxed VM |
| **Types** | Examples that validate | Schemas for I/O |
| **Errors** | Monadic (values) | Monadic (values) |
| **Build step** | None (browser) | None (template literal) |

---

## Links

- [TJS Documentation](DOCS-TJS.md) — Language reference
- [AJS Documentation](DOCS-AJS.md) — Agent runtime reference
- [Builder's Manifesto](MANIFESTO-BUILDER.md) — Why it's fun
- [Enterprise Guide](MANIFESTO-ENTERPRISE.md) — Why it's safe
- [Technical Context](CONTEXT.md) — Architecture deep dive
- [Playground](demo/) — Try it now

---

## Installation

```bash
# npm
npm install tosijs-agent

# bun
bun add tosijs-agent

# pnpm
pnpm add tosijs-agent
```

---

## Bundle Size

### AJS Runtime
~33KB gzipped with dependencies. ~17KB for expression-only evaluation.

**Dependencies:** `acorn` (JS parser), `tosijs-schema` (validation). Both have zero transitive dependencies.

### TJS Compiler
The TJS transpiler is larger (~400KB) as it includes a full parser and emitter. However:
- It runs entirely in the browser — no build server needed
- It's loaded on-demand, not bundled into your app
- Your shipped code is just the transpiled JavaScript

TJS is experimental but surprisingly complete. The playground demonstrates the full feature set running client-side.
