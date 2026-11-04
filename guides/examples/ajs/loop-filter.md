<!--{"section": "ajs", "type": "example", "group": "basics", "order": 3, "parent": "ajs-basics.md"}-->

# Loop & Filter

Process arrays with array methods

<!-- TODO review -->
Agents spend much of their time shaping lists: the items an API returned, the rows worth
showing a model, the totals worth reporting. `filter`, `map` and `reduce` with arrow functions
do most of it.

```ajs:inline
function processNumbers({ numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }) {
  let evens = numbers.filter((x) => x % 2 == 0)
  let doubled = evens.map((x) => x * 2)
  let total = doubled.reduce((acc, x) => acc + x, 0)
  return { evens, doubled, total }
}
```

<!-- TODO review -->
## What to notice

- **One callback per statement.** `map`, `filter`, `find` and `reduce` take an arrow function,
  and the call must be the whole right-hand side of a declaration. Chaining two,
  `items.filter(…).map(…)`, is a transpile error: write two statements, as above.
- **Fuel grows with the list.** Each callback call is metered. Run it with a longer `numbers` and
  watch `fuelUsed` climb.
- **Loops are `for...of` and `while`.** There is no C-style `for (;;)`, no `break` and no
  `continue`; each is a transpile error. `some`, `every` and `sort` with a comparator are not
  available either.

<!-- TODO review -->
## A variation

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
  while (i < checks.length && found === null) {
    if (!checks[i].ok) {
      found = checks[i]
    }
    i = i + 1
  }
  return { found, checked: i }
}
```

`find` says the same thing in one line, `checks.find((c) => !c.ok)`; the loop is for when you
also need to know where it stopped. Use `for...of` with an `if` where JavaScript would use
`continue`, or `filter` first and loop over what is left.

<!-- TODO review -->
## The gotcha

A callback is a callback, not a closure you can keep: you cannot store an arrow function in a
variable or an object (`const isEven = (x) => x % 2 == 0` is refused). Functions are called,
never held, in AJS. If you need a reusable piece of logic, declare a helper function above the
entry function and call it by name.
