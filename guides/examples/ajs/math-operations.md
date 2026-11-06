<!--{"section": "ajs", "type": "example", "group": "basics", "order": 1, "parent": "ajs-basics.md"}-->
<!-- TODO review -->

# Math Operations

Agents compute: a score from a model's answer, a price from a quote, an average from an API's
numbers. Arithmetic operators and `Math` work as they do in JavaScript, with a few refusals
listed below.

The examples on this page run in place. The page plays the **host**, the program that embeds
the VM and calls `vm.run`: it transpiles each example, runs it, and shows the result as JSON.

The destructured parameter is the agent's input. A host passes it as the second argument to
`vm.run`, and each default applies when the caller leaves that field out. This page runs every
example with no arguments, so you see the defaults at work; change a default to try another
value. (See [Hello World](/hello-world/) for how a host runs an agent.)

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

With the defaults this returns `{ sum: 15, product: 50, power: 100000, sqrt: 3.1622776601683795,
max: 10, rounded: 2 }`.

## What to notice

- **`Math` functions take positional arguments, as in JavaScript.** This is worth saying because
  **atoms**, the operations the VM and its host provide (such as `storeGet({ key })`), take one
  object of named inputs. `Math`, `parseInt` and the other builtins are not atoms. The
  [Atom Reference](../../ajs-atoms.md) lists the atoms.
- **Every `Math` function and constant is there** (`Math.PI`, `Math.E`). `Math.random()` is
  among them, so a run that uses it is not reproducible: the host cannot seed it or replay it.
- **`Math` functions take numbers, not arrays.** `Math.max(xs)` is refused, and spread
  (`Math.max(...xs)`) does not compile. Fold the array instead; the next section shows both.
- **Operators take primitives.** `+`, `*`, `<` and the rest accept numbers, strings, booleans or
  null. `'total: ' + [1, 2]` is refused with `'+' needs a string, number, boolean or null, not
  an array`, where JavaScript would give `total: 1,2`. Turning an array into a string is an
  allocation the VM cannot budget, so it makes you ask for it: `'total: ' + xs.join(',')`.
  Between primitives JavaScript's rules still apply: `'n=' + 3` is `'n=3'` and `'5' * 2` is
  `10`.
- **There is no `Number(x)` or `String(x)`.** AJS leaves out these conversion functions (see
  [Expression Builtins](../../../DOCS-AJS.md#expression-builtins)). Read numbers from text with
  `parseInt(text, 10)` or `parseFloat(text)`; `Number.parseInt` and `Number.parseFloat` work
  too, as do `Number.isNaN`, `Number.isFinite`, `Number.isInteger` and the `Number` constants.
  Turn a number into text with `n.toString()` or `` `${n}` ``. A statement such as
  `let v = Number(s)` fails to transpile, with a message that mistakes `Number` for an atom;
  inside a larger expression the run fails with `Unknown function: Number`.
- **Compound assignment works.** `n += 5`, `n *= 2` and `n++` on its own line behave as in
  JavaScript. `n++` used as a value (`let m = n++`) does not compile; write `n += 1` on its own
  line and then use `n`.
- **Math costs fuel.** Every operation is charged against the host's budget, so a long loop of
  arithmetic ends at the fuel limit rather than running forever. See
  [Fuel Limits](/fuel-limits/).

## What a refusal looks like

A refused form such as `Math.max(xs)` is not caught by the transpiler. It fails when it runs,
with an error you can catch. Uncaught, it ends the run and the host gets the error. This
example finds the largest item the working way, then tries the refused form inside a `try`:

```ajs:inline
function largest({ xs = [3, 1, 2] }) {
  let big = xs.reduce((m, x) => Math.max(m, x), -Infinity)
  let refused = ''
  try {
    let wrong = Math.max(xs)
  } catch (err) {
    refused = err
  }
  return { big, refused }
}
```

This returns `{ big: 3, refused: "max()'s argument 1 must be a number — convert it explicitly
(e.g. arr.join(','), JSON.stringify(obj))" }`.

Keep the fold on its own line, as here. Written inline in a returned object
(`return { big: xs.reduce(…) }`), it does not compile today.

## A variation: a price quote

Two ways to round, for two jobs. `tax` feeds more arithmetic, so it is rounded to cents as a
number with `Math.round(x * 100) / 100`. `total` is for display, so it becomes a string with
`toFixed(2)`, which keeps trailing zeros (`'64.77'`, or `'4.80'` where the number shows `4.8`).
Use `toFixed` only at the display edge: it returns a string, and a string is not what you want
for further arithmetic.

```ajs:inline
function quote({ price = 19.99, qty = 3, taxRate = 0.08 }) {
  let subtotal = price * qty
  let tax = Math.round(subtotal * taxRate * 100) / 100
  let total = subtotal + tax
  return { subtotal, tax, total: total.toFixed(2) }
}
```

This returns `{ subtotal: 59.97, tax: 4.8, total: '64.77' }`.

## A variation: numbers from text

Model output and form fields arrive as strings. `parseInt` reads the leading digits and stops,
so `'12 apples'` gives `12`; text with no leading digits gives `NaN`. Check for it with
`Number.isNaN`. The global `isNaN` takes only a number: `isNaN('x')` is refused with
`isNaN()'s argument 1 must be a number` rather than converting the text.

```ajs:inline
function readCount({ text = '12 apples' }) {
  let n = parseInt(text, 10)
  if (Number.isNaN(n)) {
    return { error: 'not a number' }
  }
  return { n, doubled: n * 2 }
}
```

With the default this returns `{ n: 12, doubled: 24 }`; with `text: 'many'` it returns
`{ error: 'not a number' }`. That `{ error }` is an ordinary object the agent chose to return:
the run succeeds, and the caller has to check the field. For an error the VM itself tracks, see
[Error Handling](/ajs-error-handling/).

## The gotchas

Floating point is floating point: `0.1 + 0.2` is `0.30000000000000004`. The quote above gives a
`subtotal` of `59.97` only because of its inputs; with `price = 0.1, qty = 3` it is
`0.30000000000000004`. `toFixed` rounds the binary value too, so `(1.005).toFixed(2)` is
`'1.00'`, not `'1.01'`. Round where a person will read the number, and keep the unrounded value
for arithmetic.

`a / 0` is `Infinity`, as in JavaScript. The host receives `Infinity`, but this page shows
results as JSON, which has no `Infinity`, so it displays `null`. The same happens to any result
that goes through `JSON.stringify` on its way somewhere. Check for zero first if the caller can
send it:

```ajs:inline
function ratio({ a = 10, b = 0 }) {
  if (b == 0) {
    return { error: 'b must not be zero' }
  }
  return { ratio: a / b }
}
```

This returns `{ error: 'b must not be zero' }`; with `b: 4` it returns `{ ratio: 2.5 }`.
