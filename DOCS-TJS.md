<!--{"section": "tjs", "group": "docs", "order": 0, "navTitle": "Documentation"}-->

# TJS: Typed JavaScript

_Types as Examples. Zero Build. Runtime Metadata._

---

## What is TJS?

TJS is a typed superset of JavaScript where **types are concrete values**, not abstract annotations.

```typescript
// TypeScript: abstract type annotation
function greet(name: string): string

// TJS: concrete example value
function greet(name: 'World') -> '' { return `Hello, ${name}!` }
```

The example `'World'` tells TJS that `name` is a string. The example `''` tells TJS the return type is a string. Types are inferred from the examples you provide.

TJS transpiles to JavaScript with embedded `__tjs` metadata, enabling runtime type checking, autocomplete from live objects, and documentation generation.

---

## The Compiler

TJS compiles in the browser. No webpack, no node_modules, no build server.

```typescript
import { tjs } from 'tjs-lang'

const code = tjs`
  function add(a: 0, b: 0) -> 0 {
    return a + b
  }
`

// Returns transpiled JavaScript with __tjs metadata
```

You can also use the CLI:

```bash
bun src/cli/tjs.ts check file.tjs   # Parse and type check
bun src/cli/tjs.ts run file.tjs     # Transpile and execute
bun src/cli/tjs.ts emit file.tjs    # Output transpiled JS
bun src/cli/tjs.ts types file.tjs   # Output type metadata
```

---

## Syntax

### Parameter Types (Colon Syntax)

> **Not TypeScript.** TJS colon syntax looks like TypeScript but has different
> semantics. The value after `:` is a **concrete example**, not a type name.
> Write `name: 'Alice'` (example value), not `name: string` (type name).
> TJS infers the type from the example: `'Alice'` → string, `0` → integer,
> `true` → boolean.

Required parameters use colon syntax with an example value:

```typescript
function greet(name: 'Alice') {} // name is required, type: string
function calculate(value: 0) {}  // value is required, type: integer
function measure(rate: 0.0) {}   // rate is required, type: number (float)
function count(n: +0) {}         // n is required, type: non-negative integer
function toggle(flag: true) {}   // flag is required, type: boolean
```

### Numeric Types

TJS distinguishes three numeric types using valid JavaScript syntax:

```typescript
function process(
  rate: 3.14,    // number (float) -- has a decimal point
  count: 42,     // integer -- whole number, no decimal
  index: +0      // non-negative integer -- prefixed with +
) {}
```

| You Write | Type Inferred          | Runtime Validation              |
| --------- | ---------------------- | ------------------------------- |
| `3.14`    | `number` (float)       | `typeof x === 'number'`         |
| `0.0`     | `number` (float)       | `typeof x === 'number'`         |
| `42`      | `integer`              | `Number.isInteger(x)`           |
| `0`       | `integer`              | `Number.isInteger(x)`           |
| `+20`     | `non-negative integer` | `Number.isInteger(x) && x >= 0` |
| `+0`      | `non-negative integer` | `Number.isInteger(x) && x >= 0` |
| `-5`      | `integer`              | `Number.isInteger(x)`           |
| `-3.5`    | `number` (float)       | `typeof x === 'number'`         |

All of these are valid JavaScript expressions. TJS reads the syntax more
carefully to give you finer-grained type checking than JS or TypeScript
provide natively.

### Optional Parameters (Default Values)

Optional parameters use `=` with a default value:

```typescript
function greet(name = 'World') {} // name is optional, defaults to 'World'
function calculate(value = 0) {} // value is optional, defaults to 0 (integer)
```

### TypeScript-Style Optional (`?:`)

TJS supports `?:` for compatibility, but consider it a migration aid rather than idiomatic TJS:

```typescript
function greet(name?: '') {} // same as name = ''
```

**Why `?:` is an antipattern.** In TypeScript, `?:` creates a three-state parameter
(`value | undefined | missing`) that forces every function body to handle the absent case:

```typescript
// TypeScript — every caller and callee must reason about undefined
function greet(name?: string) {
  const safeName = name ?? 'World' // defensive check required
  return `Hello, ${safeName}!`
}
```

TJS offers two better alternatives:

**1. Safe defaults** — the parameter always has a value, no branching needed:

```typescript
function greet(name = 'World') {
  return `Hello, ${name}!` // name is always a string
}
```

**2. Polymorphic functions** — separate signatures for separate behavior:

```typescript
function greet() {
  return 'Hello, World!'
}
function greet(name: '') {
  return `Hello, ${name}!`
}
```

Both approaches eliminate the `undefined` state entirely. The function body
never needs a null check because the type system guarantees a valid value
at every call site. This is simpler to write, simpler to read, and produces
tighter runtime validation.

### Object Parameters

Object shapes are defined by example:

```typescript
function createUser(user: { name: ''; age: 0 }) {}
// user must be an object with string name and number age
```

### Nullable Types

Use `|` for union with null:

```typescript
function find(id: 0 | null) {} // number or null
```

### Return Types (Arrow Syntax)

Return types use `->`:

```typescript
function add(a: 0, b: 0) -> 0 {
  return a + b
}

function getUser(id: 0) -> { name: '', age: 0 } {
  return { name: 'Alice', age: 30 }
}
```

### Array Types

Arrays use bracket syntax with an example element:

```typescript
function sum(numbers: [0]) -> 0 {        // array of numbers
  return numbers.reduce((a, b) => a + b, 0)
}

function names(users: [{ name: '' }]) {  // array of objects
  return users.map(u => u.name)
}
```

---

## Safety Markers

### Unsafe Functions

Skip validation for hot paths:

```typescript
function fastAdd(! a: 0, b: 0) { return a + b }
```

The `!` marker after the function name skips input validation.

### Safe Functions

Explicit validation (for emphasis):

```typescript
function safeAdd(? a: 0, b: 0) { return a + b }
```

### Unsafe Blocks

Skip validation for a block of code:

```typescript
unsafe {
  fastPath(data)
  anotherHotFunction(moreData)
}
```

### Module Safety Directive

Set the default validation level for an entire file:

```typescript
safety none     // No validation (metadata only)
safety inputs   // Validate function inputs (default)
safety all      // Validate everything (debug mode)
```

---

## Type System

### Type()

Define named types with predicates:

```typescript
// Simple type from example
Type Name 'Alice'

// Type with description
Type User {
  description: 'a user object'
  example: { name: '', age: 0 }
}

// Type with predicate
Type PositiveNumber {
  description: 'a positive number'
  example: 1
  predicate(x) { return x > 0 }
}
```

Types can be used in function signatures:

```typescript
function greet(name: Name) -> '' {
  return `Hello, ${name}!`
}
```

### Generic()

Runtime-checkable generics:

```typescript
Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
}

// With default type parameter
Generic Container<T, U = ''> {
  description: 'container with label'
  predicate(obj, T, U) {
    return T(obj.item) && U(obj.label)
  }
}
```

### Union()

Discriminated unions:

```typescript
const Shape = Union('kind', {
  circle: { radius: 0 },
  rectangle: { width: 0, height: 0 }
})

function area(shape: Shape) -> 0 {
  if (shape.kind === 'circle') {
    return Math.PI * shape.radius ** 2
  }
  return shape.width * shape.height
}
```

### Enum()

String or numeric enums:

```typescript
const Status = Enum(['pending', 'active', 'completed'])
const Priority = Enum({ low: 1, medium: 2, high: 3 })

function setStatus(status: Status) {}
```

---

## Structural Equality: Is / IsNot

JavaScript's `==` is broken (type coercion). TJS provides structural equality:

```typescript
// Structural comparison - no coercion
[1, 2] Is [1, 2]       // true
5 Is "5"               // false (different types)
{ a: 1 } Is { a: 1 }   // true

// Arrays compared element-by-element
[1, [2, 3]] Is [1, [2, 3]]  // true

// Negation
5 IsNot "5"            // true
```

### Custom Equality

Objects can define custom equality in two ways:

**1. `[tjsEquals]` symbol protocol** (preferred for Proxies and advanced use):

```typescript
import { tjsEquals } from 'tjs-lang/lang'

// A proxy that delegates equality to its target
const target = { x: 1, y: 2 }
const proxy = new Proxy({
  [tjsEquals](other) { return target Is other }
}, {})

proxy == { x: 1, y: 2 }  // true — delegates to target
```

**2. `.Equals` method** (simple, works on any object or class):

```typescript
class Point {
  constructor(x: 0, y: 0) { this.x = x; this.y = y }
  Equals(other) { return this.x === other.x && this.y === other.y }
}

Point(1, 2) Is Point(1, 2)  // true (uses .Equals)
```

**Priority:** `[tjsEquals]` symbol > `.Equals` method > structural comparison.

The symbol is `Symbol.for('tjs.equals')`, so it works across realms. Access it
via `import { tjsEquals } from 'tjs-lang/lang'` or `__tjs.tjsEquals` at runtime.

---

## Classes

### Callable Without `new`

TJS classes are callable without the `new` keyword:

```typescript
class User {
  constructor(name: '') {
    this.name = name
  }
}

// Both work identically:
const u1 = User('Alice') // TJS way - clean
const u2 = new User('Alice') // Also works (linter warns)
```

### Private Fields

Use `#` for private fields:

```typescript
class Counter {
  #count = 0

  increment() {
    this.#count++
  }
  get value() {
    return this.#count
  }
}
```

When converting from TypeScript, `private foo` becomes `#foo`.

### Getters and Setters

Asymmetric types are captured:

```typescript
class Timestamp {
  #value

  constructor(initial: '' | 0 | null) {
    this.#value = initial === null ? new Date() : new Date(initial)
  }

  set value(v: '' | 0 | null) {
    this.#value = v === null ? new Date() : new Date(v)
  }

  get value() {
    return this.#value
  }
}

const ts = Timestamp('2024-01-15')
ts.value = 0 // SET accepts: string | number | null
ts.value // GET returns: Date
```

---

## Polymorphic Functions

Multiple function declarations with the same name are automatically merged into a dispatcher that routes by argument count and type:

```typescript
function describe(value: 0) {
  return 'number: ' + value
}
function describe(value: '') {
  return 'string: ' + value
}
function describe(value: { name: '' }) {
  return 'object: ' + value.name
}

describe(42) // 'number: 42'
describe('hello') // 'string: hello'
describe({ name: 'world' }) // 'object: world'
describe(true) // MonadicError: no matching overload
```

### Dispatch Order

1. **Arity** first (number of arguments)
2. **Type specificity** within same arity: `integer` > `number` > `any`; objects before primitives
3. **Declaration order** as tiebreaker

### Polymorphic Constructors

Classes can have multiple constructor signatures. The first becomes the real JS constructor; additional variants become factory functions:

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

Point(3, 4) // variant 1: two numbers
Point({ x: 10, y: 20 }) // variant 2: object
```

All variants produce correct `instanceof` results.

### Compile-Time Validation

TJS catches these errors at transpile time:

- **Ambiguous signatures**: Two variants with identical types at every position
- **Rest parameters**: `...args` not supported in polymorphic functions
- **Mixed async/sync**: All variants must agree

---

## Local Class Extensions

Add methods to built-in types without polluting prototypes:

```typescript
extend String {
  capitalize() {
    return this[0].toUpperCase() + this.slice(1)
  }
  words() {
    return this.split(/\s+/)
  }
}

'hello world'.capitalize()  // 'Hello world'
'foo bar baz'.words()       // ['foo', 'bar', 'baz']
```

### How It Works

For known-type receivers (literals, typed variables), calls are rewritten at transpile time to `.call()` — zero runtime overhead:

```javascript
// TJS source:
'hello'.capitalize()

// Generated JS:
__ext_String.capitalize.call('hello')
```

For unknown types, a runtime registry (`registerExtension` / `resolveExtension`) provides fallback dispatch.

### Supported Types

Extensions work on any type: `String`, `Number`, `Array`, `Boolean`, custom classes, and DOM classes like `HTMLElement`. Multiple `extend` blocks for the same type merge left-to-right (later declarations can override earlier methods).

### Rules

- Arrow functions are **not allowed** in extend blocks (they don't bind `this`)
- Extensions are **file-local** — they don't leak across modules
- Prototypes are **never modified** — `String.prototype.capitalize` remains `undefined`

---

## Runtime Features

### `__tjs` Metadata

Every TJS function carries its type information:

```typescript
function createUser(input: { name: '', age: 0 }) -> { id: 0 } {
  return { id: 123 }
}

console.log(createUser.__tjs)
// {
//   params: {
//     input: { type: { kind: 'object', shape: { name: 'string', age: 'number' } } }
//   },
//   returns: { kind: 'object', shape: { id: 'number' } }
// }
```

This enables:

- Autocomplete from live objects
- Runtime type validation
- Automatic documentation generation

### Monadic Errors

Type validation failures return `MonadicError` instances (extends `Error`),
not thrown exceptions:

```typescript
import { isMonadicError } from 'tjs-lang/lang'

const result = createUser({ name: 123 }) // wrong type
// MonadicError: Expected string for 'createUser.name', got number

if (isMonadicError(result)) {
  console.log(result.message) // "Expected string for 'createUser.name', got number"
  console.log(result.path) // "createUser.name"
  console.log(result.expected) // "string"
  console.log(result.actual) // "number"
}
```

No try/catch gambling. The host survives invalid inputs.

For general-purpose error values (not type errors), use the `error()` helper
which returns plain `{ $error: true, message }` objects checkable with `isError()`.

### Inline Tests

Tests live next to code:

```typescript
function double(x: 0) -> 0 { return x * 2 }

test('doubles numbers') {
  expect(double(5)).toBe(10)
  expect(double(-3)).toBe(-6)
}
```

Tests are extracted at compile time and can be:

- Run during transpilation
- Stripped in production builds
- Used for documentation generation

### WASM Blocks

Drop into WebAssembly for compute-heavy code:

```typescript
function vectorDot(a: [0], b: [0]) -> 0 {
  let sum = 0
  wasm {
    for (let i = 0; i < a.length; i++) {
      sum = sum + a[i] * b[i]
    }
  }
  return sum
}
```

Variables are captured automatically. Falls back to JS if WASM unavailable.

#### SIMD Intrinsics (f32x4)

For compute-heavy workloads, use f32x4 SIMD intrinsics to process 4 float32 values per instruction:

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

Available intrinsics:

| Intrinsic                           | Description                          |
| ----------------------------------- | ------------------------------------ |
| `f32x4_load(ptr, byteOffset)`       | Load 4 floats from memory into v128  |
| `f32x4_store(ptr, byteOffset, vec)` | Store v128 as 4 floats to memory     |
| `f32x4_splat(scalar)`               | Fill all 4 lanes with a scalar value |
| `f32x4_extract_lane(vec, N)`        | Extract float from lane 0-3          |
| `f32x4_replace_lane(vec, N, val)`   | Replace one lane, return new v128    |
| `f32x4_add(a, b)`                   | Lane-wise addition                   |
| `f32x4_sub(a, b)`                   | Lane-wise subtraction                |
| `f32x4_mul(a, b)`                   | Lane-wise multiplication             |
| `f32x4_div(a, b)`                   | Lane-wise division                   |
| `f32x4_neg(v)`                      | Negate all lanes                     |
| `f32x4_sqrt(v)`                     | Square root of all lanes             |

This mirrors C/C++ SIMD intrinsics (`_mm_add_ps`, etc.) — explicit, predictable, no auto-vectorization magic.

#### Zero-Copy Arrays: `wasmBuffer()`

By default, typed arrays passed to WASM blocks are copied into WASM memory before the call and copied back out after. For large arrays called frequently, this overhead can negate WASM's speed advantage.

`wasmBuffer(Constructor, length)` allocates typed arrays directly in WASM linear memory. These arrays work like normal typed arrays from JavaScript, but when passed to a `wasm {}` block, they're zero-copy — the data is already there.

```typescript
// Allocate particle positions in WASM memory
const starX = wasmBuffer(Float32Array, 50000)
const starY = wasmBuffer(Float32Array, 50000)

// Use from JS like normal arrays
for (let i = 0; i < 50000; i++) {
  starX[i] = (Math.random() - 0.5) * 2000
  starY[i] = (Math.random() - 0.5) * 2000
}

// Zero-copy SIMD processing
function moveParticles(! xs: Float32Array, ys: Float32Array, len: 0, dx: 0.0, dy: 0.0) {
  wasm {
    let vdx = f32x4_splat(dx)
    let vdy = f32x4_splat(dy)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      f32x4_store(xs, off, f32x4_add(f32x4_load(xs, off), vdx))
      f32x4_store(ys, off, f32x4_add(f32x4_load(ys, off), vdy))
    }
  } fallback {
    for (let i = 0; i < len; i++) { xs[i] += dx; ys[i] += dy }
  }
}

// After WASM runs, JS sees the mutations immediately
moveParticles(starX, starY, 50000, 1.0, 0.5)
console.log(starX[0]) // updated in place, no copy
```

Key points:

- Supported constructors: `Float32Array`, `Float64Array`, `Int32Array`, `Uint8Array`
- Uses a bump allocator — allocations persist for program lifetime
- All WASM blocks in a file share one 64MB memory
- Regular typed arrays still work (copy in/out as before)
- Use `!` (unsafe) on hot-path functions to skip runtime type checks

---

## Module System

### Imports

TJS supports URL imports:

```typescript
import { Button } from 'https://cdn.example.com/ui-kit.tjs'
import { validate } from './utils/validation.tjs'
```

Modules are:

- Fetched on demand
- Transpiled in the browser
- Cached independently (IndexedDB + service worker)

### CDN Integration

External packages from esm.sh with pinned versions:

```typescript
import lodash from 'https://esm.sh/lodash@4.17.21'
```

---

## TypeScript Compatibility

### TS → TJS Converter

Convert existing TypeScript:

```bash
bun src/cli/tjs.ts convert file.ts
```

```typescript
// TypeScript
function greet(name: string, age?: number): string { ... }

// Converts to TJS
function greet(name: '', age = 0) -> '' { ... }
```

### What Gets Converted

| TypeScript                 | TJS                     |
| -------------------------- | ----------------------- |
| `name: string`             | `name: ''`              |
| `age: number`              | `age: 0.0`              |
| `flag: boolean`            | `flag: false`           |
| `items: string[]`          | `items: ['']`           |
| `age?: number`             | `age: 0.0 \| undefined` |
| `private foo`              | `#foo`                  |
| `interface User`           | `Type User`             |
| `type Status = 'a' \| 'b'` | `Union(['a', 'b'])`     |
| `enum Color`               | `Enum(...)`             |

> **Optional params:** TypeScript `x?: boolean` becomes TJS `x: false | undefined`.
> This preserves the three-state semantics (`true` / `false` / `undefined`)
> using a union type. The param is required but explicitly accepts `undefined`.

---

## Performance

| Mode            | Overhead  | Use Case                        |
| --------------- | --------- | ------------------------------- |
| `safety none`   | **1.0x**  | Metadata only, no validation    |
| `safety inputs` | **~1.5x** | Production (single-arg objects) |
| `(!) unsafe`    | **1.0x**  | Hot paths                       |
| `wasm {}`       | **<1.0x** | Compute-heavy code              |

### Why 1.5x, Not 25x

Most validators interpret schemas at runtime (~25x overhead). TJS generates inline checks at transpile time:

```typescript
// Generated (JIT-friendly)
if (
  typeof input !== 'object' ||
  input === null ||
  typeof input.name !== 'string' ||
  typeof input.age !== 'number'
) {
  return { $error: true, message: 'Invalid input', path: 'fn.input' }
}
```

No schema interpretation. No object iteration. The JIT inlines these completely.

---

## Bare Assignments

Uppercase identifiers automatically get `const`:

```typescript
Foo = Type('test', 'example') // becomes: const Foo = Type(...)
MyConfig = { debug: true } // becomes: const MyConfig = { ... }
```

---

## Limitations

### What TJS Doesn't Do

- **No gradual typing** - types are all-or-nothing per function
- **No complex type inference** - you provide examples, not constraints
- **No declaration files** - types live in the code, not `.d.ts`
- **No type-level computation** - no conditional types, mapped types, etc.

### What TJS Intentionally Avoids

- Build steps
- External type checkers
- Complex tooling configuration
- Separation of types from runtime

---

## Learn More

- [AJS Documentation](DOCS-AJS.md) — The agent runtime
- [Builder's Manifesto](MANIFESTO-BUILDER.md) — Why TJS is fun
- [Enterprise Guide](MANIFESTO-ENTERPRISE.md) — Why TJS is safe
- [Technical Context](CONTEXT.md) — Architecture deep dive
