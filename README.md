<!--{"section": "home", "order": 0, "navTitle": "Home"}-->

# TJS Platform

![tjs-lang logo](/tjs-lang.svg)

[playground](https://tjs-platform.web.app) | [github](https://github.com/tonioloewald/tjs-lang#readme) | [npm](https://www.npmjs.com/package/tjs-lang) | [discord](https://discord.gg/ramJ9rgky5)

## The Problem

**TypeScript is fragile.** It pretends to be a superset of JavaScript, but it isn't. It pretends to be typesafe, but it isn't. Its Turing-complete type system is harder to reason about than the code it supposedly documents—and then it all disappears at runtime.

> TypeScript is also difficult to transpile. Your browser can run full virtual machines in JavaScript, but most TypeScript playgrounds either fake it by stripping type declarations or use a server backend to do the real work.

**JavaScript is dangerous.** `eval()` and `Function()` are so powerful they're forbidden almost everywhere—blocked by CSP in most production environments. The industry's answer? The **Container Fallacy**: wrap every function in a 200MB Linux container just to run it safely. We ship buildings to deliver letters.

**Security is a mess.** Every layer validates. Gateway validates. Auth validates. Business logic validates. Database validates. We spend 90% of our time building pipelines to move data to code, re-checking it at every hop.

## What If?

What if your language were:

- **Honest** — types that actually exist at runtime, not fiction that evaporates
- **Safe** — a gas-metered VM where infinite loops are impossible, no container required
- **Mobile** — logic that travels to data, not oceans of data dragged to logic
- **Unified** — one source of truth, not TypeScript interfaces _plus_ Zod schemas _plus_ JSDoc

That's what TJS Platform provides: **TJS** for writing your infrastructure, and **AJS** for shipping logic that runs anywhere.

## TJS — Types That Survive

Write typed JavaScript where the type _is_ an example. No split-brain validation.

```typescript
// TJS: The type is an example AND a test
function greet(name: 'World') -> 'Hello, World!' {
  return `Hello, ${name}!`
}
// At transpile time: greet('World') is called and checked against 'Hello, World!'

// Runtime: The type becomes a contract
console.log(greet.__tjs.params)  // { name: { type: 'string', example: 'World', required: true } }

// Safety: Errors are values, not crashes
const result = greet(123)        // MonadicError: Expected string for 'greet.name', got number
```

**Why it matters:**

- **One source of truth** — no more TS interfaces + Zod schemas + JSDoc comments
- **Types as examples** — `name: 'Alice'` means "required string, like 'Alice'"
- **Runtime metadata** — `__tjs` enables reflection, autocomplete, documentation from live objects
- **Monadic errors** — type failures return values, never throw
- **Zero build step** — transpiles in the browser, no webpack/Vite/Babel
- **The compiler _is_ the client** — TJS transpiles itself _and_ TypeScript entirely client-side

## AJS — Code That Travels

Write logic that compiles to JSON and runs in a gas-limited sandbox. Send agents to data instead of shipping data to code.

```typescript
const agent = ajs`
  function research(topic: 'AI') {
    let data = httpFetch({ url: '/search?q=' + topic })
    let summary = llmPredict({ prompt: 'Summarize: ' + data })
    return { topic, summary }
  }
`

// Run it safely—no Docker required
const result = await vm.run(
  agent,
  { topic: 'Agents' },
  {
    fuel: 500, // Strict CPU budget
    capabilities: { fetch: http }, // Allow ONLY http, block everything else
  }
)
```

**Why it matters:**

- **Safe eval** — run untrusted code without containers
- **Code is JSON** — store in databases, diff, version, transmit
- **Fuel metering** — every operation costs gas, infinite loops impossible
- **Capability-based** — zero I/O by default, grant only what's needed
- **LLM-native** — simple enough for small models to generate correctly

## The Architecture Shift

**Old way (data-to-code):**
Client requests data → Server fetches 100 rows → Server filters to 5 → Client receives 5.
_High latency. High bandwidth. Validate at every layer._

**TJS way (code-to-data):**
Client sends agent → Edge runs agent at data → Edge returns 5 rows.
_Low latency. Zero waste. Validate once._

The agent carries its own validation. The server grants capabilities. Caching happens automatically because the query _is_ the code.

## Safe Eval

The holy grail: `eval()` that's actually safe.

```typescript
import { Eval } from 'tjs-lang/eval'

// Whitelist-wrapped fetch - untrusted code only reaches your domains
const safeFetch = (url: string) => {
  const allowed = ['api.example.com', 'cdn.example.com']
  const host = new URL(url).host
  if (!allowed.includes(host)) {
    return { error: 'Domain not allowed' }
  }
  return fetch(url)
}

const { result, fuelUsed } = await Eval({
  code: `
    let data = fetch('https://api.example.com/products')
    return data.filter(x => x.price < budget)
  `,
  context: { budget: 100 },
  fuel: 1000,
  capabilities: { fetch: safeFetch }, // Only whitelisted domains
})
```

The untrusted code thinks it has `fetch`, but it only has _your_ `fetch`. No CSP violations. No infinite loops. No access to anything you didn't explicitly grant.

## Quick Start

```bash
npm install tjs-lang
```

### Run an Agent

```typescript
import { ajs, AgentVM } from 'tjs-lang'

const agent = ajs`
  function double(value: 21) {
    return { result: value * 2 }
  }
`

const vm = new AgentVM()
const { result } = await vm.run(agent, { value: 21 })
console.log(result) // { result: 42 }
```

### Write Typed Code

```typescript
import { tjs } from 'tjs-lang'

const { code, metadata } = tjs`
  function add(a: 0, b: 0) -> 0 {
    return a + b
  }
`
// code: JavaScript with __tjs metadata attached
// metadata: { add: { params: { a: { type: 'number', example: 0 }, b: { type: 'number', example: 0 } }, returns: { type: 'number' } } }
```

### Try the Playground

Since TJS compiles itself, the playground is the full engine running entirely in your browser.

**[tjs-platform.web.app](https://tjs-platform.web.app)**

## At a Glance

|                 | TJS                              | AJS               |
| --------------- | -------------------------------- | ----------------- |
| **Purpose**     | Write your platform              | Write your agents |
| **Trust level** | Your code                        | Anyone's code     |
| **Compiles to** | JavaScript + metadata            | JSON AST          |
| **Runs in**     | Browser, Node, Bun               | Sandboxed VM      |
| **Types**       | Examples → runtime validation    | Schemas for I/O   |
| **Errors**      | Monadic (values, not exceptions) | Monadic           |
| **Build step**  | None                             | None              |

## Bundle Size

The cost of "safe eval"—compare to a 200MB Docker image:

| Bundle                    | Size   | Gzipped   |
| ------------------------- | ------ | --------- |
| VM only                   | 42 KB  | **14 KB** |
| + Batteries (LLM, vector) | 56 KB  | 19 KB     |
| + Transpiler              | 89 KB  | 27 KB     |
| Full (with TS support)    | 180 KB | 56 KB     |

**Dependencies:** `acorn` (JS parser), `tosijs-schema` (validation). Both have zero transitive dependencies.

## Documentation

- **[TJS Language Guide](DOCS-TJS.md)** — Types, syntax, runtime
- **[AJS Runtime Guide](DOCS-AJS.md)** — VM, atoms, capabilities
- **[Architecture Deep Dive](CONTEXT.md)** — How it all fits together
- **[Playground](https://tjs-platform.web.app)** — Try it now

## Installation

```bash
# npm
npm install tjs-lang

# bun
bun add tjs-lang

# pnpm
pnpm add tjs-lang
```

## License

Apache 2.0
