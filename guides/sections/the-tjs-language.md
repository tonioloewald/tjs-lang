<!--{"pin": "top", "order": 40, "book": ["default", "language"]}-->
<!-- TODO review -->

# The TJS Language

Why TJS exists, the rules it will not bend, the reference for its declarations and syntax,
and the design notes behind the harder decisions. The worked examples live elsewhere, in
[TJS Interactive Examples](/tjs-examples/) and its Basics, Patterns and Advanced sections;
this part is where you look things up and find out why they are the way they are.

## What a TJS signature tells you

The goal of this part is that you can read a signature like this one and say exactly what it
accepts, what it returns, and what it checks at runtime:

```tjs
function greet(name: 'Alice', times = 1): 'Hello, Alice!' {
  return 'Hello, ' + name + '!'.repeat(times)
}

console.log(greet('Bob'))     // Hello, Bob!
console.log(greet('Bob', 3))  // Hello, Bob!!!

// A wrong argument is a returned error, not a crash.
const result = greet(42)
console.log(result instanceof Error, result.message.includes('Expected string'))  // true true
```

`name: 'Alice'` is not a TypeScript literal type. The value after the colon is an
**example**: `name` is a required string, and `'Alice'` is one such string. `times = 1` is
an optional integer that defaults to `1`. The return annotation is a worked example as
well, and the compiler runs it: `greet('Alice')` must return `'Hello, Alice!'`, or the file
fails `tjs check`. Calling `greet(42)` does not throw; it returns an error value that
describes the mismatch. Every one of those rules is explained in the reference chapters
below.

## How to read this part

The chapters fall into three tiers. Read the first, keep the second at hand, and open the
third when a question about _why_ comes up.

### The argument

- [Why TJS](/why-tjs/) explains what earlier attempts to fix JavaScript left on the table,
  and what TJS does instead.
- [Design Principles & Invariants](/PRINCIPLES/) are the rules every later decision is held
  to, chiefly that TJS accepts every legal JavaScript program and every legal AJS program.
  When a rule elsewhere in the book looks strange, it is usually one of these invariants at
  work.

### The reference

- [Declarations](/declarations/) covers the types that survive to runtime: `Type`, `Enum`,
  `Union`, `Generic` and `FunctionPredicate`, how each is checked, and how they appear in a
  signature.
- The [TJS Syntax Reference](/TJS-SYNTAX/) lists every construct with a working example:
  parameter and return examples, safety markers, the rules a `.tjs` file follows (equality,
  `typeof`, `new`, `Date`) and the named escapes back to JavaScript's behaviour (`LegacyDate`,
  `DangerousLegacyEquals`, `LegacyDefault`, `LegacyTypeOf`), `given`, test blocks, errors and
  bang access, classes, polymorphic functions, `extend`, `const!`, modules, async functions
  and inline `wasm`.
- [Dictionary Defaults](/dictionary-defaults/) gets a chapter of its own because it is the
  one place where the same source means something different in TJS and in JavaScript: an
  object default is merged with a partial argument instead of being replaced by it. It is
  written as a design record; for the rules alone, read "Object shapes and dictionary
  defaults" in the syntax reference first.

### The design notes

These are for readers who want to know why a decision went the way it did, or who are about
to change one. None of them is needed to write TJS. Each is marked with where it stands,
because a design note and a description of shipped behaviour read alike.

| Note                                                           | Status                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Type identity](/type-identity/)                               | Current: a measured map of what ships today, checked by a test           |
| [Runtime fusion](/runtime-fusion/)                             | Decided and shipped for `MonadicError`; the rule covers the rest         |
| [North star: JSON-Schema + predicates](/type-system-north-star/) | Direction: a decision lens, possibly post-1.0                          |
| [FunctionPredicate: Design Notes](/function-predicate-design/) | Partly shipped: the declaration exists, but it checks only that a value is a function; signature checking is proposed |
| [Case study: fixing switch](/case-study-switch/)               | Shipped: `given` exists, and `switch` keeps C semantics with a warning   |
| [Small scoped parsers, not a rewrite](/parser-primitives/)     | Proposed, not started                                                    |
| [Ambient Contracts](/ambient-contracts/)                       | Exploratory: a design idea with experimental spikes, not built           |
| [Native Engine Integration](/native-engine-integration/)       | Exploratory: what native V8 or JavaScriptCore support could unlock       |

If you would rather learn by running code, start with [Hello TJS](/hello-tjs/) and the
[TJS Interactive Examples](/tjs-examples/), and come back here when a question comes up.

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
