# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**tjs-lang** is a type-safe virtual machine (~33KB) for safe execution of untrusted code in any JavaScript environment. It compiles logic chains and AI agents to JSON-serializable ASTs that run sandboxed with fuel (gas) limits.

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

# Efficient test debugging - capture once, query multiple times
bun test 2>&1 | tee /tmp/test-results.txt | tail -20  # Run and save
grep -E "^\(fail\)" /tmp/test-results.txt             # List failures
grep -A10 "test name" /tmp/test-results.txt           # See specific error

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
- `src/lang/emitters/from-ts.ts` - TypeScript to TJS/JS transpiler with class metadata extraction
- `src/lang/inference.ts` - Type inference from example values
- `src/lang/linter.ts` - Static analysis (unused vars, unreachable code, no-explicit-new)
- `src/lang/runtime.ts` - TJS runtime (monadic errors, type checking, wrapClass)
- `src/batteries/` - LM Studio integration (lazy init, model audit, vector search)
- `src/use-cases/` - Integration tests and real-world examples (27 test files)
- `src/cli/tjs.ts` - CLI tool for check/run/types/emit commands

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

### Transpiler Chain (TS → TJS → JS)

TJS supports transpiling TypeScript to JavaScript with runtime type validation. The pipeline has two distinct, independently testable steps:

**Step 1: TypeScript → TJS** (`fromTS`)
```typescript
import { fromTS } from 'tosijs/lang/from-ts'

const tsSource = `
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
`

const result = fromTS(tsSource, { emitTJS: true })
// result.code contains TJS:
// function greet(name: '') -> '' {
//   return \`Hello, \${name}!\`
// }
```

**Step 2: TJS → JavaScript** (`tjs`)
```typescript
import { tjs } from 'tosijs/lang'

const tjsSource = `
function greet(name: '') -> '' {
  return \`Hello, \${name}!\`
}
`

const jsCode = tjs(tjsSource)
// Generates JavaScript with __tjs metadata for runtime validation
```

**Full Chain Example:**
```typescript
import { fromTS } from 'tosijs/lang/from-ts'
import { tjs } from 'tosijs/lang'

// TypeScript source with type annotations
const tsSource = `
function add(a: number, b: number): number {
  return a + b
}
`

// Step 1: TS → TJS
const tjsResult = fromTS(tsSource, { emitTJS: true })

// Step 2: TJS → JS (with runtime validation)
const jsCode = tjs(tjsResult.code)

// Execute the result
const fn = new Function('__tjs', jsCode + '; return add')(__tjs_runtime)
fn(1, 2)  // Returns 3
fn('a', 'b')  // Returns { error: 'type mismatch', ... }
```

**CLI Commands:**
```bash
# Convert TypeScript to TJS
bun src/cli/tjs.ts convert input.ts --emit-tjs > output.tjs

# Emit TJS to JavaScript
bun src/cli/tjs.ts emit input.tjs > output.js

# Run TJS file directly (transpiles and executes)
bun src/cli/tjs.ts run input.tjs
```

**Design Notes:**
- The two steps are intentionally separate for tree-shaking (TS support is optional)
- `fromTS` lives in a separate entry point (`tosijs/lang/from-ts`)
- Import only what you need to keep bundle size minimal
- Each step is independently testable (see `src/lang/codegen.test.ts`)

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

TJS extends JavaScript with type annotations that survive to runtime.

#### Classes (Callable Without `new`)

TJS classes are wrapped to be callable without the `new` keyword:

```typescript
class Point {
  constructor(public x: number, public y: number) {}
}

// Both work identically:
const p1 = Point(10, 20)      // TJS way - clean
const p2 = new Point(10, 20)  // Still works, but linter warns

// The linter flags explicit `new` usage:
// Warning: Unnecessary 'new' keyword. In TJS, classes are callable without 'new'
```

The `wrapClass()` function in the runtime uses a Proxy to intercept calls and auto-construct.

#### Function Parameters

```typescript
// Required param with example value (colon shorthand)
function greet(name: 'Alice') { }        // name is required, type inferred as string

// Optional param with default
function greet(name = 'Alice') { }       // name is optional, defaults to 'Alice'

// Object parameter with shape
function createUser(user: { name: '', age: 0 }) { }

// Nullable type
function find(id: 0 || null) { }         // number or null

// Optional TS-style
function greet(name?: '') { }            // same as name = ''
```

#### Return Types

```typescript
// Return type annotation (arrow syntax)
function add(a: 0, b: 0) -> 0 { return a + b }

// Object return type
function getUser(id: 0) -> { name: '', age: 0 } { ... }
```

#### Safety Markers

```typescript
// Unsafe function (skips runtime validation)
function fastAdd(! a: 0, b: 0) { return a + b }

// Safe function (explicit validation)
function safeAdd(? a: 0, b: 0) { return a + b }

// Unsafe block
unsafe {
  // All calls in here skip validation
  fastPath(data)
}
```

#### Type Declarations

```typescript
// Simple type from example
Type Name 'Alice'

// Type with description and example
Type User {
  description: 'a user object'
  example: { name: '', age: 0 }
}

// Type with predicate (auto-generates type guard from example)
Type EvenNumber {
  description: 'an even number'
  example: 2
  predicate(x) { return x % 2 === 0 }
}
```

#### Generic Declarations

```typescript
// Simple generic
Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) { 
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value) 
  }
}

// Generic with default type parameter
Generic Container<T, U = ''> {
  description: 'container with label'
  predicate(obj, T, U) { 
    return T(obj.item) && U(obj.label) 
  }
}
```

#### Bare Assignments

```typescript
// Uppercase identifiers auto-get const
Foo = Type('test', 'example')    // becomes: const Foo = Type(...)
MyConfig = { debug: true }       // becomes: const MyConfig = { ... }
```

#### Module Safety Directive

```typescript
// At top of file - sets default validation level
safety none     // No validation (metadata only)
safety inputs   // Validate function inputs (default)
safety all      // Validate everything (debug mode)
```

#### Equality Operators

TJS redefines equality to be structural by default, fixing JavaScript's confusing `==` vs `===` semantics.

**Normal TJS Mode (default):**

| Operator | Meaning | Example |
|----------|---------|---------|
| `==` | Structural equality | `{a:1} == {a:1}` is `true` |
| `!=` | Structural inequality | `{a:1} != {a:2}` is `true` |
| `===` | Identity (same reference) | `obj === obj` is `true` |
| `!==` | Not same reference | `{a:1} !== {a:1}` is `true` |
| `a Is b` | Structural equality (explicit) | Same as `==` |
| `a IsNot b` | Structural inequality (explicit) | Same as `!=` |

```typescript
// Structural equality - compares values deeply
const a = { x: 1, y: [2, 3] }
const b = { x: 1, y: [2, 3] }
a == b      // true (same structure)
a === b     // false (different objects)

// Works with arrays too
[1, 2, 3] == [1, 2, 3]  // true

// Infix operators for readability
user Is expectedUser
result IsNot errorValue
```

**LegacyEquals Mode (for TS-emitted code):**

Add `LegacyEquals` at the top of a file to preserve JavaScript's original equality semantics:

```typescript
LegacyEquals

// Now == and === work like standard JavaScript
'1' == 1    // true (JS coercion)
'1' === 1   // false (strict equality)

// Use explicit Is/IsNot for structural equality in legacy mode
a Is b      // structural equality
a IsNot b   // structural inequality
```

**Implementation Notes:**

- **AJS (VM)**: The VM's expression evaluator handles `==`/`!=` with structural semantics at runtime
- **TJS (browser/Node)**: Source transformation converts `==` to `Is()` and `!=` to `IsNot()` calls
- **`===` and `!==`**: Always preserved as identity checks, never transformed
- The `Is()` and `IsNot()` functions are available in `src/lang/runtime.ts` and exposed globally

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
