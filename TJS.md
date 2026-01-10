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

### The `wrap()` Function

Wrap functions for runtime type validation:

```javascript
const safeAdd = wrap((a, b) => a + b, {
  params: {
    a: { type: 'number', required: true },
    b: { type: 'number', required: true },
  },
  returns: { type: 'number' },
})

safeAdd(1, 2) // 3
safeAdd('1', 2) // Error: expected number, got string
```

### The `unsafe` Block

Skip type validation for performance-critical code:

```javascript
function fastSum(numbers: [0]) -> 0 {
  // ~35x faster than wrapped version
  unsafe {
    let sum = 0
    for (let i = 0; i < numbers.length; i++) {
      sum += numbers[i]
    }
    return sum
  }
}
```

Use `unsafe` at API boundaries after validation, not for skipping validation entirely.

## Testing

### Inline Tests

Tests live alongside your code:

```javascript
function add(a: 0, b: 0) -> 0 {
  return a + b
}

test('add works with positive numbers') {
  expect(add(1, 2)).toBe(3)
  expect(add(0, 0)).toBe(0)
}

test('add works with negative numbers') {
  expect(add(-1, 1)).toBe(0)
  expect(add(-5, -3)).toBe(-8)
}
```

### Inline Mocks

Setup code that runs before each test:

```javascript
mock {
  const testUser = { name: 'Test', age: 25 }
  const mockDB = new Map()
}

test('user can be stored') {
  mockDB.set('user1', testUser)
  expect(mockDB.get('user1')).toEqual(testUser)
}
```

### Async Tests

All test blocks are async contexts:

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

| Feature         | Purpose                         |
| --------------- | ------------------------------- |
| `: example`     | Required parameter with type    |
| `= example`     | Optional parameter with default |
| `-> Type`       | Return type annotation          |
| `test() {}`     | Inline test block               |
| `mock {}`       | Test setup block                |
| `unsafe {}`     | Skip type validation            |
| `\|\|` in types | Union types                     |

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
// Public API - use wrap() for validation
export const createUser = wrap(createUserImpl, createUserImpl.__tjs)

// Internal - skip validation for speed
function createUserImpl(name: '', email: '') -> { id: '', name: '', email: '' } {
  unsafe {
    return { id: crypto.randomUUID(), name, email }
  }
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
- [ASYNCJS.md](./ASYNCJS.md) - The sandboxed agent language
- [API Documentation](./docs/) - Generated from source
