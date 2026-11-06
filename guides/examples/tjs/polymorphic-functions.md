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

console.log(describe(42))
console.log(describe('hello'))
console.log(describe(false))
console.log(area(1).toFixed(4))
console.log(area(3, 4))

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

## What the transpiler builds

When a name is declared more than once in a file, the transpiler renames the declarations
`describe$1`, `describe$2`, `describe$3` (the **variants**) and writes one new `describe` (the
**dispatcher**). The dispatcher takes whatever arguments it is given, tests them against each
variant's parameters in turn, and calls the first variant they fit.

Everything else about each variant is unchanged. It keeps its own argument validation, and
its own signature test: a return example on a variant (`function double(x: 2): 4`) is
checked against that variant at transpile time, exactly as it would be on a lone function.

## The order variants are tried in

1. **Number of arguments.** A variant matches only a call with exactly as many arguments as
   it has parameters. `area(1)` can only be the one-parameter `area`; `area(1, 2, 3)` matches
   neither.
2. **How specific the types are.** Among variants with the same number of parameters, the one
   with narrower types is tried first: a non-negative integer (`+0`) before an integer (`0`),
   an integer before a number (`0.0`), any declared type before an untyped parameter.
3. **Declaration order.** When two variants are equally specific and a call fits both, the one
   declared first wins.

Step 2 is what makes integer and float useful as separate variants. The order you write them
in does not matter; the narrower type is always tried first:

```tjs:inline
// Declared widest first on purpose: dispatch still tries the narrowest first
function format(n: 0.0) {
  return `${n.toFixed(2)} (fraction)`
}

function format(n: 0) {
  return `${n} (whole)`
}

function format(n: +0) {
  return `${n} (count)`
}

console.log(format(1.5))
console.log(format(-3))
console.log(format(42))

test 'narrowest type wins' {
  expect(format(1.5)).toBe('1.50 (fraction)')
  expect(format(-3)).toBe('-3 (whole)')
  expect(format(42)).toBe('42 (count)')
}
```

`42` fits all three variants. It goes to `+0` because that is the narrowest; `-3` is not
non-negative, so it falls to `0`; `1.5` is not an integer, so only `0.0` takes it.

## When nothing matches

If no variant fits, the dispatcher does not throw, and it does not fall back to the
"closest" variant. It returns a `MonadicError` whose message says "no matching overload", the
same kind of value a single function returns for a bad argument (see
[Error Handling](/error-handling/)):

```tjs:inline
function scale(n: 1.0) {
  return n * 10
}

function scale(text: '') {
  return text.repeat(10)
}

const tooMany = scale(1, 2)
const wrongType = scale(true)

console.log(tooMany instanceof Error, tooMany.message)
console.log(wrongType instanceof Error, wrongType.message)

// An argument that is ALREADY an error passes through unchanged,
// so the first failure is the one you see
function half(n: 1.0) {
  return n / 2
}
const earlier = half('ten')
console.log(scale(earlier) === earlier, earlier.message)

test 'no match is an error value, not an exception' {
  expect(scale(true) instanceof Error).toBe(true)
  expect(scale(earlier)).toBe(earlier)
}
```

## Telling objects apart

The dispatcher compares types, and every object literal example has the same type:
"object". So `shape(s: { radius: 1.0 })` and `shape(s: { width: 1.0, height: 1.0 })` count
as the same signature, and the file is rejected. Give each shape a name with `Type` and use
the names; two different declared types are two different signatures, and the dispatcher
checks each argument against the type's example:

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

console.log(shapeArea({ radius: 2 }).toFixed(2))
console.log(shapeArea({ width: 3, height: 4 }))

test 'named types dispatch' {
  expect(shapeArea({ width: 3, height: 4 })).toBe(12)
  expect(shapeArea({ name: 'neither' }) instanceof Error).toBe(true)
}
```

[Object Types](/object-types/) covers `Type` declarations in full.

## What the metadata and docs show

The dispatcher's own signature is just "any arguments": `tjs check` lists it as
`describe(__args?: array)`. The variants are where the types live, and they are listed
separately under their numbered names:

```text
describe$1(value: integer) -> void
describe$2(value: string) -> void
describe$3(value: boolean) -> void
describe(__args?: array) -> void
```

At runtime the dispatcher's `__tjs` metadata says it is polymorphic and names its variants:

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

The metadata is attached at the end of the file, so read it from a test or after the file
has loaded, not from a top-level statement above it.

## Rules and gotchas

- **Two variants must be distinguishable.** If two declarations have the same number of
  parameters and the same type at every position, the file is rejected with "ambiguous
  signatures". Only types count: renaming a parameter does not make a new signature, and
  `(x: '')` and `(x: 'a')` are the same signature, because both mean "a string".

<!-- tjs-doc: expect-error -->

```tjs:static
function label(id: 0) {
  return 'by id'
}

function label(index: 0) {
  return 'by index'
} // same signature as the first: rejected
```

- **Dispatch looks at types, not values.** Overloading is for "a number or a string", not
  for "zero or not zero". Branch on values inside one function, or with
  [`given`](/given-dispatch/).
- **A default does not make a parameter optional to the dispatcher.** The argument count must
  match exactly, so with `function opt(a: 0, b = 1)` as one variant, `opt(1)` matches nothing.
  Declare a one-parameter variant if you want that call to work.
- **All variants are sync, or all are async.** Mixing `function` and `async function` under
  one name is a transpile error, because callers could not tell whether they will get a
  value or a promise.
- **`export` exports the dispatcher.** If any variant is marked `export`, the
  dispatcher is what other modules import; the numbered variants stay private to the file.
- Classes get the same treatment for constructors: see
  [Polymorphic Constructors](/polymorphic-constructors/).
