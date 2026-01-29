# TJS: Typed JavaScript

TJS is a typed superset of JavaScript where **types are examples**.

```javascript
function greet(name: 'World', times: 3) -> '' {
  let result = ''
  let i = 0
  while (i < times) {
    result = result + `Hello, ${name}! `
    i = i + 1
  }
  return result.trim()
}
```

## Philosophy

TJS takes a different approach to typing than TypeScript:

| Aspect         | TypeScript                              | TJS                           |
| -------------- | --------------------------------------- | ----------------------------- |
| Types          | Abstract declarations                   | Concrete examples             |
| Runtime        | Erased completely                       | Preserved as metadata         |
| Validation     | Compile-time only                       | Runtime optional              |
| Learning curve | Learn type syntax                       | Use values you know           |
| Error messages | "Type 'string' is not assignable to..." | "Expected string, got number" |

### Why Examples?

Consider how you'd explain a function to another developer:

> "This function takes a name like 'World' and a count like 3, and returns a greeting string"

That's exactly how TJS works. The example _is_ the type:

```javascript
// TypeScript
function greet(name: string, times: number): string

// TJS - the example IS the documentation
function greet(name: 'World', times: 3) -> ''
```

## Core Concepts

### 1. Types by Example

Instead of abstract type names, use example values:

```javascript
// Strings
name: ''           // any string
name: 'default'    // string with default value

// Numbers
count: 0           // any number
port: 8080         // number with default

// Booleans
enabled: true      // boolean (default true)
disabled: false    // boolean (default false)

// Arrays
items: ['']        // array of strings
numbers: [0]       // array of numbers
mixed: [0, '']     // tuple: number, string

// Objects
user: { name: '', age: 0 }  // object with shape

// Null/Undefined
nullable: null
optional: undefined
```

### 2. Required vs Optional (`:` vs `=`)

The colon `:` means required, equals `=` means optional:

```javascript
function createUser(
  name: 'Anonymous',     // required string
  email: 'user@example.com',  // required string
  age = 0,               // optional number (defaults to 0)
  role = 'user'          // optional string (defaults to 'user')
) -> { id: '', name: '', email: '', age: 0, role: '' } {
  return {
    id: crypto.randomUUID(),
    name,
    email,
    age,
    role
  }
}

// Valid calls:
createUser('Alice', 'alice@example.com')
createUser('Bob', 'bob@example.com', 30)
createUser('Carol', 'carol@example.com', 25, 'admin')

// Invalid - missing required params:
createUser('Dave')  // Error: missing required parameter 'email'
```

### 3. Return Type Annotation

Use `->` to declare the return type:

```javascript
function add(a: 0, b: 0) -> 0 {
  return a + b
}

function getUser(id: '') -> { name: '', email: '' } | null {
  // Returns user object or null
}
```

### 4. Union Types

Use `||` for unions (not `|` like TypeScript):

```javascript
function parseInput(value: '' || 0 || null) -> '' {
  if (value === null) return 'null'
  if (typeof value === 'number') return `number: ${value}`
  return `string: ${value}`
}
```

### 5. The `any` Type

When you genuinely don't know the type:

```javascript
function identity(x: any) -> any {
  return x
}
```

Generics from TypeScript become `any` but preserve metadata:

```javascript
// TypeScript: function identity<T>(x: T): T
// TJS: any, but __tjs.typeParams captures the generic info
function identity(x: any) -> any {
  return x
}
// identity.__tjs.typeParams = { T: {} }
```

### 6. Type Declarations

Define reusable types with the `Type` keyword:

```javascript
// Type with default value (= syntax)
Type Name = 'Alice'
Type Count = 0
Type Age = +18              // positive number

// Type with description and default
Type Name 'a person name' = 'Alice'

// Type with example (for testing/documentation)
Type User 'registered user' {
  example: { name: '', age: 0 }
}

// Type with both default and example
Type PositiveAge = +1 {
  example: 30
}

// Type with predicate (auto-generates type guard from example)
Type EvenNumber {
  example: 2
  predicate(x) { return x % 2 === 0 }
}

// Complex validation with predicate
Type Email {
  example: 'test@example.com'
  predicate(x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) }
}
```

**Default vs Example:**

- `= value` sets a **default** for instantiation
- `example:` in block sets an **example** for testing/documentation
- When both are present, they serve different purposes

When `example` and `predicate` are provided, the type guard auto-checks the example's shape, then your predicate refines it.

### 7. Generic Declarations

Define parameterized types with the `Generic` keyword:

```javascript
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

In the predicate, `T` and `U` are type-checking functions that validate values against the provided type parameters.

### 8. Bare Assignments

Uppercase identifiers automatically get `const`:

```javascript
// These are equivalent:
Foo = Type('test', 'example')
const Foo = Type('test', 'example')

// Works for any uppercase identifier
MyConfig = { debug: true }
const MyConfig = { debug: true }
```

## Runtime Features

### Monadic Error Handling

TJS functions propagate errors automatically:

```javascript
// If any input is an error, it passes through
const result = processData(maybeError)
// If maybeError is an error, result is that error (processData not called)

// Check for errors
if (isError(result)) {
  console.log(result.message)
}
```

### Safe by Default

TJS functions are wrapped with runtime type validation by default:

```javascript
function add(a: 0, b: 0) -> 0 {
  return a + b
}

add(1, 2)      // 3
add('1', 2)    // Error: expected number, got string
add(null, 2)   // Error: expected number, got null
```

This provides excellent error messages and catches type mismatches at runtime.

### Safety Markers: `(?)` and `(!)`

Control input validation with markers after the opening paren:

```javascript
// (?) - Safe function: force input validation
function safeAdd(? a: 0, b: 0) -> 0 {
  return a + b
}

// (!) - Unsafe function: skip input validation
function fastAdd(! a: 0, b: 0) -> 0 {
  return a + b
}

fastAdd(1, 2)      // 3 (fast path, no validation)
fastAdd('1', 2)    // NaN (no validation, garbage in = garbage out)
```

The `!` is borrowed from TypeScript's non-null assertion operator - it means "I know what I'm doing, trust me."

### Return Type Safety: `->`, `-?`, `-!`

Control output validation with different arrow styles:

```javascript
// -> normal return type (validation depends on module settings)
function add(a: 0, b: 0) -> 0 { return a + b }

// -? force output validation (safe return)
function critical(a: 0, b: 0) -? 0 { return a + b }

// -! skip output validation (unsafe return)
function fast(a: 0, b: 0) -! 0 { return a + b }
```

Combine input and output markers for full control:

```javascript
// Fully safe: validate inputs AND outputs
function critical(? x: 0) -? 0 { return x * 2 }

// Fully unsafe: skip all validation
function blazingFast(! x: 0) -! 0 { return x * 2 }
```

### The `unsafe` Block

For unsafe sections within a safe function, use `unsafe {}`:

```javascript
function sum(numbers: [0]) -> 0 {
  // Parameters are validated, but the inner loop is unsafe
  unsafe {
    let total = 0
    for (let i = 0; i < numbers.length; i++) {
      total += numbers[i]
    }
    return total
  }
}
```

### Performance Characteristics

| Mode              | Overhead | Use Case                                 |
| ----------------- | -------- | ---------------------------------------- |
| Default (safe)    | ~50x     | API boundaries, user input               |
| `unsafe {}` block | ~1.2x    | Hot loops within validated functions     |
| `(!)` function    | 0x       | Internal utilities, performance critical |

Use `(!)` for internal functions that are called frequently with known-good data. Keep public APIs safe.

### SafeFunction and Eval

Safe replacements for `new Function()` and `eval()` with typed inputs/outputs:

```javascript
// SafeFunction - create a typed async function from code
const add = await SafeFunction({
  inputs: { a: 0, b: 0 }, // typed parameters
  output: 0, // typed return
  body: 'return a + b',
})
await add(1, 2) // 3
await add('x', 2) // Error: invalid input 'a'

// Eval - evaluate code once with typed result
const result = await Eval({
  code: 'a + b',
  context: { a: 1, b: 2 },
  output: 0,
}) // 3
```

**Key safety features:**

- **Typed inputs/outputs** - validated at runtime
- **Async execution** - can timeout, won't block
- **Explicit context** - no implicit scope access
- **Injectable capabilities** - fetch, console, etc. must be provided

```javascript
// With capabilities and timeout
const fetcher = await SafeFunction({
  inputs: { url: '' },
  output: { data: [] },
  body: 'return await fetch(url).then(r => r.json())',
  capabilities: { fetch: globalThis.fetch },
  timeoutMs: 10000,
})

const data = await Eval({
  code: 'await fetch(url).then(r => r.json())',
  context: { url: 'https://api.example.com' },
  output: { items: [] },
  capabilities: { fetch: globalThis.fetch },
})
```

Both functions return errors as values (monadic) rather than throwing.

## Testing

### Compile-Time Tests

Tests run at **transpile time** and are stripped from output:

```javascript
Type Email {
  example: 'test@example.com'
  predicate(x) { return x.includes('@') }
}

// This test runs during transpilation
test 'email validation' {
  if (!Email.check('user@example.com')) {
    throw new Error('valid email should pass')
  }
  if (Email.check('invalid')) {
    throw new Error('invalid email should fail')
  }
}

function sendEmail(to: Email) {
  // ...
}
```

The transpiled output contains only:

```javascript
const Email = Type('Email', ...)
function sendEmail(to) { ... }
```

The test code **evaporates** - it verified correctness at build time.

### Implicit Type Tests

Types with `example` have implicit tests - the example must pass the type check:

```javascript
Type PositiveInt {
  example: 42
  predicate(x) { return Number.isInteger(x) && x > 0 }
}
// Implicit test: PositiveInt.check(42) must be true
```

If the example fails the predicate, transpilation fails.

### Skip Tests Flag

For debugging or speed, skip test execution:

```bash
tjs emit file.tjs --dangerously-skip-tests
```

Tests are still stripped from output, but not executed.

### Legacy Inline Tests

For runtime tests (e.g., integration tests), use standard test frameworks:

```javascript
test('async operations work') {
  const data = await fetchData()
  expect(data).toBeDefined()
}
```

## Differences from JavaScript

### Removed/Discouraged

| Feature        | Reason                      |
| -------------- | --------------------------- |
| `var`          | Use `let` or `const`        |
| `class`        | Use functions and objects   |
| `this`         | Explicit context passing    |
| `new` (mostly) | Factory functions preferred |
| `throw`        | Return errors as values     |
| `for...in`     | Use `Object.keys()`         |

### Added

| Feature           | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `: example`       | Required parameter with type                |
| `= example`       | Optional parameter with default             |
| `-> Type`         | Return type annotation                      |
| `-? Type`         | Return type with forced output validation   |
| `-! Type`         | Return type with skipped output validation  |
| `(?)`             | Mark function as safe (force validation)    |
| `(!)`             | Mark function as unsafe (skip validation)   |
| `test 'name' {}`  | Compile-time test block (evaporates)        |
| `mock {}`         | Test setup block                            |
| `unsafe {}`       | Skip validation for a block                 |
| `\|\|` in types   | Union types                                 |
| `Type Name = val` | Define runtime type with default            |
| `Generic<T>`      | Define a parameterized runtime type         |
| `Foo = ...`       | Bare assignment (auto-adds `const`)         |
| `SafeFunction`    | Safe typed async replacement for `Function` |
| `Eval`            | Safe typed async replacement for `eval()`   |

## Differences from TypeScript

### Types are Values

```typescript
// TypeScript - abstract type
interface User {
  name: string
  age: number
  email?: string
}

// TJS - concrete example
const User = { name: '', age: 0, email = '' }
```

### Runtime Preservation

TypeScript erases types at compile time. TJS preserves them:

```javascript
function greet(name: 'World') -> '' {
  return `Hello, ${name}!`
}

// At runtime:
greet.__tjs = {
  params: { name: { type: 'string', required: true } },
  returns: { type: 'string' }
}
```

This enables:

- Runtime validation
- Auto-generated documentation
- API schema generation
- Better error messages

### Generics

TypeScript generics become `any` in TJS, but constraints are preserved:

```typescript
// TypeScript
function process<T extends { id: number }>(item: T): T

// TJS - constraint becomes validatable schema
function process(item: any) -> any
// process.__tjs.typeParams = { T: { constraint: '{ id: 0 }' } }
```

The constraint `{ id: number }` becomes the example `{ id: 0 }` - and can be validated at runtime!

### No Type Gymnastics

TJS doesn't support:

- Conditional types
- Mapped types
- Template literal types
- `infer` keyword

If you need these, you probably need to rethink your approach. TJS favors simple, explicit types over clever type-level programming.

## The `__tjs` Metadata

Every TJS function has attached metadata:

```javascript
function createUser(name: 'Anonymous', age = 0) -> { id: '', name: '', age: 0 } {
  return { id: crypto.randomUUID(), name, age }
}

createUser.__tjs = {
  params: {
    name: { type: 'string', required: true, default: 'Anonymous' },
    age: { type: 'number', required: false, default: 0 }
  },
  returns: { type: 'object', shape: { id: 'string', name: 'string', age: 'number' } },
  // For generic functions:
  typeParams: {
    T: { constraint: '{ id: 0 }', default: null }
  }
}
```

This metadata enables:

1. **Runtime validation** via `wrap()`
2. **Documentation generation** via `generateDocs()`
3. **API schema export** (OpenAPI, JSON Schema)
4. **IDE autocompletion**
5. **Version-safe serialization**

## CLI Tools

### `tjs` - The TJS Compiler

```bash
tjs check file.tjs      # Parse and type check
tjs emit file.tjs       # Output transpiled JavaScript
tjs run file.tjs        # Transpile and execute
tjs types file.tjs      # Output type metadata as JSON
```

### `tjsx` - Quick Execution

```bash
tjsx script.tjs                    # Run a TJS file
tjsx script.tjs --name=value       # Pass arguments
tjsx -e "function f() { return 42 }"  # Evaluate inline
echo '{"x": 1}' | tjsx script.tjs --json  # JSON from stdin
```

### Bun Plugin - Native `.tjs` Support

Run `.tjs` files directly with Bun using the preload plugin:

```bash
# Run a single file
bun --preload ./src/bun-plugin/tjs-plugin.ts script.tjs

# Enable globally in bunfig.toml
[run]
preload = ["./src/bun-plugin/tjs-plugin.ts"]
```

The plugin transpiles `.tjs` files on-the-fly with full runtime support (Type, Generic, Union, etc.).

## Best Practices

### 1. Use Examples That Document

```javascript
// Bad - meaningless example
function send(to: '', subject: '', body: '') {}

// Good - self-documenting
function send(
  to: 'user@example.com',
  subject: 'Hello!',
  body: 'Message content here...'
) {}
```

### 2. Validate at Boundaries

```javascript
// Public API - safe by default
export function createUser(name: '', email: '') -> { id: '', name: '', email: '' } {
  return createUserImpl(name, email)
}

// Internal - mark as unsafe for speed
function createUserImpl(! name: '', email: '') -> { id: '', name: '', email: '' } {
  return { id: crypto.randomUUID(), name, email }
}
```

### 3. Return Errors, Don't Throw

```javascript
// Bad
function divide(a: 0, b: 0) -> 0 {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}

// Good
function divide(a: 0, b: 0) -> 0 {
  if (b === 0) return error('Division by zero')
  return a / b
}
```

### 4. Keep Types Simple

```javascript
// Bad - over-engineered
function process(data: {
  items: [{ id: '', meta: { created: 0, tags: [''] } }],
}) {}

// Good - extract complex types
const Item = { id: '', meta: { created: 0, tags: [''] } }
function process(data: { items: [Item] }) {}
```

## Transpilation

TJS transpiles to standard JavaScript:

```javascript
// Input (TJS)
function greet(name: 'World') -> '' {
  return `Hello, ${name}!`
}

// Output (JavaScript)
function greet(name = 'World') {
  return `Hello, ${name}!`
}
greet.__tjs = {
  params: { name: { type: 'string', required: true, default: 'World' } },
  returns: { type: 'string' }
}
```

The output is valid ES modules that work with any bundler (Vite, esbuild, webpack, Bun).

## Further Reading

- [Benchmarks](./benchmarks.md) - Performance characteristics
- [ajs.md](./ajs.md) - The sandboxed agent language
- [API Documentation](./docs/) - Generated from source
