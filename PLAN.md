# TJS Roadmap

## Philosophy

TJS is a practical language that targets multiple runtimes. The type system is _descriptive_ rather than _prescriptive_ - types explain what they are, validate at runtime, and degrade gracefully. No TypeScript gymnastics.

The runtime is JavaScript today, but it's _our_ JavaScript - the sandboxed expression evaluator, the fuel-metered VM. When we target LLVM or SwiftUI, we compile our AST, not arbitrary JS.

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
| 3   | Monadic Errors         | ⏳     | Have AgentError, need --debug/call stacks      |
| 4   | test() blocks          | ⏳     | Basic extraction exists                        |
| 5   | Pragmatic natives      | ⏳     | Some constructor checks exist                  |
| 6   | Multi-target           | ❌     | Future - JS only for now                       |
| 7   | Safety flags           | ❌     | --allow-unsafe, --yolo                         |
| 8   | Single-pass            | ⏳     | CLI exists, not unified                        |
| 9   | Module system          | ❌     | Versioned imports                              |
| 10  | Autocomplete           | ⏳     | Playground has some                            |
| 11  | Eval()                 | ⏳     | Expression eval exists, not exposed            |
| 12  | Function introspection | ⏳     | Metadata exists, source positions need --debug |
| 13  | Generic()              | ❌     | Runtime-checkable generics                     |
| 14  | Asymmetric get/set     | ❌     | Broader input, narrower output                 |
| 15  | `==` that works        | ❌     | Structural equality + .Equals hook             |
| 16  | Death to semicolons    | ❌     | Meaningful newlines                            |
| 17  | WASM blocks            | ❌     | Performance-critical code                      |

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

Target-specific code blocks with automatic translation and fallback:

```typescript
// WASM for performance-critical path
wasm(vertices: Float32Array, matrix: Float32Array) {
  // Simple JS subset that compiles to WASM
  for (let i = 0; i < vertices.length; i += 3) {
    // matrix multiply...
  }
} fallback {
  // Pure TJS - runs if WASM unavailable
  return vertices.map((v, i) => /* ... */)
}

// GPU shader
glShader(positions: Float32Array, colors: Float32Array) {
  // GLSL-like subset
  gl_Position = projection * view * vec4(position, 1.0)
  fragColor = color
} fallback {
  // CPU fallback
}

// Metal for Apple platforms
metal(texture: ImageData) {
  // Metal shader subset
} fallback {
  // Canvas 2D fallback
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

## Non-Goals

- TypeScript compatibility (we're inspired by, not constrained by)
- Full JS semantics (we're a subset that's portable)
- Converting convoluted TS generics (nice-to-have, not priority)
