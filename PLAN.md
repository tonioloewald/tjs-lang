# TJS Roadmap

## Philosophy

TJS is a practical language that targets multiple runtimes. The type system is _descriptive_ rather than _prescriptive_ - types explain what they are, validate at runtime, and degrade gracefully. No TypeScript gymnastics.

The runtime is JavaScript today, but it's _our_ JavaScript - the sandboxed expression evaluator, the fuel-metered VM. When we target LLVM or SwiftUI, we compile our AST, not arbitrary JS.

---

## Executive Summary

TJS delivers **runtime type safety with near-zero overhead**. The key insight: single structured arguments enable inline validation that's 20x faster than schema interpretation.

### The Performance Story

| Mode | Overhead | Use Case |
|------|----------|----------|
| `safety none` | **1.0x** | Production - metadata only, no wrappers |
| `safety inputs` | **~1.5x** | Production with validation (single-arg objects) |
| `safety inputs` | ~11x | Multi-arg functions (schema-based) |
| `safety all` | ~14x | Debug - validates inputs and outputs |
| `(!) unsafe` | **1.0x** | Hot paths - explicit opt-out |
| WASM blocks | **<1.0x** | Heavy computation - faster than JS |

**The happy path**: Single structured argument + inline validation = **1.5x overhead** with full runtime type checking.

### Why Single-Arg Objects Win

```typescript
// TJS: pleasant syntax, fast validation (1.5x)
function createUser(input: { name: 'Alice', email: 'a@b.com', age: 30 }) {
  return save(input)
}

// TypeScript: painful syntax, no runtime safety (1.0x but unsafe)
function createUser({ name, email, age }: { name: string, email: string, age: number }) {
  return save({ name, email, age })
}
```

TJS generates inline type checks at transpile time:
```javascript
if (typeof input !== 'object' || input === null ||
    typeof input.name !== 'string' ||
    typeof input.email !== 'string' ||
    typeof input.age !== 'number') {
  return { $error: true, message: 'Invalid input', path: 'createUser.input' }
}
```

No schema interpretation. JIT-friendly. **20x faster** than Zod/io-ts style validation.

### What You Get

- **Runtime safety in production** - 1.5x overhead is acceptable
- **Autocomplete always works** - `__tjs` metadata attached regardless of safety
- **Monadic errors** - type failures return error objects, not exceptions
- **Escape hatches** - `(!)` for hot functions, `unsafe {}` for hot blocks
- **WASM acceleration** - `wasm {}` blocks for compute-heavy code

### The Design Alignment

The idiomatic way to write TJS (single structured argument) is also the fastest way. Language design and performance goals are aligned - you don't have to choose between clean code and fast code.

### Future: Compile to LLVM

The AST is the source of truth. Today we emit JavaScript. Tomorrow:
- LLVM IR for native binaries
- Compete with Go and Rust on performance
- Same type safety, same developer experience

---

## Technical Aspects

### Performance

**Runtime Validation Overhead:**
```
Plain function call:     0.5ms / 100K calls (baseline)
safety: 'none':          0.5ms / 100K calls (~1.0x) - no wrapper
safety: 'inputs':        0.8ms / 100K calls (~1.5x) - inline validation*
safety: 'all':           7.0ms / 100K calls (~14x) - validates args + return

* For single-arg object types (the happy path)
  Multi-arg functions use schema-based validation (~11x)
```

**Why single-arg objects are fast:**
```typescript
// The happy path - single structured argument
function process(input: { x: 0, y: 0, name: 'default' }) {
  return input.x + input.y
}

// Generates inline type checks (20x faster than schema interpretation):
if (typeof input !== 'object' || input === null ||
    typeof input.x !== 'number' ||
    typeof input.y !== 'number' ||
    typeof input.name !== 'string') {
  return { $error: true, message: 'Invalid input', path: 'process.input' }
}
```

This makes `safety: 'inputs'` viable for **production** with single-arg patterns.

**Why `safety: 'none'` is free:**
- `wrap()` attaches `__tjs` metadata but returns original function
- No wrapper function, no `fn.apply()`, no argument spreading
- Introspection/autocomplete still works - metadata is always there

**The `(!) unsafe` marker:**
```typescript
function hot(! x: number) -> number { return x * 2 }
```
- Returns original function even with `safety: inputs`
- Use for hot paths where validation cost matters
- Autocomplete still works (metadata attached)

**WASM blocks:**
```typescript
function compute(x: 0, y: 0) {
  const scale = 2
  return wasm {
    return x * y * scale  // Compiles to WebAssembly
  }
}
// Variables (x, y, scale) captured automatically from scope
// Same code runs as JS fallback if WASM unavailable
```

With explicit fallback (when WASM and JS need different code):
```typescript
function transform(arr: []) {
  wasm {
    for (let i = 0; i < arr.length; i++) { arr[i] *= 2 }
  } fallback {
    return arr.map(x => x * 2)  // Different JS implementation
  }
}
```

WASM compilation is implemented as a proof-of-concept:
- Parser extracts `wasm { }` blocks with automatic variable capture
- Compiler generates valid WebAssembly binary from the body
- Runtime dispatches to WASM when available, body runs as JS fallback
- Benchmark: ~1.3x faster than equivalent JS (varies by workload)

The POC supports: arithmetic (+, -, *, /), captured variables, parentheses.
Full implementation would add: loops, conditionals, typed arrays, memory access.

### Debugging

**Source locations in errors:**
```typescript
{
  $error: true,
  message: 'Expected string but got number',
  path: 'greet.name',           // which parameter
  loc: { start: 15, end: 29 },  // source position
  stack: ['main', 'processUser', 'greet.name']  // call chain (debug mode)
}
```

**Debug mode:**
```typescript
configure({ debug: true })
// Errors now include full call stacks
```

**The `--debug` flag (planned):**
- Functions know where they're defined
- Errors include source file and line
- No source maps needed - metadata is inline

### For Human Coding

**Intuitive syntax:**
```typescript
// Types ARE examples - self-documenting
function greet(name: 'World', times: 3) -> string {
  return (name + '!').repeat(times)
}

// Autocomplete shows: greet(name: string, times: number) -> string
// With examples: greet('World', 3)
```

**Module-level safety:**
```typescript
safety none  // This module skips validation

function hot(x: number) -> number {
  return x * 2  // No wrapper, but autocomplete still works
}
```

**Escape hatches:**
```typescript
// Per-function: skip validation for this function
function critical(! data: object) { ... }

// Per-block: skip validation for calls inside
unsafe {
  for (let i = 0; i < 1000000; i++) {
    hot(i)  // No validation overhead
  }
}
```

### For Agent Coding

**Introspectable functions:**
```typescript
greet.__tjs = {
  params: { name: { type: 'string', required: true, example: 'World' } },
  returns: { type: 'string' }
}

// Agents can read this to understand function signatures
// LLMs can generate function call schemas automatically
```

**Monadic errors:**
```typescript
const result = riskyOperation()
if (result.$error) {
  // Error is a value, not an exception
  // Agent can inspect and handle gracefully
}
```

**Fuel metering:**
```typescript
// Agents run with fuel limits - can't run forever
vm.run(agentCode, { fuel: 10000 })
```

---

## 1. Type() Builtin

A new builtin for defining types with descriptions and runtime validation.

### Forms

```typescript
// Full form: description + predicate
const ZipCode = Type('5-digit US zip code', (s) => /^\d{5}$/.test(s))
const PositiveInt = Type(
  'positive integer',
  (n) => Number.isInteger(n) && n > 0
)
const MatchingPasswords = Type(
  'passwords must match',
  (o) => o.password === o.confirmPassword
)

// Schema shorthand (common case)
const Email = Type('valid email', s.string.email)
const Age = Type(s.number.min(0).max(150))

// Description optional when schema is self-explanatory
const UserId = Type(s.string.uuid)
```

### Why

- **Self-documenting**: description IS the type for humans and LLMs
- **Runtime-checkable**: predicate runs when needed
- **Composable**: union/intersection combine predicates
- **Replaces regex-as-type**: more expressive, leaves regexes for actual patterns
- **Escapes TypeScript corner cases**: no `Pick<Omit<Partial<Required<...>>>>`

### Predicates

Predicates are sync JS functions that run in our runtime:

- Pure expression evaluation (same `$expr` nodes we have)
- No async, no IO - type checks are in the hot path
- Sandboxed: no prototype access, no globals
- Portable: can be translated to any target

### Simple Syntax Sugar Remains

```typescript
// These still work - Type() is the escape hatch, not the default
function greet(name: string, times: number = 1) { ... }
function delay(ms = 1000) { ... }
function fetch(url: string, timeout = +5000) { ... }
```

## 2. Conditional Compilation with target()

Explicit target blocks for platform-specific code.

```typescript
target(browser) {
  document.body.appendChild(el)
}

target(node) {
  process.stdout.write(str)
}

target(browser & debug) {
  console.log('Debug mode in browser')
}

target(browser | node) {
  // Runs in either
}
```

### Targets

**Current:**

- `browser`
- `node`
- `bun`
- `debug`
- `production`

**Future:**

- `swiftui`
- `android`
- `ios`
- `win64`
- `llvm`

### Composition

- `&` - both must match
- `|` - either matches
- `target(production)` strips `test {}` blocks and debug code

## 3. Monadic Errors and Debug Mode

### try {} Without catch

Bare `try` blocks convert to monadic error returns:

```typescript
try {
  let data = riskyOperation()
  process(data)
}
// No catch - transforms to:
// if error, return { $error: true, message, op, cause }
```

Errors become values, not exceptions. Subsequent code is skipped (monadic flow).

### AgentError Introspection

Errors carry full context:

```typescript
{
  $error: true,
  message: 'Connection refused',
  op: 'httpFetch',              // which atom failed
  cause: <original exception>,  // for debugging
  // With --debug:
  source: 'orders.tjs:47:3',    // exact location
  callStack: [                  // how we got here
    'ship() at orders.tjs:47:3',
    'processOrder() at checkout.tjs:123:5',
    'handleSubmit() at form.tjs:89:12'
  ]
}
```

### --debug Flag

When transpiled with `--debug`:

- Functions know what they were called and where they came from
- Errors include source locations and call stacks
- Runtime can reconstruct the full path to failure

```typescript
// With --debug, errors show:
// Error: Invalid ZipCode at ship() (orders.tjs:47:3)
//   called from processOrder() (checkout.tjs:123:5)
//   called from handleSubmit() (form.tjs:89:12)
```

### Current State

- ✅ Monadic errors (AgentError class)
- ✅ try {} without catch transforms
- ⏳ Error introspection (op and message, not full stack)
- ❌ --debug source mapping
- ❌ Call stack in errors

## 4. test('description') {} Blocks

Inline tests that hoist to bottom of file for execution.

```typescript
const ZipCode = Type('5-digit US zip code', (s) => /^\d{5}$/.test(s))

test('ZipCode validates correctly') {
  assert(ZipCode.check('12345'))
  assert(!ZipCode.check('1234'))
  assert(!ZipCode.check('123456'))
  assert(!ZipCode.check('abcde'), 'letters should fail')
}

function ship(to: ZipCode, quantity: PositiveInt) {
  // ...
}

test('ship requires valid zip and quantity') {
  ship('12345', 1)  // ok
  assertThrows(() => ship('bad', 1))
}
```

### Failure Output

```
FAIL: ZipCode validates correctly
  assert(!ZipCode.check('1234'))  ← auto-generated from source

FAIL: ship requires valid zip and quantity
  letters should fail  ← custom message when provided
  assert(!ZipCode.check('abcde'), 'letters should fail')
```

### Rules

- `test('description')` - description required, explains what's being tested
- `assert(expr)` - auto-describes from source code on failure
- `assert(expr, 'reason')` - custom message overrides auto-description
- Tests live next to the code they test
- Hoisted to bottom for execution order
- Stripped in `target(production)`
- Like Rust's `#[test]` but inline

## 5. Pragmatic Native Types

Trust constructor names for platform types:

```typescript
// Instead of shipping 50KB of DOM type definitions:
// - el instanceof HTMLElement checks constructor.name
// - If someone lies about their constructor, that's on them
```

This applies to:

- DOM types (HTMLElement, Event, etc.)
- Node types (Buffer, Stream, etc.)
- Platform types (SwiftUI views, Android widgets)

## 6. Future: Multi-Target Emission

The same TJS source compiles to:

- JavaScript (current)
- LLVM IR (native binaries)
- Swift (iOS/macOS)
- Kotlin (Android)

Platform builtins vary by target:

- `browser`: `document`, `window`, `fetch`
- `swiftui`: `VStack`, `HStack`, `Text`, `Button`
- `android`: `View`, `TextView`, `LinearLayout`

The AST is the source of truth. Targets are just emission strategies.

---

## Implementation Status

| #   | Feature                | Status | Notes                                          |
| --- | ---------------------- | ------ | ---------------------------------------------- |
| 1   | Type()                 | ⏳     | Integrated with runtime validation             |
| 2   | target()               | ❌     | Conditional compilation                        |
| 3   | Monadic Errors         | ✅     | AgentError with path, loc, debug call stacks   |
| 4   | test() blocks          | ⏳     | Basic extraction exists                        |
| 5   | Pragmatic natives      | ⏳     | Some constructor checks exist                  |
| 6   | Multi-target           | ❌     | Future - JS only for now                       |
| 7   | Safety levels          | ✅     | none/inputs/all + (!)/(?) + unsafe {}          |
| 8   | Module-level safety    | ✅     | `safety none` directive parsed and passed      |
| 9   | Single-pass            | ⏳     | CLI exists, not unified                        |
| 10  | Module system          | ❌     | Versioned imports                              |
| 11  | Autocomplete           | ✅     | CodeMirror integration, globals, introspection |
| 12  | Eval()                 | ⏳     | Expression eval exists, not exposed            |
| 13  | Function introspection | ✅     | __tjs metadata with params, returns, examples  |
| 14  | Generic()              | ❌     | Runtime-checkable generics                     |
| 15  | Asymmetric get/set     | ❌     | Broader input, narrower output                 |
| 16  | `==` that works        | ❌     | Structural equality + .Equals hook             |
| 17  | WASM blocks            | ✅     | POC: parser + compiler for simple expressions  |

## Implementation Priority

| Priority | Feature                   | Why                        |
| -------- | ------------------------- | -------------------------- |
| 1        | **Type()**                | Foundation for type system |
| 2        | **Autocomplete**          | Do or die - dev experience |
| 3        | **test() blocks**         | TDD, in-file productivity  |
| 4        | **--debug / call stacks** | Error experience           |
| 5        | **Eval()**                | Expose existing work       |
| 6        | **target()**              | Conditional compilation    |
| 7        | **Safety flags**          | Polish                     |
| 8        | **Single-pass**           | Polish                     |
| 9        | **Modules**               | Can wait                   |

## 7. Safety Levels and Flags

### Defaults: Safe and Correct

By default, TJS is strict:

- All type contracts enforced
- Lint errors block compilation
- Unknown types are errors

### Escape Hatches

```bash
tjs build app.tjs                    # strict, safe defaults
tjs build app.tjs --allow-unsafe     # let nasty TS libs pass through
tjs build app.tjs --yolo             # bypass all safeguards (--just-fucking-doit)
```

- `--allow-unsafe`: Complex/unknown types become best-effort runtime checks, warnings not errors
- `--yolo`: Skip all validation, emit anyway (for when you know what you're doing)

### Lint Integration

Lint errors block safe builds. Not warnings - errors. If you want to ship broken code, use `--yolo`.

## 8. Single-Pass Pipeline

One command does everything:

```bash
tjs build app.tjs
```

In a single pass:

1. **Lint** - catch errors early
2. **Transpile** - emit target code
3. **Test** - run inline tests (unless `--no-test`)
4. **Docs** - extract documentation from types and descriptions

No separate `tjs lint && tjs build && tjs test && tjs docs`. One pass, all the information is right there.

## 9. Module System

### Versioned Imports (Native Approach)

```typescript
import { Thing } from 'https://pkg.example.com/thing@1.2.3/mod.tjs'
import { Other } from './local.tjs'
```

- URLs with versions are the native import mechanism
- No node_modules, no package.json resolution dance
- Imports are cached by URL+version
- Works like Deno, but we got here independently

### Bundler Compatibility

TJS also works inside conventional bundlers:

- Emits standard ES modules
- Can be a webpack/vite/esbuild plugin
- Or replace bundling entirely with versioned imports

Your choice. We don't force either approach.

## 10. Autocomplete by Introspection

IDE support via runtime introspection, not static `.d.ts` files.

### Heuristic Levels (Progressive Fallback)

**Level 0: Local symbols** (instant, always)

- Scan current file for identifiers
- Function names, variable names, parameter names
- Known atoms
- Like BBEdit - fast, useful, no dependencies

**Level 1: Type-aware** (fast, from syntax)

- Parameter `name: 'Sarah'` → string, offer string methods
- Variable `x: 17` → number
- No runtime needed, just syntax analysis

**Level 2: Runtime introspection** (when idle)

- Actually run code with mocks up to cursor
- Get real shapes from execution
- Nice to have, not blocking

### Strategy

- Start fast (Level 0+1), upgrade async in background
- Typing rapidly? Stay at Level 0
- Paused 200ms? Try Level 1
- Paused 500ms? Try Level 2
- Cache aggressively - same signature = same completions

### CSS: Use the Browser

CSS autocomplete is pathological to implement manually - hundreds of properties, thousands of values, vendor prefixes. The browser already knows all of this.

```typescript
// Let the browser do the work
const style = document.createElement('div').style
Object.keys(style) // Every CSS property
CSS.supports('display', 'grid') // Validate values
```

Don't ship CSS type definitions. Query the browser at runtime for:

- Property names
- Valid values for each property
- Vendor prefix variants

### Versioned Imports Make This Insane

```typescript
import { ship } from 'https://pkg.example.com/shipping@2.0.0/mod.tjs'
```

- Module already transpiled (cached by URL+version)
- Already introspected (we know its exports)
- Immutable (version pinned, never changes)
- Autocomplete for `ship.` is instant forever

No node_modules crawling. No LSP server eating 4GB RAM. One file, one unit, instant knowledge.

### Non-Goals

- External LSP dependencies
- TypeScript language server
- Crawling dependency graphs

## 11. Eval() - Safe Expression Evaluation

A builtin for evaluating expressions with fuel limits:

```typescript
// Low default fuel - won't run away
Eval('2 + 2') // ~100 fuel default

// Explicitly allow more for complex work
Eval('fibonacci(20)', { fuel: 1000 })

// Restrict for untrusted input
Eval(userInput, { fuel: 10 })
```

### Why

- Same sandboxed evaluator we already have, exposed as builtin
- Safe by default - low fuel limit prevents runaway computation
- No `eval()` - this is AST evaluation, not string execution
- Fuel exhaustion returns error, doesn't throw

### Options

```typescript
Eval(expression, {
  fuel: 100, // max fuel (default: 100)
  context: {}, // variables available to expression
  timeout: 1000, // ms timeout (default: fuel * 10)
})
```

## Ideas Parking Lot

### Type Flow Optimization (Compile-Time)

Skip redundant type checks when types are already proven. The transpiler tracks type information through the call graph:

**Scenario 1: Chained Functions**

```typescript
function validate(x: number) -> number { return x * 2 }
function process(x: number) -> number { return x + 1 }

// Source
const result = process(validate(input))

// Naive: validate checks input, process checks validate's output
// Optimized: validate's return type matches process's input - skip second check

// Transpiled (optimized)
const _v = validate(input)  // validates input once
const result = process.__unchecked(_v)  // skips redundant check
```

**Scenario 2: Loop Bodies**

```typescript
function double(x: number) -> number { return x * 2 }
const nums: number[] = [1, 2, 3]

// Source
nums.map(double)

// Naive: double validates x on every iteration (3 checks)
// Optimized: nums is number[], so each element is number - skip all checks

// Transpiled (optimized)  
nums.map(double.__unchecked)  // zero validation overhead in loop
```

**Scenario 3: Subtype Relationships**

```typescript
const PositiveInt = Type('positive integer', n => Number.isInteger(n) && n > 0)
function increment(x: number) -> number { return x + 1 }

const val: PositiveInt = 5
increment(val)  // PositiveInt is subtype of number - skip check
```

**Implementation:**

1. Track return types through call graph
2. Generate `fn.__unchecked` variants that skip input validation
3. Emit unchecked calls when input type is proven
4. Array/iterable element types flow into loop bodies
5. Subtype relationships allow broader → narrower without checks

**Performance Target:**

- Current `wrap()`: ~17x overhead
- With type flow: ~1.2x overhead (matching safe TJS functions)
- Hot loops: 0x overhead (unchecked path)

### JIT-Compiled Type Predicates

We own the language, so we can optimize hot type checks:

1. **Interpreted mode** (default): Predicate runs as-is
2. **Compiled mode** (hot path): If a Type validates thousands of times, JIT-compile it

```typescript
const ZipCode = Type('5-digit zip', (s) => /^\d{5}$/.test(s))

// First N calls: interpreted, collecting stats
// Call N+1: "this is hot, compile it"
// Now it's TypeBox-fast without ahead-of-time compilation
```

For `target(production)`, we could inline validators entirely:

```typescript
// Source
function ship(to: ZipCode) { ... }

// Transpiled (production)
function ship(to) {
  if (typeof to !== 'string' || !/^\d{5}$/.test(to))
    throw new TypeError('expected 5-digit zip')
  ...
}
```

No runtime Type object, no .check() call - just inlined validation.

Unlike TypeBox (which precompiles via eval and can't handle dynamic types), we can do both interpreted and compiled because we control the compiler.

---

## 12. Function Introspection

Functions are self-describing. A single signature provides types, examples, and tests:

```typescript
function checkAge(name: 'Anne', age = 17) -> { canDrink: false } {
  return { canDrink: age >= 21 }
}
```

From this you get:

| Extracted         | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| **Types**         | `name: string`, `age: number`, returns `{ canDrink: boolean }` |
| **Examples**      | `name = 'Anne'`, `age = 17`, output `{ canDrink: false }`      |
| **Implicit test** | `checkAge('Anne', 17)` should return `{ canDrink: false }`     |
| **Docs**          | The signature IS the documentation                             |

### Runtime Metadata

Every function carries introspectable metadata:

```typescript
checkAge.meta
// {
//   name: 'checkAge',
//   params: [
//     { name: 'name', type: 'string', example: 'Anne' },
//     { name: 'age', type: 'number', example: 17, default: 17 }
//   ],
//   returns: { type: { canDrink: 'boolean' }, example: { canDrink: false } },
//   source: 'users.tjs:42:1'  // in debug builds
// }
```

### Debug Builds

With `--debug`, functions know where they are and where they were called from:

```typescript
// Error output includes full trace:
// Error: Invalid ZipCode at ship() (orders.tjs:47:3)
//   called from processOrder() (checkout.tjs:123:5)
//   called from handleSubmit() (form.tjs:89:12)
```

### No Source Maps

Source maps are a hack - external files that get out of sync, break in large builds, and require tooling support. TJS replaces them entirely:

- The function _knows_ where it's from (`fn.meta.source`)
- Can't get out of sync (it's part of the function)
- No external files, no tooling required
- Works in production without `.map` files

### Why This Matters

- **Auto-generated tests**: Run with examples, expect example output
- **API documentation**: Always accurate, extracted from source
- **LLM tool schemas**: Generate OpenAI function calling format automatically
- **Debug traces**: Full path to failure with source locations
- **Zero extra effort**: You write the function, you get all of this

## 13. Generic() Builtin

Turing completeness by design, not by accident. TypeScript's generics grew into an unreadable type-level programming language. TJS assumes Turing completeness from the start - the predicate is just code:

Following the `Type()` pattern, generics are runtime-inspectable and predicate-validated:

```typescript
const List = Generic(
  'homogeneous list of items',
  [T],
  (x, [T]) => Array.isArray(x) && x.every(item => T.check(item))
)

const Map = Generic(
  'key-value mapping',
  [K, V = any],
  (x, [K, V]) => x instanceof Map && [...x.keys()].every(k => K.check(k))
)

// Usage
const strings: List(string) = ['a', 'b', 'c']
const lookup: Map(string, number) = new Map([['age', 42]])
```

### Why

- **Runtime-checkable**: Not erased like TypeScript generics
- **Self-documenting**: Description for humans and LLMs
- **Composable**: Predicates can do real validation
- **Practical**: Makes complex generics achievable without gymnastics

Converting convoluted TypeScript generics (`Pick<Omit<Partial<...>>>`) is nice-to-have, not a priority.

## 14. Asymmetric Get/Set

Properties that accept a broader type on write but return a narrower type on read:

```typescript
// Setter accepts multiple types, getter returns normalized type
obj.timestamp = '2024-01-15' // SET accepts: string | number | Date
obj.timestamp // GET returns: Date (always normalized)

// DOM example
el.style.color = 'red' // SET accepts: string | null
el.style.color // GET returns: string
```

This is common in real APIs but TypeScript makes it painful. TJS supports it natively.

## 15. `==` That Works

JavaScript's `==` is broken (type coercion chaos). TJS fixes it:

| Operator | Behavior                                                                                  |
| -------- | ----------------------------------------------------------------------------------------- |
| `==`     | **Value equality** - structural comparison for arrays/objects, calls `.Equals` if defined |
| `===`    | **Identity** - same object reference (rarely needed)                                      |

```typescript
;([1, 2] == [1, 2][(1, 2)]) === // true (structural)
  [1, 2] // false (different objects)

const p1 = {
  x: 1,
  Equals(o) {
    return this.x == o.x
  },
}
const p2 = { x: 1 }
p1 == p2 // true (via .Equals hook)
p1 === p2 // false (different objects)
```

### Rules

1. If left has `.Equals`, call `left.Equals(right)`
2. If right has `.Equals`, call `right.Equals(left)`
3. Arrays/objects: recursive structural comparison
4. Primitives: strict equality (no coercion)

## 16. Death to Semicolons

Newlines are meaningful. This:

```typescript
foo()
```

Is **two statements** (`foo` and `()`), not a function call `foo()`.

This eliminates:

- Defensive semicolons
- ASI gotchas
- The entire "semicolon debate"

The only code this breaks is pathological formatting that nobody writes intentionally.

## 17. Polyglot Blocks (WASM, Shaders, etc.)

Target-specific code blocks with automatic variable capture and fallback:

```typescript
// WASM for performance-critical path - variables captured automatically
function matmul(vertices: Float32Array, matrix: Float32Array) {
  wasm {
    for (let i = 0; i < vertices.length; i += 3) {
      // matrix multiply using vertices and matrix from scope
    }
  }
  // Body runs as JS if WASM unavailable
}

// With explicit fallback when implementations differ:
function transform(data: Float32Array) {
  wasm {
    // WASM-optimized in-place mutation
    for (let i = 0; i < data.length; i++) { data[i] *= 2 }
  } fallback {
    // JS uses different approach
    return data.map(x => x * 2)
  }
}

// GPU shader (future)
glShader {
  gl_Position = projection * view * vec4(position, 1.0)
  fragColor = color
} fallback {
  // CPU fallback
}

// Debug-only code (stripped in production)
debug {
  console.log('state:', state)
  validateInvariants()
}
// No fallback needed - just doesn't run in production
```

### Pattern

```
target(args?) {
  // target-specific code (compiled/translated)
} fallback? {
  // universal TJS fallback (optional for some targets)
}
```

### Targets

| Target     | Compiles to            | Fallback | Use case                  |
| ---------- | ---------------------- | -------- | ------------------------- |
| `wasm`     | WebAssembly            | Required | CPU-intensive computation |
| `glShader` | GLSL                   | Required | GPU graphics              |
| `metal`    | Metal Shading Language | Required | Apple GPU                 |
| `debug`    | TJS (stripped in prod) | None     | Debugging, invariants     |

### Why

- **Performance**: WASM/GPU where it matters, TJS everywhere else
- **Graceful degradation**: Fallback ensures code always runs
- **Single source**: Don't maintain separate WASM/shader files
- **Type-safe boundary**: Args translated automatically at the boundary

## 18. Classes and Components

TJS embraces classes, but eliminates JS footguns and enables cross-platform UI components.

### Death to `new`

The `new` keyword is redundant ceremony. TJS handles it automatically:

```typescript
class User {
  constructor(public name: string) {}
}

// Both work identically in TJS:
const u1 = User('Alice')      // TJS way - clean
const u2 = new User('Alice')  // Lint warning: "use User() instead of new User()"
```

If you call `Foo()` and `Foo` is a class, TJS calls it with `new` internally. No more "Cannot call a class as a function" errors.

### Component Base Class

`Component` is the platform-agnostic UI primitive:

```typescript
class MyDropdown extends Component {
  // Shared logic - runs everywhere
  items: string[] = []
  selectedIndex: number = 0
  
  select(index: number) {
    this.selectedIndex = index
    this.emit('change', this.items[index])
  }
  
  // Platform-specific blocks
  web() {
    // CSS, DOM events, ARIA attributes
    this.style = `
      .dropdown { position: relative; }
      .dropdown-menu { position: absolute; }
    `
  }
  
  swift() {
    // SwiftUI modifiers, gestures
    Menu {
      ForEach(items) { item in
        Button(item) { select(items.indexOf(item)) }
      }
    }
  }
  
  android() {
    // Jetpack Compose
    DropdownMenu(expanded = expanded) {
      items.forEach { item ->
        DropdownMenuItem(onClick = { select(items.indexOf(item)) }) {
          Text(item)
        }
      }
    }
  }
}
```

### Web Components (HTMLElement)

For web, `extends HTMLElement` auto-registers custom elements:

```typescript
class MyDropdown extends HTMLElement {
  // Automatically registers <my-dropdown>
}

class UserCard extends HTMLElement {
  // Automatically registers <user-card>
}

// Error: can't infer tag name
class Thang extends HTMLElement { }  // "can't infer tag-name from 'Thang'"

// OK: modest names work
class MyThang extends HTMLElement { }  // <my-thang>
```

**Key features:**

1. **Auto-registration**: Class name → tag name (`MyDropdown` → `my-dropdown`)
2. **Inferrable names required**: Must be PascalCase with multiple words
3. **Hot-reloadable**: Components are hollow shells - redefining rebuilds all instances
4. **Smart inheritance**: ARIA roles and behaviors wired automatically

### Why Hollow Components?

The web component registry is a source of pain - you can't redefine elements. TJS sidesteps this:

```typescript
// First definition
class MyButton extends HTMLElement {
  render() { return '<button>v1</button>' }
}

// Later redefinition (hot reload, live coding)
class MyButton extends HTMLElement {
  render() { return '<button>v2</button>' }
}
// All existing <my-button> elements rebuild with new implementation
```

The registered element is a hollow proxy that delegates to the current class definition.

### Platform Adapters

The `Component` class compiles to platform-native code:

| TJS Source | Web Output | SwiftUI Output | Compose Output |
|------------|------------|----------------|----------------|
| `class Foo extends Component` | Custom Element | `struct Foo: View` | `@Composable fun Foo()` |
| `this.state = x` | Reactive update | `@State var state` | `mutableStateOf()` |
| `this.emit('click')` | `dispatchEvent()` | Callback closure | Lambda |
| `web { }` | Compiled | Stripped | Stripped |
| `swift { }` | Stripped | Compiled | Stripped |

The class definition is the source of truth. Platform blocks contain native code for each target - no CSS-in-JS gymnastics trying to map everywhere.

## Non-Goals

- TypeScript compatibility (we're inspired by, not constrained by)
- Full JS semantics (we're a subset that's portable)
- Converting convoluted TS generics (nice-to-have, not priority)
