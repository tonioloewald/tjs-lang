<!--{"pin": "top"}-->

# TJS Interactive Examples

Try these examples in the playground! Each demonstrates a key TJS feature.

## Types by Example

TJS types ARE example values - self-documenting and runtime-checkable:

```javascript
// The example IS the type AND the documentation
function greet(name: 'World', times: 3) -> '' {
  let result = ''
  for (let i = 0; i < times; i++) {
    result = result + `Hello, ${name}! `
  }
  return result.trim()
}

// greet.__tjs shows: name: string, times: number -> string
console.log(greet('TJS', 2))  // "Hello, TJS! Hello, TJS!"
```

## Type Declarations with Defaults

Define reusable types with the `Type` keyword:

```javascript
// Type with default value
Type Name = 'Anonymous'
Type Count = 0
Type PositiveAge = +18  // positive number

// Use types as parameter annotations
function introduce(name: Name, age: PositiveAge) -> '' {
  return `Hi, I'm ${name} and I'm ${age} years old`
}

console.log(introduce('Alice', 30))
console.log(Name.default)  // 'Anonymous'
```

## Generic Types

Runtime-checkable generics:

```javascript
// Define a generic Box<T> type
Generic Box<T> {
  description: 'a boxed value'
  predicate(obj, T) {
    return typeof obj === 'object' &&
           obj !== null &&
           'value' in obj &&
           T(obj.value)
  }
}

// Instantiate with different types
const StringBox = Box('')
const NumberBox = Box(0)

console.log(StringBox.check({ value: 'hello' }))  // true
console.log(StringBox.check({ value: 123 }))      // false
console.log(NumberBox.check({ value: 42 }))       // true
```

## Compile-Time Tests

Tests run during transpilation and evaporate from output:

```javascript
Type Email {
  example: 'test@example.com'
  predicate(x) {
    return typeof x === 'string' && x.includes('@')
  }
}

// This test runs at transpile time, not runtime
test 'email validation' {
  if (!Email.check('user@example.com')) {
    throw new Error('valid email should pass')
  }
  if (Email.check('not-an-email')) {
    throw new Error('invalid email should fail')
  }
}

// The test code is stripped from the transpiled output
function sendEmail(to: Email) -> { sent: true } {
  return { sent: true }
}
```

## Safety Markers

Control validation with `(!)` and `(?)`:

```javascript
// Default: safe function with validation
function safeAdd(a: 0, b: 0) -> 0 {
  return a + b
}

// (!) Unsafe: skip input validation for performance
function fastAdd(! a: 0, b: 0) -> 0 {
  return a + b
}

// (?) Force safe: always validate even if module is unsafe
function alwaysSafe(? data: { x: 0 }) -> 0 {
  return data.x * 2
}

console.log(safeAdd(1, 2))   // 3
console.log(fastAdd(1, 2))   // 3 (faster, no validation)
```

## SafeFunction and Eval

Safe replacements for `new Function()` and `eval()`:

```javascript
// Create a typed async function from code
const multiply = await SafeFunction({
  inputs: { a: 0, b: 0 },
  output: 0,
  body: 'return a * b',
})

console.log(await multiply(3, 4)) // 12

// Evaluate code with typed result
const result = await Eval({
  code: 'x + y',
  context: { x: 10, y: 5 },
  output: 0,
})

console.log(result) // 15
```

## Monadic Error Handling

Errors are values, not exceptions:

```javascript
function divide(a: 0, b: 0) -> 0 {
  if (b === 0) {
    return error('Division by zero')
  }
  return a / b
}

const result = divide(10, 0)

if (isError(result)) {
  console.log('Error:', result.message)
} else {
  console.log('Result:', result)
}

// Errors propagate automatically through function chains
```

## Native Type Checking

Check platform types pragmatically:

```javascript
// typeOf returns constructor names for objects
console.log(typeOf(new Map())) // 'Map'
console.log(typeOf(new Date())) // 'Date'
console.log(typeOf([1, 2, 3])) // 'array'
console.log(typeOf(null)) // 'null'

// isNativeType checks prototype chain
console.log(isNativeType(new TypeError('oops'), 'Error')) // true
console.log(isNativeType(new Map(), 'Map')) // true
```

## Union Types

Use `||` for union types:

```javascript
Union Status 'task status' {
  'pending' | 'active' | 'done'
}

function updateTask(id: '', status: Status) -> { updated: true } {
  console.log(`Task ${id} -> ${status}`)
  return { updated: true }
}

updateTask('task-1', 'active')
```

## Running TJS

```bash
# CLI commands
tjs check file.tjs      # Type check
tjs run file.tjs        # Execute
tjs emit file.tjs       # Output JavaScript
tjs emit --debug file.tjs  # Include source locations

# Or use the Bun plugin for native support
bun --preload ./src/bun-plugin/tjs-plugin.ts file.tjs
```
