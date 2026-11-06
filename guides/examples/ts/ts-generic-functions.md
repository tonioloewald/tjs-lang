<!--{"section": "ts", "type": "example", "group": "advanced", "order": 1, "parent": "ts-advanced.md"}-->
<!-- TODO review -->

# Generic Functions

Generics convert as far as values can show them; the converter marks what it had to drop.

A generic type parameter is a promise about a relationship: `identity<T>(value: T): T` says
the result has the same type as the argument, whatever that type is. A runtime check looks
at one value at a time. It can see that `items` is an array, but not that the result has the
same type as `items[0]`. So TJS keeps what a value can show and marks plainly what it could
not convert.

Every TypeScript example in this book goes through the TS→TJS converter (`fromTS`) before it
runs. Converted code keeps JavaScript's behaviour by default: the annotations it writes
describe the code, and become runtime checks only when the file opts in with `TjsStrict`
(shown below). This first example runs exactly as it would in TypeScript; what changes is in
the TJS the converter writes.

```ts:inline
// Generic functions: TJS keeps what a value can show.
// An unconstrained type parameter loses its type, and the converter marks
// each one with a "TS types degraded" comment in the TJS it writes.

function identity<T>(value: T): T {
  return value
}

function first<T>(items: T[]): T | undefined {
  return items[0]
}

function wrap<T>(value: T): { value: T } {
  return { value }
}

// These work at runtime
console.log('identity(42):', identity(42))
console.log('identity("hello"):', identity('hello'))
console.log('first([1,2,3]):', first([1, 2, 3]))
console.log('wrap({ x: 1 }):', wrap({ x: 1 }))
```

## What the converter writes

In TJS, a parameter's annotation is an example value, not a type: `name: ''` means "a
string", and `count: 0` means "an integer". See
[the core idea: types as examples](../../../TJS-FOR-TS.md#the-core-idea-types-as-examples).
For the three functions above, `fromTS` writes this TJS (leaving out the `/* line N */`
comments it adds to map errors back to the TypeScript source):

```tjs:static
/* TODO: TS types degraded — value: T, return: T */
function identity(value) {
    return value;
}

/* TODO: TS types degraded — return: T | undefined */
function first(items: [any]) {
    return items[0];
}

/* TODO: TS types degraded — value: T */
function wrap(value):! { value: any } {
    return { value };
}
```

- **What can be described, is kept.** `first` still declares that `items` is an array:
  `[any]` is TJS for "an array of anything" (an example array, not a one-element tuple).
  Only the element type is unknown. `wrap` keeps the shape of its result, `{ value: any }`.
- **The rule.** A bare `T` is dropped, so `identity`'s `value` has no annotation and accepts
  anything. A structure containing `T` keeps its structure, with `any` in place of `T`
  (`T[]` becomes `[any]`). A return type that is only `T` (or `T | undefined`) is left out.
- **What cannot be kept, is marked.** Each `TODO: TS types degraded` comment names a parameter or
  return that lost its type. Search the converted code for them: they are the places where
  TypeScript was carrying information that TJS now does not check. The end of this page
  says what to do with each one.
- **`:!` means type-only.** A TJS return annotation is normally a worked example that is
  tested (`add(a: 2, b: 3): 5`). A TypeScript return type is a type, not an example, so the
  converter writes `:!`, which describes the result without testing it.

## A constraint is information

`<T extends { id: number }>` tells the converter what every item must look like, so it uses
the constraint as the example instead of `any`. `<T = string>` works the same way: the
default becomes the example.

```text
function firstId<T extends { id: number }>(items: T[]): number    // TypeScript
function firstId(items: [{ id: 0.0 }]):! number                   // converted TJS

function label<T = string>(value: T): string                      // TypeScript
function label(value: ''):! string                                // converted TJS
```

`number` becomes `0.0`, the TJS example for "any number" (`0` would mean an integer).

These annotations are checked only when the file opts in. `/* @tjs TjsStrict */` is a
per-file comment that turns the converted file into full TJS, including runtime input
validation (see [Turn on checks for one TypeScript file](../../../TJS-FOR-TS.md#turn-on-checks-for-one-typescript-file)).
With it, a bad item is rejected where it enters, and the message says which member was
wrong. A rejected call does not throw: it returns an error value, which you test with
`instanceof Error`. So `firstId`, declared to return a `number`, can hand back something
that is not a number, and the caller has to look.

```ts:inline
// Opt in to full TJS, so converted types become runtime checks.
/* @tjs TjsStrict */

// A constraint is information: the converter checks every item against it.
function firstId<T extends { id: number }>(items: T[]): number {
  return items[0].id
}

console.log('firstId([{ id: 7, name: "a" }]):', firstId([{ id: 7, name: 'a' }]))

const bad = firstId([{ id: 'seven' }] as any)
console.log('id "seven" rejected:', bad instanceof Error)
console.log('message:', bad.message)

// An unconstrained parameter still checks the part it can see: the array.
function first<T>(items: T[]): T | undefined {
  return items[0]
}

console.log('first(["x", 1, null]):', first(['x', 1, null]))
console.log('first("abc") rejected:', first('abc' as any) instanceof Error)
```

The message is `Expected number for '<source>:5:firstId.items[0].id', got string`: the
source location (line 5 of the example), then the path to the member that was wrong. The
extra `name` member on the good item is accepted: the constraint says what an item must
have, not everything it may have, as in TypeScript. Remove the `TjsStrict` line and both bad
calls run unchecked: `firstId` returns `'seven'` and `first('abc')` returns `'a'`.

## The gotcha

TJS has generic types (`Type Box<T>`, below) but not generic functions: a function can take
a `Box<string>`, but it cannot be generic over `T` itself. It does not need to be to run this
code: these functions work on any value, which is exactly what `any` says. What is lost is the _relationship_. If
your TypeScript leaned on `T` to promise "what comes out is what went in", nothing checks that
promise after conversion; the degraded-types comments show you where it was.

Where you want a _container_ whose contents are checked, TJS has parameterized types instead,
and they do check at run time. `Type Name<T> { example: … }` declares a checkable type from an
example, and the example says where the parameter goes (`value: T`). `int` is TJS's integer
type, the one the example `0` stands for. `test '…' { }` is an inline test that runs when the
file is checked. Parameterized types compose:

```tjs:inline
// The TypeScript `interface Box<T> { value: T }`, as a TJS type that checks.
Type Box<T> {
  example: { value: T }
}

function describe(b: Box<string>) {
  return 'contents: ' + b.value
}

// Parameterized types compose: a box holding a box of integers.
function unwrapTwice(b: Box<Box<int>>) {
  return b.value.value
}

console.log(describe({ value: 'crate 7' }))
console.log(unwrapTwice({ value: { value: 3 } }))
console.log('describe(7) rejected:', describe({ value: 7 }) instanceof Error)
console.log('inner 2.5 rejected:', unwrapTwice({ value: { value: 2.5 } }) instanceof Error)

test 'Box<T> checks what goes in the value slot' {
  expect(describe({ value: 'a' })).toBe('contents: a')
  expect(describe({ value: 7 }) instanceof Error).toBe(true)
  expect(unwrapTwice({ value: { value: 2.5 } }) instanceof Error).toBe(true)
}
```

For each `TODO: TS types degraded` comment in converted code:

- If `T` has a shape, add a constraint (`<T extends { id: number }>`); the converter then
  checks every value against it.
- If `T` is a container's contents, declare the container as a parameterized `Type`, as with
  `Box<T>` above, and annotate the function with it.
- If `T` is only a relationship ("what comes out is what went in"), no runtime check can see
  it. Leave the comment: it records that the promise is now unchecked.

For the other declaration form, `Generic` (which takes a function that checks each value),
and for what the converter does with a generic `interface`, see the
[Generics section of TJS for TypeScript Programmers](../../../TJS-FOR-TS.md#generics).
