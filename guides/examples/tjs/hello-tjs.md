<!--{"section": "tjs", "order": 1, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Hello TJS

This chapter is for JavaScript developers. New to programming? Start with
[Learn to Program](/learn-to-program/) instead.

In TJS you do not write a type for a parameter. You write a sample value, and TJS reads the
type off it. That one sample does three jobs: it is checked at run time, it documents the
function, and it is the input to a test that runs when the file is built.

## Types by example

A parameter written with `:` is **required**; one written with `=` is **optional**, and the
value is its default. Either way, the value's type is the parameter's type.

| Syntax | Type |
|--------|------|
| `name: 'Alice'` | string |
| `count: 42` | integer: `1.5` is rejected |
| `rate: 3.14` or `rate: 0.0` | any number, integers included |
| `index: +0` | non-negative integer |
| `name = 'default'` | string, optional, defaults to `'default'` |
| `data: { x: 0, y: 0 }` | object; `x` and `y` must both be present and be integers; extra keys pass through |

Watch the numbers. `0` and `42` mean *integer*, so `x: 0` rejects `1.5`. When fractions are
allowed, write a number with a decimal point: `x: 0.0`. This surprises most people coming
from TypeScript, where `number` is the only numeric type.

Arrays and rest parameters (`...ids: [0]`) are covered in [Array Types](/array-types/), and
object shapes in [Object Types](/object-types/).

Here are three functions and the tests that pin them down:

```tjs:inline
function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

// The form of the number picks the type: +0 is a non-negative integer,
// 0.0 is any number
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

Try breaking it. Change `greet('TJS')` to `greet(42)` and the console shows an error
instead of a greeting. Change `: 'Hello, World!'` to `: 'Hi'` and the block reports a
failed test before your code runs.

`test`, `expect` and `isMonadicError` need no import: they are built into every TJS file.

## What to notice

**The colon introduces an example, not a type.** `name: 'World'` does not mean "the string
`'World'` and nothing else", as it would in TypeScript. It means "a required parameter; here
is a value it might hold". TJS reads the type off the example (`'World'` is a string), and
keeps the example as documentation.

**The return annotation is a worked example, and it runs.** `greet(name: 'World'): 'Hello,
World!'` claims that `greet('World')` returns `'Hello, World!'`. TJS checks the claim by
calling `greet` with the parameter examples and comparing the result by deep equality. The
same goes for the other two: `: +0` claims `clampIndex(0, 0)` is `0`, and `: 0.0` claims
`mix(0.0, 0.0, 0.0)` is `0`. Both are true, so both pass. (To state only a return type, with
no claim about the result, use `:!`; see below.)

**Errors are values.** `greet(42)` does not throw. It returns a `MonadicError` naming the
parameter that was wrong, and the program carries on. That is why the second test checks
the result with `isMonadicError` instead of wrapping the call in `try`. "Monadic" means the
error travels like any other value: pass it into another checked function and that function
hands the same error straight back, so a bad value cannot slip quietly through a chain of
calls. If you never check it, `console.log(greet(42))` prints the error, not a greeting.

**Tests run when the file is built, not when it runs.** TJS has two moments. When the file is
transpiled (turned into plain JavaScript), the signature examples and the `test` blocks run.
When the resulting JavaScript runs, only your code executes: the tests have been stripped
out, so they cost nothing at run time. On this page both moments happen when the block runs.

## What an error carries

A `MonadicError` is an `Error` with these fields:

- `message`: a sentence for people, such as `Expected string for 'hello.tjs:1:greet.name', got number`.
- `path`: where the check failed: source name, line, function and parameter, such as
  `hello.tjs:1:greet.name`. The source name depends on where the code lives, so on this page
  it reads differently; the `greet.name` part is the stable bit.
- `expected`: the type the parameter wanted (`string`).
- `actual`: what it got (`number`).

```tjs:inline
function greet(name: 'World'): 'Hello, World!' {
  return `Hello, ${name}!`
}

const oops = greet(42)

console.log(oops.message)  // Expected string for '…:1:greet.name', got number
console.log(oops.path)     // …:1:greet.name
console.log(oops.expected) // string
console.log(oops.actual)   // number

console.log(isMonadicError(oops))    // true
console.log(oops instanceof Error)   // true

// The signature survives to run time, so tools can read it
console.log(greet.__tjs.params.name.type.kind) // string
console.log(greet.__tjs.params.name.required)  // true
```

Two checks tell an error from a value, and both work here. `oops instanceof Error` is true
because a `MonadicError` is an `Error`. `isMonadicError(oops)` is narrower: it is true only
for a `MonadicError` (a failed type check, a failed `!` access, or one you construct), not
for an ordinary `Error`, and it works across modules. The rest of this book uses
`isMonadicError`. [Error Handling](/error-handling/) shows how these errors travel through a
chain of calls.

The last two lines read `__tjs`, the metadata TJS attaches to every checked function: its
parameters, their types and examples. Documentation, JSON Schemas and editor help are built
from it.

## When the example is wrong

A return example that does not match what the function computes is a failed test:

<!-- tjs-doc: expect-error -->

```tjs:static
function add(a: 2, b: 3): 0 {
  return a + b // add(2, 3) is 5, so the example `: 0` is false
}
```

The checker (`tjs check` on the command line, or the test results on this page) reports
`Expected 0 at 'add', got 5`, and `tjs check` exits with an error. (`tjs run` does not
enforce signature tests today, so it runs this file without complaint.) This is deliberate:
the example is part of the documentation, and documentation that lies should not ship. If
you want to say only what *type* a function returns, without claiming a particular result,
use `:!`:

```tjs:static
function add(a: 2, b: 3):! 0 {
  return a + b // `:! 0` means "returns an integer"; no test runs
}
```

`:!` is a statement of the return type and nothing more: no test runs, and the result is not
checked at run time either. The parameters are still checked: `add(2, 0.5)` returns a
`MonadicError`, because `b: 3` is an integer. (`:?` does both: it runs the worked example
and checks every result at run time.)

## Things that trip people up

- **`name: string` also works.** Type names such as `string`, `number`, `boolean`, `int`,
  `float` and `unsigned` are understood; see [TJS Syntax](/TJS-SYNTAX/) for the full list.
  Each checks the same type as an example: `string` as `''`, `int` as `0`, `number` and
  `float` as `0.0`, `unsigned` as `+0`, `boolean` as `false`. So `function f(s: string)`
  validates exactly like `function f(s: '')`. A type name carries no worked value, though,
  so a `: string` return runs no signature test, just like `:!`. Real examples are preferred
  because they double as documentation and as test input.
- **`:` means required, `=` means optional.** `name: 'World'` must be passed;
  `name = 'World'` defaults to `'World'`. Sometimes the default's type is too narrow:
  `n = 5` accepts only integers. To accept any number and still default to 5, write the type
  first: `n: number = 5`. [Required vs Optional](/required-vs-optional/) covers this.
- **A bare `null` default accepts anything.** `null` carries no type information, so
  `function render(doc = null)` takes any value and defaults to `null`.
- **`0` is an integer, not a number.** `function half(x: 0)` rejects `1.5`. Write
  `x: 0.0` (or `x: number`) when fractions are allowed.
