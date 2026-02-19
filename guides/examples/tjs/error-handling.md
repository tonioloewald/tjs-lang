<!--{"section":"tjs","type":"example","group":"patterns","order":7}-->

# Error Handling

Monadic error propagation and type-safe error patterns

```tjs
/*#
## Monadic Error Propagation

Type errors are values (MonadicError), not exceptions. They propagate
automatically through function chains — if any function receives an
error as input, it short-circuits and returns the error immediately.

No try/catch needed. No manual error checking between calls.
*/

// --- Error propagation through a pipeline ---

function validate(name: '') -> '' {
  return name.trim()
}

function greet(name: '') -> '' {
  return `Hello, ${name}!`
}

function shout(text: '') -> '' {
  return text.toUpperCase()
}

test 'valid input flows through the pipeline' {
  // Each function's output feeds the next function's input
  const result = shout(greet(validate('alice')))
  expect(result).toBe('HELLO, ALICE!')
}

test 'type error propagates through the entire chain' {
  // validate(42) returns a MonadicError (42 is not a string)
  // greet() receives the error, short-circuits, returns it
  // shout() receives the error, short-circuits, returns it
  const result = shout(greet(validate(42)))
  expect(result instanceof Error).toBe(true)
  expect(result.message.includes('string')).toBe(true)
}

test 'error identity is preserved (same object, not a copy)' {
  const err = validate(42)
  expect(greet(err)).toBe(err)
  expect(shout(err)).toBe(err)
}

// --- Result pattern for domain errors ---

function divide(a: 10, b: 2) -> { value: 0, error = '' } {
  if (b === 0) {
    return { value: NaN, error: 'Division by zero' }
  }
  return { value: a / b }
}

test 'divide handles zero' {
  const result = divide(10, 0)
  expect(result.error).toBe('Division by zero')
}

test 'divide works normally' {
  const result = divide(10, 2)
  expect(result.value).toBe(5)
}

// Errors propagate when passed as arguments to TJS functions.
// If you use a potentially-error value in a JS expression (e.g. result.length),
// check it first: if (result instanceof Error) return result
// In debug mode, errors include a callStack showing the full call chain.
```
