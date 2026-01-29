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

Required parameters use colon syntax with an example value:

```typescript
function greet(name: 'Alice') {} // name is required, type: string
function calculate(value: 0) {} // value is required, type: number
function toggle(flag: true) {} // flag is required, type: boolean
```

### Optional Parameters (Default Values)

Optional parameters use `=` with a default value:

```typescript
function greet(name = 'World') {} // name is optional, defaults to 'World'
function calculate(value = 0) {} // value is optional, defaults to 0
```

### TypeScript-Style Optional

You can also use `?:` syntax:

```typescript
function greet(name?: '') {} // same as name = ''
```

### Object Parameters

Object shapes are defined by example:

```typescript
function createUser(user: { name: ''; age: 0 }) {}
// user must be an object with string name and number age
```

### Nullable Types

Use `||` for union with null:

```typescript
function find(id: 0 || null) { }         // number or null
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

Classes can define an `.Equals` method:

```typescript
class Point {
  constructor(x: 0, y: 0) { this.x = x; this.y = y }
  Equals(other) { return this.x === other.x && this.y === other.y }
}

Point(1, 2) Is Point(1, 2)  // true (uses .Equals)
```

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

Type failures return error objects, not exceptions:

```typescript
const result = createUser({ name: 123 }) // wrong type
// { $error: true, message: 'Invalid input', path: 'createUser.input' }

if (result.$error) {
  // Handle gracefully
}
```

No try/catch gambling. The host survives invalid inputs.

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

| TypeScript                 | TJS                 |
| -------------------------- | ------------------- |
| `name: string`             | `name: ''`          |
| `age: number`              | `age: 0`            |
| `flag: boolean`            | `flag: true`        |
| `items: string[]`          | `items: ['']`       |
| `age?: number`             | `age = 0`           |
| `private foo`              | `#foo`              |
| `interface User`           | `Type User`         |
| `type Status = 'a' \| 'b'` | `Union(['a', 'b'])` |
| `enum Color`               | `Enum(...)`         |

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
