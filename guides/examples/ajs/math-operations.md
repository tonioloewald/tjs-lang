<!--{"section": "ajs", "type": "example", "group": "basics", "order": 1, "parent": "ajs-basics.md"}-->

# Math Operations

Basic arithmetic and Math built-ins

<!-- TODO review -->
Agents compute: a score from a model's answer, a price from a quote, an average from an API's
numbers. Arithmetic and `Math` work as they do in JavaScript.

```ajs:inline
function calculate({ a = 10, b = 5 }) {
  let sum = a + b
  let product = a * b
  let power = a ** b
  let sqrt = Math.sqrt(a)
  let max = Math.max(a, b)
  let rounded = Math.floor(a / b)
  return { sum, product, power, sqrt, max, rounded }
}
```

<!-- TODO review -->
## What to notice

- **`Math` functions take positional arguments.** `Math.max(a, b)` is a builtin, not an atom, so
  the named-inputs rule does not apply to it.
- **Operators take primitives.** `+`, `*`, `<` and friends need numbers, strings, booleans or
  null. `'total: ' + [1, 2]` is an error, not the string `total: 1,2`.
- **There is no `Number(x)`.** Convert text with `parseInt(text, 10)`, `parseFloat(text)` or
  `Number.parseInt`; `Number.isFinite` and the other `Number` checks are there.

<!-- TODO review -->
## A variation

A price quote, rounded to cents. `toFixed` returns a string, which is what you want for display
and not what you want for further arithmetic.

```ajs:inline
function quote({ price = 19.99, qty = 3, taxRate = 0.08 }) {
  let subtotal = price * qty
  let tax = Math.round(subtotal * taxRate * 100) / 100
  let total = subtotal + tax
  return { subtotal, tax, total: total.toFixed(2) }
}
```

<!-- TODO review -->
## The gotcha

Floating point is floating point: `subtotal` is `59.97` here only because the inputs are kind.
Round where a person will read the number, and keep the unrounded value for arithmetic. And
`a / 0` is `Infinity`, as in JavaScript. The host receives `Infinity`, but this page shows
results as JSON, which has no `Infinity`, so it would display `null`. Check `b == 0` first if
the caller can send zero.
