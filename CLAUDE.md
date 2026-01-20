# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**tosijs-agent** is a type-safe virtual machine (~33KB) for safe execution of untrusted code in any JavaScript environment. It compiles logic chains and AI agents to JSON-serializable ASTs that run sandboxed with fuel (gas) limits.

**Key insight**: Code travels to data (rather than shipping data to code). Agents are defined as data, not deployed code.

**Two languages**:
- **AJS** (`.ajs`): JavaScript subset for agent logic, compiles to secure JSON AST
- **TJS** (`.tjs`): Typed JavaScript where types are example values with runtime metadata

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
bun src/cli/tjs.ts convert <file> # Convert TypeScript to TJS

# Other
npm run test:llm            # LM Studio integration tests
npm run bench               # Vector search benchmarks
npm run show-size           # Show gzipped bundle size
```

## Architecture

### Two-Layer Design

1. **Builder Layer** (`src/builder.ts`): Fluent API that constructs AST nodes. Contains no execution logic.
2. **Runtime Layer** (`src/vm/runtime.ts`): Executes AST nodes. Contains all atom implementations (~2900 lines, security-critical).

### Key Source Files

| File | Purpose |
|------|---------|
| `src/vm/runtime.ts` | All atom implementations, expression evaluation, fuel charging (security-critical, target 98% coverage) |
| `src/vm/vm.ts` | AgentVM class entry point |
| `src/builder.ts` | TypedBuilder fluent API |
| `src/lang/parser.ts` | TJS parser with colon shorthand, unsafe markers, return types |
| `src/lang/emitters/ast.ts` | Emits Agent99 AST from parsed source |
| `src/lang/emitters/js.ts` | Emits JavaScript with `__tjs` metadata |
| `src/lang/emitters/from-ts.ts` | TypeScript to TJS/JS transpiler |
| `src/lang/runtime.ts` | TJS runtime (monadic errors, type checking, wrapClass) |
| `src/lang/linter.ts` | Static analysis (unused vars, unreachable code, no-explicit-new) |
| `src/lang/inference.ts` | Type inference from example values |
| `src/types/Type.ts` | Runtime type validation with `Type()` builtin |
| `src/batteries/` | LM Studio integration (lazy init, model audit, vector search) |
| `src/cli/tjs.ts` | CLI tool for check/run/types/emit/convert commands |

### Core APIs

```typescript
// Language
ajs`...`                    // Parse AJS to AST
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

## Security Model

- **Capability-based**: VM has zero IO by default; inject `fetch`, `store`, `llm` via capabilities
- **Fuel metering**: Every atom has a cost; execution stops when fuel exhausted
- **Timeout enforcement**: Default `fuel × 10ms`; explicit `timeoutMs` overrides
- **Monadic errors**: Errors wrapped in `AgentError`, not thrown (prevents exception exploits)
- **Expression sandboxing**: ExprNode AST evaluation, blocked prototype access
- **Forbidden properties**: `__proto__`, `constructor`, `prototype` blocked in member access

## TJS Syntax Extensions

TJS extends JavaScript with type annotations that survive to runtime.

### Types by Example

```typescript
// Required param with example (colon = required)
function greet(name: 'Alice') { }        // name is required string

// Optional param with default (equals = optional)
function greet(name = 'Alice') { }       // name is optional, defaults to 'Alice'

// Object parameter shape
function createUser(user: { name: '', age: 0 }) { }

// Union types (use || not |)
function find(id: 0 || null) { }         // number or null

// Return type annotation
function add(a: 0, b: 0) -> 0 { return a + b }
```

### Safety Markers

```typescript
// Unsafe function (skips runtime validation) - use (!) after opening paren
function fastAdd(! a: 0, b: 0) { return a + b }

// Safe function (explicit validation) - use (?) after opening paren
function safeAdd(? a: 0, b: 0) { return a + b }

// Unsafe block
unsafe { fastPath(data) }
```

### Classes (Callable Without `new`)

```typescript
class Point {
  constructor(public x: number, public y: number) {}
}
const p = Point(10, 20)      // TJS way - no 'new' needed
```

### Type Declarations

```typescript
Type Name = 'Alice'                       // Simple type with default
Type Email {
  example: 'test@example.com'
  predicate(x) { return x.includes('@') }
}
```

## Key Patterns

### Adding a New Atom

1. Define with `defineAtom(opCode, inputSchema, outputSchema, implementation, { cost, timeoutMs, docs })`
2. Add to `src/vm/atoms/` and export from `src/vm/atoms/index.ts`
3. Add tests
4. Run `npm run test:fast`

**Atom implementation notes:**
- `cost` can be static number or dynamic: `(input, ctx) => number`
- `timeoutMs` defaults to 1000ms; use `0` for no timeout (e.g., `seq`)
- Atoms must be non-blocking, respect `ctx.signal` for cancellation
- Access IO only via `ctx.capabilities`

### Value Resolution

The `resolveValue()` function handles multiple input patterns:
- `{ $kind: 'arg', path: 'varName' }` → lookup in `ctx.args`
- `{ $expr: ... }` → evaluate ExprNode via `evaluateExpr()`
- String with dots `'obj.foo.bar'` → traverse state with forbidden property checks
- Bare strings → lookup in state, else return literal

### Monadic Error Flow

When `ctx.error` is set, subsequent atoms in a `seq` skip execution. Errors are wrapped in `AgentError`, not thrown.

### Debugging Agents

Enable tracing: `vm.run(ast, args, { trace: true })` returns `TraceEvent[]` with execution path, fuel consumption, and state changes.

## Testing Strategy

- Unit tests alongside source files (`*.test.ts`)
- Integration tests in `src/use-cases/`
- Security tests in `src/use-cases/malicious-actor.test.ts`
- Language tests in `src/lang/lang.test.ts`
- Coverage targets: 98% lines on `src/vm/runtime.ts`, 80%+ overall

## Dependencies

**Runtime (shipped)**: `acorn` (~30KB, JS parser), `tosijs-schema` (~5KB, validation). Both have zero transitive dependencies.

## Batteries System

The batteries (`src/batteries/`) provide zero-config local AI development with LM Studio:
- **Lazy initialization**: First import audits LM Studio models (cached 24 hours)
- **HTTPS detection**: Blocks local LLM calls from HTTPS contexts
- **Capabilities interface**: `fetch`, `store` (KV + vector), `llmBattery` (predict/embed)

```typescript
import { AgentVM, batteries, batteryAtoms } from 'tosijs-agent'
const vm = new AgentVM(batteryAtoms)
await vm.run(logic, {}, { capabilities: batteries })
```

## Implementation Status (TJS Roadmap)

See `PLAN.md` for detailed status. Key completed features:
- Type() builtin with description + predicate
- Generic() for parameterized types
- test() blocks with assert/expect
- Safety levels (none/inputs/all) + unsafe markers
- Module system (IndexedDB store + CDN)
- Autocomplete (CodeMirror integration)
- WASM blocks (POC)
- Class support with wrapClass
- Linter (unused vars, unreachable code, no-explicit-new)
