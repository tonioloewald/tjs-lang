<!--{"pin": "top", "order": 25, "book": ["default", "ts"]}-->
<!-- TODO review -->

# TypeScript: The Good, the Bad, and the Ugly

What TypeScript gets right, where it leaks, and what TJS does about it.

TypeScript won, and it deserved to. This chapter opens the TypeScript book, and the book
is not an argument against TypeScript. It is an argument about one decision at its core,
that types are erased before the program runs, and about what follows from that decision:
what it makes cheap, what it makes impossible, and what grew up around the gap.

The argument in one sentence: **a TypeScript type is a claim about a value that nobody
checks when the value arrives.** TJS keeps the claim, writes it as an example, and checks
it at run time. In TJS, `a: 2` means "an integer, for example 2", not the literal type
`2`; [Examples as contracts](#examples-as-contracts), below, explains it before any TJS
code appears. Everything else in this chapter is a consequence of that difference.

Most claims here come with a program you can run. The `ts` examples are real TypeScript:
the page converts them with the same converter you would use on your own code
(`fromTS`) and runs the result. The `tjs` examples are TJS. Edit any of them and run it
again. A block marked `typescript` (there is one, in The Ugly) is for reading only. Each
`console.log` is followed by a comment showing what it prints.

## Who this book is for

The book is for TypeScript programmers deciding whether TJS is worth their time, and for
those who have decided and want to move code across. There are two ways to use TJS, and
the rest of the book follows the split:

- **Stay in TypeScript and use TJS at the edges.** Your code stays `.ts` and you keep
  `tsc`. You call TJS's libraries from it: safe eval (run code you did not write, with a
  budget and no access to anything you did not hand it), the agent VM (AJS, which runs
  untrusted programs under a fuel limit), and runtime-checked types where data comes in.
  You can also turn on runtime checks file by file without leaving TypeScript.
- **Migrate.** You convert `.ts` files to TJS, one file at a time. Conversion is a
  faithful translation: a converted file behaves exactly as `tsc`'s output would. The
  checks this chapter describes start when you mark a file `TjsStrict` or graduate it to
  native TJS (both are defined [below](#four-states-of-a-file)).

[TJS for TypeScript Programmers](../../TJS-FOR-TS.md) is organized the same way: Part 1
is the first path, Part 2 the second. Read this chapter first either way; it explains why
the second path exists.

## The Good

TypeScript solved real problems, and TJS keeps as many of those solutions as it can.

- **Your editor knows what things are.** Autocomplete, go-to-definition, rename across a
  codebase. This is the reason most teams adopt it, and it is worth the price.
- **Intent is written down.** A signature like `function ship(order: Order): Receipt` is
  documentation that cannot drift out of the file, because it is the file.
- **Refactoring is safer.** Change a field name and the compiler lists every place that
  used it.
- **Adoption is gradual.** You can rename one `.js` file to `.ts` and stop there.
- **It is still JavaScript.** Remove the annotations and you have the program. Nothing
  new happens at run time, so nothing new can go wrong at run time.

TJS reads TypeScript rather than replacing it. The converter turns `.ts` files into TJS,
and TJS emits `.d.ts` files so TypeScript consumers keep their types (with one gap for
generics, covered in [What TJS does not fix](#what-tjs-does-not-fix)). Plain TypeScript
keeps its meaning. The example below has nothing TJS-specific in it, and that is the point:
it goes through the converter and prints what `tsc`'s output would print.

```ts:inline
interface Item {
  name: string
  price: number
}

function total(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0)
}

const cart: Item[] = [
  { name: 'pen', price: 1.5 },
  { name: 'pad', price: 3.25 },
]
console.log('total:', total(cart)) // total: 4.75
```

The last item on that list, nothing new happens at run time, is also the root of
everything in The Bad. First, what TJS keeps in place of an erased type.

## Examples as contracts

What TJS keeps instead of an erased type is an example. One example does four jobs:

```tjs:inline
function add(a: 2, b: 3): 5 {
  return a + b
}

console.log(add(10, 20)) // 30
console.log(add('10', 20)) // MonadicError: Expected integer for '…add.a', got string
console.log(add(1.5, 2)) // MonadicError: Expected integer for '…add.a', got number
```

- **Type.** `2` is an integer, so `a` accepts integers. `add('10', 20)` returns an error
  instead of `'1020'`.
- **Documentation.** The signature shows a real call and its real result.
- **Test.** The return annotation is a worked example. At build time TJS calls
  `add(2, 3)` and compares the result with `5`. Change the body to `a - b` and the build
  fails, with no test file and no test runner.
- **Metadata.** The function carries its signature at run time (`add.__tjs`), so
  documentation, JSON Schema and editor tooling read it from the value itself.

This is the most common misreading of TJS, so it is worth saying plainly: `: 5` is not
the literal type `5`. It is an example, and `a: 2` accepts every integer.

How a number is written decides which numbers it accepts. `42` is an integer, so
`add(1.5, 2)` above is refused. `3.14`, or `0.0`, is a float and accepts any number. `+0`
is a non-negative integer. The converter maps TypeScript's `number` to `0.0`, the widest
of the three, so converted code keeps accepting `1.5`. That is why the TJS examples below
write prices as `80.0`: a price is not always whole.

Two markers change what TJS does with a signature:

| Marker                             | Where                         | Meaning                                                                              |
| ---------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `!` (`function hot(! x: 0)`)       | first, inside the parameters  | skip input validation for this function                                              |
| `:!` (`function f(x: 0):! 0 { }`) | in place of the return colon  | the return example is a type only, not a worked test; the converter writes this for a TypeScript return type |

### Four states of a file

The rest of the chapter refers to a file being in one of these states:

- **TypeScript.** A `.ts` file, compiled by `tsc` as usual.
- **Converted.** The same file run through the converter (`fromTS`, or `tjs convert`). It
  keeps JavaScript's semantics: `==` coerces and parameters are not checked.
- **`TjsStrict`.** A `.ts` file whose first line is `/* @tjs TjsStrict */`. To `tsc` it is
  a comment and changes nothing. To the converter it says "make this full TJS", so every
  parameter is checked. Only code that goes through the converter gets the checks; the
  `tsc` output of the same file has none.
- **Native TJS (graduated).** A `.tjs` file. Graduation is the step that turns a converted
  file into one; [Converting a TypeScript Project](ts-converting-a-project.md) covers it.

Most examples in this chapter use `TjsStrict`, because it is the shortest way to see the
checks on TypeScript source.

## The Bad

### Types are erased

The compiler checks the code it can see. It cannot see what arrives from a network, a
form, a file, `localStorage` or `postMessage`. Those values are typed by assertion, and the
assertion is gone by the time the value shows up.

Here the price comes from a form, as a string. Every annotation is correct and the program
compiles under `--strict`. It prints a wrong answer and keeps going:

```ts:inline
function total(price: number, shipping: number): number {
  return price + shipping
}

// The price arrives as JSON from a form or an API, as a string.
const form = JSON.parse('{"price": "20"}')

console.log('total:', total(form.price, 5)) // total: 205
```

`205` is not a crash. A crash would at least be reported. It is a plausible number that
goes into a database. The converted version, which is what this page runs, prints `205`
too, because conversion keeps JavaScript's behaviour.

Now the same function with one line added. `/* @tjs TjsStrict */` makes the file full TJS,
and the `number` annotation becomes a check that runs on every call:

```ts:inline
/* @tjs TjsStrict */

function total(price: number, shipping: number): number {
  return price + shipping
}

const form = JSON.parse('{"price": "20"}')

console.log('total:', total(20, 5)) // total: 25
const result = total(form.price, 5)
console.log(isMonadicError(result)) // true
console.log(result.message) // Expected number for '…total.price', got string
```

The bad call does not throw. It returns a `MonadicError`: an `Error` object, returned as
the function's result instead of thrown, that says which parameter was wrong and what it
received. `isMonadicError(value)` tests for one. Errors in TJS are values, and they pass
through: a checked function that receives a `MonadicError` as an argument returns that
same error without running its body. So the error surfaces where you look at the result,
not somewhere in the middle. TypeScript code that calls a TJS function and does not check
gets the error object back as an ordinary value, so test results at the boundary.

### `as` and `any` lie

TypeScript has two ways to make the compiler stop asking, and both are routine. `any`
turns checking off for a value. `as` tells the compiler what a value is, and the compiler
believes it. `JSON.parse` returns `any`, so `JSON.parse(text) as User` is how most
TypeScript code reads data, and it is a promise nobody keeps:

```ts:inline
/* @tjs TjsStrict */

interface User {
  name: string
  email: string
}

function greeting(user: User): string {
  return `Hello, ${user.name} <${user.email}>`
}

const user = JSON.parse('{"name": "Ada"}') as User // the compiler believes this

console.log(greeting({ name: 'Grace', email: 'grace@navy.mil' }))
// Hello, Grace <grace@navy.mil>
console.log(greeting(user))
// MonadicError: Expected User for '…greeting.user', got object
```

Under `tsc` the second call prints `Hello, Ada <undefined>`. In TJS the assertion still
compiles, because TJS does not need to argue with it. Conversion turns `interface User`
into a TJS `Type` with the example `{ name: '', email: '' }`, so a value that is missing
`email`, or has a number where `name` should be, fails it. The value is checked where it
is used, against the type the function declared, and the second call returns an error
that says `user` was not a `User`.

### Structural types accept anything shaped right

TypeScript's types are structural: a value fits a type if it has the right members. That
is usually what you want, and it is why TypeScript can describe JavaScript at all. It also
means two types with the same shape are the same type:

```ts:inline
interface Celsius {
  degrees: number
}
interface Fahrenheit {
  degrees: number
}

function boils(t: Celsius): boolean {
  return t.degrees >= 100
}

const warmWater: Fahrenheit = { degrees: 150 } // well below boiling (212 F)
console.log('150 F water boils?', boils(warmWater)) // 150 F water boils? true
```

TJS does not pretend to fix this. A TJS `Type` built from an example is structural too,
and it would accept the Fahrenheit value just the same. The honest answer is to make the
difference visible in the data, so the two shapes differ:

```tjs:inline
Type Celsius {
  description: 'a temperature in degrees Celsius'
  example: { celsius: 0.0 }
}

function boils(t: Celsius): false {
  return t.celsius >= 100
}

console.log(boils({ celsius: 100 })) // true
console.log(boils({ fahrenheit: 150 }))
// MonadicError: Expected Celsius for '…boils.t', got object
```

A `Type` block has up to three fields: `description` (for documentation), `example` (a
value of the type, which gives it its shape) and an optional `predicate` (a function that
must return true). Here the example says a `Celsius` is an object with a numeric `celsius`
field, so `{ fahrenheit: 150 }` is refused. The return example `: false` is a worked
example like `add`'s: TJS calls `boils({ celsius: 0.0 })` at build time and expects
`false`.

For what a shape cannot say at all, TypeScript's tool is the branded type, which is a
compile-time fiction again. TJS's tool is a predicate, which runs:

```tjs:inline
Type Percent {
  description: 'a percentage, from 0 to 100'
  example: 50.0
  predicate(v) {
    return v >= 0 && v <= 100
  }
}

function discounted(price: 80.0, off: Percent): 40.0 {
  return price * (1 - off / 100)
}

console.log(discounted(80, 25)) // 60
console.log(discounted(80, 250))
// MonadicError: Expected Percent for '…discounted.off', got number
console.log(discounted(80, '25'))
// MonadicError: Expected Percent for '…discounted.off', got string
```

`: 40.0` is a worked example: TJS calls `discounted(80.0, 50.0)` at build time, using the
parameter examples, and expects `40`. The `.0` marks a float, as above. `example: 50.0`
also makes `Percent` a number, so `discounted(80, '25')` is refused before the predicate
runs. Inside a `Type` block the predicate can also use the type's name for the value being
tested (`predicate { return Percent >= 0 && Percent <= 100 }`); the two spellings mean the
same thing.

### JSON at the boundary is unchecked

The previous three are one problem seen from three sides. Every TypeScript program has a
boundary where untyped data becomes typed data, and at that boundary the type system has
nothing to say. Teams solve it by adding a second type system: Zod, io-ts, Ajv, a
hand-written validator. Now each type is written twice, in two languages, and the two copies
drift.

In TJS the type is the validator, so there is nothing to write twice. The `User` in the
`as` example above was an ordinary TypeScript interface, and it checked the parsed JSON
with no second schema. [Replacing Zod, io-ts and Ajv](ts-from-zod.md) works through the
migration from each of those libraries.

The quietest form of the problem is equality. `==` between a string and a number is a
compile error in TypeScript, when it can see both types. When the string came from
`JSON.parse`, it cannot, and JavaScript's coercion decides:

```ts:inline
/* @tjs TjsStrict */

const fromTheWire = JSON.parse('"5"')
console.log('JSON "5" == 5?', fromTheWire == 5) // JSON "5" == 5? false
```

Under `tsc` that prints `true`. This page prints `false`: in TJS `==` never converts one
type to another, so a string is never equal to a number, whether or not anyone knew the
types in advance. [TJS vs TypeScript](../../docs/tjs-vs-typescript.md) runs this
comparison, and many like it, through `tsc --strict` and TJS on every test run.
[Validating JSON at the Boundary](ts-json-boundary.md) is the practical chapter.

## The Ugly

TypeScript's types grew into a second programming language. It has conditionals, loops
(by recursion), pattern matching (`infer`), string manipulation (template literal types)
and it is Turing-complete. People write parsers in it.

```typescript
type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T

type RouteParams<S extends string> =
  S extends `${string}:${infer P}/${infer Rest}`
    ? { [K in P | keyof RouteParams<Rest>]: string }
    : S extends `${string}:${infer P}`
      ? { [K in P]: string }
      : {}
```

This language has no debugger, no tests, error messages that print the whole expansion,
and a runtime of zero: everything it computes is deleted before the program runs. Its
results cannot be checked against a value, because there are no values in it. It is often
harder to read than the code it describes.

TJS has no type-level language. A type is an example, and when an example cannot say
enough, a predicate says the rest, in the same JavaScript as the rest of the program. Here
is a rule TypeScript cannot state, because it relates two values rather than describing
each one: _a range's `min` is not above its `max`._

```tjs:inline
Type Range {
  description: 'a range whose min is not above its max'
  example: { min: 0, max: 10 }
  predicate(r) {
    return r.min <= r.max
  }
}

function width(r: Range): 10 {
  return r.max - r.min
}

console.log(width({ min: 2, max: 5 })) // 3
console.log(width({ min: 5, max: 2 }))
// MonadicError: Expected Range for '…width.r', got object
console.log(width(JSON.parse('{"min": 0, "max": "9"}')))
// MonadicError: Expected Range for '…width.r', got object
```

The example makes `Range` an object with integer `min` and `max`, which is why the last
call, where `max` arrived as a string, is refused. The predicate says the rest. Where
TypeScript can state a rule, a predicate still differs in when it runs. Since TypeScript
4.4, ``type Flags = { [k: `is${string}`]: boolean }`` says that every key starting
with `is` holds a boolean, but only for values the compiler can see:
`JSON.parse('{"isOpen": "yes"}') as Flags` gets through. A TJS predicate checks the value
that actually arrives.

The cost is real: a predicate is checked when the program runs, not when it compiles.
TypeScript would reject some of these mistakes before you ran anything. The argument of
this book is that the mistakes that matter most are in values you cannot see at compile
time, and that a check which runs is worth more than a proof about a value that never
arrives.

### What you keep at compile time

Migrating does not mean giving up build-time checks. At build time TJS checks that every
file parses and that every signature's worked example holds (`add(2, 3)` really is `5`);
`tjs check` runs both, and fails the build when an example does not hold. What it does not do is static type
inference across calls: nothing at build time proves that `total(form.price, 5)` passes a
number.

In a mixed project you keep `tsc` for the `.ts` files, and TypeScript code that imports a
`.tjs` file is typed through the `.d.ts` that TJS emits for it. Once a file is graduated,
`tsc` no longer reads it, so inside that file you trade `tsc`'s checking for TJS's runtime
checks and worked examples. [Build, CI and Editors](ts-build-and-tooling.md) shows the
commands for both halves.

## What TJS does not fix

- **Checks cost something.** Validating inputs at every call is not free. It is cheap
  next to the work most functions do, and you can turn validation off for one function by
  putting `!` first in its parameter list (`function hot(! x: 0)`) when the data is
  already trusted.
- **Converted code keeps JavaScript's behaviour until you opt in.** A converted file is a
  faithful translation: it behaves exactly as the TypeScript compiler's output would,
  including `==` coercion and unchecked parameters. Checking starts when you graduate the
  file to native TJS, or mark it `TjsStrict`. See
  [Converting a TypeScript Project](ts-converting-a-project.md).
- **Generic relationships are not checked.** `function first<T>(xs: T[]): T` says the
  result has the type of the elements. TJS checks the values a function receives, not
  relationships between type parameters, so an unconstrained `T` becomes `any`.
- **Some type-level types have no runtime meaning, and generics lose detail in `.d.ts`.**
  A conditional or mapped type alias is kept verbatim in the `.d.ts` output, but nothing
  is checked at run time for it. A function signature that uses a type parameter is
  emitted with `any` in its place: `freeze<T>(x: T): DeepReadonly<T>` comes out as
  `freeze(x: any): DeepReadonly`. [Generic .d.ts Emission](../../docs/generic-dts-design.md)
  is the design work on closing that gap.

## How this book is organized

The chapters, in the order the navigation shows them:

- **This chapter**, with three pages beneath it:
  - [TJS vs TypeScript](../../docs/tjs-vs-typescript.md): the measured comparison, for
    anyone who wants each difference shown rather than claimed. Every row is executed
    against `tsc --strict` and TJS on every test run.
  - [Generic .d.ts Emission](../../docs/generic-dts-design.md): design notes on how
    generic types reach the `.d.ts` output, for library authors whose public API is
    generic.
  - [Post-mortem](../../docs/postmortem-ts-emitter.md): seven months spent testing
    TypeScript's compiler instead of ours, for anyone judging how far to trust the
    project's test evidence.
- [TJS for TypeScript Programmers](../../TJS-FOR-TS.md): Part 1, using TJS from a
  TypeScript codebase; Part 2, the syntax reference for migrating to it. Beneath it:
  - [TypeScript Examples](ts-examples.md): real TypeScript, converted and run on the page,
    in four groups (Introduction, Validation, Patterns, Advanced).
  - [Converting a TypeScript Project](ts-converting-a-project.md): `tjs convert`, the
    named escapes conversion writes, and graduation to native TJS.
  - [Validating JSON at the Boundary](ts-json-boundary.md): one type, written once,
    checked where the data comes in.
  - [Publishing a TJS Library to TypeScript](ts-publishing-a-library.md): shipping TJS
    code as an npm package that TypeScript consumers install and type-check as usual.
  - [Replacing Zod, io-ts and Ajv](ts-from-zod.md): moving a validation layer onto TJS
    types, library by library.
  - [Build, CI and Editors](ts-build-and-tooling.md): `.tjs` next to `.ts` in one project,
    what to run in CI, and editor support.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Generic .d.ts Emission: Design Notes](/generic-dts-design/)
- [Post-mortem: we spent seven months testing TypeScript's compiler](/postmortem-ts-emitter/)
<!-- /toc -->

<!-- prettier-ignore-end -->
