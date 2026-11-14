<!--{"pin": "top", "order": 40, "book": ["default", "language"]}-->
<!-- TODO review -->

# The TJS Language

The language in depth, one feature per chapter, for a reader who already writes JavaScript.
Each chapter starts with the problem a feature solves, shows it running, and then gives the
rules and the edge cases. The [TJS Syntax Reference](/TJS-SYNTAX/) is where you look a
construct up once you know it.

Where to start depends on you:

- **New to programming?** Start with [Learn to Program](/learn-to-program/), which teaches
  from scratch in the page. Come back here once you are comfortable.
- **You write JavaScript and want to start coding:** read
  [TJS: Typed JavaScript](/tjs/), the ten-minute tour, then come back here.
- **You want the reasoning first:** read [Why TJS](/why-tjs/), then
  [Design Principles & Invariants](/PRINCIPLES/).

## What a TJS signature tells you

The goal of this part is that you can read a signature like this one and say exactly what it
accepts, what it returns, and what it checks at runtime:

```tjs:inline
function greet(name: 'Alice', times = 1): 'Hello, Alice!' {
  return `Hello, ${name}${'!'.repeat(times)}`
}

console.log(greet('Bob'))     // Hello, Bob!
console.log(greet('Bob', 3))  // Hello, Bob!!!

// A wrong argument is a returned error, not a crash.
const result = greet(42)
console.log(isMonadicError(result))             // true
console.log(result.expected, result.actual)     // string number
console.log(isMonadicError(greet('Bob', 1.5)))  // true: times must be an integer
```

The value after a colon is an **example**: `name` is a required string, and `'Alice'` is one
such string. (If you know TypeScript: this is not a literal type, and `name` accepts any
string.) Every call checks `name` at runtime.

`times = 1` is an optional parameter that defaults to `1`. Its default is also its example,
and `1` is written without a decimal point, so `times` accepts only integers; `1.0` would
accept any number. When a caller passes `times`, it is checked on that call too, which is
why `greet('Bob', 1.5)` is refused.

The return annotation is a **worked example**. When the file is transpiled (by `tjs check`,
the command-line checker, or by a build), TJS calls `greet` with
the parameter examples, `name = 'Alice'` and `times = 1`, and the result must equal
`'Hello, Alice!'`. If it does not, the file fails to transpile. With a plain `:` the return
value is not checked again on later calls; write `:?` for that, or `:!` for a return type
with no test.

Calling `greet(42)` does not throw. It returns an error value, a `MonadicError`, that says
what was expected and what arrived; `isMonadicError(x)` is the way to test for one.

Each of these rules has a section in the syntax reference:
[parameters and defaults](/TJS-SYNTAX/#parameters),
[return annotations](/TJS-SYNTAX/#return-annotations) and
[errors](/TJS-SYNTAX/#errors).

## How to read this part

[Why TJS](/why-tjs/) comes first: what earlier attempts to fix JavaScript left on the table,
and what TJS does instead. Then one chapter per feature, in an order where each builds on the
last:

- [Declarations](/declarations/): the types that exist while your program runs.
- [Types by Example](/types-by-example/): how an example becomes a check, and the type
  declarations built on that.
- [Classes and Dispatch](/classes-and-dispatch/): classes without `new`, functions that
  choose by their arguments, local extensions, and `given`.
- [Safety and Validation](/safety-markers/): where TJS checks values, what that costs, and
  how to opt out.
- [Dictionary Defaults](/defaults/): options objects whose missing members are filled in.
- [Equality and the Footguns TJS Removes](/equality/): `==` that means what it says, and the
  other JavaScript surprises a `.tjs` file fixes.
- [Errors as Values](/errors-as-values/): errors returned, not thrown, and the flight
  recorder that remembers them.
- [Testing](/testing/): signatures that are tests, and test blocks.
- [Modules and Imports](/modules-and-imports/): files, dialects, imports with and without a
  bundler.
- [Inline WebAssembly](/inline-wasm/): WASM inside a function, compiled when the file is.
- [The Runtime](/runtime-configuration/): what runs a TJS program, and how to configure it.

<!--{ "only": "book" }-->
The appendices hold the [TJS Syntax Reference](/TJS-SYNTAX/), the
[TJS vs TypeScript](/tjs-vs-typescript/) table and the
[Design Principles & Invariants](/PRINCIPLES/): the rules every decision is held to. The chief
one is that TJS accepts every legal JavaScript program, with the same meaning; the stricter
rules apply only to `.tjs` files.
<!--{ "end": "only" }-->

<!--{ "only": "site" }-->
### The design notes

These are for readers who want to know why a decision went the way it did, or who are about
to change one. None of them is needed to write TJS, and they are not part of the book. Each is
marked with where it stands, because a design note and a description of shipped behaviour
read alike.

| Note                                                             | Status                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Dictionary Defaults: the design record](/dictionary-defaults/)  | Shipped: the problem, the alternatives and why merge-on-partial won       |
| [Type identity](/type-identity/)                                 | Current: a map of how TJS checks types today, kept honest by a test       |
| [Runtime fusion](/runtime-fusion/)                               | Shipped for TJS's error type; the same rule decides what else is shared   |
| [Shared runtime](/shared-runtime/)                               | Proposed, after 1.0: one runtime for many published libraries             |
| [North star: JSON-Schema + predicates](/type-system-north-star/) | Direction: where the type system is heading, possibly after 1.0           |
| [FunctionPredicate: Design Notes](/function-predicate-design/)   | Partly shipped: checks only that a value is a function                    |
| [Case study: fixing switch](/case-study-switch/)                 | Shipped: `given` exists; `switch` keeps its fall-through, with a warning  |
| [Small scoped parsers, not a rewrite](/parser-primitives/)       | Partly shipped: colon disambiguation is built, expression extent is not   |
| [Ambient Contracts](/ambient-contracts/)                         | Exploratory: a design idea with experimental spikes, not built            |
| [Native Engine Integration](/native-engine-integration/)         | Exploratory: what native V8 or JavaScriptCore support could unlock        |
<!--{ "end": "only" }-->

## All chapters in order

<!-- prettier-ignore-start -->

<!-- toc -->
- [Why TJS](/why-tjs/)
- [Design Principles & Invariants](/PRINCIPLES/)
- [Declarations](/declarations/)
- [TJS Syntax Reference](/TJS-SYNTAX/)
- [Dictionary Defaults (Merge-on-Partial Object Arguments)](/dictionary-defaults/)
- [Type identity: who answers "does this value satisfy this type?"](/type-identity/)
- [Runtime fusion: what may be shared between TJS modules, and what may not](/runtime-fusion/)
- [North star: JSON-Schema + predicates as the single source of truth for types](/type-system-north-star/)
- [FunctionPredicate: Design Notes](/function-predicate-design/)
- [Case study: fixing switch](/case-study-switch/)
- [Small scoped parsers, not a rewrite](/parser-primitives/)
- [Ambient Contracts — probe reality, derive verified predicate contracts](/ambient-contracts/)
- [Native Engine Integration: TJS in V8 or JavaScriptCore](/native-engine-integration/)
<!-- /toc -->

<!-- prettier-ignore-end -->
