# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**tosijs-agent** is a type-safe virtual machine (~33KB) for safe execution of untrusted code in any JavaScript environment. It compiles logic chains and AI agents to JSON-serializable ASTs that run sandboxed with fuel (gas) limits.

Key concept: Code travels to data (rather than shipping data to code). Agents are defined as data, not deployed code.

## Common Commands

```bash
# Development
npm run format              # ESLint fix + Prettier
npm run test:fast           # Core tests (skips LLM & benchmarks)
npm run make                # Full build (clean, format, grammars, tsc, esbuild)
npm run dev                 # Development server with file watcher

# Testing
bun test                    # Full test suite
bun test src/path/to/file.test.ts  # Single test file
SKIP_LLM_TESTS=1 bun test   # Skip LLM integration tests
bun test --coverage         # With coverage report

# Other
npm run test:llm            # LM Studio integration tests
npm run bench               # Vector search benchmarks
npm run show-size           # Show gzipped bundle size
```

## Architecture

### Two-Layer Design

1. **Builder Layer** (`src/builder.ts`): Fluent API that constructs AST nodes. Contains no execution logic.
2. **Runtime Layer** (`src/vm/runtime.ts`): Executes AST nodes. Contains all atom implementations (~2700 lines, security-critical).

### Key Source Files

- `src/index.ts` - Main entry, re-exports everything
- `src/vm/runtime.ts` - All atom implementations, expression evaluation, fuel charging
- `src/vm/vm.ts` - AgentVM class (~226 lines)
- `src/builder.ts` - TypedBuilder fluent API (~19KB)
- `src/lang/` - AsyncJS/TJS transpiler (parser, emitters, type inference)
- `src/batteries/` - LM Studio integration (LLM, vector search)
- `src/use-cases/` - Integration tests and real-world examples (27 test files)

### Core APIs

```typescript
// Language
ajs`...`                    // Parse AsyncJS to AST
tjs`...`                    // Parse TypeScript variant with type metadata
transpile(source, options)  // Full transpilation with signature extraction
createAgent(source, vm)     // Creates callable agent

// VM
const vm = new AgentVM(customAtoms)
await vm.run(ast, args, { fuel, capabilities, timeoutMs, trace })

// Builder
Agent.take(schema).varSet(...).httpFetch(...).return(schema)
vm.Agent  // Builder with custom atoms included
```

### Security Model

- **Capability-based**: VM has zero IO by default; inject `fetch`, `store`, `llm` via capabilities
- **Fuel metering**: Every atom has a cost; execution stops when fuel exhausted
- **Timeout enforcement**: Default `fuel × 10ms`; explicit `timeoutMs` overrides
- **Monadic errors**: Errors wrapped in `AgentError`, not thrown (prevents exception exploits)
- **Expression sandboxing**: ExprNode AST evaluation, blocked prototype access

### Expression Evaluation

Expressions use AST nodes (`$expr`), not strings:
```typescript
{ $expr: 'binary', op: '+', left: {...}, right: {...} }
{ $expr: 'ident', name: 'varName' }
{ $expr: 'member', object: {...}, property: 'foo' }
```

Each node costs 0.01 fuel. Forbidden: function calls, `new`, `this`, `__proto__`, `constructor`.

## Testing Strategy

- Unit tests alongside source files (`*.test.ts`)
- Integration tests in `src/use-cases/` (RAG, orchestration, malicious actors)
- Security tests in `src/use-cases/malicious-actor.test.ts`
- Language tests in `src/lang/lang.test.ts` (~46KB comprehensive)

Coverage targets: 98% lines on `src/vm/runtime.ts` (security-critical), 80%+ overall.

## Key Patterns

### Adding a New Atom

1. Define with `defineAtom(opCode, inputSchema, outputSchema, implementation, { cost })`
2. Add to `src/vm/atoms/` and export from `src/vm/atoms/index.ts`
3. Add tests
4. Run `npm run test:fast`

### Debugging Agents

Enable tracing: `vm.run(ast, args, { trace: true })` returns `TraceEvent[]` with execution path, fuel consumption, and state changes.

### Custom Atoms Must

- Be non-blocking (no synchronous CPU-heavy work)
- Respect `ctx.signal` for cancellation
- Access IO only via `ctx.capabilities`

## Dependencies

Runtime (shipped): `acorn` (JS parser, ~30KB), `tosijs-schema` (validation, ~5KB). Both have zero transitive dependencies.
