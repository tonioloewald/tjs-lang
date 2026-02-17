# tjs-lang Documentation

**tjs-lang** is a type-safe virtual machine (~33KB) for safe execution of untrusted code
in any JavaScript environment. It compiles logic chains and AI agents to JSON-serializable
ASTs that run sandboxed with fuel (gas) limits.

**Try it live:** [TJS Playground](https://tjs-platform.web.app)

## Language Guides

| Guide | Description |
|-------|-------------|
| [TJS Language Guide](../DOCS-TJS.md) | Complete TJS language reference |
| [AJS Runtime Guide](../DOCS-AJS.md) | Agent language and VM documentation |
| [TJS for TypeScript Developers](../TJS-FOR-TS.md) | Coming from TypeScript? Start here |
| [TJS for JavaScript Developers](../TJS-FOR-JS.md) | Coming from JavaScript? Start here |

## Architecture & Design

| Document | Description |
|----------|-------------|
| [Technical Context](../CONTEXT.md) | Architecture deep dive, design decisions |
| [Design Patterns](../guides/patterns.md) | Common patterns in TJS and AJS |
| [Schema Validation](../guides/tosijs-schema.md) | Working with tosijs-schema |

## Examples

Interactive examples are available in the [TJS Playground](https://tjs-platform.web.app).

Source code for all examples lives in [`guides/examples/`](../guides/examples/):

- **TJS examples** — [`guides/examples/tjs/`](../guides/examples/tjs/) (type annotations, classes, WASM, etc.)
- **AJS examples** — [`guides/examples/ajs/`](../guides/examples/ajs/) (agents, LLM, APIs, etc.)

Key examples:

| Example | Description |
|---------|-------------|
| [TJS Grammar Reference](../guides/examples/tjs/tjs-grammar-demo.md) | Comprehensive TJS feature demo |
| [Hello TJS](../guides/examples/tjs/hello-tjs.md) | Getting started with TJS |
| [Full-Stack Demo](../guides/examples/tjs/full-stack-demo-user-service.md) | User service with runtime validation |
| [WASM Starfield](../guides/examples/tjs/wasm-starfield.md) | SIMD-accelerated particle system with mouse steering |
| [WASM Vector Search](../guides/examples/tjs/wasm-vector-search.md) | SIMD cosine similarity benchmark vs JS scalar |

## Additional Resources

| Resource | Description |
|----------|-------------|
| [Roadmap](../PLAN.md) | Project roadmap and planned features |
| [TODO](../TODO.md) | Current task list |
| [Benchmarks](../guides/benchmarks.md) | Performance benchmarks |
| [CLAUDE.md](../CLAUDE.md) | AI assistant instructions for this codebase |

## npm Package

```bash
npm install tjs-lang
```

```typescript
import { Agent, AgentVM, ajs, tjs } from 'tjs-lang'
```

See the [main README](../README.md) for installation and quick start.
