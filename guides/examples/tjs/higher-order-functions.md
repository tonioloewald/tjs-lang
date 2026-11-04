<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 5, "parent": "tjs-patterns.md"}-->

# Higher-Order Functions

Functions that take or return functions

```tjs:inline
// TJS handles higher-order functions
// Note: Function type annotations use simple syntax

function mapStrings(arr: [''], fn = (x) => x): [''] {
  return arr.map(fn)
}

function filterNumbers(arr: [0], predicate = (x) => true): [0] {
  return arr.filter(predicate)
}

function compose(f = (x) => x, g = (x) => x): 0 {
  // Returns a composed function, demo returns result
  const composed = (x) => f(g(x))
  return composed(5)
}

// Usage examples
const double = (x) => x * 2
const addOne = (x) => x + 1

// Map strings to uppercase
const words = mapStrings(['hello', 'world'], s => s.toUpperCase())

// Filter even numbers
const evens = filterNumbers([1, 2, 3, 4, 5, 6], x => x % 2 === 0)

// Compose functions: (5 * 2) + 1 = 11
const result = compose(addOne, double)

console.log('Mapped:', words)
console.log('Filtered:', evens)
console.log('Composed result:', result)

result
```

<!-- TODO review -->
## What to notice

A function parameter is written the same way as any other: by example. `fn = (x) => x`
says "this parameter is a function, it is optional, and if you leave it out you get the
identity function". The example is a real default, so `mapStrings(['a'])` works and returns
`['a']`.

What TJS checks at the call is the part it can check cheaply and honestly: **is this a
function?** Pass a string where `fn` belongs and you get a `MonadicError` back, not a crash
three frames later inside `arr.map`. What it does _not_ check is the callback's own
signature. Whether a function does what its contract says is something you only learn by
calling it, so TJS does not pretend otherwise.

One consequence is easy to miss. A signature that takes a function has no worked example
TJS can run, because it cannot invent a callback to pass. So the return example on such a
function documents the return _type_ only: `compose(...): 0` says "returns an integer", and
the real result here is 11. On a function whose parameters are all plain values, the same
`: 0` would be run as a test and would fail.

<!-- TODO review -->
## Callbacks keep their own checks

The checks live with each function, not with the caller. A TJS function passed as a
callback still validates its own arguments wherever it ends up being called, and a function
that _returns_ a function is checked when the factory is called:

```tjs:inline
// A TJS function passed as a callback keeps its own checks
function half(n: 0.0): 0.0 {
  return n / 2
}

function mapAll(xs: [0.0], fn = (x) => x): [0.0] {
  return xs.map(fn)
}

console.log('mapAll([2, 4, 6], half):', mapAll([2, 4, 6], half))

// The parameter only promises "a function": a string is refused at the call
console.log('mapAll([2, 4], "half"):', String(mapAll([2, 4], 'half')))

// ...and `half` refuses a bad element itself, wherever it is called from
console.log("['8', 4].map(half):", ['8', 4].map(half).map(String))

// A factory is checked when it is called; the function it returns is plain JS
function multiplier(k: 2.0) {
  return (x) => x * k
}

const triple = multiplier(3)
console.log('triple(5):', triple(5))
console.log("multiplier('3'):", String(multiplier('3')))
```

Notice the third line of output: `map` did not stop at the bad element. `half('8')` returned
an error _value_ and `map` carried on, so the result array holds one error and one number.
That is monadic errors working as designed, and it is also why you check results at the
edge of a pipeline (see _Error Handling_).

<!-- TODO review -->
## Gotchas

- **Checks belong to top-level functions.** A top-level `function`, or a typed arrow
  assigned at top level (`const h = (x: 0) => x`), validates its parameters. A function
  created _inside_ another one does not, even with typed parameters: the arrow `multiplier`
  returns takes anything, and `triple('a')` is `NaN`, not an error. If a returned function
  must be checked, have it call a top-level typed function to do the work.
- **Describing a callback's shape** is what `FunctionPredicate` is for (see
  _Declarations_). It documents the parameters and return of a function type for tools,
  docs and `.d.ts` output; at runtime it still only answers "is this a function?".
