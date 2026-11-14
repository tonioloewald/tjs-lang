<!--{"parent": "writing-agents.md", "order": 4}-->
<!-- TODO review -->

# Decisions, Loops and Helpers

An agent rarely runs straight through. It routes a request one way or another, walks a list of
results, keeps the items worth keeping, and names a piece of logic it needs twice. This chapter
covers the statements that do that: `if` and its relatives, the two loops AJS has, the four
methods that take a callback, and helper functions in the same source. It ends with what AJS
leaves out, and why.

Most of it is JavaScript you already know. The differences are deliberate, and each one comes
with what to write instead.

## Decisions

Here is an agent that quotes a shipping price. It uses an `if`/`else if`/`else` chain, the
ternary, and the three logical operators:

```ajs
function quote({ weightKg = 3.5, country = 'DE', member = false, coupon = '' }) {
  let rate = 0
  if (country == 'DE') {
    rate = 4.9
  } else if (country == 'FR' || country == 'NL') {
    rate = 7.5
  } else {
    rate = 15
  }

  const heavy = weightKg > 5
  const surcharge = heavy ? 6 : 0
  const freeShipping = member && !heavy
  const code = coupon || 'none'
  const total = freeShipping ? 0 : rate + surcharge
  return { rate, surcharge, freeShipping, code, total }
}
```

With no arguments it returns
`{ rate: 4.9, surcharge: 0, freeShipping: false, code: 'none', total: 4.9 }`. With
`{ member: true }` the total is `0`; with `{ country: 'US', weightKg: 8 }` it is `21`.

All of this behaves as it does in JavaScript:

- **`let` is block-scoped, and assignment reaches out.** `rate` is declared above the `if`, so
  `rate = 7.5` inside a branch changes it. A `let` declared inside a branch stays there.
- **Truthiness is JavaScript's.** The falsy values are `false`, `0`, `-0`, `''`, `null`,
  `undefined` and `NaN`, so `if (coupon)` is false for an empty string.
- **`&&`, `||` and `??` work as in JavaScript.** `coupon || 'none'` above relies on that; the
  difference between `||` and `??` is in
  [Values and Expressions](/ajs-values/#logical-operators-and-the-ternary).

What is different is `==`, which never coerces (`'5' == 5` is `false`); that is covered in
[Values and Expressions](/ajs-values/#equality). The DOCS-AJS
[rule engine](/DOCS-AJS/#rule-engines) is a slightly larger agent of the same shape, and
[Conditional Logic](/conditional-logic/) has more variations.

### No `switch`

`switch` is a transpile error, and the message shows the `if`/`else if` chain to write instead.
When each case only picks a value, a lookup object is shorter and reads as a table.

One care is needed when the key comes from outside. Reading a method name such as `toString`
off an object fails, because a method is not a value in AJS. So check that the key is one of the
table's own before reading it:

```ajs
function rateFor({ country = 'FR' }) {
  const rates = { DE: 4.9, FR: 7.5, NL: 7.5 }
  let rate = 15
  if (Object.keys(rates).includes(country)) {
    rate = rates[country]
  }
  return { rate }
}
```

It returns `{ rate: 7.5 }`; `{ country: 'US' }` gets the fallback, `{ rate: 15 }`, and so does
`{ country: 'toString' }`.

The shorter `rates[country] ?? 15` is not safe. It works for `'US'`, but for `'toString'` the
read itself fails, with `'toString' is a method: call it — a method is not a value in AsyncJS`,
before `??` gets to supply the fallback. That is an ordinary error: it skips the rest of the
agent unless a `try` catches it, as [When Things Fail](/ajs-errors/) explains. (Some refusals
are different and end the run even inside a `try`; that chapter lists them under
[Refusals that end the run](/ajs-errors/#refusals-that-end-the-run-a-bugs).)

When each case does different work, call a helper per case; there is an example under
[Helper functions](#helper-functions) below, and another in
[Switch Statements](/patterns/#switch-statements).

## Loops

AJS has two loops: `for...of` over an array, and `while`.

```ajs
function cartTotal({ prices = [4, 10, 6] }) {
  let total = 0
  for (const price of prices) {
    total = total + price
  }
  return { total }
}
```

It returns `{ total: 20 }`. The loop body updates `total`, which was declared outside it; any
variable in an enclosing scope can be assigned this way, and `total += price` works too.

To walk an object, loop over its keys (`for...in` is refused; see the table below):

```ajs
function stockValue({ stock = { apple: 3, pear: 0, plum: 5 }, price = 2 }) {
  let value = 0
  const empty = []
  for (const name of Object.keys(stock)) {
    value = value + stock[name] * price
    if (stock[name] == 0) {
      empty.push(name)
    }
  }
  return { value, empty }
}
```

It returns `{ value: 16, empty: ['pear'] }`. `empty` is a `const` because the variable is never
reassigned; `push` changes the array it holds, as in JavaScript. `Object.entries(stock)` gives
`[name, count]` pairs if you want both; read them as `pair[0]` and `pair[1]`, because a
destructured loop variable (`for (const [k, v] of …)`) is refused.

`while` takes a condition, as in JavaScript. Use it when you need the position, not only the
item:

```ajs
function numbered({ lines = ['buy milk', 'call Ada', 'ship it'] }) {
  let i = 0
  const out = []
  while (i < lines.length) {
    out.push(`${i + 1}. ${lines[i]}`)
    i = i + 1
  }
  return { out }
}
```

It returns `{ out: ['1. buy milk', '2. call Ada', '3. ship it'] }`.

**Always change the counter.** A `while` whose condition never becomes false does not hang the
host: it spends the run's fuel and stops with `Out of Fuel`, having done nothing useful. Fuel is
the subject of [Limits](/ajs-limits/).

### The loops AJS does not have

Each of these is a transpile error. The messages for the first three rows go on to show a
corrected loop in code:

| You write               | The message begins                                     | Write instead                                  |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `for (let i = 0; …; …)` | ``AJS has no `for` loops. Use `while` with a counter`` | `while` with a counter, as in `numbered` above |
| `for (const k in obj)`  | ``AJS has no `for...in`. Get the keys and walk them``  | `for (const k of Object.keys(obj))`            |
| `do { … } while (c)`    | ``AJS has no `do...while`. Use `while` ``              | `while`, with the condition checked first      |
| `break`                 | `Unsupported statement type: BreakStatement`           | a stop condition, below                        |
| `continue`              | `Unsupported statement type: ContinueStatement`        | an `if` around the work, below                 |

The `for...in` message's code gets the keys with the `keys` atom, which returns the same array as
`Object.keys`, and walks them with a `while`. The `for...of` in the last column is shorter.

### Without `break` or `continue`

Four shapes cover what `break` and `continue` did.

**Stop early: put the stop condition in the `while`.** This finds the first order over a limit
and looks no further:

```ajs
function firstLarge({ orders = [12, 40, 7, 95], limit = 30 }) {
  let at = -1
  let i = 0
  while (at == -1 && i < orders.length) {
    if (orders[i] > limit) {
      at = i
    }
    i = i + 1
  }
  return { at, examined: i }
}
```

It returns `{ at: 1, examined: 2 }`: the loop ended as soon as `at` was set, without looking at
the last two orders.

**Skip an item: wrap the work in an `if`.** Where JavaScript would `continue`, the body only acts
when the condition holds:

```ajs
function paidTotal({
  invoices = [
    { amount: 50, paid: true },
    { amount: 20, paid: false },
    { amount: 30, paid: true },
  ],
}) {
  let total = 0
  for (const inv of invoices) {
    if (inv.paid) {
      total = total + inv.amount
    }
  }
  return { total }
}
```

It returns `{ total: 80 }`. Filtering first, then looping over what is left, says the same thing;
`filter` is in the next section.

**Walk indices: `while` with a counter**, as `numbered` does above.

**Leave the loop and the function: `return`.** A `return` inside a loop ends both, which is
often exactly what a search wants:

```ajs
function routeRequest({
  path = '/api/users/42',
  rules = [
    { prefix: '/api/', backend: 'api-pool' },
    { prefix: '/static/', backend: 'cdn' },
  ],
}) {
  for (const rule of rules) {
    if (path.startsWith(rule.prefix)) {
      return { backend: rule.backend }
    }
  }
  return { backend: 'web-pool' }
}
```

It returns `{ backend: 'api-pool' }`; `{ path: '/about' }` falls through to `'web-pool'`.

## Callbacks: map, filter, find and reduce

Four array methods take a function: `map`, `filter` and `find` take `(item) => …`, and `reduce`
takes `(acc, item) => …` and an initial value. They do most of the work of shaping a list:

```ajs
function invoice({
  lines = [
    { sku: 'pen', qty: 3, unit: 2 },
    { sku: 'pad', qty: 0, unit: 5 },
    { sku: 'ink', qty: 1, unit: 12 },
  ],
  taxRate = 0.25,
}) {
  const billed = lines.filter((line) => line.qty > 0)
  const amounts = billed.map((line) => line.qty * line.unit * (1 + taxRate))
  const total = amounts.reduce((sum, a) => sum + a, 0)
  const ink = lines.find((line) => line.sku == 'ink')
  const missing = lines.find((line) => line.sku == 'tape')
  return { count: billed.length, amounts, total, inkQty: ink.qty, missing }
}
```

It returns `{ count: 2, amounts: [7.5, 15], total: 22.5, inkQty: 1, missing: null }`.

**`find` gives `null` when nothing matches**, unlike JavaScript, which gives `undefined`. A test
written `x == null` works either way, because AJS `==` treats `null` and `undefined` as equal
(see [Equality](/ajs-values/#equality)); `x === undefined` would be false here.

The callback in the `map` reads `taxRate`, a parameter of the agent. A callback is part of the
function it is written in, so it can read any variable that function can.

### The rules

**A callback method call stands on its own.** It must be one of:

- the whole value of a declaration or assignment: `const billed = lines.filter(…)`, or
  `billed = lines.filter(…)`;
- a statement by itself: `lines.map(…)` alone on a line (legal, though the result is lost);
- the whole value of a helper's `return`: `return lines.map(…)`.

These are the same positions a helper call or an atom call may take
([Helper functions](#helper-functions) below). Anywhere inside a larger expression it is refused,
and so is a call inside an object literal, even in a `return`:

```javascript
const amounts = lines.filter((l) => l.qty > 0).map((l) => l.unit) // chained
const count = lines.filter((l) => l.qty > 0).length               // used in an expression
const first = lines.find((l) => l.qty > 0) ?? null                // used in an expression
if (lines.find((l) => l.sku == 'ink') == null) { }                // in a condition
return { amounts: lines.map((l) => l.unit) }                      // inside an object
```

The message for each is `Unsupported expression type in condition: ArrowFunctionExpression`,
even where there is no condition. It means "this callback call is not standing on its own":
split the line into two statements, assigning the call first and using the variable after.

**`filter` and `find` take an expression body.** `(x) => { return x > 1 }` is refused with
`find callback must be an expression, not a block` (or `filter callback …`). `map` and `reduce`
accept a block body with `const` lines and a `return`, but one expression is the habit that works
everywhere.

**There is no index argument.** `xs.map((x, i) => i)` fails to transpile with
`'i' is not defined`, because only the first parameter is bound. When you need the position, use
a `while` with a counter, or a `for...of` that counts.

**Callback parameters are plain names.** `({ qty }) => qty` fails with
`'qty' is not defined. Declare it with let or const, or take it as a parameter.`: the pattern is
not bound, so the name inside it is unknown. Write `(line) => line.qty`.

**An arrow function exists only as a callback.** `const isPaid = (inv) => inv.paid` is refused
with `Unsupported expression in AsyncJS: ArrowFunctionExpression`. A function is not a value in
AJS: it cannot be stored, put in an object, passed to an atom or returned. For logic you want to
name and reuse, write a helper function (next section).

**A callback may call an atom.** The callback's body counts as a statement of its own, so it may
make one atom call per item, and each call costs fuel like any other. The core
[`hash`](/ajs-atoms/#utilities) atom takes its text as the named input `value`:

```ajs
function nameDigests({ names = ['report.pdf', 'notes.txt'] }) {
  const digests = names.map((name) => hash({ value: name }))
  return { digests }
}
```

It returns one SHA-256 hex string per name (of the name, not of any file). The same shape fetches
one URL per item; see [Callbacks](/patterns/#callbacks) in Patterns.

**Only these four take a callback.** `some`, `every`, `findIndex` and `flatMap` are refused with
a message pointing at `for...of` and these four. `find` and `filter` cover the first two:

```ajs
function checks({ scores = [72, 88, 95] }) {
  const high = scores.find((s) => s > 90)
  const anyHigh = high != null
  const failing = scores.filter((s) => s < 50)
  const allPass = failing.length == 0
  return { anyHigh, allPass }
}
```

It returns `{ anyHigh: true, allPass: true }`. For `findIndex`, use the stop-early loop above.

**`sort` takes no comparator.** `xs.sort((a, b) => a - b)` fails with the same
`Unsupported expression type in condition: ArrowFunctionExpression` as a chained call, so the
message will not point you here. `sort()` and `toSorted()` with no argument work, and order
items as JavaScript's do: as strings, so `[3, 10, 1]` becomes `[1, 10, 3]`. AJS has no way to
sort numbers numerically or objects by a field. Pass the list in already sorted, or have the
host provide an atom that sorts. The array methods that take no callback are listed under
[Methods](/ajs-values/#methods) in Values and Expressions.

## Helper functions

A source file holds only function declarations. As [A First Agent](/ajs-first-agent/#what-an-agent-is)
said, the **last** one is the agent's entry: it takes the object of named inputs and returns the
result object. The ones before it are helpers, which the entry and other helpers call by name.
Put a helper after the entry and that helper becomes the agent; the transpiler does not
complain, and the run is usually refused because its inputs do not match.

```ajs
function applyTransform(item, transform) {
  if (transform == 'double') {
    return item * 2
  }
  if (transform == 'negate') {
    return -item
  }
  return item
}

function summarize(values) {
  const total = values.reduce((sum, v) => sum + v, 0)
  return [total, values.length]
}

function processBatch({ items = [1, 2, 3], transform = 'double' }) {
  const results = []
  for (const item of items) {
    const processed = applyTransform(item, transform)
    results.push(processed)
  }
  const stats = summarize(results)
  return { results, total: stats[0], count: stats[1] }
}
```

It returns `{ results: [2, 4, 6], total: 12, count: 3 }`; with `{ transform: 'negate' }` the
results are `[-1, -2, -3]`.

Helpers are ordinary functions, with a few rules:

- **Positional arguments, any return value.** `applyTransform(item, transform)` takes two
  arguments; `summarize` returns an array. Only the entry must return an object (a helper's
  return value is not the run's result).
- **The argument count must match.** Calling `summarize(a, b)` is a transpile error:
  `Helper 'summarize' expects 1 argument(s), got 2`.
- **Helpers are siblings, not closures.** A helper sees only its own parameters. If
  `applyTransform` read `results`, which is declared in `processBatch`, the transpiler would
  refuse it with `'results' is not defined`. Pass what a helper needs as an argument. (A callback
  is the exception: it is part of its caller's body.)
- **Nothing else at the top level.** A top-level `const` is not visible inside the functions, so
  reading it is the same `is not defined` error; put constants inside the entry, or pass them in.
  A function declared inside another function is a transpile error too.
- **A helper call stands on its own**, under the same rule as an atom call or a callback method
  call: the whole value of a declaration or assignment, a statement by itself, or a `return`
  value. A helper call may also be the body of a callback
  (`items.map((x) => applyTransform(x, 'double'))`). In a condition or a larger expression it is
  refused, with a message that says to assign the result first.
  [Calling Atoms](/ajs-calling-atoms/#a-call-stands-on-its-own) explains why.

When each case of a decision does different work, a helper per case keeps the entry readable:

```ajs
function refund(order) {
  return { action: 'refund', amount: order.total }
}

function reship(order) {
  return { action: 'reship', items: order.items.length }
}

function handleComplaint({ kind = 'damaged', order = { total: 30, items: ['mug', 'plate'] } }) {
  let outcome = { action: 'escalate' }
  if (kind == 'lost') {
    outcome = refund(order)
  } else if (kind == 'damaged') {
    outcome = reship(order)
  }
  return outcome
}
```

It returns `{ action: 'reship', items: 2 }`; `{ kind: 'lost' }` returns
`{ action: 'refund', amount: 30 }`, and any other kind `{ action: 'escalate' }`.

### Recursion

A helper may call itself:

```ajs
function fact(n) {
  if (n <= 1) {
    return 1
  }
  const rest = fact(n - 1)
  return n * rest
}

function factorial({ n = 5 }) {
  const value = fact(n)
  return { value }
}
```

It returns `{ value: 120 }`. Note `const rest = fact(n - 1)` on its own line: `return n * fact(n - 1)`
would put a helper call inside an expression.

Runaway recursion cannot take the host down. Every call costs fuel, and helper calls nest at most
256 deep; one level more fails with an ordinary error:

```text
Maximum helper call depth (256) exceeded — likely infinite recursion in 'fact'
```

Like other ordinary errors, it skips the rest of the agent unless a `try` catches it; `try` is
covered in [When Things Fail](/ajs-errors/).

A compiled agent is JSON that a host stores, sends and checks before running, so its size
matters. A helper's body appears once in that JSON and is called by name, so calling a helper
from a loop, or from many places, does not make the agent any larger.

## What AJS leaves out, and why

Every construct missing from AJS is missing for one of a few reasons.

**Routes out of the sandbox.** `eval`, `Function`, `import`, `class`, `this` and `new` would each
give an agent a way to reach the host or run text as code. An agent gets the outside world only
through the atoms its host provides.

**Syntax that is easy to get wrong.** `switch` fall-through, early exits (`break`, `continue`)
scattered through a loop body, and the three clauses of a C-style `for` are frequent sources of
bugs in generated code, and AJS is written by models as often as by people. With `if`,
`for...of` and `while`, the conditions that decide what runs are in one place, where a reader can
see them.

**Code that is hard to audit.** Because a function is not a value, every call in a compiled agent
names exactly what it calls: an atom, a helper, a builtin, or one of four callback methods. A
reviewer, or a host checking an agent before running it, never has to work out which function a
variable might hold at run time.

**Every construct is a promise.** Today's VM is written in JavaScript; a second one, written in
Rust and compiled to WebAssembly, is planned. Each construct the language accepts is behaviour
both VMs must reproduce exactly, so the language refuses constructs that would cost the VM
complexity for little gain. See the [native VM plan](/ajs-native-vm/).

**Waiting belongs to the host.** An agent's steps run one at a time, in order. There is no
parallelism, no `sleep` and no backoff in AJS, because time and concurrency are the host's to
spend, and a run that is waiting is not doing work fuel can measure. A host that wants many
requests in flight exposes an atom that fans them out; one that wants backoff puts it in its
`fetch` capability. The agent sees one call that succeeds or fails. See
[Parallel Execution](/patterns/#parallel-execution) and [Retry](/patterns/#retry) in Patterns.

Reading the time is something the host grants: `Date()` with no argument and `Date.now()` read
the clock the host injects, as it injects `fetch`, and are refused without one. When a result
should not depend on when it ran, pass "now" in as an argument instead.
[Date](/ajs-values/#date) in Values and Expressions has the details, and
[The Sandbox](/ajs-sandbox/#time-and-randomness-are-capabilities) explains why.

The full list of refused constructs, with what to write for each, is in
[What's Forbidden](/DOCS-AJS/#whats-forbidden) and
[What to Write Instead](/patterns/#what-to-write-instead).
