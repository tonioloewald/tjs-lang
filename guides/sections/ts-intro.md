<!--{"parent": "ts-examples.md", "order": 1}-->
<!-- TODO review -->

# Introduction

Start here. TypeScript's types vanish when it compiles, so data that arrives while the
program runs (an API response, parsed JSON, a form field) is never checked against them. A
`string` parameter that receives `42` goes on as if nothing were wrong. TJS keeps the types
in the compiled program and can check them on every call.

## From TypeScript to JavaScript, by way of TJS

The converter, `fromTS`, turns TypeScript into TJS, and TJS is then compiled to JavaScript.
On the command line it is `tjs convert` (`tjs convert --emit-tjs file.ts` prints the TJS in
between); on this site it runs for you on every TypeScript example.

Here is a TypeScript function and the TJS the converter writes for it:

```text
// TypeScript
function greet(names: string[], excited?: boolean): string {
  return `Hello, ${names.join(' and ')}${excited ? '!' : ''}`
}

// TJS, from fromTS
function greet(names: [string], excited: boolean | undefined):! string {
  return `Hello, ${names.join(' and ')}${excited ? '!' : ''}`
}
```

Three spellings changed, and the body did not:

- `string[]` became `[string]`. In TJS, `[string]` is an array of any length whose items are
  strings. It is not a TypeScript tuple.
- `excited?: boolean` became `excited: boolean | undefined`. The parameter is still
  optional; only the spelling differs.
- The return type became `:! string`. In native TJS a return annotation is a worked example
  that runs as a test when the file is compiled: `function add(a: 2, b: 3): 5` asserts that
  `add(2, 3)` is `5`. A TypeScript return type is a type, not an example, so the converter
  marks it `:!`, meaning "type only, do not test". (This `!` has nothing to do with
  TypeScript's non-null assertion.)

`names: [string]` and `:! string` are kept in the output as metadata: they document the
function and are available for checking. Keeping a type is not the same as checking it.

## Checking is a separate switch

By default a converted file is **faithful**: it behaves exactly as the compiled TypeScript
did at runtime, so converting a working program cannot break it. The types are carried
along, and nothing checks them. Called with `42` instead of an array, the faithful `greet`
above fails the way the original would, with `TypeError: names.join is not a function`.

One comment at the top of the file switches checking on:

```text
/* @tjs TjsStrict */
```

`TjsStrict` opts the file into full TJS, and every parameter type the converter kept
becomes a check that runs on every call. Called with `42`, the checked `greet` does not
throw. It returns a `MonadicError`, a value naming the parameter, the type it expected and
what it got, without running its body:

```text
MonadicError: Expected array of string for '<source>:2:greet.names', got number
```

[TypeScript Examples](/ts-examples/) explains what to do with that value. A check costs time
on each call, in proportion to the shape being checked: unnoticeable in a function that
does real work, measurable in a tiny one called in a hot loop. The
[TJS Performance Guide](/performance/) has the numbers and the way to skip a check.

## The examples

- **Hello TypeScript** is checked: one function with the `TjsStrict` line, and a bad call
  that comes back as an error instead of a wrong greeting.
- **Multiple Functions** is faithful: what conversion does to a whole file of functions
  that call each other, bad calls included.
- **Type Transformation** is about the converter rewriting annotations (not TypeScript's
  mapped or conditional types): how `string[]`, unions and return types come out in TJS,
  and the sample-value spelling hand-written TJS uses instead of type names.

<!-- prettier-ignore-start -->

<!-- toc -->
- [Hello TypeScript](/ts-hello-typescript/)
- [Multiple Functions](/ts-multiple-functions/)
- [Type Transformation](/ts-type-transformation/)
<!-- /toc -->

<!-- prettier-ignore-end -->
