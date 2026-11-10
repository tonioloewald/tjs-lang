<!--{"pin": "top", "order": 40, "book": ["default", "language"]}-->
<!-- TODO review -->

# The TJS Language

Why TJS exists, the rules it will not bend, the reference for its declarations and syntax,
and the design notes behind the harder decisions. This part assumes you already write
JavaScript. The worked examples live elsewhere, in
[TJS Interactive Examples](/tjs-examples/) and its Basics, Patterns and Advanced sections;
this part is where you look things up and find out why they are the way they are.

Where to start depends on you:

- **New to programming?** Start with [Learn to Program](/learn-to-program/), which teaches
  from scratch in the page. Come back here once you are comfortable.
- **You write JavaScript and want to start coding:** read [Hello TJS](/hello-tjs/), then
  keep the [TJS Syntax Reference](/TJS-SYNTAX/) at hand.
- **You want the reasoning first:** read [Why TJS](/why-tjs/), then
  [Design Principles & Invariants](/PRINCIPLES/).

## What a TJS signature tells you

The goal of this part is that you can read a signature like this one and say exactly what it
accepts, what it returns, and what it checks at runtime:

```tjs
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

The chapters fall into three tiers: the argument for TJS, the reference you look things up
in, and the design notes you open when a question about _why_ comes up.

### The argument

- [Why TJS](/why-tjs/) explains what earlier attempts to fix JavaScript left on the table,
  and what TJS does instead.
- [Design Principles & Invariants](/PRINCIPLES/) are the rules every later decision is held
  to. The chief one: the TJS toolchain accepts every legal JavaScript program, read as
  JavaScript with the same meaning, and every legal program in
  [AJS](/ajs/), the sandboxed agent language built on the same syntax. The stricter rules
  apply only to `.tjs` files. When a rule elsewhere in the book looks strange, it is usually
  one of these invariants at work.

### The reference

- [Declarations](/declarations/) covers the types that exist while your program runs.
  TypeScript's types are erased when it compiles; these are values your code can check
  against. `Type` names a shape or a test, `Enum` a fixed set of names, `Union` a choice
  between values, `Generic` a type with parameters, and `FunctionPredicate` a function type.
- The [TJS Syntax Reference](/TJS-SYNTAX/) has every construct, each with a working example.
  A `.tjs` file fixes JavaScript's surprises in equality, `typeof`, `new` and `Date`, and the
  reference names an escape back to JavaScript's behaviour for each one.
- [Dictionary Defaults](/dictionary-defaults/) gets a chapter of its own because it is the
  one place where the same source means something different in TJS and in JavaScript: an
  object default is merged with a partial argument instead of being replaced by it. The
  chapter is a design record: it sets out the problem, the alternatives considered and why
  this one won. For the rules alone, read
  [Object shapes and dictionary defaults](/TJS-SYNTAX/#object-shapes-and-dictionary-defaults)
  in the syntax reference.

### The design notes

These are for readers who want to know why a decision went the way it did, or who are about
to change one. None of them is needed to write TJS. Each is marked with where it stands,
because a design note and a description of shipped behaviour read alike.

| Note                                                             | Status                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [Type identity](/type-identity/)                                 | Current: a map of how TJS checks types today, kept honest by a test       |
| [Runtime fusion](/runtime-fusion/)                               | Shipped for TJS's error type; the same rule decides what else is shared   |
| [North star: JSON-Schema + predicates](/type-system-north-star/) | Direction: where the type system is heading, possibly after 1.0           |
| [FunctionPredicate: Design Notes](/function-predicate-design/)   | Partly shipped: checks only that a value is a function                    |
| [Case study: fixing switch](/case-study-switch/)                 | Shipped: `given` exists; `switch` keeps its fall-through, with a warning  |
| [Small scoped parsers, not a rewrite](/parser-primitives/)       | Partly shipped: colon disambiguation is built, expression extent is not   |
| [Ambient Contracts](/ambient-contracts/)                         | Exploratory: a design idea with experimental spikes, not built            |
| [Native Engine Integration](/native-engine-integration/)         | Exploratory: what native V8 or JavaScriptCore support could unlock        |

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
