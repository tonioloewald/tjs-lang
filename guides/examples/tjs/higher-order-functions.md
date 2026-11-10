<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 5, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Higher-Order Functions

A higher-order function takes a function as an argument, returns one, or both. `map` and
`filter` are the familiar ones. Types-as-examples work well for data, because TJS can
look at a value and check it. A function is harder: TJS can tell that a value is a
function, but not what it will do until it is called. This page shows where TJS draws
that line.

A reminder of the parameter syntax (the full rules are in [TJS Syntax](/tjs-syntax/)):
`name: example` is a required parameter, and `name = example` is an optional one whose
example is also its default. `['']` means "an array of strings" and `[0]` "an array of
integers". For a function parameter, the example is a function.

```tjs:inline
// The example is also the default: leave fn out and you get the
// identity function, which returns its argument unchanged.
// The returns are marked :! (type only, not tested); see below for why.
function mapStrings(arr: [''], fn = (x) => x):! [''] {
  return arr.map(fn)
}

// The default predicate keeps every element
function filterNumbers(arr: [0], predicate = (x) => true):! [0] {
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
// Mapped: [ "HELLO", "WORLD" ]
console.log('Default fn:', mapStrings(['as', 'is']))
// Default fn: [ "as", "is" ]
console.log('Filtered:', filterNumbers([1, 2, 3, 4, 5, 6], (x) => x % 2 === 0))
// Filtered: [ 2, 4, 6 ]
console.log('doubleThenAddOne(5):', doubleThenAddOne(5))
// doubleThenAddOne(5): 11

// compose has no return example (see below), so a test states what it does
test 'compose applies g first, then f' {
  expect(compose(addOne, double)(5)).toBe(11)
  expect(compose(double, addOne)(5)).toBe(12)
  // no arguments: both defaults, the identity of the identity
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
`MonadicError` back: an error object _returned_ as the function's result instead of
thrown (see [Error Handling](/error-handling/)). You find out at the call, not from a
`TypeError` three frames later inside `arr.map`.

What it does _not_ check is the callback's own signature. `(x) => x` does not mean "takes
one argument and returns the same type": any function passes. Whether a function does
what a contract says is something you learn only by calling it, so TJS does not claim to
know.

## Why `compose` has no return example

On most TJS functions the return annotation is a worked example that is run as a test.
`function add(a: 2, b: 3): 5` makes TJS call `add(2, 3)` when the file is transpiled
(which `tjs check` does), and the check fails if the answer is not `5`.

That test calls your function, with the parameter examples as its arguments. A number, a
string or an array is data, and TJS can hand it over as an argument. `(x) => x` is code:
to use it as an argument TJS would have to run code written inside an annotation, and it
never does that. So for a function with a function-valued example, TJS drops the
signature test altogether. It does this silently: `tjs check` reports nothing, not even a
skipped test.

That means a plain return annotation such as `: ['']` on `mapStrings` would document the
return type and nothing more. It would pass even if it were wrong. Two honest options:

- write `:!`, which marks a return example as a type only, not run as a test. That is
  what `mapStrings` and `filterNumbers` do above, so the code says what TJS will do; or
- leave the return annotation off and write a `test` block, as `compose` does.

You also cannot write a function as a return example.
`function f(k: 2): (x) => x * k { … }` is a syntax error: TJS takes the `=>` after the
return annotation as the start of an arrow function, which a `function` declaration
cannot have. You can name a `FunctionPredicate` instead (`function f(k: 2):! Unary`, see
[below](#describing-a-callbacks-shape)). That records the intent in the source, but
nothing checks it, and `tjs check` reports the return type as `any`.

## Callbacks keep their own checks

The checks live with each function, not with the caller. A TJS function passed as a
callback still validates its own arguments wherever it ends up being called. A factory,
a function that returns a function, is checked when you call it; the function it returns
is not (more on that in the next section).

`0.0` in these examples declares a float, which accepts any number; `0` would accept
integers only. The `String(...)` wrappers turn an error into its readable message for
printing.

```tjs:inline
// A TJS function passed as a callback keeps its own checks
function half(n: 0.0): 0.0 {
  return n / 2
}

function mapAll(xs: [0.0], fn = (x) => x):! [0.0] {
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

const looseTriple = multiplier(3)
console.log('looseTriple(5):', looseTriple(5))
console.log("looseTriple('a'):", looseTriple('a'))
console.log("multiplier('3'):", String(multiplier('3')))
```

The third line of output shows that `map` did not stop at the bad element. `half('8')`
returned an error _value_ and `map` carried on, so the result holds one error message
and the number `2` (both printed as strings by `.map(String)`). Errors that are returned
rather than thrown work this way by design,
and it is why you check results at the edge of a pipeline (see
[Error Handling](/error-handling/)).

## Checking the function a factory returns

Only top-level functions validate their parameters: a top-level `function`, or a typed
arrow assigned at top level (`const h = (x: 0) => x`). A function created _inside_
another one is not checked, even with typed parameters. The arrow `multiplier` returns
takes anything, which is why `looseTriple('a')` printed `NaN` rather than an error.

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

const checkedTriple = scaler(3)
console.log('checkedTriple(5):', checkedTriple(5))
console.log("checkedTriple('a'):", String(checkedTriple('a')))
```

`scaleBy` has only data examples, so its return example is a real test: `tjs check`
calls `scaleBy(2.0, 3.0)` and fails if the answer is not `6.0`. The `test` block in the
first example does the same job for `compose`, which cannot have one.

## Describing a callback's shape

`FunctionPredicate` (see [Declarations](/declarations/)) declares a function type: its
parameters and its return. Calling the declaration returns `true` or `false`, and it
checks only whether the value is a function. The `params` and `returns` are not checked
at call time: `Unary(() => 'x')` is `true` even though it takes no `x` and returns a
string. They are a description for readers and tools; an exported `FunctionPredicate`
becomes a function type in `.d.ts` output (`export type Unary = (x: number) => number`).

```tjs:inline
FunctionPredicate Unary {
  params: { x: 0 }
  returns: 0
}

console.log('Unary((n) => n + 1):', Unary((n) => n + 1)) // true
console.log("Unary(() => 'x'):", Unary(() => 'x')) // true: shape not checked
console.log("Unary('not a function'):", Unary('not a function')) // false
```

A `FunctionPredicate` name is not yet a parameter annotation. `function run(fn: Unary)`
transpiles, but `tjs check` warns that `Unary` "could not be resolved to a runtime type",
and the parameter is not checked at all. Until that changes, use a function example
(`fn = (x) => x`) for the parameter, and call `Unary(fn)` yourself where you want the
named check.
