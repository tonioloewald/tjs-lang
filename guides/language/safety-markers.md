<!--{"parent": "the-tjs-language.md", "order": 30}-->
<!-- TODO review -->

# Safety and Validation

A TJS signature is a promise about what a function accepts, and TJS keeps that promise while
the program runs: a call with the wrong kind of argument is refused before the body starts.
This chapter answers the three questions a working developer asks next. Where exactly does
TJS check? What does that cost? And how do you turn the checks down in the places where you
have measured a reason to?

It ends with two smaller tools that share the `!` character: `const!`, which the compiler
checks and which costs nothing at runtime, and bang access, `x!.foo`, which turns a read
through `null` into an error value.

What a refused call returns, and how that error travels, is the subject of
[Errors as Values](/errors-as-values/). Here you only need to know that a refused call
returns a `MonadicError` instead of throwing, and that `isMonadicError(x)` tests for one.

## Where TJS validates

TJS checks values at **function boundaries**. Every call checks the arguments against the
parameter examples, and that holds for plain functions, arrow functions, class methods and
constructors alike.

Two things in the next example look odd to a JavaScript eye. TJS classes are called without
`new` (see [Classes and Dispatch](/classes-and-dispatch/)), so `Account('Ada', 10)` is not a
typo. And an example's spelling sets its type: `0` means an integer and `0.0` a number that
may have a fraction, which is why `double(1.5)` is refused.

```tjs:inline
function area(width: 2.0, height: 3.0): 6.0 {
  return width * height
}

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

const double = (n: 0) => n * 2

// In the messages below, `…` stands for the file name and line number
console.log(area(4, 5))                      // 20
console.log(area('4', 5).message)            // Expected number for '…area.width', got string

const acct = Account('Ada', 10)              // no `new`: TJS classes are called like functions
console.log(acct.deposit(5))                 // 15
console.log(acct.deposit('5').message)       // Expected number for '…Account.deposit.amount', got string
console.log(Account(42, 0).message)          // Expected string for '…Account.constructor.owner', got number

console.log(double(21))                      // 42
console.log(isMonadicError(double(1.5)))     // true: n must be an integer
```

The constructor case returns the error in place of an object, so `Account(42, 0)` is a
`MonadicError`, not a half-built account.

The `: 6.0` after `area`'s parameters is a return example, and it is a *worked* example: when
the file is transpiled, TJS calls `area(2.0, 3.0)` and checks that the result equals `6.0`.
That is the function's **signature test** (the details are in [Testing](/testing/)). It runs
once, at transpile time; later calls do not check what `area` returns. Checking returns at
runtime is what the return markers in the next section are for.

### A check looks once

A check happens when a value passes through a call. It does not keep watching the value
afterwards:

```tjs:inline
function makePoint(x: 0, y: 0) {
  return { x, y }
}

const p = makePoint(1, 2)
p.x = 'one'               // no check sees this: the value has already passed
console.log(p.x)          // one

// The next call that receives it does check it
function lengthOf(point: { x: 0, y: 0 }) {
  return Math.hypot(point.x, point.y)
}
console.log(isMonadicError(lengthOf(p)))   // true

// A typed parameter that receives an error hands it back without running
const err = makePoint('1', 2)
console.log(lengthOf(err) === err)          // true
```

This is what makes the checks cheap enough to leave on: TJS never wraps your objects in
proxies or watches their properties. It is also the limit of what they promise. A value is
known to be good at the moment it crosses a boundary, and the next boundary checks it again.

The last line shows the other half of the design. A typed parameter that receives a
`MonadicError` does not run the function's body; it returns the same error, so a chain of
calls needs no check between steps. [Errors as Values](/errors-as-values/) covers this in
full.

## Return markers: checking what comes out

Input checks catch bad *callers*. To catch your own bugs, check what a function returns. The
character after the return colon (nothing, `!` or `?`) says how much checking a result gets:

| Return form | At transpile time                    | At runtime                  |
| ----------- | ------------------------------------ | --------------------------- |
| `: 0`       | runs the signature test              | nothing                     |
| `:! 0`      | nothing (declares the type only)     | nothing                     |
| `:? 0`      | runs the signature test              | checks every value returned |

### `:?`: check every result

Here is the bug `:?` exists for, a function that returns the wrong kind of value on a path
the signature test does not reach:

```tjs:inline
// `:` the result is tested once, at transpile time, and never again
function averageOf(xs: [2.0, 4.0]): 3.0 {
  if (xs.length == 0) return 'no data' // a bug: a string where a number belongs
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

// `:?` the same test, plus a check of every value the function returns
function average(xs: [2.0, 4.0]):? 3.0 {
  if (xs.length == 0) return 'no data'
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

console.log(averageOf([]))                    // no data: nothing noticed
console.log(average([1, 2]))                  // 1.5
const r = average([])
console.log(isMonadicError(r) ? r.message : r)
// Expected number for '…average:return', got string
```

Both functions pass their signature test: called with `[2.0, 4.0]`, each returns the number
three, and the test compares values, so that equals the example `3.0`. Only `average`
notices the empty-array path, and it reports it where it happens, with the function's name
in the message, instead of letting `'no data'` travel on until some other function does
arithmetic on it and produces `NaN` far from the cause.

The spelling of the example still matters for the runtime check. `3.0` allows any number;
`:? 3` would mean an integer, and would refuse the perfectly good result `1.5`. Write the
example for the full range of results you mean to allow.

### `:!`: a type, not a worked example

Sometimes the honest return example is not the result of calling the function with its
parameter examples. You want to say "returns a string", and no particular string. A plain `:`
would fail its signature test, because it is a worked example:

<!-- tjs-doc: expect-error -->

```tjs:static
function label(n: 0): '' {
  return n > 0 ? 'positive' : 'not positive'
}
// Function signature example is inconsistent: Expected "" at 'label', got "not positive"
```

`:!` declares the type without the test. Here `''` means only "a string":

```tjs:inline
function label(n: 0):! '' {
  return n > 0 ? 'positive' : 'not positive'
}

console.log(label(3))   // positive
```

This is also what code converted from TypeScript gets for a return type like `: string`.
When you can, prefer a real worked example (`label(n: 1): 'positive'`), because it is a free
test; reach for `:!` when no single result is representative.

## What it costs

For real numbers, read [TJS Benchmarks](/benchmarks/). That page is generated by running the
benchmarks (`bun run bench`), and it records the date, the runtime and the platform, so its
figures can be trusted for the version that produced them. This chapter does not copy them,
because copied numbers drift.

What you can reason about without numbers is the shape of the cost. A checked function gets a
few lines of guard code at the top of its body: it records its name in a small ring buffer
(the call stack used in error messages), then runs one test per typed parameter, on every
call. Simplified, this is what TJS emits:

```javascript
// function add(a: 2, b: 3): 5 { return a + b }    (simplified)
function add(a, b) {
  __tjs.pushStack('add')  // call-stack ring, for error messages
  // __tjs.typeError builds the MonadicError the call returns
  if (typeof a !== 'number' || !Number.isInteger(a)) return __tjs.typeError(/* … */)
  if (typeof b !== 'number' || !Number.isInteger(b)) return __tjs.typeError(/* … */)
  return a + b
}
```

So the cost scales with the number of checked calls, not with the amount of work inside
them. A function that does real work per call (parses a request, walks a tree, touches the
DOM) will not notice its guard. A tiny function called millions of times in a loop might.
For that case the next section shows how to turn the guard off; when you do, the function
is emitted exactly as you wrote it.

A plain `:` return costs nothing at runtime, since its test runs at transpile time. A `:?`
return adds a small wrapper that checks each returned value.

## Turning checks down

Every check you remove is a place a bad value can get through unnoticed, so the rule of
thumb is short: **never turn checks off on a function that receives outside data** (network
responses, files, user input, a caller written in plain JavaScript). Turn them down on hot
internal code whose inputs were already checked at the boundary, and only after measuring.

By default every typed parameter is checked. From the narrowest tool to the widest:

| Scope          | How                                 | Effect                                        |
| -------------- | ----------------------------------- | --------------------------------------------- |
| one parameter  | type it `x: any`                    | that parameter accepts anything               |
| one function   | `!` before the first parameter      | no parameter of that function is checked      |
| one file       | `safety none` at the top            | no function in the file is checked            |

### One parameter: `any`

To relax a single parameter, give it a type that accepts everything. The other parameters
are still checked:

```tjs:inline
function log(level: 'info', detail: any) {
  return `[${level}] ${JSON.stringify(detail)}`
}

console.log(log('warn', { disk: 0.93 }))   // [warn] {"disk":0.93}
console.log(log('warn', 42))               // [warn] 42
console.log(isMonadicError(log(3, 42)))    // true: level is still a string
```

There is no per-parameter `!`. Writing one is a syntax error:

<!-- tjs-doc: expect-error -->

```tjs:static
function f(a: 0, b!: 0) { return a + b }   // Unexpected token
```

### One function: `!`

A `!` as the first thing inside the parentheses turns off **every** check in that function,
not only the one next to it. It works on arrow functions too:

```tjs:inline
function fastAdd(! a: 0, b: 0): 0 {
  return a + b
}

const scale = (! v: 0.0, k: 1.0) => v * k

console.log(fastAdd(3, 4))       // 7
console.log(fastAdd('a', 'b'))   // ab: no check ran
console.log(scale('2', 3))       // 6: JavaScript's coercion, unchecked

// The signature metadata is still attached, as fastAdd.__tjs
console.log(fastAdd.__tjs.params.a.type.kind)   // integer
```

What is emitted for `fastAdd` is `function fastAdd(a, b) { return a + b }`: no guard. The
signature metadata (the `__tjs` property, which docs and editors read) is still emitted, and
the signature test still runs when the file is transpiled. Only the runtime guard is gone.

One side effect is worth knowing. In a `.tjs` file an object default such as
`opts = { x: 0, y: 0 }` is a *dictionary default*: a partial argument is merged with it,
member by member. A `!` function gets JavaScript's behaviour instead, where an argument
replaces the default whole. See [Dictionary Defaults](/defaults/).

You may meet `function f(? a: 0)` in older code. Don't write it: the `?` is accepted and does
nothing. Older documentation used it to force validation, which is now the default, and in a
`safety none` file it does not turn checking back on.

### One file: `safety none`

`safety none` at the top of a file removes every runtime check in it. It is a file-level
directive: two bare words, no quotes, no semicolon needed. Comments and blank lines may come
before it, but no code; a `safety` line after code is a syntax error.

```tjs:inline
safety none

function greet(name: 'World') {
  return `Hello, ${name}!`
}

console.log(greet(42))                          // Hello, 42!
console.log(greet.__tjs.params.name.type.kind)  // string: the metadata is kept
```

The signatures stay: documentation, autocomplete and signature tests still have everything
they need. Code converted from TypeScript defaults to `safety none`, because a converted file
should behave like the JavaScript it came from until you choose otherwise; see
[TJS for TypeScript Programmers](/TJS-FOR-TS/).

Two other spellings exist. `safety inputs` names the default, so you never need to write it.
`safety all` is accepted and today checks exactly what `safety inputs` checks; it does not
check return values. There is no reason to write it: use `:?` on the functions whose results
you want checked.

### A note on `unsafe`

Older TJS had an `unsafe` prefix for expressions. It is deprecated: it still parses, with a
warning, and it never turned off a callee's checks. To turn checks down, use the tools above.
The per-site escapes that replaced its other uses are covered in
[Equality and the Footguns TJS Removes](/equality/).

## `const!`: immutability the compiler checks

JavaScript's `const` fixes the *name*, not the value. `const LIMITS = { max: 10 }` stops you
from writing `LIMITS = …`, but `LIMITS.max = 99` is perfectly legal. The usual fix,
`Object.freeze`, is a runtime call, and in sloppy-mode scripts a write to a frozen object
fails silently.

`const!` moves the check to compile time. A write through the name is refused when the file
is transpiled, so the mistake shows up before any test has to reach that line:

<!-- tjs-doc: expect-error -->

```tjs:static
const! limits = { max: 10, retries: 3 }
limits.max = 20
// Cannot mutate immutable binding 'limits'. const! bindings are read-only at compile time.
```

<!-- tjs-doc: expect-error -->

```tjs:static
const! queue = [3, 1, 2]
queue.sort()
// Cannot call mutating method on immutable binding 'queue'. const! bindings are read-only at compile time.
```

It refuses, when made directly through the name:

- assignment to a member (`limits.max = …`, `queue[0] = …`);
- compound assignment (`+=`, `-=`, `||=`, `??=` and the rest, except `**=`, which currently
  gets through);
- `++` and `--` on a member, and `delete` of a member;
- a call to a method on a fixed list of names: `push`, `pop`, `shift`, `unshift`, `splice`,
  `sort`, `reverse`, `fill`, `copyWithin` and `set`.

That last list goes by method *name*, whatever the value's type. So `set` catches
`Map.prototype.set` and a typed array's `set`, but `delete`, `clear` and `add` on a `Map` or
`Set` are not on the list and get through.

Reading is unrestricted, and so are methods that return a new value:

```tjs:inline
const! config = { port: 8080, db: { host: 'localhost' } }
const! retries = [100, 200, 400]

// Reading, and methods that return a new value, are fine
console.log(config.port)                         // 8080
console.log(retries.map((ms) => ms * 2).join())  // 200,400,800
console.log(retries.toSorted().join())           // 100,200,400

// One level down, through another name, or inside a function: not caught
config.db.host = 'example.com'
const alias = config
alias.port = 9090
function reset(settings) { settings.extra = true }
reset(config)

console.log(JSON.stringify(config))
// {"port":9090,"db":{"host":"example.com"},"extra":true}
```

The second half of that example is the important part. `const!` is **shallow**, and it
checks the *name* as written, not the value:

- a write one level further down (`config.db.host = …`) is not caught;
- a write through another name (`alias.port = …`) is not caught;
- a write inside a function that receives the value (`reset(config)`) is not caught.

Treat `const!` as a guard against the obvious slip, not as a frozen value. If something must
not change at runtime, whoever else holds it, freeze it, and remember that `Object.freeze` is
shallow too: a nested object needs its own freeze (a "deep freeze" walks the whole value).

**It costs nothing at runtime.** Once the file has compiled there is nothing left to check,
so `const! config = { … }` is emitted as `const config = { … }`: no `Object.freeze`, no
guard, no wrapper.

**It is for objects and arrays.** A number, string or boolean cannot be mutated anyway, so
`const!` on a primitive *literal* is a compile error that tells you to write `const`:

<!-- tjs-doc: expect-error -->

```tjs:static
const! retries = 3
// `const! retries = 3` is redundant — `3` is a primitive, and a primitive cannot be mutated.
```

When the initializer is not a literal (`const! x = load()`, `const! y = other`), the compiler
cannot see what the value will be, so it accepts the declaration whatever it turns out to be,
and refuses writes through the name as above.

The same error goes on to say that `const!` adds "DEEP immutability". That wording is wrong:
as the example above shows, the check is one level deep.

## Bang access: `x!.foo`

In JavaScript, reading a member of `null` throws a `TypeError` out of the middle of whatever
you were doing. In TJS, put `!` before the dot and the read checks first: if the value on the
left is `null` or `undefined`, the expression is a `MonadicError`; otherwise it is exactly
`x.foo`, with no wrapper and no copy.

```tjs:inline
const USERS = { 1: { name: 'Ada' }, 2: { name: 'Grace' } }

function findUser(id: 1) {
  return USERS[id]            // undefined for an unknown id
}

function nameOf(id: 1): 'Ada' {
  return findUser(id)!.name
}

console.log(nameOf(2))                  // Grace
console.log(nameOf(9).message)          // Expected non-null for 'bang.name', got undefined

// Optional chaining on the same miss: a silent undefined
console.log(findUser(9)?.name)          // undefined
```

The error's path is `bang.` followed by the member that could not be read, here `bang.name`.

**Contrast with `?.`.** Optional chaining gives you `undefined` when a link is missing. That
is an ordinary value: it does not say that anything went wrong, or where, and three calls
later you are debugging an `undefined` with no idea where it came from. A `MonadicError`
says what failed, propagates through typed parameters like any other refused value, and is
kept by the runtime's flight recorder (a ring of recent errors you can read with
`__tjs.errors()`; see [Errors as Values](/errors-as-values/#the-flight-recorder)) even if
nothing checks it. Use `?.` when a missing value is expected and `undefined` is a fine answer
(an optional setting you will default with `??`). Use `!.` when a missing value means
something is wrong.

### Where the check stops

Each `!.` checks only the value immediately to its left. Chains short-circuit: once a hop
produces a `MonadicError`, every later `!.` passes that error through unchanged, so the
first missing link is the one reported:

```tjs:inline
const order = { customer: null }

// customer is null, so reading .address fails; the later `!.city` passes the error on
const city = order.customer!.address!.city
console.log(city.message)        // Expected non-null for 'bang.address', got null
```

The path names the member being read when the missing value was found: `bang.address` means
"`customer` was null when reading `.address`". Nothing after that hop ran.

A plain `.` after a bang is the trap. It reads a member *of the error object*, and gives the
same silent `undefined` that `!.` exists to prevent:

```tjs:inline
const nobody = null
console.log(nobody!.name.length)                  // undefined: read off the error object
console.log(isMonadicError(nobody!.name!.length)) // true

// Only null and undefined are missing: 0, '' and false are values
const empty = ''
console.log(empty!.length)       // 0
```

So put `!.` on every hop that might be missing, and test the result once at the end. If
`order` itself might be missing, that is a hop too: `order!.customer!.address`.

Calling a method through bang access currently checks the object but calls the method
without its `this`:

```tjs:inline
const counter = { n: 7, get() { return this?.n } }

console.log(counter!.get())   // undefined: `this` was lost
console.log(isMonadicError(counter) ? counter : counter.get())   // 7
```

Until that changes, check the object (or let a typed parameter check it) and call the method
with a plain `.`.

Two more limits:

- `!.` is for reading dotted members. There is no computed form (`list![0]` is a syntax
  error), and it cannot be the target of an assignment.
- A `!` at the start of a parameter list is the function marker from earlier in this
  chapter, not bang access. Only a `!` directly before a dot is bang access.

## Summary

- TJS checks arguments on every call: functions, arrows, methods and constructors. A check
  looks at a value once, at the boundary.
- A plain `:` return example is a worked example, tested once at transpile time (the
  signature test). `:?` also checks every returned value at runtime; `:!` declares the type
  only.
- The cost is a guard per typed parameter per call. `!` functions, `safety none` files,
  `const!` and plain `:` returns cost nothing at runtime. See [TJS Benchmarks](/benchmarks/)
  for measured figures.
- To turn checks down, use the narrowest tool: `x: any` for a parameter, `!` for a function,
  `safety none` for a file. Never on code that receives outside data.
- `const!` is a free, shallow, compile-time guard on writes through one name.
- `x!.foo` turns a read through `null` or `undefined` into a `MonadicError` that names the
  member, where `?.` would give a silent `undefined`.
