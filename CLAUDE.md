# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**tjs-lang** (npm: `tjs-lang`) is a typed JavaScript platform — a language, runtime, and toolchain that transpiles TypeScript and TJS to JavaScript with runtime type validation, inline WASM, monadic errors, and safe eval. It also includes AJS, a gas-metered VM for executing untrusted agent code in any JavaScript environment.

**Three pillars:**

- **TJS** — TypeScript-like syntax where types are examples that survive to runtime as contracts, documentation, and tests. Transpiles TS → TJS → JS in a single fast pass.
- **AJS** — Agent language that compiles to JSON AST for safe, sandboxed execution with fuel limits and injected capabilities. Code travels to data.
- **Toolchain** — Compresses transpilation, linting, testing, and documentation generation into one pass. Includes inline WASM with SIMD, polymorphic dispatch, local class extensions, and a browser-based playground.

> **TJS syntax is NOT TypeScript.** Full reference: [`CLAUDE-TJS-SYNTAX.md`](CLAUDE-TJS-SYNTAX.md). The single most common LLM mistake is treating `function foo(x: 'default')` as a TypeScript string-literal type. It is _not_ — the colon value is an **example**, and `'default'` widens to `string`. See the syntax doc before writing or modifying TJS source.

## Common Commands

```bash
# Development
bun run format              # ESLint fix + Prettier
bun run test:fast           # Core tests (skips LLM & benchmarks)
bun run make                # Full build (clean, format, grammars, editors, tsc, esbuild)
bun run build:editors       # Bundle editors/{codemirror,monaco,ace}/*.ts → published *.js
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

# Compatibility testing — see scripts/compat-*.ts (zod, effect, radash, superstruct, ts-pattern, kysely)

# Deployment (Firebase)
bun run deploy              # Build demo + deploy functions + hosting
bun run deploy:hosting      # Hosting only (serves from .demo/)
bun run functions:deploy    # Cloud functions only
bun run functions:serve     # Local functions emulator
```

## Architecture

### Two-Layer Design

1. **Builder Layer** (`src/builder.ts`): Fluent API that constructs AST nodes. Contains no execution logic.
2. **Runtime Layer** (`src/vm/runtime.ts`): Executes AST nodes. Contains all atom implementations (~3134 lines, security-critical).

### Key Source Files

- `src/index.ts` - Main entry, re-exports everything
- `src/vm/runtime.ts` - All atom implementations, expression evaluation, fuel charging (~3134 lines, security-critical)
- `src/vm/vm.ts` - AgentVM class (~247 lines)
- `src/vm/atoms/batteries.ts` - Battery atoms (vector search, LLM, store operations)
- `src/builder.ts` - TypedBuilder fluent API (~754 lines / ~19KB)
- `src/lang/parser.ts` - TJS parser with colon shorthand, unsafe markers, return type extraction
- `src/lang/parser-transforms.ts` - Type, Generic, and FunctionPredicate block/function form transforms
- `src/lang/emitters/ast.ts` - Emits Agent99 AST from parsed source
- `src/lang/emitters/js.ts` - Emits JavaScript with `__tjs` metadata
- `src/lang/emitters/from-ts.ts` - TypeScript to TJS/JS transpiler with class metadata extraction
- `src/lang/emitters/dts.ts` - .d.ts declaration file generator from TJS transpilation results
- `src/lang/inference.ts` - Type inference from example values
- `src/lang/json-schema.ts` - JSON Schema generation from TypeDescriptors and example values
- `src/lang/linter.ts` - Static analysis (unused vars, unreachable code, no-explicit-new)
- `src/lang/predicate.ts` - Predicate-safety verifier: certifies a cluster of pure, synchronous, composable predicates (reads the atom `effects` tag via `effectfulFromAtoms`); verified predicates compile to native JS. Also `suggest()` — mines a cluster for autocomplete completions (keyword sets → `value`s, `startsWith` guards → open-ended `stub`s like `var(--`; mined values run through the compiled predicate so they're guaranteed valid). Exported from `tjs-lang/lang`. See `experiments/predicates/` (CSS torture set + perf + suggest demo)
- `src/lang/predicate-schema.ts` - Predicate-aware JSON-Schema: the `$predicate` keyword (computational types). `compilePredicateSchema`/`validatePredicateSchema` — structure for naive validators, `$predicate` for aware ones (progressive enhancement). The serializable-into-JSON-Schema endgame; exported from `tjs-lang/lang`
- `src/lang/runtime.ts` - TJS runtime (monadic errors, type checking, wrapClass)
- `src/lang/wasm.ts` - WASM compiler (opcodes, disassembler, bytecode generation; multi-function module composition; wasm-to-wasm `call <index>` resolution)
- `src/lang/emitters/js-wasm.ts` - JS bootstrap emitter for compiled wasm modules (one `WebAssembly.compile` per file, name→export-index table, type-aware wrappers)
- `src/lang/module-loader.ts` - Transpile-time `.tjs`/`.ts`/`.js` module loader (Phase 0.75); used by cross-file `wasm function` composition
- `src/linalg/` - `tjs-lang/linalg` stdlib subpath (f32x4 SIMD vector kernels)
- `src/schema/` - `tjs-lang/schema` subpath: **tosijs-schema pre-wired with `$predicate` support**. Re-exports the whole tosijs-schema surface and auto-registers `createPredicateEvaluator()` on import (batteries-included), so JSON-Schema validation is predicate-aware with zero wiring. Lives here (not in tosijs-schema) because tjs-lang depends on tosijs-schema — the reverse would be circular. `tosijs-schema` is externalized in the bundle (single instance → single global evaluator). Requires `tosijs-schema@^1.4.0` (the `setPredicateEvaluator` hook).
- `src/css/` - `tjs-lang/css` subpath: CSS validators built from verified-safe predicates. `predicates.ts` (colors), `dimensions.ts` (lengths/numbers/angles/times/keywords), `shorthands.ts` (order-flexible `animation`/`transition` — paren-aware tokenize + classify), `style.ts` (recursive style-object structure + the `$predicate` JSON-Schema builders `cssStyleSchema`/`cssColorSchema`); `index.ts` = compiled validators + `suggestColor` + `verifyCss` (verifies all clusters). The predicate-types thesis made real — phases 1/2/3(animation+transition)/4 done; font/background shorthands + perf (phase 5) remain (TODO #4)
- `src/types/` - Type system definitions (Type.ts, Generic.ts)
- `src/transpiler/` - AJS transpiler (source → AST)
- `src/batteries/` - LM Studio integration (lazy init, model audit, vector search)
- `src/store/` - Store implementations for persistence
- `src/rbac/` - Role-based access control
- `src/use-cases/` - Integration tests and real-world examples (30 test files)
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
await vm.run(ast, args, {
  fuel, capabilities, timeoutMs, trace,
  costOverrides: { atomOp: 5 },             // per-atom fuel cost override
  timeoutOverrides: { atomOp: 60_000 },     // per-atom wall-clock override (ms; 0 disables)
})

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
import { AgentVM } from 'tjs-lang/vm' // VM only (smaller bundle)
import { batteryAtoms } from 'tjs-lang/batteries' // LM Studio batteries
import { dot, norm_sq } from 'tjs-lang/linalg' // SIMD linear-algebra kernels
import { isColor, suggestColor } from 'tjs-lang/css' // CSS validators (verified predicates)
import { s, validate } from 'tjs-lang/schema' // tosijs-schema pre-wired with $predicate support
import { createRuntime, Eq, isMonadicError } from 'tjs-lang/runtime' // TJS runtime (for emitted .tjs / integrations)
// Bun: enable native .tjs imports — `preload = ["tjs-lang/bun-plugin"]` in bunfig.toml, or:
import 'tjs-lang/bun-plugin' // registers the .tjs onLoad plugin + installs __tjs (bun-only)
// Editor integrations: 'tjs-lang/editors/monaco', '/codemirror', '/ace'

// Self-contained BROWSER bundles — drop-in via import() from any CDN, no
// import-map/config (acorn + tosijs-schema inlined):
const { tjs } = await import(
  'https://cdn.jsdelivr.net/npm/tjs-lang/dist/tjs-browser.js'
)
// TS→TJS in the browser: lazy-loads the TypeScript compiler from a CDN on first call:
const { fromTS } = await import(
  'https://cdn.jsdelivr.net/npm/tjs-lang/dist/tjs-browser-from-ts.js'
)
// → exports: 'tjs-lang/browser' (TJS/AJS) and 'tjs-lang/browser/from-ts' (TS).
```

**Browser bundles + CDN reality** (build targets `tjs-browser` / `tjs-browser-from-ts`
in `scripts/build.ts`; `src/lang/browser.ts`, `browser-from-ts.ts`, `ts-cdn-shim.ts`):
the TJS/AJS bundle is fully self-contained → loads from **any** CDN (jsDelivr,
unpkg, esm.sh). The TS path lazy-loads the `typescript` compiler from a CDN on
demand (Proxy shim aliased over `from-ts`'s `typescript` import; no source change).
**Verified in a real browser: esm.sh is the ONLY CDN that reliably serves
`typescript`** (~700ms) — jsDelivr `+esm` / esm.run time out on its ~10MB CJS,
skypack is dead. So `DEFAULT_TYPESCRIPT_URL = https://esm.sh/typescript@5`,
overridable via `fromTS(src, { typescriptUrl })` or by preloading
`globalThis.__TJS_TS__`. Self-containment guarded by `src/lang/browser-bundle.test.ts`.

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
// function greet(name: ''): '' {
//   return \`Hello, \${name}!\`
// }
```

**Step 2: TJS → JavaScript** (`tjs`)

```typescript
import { tjs } from 'tjs-lang/lang'

const tjsSource = `
function greet(name: ''): '' {
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
- `fromTS` lives in a separate entry point (`tjs-lang/lang/from-ts`)
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
- Language tests split across 18 files in `src/lang/` (lang.test.ts, features.test.ts, codegen.test.ts, parser.test.ts, from-ts.test.ts, wasm.test.ts, etc.)
- LLM integration tests (run via full `bun test`, skipped by `SKIP_LLM_TESTS`) need a local **LM Studio** server with a chat + embedding model loaded. Setup and the hard-won gotchas (model load failures, leaked-VRAM stray `node` worker, updating runtimes, CORS, the audit-cache parallel race) are in [`docs/lm-studio-setup.md`](docs/lm-studio-setup.md).

Coverage targets: 98% lines on `src/vm/runtime.ts` (security-critical), 80%+ overall.

**Bug fix rule:** Always create a reproduction test case before fixing a bug.

## Key Patterns

### Adding a New Atom

1. Define with `defineAtom(opCode, inputSchema, outputSchema, implementation, { cost, timeoutMs, docs, effects })`
2. Add to `src/vm/atoms/` and export from `src/vm/atoms/index.ts`
3. Add tests
4. Run `bun run test:fast`

**Atom implementation notes:**

- `cost` can be static number or dynamic: `(input, ctx) => number`
- `timeoutMs` defaults to 1000ms; use `0` for no timeout (e.g., `seq`)
- Atoms are always async; fuel deduction is automatic in the `exec` wrapper
- `effects` defaults to `'pure'`; **set `'io'` for any atom that touches `ctx.capabilities` (fetch/store/llm/agent/code), is nondeterministic (random/uuid), or has side effects (console)**. This drives predicate-safety (a predicate may only call pure atoms — see `experiments/predicates/`). Core IO atoms are tagged centrally via `EFFECTFUL_CORE_OPS` in `runtime.ts`; the invariant is guarded by `src/vm/atom-effects.test.ts`.

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
- **Return types**: `function add(a: 0, b: 0): 0 { ... }` (colon syntax, same as TypeScript)
- **Safety markers**: `!` = unsafe (skip validation), `?` = safe (explicit validation)
- **Mode defaults**: Native TJS has all modes ON by default (`TjsEquals`, `TjsClass`, `TjsDate`, `TjsNoeval`, `TjsNoVar`, `TjsStandard`). TS-originated code (`fromTS`) and AJS/VM code get modes OFF. `TjsCompat` directive explicitly disables all modes. `TjsStrict` enables all modes (useful for TS-originated code opting in).
- **Source dialect (`dialect: 'js' | 'tjs'`)**: the public, programmatic way to set the modes-on/off default. `tjs(src, { dialect: 'js' })` preserves plain-JS semantics (modes OFF, `safety: 'none'`); `'tjs'` (or a bare string) is native TJS (modes ON). `dialect` is authoritative; otherwise inferred from the `fromTS` annotation / `vmTarget`. For file-based tooling, use the canonical extension→dialect helpers `dialectForFilename(filename)` / `sourceKindForFilename(filename)` from `tjs-lang/lang` (`.js`/`.mjs`/`.cjs` → `'js'`, `.tjs` → `'tjs'`, `.ts` → use `fromTS`). This upholds the **TJS ⊇ JS** invariant — see `PRINCIPLES.md`. (`.tjs` is a _better_ language, not just JS; choosing it is the opt-in to the modes.)
- **Bang access**: `x!.foo` — returns MonadicError if `x` is null/undefined, otherwise bare `x.foo`. Chains propagate: `x!.foo!.bar`.
- **Type/Generic/FunctionPredicate**: Three declaration forms for runtime type predicates
- **`const!`**: Compile-time immutability, zero runtime cost
- **Equality**: `==`/`!=` in native TJS (via `Eq`/`NotEq` under `TjsEquals`) are **footgun-free `===`** — they unwrap boxed primitives (`new Boolean(false) == false`) and treat `null`/`undefined` as equal, but do **NOT** coerce types (`'5' != 5`, `'' != false`) and are **NOT structural** (distinct objects/arrays are distinct: `{a:1} != {a:1}` — a real distinction, and structural `==` would be a silent O(n) hit). For deep structural comparison use the `Is`/`IsNot` function (or a type's `.Equals` hook). `===`/`!==` = strict identity.
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

### Playground Examples

The playground (https://tjs-platform.web.app) shows interactive TJS and AJS examples in a navigable sidebar. Examples live as markdown files with embedded code blocks, NOT as raw `.tjs` files.

**Where they live:**

- TJS playground examples: `guides/examples/tjs/<slug>.md`
- AJS playground examples: `guides/examples/ajs/<slug>.md` (assumed parallel structure)

**File format:**

<!-- prettier-ignore -->
```markdown
<!--{"section":"tjs","type":"example","group":"basics","order":16}-->

# Example Title

Short intro paragraph (plain markdown).

​```tjs
/*#
## Optional H2 — markdown rendered above the code in the playground
Explain the concept here. Use markdown freely.
*/

// Then the actual TJS code
function demo() { ... }

/**
 * JSDoc-style /** ... *​/ blocks are also extracted as docs.
 * Leading ` * ` is stripped from each line; the rest renders as markdown.
 * Use this when porting TS source where JSDoc is already idiomatic.
 */

test 'a description' {
  expect(...).toBe(...)
}
​```
```

Frontmatter fields: `section` (`tjs`/`ajs`), `type: "example"`, `group` (`basics`/`advanced`/etc.), `order` (numeric, controls sidebar position). The H1 becomes the example title in the nav.

**Registration:**

Examples are auto-discovered by `bin/docs.js` (run via `bun run docs`), which walks the markdown tree, parses frontmatter, extracts the `tjs`/`ajs` code block, and writes the result to `demo/docs.json`. The demo loads `docs.json` at runtime — no other registration step.

**After adding/editing an example:** run `bun run docs` and commit the regenerated `demo/docs.json` alongside the `.md` file. (The docs builder also runs as part of `bun run build:demo` and `bun run deploy`.)

**Testing playground examples:**

The CLI (`bun src/cli/tjs.ts run`) does NOT inject the test-block `expect` harness — that's a playground-only thing. So running an extracted code block via the CLI prints "expect is not defined" for any `test { expect(...) }` blocks even though they pass in the playground. To verify an example:

1. **Console-log behavior** (works via CLI): extract the `tjs` code block and run it.

   ````bash
   awk '/^```tjs$/{flag=1; next} /^```$/{flag=0} flag' \
     guides/examples/tjs/<slug>.md > /tmp/example.tjs
   bun src/cli/tjs.ts run /tmp/example.tjs
   ````

   Verify the printed output matches the expected behavior shown in the example's comments.

2. **Test blocks**: spin up the dev server (`bun run start`) and load the example in the playground UI to confirm tests pass under the real `expect` harness.

3. **Frontmatter / registration**: after `bun run docs`, grep `demo/docs.json` for the slug to confirm it was picked up with the right `section`/`group`/`order`.

### Additional Directories

- `tjs-src/` — TJS runtime written in TJS itself (self-hosting)
- `guides/` — Usage patterns, benchmarks, examples (`patterns.md`, `benchmarks.md`, `tjs-examples.md`)
- `examples/` — Standalone TJS example files (`hello.tjs`, `datetime.tjs`, `generic-demo.tjs`)
- `editors/` — Syntax highlighting for Monaco, CodeMirror, Ace, VSCode

### Additional Documentation

- `PRINCIPLES.md` — **non-negotiable language invariants**: options-off TJS ⊇ JS, and TJS ⊇ AJS. A richer layer may do _more_ with the same source but must never make subset-legal code _illegal_ (e.g. un-runnable signature tests are inconclusive, not errors). Read before changing parser/transpiler acceptance or signature-test behavior; a subset violation is a bug.
- `llms.txt` — agent-facing navigation index (ships in npm bundle); points to docs and source entry points
- `guides/footguns.md` — JS footguns TJS fixes (boxed-primitive truthiness, `==` coercion, `typeof null`, uninitialized `let`, etc.). Demo: `examples/js-footguns-fixed.tjs`.
- `guides/playground-imports.md` — how the playground/dev-server resolves bare imports: TFS service worker, default JSDelivr `/+esm` routing, esm.sh allowlist for peer-dep packages (React), CDN hints (`jsdelivr/`, `esmsh/`, `unpkg/`, `github/`), and full-URL passthrough.
- `README.md` — Project intro, install, quick start
- `DOCS-TJS.md` — TJS language guide
- `DOCS-AJS.md` — AJS runtime guide
- `TJS-FOR-JS.md` — TJS guide for JavaScript developers (syntax differences, gotchas)
- `TJS-FOR-TS.md` — TJS guide for TypeScript developers (migration, interop)
- `CONTEXT.md` — Architecture deep dive
- `AGENTS.md` — Agent workflow instructions (session-completion checklist, push-before-done rule)
- `TODO.md` — Open work, organized by area; move items to the **Completed** section when done
- `PLAN.md` — Roadmap
- `DOCS-WASM.md` — Canonical WASM reference: inline blocks, `wasm function` declarations, memory model, cross-file composition, `tjs-lang/linalg`, current limitations
- `wasm-library-plan.md` — Cross-file WASM library design (composable `wasm function` declarations, transpile-time module composition, linalg stdlib). **Shipped in v0.8.0** — all phases (0.5, 0.75, 1, 1.5, 2, 3, 4, 5 MVP, 6) complete. See the plan for what's deferred (linalg expansion, i32/f32/v128 return types, etc.).
- `MANIFESTO-BUILDER.md` / `MANIFESTO-ENTERPRISE.md` — Positioning docs (audience-targeted pitches)
- `benchmarks.md` — Top-level benchmark results (separate from `guides/benchmarks.md`)

### Keeping This File and `llms.txt` Current

Update both files when you change something an agent needs to discover:

- **New top-level markdown doc** → add to "Additional Documentation" here AND to the appropriate section of `llms.txt`.
- **New package entry point** (subpath export in `package.json`) → add to "Package Entry Points" here AND to "Package entry points" in `llms.txt`.
- **New CLI command or `bun run` script** → add to "Common Commands".
- **Renamed or moved key source file** → update "Key Source Files" here AND "Source map" in `llms.txt`.
- **New language mode / safety directive** → add to the TJS Syntax Reference section.
- **New playground example** → add to `guides/examples/{tjs,ajs}/<slug>.md`, then `bun run docs` to regenerate `demo/docs.json`. See "Playground Examples" above.

Skip stale-prone precision (exact line counts, file sizes) for new entries — they drift silently. The existing `~3024` etc. are kept current opportunistically, not on every commit.

### Tracking Work

Work is tracked in plain markdown — no external issue tracker. Open items live in `TODO.md` (organized by area). When you start a task, find or add the relevant entry; when you finish, check the box and (for substantial work) move it to the Completed section with a short note.

### Landing the Plane (Session Completion Checklist)

See `AGENTS.md` for the canonical session-completion checklist. Hard rule: work is not complete until `git push` succeeds — never stop before pushing, never `--no-verify` to bypass hooks.

### Common Gotchas

- **`tjs(source)` returns an object, not a string.** It returns `{ code, types, metadata, testResults, ... }` — use `.code` for the transpiled JS string.
- **Prettier mangles bare-expression code blocks in markdown.** Code blocks tagged ` ```js` get reformatted; bare expressions like `'5' == 5` and `[1] == 1` on consecutive lines collapse into one expression with ASI guards. Use `<!-- prettier-ignore -->` directly above the code fence to preserve hand-formatted JS examples (or tag the block as `text`/`tjs`/`ts` instead — Prettier ignores those).
- **`tjs-lang` package alias only works inside the project** (set in `bunfig.toml`). Test scripts written in `/tmp` won't resolve `import { tjs } from 'tjs-lang/lang'` to the local source — they'll resolve to whatever's in `node_modules`. For ad-hoc experiments outside the repo, use absolute paths: `import { tjs } from '/Users/.../tjs-lang/src/lang/index'`.

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
