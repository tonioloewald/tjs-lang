<!--{"section": "tjs", "order": 7, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Error Handling

In TJS a type error is a value, not an exception. A function that receives the wrong kind of
argument returns a `MonadicError`, and every typed function that receives that error hands
it straight back. This chapter covers how errors travel, how to report failures of your own,
how to turn exceptions into error values, and where in a program to deal with them.

## Errors propagate on their own

```tjs:inline
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
  expect(shout(greet(validate('alice')))).toBe('HELLO, ALICE!')
}

test 'a type error travels through the whole chain' {
  const result = shout(greet(validate(42)))
  expect(isMonadicError(result)).toBe(true)
  expect(result.message).toContain('validate.name')
}

test 'it is the same error object at every step' {
  const err = validate(42)
  expect(greet(err)).toBe(err)
  expect(shout(err)).toBe(err)
}

console.log(shout(greet(validate(' alice '))))
console.log(shout(greet(validate(42))).message)
```

The pipeline `shout(greet(validate(42)))` contains no error handling and needs none.
`validate` refuses the number and returns a `MonadicError`. `greet` is handed that error
where it expected a string; it recognises it, skips its body, and returns it unchanged. So
does `shout`.

The third test is the important one: the error that comes out is the *same object* that
`validate` created, not a copy or a new error about the error. So the message at the end of
the chain names the place the failure started (`validate.name`), not the last function it
passed through.

## What an error carries

`isMonadicError(x)` is the check. `x instanceof Error` also returns true (a `MonadicError`
is an `Error`), but `isMonadicError` says what you mean and works across module boundaries.

```tjs:inline
function shout(text: 'ada'): 'ADA' {
  return text.toUpperCase()
}

const err = shout(42)

test 'an error says where, what was expected, and what arrived' {
  expect(isMonadicError(err)).toBe(true)
  expect(err.path.endsWith('shout.text')).toBe(true)
  expect(err.expected).toBe('string')
  expect(err.actual).toBe('number')
  expect(err.received).toBe(42)
}

console.log('message: ', err.message)
console.log('path:    ', err.path)
console.log('expected:', err.expected, ' actual:', err.actual)
console.log('received:', err.received)
```

| Field | Contents |
| --- | --- |
| `message` | The whole story in one line, built from the fields below |
| `path` | Where the check failed: file, line, function and parameter (`…:shout.text`) |
| `expected` | The type the parameter wanted (`string`) |
| `actual` | The type that arrived (`number`) |
| `received` | The argument itself, as it arrived (`42`); for a missing member, the whole object |
| `callStack` | The chain of calls that led here, only when call stacks are turned on (see Gotchas) |

## Your own errors: return an `Error`

Some failures are well-typed and still wrong: dividing by zero, a date in the future, an
empty name. The runtime cannot see these, so reporting them is your job. TJS recommends
returning an `Error` with a message the caller can act on, as the
[When Things Go Wrong](/when-things-go-wrong/) chapter teaches:

```tjs:inline
function divide(a: 0.0, b: 0.0) {
  if (b == 0) {
    return Error('cannot divide by zero')
  }
  return a / b
}

function half(x: 0.0) {
  return x / 2
}

const failed = divide(1, 0)
const later = half(failed)

test 'divide reports its own failure' {
  expect(divide(6, 3)).toBe(2)
  expect(failed instanceof Error).toBe(true)
  expect(failed.message).toBe('cannot divide by zero')
}

test 'a returned Error is not a MonadicError, and does not pass through' {
  expect(isMonadicError(failed)).toBe(false)
  expect(isMonadicError(later)).toBe(true)
  expect(later === failed).toBe(false)
  expect(later.received).toBe(failed)
}

console.log('divide(1, 0):      ', failed.message)
console.log('half(divide(1, 0)):', later.message)
console.log('original:          ', later.received.message)
```

A returned `Error` does **not** propagate the way a `MonadicError` does. Hand it to `half`,
which wants a number, and `half` refuses it like any other wrong value: it returns a new
`MonadicError` ("Expected number … got object"). The original is not lost, though. It is
kept as `later.received`, so the message you wrote is still there for whoever handles the
failure. From then on the new `MonadicError` propagates normally.

This is why the recommended check is `instanceof Error`, or `isMonadicError` when you only
care about type errors: one test catches the runtime's errors and yours.

### The result-object alternative

Libraries ported from other languages often report a failure in a field of an ordinary
object instead:

```tjs:inline
function divide(a: 10.0, b: 2.0): { value: 5 } {
  if (b === 0) {
    return { value: NaN, error: 'Division by zero' }
  }
  return { value: a / b }
}

test 'the caller must look in the right field' {
  expect(divide(10, 2).value).toBe(5)
  expect(divide(10, 0).error).toBe('Division by zero')
  expect(divide(10, 0) instanceof Error).toBe(false)
}

console.log(divide(10, 2), divide(10, 0))
```

This works, and TJS does not forbid it, but it costs you something. The result is not an
`Error`, so `instanceof Error`, `isMonadicError` and the [Flight Recorder](/error-history/)
see nothing wrong with it; every caller has to know to look at `.error`, and a caller that
forgets reads `NaN` as an answer. Prefer it only when the shape is fixed by something
outside your code, such as an API you are matching.

## Turning exceptions into values: `try` without `catch`

Type checks cover the values you pass. Code you call can still *throw*: `JSON.parse` throws
on malformed text. In TJS you can write a `try` block with no `catch`, and an exception
thrown inside it becomes a returned `MonadicError` instead:

```tjs:inline
function readPort(configText: '{"port":8080}') {
  try {
    return JSON.parse(configText).port
  }
}

function describePort(port: 8080) {
  return `listening on ${port}`
}

const bad = readPort('{port')

test 'valid JSON parses normally' {
  expect(readPort('{"port":8080}')).toBe(8080)
}

test 'invalid JSON returns an error instead of throwing' {
  expect(isMonadicError(bad)).toBe(true)
}

test 'and that error propagates like a type error' {
  expect(describePort(bad)).toBe(bad)
}

console.log(describePort(readPort('{"port":8080}')))
console.log(describePort(bad).message)
```

Because the result is a `MonadicError`, it passes through `describePort` unchanged, exactly
as a type error would. Its message is the original exception's message, so the exact wording
comes from the JavaScript engine running the page. A `try` with a `catch` (or a `finally`)
behaves exactly as it does in JavaScript.

## Handle errors at the edge

Propagation means most functions never look at errors. Somewhere, though, an error has to
become a message, a status code or a retry, and that should happen in one place: the edge of
the pipeline, where the program meets its user. Bang access (`x!.name`, see
[Const and Bang](/const-and-bang/)) fits the same model: it turns "this was null" into an
error value instead of a `TypeError` thrown out of the middle of the chain.

```tjs:inline
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

console.log(describe(1), '/', describe(9))
console.log(nameOf(9).message)
```

`nameOf(9)` gets `null` back from `findUser`, and `!.name` returns a `MonadicError` instead
of throwing. `shout` passes it through, and only `describe`, at the edge, turns it into
words.

## Gotchas

- **Propagation needs a typed parameter to receive the error.** Passing an error to a TJS
  function's typed parameter short-circuits. Using it in a plain expression does not:
  `err.length`, `` `${err}` `` or `err + 1` operate on the error object like any other value.
  If a value might be an error and you are about to do arithmetic or string work on it, check
  first: `if (isMonadicError(result)) return result`.
- **An ignored error is silent.** That is the cost of returning errors instead of throwing
  them. The runtime keeps a record of every type error it produced, so you can still find
  them after the fact; see [Flight Recorder](/error-history/).
- **`throw` is still JavaScript.** A `throw` inside a TJS function, or an exception from a
  library you call, behaves exactly as it does in JavaScript unless it happens inside a
  `try` with no `catch`. TJS changes how *type* errors are reported, not how exceptions work.
- **Call stacks are off by default.** An error's `path` says where the check failed, but not
  how the program got there. In code that imports from `tjs-lang/lang`,
  `configure({ callStacks: true })` adds a `callStack` to every error, listing the source
  locations of the calls that led to it. It roughly doubles the cost of each call, so turn
  it on while debugging, not in production.
- **To stop in a debugger, make type errors throw.** `configure({ throwTypeErrors: true })`
  makes the runtime throw each type error instead of returning it, so a debugger with "pause
  on exceptions" stops at the failing call. This changes behaviour: code that handled the
  returned error will not see it. Use it only while debugging.
