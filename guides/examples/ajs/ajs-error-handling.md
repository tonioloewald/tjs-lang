<!--{"section": "ajs", "type": "example", "group": "basics", "order": 6, "parent": "ajs-basics.md"}-->

# Error Handling

Try/catch with Error()

<!-- TODO review -->
Agents meet failure constantly: a service is down, a model returns garbage, an input is wrong.
In AJS an error is a value that flows through the program, not an exception that unwinds the
host. `try`/`catch` looks the same as in JavaScript; what happens underneath does not.

```ajs:inline
function safeDivide({ a = 10, b = 0 }) {
  try {
    if (b == 0) {
      Error('Division by zero!')
    }
    let result = a / b
    return { result }
  } catch (err) {
    return { error: err }
  }
}
```

<!-- TODO review -->
## What to notice

- **There is no `throw`.** Calling `Error('message')` (no `new`) puts the program into its error
  state. `throw` is a transpile error that says so.
- **An error skips what follows.** Once the program is in its error state, the steps after it do
  not run until a `catch` takes the error. Here `let result = a / b` never runs.
- **`err` is a string.** The `catch` receives the error's message, so `{ error: err }` returns
  `"Division by zero!"`. `err.message` would be `undefined`.
- **Uncaught errors end the run as a value.** Remove the `try`/`catch` and the run finishes with
  an error result that the host reads (`result.error`), with the fuel spent so far. Nothing is
  thrown into the host's code.

<!-- TODO review -->
## A variation

Collect failures and keep going, the pattern for batch work where one bad item should not sink
the rest:

```ajs:inline
function parseAll({ items = ['1', 'x', '3', '{"a":4}'] }) {
  let results = []
  let errors = []
  for (const item of items) {
    try {
      let value = JSON.parse(item)
      results.push(value)
    } catch (err) {
      errors.push({ item, error: err })
    }
  }
  return { results, errors, ok: errors.length == 0 }
}
```

An error raised inside a helper function propagates to the caller's `try` the same way.

<!-- TODO review -->
## The gotcha

Not every error can be caught. A refusal at the capability boundary that means the **code** is
wrong ends the run outright, even inside a `try`: an atom called with input that does not match
what it declares, a value that cannot be copied out to the host, or a host capability that hands
back something JSON cannot express (a live `Response`, a function). Failures of the **world** (a
fetch that fails, a domain that is not allowed, a model that is down, bad JSON) stay catchable.
A bug is not something to retry, and a program that could catch these could retry them in a loop.
