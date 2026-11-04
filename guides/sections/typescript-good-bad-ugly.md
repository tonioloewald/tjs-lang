<!--{"pin": "top", "order": 50, "book": ["default", "ts"]}-->

# TypeScript: The Good, the Bad, and the Ugly

What TypeScript gets right, where it leaks, and what TJS does about it.

<!-- TODO review -->

TypeScript won, and it deserved to. This book is not an argument against it. It is an
argument about one decision at its core, that types are erased before the program runs,
and about what follows from that decision: what it makes cheap, what it makes impossible,
and what grew up around the gap.

The argument in one sentence: **a TypeScript type is a claim about a value that nobody
checks when the value arrives.** TJS keeps the claim, writes it as an example, and checks
it at run time. Everything else in this book is a consequence of that difference.

Every claim here comes with a program you can run. The `ts` examples are real TypeScript:
the page converts them with the same converter you would use on your own code
(`fromTS`) and runs the result. The `tjs` examples are TJS. Edit any of them and run it
again.

<!-- TODO review -->

## The Good

TypeScript solved real problems, and TJS keeps every one of its solutions it can.

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
TJS emits `.d.ts` files so TypeScript consumers keep their types, and the plain
TypeScript below runs as it is, unchanged in meaning:

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
console.log('total:', total(cart))
```

The last item on that list, nothing new happens at run time, is also the root of
everything in the next section.

<!-- TODO review -->

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

console.log('total:', total(form.price, 5))
```

`205` is not a crash. A crash would at least be reported. It is a plausible number that
goes into a database.

Now the same function with one line added: `/* @tjs TjsStrict */` opts converted TypeScript
into full TJS, and the `number` annotation becomes a check that runs on every call:

```ts:inline
/* @tjs TjsStrict */

function total(price: number, shipping: number): number {
  return price + shipping
}

const form = JSON.parse('{"price": "20"}')

console.log('total:', total(20, 5))
console.log('total:', total(form.price, 5))
```

The bad call does not throw. It returns a `MonadicError` value that says which parameter
was wrong and what it received. Errors in TJS are values: a function that receives one
passes it straight through, so it surfaces where you look at the result rather than
somewhere in the middle.

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
console.log(greeting(user))
```

Under `tsc` the second call prints `Hello, Ada <undefined>`. In TJS the assertion still
compiles, because TJS does not need to argue with it: the value is checked where it is
used, against the type the function declared.

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
console.log('150 F water boils?', boils(warmWater))
```

TJS does not pretend to fix this. A TJS `Type` built from an example is structural too,
and it would accept the Fahrenheit value just the same. The honest answer is to make the
difference visible in the data (`{ celsius: 0.0 }` is not `{ fahrenheit: 0.0 }`), and to
say the things a shape cannot. TypeScript's tool for that is the branded type, which is a
compile-time fiction again. TJS's tool is a predicate, which runs:

```tjs:inline
Type Percent {
  description: 'a percentage, from 0 to 100'
  example: 50.0
  predicate { return Percent >= 0 && Percent <= 100 }
}

function discounted(price: 80.0, off: Percent): 40.0 {
  return price * (1 - off / 100)
}

console.log(discounted(80, 25))
console.log(discounted(80, 250))
```

Inside a `Type` block the type's name stands for the value being tested, so
`Percent >= 0 && Percent <= 100` reads as the definition it is.

### JSON at the boundary is unchecked

The previous three are one problem seen from three sides. Every TypeScript program has a
boundary where untyped data becomes typed data, and at that boundary the type system has
nothing to say. Teams solve it by adding a second type system: Zod, io-ts, Ajv, a
hand-written validator. Now each type is written twice, in two languages, and the two copies
drift.

The quietest form of the problem is equality. `==` between a string and a number is a
compile error in TypeScript, when it can see both types. When the string came from
`JSON.parse`, it cannot, and JavaScript's coercion decides:

```ts:inline
/* @tjs TjsStrict */

const fromTheWire = JSON.parse('"5"')
console.log('JSON "5" == 5?', fromTheWire == 5)
```

Under `tsc` that prints `true`. In TJS `==` never converts one type to another, so a string
is never equal to a number, whether or not anyone knew the types in advance.
[TJS vs TypeScript](../../docs/tjs-vs-typescript.md) runs this comparison, and the others in
this book, through `tsc --strict` and TJS on every test run.
[Validating JSON at the Boundary](ts-json-boundary.md) is the practical chapter.

<!-- TODO review -->

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
is a rule TypeScript cannot state at all, because an index signature gives every key the
same type and a mapped type needs the keys listed in advance: _every key that starts with
`is` holds a boolean._

```tjs:inline
Type Flags {
  description: 'every key starting with "is" holds a boolean'
  example: {}
  predicate(o) {
    return Object.entries(o).every(([k, v]) =>
      k.startsWith('is') ? typeof v === 'boolean' : true
    )
  }
}

function render(props: Flags) {
  return Object.keys(props).join(', ')
}

console.log(render({ isOpen: true, title: 'Menu' }))
console.log(render({ isOpen: 'yes' }))
```

The cost is real: a predicate is checked when the program runs, not when it compiles.
TypeScript would reject some of these mistakes before you ran anything. The argument of
this book is that the mistakes that matter most are in values you cannot see at compile
time, and that a check which runs is worth more than a proof about a value that never
arrives.

<!-- TODO review -->

## Examples as contracts

What TJS keeps instead of an erased type is an example. One example does four jobs:

```tjs:inline
function add(a: 2, b: 3): 5 {
  return a + b
}

console.log(add(10, 20))
console.log(add('10', 20))
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
the literal type `5`. It is an example, and `a: 2` accepts every integer. When you want a
return type without a worked example, write `:!` (`function f(x: 0):! 0 { … }`); that is
what the converter writes for a TypeScript return type.

<!-- TODO review -->

## What TJS does not fix

- **Checks cost something.** Validating inputs at every call is not free. It is cheap
  next to the work most functions do, and you can skip it for one function with `!`
  (`function hot(! x: 0)`) when the data is already trusted.
- **Converted code keeps JavaScript's behaviour until you opt in.** A converted file is a
  faithful translation: it behaves exactly as the TypeScript compiler's output would,
  including `==` coercion and unchecked parameters. Checking starts when you graduate the
  file to native TJS, or mark it `TjsStrict`. See
  [Converting a TypeScript Project](ts-converting-a-project.md).
- **Generic relationships are not checked.** `function first<T>(xs: T[]): T` says the
  result has the type of the elements. TJS checks the values a function receives, not
  relationships between type parameters, so an unconstrained `T` becomes `any`.
- **Some type-level types have no runtime meaning.** Conditional and mapped types are kept
  verbatim for the `.d.ts` output, so TypeScript consumers still see them, but nothing is
  checked at run time for them.

<!-- TODO review -->

## How this book is organized

- [TJS vs TypeScript](../../docs/tjs-vs-typescript.md): the measured comparison. Every
  row is executed against `tsc --strict` and TJS.
- [TJS for TypeScript Programmers](../../TJS-FOR-TS.md): using TJS from a TypeScript
  codebase, and the syntax reference for migrating to it, with the TypeScript examples as
  its chapters.
- [Converting a TypeScript Project](ts-converting-a-project.md): `tjs convert`, the named
  escapes conversion writes, and graduation.
- [Validating JSON at the Boundary](ts-json-boundary.md): one type, written once, checked
  where the data comes in.
- The design notes: how generic types reach `.d.ts` output, and a post-mortem of seven
  months spent testing TypeScript's compiler instead of ours.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Generic .d.ts Emission: Design Notes](/generic-dts-design/)
- [Post-mortem: we spent seven months testing TypeScript's compiler](/postmortem-ts-emitter/)
<!-- /toc -->

<!-- prettier-ignore-end -->
