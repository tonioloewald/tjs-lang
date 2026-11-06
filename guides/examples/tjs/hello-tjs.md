<!--{"section": "tjs", "order": 1, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Hello TJS

Types by example: the value after the colon tells TJS what the type is.

## Types by example

In TJS, a parameter is annotated with an example value, and TJS reads the type off it:

| Syntax | Type |
|--------|------|
| `name: 'Alice'` | string (required) |
| `count: 42` | integer |
| `rate: 3.14` | number (float) |
| `index: +0` | non-negative integer |
| `name = 'default'` | string (optional, defaults to `'default'`) |
| `data: { x: 0, y: 0 }` | object with that shape |

Arrays and rest parameters (`...ids: [0]`) are covered in [Array Types](/array-types/).

Here are three functions and the tests that pin them down. Edit them: pass a wrong argument,
change a return example, and watch what happens.

```tjs:inline
/**
 * Doc comments in **JSDoc** style are supported too.
 */
function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

// Numeric narrowing: every one of these is plain JavaScript syntax
function clampIndex(index: +0, max: +0): +0 {
  return Math.min(index, max)
}

function mix(a: 0.0, b: 0.0, t: 0.0): 0.0 {
  return a + (b - a) * t
}

console.log(greet('TJS'))         // Hello, TJS!
console.log(clampIndex(5, 10))    // 5
console.log(mix(0, 100, 0.5))     // 50

test 'greet says hello' {
  expect(greet('TJS')).toBe('Hello, TJS!')
}

test 'type errors are values, not exceptions' {
  expect(isMonadicError(greet(42))).toBe(true)
}

test 'numeric types are precise' {
  expect(clampIndex(5, 10)).toBe(5)
  // a negative number fails the non-negative integer check
  expect(isMonadicError(clampIndex(-1, 10))).toBe(true)
  // a fraction fails the integer check
  expect(isMonadicError(clampIndex(3.5, 10))).toBe(true)
}

test 'floats accept any number' {
  expect(mix(0, 100, 0.5)).toBe(50)
}
```

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
the result with `isMonadicError` instead of wrapping the call in `try`.

**Tests live in the file.** A `test '…' { … }` block runs when the file is transpiled and is
stripped from the output, so it costs nothing at runtime.

## What an error carries

A `MonadicError` is an `Error` with four fields worth reading:

- `message`: a sentence for people, such as `Expected string for 'hello.tjs:1:greet.name', got number`.
- `path`: where the check failed: file, line, function and parameter (`hello.tjs:1:greet.name`).
- `expected`: the type the parameter wanted (`string`).
- `actual`: what it got (`number`).

```tjs:inline
function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

const oops = greet(42)

console.log(oops.message)
console.log(oops.path)
console.log(oops.expected) // string
console.log(oops.actual)   // number

console.log(isMonadicError(oops))    // true
console.log(oops instanceof Error)   // true

// The signature is still there at runtime
console.log(JSON.stringify(greet.__tjs.params))
```

Two checks tell an error from a value, and both work here. `oops instanceof Error` is true
because a `MonadicError` is an `Error`. `isMonadicError(oops)` is narrower: it is true only
for a TJS validation failure, not for any other `Error` your code returns or catches, and
it does not depend on class identity, so it gives the same answer for an error made by
another module's copy of the runtime. The rest of this book uses `isMonadicError`.
[Error Handling](/error-handling/) shows how these errors travel through a chain of calls.

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

With `:!` the parameters are still checked: `add(2, 0.5)` returns a `MonadicError`, because
`b: 3` is an integer.

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
