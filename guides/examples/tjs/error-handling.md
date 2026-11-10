<!--{"section": "tjs", "order": 7, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Error Handling

In TJS a type error is a value, not an exception. A *typed parameter* is one written with an
example value, such as `name: ''` (a string) or `port: 8080` (an integer); see
[TJS Syntax](/tjs-syntax/) if that form is new to you. When a call passes the wrong kind of
value to a typed parameter, the function does not run its body. It returns a `MonadicError`:
an `Error` subclass the runtime creates when a check fails. ("Monadic" is the name for this
style, where a failure is passed along as a value instead of being thrown.) Every typed
function that later receives that error hands it straight back.

This chapter covers how errors travel, how to report failures of your own, how to turn
exceptions into error values, and where in a program to deal with them. The `test` blocks in
each example run on the page.

## Errors propagate on their own

```tjs:inline
function validate(name: ''): '' {
  return name.trim()
}

// The return example is a worked example: greet('') returns 'Hello, !'
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
// → HELLO, ALICE!
console.log(shout(greet(validate(42))).message)
// → Expected string for '…:validate.name', got number
```

The pipeline `shout(greet(validate(42)))` contains no error handling and needs none.
`validate` refuses the number and returns a `MonadicError`. `greet` is handed that error
where it expected a string; it recognises it, skips its body, and returns it unchanged. So
does `shout`.

The second test shows that the message at the end of the chain names the place the failure
started (`validate.name`), not the last function it passed through. The third shows why: the
error that comes out is the *same object* that `validate` created. Nothing along the way
wraps it, copies it or adds an error about the error, so `===` holds at every step.

Propagation happens at typed parameters, and only there. An error that reaches anything else
is an ordinary object:

```tjs:inline
function validate(name: ''): '' {
  return name.trim()
}

function untyped(text) {
  return 'body ran with ' + typeof text
}

function anything(text: any) {
  return 'body ran with ' + typeof text
}

const err = validate(42)

test 'only a checked parameter hands the error back' {
  expect(untyped(err)).toBe('body ran with object')
  expect(anything(err)).toBe('body ran with object')
  expect(`${err}`.startsWith('MonadicError: Expected string')).toBe(true)
}

console.log(untyped(err))
// → body ran with object
console.log(`${err}`)
// → MonadicError: Expected string for '…:validate.name', got number
```

A parameter with no example, or one declared `any`, accepts the error and runs the body. A
template literal or `+` turns it into its message text, and `err.length` is `undefined`. So
before doing arithmetic or string work on a value that might be an error, check first:
`if (result instanceof Error) return result`. A parameter that does check its value hands
the error back even when the error is inside an array or plain object passed to it.

## What an error carries

`isMonadicError(x)` is true for the errors TJS itself produces: type errors, and the errors
from `try` without `catch` and from bang access, both covered below. `x instanceof Error` is
true for those too (a `MonadicError` is an `Error`), and also for errors you create
yourself. A type error carries these fields:

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
// → message:  Expected string for '…:shout.text', got number
// → path:     …:shout.text
// → expected: string  actual: number
// → received: 42
```

| Field | Contents |
| --- | --- |
| `message` | The whole story in one line, built from the fields below |
| `path` | Where the check failed: file, line, function and parameter (`app.tjs:1:shout.text`) |
| `expected` | The type the parameter wanted (`string`) |
| `actual` | The type that arrived (`number`) |
| `received` | The argument itself, as it arrived (`42`). When the failure is a key missing from an object argument, it is that whole object |
| `callStack` | The chain of calls that led here, only when call stacks are turned on (see Gotchas) |

Errors from `try` without `catch` carry only a `message` (their `path` is just `'try'`), and
errors from bang access have a short path such as `bang.name`, with no file or line.

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

Only errors the runtime made are passed along. A plain `Error` is an ordinary value as far as
TJS is concerned, and a function is free to take one as an argument (a logger, for example),
so the runtime does not treat every `Error` it sees as a failure to hand back. There is no
constructor for making a propagating `MonadicError` of your own.

So where you handle errors, test `instanceof Error`: it catches the runtime's errors and
yours with one check. Use `isMonadicError` when you want only the errors TJS produced.

### The result-object alternative

Libraries ported from other languages often report a failure in a field of an ordinary
object instead:

```tjs:inline
function divide(a: 10.0, b: 2.0): { value: 5 } {
  if (b == 0) {
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

The return example `{ value: 5 }` does not reject the extra `error` key. A return example is
checked by the signature test (`divide(10.0, 2.0)` must give `{ value: 5 }`), not on every
call, so the failure shape is never compared against it.

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

This is TJS-only syntax: in JavaScript a `try` must have a `catch` or a `finally`. When
something inside the block throws, the function returns the `MonadicError` at once, and code
after the `try` does not run. Because the result is a `MonadicError`, it passes through
`describePort` unchanged, exactly as a type error would.

The error keeps only the original exception's message, so the exact wording comes from the
JavaScript engine running the page. The exception object itself is not kept, and `path`,
`expected` and `actual` are not filled in. A `try` with a `catch`, or a `try` with only a
`finally`, behaves exactly as it does in JavaScript: a `try … finally` with no `catch` still
lets the exception escape.

## Handle errors at the edge

Propagation means most functions never look at errors. Somewhere, though, an error has to
become a message, a status code or a retry, and that should happen in one place: the edge of
the pipeline, where the program meets its user.

The example below also uses bang access. `x!.name` returns a `MonadicError` if `x` is `null`
or `undefined`, and `x.name` otherwise (more in [Const and Bang](/const-and-bang/)). It turns
"this was null" into an error value instead of a `TypeError` thrown out of the middle of the
chain.

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
  return loud instanceof Error ? `no user ${id}` : loud
}

test 'the happy path' {
  expect(describe(2)).toBe('GRACE')
}

test 'a missing user becomes an error, then a message at the edge' {
  expect(isMonadicError(nameOf(9))).toBe(true)
  expect(describe(9)).toBe('no user 9')
}

console.log(describe(1), '/', describe(9))
// → ADA / no user 9
console.log(nameOf(9).message)
// → Expected non-null for 'bang.name', got null
```

`nameOf(9)` gets `null` back from `findUser`, and `!.name` returns a `MonadicError` instead
of throwing. `shout` passes it through, and only `describe`, at the edge, turns it into
words.

## Gotchas

- **Propagation needs a checked parameter to receive the error.** An untyped or `any`
  parameter, and expressions such as `` `${err}` `` or `err + 1`, treat the error as an
  ordinary value (see the second example above).
- **An ignored error is silent.** That is the cost of returning errors instead of throwing
  them. The runtime keeps a bounded record of recent type errors, so you can often still find
  them after the fact; see [Flight Recorder](/error-history/).
- **Async functions resolve to the error.** An `async` typed function given a bad argument
  returns a promise that *resolves* to the `MonadicError`; it does not reject. Test the
  awaited value, not with `.catch`. A `try` with no `catch` inside an `async` function also
  catches a rejected `await` and resolves to the error.
- **`throw` is still JavaScript.** A `throw` inside a TJS function, or an exception from a
  library you call, behaves exactly as it does in JavaScript unless it happens inside a
  `try` with no `catch`. TJS changes how *type* errors are reported, not how exceptions work.
- **Call stacks are off by default.** An error's `path` says where the check failed, but not
  how the program got there. Turning on `callStacks` adds a `callStack` to every error,
  listing the calls that led to it, for example `["app.tjs:3:outer", "app.tjs:2:inner"]`. It
  roughly doubles the cost of each call, so turn it on while debugging, not in production.
- **To stop in a debugger, make type errors throw.** `throwTypeErrors` makes the runtime
  throw each type error instead of returning it, so a debugger with "pause on exceptions"
  stops at the failing call. This changes behaviour: code that handled the returned error
  will not see it. Use it only while debugging.
- **Both settings need the shared runtime.** They are set with `configure` from
  `tjs-lang/runtime` (not `tjs-lang/lang`), after installing the runtime and before your TJS
  modules load:

  ```javascript
  import { installRuntime, configure } from 'tjs-lang/runtime'

  installRuntime()
  configure({ callStacks: true })
  ```

  Emitted code that runs with only its built-in fallback runtime ignores both settings. On a
  page that has already installed the runtime (this site does), `__tjs.configure({ … })`
  sets them; it also prints a warning that modules already loaded keep their old settings.
