<!--{"section": "tjs", "order": 16, "parent": "tjs-basics.md"}-->
<!-- TODO review -->

# Polymorphic Functions

Declare a function more than once with the same name and different parameters, and TJS
merges the declarations into one function that picks the right version for each call. It is
overloading as in Swift, C++ or Java, with one difference: those languages choose the
version when they compile, from declared types. TJS chooses when the function is called,
from the arguments it actually receives.

```tjs:inline
function describe(value: 0) {
  return 'integer: ' + value
}

function describe(value: '') {
  return 'string: ' + value
}

function describe(value: true) {
  return 'boolean: ' + value
}

// Same name, different number of parameters
function area(radius: 1.0) {
  return Math.PI * radius * radius
}

function area(width: 1.0, height: 1.0) {
  return width * height
}

console.log(describe(42)) // → integer: 42
console.log(describe('hello')) // → string: hello
console.log(describe(false)) // → boolean: false
console.log(area(1).toFixed(4)) // → 3.1416
console.log(area(3, 4)) // → 12

test 'dispatch by type' {
  expect(describe(42)).toBe('integer: 42')
  expect(describe('hello')).toBe('string: hello')
  expect(describe(true)).toBe('boolean: true')
}

test 'dispatch by number of arguments' {
  expect(Math.round(area(1))).toBe(3)
  expect(area(3, 4)).toBe(12)
}
```

Each declaration is an ordinary TJS function, and the colon values are examples, as
everywhere else in TJS: `value: 0` means "an integer", `value: ''` means "a string",
`radius: 1.0` means "a number". The three `describe` declarations differ only in those types,
and the two `area` declarations differ in how many parameters they take. Those differences
are what the merged function uses to choose.

The number types nest. A non-negative integer (`+0`) is also an integer (`0`), and every
integer is also a number (`1.0` or `0.0`). That is why `area(1)` works: `1` is an integer,
so it fits a number parameter.

## Why not one function?

Without overloading you write the choice yourself:

```javascript
function describe(value) {
  if (Number.isInteger(value)) return 'integer: ' + value
  if (typeof value === 'string') return 'string: ' + value
  if (typeof value === 'boolean') return 'boolean: ' + value
  throw new TypeError('describe: unsupported argument')
}
```

With separate declarations, each version has its own signature, which TJS validates and
documents, and the checks are written for you. Because the choice happens at call time, a
value whose type you only learn while the program runs, such as a field parsed from JSON,
still reaches the right version.

## What the transpiler builds

When a name is declared more than once in a file, the transpiler renames the declarations
`describe$1`, `describe$2`, `describe$3` (the **variants**) and writes one new `describe` (the
**dispatcher**). The dispatcher takes whatever arguments it is given, tests them against the
variants in a fixed order (described in the next section), and calls the first variant they
fit.

Everything else about each variant is unchanged. It keeps its own argument validation, and
its own signature test. A colon after the parameter list gives an example result, and TJS
checks it by calling the function with the example inputs, as it would for a lone function.
Writing the second `area` as `function area(width: 2.0, height: 3.0): 6.0` passes, because
2 × 3 is 6; with `: 7.0` the file fails `tjs check`.

## The order variants are tried in

1. **Number of arguments.** A variant matches only a call with exactly as many arguments as
   it has parameters. `area(1)` can only be the one-parameter `area`; `area(1, 2, 3)` matches
   neither.
2. **How specific the types are.** Among variants with the same number of parameters, the
   more specific one is tried first. A non-negative integer (`+0`) counts as more specific
   than an integer (`0`), an integer more than a number (`0.0`), and any declared type more
   than an untyped parameter. With several parameters the specificity is added up across all
   of them, so a variant can win overall even if one of its parameters is wider.
3. **Declaration order.** When two variants are equally specific and a call fits both, the one
   declared first wins.

Step 2 is what makes integer and number useful as separate variants. When every variant of a
name has the same number of parameters, the order you write them in does not matter; the
narrower type is always tried first:

```tjs:inline
// Declared widest first on purpose: dispatch still tries the narrowest first
function format(n: 0.0) {
  return `${n.toFixed(2)} (number)`
}

function format(n: 0) {
  return `${n} (integer)`
}

function format(n: +0) {
  return `${n} (count)`
}

console.log(format(1.5)) // → 1.50 (number)
console.log(format(-3)) // → -3 (integer)
console.log(format(42)) // → 42 (count)

test 'narrowest type wins' {
  expect(format(1.5)).toBe('1.50 (number)')
  expect(format(-3)).toBe('-3 (integer)')
  expect(format(42)).toBe('42 (count)')
}
```

`42` fits all three variants. It goes to `+0` because that is the narrowest; `-3` is not
non-negative, so it falls to `0`; `1.5` is not an integer, so only `0.0` takes it.

One caution: if variants with a different number of parameters are mixed in, the current
transpiler does not always apply step 2. With `g(n: 0.0)`, then `g(a: 0, b: 0)`, then
`g(n: 0)` declared in that order, `g(42)` goes to the `0.0` variant. Declaring the narrower
variant before the wider one avoids this.

An untyped parameter fits anything, so an untyped variant makes a catch-all. Because it is
the least specific, it is tried last:

```tjs:inline
function kind(x: 0) {
  return 'integer'
}

function kind(x) {
  return 'something else'
}

console.log(kind(3)) // → integer
console.log(kind('hi')) // → something else

test 'the untyped variant catches the rest' {
  expect(kind(3)).toBe('integer')
  expect(kind(null)).toBe('something else')
}
```

## When nothing matches

If no variant fits, the dispatcher does not throw, and it does not fall back to the
"closest" variant. It returns a `MonadicError`: an `Error` object handed back as the return
value instead of being thrown. You can test for one with `instanceof Error` (or
`isMonadicError()`). It is the same kind of value a single function returns for a bad
argument (see [Error Handling](/error-handling/)). Its message contains "no matching
overload" and the types of the arguments it was given:

```tjs:inline
function scale(n: 1.0) {
  return n * 10
}

function scale(text: '') {
  return text.repeat(10)
}

const tooMany = scale(1, 2)
const wrongType = scale(true)

// → true Expected no matching overload for 'scale', got array of number
console.log(tooMany instanceof Error, tooMany.message)
// → true Expected no matching overload for 'scale', got array of boolean
console.log(wrongType instanceof Error, wrongType.message)

test 'no match is an error value, not an exception' {
  expect(scale(true) instanceof Error).toBe(true)
}
```

There is one more case. If an argument is already an error, the dispatcher returns that
error unchanged instead of making a new one. Below, `half('ten')` fails because `'ten'` is
not a number, and passing its error on to `scale` hands back the same error. In a chain of
calls, the error you end up with is the one that names the first thing that went wrong:

```tjs:inline
function scale(n: 1.0) {
  return n * 10
}

function scale(text: '') {
  return text.repeat(10)
}

function half(n: 1.0) {
  return n / 2
}

const earlier = half('ten')
// → true Expected number for '…half.n', got string
console.log(scale(earlier) === earlier, earlier.message)

test 'an error argument passes through unchanged' {
  expect(scale(earlier)).toBe(earlier)
}
```

## Telling objects apart

The dispatcher compares types, and every object literal example has the same type:
"object". It does not look at the keys. So `shape(s: { radius: 1.0 })` and
`shape(s: { width: 1.0, height: 1.0 })` count as the same signature, and the file is
rejected as ambiguous (see the first rule under Rules and gotchas). Inside a lone function an
object example does still check the shape; it is only the dispatcher that cannot tell two of
them apart.

Give each shape a name with `Type` and use the names. Two different declared types are two
different signatures, and the dispatcher calls the first variant whose `Type` accepts the
argument:

```tjs:inline
Type Circle {
  example: { radius: 1.0 }
}

Type Rect {
  example: { width: 1.0, height: 1.0 }
}

function shapeArea(s: Circle) {
  return Math.PI * s.radius * s.radius
}

function shapeArea(s: Rect) {
  return s.width * s.height
}

console.log(shapeArea({ radius: 2 }).toFixed(2)) // → 12.57
console.log(shapeArea({ width: 3, height: 4 })) // → 12

test 'named types dispatch' {
  expect(shapeArea({ width: 3, height: 4 })).toBe(12)
  expect(shapeArea({ name: 'neither' }) instanceof Error).toBe(true)
}
```

A `Type` built from an example accepts an object that has the example's keys with values of
the right types; extra keys are allowed. So an object with `radius`, `width` and `height`
fits both `Circle` and `Rect`. The two variants are equally specific, so step 3 applies and
the one declared first, `Circle`, wins. [Object Types](/object-types/) covers `Type`
declarations in full.

## What the metadata and docs show

The dispatcher's own signature is "any arguments": `tjs check` lists it as
`describe(__args?: array)`, meaning one optional array holding whatever was passed. The
variants are where the types live, and `tjs check` lists them separately under their
numbered names. These are the `describe` lines it prints for the first example:

```text
describe$1(value: integer) -> void
describe$2(value: string) -> void
describe$3(value: boolean) -> void
describe(__args?: array) -> void
```

The `-> void` does not mean the functions return nothing. It means the listing has no return
type recorded for that entry, because none of these declarations gives a return example.

Every TJS function carries a `__tjs` property, the metadata object TJS attaches to it, which
tools and documentation generators read. On a dispatcher it says the function is polymorphic
and names its variants:

```tjs:inline
function show(n: 0.0) {
  return 'number ' + n
}

function show(s: '') {
  return 'text ' + s
}

test 'the dispatcher lists its variants' {
  expect(show.__tjs.polymorphic).toBe(true)
  expect(show.__tjs.variants).toEqual(['show$1', 'show$2'])
}
```

The metadata is attached at the very end of the file, after every top-level statement has
run. A top-level `console.log(show.__tjs)` anywhere in the same file prints `undefined`.
Read it from a `test` block, as above, or from another module after this one has loaded.

## Rules and gotchas

### Two variants must be distinguishable

If two declarations have the same number of parameters and the same type at every position,
the file is rejected with "ambiguous signatures". Only types count: renaming a parameter does
not make a new signature, and `(x: '')` and `(x: 'a')` are the same signature, because both
mean "a string".

<!-- tjs-doc: expect-error -->

```tjs:static
function label(id: 0) {
  return 'by id'
}

// Same signature as the first (one integer): the file is rejected
function label(index: 0) {
  return 'by index'
}
```

### Other rules

- **Dispatch looks at types, not values.** Overloading is for "a number or a string", not
  for "zero or not zero". Branch on values inside one function, or with
  [`given`](/given-dispatch/).
- **A default does not make a parameter optional to the dispatcher.** In
  `function opt(a: 0, b = 1)`, `b = 1` gives `b` a default, and the default also serves as
  its example, so `b` is an integer. But the argument count must match exactly, so `opt(1)`
  matches nothing. Declare a one-parameter variant if you want that call to work.
- **No rest parameters.** A variant with `...rest` is a transpile error; use a separate
  function name.
- **All variants are sync, or all are async.** Mixing `function` and `async function` under
  one name is a transpile error, because callers could not tell whether they will get a
  value or a promise.
- **`export` exports the dispatcher.** Marking any one variant `export` exports the
  dispatcher under the plain name; marking all of them does the same. The numbered variants
  stay private to the file.
- **Variants merge within one file.** Function declarations with the same name in the same
  file are merged. A function with the same name in another module is a separate function.
- **Dispatch costs a check per call.** Each call tests the argument count and types against
  the variants in order until one fits, so a polymorphic call does a little more work than a
  call to a lone function.
- Classes get the same treatment for constructors: see
  [Polymorphic Constructors](/polymorphic-constructors/).
