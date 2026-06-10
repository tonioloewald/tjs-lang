# tjs-lang Documentation

**tjs-lang** is a type-safe virtual machine (~33KB) for safe execution of untrusted code
in any JavaScript environment. It compiles logic chains and AI agents to JSON-serializable
ASTs that run sandboxed with fuel (gas) limits.

**Try it live:** [TJS Playground](https://tjs-platform.web.app)

## Language Guides

| Guide | Description |
|-------|-------------|
| [TJS Language Guide](https://github.com/tonioloewald/tjs-lang/blob/main/DOCS-TJS.md) | Complete TJS language reference |
| [AJS Runtime Guide](https://github.com/tonioloewald/tjs-lang/blob/main/DOCS-AJS.md) | Agent language and VM documentation |
| [TJS for TypeScript Developers](https://github.com/tonioloewald/tjs-lang/blob/main/TJS-FOR-TS.md) | Coming from TypeScript? Start here |
| [TJS for JavaScript Developers](https://github.com/tonioloewald/tjs-lang/blob/main/TJS-FOR-JS.md) | Coming from JavaScript? Start here |

## Architecture & Design

| Document | Description |
|----------|-------------|
| [Technical Context](https://github.com/tonioloewald/tjs-lang/blob/main/CONTEXT.md) | Architecture deep dive, design decisions |
| [WASM Quick Start](https://github.com/tonioloewald/tjs-lang/blob/main/docs/WASM-QUICKSTART.md) | Build WASM-accelerated libraries with zero toolchain setup |
| [Design Patterns](https://github.com/tonioloewald/tjs-lang/blob/main/guides/patterns.md) | Common patterns in TJS and AJS |
| [Schema Validation](https://github.com/tonioloewald/tjs-lang/blob/main/guides/tosijs-schema.md) | Working with tosijs-schema |
| [LM Studio Setup](https://github.com/tonioloewald/tjs-lang/blob/main/docs/lm-studio-setup.md) | Running the LLM test suite locally — install, model loading, leaked-VRAM/CORS gotchas |

## Examples

Interactive examples are available in the [TJS Playground](https://tjs-platform.web.app).

Source code for all examples lives in [`guides/examples/`](https://github.com/tonioloewald/tjs-lang/tree/main/guides/examples):

- **TJS examples** — [`guides/examples/tjs/`](https://github.com/tonioloewald/tjs-lang/tree/main/guides/examples/tjs) (type annotations, classes, WASM, etc.)
- **AJS examples** — [`guides/examples/ajs/`](https://github.com/tonioloewald/tjs-lang/tree/main/guides/examples/ajs) (agents, LLM, APIs, etc.)

Key examples:

| Example | Description |
|---------|-------------|
| [TJS Grammar Reference](https://github.com/tonioloewald/tjs-lang/blob/main/guides/examples/tjs/tjs-grammar-demo.md) | Comprehensive TJS feature demo |
| [Hello TJS](https://github.com/tonioloewald/tjs-lang/blob/main/guides/examples/tjs/hello-tjs.md) | Getting started with TJS |
| [Full-Stack Demo](https://github.com/tonioloewald/tjs-lang/blob/main/guides/examples/tjs/full-stack-demo-user-service.md) | User service with runtime validation |
| [WASM Starfield](https://github.com/tonioloewald/tjs-lang/blob/main/guides/examples/tjs/wasm-starfield.md) | SIMD-accelerated particle system with mouse steering |
| [WASM Vector Search](https://github.com/tonioloewald/tjs-lang/blob/main/guides/examples/tjs/wasm-vector-search.md) | SIMD cosine similarity benchmark vs JS scalar |

## Additional Resources

| Resource | Description |
|----------|-------------|
| [Roadmap](https://github.com/tonioloewald/tjs-lang/blob/main/PLAN.md) | Project roadmap and planned features |
| [TODO](https://github.com/tonioloewald/tjs-lang/blob/main/TODO.md) | Current task list |
| [Benchmarks](https://github.com/tonioloewald/tjs-lang/blob/main/guides/benchmarks.md) | Performance benchmarks |
| [CLAUDE.md](https://github.com/tonioloewald/tjs-lang/blob/main/CLAUDE.md) | AI assistant instructions for this codebase |

## npm Package

```bash
npm install tjs-lang
```

```typescript
import { Agent, AgentVM, ajs, tjs } from 'tjs-lang'
```

See the [main README](https://github.com/tonioloewald/tjs-lang#readme) for installation and quick start.
