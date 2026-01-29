<!--{"section": "home", "order": 0, "navTitle": "Home"}-->

# TJS Platform

![tjs-lang logo](/tjs-lang.svg)

[playground](https://tjs-platform.web.app) | [github](https://github.com/tonioloewald/tjs-lang#readme) | [npm](https://www.npmjs.com/package/tjs-lang) | [discord](https://discord.gg/ramJ9rgky5)

## The Problem

**TypeScript is fragile.** It pretends to be a superset of JavaScript, but it isn't. It pretends to be typesafe, but it isn't. Its Turing-complete type system is harder to reason about than the code it supposedly documents—and then it all disappears at runtime.

> TypeScript is also difficult to transpile. Your browser can run full virtual machines in JavaScript, but most TypeScript playgrounds either fake it by stripping type declarations or use a server backend to do the real work.

**JavaScript is dangerous but forgiving.** These are virtues in a web page, but liabilities in a web **app**. JavaScript promises and delivers most of the power of Lisp in a simple, popular syntax. But in practice, `eval()` and `Function()` are so dangerous they're forbidden almost everywhere—blocked completely by CSP in most production environments.

**Security is hard.** Every layer of your stack needs to verify it's doing what it's supposed to, revealing only what it's allowed to. Every layer solves problems of routing, caching, minimizing bandwidth, and managing security. It's all work that shouldn't need to be done.

## What If?

What if your language were:

- **As safe as TypeScript pretends to be** — types that actually validate at runtime
- **More powerful than JavaScript promises** — safe eval, sandboxed execution, full introspection (shhh... it's a real Lisp)
- **Architecture that collapses layers** — handle caching and shape responses at the data center
- **Deploy logic, not code** — change queries without touching your security model

That's what TJS Platform provides: **TJS** for writing your infrastructure, and **AJS** for shipping logic that runs anywhere.

## TJS — Types That Survive

Write typed JavaScript that validates at runtime. No build step. No ceremony.

```typescript
// Types are examples, not annotations
function greet(name: 'World') -> '' {
  return `Hello, ${name}!`
}

// Types survive to runtime
console.log(greet.__tjs.params)  // { name: { type: 'string' } }

// Errors are values, not exceptions
const result = greet(123)        // { $error: true, message: 'type mismatch' }
```

**Why it matters:**
- **Types as examples** — `name: 'Alice'` means "required string, like 'Alice'"
- **Runtime metadata** — `__tjs` enables reflection, autocomplete, documentation
- **Monadic errors** — type failures return values, never throw
- **Zero build step** — transpiles in the browser, no webpack/Vite/Babel
- **TS compatible** — convert existing TypeScript with `tjs convert`
- **Full browser transpilation** — TJS transpiles itself *and* TypeScript entirely client-side

## AJS — Code That Travels

Write logic that compiles to JSON and runs in a gas-limited sandbox. Send agents to data instead of shipping data to code.

```typescript
const agent = ajs`
  function searchAndSummarize(query: 'climate change') {
    let results = httpFetch({ url: 'https://api.example.com/search?q=' + query })
    let summary = llmPredict({ prompt: 'Summarize: ' + results })
    return { query, summary }
  }
`

// Run with resource limits
const result = await vm.run(agent, { query: 'climate change' }, {
  fuel: 1000,      // CPU budget—loops can't run forever
  timeoutMs: 5000  // Wall-clock limit
})
```

**Why it matters:**
- **Code is JSON** — store in databases, diff, version, transmit
- **Fuel metering** — every operation costs gas, infinite loops impossible
- **Capability-based** — zero I/O by default, grant only what's needed
- **LLM-friendly** — simple enough for small models to generate correctly

## The Architecture Shift

Traditional architectures shuttle data between layers, validating at every boundary:

```
Client → API Gateway → Auth → Business Logic → Database
         ↓              ↓           ↓              ↓
      validate      validate    validate       validate
```

With AJS, logic travels to data:

```
Client → Edge (validate once) → Agent runs at data
```

The agent carries its own validation. The server grants capabilities. Caching happens automatically because the query *is* the code.

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
console.log(result)  // { result: 42 }
```

### Write Typed Code

```typescript
import { tjs } from 'tjs-lang'

const { code, types } = tjs`
  function add(a: 0, b: 0) -> 0 {
    return a + b
  }
`
// code: JavaScript with __tjs metadata
// types: { add: { params: {...}, returns: {...} } }
```

### Try the Playground

No install needed: **[tjs-platform.web.app](https://tjs-platform.web.app)**

## At a Glance

|  | TJS | AJS |
|--|-----|-----|
| **Purpose** | Write your platform | Write your agents |
| **Trust level** | Your code | Anyone's code |
| **Compiles to** | JavaScript + metadata | JSON AST |
| **Runs in** | Browser, Node, Bun | Sandboxed VM |
| **Types** | Examples → runtime validation | Schemas for I/O |
| **Errors** | Monadic (values, not exceptions) | Monadic |
| **Build step** | None | None |

## Bundle Size

| Bundle | Size | Gzipped |
|--------|------|---------|
| VM only | 42 KB | 14 KB |
| + Batteries (LLM, vector) | 56 KB | 19 KB |
| + Transpiler | 89 KB | 27 KB |
| Full (with TS support) | 180 KB | 56 KB |

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

MIT
