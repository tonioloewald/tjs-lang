# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**tjs-lang** (npm: `tjs-lang`) is a type-safe virtual machine (~33KB) for safe execution of untrusted code in any JavaScript environment. It compiles logic chains and AI agents to JSON-serializable ASTs that run sandboxed with fuel (gas) limits.

Key concept: Code travels to data (rather than shipping data to code). Agents are defined as data, not deployed code.

**Two languages in one platform:**

- **TJS** — TypeScript-like syntax with runtime type validation for writing your platform
- **AJS** — Agent language that compiles to JSON AST for safe, sandboxed execution

## Common Commands

```bash
# Development
npm run format              # ESLint fix + Prettier
npm run test:fast           # Core tests (skips LLM & benchmarks)
npm run make                # Full build (clean, format, grammars, tsc, esbuild)
npm run dev                 # Development server with file watcher
npm run start               # Build demo + start dev server
npm run latest              # Clean reinstall (rm node_modules + bun install)

# Testing (framework: bun:test — describe/it/expect)
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
bun src/cli/tjs.ts check <file>    # Parse and type check TJS file
bun src/cli/tjs.ts run <file>      # Transpile and execute
bun src/cli/tjs.ts types <file>    # Output type metadata as JSON
bun src/cli/tjs.ts emit <file>     # Output transpiled JavaScript
bun src/cli/tjs.ts convert <file>  # Convert TypeScript to TJS (--emit-tjs) or JS
bun src/cli/tjs.ts test <file>     # Run inline tests in a TJS file

# Type checking & other
npm run typecheck           # tsc --noEmit (type check without emitting)
npm run test:llm            # LM Studio integration tests
npm run bench               # Vector search benchmarks
npm run docs                # Generate documentation

# Build standalone CLI binaries
npm run build:cli           # Compiles tjs + tjsx to dist/

# Deployment (Firebase)
npm run deploy              # Build demo + deploy functions + hosting
npm run deploy:hosting      # Hosting only (serves from .demo/)
npm run functions:deploy    # Cloud functions only
npm run functions:serve     # Local functions emulator
```

## Architecture

### Two-Layer Design

1. **Builder Layer** (`src/builder.ts`): Fluent API that constructs AST nodes. Contains no execution logic.
2. **Runtime Layer** (`src/vm/runtime.ts`): Executes AST nodes. Contains all atom implementations (~2900 lines, security-critical).

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
- `src/lang/wasm.ts` - WASM compiler (opcodes, disassembler, bytecode generation)
- `src/types/` - Type system definitions (Type.ts, Generic.ts)
- `src/transpiler/` - AJS transpiler (source → AST)
- `src/batteries/` - LM Studio integration (lazy init, model audit, vector search)
- `src/store/` - Store implementations for persistence
- `src/rbac/` - Role-based access control
- `src/use-cases/` - Integration tests and real-world examples (28 test files)
- `src/cli/tjs.ts` - CLI tool for check/run/types/emit/convert/test commands
- `src/cli/tjsx.ts` - JSX/component runner
- `src/cli/playground.ts` - Local playground server
- `src/cli/create-app.ts` - Project scaffolding tool

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

### Package Entry Points

```typescript
import { Agent, AgentVM, ajs, tjs } from 'tjs-lang' // Main entry
import { Eval, SafeFunction } from 'tjs-lang/eval' // Safe eval utilities
import { tjs, transpile } from 'tjs-lang/lang' // Language tools only
import { fromTS } from 'tjs-lang/lang/from-ts' // TypeScript transpilation
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
fn(1, 2) // Returns 3
fn('a', 'b') // Returns { error: 'type mismatch', ... }
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
- **Monadic errors**: Errors wrapped in `AgentError` (VM) / `MonadicError` (TJS), not thrown (prevents exception exploits). Use `isMonadicError()` to check — `isError()` is deprecated
- **Expression sandboxing**: ExprNode AST evaluation, blocked prototype access

### Expression Evaluation

Expressions use AST nodes (`$expr`), not strings:

```typescript
{ $expr: 'binary', op: '+', left: {...}, right: {...} }
{ $expr: 'ident', name: 'varName' }
{ $expr: 'member', object: {...}, property: 'foo' }
```

Each node costs 0.01 fuel. Forbidden: function calls, `new`, `this`, `__proto__`, `constructor`.

## AJS Expression Gotchas

AJS expressions behave differently from JavaScript in several important ways:

- **Null member access is safe by default**: `null.foo.bar` returns `undefined` silently (uses `?.` semantics internally). This differs from JavaScript which would throw `TypeError`.
- **No computed member access with variables**: `items[i]` fails at transpile time with "Computed member access with variables not yet supported". Literal indices work (`items[0]`, `obj["key"]`). Workaround: use `.map`/`.reduce` atoms instead.
- **Unknown atom errors**: When an atom doesn't exist, the error is `"Unknown Atom: <name>"` with no listing of available atoms.
- **TJS parameter syntax is NOT TypeScript**: `function foo(x: 'default')` means "required param, example value 'default'" — not a TypeScript string literal type. LLMs consistently generate `function foo(x: string)` which is wrong. The colon value is an _example_, not a _type annotation_.

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
const p1 = Point(10, 20) // TJS way - clean
const p2 = new Point(10, 20) // Still works, but linter warns

// The linter flags explicit `new` usage:
// Warning: Unnecessary 'new' keyword. In TJS, classes are callable without 'new'
```

The `wrapClass()` function in the runtime uses a Proxy to intercept calls and auto-construct.

#### Function Parameters

```typescript
// Required param with example value (colon shorthand)
function greet(name: 'Alice') { }        // name is required, type inferred as string

// Numeric type narrowing (all valid JS syntax)
function calc(rate: 3.14) { }            // number (float) -- has decimal point
function calc(count: 42) { }             // integer -- whole number
function calc(index: +0) { }             // non-negative integer -- + prefix

// Optional param with default
function greet(name = 'Alice') { }       // name is optional, defaults to 'Alice'

// Object parameter with shape
function createUser(user: { name: '', age: 0 }) { }

// Nullable type
function find(id: 0 | null) { }           // integer or null

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
Foo = Type('test', 'example') // becomes: const Foo = Type(...)
MyConfig = { debug: true } // becomes: const MyConfig = { ... }
```

#### Module Safety Directive

```typescript
// At top of file - sets default validation level
safety none     // No validation (metadata only)
safety inputs   // Validate function inputs (default)
safety all      // Validate everything (debug mode)
```

#### TJS Mode Directives

JavaScript semantics are the default. TJS improvements are opt-in via file-level directives:

```typescript
TjsStrict // Enables ALL modes below at once

TjsEquals // == and != use structural equality (Is/IsNot)
TjsClass // Classes callable without new, explicit new is banned
TjsDate // Date is banned, use Timestamp/LegalDate instead
TjsNoeval // eval() and new Function() are banned
TjsStandard // Newlines as statement terminators (prevents ASI footguns)
TjsSafeEval // Include Eval/SafeFunction in runtime for dynamic code
```

Multiple directives can be combined. Place them at the top of the file before any code.

#### Equality Operators

With `TjsEquals` (or `TjsStrict`), TJS redefines equality to be structural, fixing JavaScript's confusing `==` vs `===` semantics.

| Operator    | Meaning                          | Example                     |
| ----------- | -------------------------------- | --------------------------- |
| `==`        | Structural equality              | `{a:1} == {a:1}` is `true`  |
| `!=`        | Structural inequality            | `{a:1} != {a:2}` is `true`  |
| `===`       | Identity (same reference)        | `obj === obj` is `true`     |
| `!==`       | Not same reference               | `{a:1} !== {a:1}` is `true` |
| `a Is b`    | Structural equality (explicit)   | Same as `==`                |
| `a IsNot b` | Structural inequality (explicit) | Same as `!=`                |

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

**Implementation Notes:**

- **AJS (VM)**: The VM's expression evaluator (`src/vm/runtime.ts`) uses `isStructurallyEqual()` for `==`/`!=`
- **TJS (browser/Node)**: Source transformation converts `==` to `Is()` and `!=` to `IsNot()` calls
- **`===` and `!==`**: Always preserved as identity checks, never transformed
- The `Is()` and `IsNot()` functions are available in `src/lang/runtime.ts` and exposed globally

**Custom Equality Protocol:**

- `[tjsEquals]` symbol (`Symbol.for('tjs.equals')`) — highest priority, ideal for Proxies
- `.Equals` method — backward-compatible, works on any object/class
- Priority: symbol → `.Equals` → structural comparison
- `tjsEquals` is exported from `src/lang/runtime.ts` and available as `__tjs.tjsEquals`

#### Polymorphic Functions

Multiple function declarations with the same name are merged into a dispatcher:

```typescript
function area(radius: 3.14) {
  return Math.PI * radius * radius
}
function area(w: 0.0, h: 0.0) {
  return w * h
}

area(5) // dispatches to variant 1 (one number)
area(3, 4) // dispatches to variant 2 (two numbers)
```

Dispatch order: arity first, then type specificity, then declaration order. Ambiguous signatures (same types at same arity) are caught at transpile time.

#### Polymorphic Constructors

Classes can have multiple constructor signatures (requires `TjsClass` directive):

```typescript
TjsClass

class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }
  constructor(coords: { x: 0.0; y: 0.0 }) {
    this.x = coords.x
    this.y = coords.y
  }
}

Point(3, 4) // variant 1
Point({ x: 10, y: 20 }) // variant 2 (both produce correct instanceof)
```

The first constructor becomes the real JS constructor; additional variants become factory functions using `Object.create`.

#### Local Class Extensions

Add methods to built-in types without prototype pollution:

```typescript
extend String {
  capitalize() { return this[0].toUpperCase() + this.slice(1) }
}

extend Array {
  last() { return this[this.length - 1] }
}

'hello'.capitalize()  // 'Hello' — rewritten to __ext_String.capitalize.call('hello')
[1, 2, 3].last()      // 3
```

- Methods are rewritten to `.call()` at transpile time for known-type receivers (zero overhead)
- Runtime fallback via `registerExtension()`/`resolveExtension()` for unknown types
- Arrow functions rejected (need `this` binding)
- Multiple `extend` blocks for same type merge left-to-right
- File-local only — no cross-module leaking

## WASM Blocks

TJS supports inline WebAssembly for performance-critical code. WASM blocks are compiled at transpile time and embedded as base64 in the output.

### Syntax

```typescript
const add = wasm (a: i32, b: i32) -> i32 {
  local.get $a
  local.get $b
  i32.add
}
```

### Features

- **Transpile-time compilation**: WASM bytecode is generated during transpilation, not at runtime
- **WAT comments**: Human-readable WebAssembly Text format is included as comments above the base64
- **Type-safe**: Parameters and return types are validated
- **Self-contained**: Compiled WASM is embedded in output JS, no separate .wasm files needed

### Output Example

The transpiler generates code like:

```javascript
/*
 * WASM Block: add
 * WAT (WebAssembly Text):
 *   (func $add (param $a i32) (param $b i32) (result i32)
 *     local.get 0
 *     local.get 1
 *     i32.add
 *   )
 */
const add = await (async () => {
  const bytes = Uint8Array.from(atob('AGFzbQEAAAA...'), (c) => c.charCodeAt(0))
  const { instance } = await WebAssembly.instantiate(bytes)
  return instance.exports.fn
})()
```

### SIMD Intrinsics (f32x4)

WASM blocks support explicit SIMD via `f32x4_*` intrinsics:

```typescript
const scale = wasm (arr: Float32Array, len: 0, factor: 0.0) -> 0 {
  let s = f32x4_splat(factor)
  for (let i = 0; i < len; i += 4) {
    let off = i * 4
    let v = f32x4_load(arr, off)
    f32x4_store(arr, off, f32x4_mul(v, s))
  }
} fallback {
  for (let i = 0; i < len; i++) arr[i] *= factor
}
```

Available: `f32x4_load`, `f32x4_store`, `f32x4_splat`, `f32x4_extract_lane`, `f32x4_replace_lane`, `f32x4_add`, `f32x4_sub`, `f32x4_mul`, `f32x4_div`, `f32x4_neg`, `f32x4_sqrt`.

### Zero-Copy Arrays: `wasmBuffer()`

`wasmBuffer(Constructor, length)` allocates typed arrays directly in WASM linear memory. When passed to a `wasm {}` block, these arrays are zero-copy — no marshalling overhead.

```typescript
// Allocate in WASM memory (zero-copy when passed to wasm blocks)
const xs = wasmBuffer(Float32Array, 50000)

// Works like a normal Float32Array from JS
xs[0] = 3.14
for (let i = 0; i < xs.length; i++) xs[i] = Math.random()

// Zero-copy in WASM blocks — data is already in WASM memory
function process(! xs: Float32Array, len: 0, delta: 0.0) {
  wasm {
    let vd = f32x4_splat(delta)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      f32x4_store(xs, off, f32x4_add(f32x4_load(xs, off), vd))
    }
  } fallback {
    for (let i = 0; i < len; i++) xs[i] += delta
  }
}

// After WASM runs, JS sees mutations immediately (same memory)
```

- Regular `Float32Array` args are copied in before and out after each WASM call
- `wasmBuffer` arrays skip both copies (detected via `buffer === wasmMemory.buffer`)
- Uses a bump allocator — allocations persist for program lifetime (no deallocation)
- All WASM blocks in a file share one `WebAssembly.Memory` (64MB / 1024 pages)
- Supports `Float32Array`, `Float64Array`, `Int32Array`, `Uint8Array`

### Current Limitations

- No imports/exports beyond the function itself
- `wasmBuffer` allocations are permanent (bump allocator, no free)

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

### Capability Key Naming

The base `Capabilities` interface (`runtime.ts`) uses `llm` with `{ predict, embed? }`, but the battery atoms access capabilities via different keys:

| Capability key | Used by                                                  | Contains                                     |
| -------------- | -------------------------------------------------------- | -------------------------------------------- |
| `llmBattery`   | `llmPredictBattery`, `llmVision`                         | Full `LLMCapability` (`predict` + `embed`)   |
| `vector`       | `storeVectorize`                                         | Just `{ embed }` (extracted from llmBattery) |
| `store`        | `storeSearch`, `storeCreateCollection`, `storeVectorAdd` | KV + vector store ops                        |

Both `llmBattery` and `vector` can be `undefined`/`null` if LM Studio isn't available or HTTPS is detected.

### Battery Atom Return Types

- **`llmPredictBattery`**: Returns OpenAI message format `{ role?, content?, tool_calls? }` — NOT a plain string
- **`storeVectorize`**: Returns `number[]` (embedding vector)
- **`storeSearch`**: Returns `any[]` (matched documents)

## Development Configuration

### Bun Plugin

`bunfig.toml` preloads `src/bun-plugin/tjs-plugin.ts` which enables importing `.tjs` files directly in bun. It also aliases `tjs-lang` to `./src/index.ts` for local development (monorepo-style resolution).

### Code Style

- **Prettier**: Single quotes, no semicolons, 2-space indentation, 80 char width, es5 trailing commas
- Prefix unused variables with `_` (enforced by ESLint: `argsIgnorePattern: '^_'`)
- `any` types are allowed (`@typescript-eslint/no-explicit-any: 0`)
- Module type is ESM (`"type": "module"` in package.json)
- Build output goes to `dist/` (declaration files only via `tsconfig.build.json`, bundles via `scripts/build.ts`)
- Run `npm run format` before committing (ESLint fix + Prettier)

### Firebase Deployment

The playground is hosted on Firebase (`tjs-platform.web.app`). Demo build output goes to `.demo/` (gitignored) which is the Firebase hosting root. Cloud Functions live in `functions/` with their own build process (`functions/src/*.tjs` → transpile → bundle). Firebase config: `firebase.json`, `.firebaserc`, `firestore.rules`.

The `docs/` directory contains real documentation (markdown), not build artifacts. See `docs/README.md` for the documentation index.

### Additional Directories

- `tjs-src/` — TJS runtime written in TJS itself (self-hosting)
- `guides/` — Usage patterns, benchmarks, examples (`patterns.md`, `benchmarks.md`, `tjs-examples.md`)
- `examples/` — Standalone TJS example files (`hello.tjs`, `datetime.tjs`, `generic-demo.tjs`)
- `editors/` — Syntax highlighting for Monaco, CodeMirror, Ace, VSCode

### Additional Documentation

- `DOCS-TJS.md` — TJS language guide
- `DOCS-AJS.md` — AJS runtime guide
- `CONTEXT.md` — Architecture deep dive
- `AGENTS.md` — Agent workflow instructions (issue tracking with `bd`, mandatory push-before-done)
- `PLAN.md` — Roadmap

### Known Gotcha: Self-Contained Output

Transpiled TJS code currently requires `globalThis.__tjs` to be set up with `createRuntime()` before execution. A `{ standalone: true }` option to inline the ~1KB runtime is planned but not yet implemented.
