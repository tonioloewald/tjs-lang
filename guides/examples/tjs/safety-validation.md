<!--{"section": "tjs", "type": "example", "group": "basics", "order": 19, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Safety & Validation

In TJS, a typed parameter is checked every time the function is called, not only when the
code is compiled. A wrong argument produces an error *value* that says what was expected and
what arrived. This page shows what is checked, how to check return values too, and how to
turn the checks off where you have a reason to.

## The problem

JavaScript functions accept whatever they are given:

```javascript
function greet(name) { return `Hello, ${name}!` }
greet(42) // "Hello, 42!" — no error, just wrong
```

TypeScript catches this at compile time, but its types are erased (removed when the code
becomes JavaScript), so nothing checks the value that actually arrives while the program
runs: data from a network request, a file, or a caller written in plain JavaScript.

## Inputs are checked

In `function sayHello(name: 'World'): 'Hello, World!'`, the value after each colon is an
*example*, not a type and not a fixed value. `name: 'World'` says `name` is a string, with
`'World'` as a sample. The return example `'Hello, World!'` is a worked example: when TJS
turns the file into JavaScript (transpile time), it calls `sayHello('World')` and checks
that the result equals `'Hello, World!'`. That check is the *signature test*. See
[Declarations](/declarations/) for the full rules.

How strict a numeric check is depends on how the example is written:

| Example | Accepts |
| --- | --- |
| `0` | any integer |
| `0.0` | any number |
| `+0` | a non-negative integer |

The `test '…' { }` blocks below are TJS's inline tests: they run with the example and report
pass or fail (see [Inline Tests](/inline-tests-test-private-functions/)). `isMonadicError(x)`
is true for an error TJS itself returned.

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
  expect(isMonadicError(sayHello(42))).toBe(true)
}

test 'null returns an error' {
  expect(isMonadicError(sayHello(null))).toBe(true)
}

// --- The example decides how strict the check is ---

function setAge(age: +0): +0 {
  return age
}

test 'non-negative integer accepted' {
  expect(setAge(25)).toBe(25)
}

test 'negative rejected' {
  expect(isMonadicError(setAge(-1))).toBe(true)
}

test 'float rejected (an age is an integer)' {
  expect(isMonadicError(setAge(25.5))).toBe(true)
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
  expect(isMonadicError(upperCase(cleanName(42)))).toBe(true)
  expect(upperCase(cleanName(' alice '))).toBe('ALICE')
}

console.log('sayHello("World"):', sayHello('World'))
console.log('sayHello(42):     ', sayHello(42).message)
console.log('setAge(25.5):     ', setAge(25.5).message)
console.log('chain:            ', upperCase(cleanName(42)).message)
// → sayHello("World"): Hello, World!
// → sayHello(42):      Expected string for '…:3:sayHello.name', got number
// → setAge(25.5):      Expected non-negative-integer for '…:22:setAge.age', got number
// → chain:             Expected string for '…:40:cleanName.name', got number
```

### What to notice

**A bad argument produces a value, not an exception.** `sayHello(42)` neither prints
`Hello, 42!` nor throws. It returns a `MonadicError`: a subclass of `Error` that is returned
rather than thrown, so `instanceof Error` is true for it as well. Its message names the
expected type, the actual type, and where the check failed (`Expected string for
'…:3:sayHello.name', got number`; the `…` stands for the file name, and `3` is the line).
Your program keeps running, and the error is something you can inspect, log, or return.

**The example decides how strict the check is.** `age: +0` accepts `25` and refuses both `-1`
and `25.5`. You get "non-negative integer" without writing a validator, because that is what
the example `+0` means.

**Errors pass through typed functions.** When a function with typed parameters receives a
`MonadicError` as an argument, it does not run its body; it returns that error. So
`upperCase(cleanName(42))` needs no check between the two calls, and the message at the end
still names `cleanName`, where the failure happened. [Error Handling](/error-handling/) covers
this in depth, including where in a program to deal with the error.

## Turning the checks off

### `!` on one function

A `!` as the first thing inside the parentheses, before the first parameter, tells TJS to
trust the callers of that function. It turns off the checks for every parameter, not only
the one it sits next to:

```tjs:inline
function fastAdd(! a: 0, b: 0): 0 {
  return a + b
}

test 'an unsafe function skips its checks' {
  expect(fastAdd(3, 4)).toBe(7)
  expect(fastAdd('a', 'b')).toBe('ab') // no error: validation is off
}

console.log("fastAdd('a', 'b'):", fastAdd('a', 'b'))
// → fastAdd('a', 'b'): ab
```

The signature is still recorded and still used for documentation and autocomplete, and the
signature test `fastAdd(0, 0)` still runs at transpile time; only the runtime check is gone. Use it on hot internal
functions whose inputs were already checked at the boundary, never on a function that
receives outside data.

### `safety none` for a whole file

A `safety` line as the first line of a file sets the default for every function in it.
`safety inputs` is the default and what every other example on this page uses, so you never
need to write it. `safety none` turns off every runtime check in the file, while the
signatures stay available for documentation, autocomplete and signature tests. Each example
on this page is its own file, so `safety none` here affects only this block:

```tjs:inline
safety none

function greet(name: 'World') {
  return `Hello, ${name}!`
}

console.log(greet(42)) // "Hello, 42!": nothing is checked in this file
```

Reach for `safety none` only when a file is a measured hot spot and everything that calls it
already validates its data. `safety all` also exists, but it currently checks the same things
as `safety inputs`; use `:?` (below) to check returns. Likewise a `?` before the parameters
(`function f(? a: 0)`) is accepted and has no effect. See the
[syntax reference](/TJS-SYNTAX/), under "The `safety` directive".

## Checking returns as well

Input checks catch bad *callers*. To catch your own bugs, check what a function returns with
`:?`. Take `function add(a: 2, b: 3): 5`. With `:`, TJS calls `add(2, 3)` at transpile time
and checks the result equals `5`. `:!` skips that test, for when the example only describes
the type and is not a real answer. `:?` runs the test and also checks every value the
function returns while the program runs:

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
// → average([2, 4]): 3
// → average([]):     Expected number for '…:1:average:return', got string
```

The bad path is caught where it happens, with the function's name in the message, rather
than later, when some other function does arithmetic on `'no data'` and produces `NaN` far
from the cause.

## Class methods and constructors are checked too

Typed parameters on a constructor or a method validate exactly as a function's do, so a class
cannot be built from, or fed, the wrong kind of value. TJS classes are called without `new`
(see [Better Classes](/better-classes/)):

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

const acct = Account('Ada', 10) // no `new` needed in TJS
console.log('deposit(5):    ', acct.deposit(5))

const bad = acct.deposit('5')
console.log("deposit('5'):  ", bad instanceof Error ? bad.message : bad)

const nobody = Account(42, 0)
console.log('Account(42, 0):', nobody instanceof Error ? nobody.message : nobody)
// → deposit(5):     15
// → deposit('5'):   Expected number for '…:7:Account.deposit.amount', got string
// → Account(42, 0): Expected string for '…:2:Account.constructor.owner', got number
```

The constructor returns the error instead of an object, so `nobody` is a `MonadicError`.

## When code you call throws

Type checks cover the values you pass. Code you call can still *throw*: `JSON.parse` throws on
malformed text. TJS lets you write a `try` block with no `catch`, which turns such an exception
into a returned error; [Error Handling](/error-handling/) covers it.

## Gotchas

- **A returned error is easy to ignore.** That is the price of not throwing. If you call a
  function for its side effect and drop the result, a failure disappears. The runtime keeps
  a record of recent type errors (the last 64); see [Flight Recorder](/error-history/).
- **`!` is all or nothing for the function.** It disables the checks on every parameter. To
  relax just one, declare that parameter `x: any` instead: `any` accepts every value, so that
  parameter is not checked (see [Declarations](/declarations/)).
- **A check looks at a value once.** It happens when the value passes through a call or a
  return, and does not keep watching it. If a function returns `{ age: 3 }` and some code
  later sets `obj.age = 'old'`, nothing catches it.
