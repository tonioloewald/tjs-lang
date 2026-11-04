<!--{"section": "ajs", "type": "example", "group": "featured", "order": 16, "parent": "ajs-featured.md"}-->

# Fuel Limits

Demonstrates safe termination - try different fuel amounts!

<!-- TODO review -->
This is the reason AJS exists. You can run code you did not write, from a user or a model,
knowing it will stop. The agent below tries to count to a million; the budget runs out first,
and the run ends with an error value instead of hanging the page.

```ajs:inline
function infiniteLoop({ limit = 1000000 }) {
  // This will run out of fuel before completing
  let counter = 0
  let i = 0
  while (i < limit) {
    counter = counter + 1
    i = i + 1
  }
  return { counter }
}
```

<!-- TODO review -->
## What to notice

- **The error is `Out of Fuel`, and it is a result, not a crash.** The host gets
  `{ error, fuelUsed }` back from the run and decides what to do. Nothing is thrown.
- **The budget is the host's, not the program's.** This page gives each example 10,000 units.
  A program cannot read or raise its own budget.
- **Fuel measures work.** Every expression, assignment and loop test costs a little; an atom costs
  more (a fetch costs 5 units, a model call 100). One trip round this loop costs about half a unit,
  so 10,000 units buy roughly 20,000 iterations.

<!-- TODO review -->
## Try different amounts

The same agent with a limit it can reach, `{"args": {"limit": 1000}}`:

```ajs:inline {"args": {"limit": 1000}}
function infiniteLoop({ limit = 1000000 }) {
  let counter = 0
  let i = 0
  while (i < limit) {
    counter = counter + 1
    i = i + 1
  }
  return { counter }
}
```

And with the budget cut to 100 units, `{"fuel": 100}`, it fails again, after 100:

```ajs:inline {"fuel": 100, "args": {"limit": 1000}}
function infiniteLoop({ limit = 1000000 }) {
  let counter = 0
  let i = 0
  while (i < limit) {
    counter = counter + 1
    i = i + 1
  }
  return { counter }
}
```

In your own host the budget is an option on the run:

```javascript
const run = await vm.run(ast, { limit: 1000 }, { fuel: 100, timeoutMs: 1000 })
if (run.error) console.log(run.error.message, run.fuelUsed) // "Out of Fuel" 100.04…
```

<!-- TODO review -->
## Limits

Fuel bounds **work**, so it is the time budget for computation. Three other limits cover what it
cannot: `timeoutMs` (wall clock, for slow IO; by default 10 ms per unit of fuel), `maxHeapBytes`
(how much the program holds in memory at once, 64 MB by default) and `quotas` (how many times an
expensive atom may be called, such as at most three model calls). A model call costs 100 units of
fuel whatever it costs you in money, so only a quota can say "three calls, no more". See the
[AJS guide](/DOCS-AJS/) for all four.
