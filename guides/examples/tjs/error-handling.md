<!--{"section": "tjs", "order": 7, "parent": "tjs-patterns.md"}-->

# Error Handling

Monadic error propagation and type-safe error patterns

## Monadic Error Propagation

Type errors are values (MonadicError), not exceptions. They propagate
automatically through function chains — if any function receives an
error as input, it short-circuits and returns the error immediately.

No try/catch needed. No manual error checking between calls.

```tjs:static
// --- Error propagation through a pipeline ---

function validate(name: ''): '' {
  return name.trim()
}

function greet(name: ''): 'Hello, !' {
  return `Hello, ${name}!`
}

function shout(text: ''): '' {
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

function divide(a: 10, b: 2): { value: 5 } {
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

<!-- TODO review -->
## What to notice

The pipeline `shout(greet(validate(42)))` has no error handling in it, and does not need
any. `validate` refuses the number and returns a `MonadicError`; `greet` is handed that
error where it expected a string, recognises it, and returns it unchanged without running
its body; so does `shout`. The third test makes the point precisely: it is the _same_
object all the way out, so the error still names the place it started (`validate.name`),
not the last function it passed through.

Two kinds of failure appear in this file, and they are handled differently on purpose:

- **Type errors** (a number where a string belongs) are the runtime's business. They become
  `MonadicError` values automatically and propagate on their own.
- **Domain errors** (dividing by zero is well-typed and still wrong) are yours. `divide`
  reports one in its return value. TJS does not make this choice for you; a result object,
  `null`, or a thrown exception are all still available, and which one fits depends on who
  has to deal with it.

To test for an error, use `isMonadicError(x)`. `instanceof Error` also works (a
`MonadicError` is an `Error`), but `isMonadicError` is the check that says what you mean,
and it works across module boundaries. An error carries `path` (file, line, function and
parameter), `expected` and `actual`, which is what its `message` is built from.

<!-- TODO review -->
## Handle errors at the edge

Propagation means most functions never look at errors. Somewhere, though, a value has to
become a message, a status code or a retry, and that place should be one place: the edge of
the pipeline. Bang access (`x!.name`) fits the same model, turning "this was null" into an
error value rather than a `TypeError` thrown out of the middle of the chain:

```tjs:static
const USERS = { 1: { name: 'Ada' }, 2: { name: 'Grace' } }

function findUser(id: 1) {
  return USERS[id] ?? null
}

function shout(text: 'ada'): 'ADA' {
  return text.toUpperCase()
}

// `!.` turns "not found" into an error value instead of a TypeError
function nameOf(id: 1): 'Ada' {
  return findUser(id)!.name
}

// The edge: the one place that decides what an error means to the user
function describe(id: 1): 'ADA' {
  const loud = shout(nameOf(id))
  return isMonadicError(loud) ? `no user ${id}` : loud
}

test 'the happy path' {
  expect(describe(2)).toBe('GRACE')
}

test 'a missing user becomes an error, then a message at the edge' {
  expect(isMonadicError(nameOf(9))).toBe(true)
  expect(describe(9)).toBe('no user 9')
}

test 'an error says where it came from and what was wrong' {
  const err = shout(42)
  expect(err.expected).toBe('string')
  expect(err.actual).toBe('number')
  expect(err.path.endsWith('shout.text')).toBe(true)
}
```

<!-- TODO review -->
## Gotchas

- **Propagation needs a TJS function to receive the error.** Passing an error to a typed
  parameter short-circuits. Using it in a plain expression does not: `err.length`,
  `` `${err}` `` or `err + 1` operate on the error object like any other value. If a value
  might be an error and you are about to do arithmetic or string work on it, check first.
- **An ignored error is silent.** That is the cost of returning errors instead of throwing
  them. The runtime keeps a record of every type error it produced, so you can still find
  them after the fact; see _Flight Recorder_.
- **Throwing is still JavaScript.** A `throw` inside a TJS function, or an exception from a
  library you call, behaves exactly as it does in JavaScript. TJS changes how _type_ errors
  are reported, not how exceptions work.
- **Debugging aids are opt-in.** `configure({ callStacks: true })` (from `tjs-lang/lang`)
  adds the call chain to every error, at roughly twice the cost per call, and
  `configure({ throwTypeErrors: true })` makes type errors throw so a debugger stops on
  them.
