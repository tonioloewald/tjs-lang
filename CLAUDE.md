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
bun test --test-name-pattern "pattern"  # Run tests matching pattern
SKIP_LLM_TESTS=1 bun test   # Skip LLM integration tests
bun test --coverage         # With coverage report

# CLI tools
bun src/cli/tjs.ts check <file>   # Parse and type check TJS file
bun src/cli/tjs.ts run <file>     # Transpile and execute
bun src/cli/tjs.ts types <file>   # Output type metadata as JSON
bun src/cli/tjs.ts emit <file>    # Output transpiled JavaScript

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
- `src/vm/runtime.ts` - All atom implementations, expression evaluation, fuel charging (~2900 lines, security-critical)
- `src/vm/vm.ts` - AgentVM class (~226 lines)
- `src/vm/atoms/batteries.ts` - Battery atoms (vector search, LLM, store operations)
- `src/builder.ts` - TypedBuilder fluent API (~19KB)
- `src/lang/parser.ts` - TJS parser with colon shorthand, unsafe markers, return type extraction
- `src/lang/emitters/ast.ts` - Emits Agent99 AST from parsed source
- `src/lang/emitters/js.ts` - Emits JavaScript with `__tjs` metadata
- `src/lang/inference.ts` - Type inference from example values
- `src/batteries/` - LM Studio integration (lazy init, model audit, vector search)
- `src/use-cases/` - Integration tests and real-world examples (27 test files)
- `src/cli/tjs.ts` - CLI tool for check/run/types/emit commands

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

1. Define with `defineAtom(opCode, inputSchema, outputSchema, implementation, { cost, timeoutMs, docs })`
2. Add to `src/vm/atoms/` and export from `src/vm/atoms/index.ts`
3. Add tests
4. Run `npm run test:fast`

**Atom implementation notes:**

- `cost` can be static number or dynamic: `(input, ctx) => number`
- `timeoutMs` defaults to 1000ms; use `0` for no timeout (e.g., `seq`)
- Atoms are always async; fuel deduction is automatic in the `exec` wrapper

### Debugging Agents

Enable tracing: `vm.run(ast, args, { trace: true })` returns `TraceEvent[]` with execution path, fuel consumption, and state changes.

### Custom Atoms Must

- Be non-blocking (no synchronous CPU-heavy work)
- Respect `ctx.signal` for cancellation
- Access IO only via `ctx.capabilities`

### Value Resolution

The `resolveValue()` function handles multiple input patterns:

- `{ $kind: 'arg', path: 'varName' }` → lookup in `ctx.args`
- `{ $expr: ... }` → evaluate ExprNode via `evaluateExpr()`
- String with dots `'obj.foo.bar'` → traverse state with forbidden property checks
- Bare strings → lookup in state, else return literal

### Monadic Error Flow

When `ctx.error` is set, subsequent atoms in a `seq` skip execution. Errors are wrapped in `AgentError`, not thrown. This prevents exception-based exploits.

### TJS Parser Syntax Extensions

- Colon shorthand: `function foo(x: 'type')` → parameter with type annotation
- Unsafe marker: `function foo(!) { }` → skips runtime validation
- Return type: `function foo() -> { result: 'string' } { }` → extracted return schema

## Dependencies

Runtime (shipped): `acorn` (JS parser, ~30KB), `tosijs-schema` (validation, ~5KB). Both have zero transitive dependencies.

## Forbidden Properties (Security)

The following property names are blocked in expression evaluation to prevent prototype pollution:

- `__proto__`, `constructor`, `prototype`

These are hardcoded in `runtime.ts` and checked during member access in `evaluateExpr()`.

## Batteries System

The batteries (`src/batteries/`) provide zero-config local AI development:

- **Lazy initialization**: First import audits LM Studio models (cached 24 hours)
- **HTTPS detection**: Blocks local LLM calls from HTTPS contexts (security)
- **Capabilities interface**: `fetch`, `store` (KV + vector), `llmBattery` (predict/embed)

Register battery atoms: `new AgentVM(batteryAtoms)` then pass `{ capabilities: batteries }` to `run()`.
