# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**tjs-lang** (npm: `tjs-lang`) is a typed JavaScript platform — a language, runtime, and toolchain that transpiles TypeScript and TJS to JavaScript with runtime type validation, inline WASM, monadic errors, and safe eval. It also includes AJS, a gas-metered VM for executing untrusted agent code in any JavaScript environment.

**Three pillars:**

- **TJS** — TypeScript-like syntax where types are examples that survive to runtime as contracts, documentation, and tests. Transpiles TS → TJS → JS in a single fast pass.
- **AJS** — Agent language that compiles to JSON AST for safe, sandboxed execution with fuel limits and injected capabilities. Code travels to data.
- **Toolchain** — Compresses transpilation, linting, testing, and documentation generation into one pass. Includes inline WASM with SIMD, polymorphic dispatch, local class extensions, and a browser-based playground.

## Common Commands

```bash
# Development
bun run format              # ESLint fix + Prettier
bun run test:fast           # Core tests (skips LLM & benchmarks)
bun run make                # Full build (clean, format, grammars, tsc, esbuild)
bun run dev                 # Development server with file watcher
bun run start               # Build demo + start dev server
bun run latest              # Clean reinstall (rm node_modules + bun install)

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
bun run typecheck           # tsc --noEmit (type check without emitting)
bun run test:llm            # LM Studio integration tests
bun run bench               # Vector search benchmarks
bun run docs                # Generate documentation

# Build standalone CLI binaries
bun run build:cli           # Compiles tjs + tjsx to dist/

# Compatibility testing (transpile popular TS libraries with fromTS)
bun scripts/compat-zod.ts          # Zod validation library
bun scripts/compat-effect.ts       # Effect (HKTs, intersections)
bun scripts/compat-radash.ts       # Radash utilities
bun scripts/compat-superstruct.ts  # Superstruct validation
bun scripts/compat-ts-pattern.ts   # ts-pattern matching
bun scripts/compat-kysely.ts       # Kysely SQL builder

# Deployment (Firebase)
bun run deploy              # Build demo + deploy functions + hosting
bun run deploy:hosting      # Hosting only (serves from .demo/)
bun run functions:deploy    # Cloud functions only
bun run functions:serve     # Local functions emulator
```

## Architecture

### Two-Layer Design

1. **Builder Layer** (`src/builder.ts`): Fluent API that constructs AST nodes. Contains no execution logic.
2. **Runtime Layer** (`src/vm/runtime.ts`): Executes AST nodes. Contains all atom implementations (~2900 lines, security-critical).

### Key Source Files

- `src/index.ts` - Main entry, re-exports everything
- `src/vm/runtime.ts` - All atom implementations, expression evaluation, fuel charging (~3000 lines, security-critical)
- `src/vm/vm.ts` - AgentVM class (~226 lines)
- `src/vm/atoms/batteries.ts` - Battery atoms (vector search, LLM, store operations)
- `src/builder.ts` - TypedBuilder fluent API (~19KB)
- `src/lang/parser.ts` - TJS parser with colon shorthand, unsafe markers, return type extraction
- `src/lang/parser-transforms.ts` - Type, Generic, and FunctionPredicate block/function form transforms
- `src/lang/emitters/ast.ts` - Emits Agent99 AST from parsed source
- `src/lang/emitters/js.ts` - Emits JavaScript with `__tjs` metadata
- `src/lang/emitters/from-ts.ts` - TypeScript to TJS/JS transpiler with class metadata extraction
- `src/lang/emitters/dts.ts` - .d.ts declaration file generator from TJS transpilation results
- `src/lang/inference.ts` - Type inference from example values
- `src/lang/json-schema.ts` - JSON Schema generation from TypeDescriptors and example values
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

// JSON Schema
Type('user', { name: '', age: 0 }).toJSONSchema()  // → JSON Schema object
Type('user', { name: '', age: 0 }).strip(value)     // → strip extra fields
functionMetaToJSONSchema(fn.__tjs)                   // → { input, output } schemas

// Error History (on by default, zero cost on happy path)
__tjs.errors()          // → recent MonadicErrors (ring buffer, max 64)
__tjs.clearErrors()     // → returns and clears
__tjs.getErrorCount()   // → total since last clear
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
import { fromTS } from 'tjs-lang/lang/from-ts'

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
import { tjs } from 'tjs-lang/lang'

const tjsSource = `
function greet(name: '') -> '' {
  return \`Hello, \${name}!\`
}
`

const jsResult = tjs(tjsSource)
// jsResult.code contains JavaScript with __tjs metadata for runtime validation
```

**Full Chain Example:**

```typescript
import { fromTS } from 'tjs-lang/lang/from-ts'
import { tjs } from 'tjs-lang/lang'

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
- Constrained generics (`<T extends { id: number }>`) use the constraint as the example value instead of `any`
- Generic defaults (`<T = string>`) use the default as the example value
- Unconstrained generics (`<T>`) degrade to `any` — there's no information to use

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
- Language tests split across 14 files in `src/lang/` (lang.test.ts, features.test.ts, codegen.test.ts, parser.test.ts, from-ts.test.ts, wasm.test.ts, etc.)

Coverage targets: 98% lines on `src/vm/runtime.ts` (security-critical), 80%+ overall.

**Bug fix rule:** Always create a reproduction test case before fixing a bug.

## Key Patterns

### Adding a New Atom

1. Define with `defineAtom(opCode, inputSchema, outputSchema, implementation, { cost, timeoutMs, docs })`
2. Add to `src/vm/atoms/` and export from `src/vm/atoms/index.ts`
3. Add tests
4. Run `bun run test:fast`

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

### TJS Syntax Reference

Full syntax documentation is in [`CLAUDE-TJS-SYNTAX.md`](CLAUDE-TJS-SYNTAX.md). Key concepts:

- **Colon shorthand**: `function foo(x: 'hello')` — colon value is an _example_, not a type. This is the most common LLM mistake.
- **Numeric narrowing**: `3.14` = float, `42` = integer, `+0` = non-negative integer
- **Return types**: `function add(a: 0, b: 0) -> 0 { ... }` (arrow syntax, not colon)
- **Safety markers**: `!` = unsafe (skip validation), `?` = safe (explicit validation)
- **Mode defaults**: Native TJS has all modes ON by default (`TjsEquals`, `TjsClass`, `TjsDate`, `TjsNoeval`, `TjsNoVar`, `TjsStandard`). TS-originated code (`fromTS`) and AJS/VM code get modes OFF. `TjsCompat` directive explicitly disables all modes. `TjsStrict` enables all modes (useful for TS-originated code opting in).
- **Bang access**: `x!.foo` — returns MonadicError if `x` is null/undefined, otherwise bare `x.foo`. Chains propagate: `x!.foo!.bar`.
- **Type/Generic/FunctionPredicate**: Three declaration forms for runtime type predicates
- **`const!`**: Compile-time immutability, zero runtime cost
- **Equality**: `==`/`!=` = structural equality by default in native TJS (via `Is`/`IsNot`), `===`/`!==` = identity
- **Polymorphic functions**: Multiple same-name declarations merge into arity/type dispatcher
- **`extend` blocks**: Local class extensions without prototype pollution
- **WASM blocks**: Inline WebAssembly compiled at transpile time, with SIMD intrinsics and `wasmBuffer()` zero-copy arrays
- **`@tjs` annotations**: `/* @tjs ... */` comments in TS files enrich TJS output

#### Runtime Configuration

```typescript
import { configure } from 'tjs-lang/lang'

configure({ logTypeErrors: true }) // Log type errors to console
configure({ throwTypeErrors: true }) // Throw instead of return (debugging)
configure({ callStacks: true }) // Track call stacks in errors (~2x overhead)
configure({ trackErrors: false }) // Disable error history (on by default)
```

#### Error History

Type errors are tracked in a ring buffer (on by default, zero cost on happy path):

```typescript
__tjs.errors() // → recent MonadicErrors (newest last, max 64)
__tjs.clearErrors() // → returns and clears the buffer
__tjs.getErrorCount() // → total since last clear (survives buffer wrap)
```

Use for debugging (find silent failures), testing (`clearErrors()` → run → check), and monitoring.

#### Standalone JS Output

Emitted `.js` files work without any runtime setup. Each file includes an inline
minimal runtime as fallback — only the functions actually used are included (~500
bytes for a basic validated function). If `globalThis.__tjs` exists (shared runtime),
it's used instead.

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

`bunfig.toml` preloads `src/bun-plugin/tjs-plugin.ts` which enables importing `.tjs` files directly in bun (transpiled on-the-fly). It also aliases `tjs-lang` to `./src/index.ts` for local development, so `import { tjs } from 'tjs-lang'` resolves to the source tree without needing `npm link` or a published package.

### Code Style

- **Prettier**: Single quotes, no semicolons, 2-space indentation, 80 char width, es5 trailing commas
- Prefix unused variables with `_` (enforced by ESLint: `argsIgnorePattern: '^_'`)
- `any` types are allowed (`@typescript-eslint/no-explicit-any: 0`)
- Module type is ESM (`"type": "module"` in package.json)
- Build output goes to `dist/` (declaration files only via `tsconfig.build.json`, bundles via `scripts/build.ts`)
- Run `bun run format` before committing (ESLint fix + Prettier)

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
- `TJS-FOR-JS.md` — TJS guide for JavaScript developers (syntax differences, gotchas)
- `TJS-FOR-TS.md` — TJS guide for TypeScript developers (migration, interop)
- `CONTEXT.md` — Architecture deep dive
- `AGENTS.md` — Agent workflow instructions (issue tracking with `bd`, mandatory push-before-done)
- `PLAN.md` — Roadmap

### Issue Tracking with `bd`

The project uses `bd` (beads) for issue tracking. Key commands:

```bash
bd ready                          # Find available work
bd show <id>                      # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>                     # Complete work
bd sync                           # Sync with git
```

**Critical rule**: Work is NOT complete until `git push` succeeds. Never stop before pushing — work stranded locally is work lost. If push fails, resolve and retry.

### Known Gotcha: `tjs()` Returns an Object, Not a String

`tjs(source)` returns `{ code, types, metadata, testResults, ... }`. Use `.code` to get the transpiled JavaScript string. This is a common mistake.

### Running Emitted TJS Code

Emitted JS works standalone — no setup required. Each file includes an inline
runtime fallback. If you want the shared runtime (e.g. for `isMonadicError` to
work across files), install it first:

```typescript
import { installRuntime, createRuntime } from '../lang/runtime'
installRuntime() // or: globalThis.__tjs = createRuntime()

const fn = new Function(result.code + '\nreturn fnName')()
fn('valid') // works
fn(42) // returns MonadicError (not thrown)
```
