<!--{"section": "tjs", "type": "example", "group": "basics", "order": 19, "parent": "tjs-basics.md"}-->

# Safety & Validation

Three levels of runtime validation. Choose per-file or per-function.

```tjs:inline
safety inputs

/#
## The Problem

JavaScript functions silently accept wrong types:

    function greet(name) { return `Hello, ${name}!` }
    greet(42)  // "Hello, 42!" — no error, just wrong

TypeScript catches this at compile time but the checks
vanish at runtime. Production gets no protection.

## TJS Safety Levels

The `safety` directive sets the default for the whole file:

| Directive | Validates | Use case |
|-----------|-----------|----------|
| `safety none` | Nothing | Metadata only, zero overhead |
| `safety inputs` | Function inputs | Default — catches bad callers |

Per-function overrides:
- `!` = unsafe (skip validation): `function fast(! x: 0) { }`
- `:?` on the return = check what the function returns,
  at runtime: `function f(x: 0):? 0 { }`
#/

// --- Input validation catches bad callers ---

function sayHello(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

test 'valid input works normally' {
  expect(sayHello('Alice')).toBe('Hello, Alice!')
}

test 'wrong type returns an error, not garbage' {
  const result = sayHello(42)
  // Not "Hello, 42!" — an actual error value
  expect(result instanceof Error).toBe(true)
}

test 'null returns an error' {
  const result = sayHello(null)
  expect(result instanceof Error).toBe(true)
}

// --- Numeric narrowing catches subtle bugs ---

function setAge(age: +0): +0 {
  return age
}

test 'positive integer accepted' {
  expect(setAge(25)).toBe(25)
}

test 'negative rejected' {
  expect(setAge(-1) instanceof Error).toBe(true)
}

test 'float rejected (age must be integer)' {
  expect(setAge(25.5) instanceof Error).toBe(true)
}

// --- Unsafe functions skip validation (fast path) ---

function fastAdd(! a: 0, b: 0): 0 {
  return a + b
}

test 'unsafe function skips checks (trusted callers only)' {
  expect(fastAdd(3, 4)).toBe(7)
  // No type error even with wrong type — validation skipped
  expect(fastAdd('a', 'b')).toBe('ab')
}

// --- Errors propagate through function chains ---

function cleanName(name: ''): '' {
  return name.trim()
}

function upperCase(name: ''): '' {
  return name.toUpperCase()
}

test 'errors propagate automatically' {
  // cleanName(42) returns error -> upperCase receives error -> returns error
  const result = upperCase(cleanName(42))
  expect(result instanceof Error).toBe(true)
}

test 'valid input flows through the chain' {
  expect(upperCase(cleanName('alice'))).toBe('ALICE')
}

// --- Try without catch: convert exceptions to errors ---

function parseJSON(s: '{}'):! {} {
  try {
    return JSON.parse(s)
  }
}

test 'valid JSON parses normally' {
  const result = parseJSON('{"ok":true}')
  expect(result.ok).toBe(true)
}

test 'invalid JSON returns error instead of throwing' {
  const result = parseJSON('not json')
  expect(result instanceof Error).toBe(true)
  // No try/catch needed by the caller!
}

console.log('Valid:', sayHello('World'))
console.log('Invalid:', sayHello(42))
console.log('Parse ok:', parseJSON('{"x":1}'))
console.log('Parse bad:', parseJSON('nope'))
```

<!-- TODO review -->
## What to notice

**A bad argument produces a value, not an exception.** `sayHello(42)` does not print
`Hello, 42!` and does not throw: it returns a `MonadicError` describing what was expected,
what arrived, and where (`Expected string for '…sayHello.name', got number`). Your program
keeps running, and the error is something you can inspect, log, or return.

**Errors flow through typed functions.** When a function with typed parameters receives a
`MonadicError` as an argument, it does not run its body; it hands the error back. That is why
`upperCase(cleanName(42))` needs no check between the two calls: the first failure travels to
the end of the chain, carrying its original message. You check once, where you finally use
the result.

**The example decides how strict the check is.** `age: +0` accepts `25` and refuses both `-1`
and `25.5`. You get "non-negative integer" without writing a validator, because that is what
the example `+0` says.

**`!` turns validation off for one function.** `fastAdd('a', 'b')` returns `'ab'`, because
`!` told TJS to trust its callers. Use it on hot internal functions whose inputs were already
checked at the boundary, never on functions that receive outside data.

**`try` without `catch` converts exceptions into values.** `JSON.parse` throws on bad input;
wrapped in a bare `try { }`, the function returns a `MonadicError` instead, so the caller
handles bad JSON the same way it handles a bad argument.

<!-- TODO review -->
## Checking returns as well

Input checks catch bad *callers*. To catch your own bugs, check what a function returns with
`:?`. (A plain `:` return annotation is a worked example that runs as a test at transpile time;
`:!` declares the return type without a test; `:?` runs the test *and* validates every return
at runtime.)

```tjs:inline
function average(xs: [0.0]):? 0.0 {
  if (xs.length == 0) return 'no data' // a bug: a string where a number belongs
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

console.log('average([2, 4]):', average([2, 4]))

const r = average([])
console.log('average([]):    ', r instanceof Error ? r.message : r)
```

The bad path is caught where it happens, with the function's name in the message, rather
than three calls later as a `NaN`.

<!-- TODO review -->
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

<!-- TODO review -->
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
