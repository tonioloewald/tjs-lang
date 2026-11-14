<!--{"parent": "the-tjs-language.md", "order": 60}-->
<!-- TODO review -->

# Errors as Values

In JavaScript a function that fails throws. The exception unwinds the stack past every
caller until something catches it, and nothing in those callers' code says that it might
happen. You find out which functions throw what by reading their source, their docs, or a
stack trace in production.

A TJS type error is returned instead of thrown. The call hands back an error value where
its result would have been, so the failure is visible in the data flow: it is in a variable,
you can log it, pass it on, or test it. Nothing unwinds.

Only the runtime's own type checks return errors automatically. Failures you detect
yourself are returned by hand, as an ordinary `Error`, and `throw` and `catch` work exactly
as they do in JavaScript.

That has a cost, and it is worth stating up front: **a returned value is easy to ignore.**
An exception nobody catches stops the program and says so. An error value nobody checks
sits in a variable, or gets thrown away with the rest of an unused result. TJS's answer
is the flight recorder, a bounded record of every type error the runtime produced, checked
or not, covered in [the last part of this chapter](#the-flight-recorder).

If you have not met TJS errors at all, [When Things Go Wrong](/when-things-go-wrong/) in
Part I introduces them from scratch. This chapter assumes you write JavaScript and covers
what a caller sees, how errors travel, how to report your own failures, when to throw
anyway, and how the recorder works.

## What a caller sees

In TJS a parameter declares its type with an example value: `name: ' Ada '` means "a
string, for instance `' Ada '`", and makes `name` a **checked parameter**.
[Types by Example](/types-by-example/) covers the notation. When a call passes a value a
checked parameter does not accept, the function skips its body and returns a
`MonadicError`:

```tjs:inline
function clean(name: ' Ada '): 'ada' {
  return name.trim().toLowerCase()
}

const err = clean(42)

console.log(err instanceof Error)   // true: a MonadicError is an Error
console.log(isMonadicError(err))    // true
console.log(err.path)               // …:1:clean.name
console.log(err.expected)           // string
console.log(err.actual)             // number
console.log(err.message)            // Expected string for '…:1:clean.name', got number

test 'a refused call returns an error, not a result' {
  expect(clean(' Grace ')).toBe('grace')
  expect(isMonadicError(err)).toBe(true)
  expect(err.path.endsWith(':1:clean.name')).toBe(true)
  expect(err.received).toBe(42)
}
```

The `: 'ada'` after the parameter list is a **return example**: a worked example, tested
once when the file is transpiled (`clean(' Ada ')` must give `'ada'`). It is not compared
against each value the function returns at runtime, which matters later in this chapter,
when functions start returning errors.

`MonadicError` is a subclass of `Error`, so everything that works on an `Error` works on
it. ("Monadic" names the style: a failure travels as a value instead of being thrown. There
is no `.map` or `.then` API on it; propagation through checked parameters, below, plays that
role.) The fields a caller reads:

| Field | Contents |
| --- | --- |
| `path` | Where the check failed: file, line, function and parameter (`app.tjs:1:clean.name`) |
| `expected` | The type the parameter wanted (`string`) |
| `actual` | The type that arrived (`number`) |
| `message` | One line built from the three above |
| `received` | The argument itself, as it arrived (`42`) |

The file name in `path` is whatever the code was transpiled as; on this site it is a
placeholder, which is why the comments above show `…`.

### Return values are not checked unless you ask

The check runs on the way in. A function whose body returns a value of the wrong type
returns it as is, with no `MonadicError`, unless its return annotation is written `:?`
instead of `:`. Then the worked example is still tested at transpile time, and every result
is checked at runtime as well; a wrong one comes back as a `MonadicError` whose `path` ends
in `:return`:

```tjs:inline
function half(n: 4):? 2 {
  return n / 2
}

console.log(half(4))                   // 2
console.log(isMonadicError(half(3)))   // true: 1.5 is not an integer
console.log(half(3).path)              // …:1:half:return

test ':? checks every result' {
  expect(half(10)).toBe(5)
  expect(half(3).path.endsWith(':1:half:return')).toBe(true)
}
```

(`2`, with no decimal point, declares an integer; `2.0` would accept any number.)
[Safety and Validation](/safety-markers/) covers `:?` and its opposite, `:!`.

### Async functions resolve to the error

An `async` function with a checked parameter refuses a bad argument the same way. The
promise it returns **resolves** to the `MonadicError`; it does not reject:

```tjs:inline
async function loadUser(id: 1) {
  return { id, name: 'Ada' }
}

const user = await loadUser('one')
console.log(isMonadicError(user))   // true
console.log(user.message)           // Expected integer for '…:1:loadUser.id', got string

// A .catch() handler never runs: there is no rejection
loadUser('two').catch(() => console.log('never printed'))
```

So test the awaited value, as you would a synchronous result. A `.catch()` or a
`try`/`catch` around the `await` sees nothing.

Only the parameter check behaves this way. An exception thrown in the body of an `async`
TJS function still rejects the promise, as in JavaScript, unless you use the form of `try`
with no `catch` described [under Exceptions](#try-without-catch).

### `isMonadicError` is the check

`isMonadicError(x)` is true for errors the TJS runtime produced. It does not depend on which
copy of the `MonadicError` class made the error: it checks that the value is an `Error`
whose `name` is `'MonadicError'` and that has a `path`. So it gives the right answer for an
error from another module, another bundle, or another copy of tjs-lang on the same page.
(The `instanceof Error` part means an error made in another realm, such as an iframe, does
not pass.)

In a `.tjs` file that declares at least one checked function it is available without an
import, which covers every example on this page. A file with no checked function does not
get it; there, and in plain JavaScript, import it from `tjs-lang/runtime`.

## How errors travel

A checked parameter that receives a `MonadicError` does not report a second error about
the first. It returns the error it was given, unchanged, without running its body. So a
chain of checked calls needs no checks in the middle:

```tjs:inline
function clean(name: ' Ada '): 'ada' {
  return name.trim().toLowerCase()
}

function shout(text: 'ada'): 'ADA' {
  return text.toUpperCase()
}

console.log(shout(clean(' Grace ')))  // GRACE

const err = clean(42)
const bad = shout(err)

console.log(bad === err)              // true: shout handed back clean's error
console.log(bad.path)                 // …:1:clean.name

test 'the error comes out of shout as clean made it' {
  expect(shout(err)).toBe(err)
  expect(bad.path.endsWith('clean.name')).toBe(true)
}
```

`clean` refuses the number. `shout` gets that error where it wanted a string, recognises
it, and hands it back. The error that reaches the end still names `clean.name`, the place
the failure began, because it is the same object: nothing along the way wraps it, copies it
or adds context. That is what makes the path useful at the end of a long pipeline.

### Errors inside an argument

An error can also arrive inside an argument, for instance as one element of an array. When
the argument fails its check, the runtime looks inside it before making a new error, and if
it finds a `MonadicError` it returns that one:

```tjs:inline
function clean(name: ' Ada '): 'ada' {
  return name.trim().toLowerCase()
}

function total(counts: [0]) {
  return counts.reduce((sum, n) => sum + n, 0)
}

const err = clean(42)

console.log(total([1, 2, 3]))         // 6
console.log(total([1, err]) === err)  // true: the error inside the array comes out

test 'a carried error is found and returned' {
  expect(total([1, err])).toBe(err)
  expect(total([[err]])).toBe(err)
}
```

(`[0]` is an example meaning "an array of integers".) The search goes through plain arrays
and plain objects at any depth, up to a few thousand values, and stops at class instances.
It runs only when the check fails: an error in a place the check does not look, such as an
extra key on an object or anywhere inside a parameter declared `{}`, is passed through
without comment.

### Where propagation stops

Propagation happens at checked parameters, and nowhere else. A parameter with no example
(so not checked), a parameter declared `any`, and every ordinary expression treat the error
as an ordinary object:

```tjs:inline
function clean(name: ' Ada '): 'ada' {
  return name.trim().toLowerCase()
}

function untyped(text) {
  return 'body ran with ' + typeof text
}

function anything(text: any) {
  return 'body ran with ' + typeof text
}

const err = clean(42)

console.log(untyped(err))    // body ran with object
console.log(anything(err))   // body ran with object
console.log(`${err}`)        // MonadicError: Expected string for '…:1:clean.name', got number
console.log(err + 1)         // MonadicError: Expected string … got number1

test 'only a checked parameter hands the error back' {
  expect(untyped(err)).toBe('body ran with object')
  expect(anything(err)).toBe('body ran with object')
  expect(`${err}`.startsWith('MonadicError: Expected string')).toBe(true)
  expect(isMonadicError(err + 1)).toBe(false)
}
```

A template literal or `+` turns the error into its message text, and from then on it is a
string, not an error. So code that does arithmetic or string work on a value that might be
an error has to check first: `if (value instanceof Error) return value`. That uses
`instanceof Error` rather than `isMonadicError` because it also catches errors you return
yourself, [described below](#reporting-your-own-failures).

### Handle errors at the edge

Because typed functions pass errors along, most of them never look at one. Somewhere an
error has to become a message, a status code or a retry, and that decision belongs in one
place: the edge, where the program meets its caller or its user.

```tjs:inline
function clean(name: ' Ada '): 'ada' {
  return name.trim().toLowerCase()
}

function shout(text: 'ada'): 'ADA' {
  return text.toUpperCase()
}

// The edge: the one place that decides what an error means to the user
function greeting(input) {
  const loud = shout(clean(input))
  if (loud instanceof Error) {
    return 'please type a name'
  }
  return `HELLO, ${loud}`
}

console.log(greeting(' Grace '))   // HELLO, GRACE
console.log(greeting(42))          // please type a name

test 'only the edge looks at the error' {
  expect(isMonadicError(shout(clean(42)))).toBe(true)
  expect(greeting(42)).toBe('please type a name')
}
```

`clean` and `shout` contain no error handling. `greeting` checks once, with
`instanceof Error`, which also catches errors of your own (next section). Its parameter has
no example, so it is not checked: the bad input reaches the body, where `greeting` decides
what to say about it.

## Reporting your own failures

The runtime catches values of the wrong type. It cannot know that a well-typed value is
wrong: a birth year in the future, an empty cart, a division by zero. Reporting those is
your job, and the TJS way is to return an `Error` with a message the caller can act on:

```tjs:inline
function ageIn(year: 2026, born: 1990): 36 {
  if (born > year) {
    return Error(`born ${born} is after ${year}`)
  }
  return year - born
}

function describe(age: 36): '36 years' {
  return `${age} years`
}

const failed = ageIn(2026, 2030)
const later = describe(failed)

console.log(failed.message)            // born 2030 is after 2026
console.log(later.message)             // Expected integer for '…:8:describe.age', got object
console.log(later.received.message)    // born 2030 is after 2026

test 'a returned Error is yours, not the runtime\'s' {
  expect(ageIn(2026, 1990)).toBe(36)
  expect(failed instanceof Error).toBe(true)
  expect(isMonadicError(failed)).toBe(false)
}

test 'a typed callee refuses it, and keeps it' {
  expect(isMonadicError(later)).toBe(true)
  expect(later === failed).toBe(false)
  expect(later.received).toBe(failed)
}
```

(`Error('…')` without `new` is ordinary JavaScript; `Error` has always worked both ways.)

Two things in this example need a word. First, `ageIn` returns an `Error` although its
return example is `36`. That is allowed because, as [noted above](#what-a-caller-sees), a
return example is tested once at transpile time and is not checked against each result.
Second, the message says "integer" because the example `36` has no decimal point, which
declares an integer; `36.0` would accept any number.

Your `Error` does **not** propagate the way a `MonadicError` does. Hand it to `describe`,
which wants an integer, and `describe` refuses it like any other wrong value: it returns a
new `MonadicError` whose `path` names `describe.age`. The original is not lost. It is kept
as `.received`, so the message you wrote is still there for the edge to read, and from
there on the new `MonadicError` propagates normally.

The reason is that a plain `Error` is an ordinary value as far as TJS is concerned. A logger
or an error reporter legitimately takes one as an argument, and declares a parameter that
accepts it. If every `Error` propagated, that logger would hand each error back unlogged
instead of running. So propagation is reserved for errors the runtime made.

There is one sanctioned way to turn a failure of your own into a propagating error: throw
it inside a `try` with no `catch`, [described below](#try-without-catch). Beyond that, the
class is reachable (`MonadicError` is in scope in a `.tjs` file with a checked function, and
`isMonadicError` checks by shape, so a hand-built look-alike passes too), but neither is a
documented API. The constructor's arguments may change between releases. Return an `Error`.

So where you handle errors, check with `instanceof Error`: it catches the runtime's errors
and yours in one test. Use `isMonadicError` when you specifically want the errors TJS made.

### The result-object alternative

Code ported from Go or Rust often reports failure in a field of an ordinary object:

```tjs:inline
function divide(a: 10.0, b: 2.0): { value: 5 } {
  if (b == 0) {
    return { value: NaN, error: 'division by zero' }
  }
  return { value: a / b }
}

console.log(divide(10, 4).value)   // 2.5
console.log(divide(10, 0).error)   // division by zero

test 'nothing marks the failure except the field' {
  expect(divide(10, 0) instanceof Error).toBe(false)
  expect(isMonadicError(divide(10, 0))).toBe(false)
  expect(Number.isNaN(divide(10, 0).value)).toBe(true)
}
```

It works, and TJS allows it, but every caller has to know to look at `.error`, and one that
forgets reads `NaN` as an answer. Nothing else sees a failure either: not `instanceof Error`,
not `isMonadicError`, not a typed parameter downstream, and not the flight recorder. Use it
when the shape is fixed by something outside your code, such as an API you are matching.

## Exceptions

TJS changes how type errors are reported. It does not change exceptions. A `throw` in a TJS
function, or an exception from a library you call, unwinds the stack exactly as it does in
JavaScript, and a `try` with a `catch` or a `finally` behaves exactly as it does there.

### `try` without `catch`

TJS adds one form. A `try` block with no `catch` (and no `finally`) turns an exception
thrown inside it into a returned `MonadicError`, which propagates like a type error.

The example's `parse` has a return annotation written `:!` instead of `:`. That declares the
return type without a worked example to test. With a plain `: {}`, TJS would call
`parse('{"port":8080}')` at transpile time, get `{ port: 8080 }`, compare it by value with
`{}`, and fail the file.

```tjs:inline
function parse(json: '{"port":8080}'):! {} {
  try {
    return JSON.parse(json)
  }
}

function portOf(config: { port: 8080 }): 8080 {
  return config.port
}

const good = parse('{"port":3000}')
const bad = parse('{port')

console.log(portOf(good))           // 3000
console.log(isMonadicError(bad))    // true
console.log(portOf(bad) === bad)    // true: it travels like any MonadicError

test 'an exception becomes a returned error' {
  expect(isMonadicError(bad)).toBe(true)
  expect(bad.path).toBe('try')
  expect(portOf(bad)).toBe(bad)
}
```

In JavaScript a `try` must have a `catch` or a `finally`, so this form cannot change the
meaning of any existing code. When something inside the block throws, the function returns
the error at once and the code after the `try` does not run.

The error keeps the exception's `message` (its wording comes from the JavaScript engine) and
little else. Its `path` is the bare string `'try'`, with no file, line or function, and the
exception object itself, stack trace included, is not kept. That is unlike a refused
argument, which is kept as `.received`. When you need to know where an exception came from,
write a real `catch` and look at the exception there.

This form depends on the shared TJS runtime, which this site, `tjs run` and the bun plugin
install. In emitted code running without it, the `try` returns a plain `Error` instead: it
carries the same message, but `isMonadicError` is false for it and a checked callee refuses
it with a new error rather than passing it on. [The Runtime](/runtime-configuration/)
explains the two runtimes.

Inside an `async` function the same form catches a rejected `await`, so the function
resolves to the error instead of rejecting:

```tjs:inline
async function fetchJson(url: 'https://example.com/data.json') {
  try {
    const res = await Promise.reject(new Error('network down'))
    return res
  }
}

const result = await fetchJson('https://example.com/data.json')
console.log(isMonadicError(result))   // true
console.log(result.message)           // network down
```

(The rejected promise stands in for a `fetch` that fails, so the example runs offline.)

### When to throw anyway

Return an error when the caller can do something about it: bad input, a missing record, a
failed request. Throw when nobody should carry on:

- **Programmer bugs.** A state that cannot happen if the code is right, such as a broken
  internal invariant, is better as an exception that stops the process with a stack trace
  than as a value that might be ignored.
- **Framework boundaries.** A test runner, a web framework's request handler, or a promise
  chain built by someone else expects failures as exceptions or rejections. At that boundary,
  turn a returned error into a throw (or a rejection) yourself.

At a framework boundary that looks like this:

```tjs:inline
function clean(name: ' Ada '): 'ada' {
  return name.trim().toLowerCase()
}

// A handler a framework calls; the framework expects failures to be thrown
function handler(input) {
  const name = clean(input)
  if (name instanceof Error) {
    throw name
  }
  return { status: 200, body: name }
}

try {
  handler(42)
} catch (e) {
  console.log('framework caught:', e.message)
}
// → framework caught: Expected string for '…:1:clean.name', got number
```

## The flight recorder

The recorder is a fixed-size buffer, a ring, where the runtime writes everything it noticed:
every type error, whether or not anyone checked it, plus near-misses that are not errors yet.
It is on by default and costs nothing on calls that succeed.

Where the recorder lives takes a little explaining:

- **Errors as values work everywhere.** Every emitted file carries a small inline runtime,
  enough to check parameters and return `MonadicError`s, so nothing above depends on setup.
- **The recorder needs the shared TJS runtime.** This site, `tjs run` and the bun plugin
  install it for you; [The Runtime](/runtime-configuration/) shows how to install it
  yourself.
- **Each file has its own recorder, and it forwards to the shared one.** Inside a `.tjs`
  file, `__tjs` is that file's recorder and sees calls to that file's functions.
  `globalThis.__tjs` is the shared recorder: every file's entries are copied there, and AJS
  runs report there too.
- **Without the shared runtime there is no recorder.** `globalThis.__tjs` is undefined, and
  a file's `__tjs` is a small stub with no recorder methods, so `__tjs.errors` is
  `undefined` and calling `__tjs.clearErrors()` throws a `TypeError`.

Read a file's `__tjs` when you care about that file, as in a test block. Read
`globalThis.__tjs` when you want everything, as in the audit example below.

### `errors()`: type errors only

```tjs:inline
function shout(text: 'ada'): 'ADA' {
  return text.toUpperCase()
}

__tjs.clearErrors()

shout('ada')
console.log('after a good call:', __tjs.errors().length)  // 0

// Two bad calls, and nobody looks at the results
shout(42)
shout(null)

console.log('after two bad calls:', __tjs.errors().length) // 2
for (const err of __tjs.errors()) {
  console.log('  ', err.message)
}

test 'clear, run, expect none' {
  __tjs.clearErrors()
  shout('grace')
  expect(__tjs.errors().length).toBe(0)
}
```

`__tjs.errors()` returns the type errors still in the ring, oldest first. The ring holds the
last 64 records of every kind (the size is the `maxErrors` option of `configure()`), so
notices and warnings share it and can push type errors out. The two calls above threw their
results away; the recorder still has both.

`errors()` returns type errors and nothing else, and that narrowness is deliberate. The
idiom in the test (clear, run the code, expect no errors) only works if nothing but a real
type error can appear there. If warnings and notices showed up in `errors()`, a test would
fail on an event that is not a failure. Asserting on errors in tests is covered in
[Testing](/testing/).

### `records()`: everything

`__tjs.records()` returns every entry, and `__tjs.record(entry)` adds one of your own:

```tjs:inline
function shout(text: 'ada'): 'ADA' {
  return text.toUpperCase()
}

__tjs.clearRecords()

__tjs.record({
  source: 'app',
  severity: 'notice',
  message: 'cache miss on user lookup',
  data: { userId: 42 },
})

shout(99)

for (const r of __tjs.records()) {
  console.log(`[${r.source}/${r.severity}]`, r.message)
}
// → [app/notice] cache miss on user lookup
// → [type/error] Expected string for '…:1:shout.text', got number

console.log(__tjs.records({ source: 'type' }).length)      // 1
console.log(__tjs.records({ severity: 'notice' }).length)  // 1
console.log(__tjs.errors().length)                         // 1: the notice is not in it
```

Each record is a plain object with a `source` (who reported it), a `severity`
(`'error'`, `'warning'` or `'notice'`), a `message`, optional `data`, and on type errors the
`error` itself. Filter with `{ source }`, `{ severity }` or both. The main things the
runtime reports:

- **`'type'`, error:** every type error. These are the entries `errors()` returns.
- **`'type'`, warning or notice:** problems with types themselves rather than with values,
  such as a misused type predicate, and a named type that `wrap()` (the runtime function
  that adds checks to a plain JavaScript function; see
  [The Runtime](/runtime-configuration/)) passes unchecked because it cannot check it.
- **`'wasm'`:** a `wasm {}` block that fell back to JavaScript or failed to load, and a typed
  array copied on every call because it was not allocated with `wasmBuffer()` (see
  [Inline WebAssembly](/inline-wasm/)).
- **`'vm'`:** every AJS VM error, caught by the agent or not (fuel exhausted, an atom timing
  out, a capability refused), and a few notices. These go to the shared recorder,
  `globalThis.__tjs`.
- **`'app'`:** your own entries, and an occasional runtime warning.

The `wasm` entries are why the recorder takes more than errors. A block that quietly fell
back to JavaScript is correct and slow: nothing throws and every test passes. The bar for
recording is "might be useful afterwards", because a false alarm costs one slot in the ring
and a missing entry costs a debugging session with no evidence.

`record()` follows the same rule the runtime does: it never throws, never logs on its own,
and never changes what your program does. Use it for anything in your own code that can
silently degrade (a fallback taken, a retry, a cache bypassed) instead of inventing a side
channel.

### Counting, clearing and loss

The ring holds 64 entries by default and overwrites the oldest. The counts keep going past that, and
the loss is reported rather than hidden:

```tjs:inline
function shout(text: 'ada'): 'ADA' {
  return text.toUpperCase()
}

__tjs.clearRecords()
for (let i = 0; i < 100; i++) {
  shout(i)
}

console.log('type errors:   ', __tjs.getErrorCount())    // 100
console.log('all records:   ', __tjs.getRecordCount())   // 100
console.log('still in ring: ', __tjs.records().length)   // 64
console.log('lost to wrap:  ', __tjs.getDroppedCount())  // 36
```

There is one ring per recorder, so the two clears empty the same thing and differ only in
what they return: `clearErrors()` returns the type errors it removed, and `clearRecords()`
returns every entry. Both reset the counts.

A type error is recorded on every call, as the loop shows. The near-miss entries (the
`wasm` and `wrap()` notices) are recorded once per site, not once per call, so a hot loop
full of slow WebAssembly calls does not fill the ring with copies of one warning.

### Audit a unit of work

The recorder is useful outside tests. Note the count, run a job, then look at what the job
added, including errors it produced and dropped:

```tjs:inline
function parsePort(text: '8080'): 8080 {
  return Number(text)
}

function audited(label: 'job', job = () => 0) {
  const recorder = globalThis.__tjs
  const before = recorder.getErrorCount()
  const result = job()
  const added = recorder.getErrorCount() - before
  console.log(`${label}: ${added ? added + ' type error(s)' : 'clean'}`)
  if (added > 0) {
    for (const e of recorder.errors().slice(-added)) {
      console.log('   ', e.message)
    }
  }
  return result
}

audited('good config', () => parsePort('3000'))
// → good config: clean

audited('sloppy config', () => {
  parsePort(3000)          // a number: refused, and the result is thrown away
  return parsePort('80')
})
// → sloppy config: 1 type error(s)
// →     Expected string for '…:1:parsePort.text', got number
```

The second job returns a good port and would pass any test that looked only at its result.
The audit shows it also made a bad call on the way.

It reads the shared recorder, `globalThis.__tjs`, so it sees errors from typed functions in
other files too. And it compares counts instead of clearing, so it does not erase evidence
that other code on the page may want. (If a job adds more than 64 errors, the oldest are
gone from the ring, but `added` still says how many there were.)

The recorder's settings, including turning it off with `trackErrors`, and the debugging
options `callStacks` and `throwTypeErrors`, are set with `configure()`; see
[The Runtime](/runtime-configuration/).

## Gotchas

**An ignored error is silent, except in the recorder.** This is the price of returning
errors. A call whose result nobody reads, or whose error is turned into a string by an
expression, fails without a sound. The recorder is the only place it shows up.

**Callbacks drop returned errors.** `forEach`, an event listener, a timer and any other
caller that ignores its callback's result also ignores an error the callback returns:

```tjs:inline
const saved = []

function save(name: 'Ada') {
  saved.push(name.trim())
}

__tjs.clearErrors()

// forEach discards whatever its callback returns
const names = [' Ada ', 42, ' Grace ']
names.forEach((name) => save(name))

console.log(saved)                    // [ "Ada", "Grace" ]
console.log(__tjs.errors().length)    // 1: only the recorder knows
```

Where a failure matters, collect the results (`map` keeps the errors in the array) or check
inside the callback.

**Setter parameters are not checked.** JavaScript discards a setter's return value, so a
refusal would vanish. TJS therefore does not check a setter's parameter at all, and the
example on it is documentation; [Classes and Dispatch](/classes-and-dispatch/) explains what
to do instead.

**A return example does not check failure shapes.** A return annotation such as
`: { value: 5 }` is a worked example, tested once when the file is transpiled. It is not
compared against every value the function returns, so an `Error`, a `MonadicError` or a
result object with an extra `error` field all come back unchecked. Use `:?` if you want
every result checked, and test failure paths yourself (see [Testing](/testing/)).

**AJS has its own error type.** An AJS agent's failures are `AgentError` values returned in
the run's result, not `MonadicError`s, and they are outside this chapter. A failed AJS run
also writes an entry to the shared recorder under `source: 'vm'`.
