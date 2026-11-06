<!--{"section": "ajs", "type": "example", "group": "basics", "order": 3, "parent": "ajs-basics.md"}-->
<!-- TODO review -->

# Loop & Filter

Agents spend much of their time shaping lists: the items an API returned, the rows worth
showing a model, the totals worth reporting. `filter`, `map` and `reduce` with arrow functions
do most of it.

```ajs:inline
function processNumbers({ numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], factor = 2 }) {
  let evens = numbers.filter((x) => x % 2 == 0)
  let scaled = evens.map((x) => x * factor)
  let total = scaled.reduce((acc, x) => acc + x, 0)
  return { evens, scaled, total }
}
```

An agent's **entry function** is the last function in the file, and it takes one object of
named inputs. The host passes that object when it runs the agent with `vm.run`; `= …` gives the
value an input takes when the host leaves it out. Run with no inputs, as this page does, the
agent returns `evens: [2, 4, 6, 8, 10]`, `scaled: [4, 8, 12, 16, 20]` and `total: 60`. See
[Hello World](/hello-world/) for inputs and [Hosting the VM](/ajs-host/) for running agents.

## What to notice

- **One callback per statement.** `map`, `filter`, `find` and `reduce` take an arrow function,
  and the call must be the whole right-hand side of a declaration or an assignment
  (`let evens = …` or `evens = …`). Chaining two, `numbers.filter(…).map(…)`, is refused, and
  so is using the call inside a larger expression (`numbers.map(…).length`, or
  `return { scaled: evens.map(…) }`). Write one statement per step, as above.
- **Callbacks can read the agent's variables.** `(x) => x * factor` reads the input `factor`;
  a local declared earlier in the function works the same way.
- **`filter` and `find` take an expression body.** A block body, `(x) => { … }`, is refused
  for them with `filter callback must be an expression, not a block`. `map` and `reduce`
  accept one, but a single expression is the safe habit.
- **`let`, `const` and `push` work as in JavaScript.** A `const` cannot be reassigned, and
  `evens.push(x)` adds to an array in place.
- **`==` does not coerce.** In AJS `'1' == 1` is false and `null == undefined` is true, so
  `==` is safe to use everywhere this page does. See
  [Differences from JavaScript](/DOCS-AJS/).
- **Fuel grows with the list.** Fuel is the VM's budget for work: every step is charged, the
  host sets the budget (1,000 if it passes none; this page gives each example 10,000), and a
  run that spends it all stops with `Out of Fuel`. This agent costs a fixed 4 or so, plus about
  0.3 per number: about 7 fuel for the ten defaults, about 33 for 1 through 100. See
  [Fuel Limits](/fuel-limits/).

## When a callback is refused

A chained or embedded callback fails to transpile with
`Unsupported expression type in condition: ArrowFunctionExpression`. The message says
"condition" even when there is no `if` or `while` in sight. When you see it, look for a
callback call that is not the entire right-hand side of a `let`, a `const` or an assignment:
`let n = numbers.map((x) => x).length` sits on its own line and is still refused. Split it in
two:

```javascript
let mapped = numbers.map((x) => x)
let n = mapped.length
```

## What is not there

AJS leaves these out on purpose. The VM meters every operation it allows and refuses the rest,
so its set of operations is kept small and fully known; the
[AJS guide](/DOCS-AJS/) lists what is allowed.

- **No C-style `for (;;)`, no `for...in`, no `break`, no `continue`.** Each is a transpile
  error. Loops are `for...of` and `while`. To walk an object's keys, loop over them:
  `for (const k of Object.keys(data)) { … }`.
- **No `some`, `every`, `forEach` or `flatMap`.** They are refused with
  `Method 'some' is not available in AsyncJS — use for...of, or map/filter/find/reduce with an arrow function`
  (AsyncJS is AJS's full name). Use `for...of` where you would write `forEach`.
- **`find` answers "is there one?"** It returns the first match, or `null` when nothing
  matches; the first example below tests for that.
- **`sort` takes no comparator.** `xs.sort()` sorts in JavaScript's default order, which
  compares items as strings, so `[10, 9, 1, 2]` sorts to `[1, 10, 2, 9]`. Passing a comparator
  fails with the same `ArrowFunctionExpression` message as a chained callback. There is no
  built-in numeric or by-key sort; write the ordering yourself (below), or sort on the host.

`find` in place of `some`:

```ajs:inline
function allPassed({ checks = [{ id: 1, ok: true }, { id: 2, ok: true }] }) {
  let bad = checks.find((c) => !c.ok)
  if (bad == null) {
    return { allOk: true }
  }
  return { allOk: false, firstBad: bad }
}
```

With the default checks it returns `allOk: true`.

A numeric sort, written as a loop:

```ajs:inline
function sortNumbers({ numbers = [10, 9, 1, 2] }) {
  let sorted = []
  for (const x of numbers) {
    let i = 0
    while (i < sorted.length && sorted[i] <= x) {
      i = i + 1
    }
    sorted.splice(i, 0, x)
  }
  return { sorted, defaultOrder: numbers.toSorted() }
}
```

It returns `sorted: [1, 2, 9, 10]` and `defaultOrder: [1, 10, 2, 9]`. Each number is inserted
where it belongs, so the cost grows with the square of the list's length; for a long list,
sort on the host. To sort objects by a key, compare `sorted[i].age <= x.age` instead.

## Stopping early

Without `break`, a search that should stop early puts its stop condition in the `while`:

```ajs:inline
function firstFailure({
  checks = [
    { id: 1, ok: true },
    { id: 2, ok: false },
    { id: 3, ok: false },
  ],
}) {
  let found = null
  let i = 0
  while (i < checks.length && found == null) {
    if (!checks[i].ok) {
      found = checks[i]
    }
    i = i + 1
  }
  return { found, examined: i }
}
```

It returns `found: { id: 2, ok: false }` and `examined: 2`: the loop ended as soon as it found a
failure, without looking at the third check. `examined` is a count, not a position; the failure
is at index `examined - 1`.

`find` says the same thing in one line, `checks.find((c) => !c.ok)`; the loop is for when you
also need to know how many items it examined.

## Skipping items

Where JavaScript would use `continue`, put the work inside an `if`:

```ajs:inline
function sumEvens({ numbers = [1, 2, 3, 4, 5, 6] }) {
  let total = 0
  for (const x of numbers) {
    if (x % 2 == 0) {
      total = total + x
    }
  }
  return { total }
}
```

It returns `total: 12`. Or `filter` first and loop over what is left:

```javascript
let evens = numbers.filter((x) => x % 2 == 0)
for (const x of evens) {
  total = total + x
}
```

## Reusable logic

An arrow function may appear only as the argument of `map`, `filter`, `find` or `reduce`,
written in place. It cannot be stored in a variable or an object, passed anywhere else, or
returned: `const isEven = (x) => x % 2 == 0` and `{ f: (x) => x }` are both refused with
`Unsupported expression in AsyncJS: ArrowFunctionExpression`.

For logic you want to name, declare a helper function before the entry function. Order
matters: the VM runs the **last** function in the file, and the ones before it are helpers.
A helper takes ordinary positional parameters, `isEven(x)`, where the entry takes the object of
named inputs.

A helper call follows the same rule as a callback: it must be the whole right-hand side of a
declaration or assignment. It cannot sit inside a callback or a larger expression, including
an `if` condition. That is why the example below assigns `even` first instead of writing
`if (isEven(x))`:

```ajs:inline
function isEven(x) {
  return x % 2 == 0
}

function keepEvens({ numbers = [1, 2, 3, 4] }) {
  let evens = []
  for (const x of numbers) {
    const even = isEven(x)
    if (even) {
      evens.push(x)
    }
  }
  return { evens }
}
```

It returns `evens: [2, 4]`. Both `if (isEven(x))` and `numbers.filter((x) => isEven(x))` are
refused with
`Helper 'isEven' cannot be called inside an expression. Assign its result to a variable first`.
See [Local helper functions](/DOCS-AJS/) in the AJS guide.
