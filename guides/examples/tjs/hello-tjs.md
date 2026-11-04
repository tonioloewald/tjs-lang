<!--{"section": "tjs", "order": 1, "parent": "tjs-basics.md"}-->

# Hello TJS

Types-by-example: the value IS the type annotation

## Types by Example

In TJS, the example value after `:` IS the type:

| Syntax | Type |
|--------|------|
| `name: 'Alice'` | string (required) |
| `count: 42` | integer |
| `rate: 3.14` | number (float) |
| `index: +0` | non-negative integer |
| `name = 'default'` | string (optional, defaults to 'default') |
| `data: { x: 0, y: 0 }` | object with shape |
| `...nums: [0]` | rest param, array of integers |

```tjs:static
/**
 * But **jsDoc** is also supported.
 */

function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

// Numeric type narrowing — all valid JS syntax
function clampIndex(index: +0, max: +0): +0 {
  return Math.min(index, max)
}

function mix(a: 0.0, b: 0.0, t: 0.0): 0.0 {
  return a + (b - a) * t
}

test 'greet says hello' {
  expect(greet('TJS')).toBe('Hello, TJS!')
}

test 'type errors are values, not exceptions' {
  const err = greet(42)
  expect(err instanceof Error).toBe(true)
}

test 'numeric types are precise' {
  expect(clampIndex(5, 10)).toBe(5)
  // negative fails non-negative integer check
  expect(clampIndex(-1, 10) instanceof Error).toBe(true)
  // float fails integer check
  expect(clampIndex(3.5, 10) instanceof Error).toBe(true)
}

test 'floats accept any number' {
  expect(mix(0, 100, 0.5)).toBe(50)
}

// Rest params — the array example IS the type
function sum(...nums: [1, 2, 3]): 6 {
  return nums.reduce((a = 0, b: 0) => a + b, 0)
}

function mean(...values: [1.0, 2.0, 3.0, 2.0]): 2.0 {
  return values.length
    ? values.reduce((sum = 0.0, x: 1.0) => sum + x) / values.length
    : 0.0
}

test 'sum integers' {
  expect(sum(1, 2, 3)).toBe(6)
}

test 'mean of floats' {
  expect(mean(10, 20, 30)).toBe(20)
}

test 'mean of empty' {
  expect(mean()).toBe(0)
}
```

<!-- TODO review -->

## What to notice

**The colon introduces an example, not a type.** `name: 'World'` does not mean "the string
`'World'` and nothing else", as it would in TypeScript. It means "a required parameter; here
is a value it might hold". TJS reads the type off the example (`'World'` is a string), and
keeps the example as documentation. `count: 42` is an integer, `rate: 3.14` is any number,
and `index: +0` is an integer that cannot be negative, because that is what the literal says.

**The return annotation is a worked example, and it runs.** `greet(name: 'World'): 'Hello,
World!'` claims that `greet('World')` returns `'Hello, World!'`. When the file is
transpiled, TJS calls `greet` with the parameter examples and compares the result by deep
equality. If the claim is false, the file does not build.

**Errors are values.** `greet(42)` does not throw. It returns a `MonadicError` naming the
parameter that was wrong, and the program carries on. That is why the second test checks
`err instanceof Error` instead of wrapping the call in `try`.

**Tests live in the file.** A `test '…' { … }` block runs when the file is transpiled and is
stripped from the output, so it costs nothing at runtime.

## Run it

This is the same function, run instead of tested. Change the arguments and run it again.

```tjs:inline
function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

console.log(greet('TJS'))

// A wrong argument is returned as an error, not thrown
const oops = greet(42)
console.log(oops instanceof Error) // true
console.log(oops.message)

// The signature is still there at runtime
console.log(JSON.stringify(greet.__tjs.params))
```

## When the example is wrong

A return example that does not match what the function computes stops the build:

<!-- tjs-doc: expect-error -->

```tjs:static
function add(a: 2, b: 3): 0 {
  return a + b // add(2, 3) is 5, so the example `: 0` is false
}
```

`tjs check` reports `Expected 0 at 'add', got 5`. This is deliberate: the example is part
of the documentation, and documentation that lies should not ship. If you want to say only
what *type* a function returns, without claiming a particular result, use `:!`:

```tjs:static
function add(a: 2, b: 3):! 0 {
  return a + b // `:! 0` means "returns an integer"; no test runs
}
```

## Things that trip people up

- **`name: string` also works.** The names `string`, `number`, `boolean`, `int`, `float` and
  `unsigned` are understood, so `function f(s: string)` validates exactly like
  `function f(s: '')`. Examples are preferred because they double as documentation and as
  the test input.
- **`:` means required, `=` means optional.** `name: 'World'` must be passed;
  `name = 'World'` defaults to `'World'`. To give a parameter both a type and a separate
  default, write the type first: `n: number = 5`. The next chapter covers this.
- **A bare `null` default accepts anything.** `function render(doc = null)` takes any value
  and defaults to `null`. To accept *only* `null`, write `doc: null`.
- **`0` is an integer, not a number.** `function half(x: 0)` rejects `1.5`. Write
  `x: 0.0` (or `x: number`) when fractions are allowed. This is the most common surprise
  for people coming from TypeScript, where `number` is the only numeric type.
