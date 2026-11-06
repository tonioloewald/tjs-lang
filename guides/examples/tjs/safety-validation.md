<!--{"section": "tjs", "type": "example", "group": "basics", "order": 19, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Safety & Validation

In TJS, a typed parameter is checked every time the function is called, not only when the
code is compiled. A wrong argument produces an error *value* that says what was expected and
what arrived. This chapter shows what is checked, how to check return values too, and how to
turn the checks off where you have a reason to.

## The problem

JavaScript functions accept whatever they are given:

```javascript
function greet(name) { return `Hello, ${name}!` }
greet(42) // "Hello, 42!" — no error, just wrong
```

TypeScript catches this at compile time, but the types are erased, so nothing checks the
value that actually arrives at runtime: data from a network request, a file, or a caller
written in plain JavaScript.

## Inputs are checked

```tjs:inline
// --- Input validation catches bad callers ---

function sayHello(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

test 'valid input works normally' {
  expect(sayHello('Alice')).toBe('Hello, Alice!')
}

test 'wrong type returns an error, not garbage' {
  // Not "Hello, 42!": an error value
  expect(sayHello(42) instanceof Error).toBe(true)
}

test 'null returns an error' {
  expect(sayHello(null) instanceof Error).toBe(true)
}

// --- The example decides how strict the check is ---

function setAge(age: +0): +0 {
  return age
}

test 'non-negative integer accepted' {
  expect(setAge(25)).toBe(25)
}

test 'negative rejected' {
  expect(setAge(-1) instanceof Error).toBe(true)
}

test 'float rejected (an age is an integer)' {
  expect(setAge(25.5) instanceof Error).toBe(true)
}

// --- Errors pass through typed functions ---

function cleanName(name: ''): '' {
  return name.trim()
}

function upperCase(name: ''): '' {
  return name.toUpperCase()
}

test 'an error travels to the end of the chain' {
  // cleanName(42) returns an error; upperCase receives it and returns it unchanged
  expect(upperCase(cleanName(42)) instanceof Error).toBe(true)
  expect(upperCase(cleanName(' alice '))).toBe('ALICE')
}

console.log('sayHello("World"):', sayHello('World'))
console.log('sayHello(42):     ', sayHello(42).message)
console.log('setAge(25.5):     ', setAge(25.5).message)
console.log('chain:            ', upperCase(cleanName(42)).message)
```

### What to notice

**A bad argument produces a value, not an exception.** `sayHello(42)` neither prints
`Hello, 42!` nor throws. It returns a `MonadicError` whose message names the expected type,
the actual type, and the parameter (`Expected string for '…sayHello.name', got number`). Your
program keeps running, and the error is something you can inspect, log, or return.

**The example decides how strict the check is.** `age: +0` accepts `25` and refuses both `-1`
and `25.5`. You get "non-negative integer" without writing a validator, because that is what
the example `+0` means. (Other examples narrow the same way: `0` is any integer, `0.0` any
number; see [Declarations](/declarations/).)

**Errors pass through typed functions.** When a function with typed parameters receives a
`MonadicError` as an argument, it does not run its body; it returns that error. So
`upperCase(cleanName(42))` needs no check between the two calls, and the message at the end
still names `cleanName`, where the failure happened. [Error Handling](/error-handling/) covers
this in depth, including where in a program to deal with the error.

## Turning the checks off

### `!` on one function

A `!` before the parameter list tells TJS to trust the callers of that function and emit no
checks for it:

```tjs:inline
function fastAdd(! a: 0, b: 0): 0 {
  return a + b
}

test 'an unsafe function skips its checks' {
  expect(fastAdd(3, 4)).toBe(7)
  expect(fastAdd('a', 'b')).toBe('ab') // no error: validation is off
}

console.log("fastAdd('a', 'b'):", fastAdd('a', 'b'))
```

The signature is still recorded (documentation, autocomplete, the signature test `fastAdd(0, 0)`
still runs at transpile time); only the runtime check is gone. Use it on hot internal
functions whose inputs were already checked at the boundary, never on a function that
receives outside data.

### `safety none` for a whole file

A `safety` line at the top of a file sets the default for every function in it. There are two
settings that matter: `safety inputs`, which is the default and what every other example in
this chapter uses (so you never need to write it), and `safety none`, which emits no runtime
checks in the file at all while keeping the type metadata:

```tjs:inline
safety none

function greet(name: 'World') {
  return `Hello, ${name}!`
}

console.log(greet(42)) // "Hello, 42!": nothing is checked in this file
```

Reach for `safety none` only when a file is a measured hot spot and everything that calls it
already validates its data. A third setting, `safety all`, is accepted but currently checks
the same things as `safety inputs` (see Gotchas).

## Checking returns as well

Input checks catch bad *callers*. To catch your own bugs, check what a function returns with
`:?`. The three return forms differ in what they check:

| Return form | At transpile time | At runtime |
| --- | --- | --- |
| `: 0` | runs the signature example as a test | nothing |
| `:! 0` | nothing (declares the type only) | nothing |
| `:? 0` | runs the signature example as a test | checks every value returned |

```tjs:inline
function average(xs: [0.0]):? 0.0 {
  if (xs.length == 0) return 'no data' // a bug: a string where a number belongs
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

console.log('average([2, 4]):', average([2, 4]))

const r = average([])
console.log('average([]):    ', r instanceof Error ? r.message : r)
```

The bad path is caught where it happens, with the function's name in the message
(`Expected number for '…average:return', got string`), rather than three calls later as a
`NaN`.

## Class methods and constructors are checked too

Typed parameters on a constructor or a method validate exactly as a function's do, so a class
cannot be built from, or fed, the wrong kind of value:

```tjs:inline
class Account {
  constructor(owner: 'Ada', balance: 0.0) {
    this.owner = owner
    this.balance = balance
  }

  deposit(amount: 0.0) {
    this.balance += amount
    return this.balance
  }
}

const acct = Account('Ada', 10)
console.log('deposit(5):    ', acct.deposit(5))

const bad = acct.deposit('5')
console.log("deposit('5'):  ", bad instanceof Error ? bad.message : bad)

const nobody = Account(42, 0)
console.log('Account(42, 0):', nobody instanceof Error ? nobody.message : nobody)
```

(TJS classes are called without `new`; see [Better Classes](/better-classes/).)

## `try` without `catch`

Type checks cover the values you pass. Code you call can still *throw*: `JSON.parse` throws on
malformed text. In TJS you can write a `try` block with no `catch`, and an exception thrown
inside it becomes a returned `MonadicError` instead:

```tjs:inline
function readPort(configText: '{"port":8080}') {
  try {
    return JSON.parse(configText).port
  }
}

test 'valid JSON parses normally' {
  expect(readPort('{"port":8080}')).toBe(8080)
}

test 'invalid JSON returns an error instead of throwing' {
  expect(readPort('{port') instanceof Error).toBe(true)
}

console.log('good:', readPort('{"port":8080}'))

const bad = readPort('{port')
console.log('bad: ', bad instanceof Error ? bad.message : bad)
```

The caller handles bad JSON the same way it handles a bad argument: by looking at the value it
got back. The error's message is the original exception's message, so its exact wording comes
from the JavaScript engine running the page. A `try` with a `catch` (or a `finally`) behaves
exactly as it does in JavaScript.

## Gotchas

- **A returned error is easy to ignore.** That is the price of not throwing. If you call a
  function for its side effect and drop the result, a failure disappears. The runtime keeps
  a record of every type error regardless; see [Flight Recorder](/error-history/).
- **`!` is all or nothing for the function.** It disables the checks on every parameter. To
  relax just one, give that parameter a looser type (`x: any`) instead.
- **`safety all` and `?`.** The reference also lists `safety all` (check returns everywhere)
  and a `?` parameter marker (force checks under `safety none`). In transpiled code today,
  neither adds a check: `safety all` validates exactly what `safety inputs` does, and `?`
  under `safety none` is ignored. Use `:?` on the returns you want checked.
- **Validation happens at the call.** A typed parameter checks the value when the function is
  called; it does not stop the body from later putting something else in an object it
  returned.
