<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 5, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Higher-Order Functions

A higher-order function takes a function as an argument, returns one, or both. `map` and
`filter` are the familiar ones. In TJS you write them the way you write any other
function: each parameter gets an example, and for a function parameter the example is a
function.

```tjs:inline
// A function parameter's example is a function. Here it is also the
// default, so leaving it out gives you the identity function.
function mapStrings(arr: [''], fn = (x) => x): [''] {
  return arr.map(fn)
}

function filterNumbers(arr: [0], predicate = (x) => true): [0] {
  return arr.filter(predicate)
}

// Returns a NEW function: f applied to the result of g
function compose(f = (x) => x, g = (x) => x) {
  return (x) => f(g(x))
}

const double = (x) => x * 2
const addOne = (x) => x + 1

// compose(addOne, double) is a function: x -> (x * 2) + 1
const doubleThenAddOne = compose(addOne, double)

console.log('Mapped:', mapStrings(['hello', 'world'], (s) => s.toUpperCase()))
console.log('Default fn:', mapStrings(['as', 'is']))
console.log('Filtered:', filterNumbers([1, 2, 3, 4, 5, 6], (x) => x % 2 === 0))
console.log('doubleThenAddOne(5):', doubleThenAddOne(5))

// compose has no return example (see below), so a test states what it does
test 'compose applies g first, then f' {
  expect(compose(addOne, double)(5)).toBe(11)
  expect(compose(double, addOne)(5)).toBe(12)
  expect(compose()(7)).toBe(7)
}
```

## What TJS checks

`fn = (x) => x` says three things: the parameter is a function, it is optional, and if
you leave it out you get the identity function. The example is a real default, which is
why `mapStrings(['as', 'is'])` works. Write `fn: (x) => x` instead and the parameter is
required.

At the call, TJS checks the one thing it can check cheaply and honestly: **is this a
function?** Pass a string, `null` or a number where `fn` belongs and you get a
`MonadicError` back, not a `TypeError` three frames later inside `arr.map`.

What it does _not_ check is the callback's own signature. `(x) => x` does not mean "takes
one argument and returns the same type": any function passes. Whether a function does
what a contract says is something you learn only by calling it, so TJS does not claim to
know.

## Why `compose` has no return example

On most TJS functions the return annotation is a worked example that is run as a test
when the file is transpiled: `function add(a: 2, b: 3): 5` calls `add(2, 3)` and fails
the build if the answer is not `5`.

That test is never built for a function with a function-valued example. TJS reads
example values as data, without executing them, so that checking a file never runs code
from its annotations. A number, a string or an array is data. `(x) => x` is code, so TJS
cannot turn it into an argument, and it drops the signature test for that function
altogether. It does this silently: `tjs check` reports nothing, not even a skipped test.

So on a function-taking signature, a return annotation such as `: 0` documents the return
type and nothing more. It behaves like `:!`, and it would pass even if every example said
otherwise. Two honest options:

- write `:!` (for example `function apply(fn = (x) => x, n: 5):! 0`), so the code says
  what TJS will do; or
- leave the return annotation off and write a `test` block, as `compose` does above.

There is also no way to write "returns a function" after the colon. Writing
`(x) => x` as a return example is a syntax error, because TJS reads the `=>` as an arrow
body on a function declaration. A function that returns a function goes without a return
example.

## Callbacks keep their own checks

The checks live with each function, not with the caller. A TJS function passed as a
callback still validates its own arguments wherever it ends up being called, and a
function that _returns_ a function is checked when you call it:

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

Look at the third line of output: `map` did not stop at the bad element. `half('8')`
returned an error _value_ and `map` carried on, so the result holds one error and one
number. That is monadic errors working as designed, and it is why you check results at
the edge of a pipeline (see _Error Handling_).

## Checking the function a factory returns

Only top-level functions validate their parameters: a top-level `function`, or a typed
arrow assigned at top level (`const h = (x: 0) => x`). A function created _inside_
another one is not checked, even with typed parameters. The arrow `multiplier` returns
takes anything, and `triple('a')` is `NaN`, not an error.

When the returned function needs a check, have it hand the work to a top-level typed
function:

```tjs:inline
// The typed work lives at top level, where TJS checks it
function scaleBy(x: 2.0, k: 3.0): 6.0 {
  return x * k
}

// The factory's inner arrow only forwards to it
function scaler(k: 2.0) {
  return (x) => scaleBy(x, k)
}

const triple = scaler(3)
console.log('triple(5):', triple(5))
console.log("triple('a'):", String(triple('a')))
```

`scaleBy` has only data examples, so its return example is a real test: the build calls
`scaleBy(2.0, 3.0)` and fails if the answer is not `6.0`. The `test` block in the first
example does the same job for `compose`, which cannot have one.

## Describing a callback's shape

`FunctionPredicate` (see _Declarations_) declares a function type: its parameters and
its return. Calling the declaration answers "is this a function?" and carries the
contract for tools, docs and `.d.ts` output:

```tjs:inline
FunctionPredicate Unary {
  params: { x: 0 }
  returns: 0
}

console.log('Unary((n) => n + 1):', Unary((n) => n + 1))
console.log("Unary('not a function'):", Unary('not a function'))
```

A `FunctionPredicate` name is not yet a parameter annotation. `function run(fn: Unary)`
transpiles, but `tjs check` warns that `Unary` "could not be resolved to a runtime type",
and the parameter is not checked at all. Until that changes, use a function example
(`fn = (x) => x`) for the parameter, and call `Unary(fn)` yourself where you want the
named check.
