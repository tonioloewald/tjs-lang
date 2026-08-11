# TJS Syntax Reference

This file is the detailed TJS syntax reference, extracted from CLAUDE.md for readability.
See CLAUDE.md for commands, architecture, and development patterns.

## Classes (Callable Without `new`)

TJS classes are wrapped to be callable without the `new` keyword:

```typescript
class Point {
  constructor(public x: number, public y: number) {}
}

const p1 = Point(10, 20) // the TJS way
const p2 = new Point(10, 20) // ERROR — see below
const p3 = unsafe new Point(10, 20) // deliberate, allowed
```

**`new` on a class declared in this file is an ERROR**, not a warning. `P(1)` and
`new P(2)` produce identical objects, so `new` was decoration with the look of
significance — and it was meanwhile a hard error for `Date`, which made the rule
"a suggestion for your own classes, a rule for built-ins".

Scoped to classes declared in the same source. For a **built-in**, `new` is
**mandatory** — `new Float32Array(4)` throws without it — so those are untouched:

```typescript
const buf = new Float32Array(4) // fine, and required
const s = new Set([1, 2]) // fine
```

The `wrapClass()` function in the runtime uses a Proxy to intercept calls and auto-construct. In `.tjs` all `class` declarations are wrapped; TS-originated code is not, unless it opts into full TJS with `TjsStrict`. Built-in constructors (`Boolean`, `Number`, `String`, etc.) and old-style `function` + `prototype` constructors are never touched because they may have intentional dual behavior (e.g., `Boolean(0)` returns `false` but `new Boolean(0)` returns a truthy wrapper object).

## Legacy equality — bridges back to JavaScript

TJS's `==` and `===` are fixed (see Equality Operators). A fixed **operator** has no
construct to mark — it is still spelled the same — so `unsafe` cannot help. The escape is a
**name**:

| function                      | is exactly JavaScript's…                                          |
| ----------------------------- | ----------------------------------------------------------------- |
| `DangerousLegacyEquals(a, b)` | `a == b` (coercion and all)                                       |
| `DangerousLegacyNot(a, b)`    | `a != b`                                                          |
| `LegacyExactly(a, b)`         | `a === b` (NaN is not itself; a boxed primitive is not its value) |
| `LegacyNotExactly(a, b)`      | `a !== b`                                                         |

```js
if (DangerousLegacyEquals(input, 0)) { … }   // yes, I want '' and false to match 0
```

`LegacyDefault(value)` is the same idea for parameter defaults. An object-literal default is
a **dictionary** in TJS — members defaulted individually, merged on a partial argument,
validated, excess keys stripped — where JavaScript treats it as one atomic value:

```js
function f(args = { x: 0, y: 0 }) {}                 // f({x:5}) → {x:5, y:0}
function f(args = LegacyDefault({ x: 0, y: 0 })) {}  // f({x:5}) → {x:5}
```

It applies to **one parameter**, which matters: the older escape marked the whole function
unsafe and disabled all of its validation, not just the merge.

**The names are deliberately long.** `dangerouslySetInnerHTML` is the model: the friction is
the feature. An escape should cost a moment's thought and be obvious in review, so there are
no short aliases and none should be added.

## `unsafe <expression>` — the per-construct escape

TJS's rules are **unconditional**: the file extension is the gate, the way ESM made
`"use strict"` implicit. There is no per-file dialing.

That works because a legitimate exception is expressible at the site:

```js
// `Timestamp` is the alternative — but this module IS Timestamp, so it must reach for Date.
const d = unsafe new Date(ts)
```

`unsafe` exempts **one construct**, not a file. That distinction is the point: a whole-file
opt-out also silences the _next_, accidental use. It has zero runtime cost — the marker is
removed before emit.

### In TypeScript source: `/* @tjs-unsafe */`

TJS-only syntax cannot appear in a `.ts` file — `tsc` rejects `unsafe new Date(x)` — so
TypeScript sources use the `@tjs` comment channel instead:

```ts
const d = /* @tjs-unsafe */ new Date(ts)   // tsc sees a comment; conversion sees `unsafe`
```

Conversion replaces the annotation **in place**, so the marker lands exactly where it was:
same line, immediately before its expression, which is what `unsafe` requires.

Two rules keep it from colliding with ordinary JavaScript, since a variable named `unsafe`
is legal JS and must stay legal (TJS ⊇ JS):

- It must be in **expression position**, so `obj.unsafe thing` is not a marker.
- It must be on the **same line** as its expression. `unsafe foo()` on one line is not valid
  JavaScript, so it can only be the marker; across a newline ASI makes `let r = unsafe` and
  `foo()` two statements, and those are left alone.

## Function Parameters

```typescript
// Required param with example value (colon shorthand)
function greet(name: 'Alice') { }        // name is required, type inferred as string

// Numeric type narrowing (all valid JS syntax)
function calc(rate: 3.14) { }            // number (float) -- has decimal point
function calc(count: 42) { }             // integer -- whole number
function calc(index: +0) { }             // non-negative integer -- + prefix

// Every numeric type also has a NAME. Same type, no worked value.
function calc(rate: float) { }           // ≡ 3.14  (explicit spelling of number)
function calc(count: int) { }            // ≡ 42     -- rejects a float
function calc(index: unsigned) { }       // ≡ +0     -- rejects a negative (alias: uint)

// And the sound TypeScript names are real runtime checks (0.13.0), agreeing
// exactly with the equivalent example: `s: string` ≡ `s: ''`.
function f(s: string, n: number, b: boolean, u: string | null) { }
// any/unknown/void/never stay unconstrained -- that is what they mean.
// An unresolvable type still degrades to best-effort, but now WARNS and shows
// the ladder back: an example (`x: 3`), a sound type (`x: number`), or a
// `Type … { predicate(v) { … } }`.

// Optional param with default
function greet(name = 'Alice') { }       // name is optional, defaults to 'Alice'

// Object-literal default = a dictionary (merge-on-partial), NOT an atomic default
function place(args = { x: 0, y: 0 }) { }
// place({ x: 5 })      -> { x: 5, y: 0 }   each member defaulted individually
// place({ x: 's' })    -> MonadicError     members are type-checked
// place({ x: 1, z: 9 })-> { x: 1, y: 0 }   excess keys stripped (+ recorder notice)
// Always on in .tjs; off under dialect:'js' / TjsCompat / fromTS.
// Full spec: docs/dictionary-defaults.md.
//
// To keep JavaScript's atomic default, narrowest escape first:
function place(args = LegacyDefault({ x: 0, y: 0 })) { }  // this ONE parameter
// …or mark the whole FUNCTION unsafe with a leading `!` in the param list
// (`function place(! args = {…}) {}`) — note that disables ALL of that
// function's validation, not just the merge — or set `dialect: 'js'` /
// `TjsCompat` for the whole file.

// Object parameter with shape
function createUser(user: { name: '', age: 0 }) { }

// Nullable type
function find(id: 0 | null) { }           // integer or null

// Optional TS-style
function greet(name?: '') { }            // same as name = ''

// Rest parameters — array example is the type (annotation stripped in JS output)
function sum(...nums: [0]) { }           // nums: array of integers
function log(...args: ['', 0, true]) { } // args: array<string | integer | boolean>
```

### Arrays

Both spellings work, and they mean the same thing:

```typescript
function f(xs: [0]) { return xs.length } // example: array of integers
function g(xs: number[]) { return xs.length } // TS suffix, rewritten to `[0.0]`
function h(xs: string[][]) { return xs.length } // nests
```

Item types are checked, not just arrayness — `g(['x'])` is a `MonadicError`. `int[]`
narrows where `number[]` deliberately does not, because `number` has to keep meaning
"any number" for pasted TypeScript.

Rest parameters use the same annotation and enforce the element type:

```typescript
function sum(...xs: number[]) { return xs.length }
// sum(1, 'x') -> MonadicError
// `...xs: number[] = [1]` is an ERROR: a rest param is always bound, to `[]`, so a
// default could never apply.
```

## Return Types

```typescript
// Return type annotation (colon syntax)
function add(a: 0, b: 0): 0 { return a + b }

// Object return type
function getUser(id: 0): { name: '', age: 0 } { ... }
```

## Safety Markers

```typescript
// Unsafe function (skips runtime validation)
function fastAdd(! a: 0, b: 0) { return a + b }

// Safe function (explicit validation)
function safeAdd(? a: 0, b: 0) { return a + b }

// Unsafe block
unsafe {
  // All calls in here skip validation
  fastPath(data)
}
```

## Bang Access (`!.`)

Asserted non-null member access. Returns a MonadicError if the target is null or undefined, and propagates existing MonadicErrors through chains.

```typescript
x!.foo // MonadicError if x is null/undefined, otherwise bare x.foo
x!.foo!.bar // propagates — if x!.foo is a MonadicError, x!.foo!.bar returns it
obj!.a!.b!.c // safe deep access, first null/error short-circuits the chain
```

Unlike optional chaining (`?.`), which silently returns `undefined`, bang access produces a trackable MonadicError on null/undefined. On other errors (e.g., accessing a property that throws), it throws as usual.

## Type Declarations

```typescript
// Simple type from example
Type Name 'Alice'

// Type with description and example
Type User {
  description: 'a user object'
  example: { name: '', age: 0 }
}

// Three spellings of a predicate. `=>` is the one-liner, `{ }` requires `return` (as in
// JavaScript), and the function form takes the value explicitly. In the first two the
// TYPE NAME binds to the value under test, so it reads as a definition:
Type Even {
  example: 2
  predicate => Even % 2 === 0
}

Type Positive {
  example: 1
  predicate { return Positive > 0 }
}

// Type with predicate (auto-generates type guard from example)
Type EvenNumber {
  description: 'an even number'
  example: 2
  predicate(x) { return x % 2 === 0 }
}
```

**Verified predicates (transpile-time).** A `Type` predicate body is run through
the predicate-safety verifier when it is transpiled. If it is **predicate-safe**
(pure and synchronous — no loops, `await`, `new`, or effectful/IO calls; iterate
with `every`/`some`/`map`/recursion), it compiles to a **fuel-bounded native
guard**: a runaway input can't hang or crash validation — it just returns `false`
("not a valid instance"). Native-TJS equality/`typeof` inside the predicate
(`==` → `Eq`, `typeof` → `TypeOf`, and `Is`/`IsNot`) still verifies. A predicate
that can't be verified (e.g. it uses a `for` loop or calls `fetch`) is **not
rejected** — it falls back to running as a plain function (TJS ⊇ JS). Prefer the
verifiable style so your type guards are safe to run on untrusted data.

## Generic Declarations

```typescript
// Simple generic
Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
}

// A predicate is OPTIONAL when the example says where the parameter goes — writing one
// would restate the example. This checks `T` at the `value` slot:
Type Box<T> {
  example: { value: T }
}

// Applying a parameterized type in an annotation:
function unbox(b: Box<int>) {
  return b.value
}
// unbox({ value: 1 })    -> 1
// unbox({ value: 1.5 })  -> MonadicError: Expected Box_int
//
// A primitive argument becomes a PREDICATE — `int` has no runtime binding, it compiles to
// an inline check — and predicates compose, so `Box<Box<int>>` works.

// Generic with default type parameter
Generic Container<T, U = ''> {
  description: 'container with label'
  predicate(obj, T, U) {
    return T(obj.item) && U(obj.label)
  }
}

// Generic with declaration block (for .d.ts emission)
// The declaration block contains TypeScript syntax emitted verbatim into .d.ts
// It is stripped from runtime JS output
Generic BoxedProxy<T> {
  predicate(x, T) { return typeof x === 'object' && T(x.value) }
  declaration {
    value: T
    path: string
    observe(cb: (path: string) => void): void
  }
}
```

## FunctionPredicate Declarations

First-class function types, completing the Type/Generic/FunctionPredicate triad:

```typescript
// Block form — declare a function type shape
FunctionPredicate Callback {
  params: { x: 0, y: 0 }
  returns: ''
}

// Function form — extract signature from existing function
FunctionPredicate Handler(existingFn, 'description')

// Return contracts:
// :   returns (standard)
// :!  assertReturns (throws on mismatch)
// :?  checkedReturns (wraps in MonadicError)
```

Runtime creates a `RuntimeType` that checks `typeof === 'function'`. The spec includes params, returns, and returnContract. In `fromTS`, TS function type aliases (`type Cb = (x: number) => void`) emit FunctionPredicate declarations automatically.

## Bare Assignments

```typescript
// Uppercase identifiers auto-get const
Foo = Type('test', 'example') // becomes: const Foo = Type(...)
MyConfig = { debug: true } // becomes: const MyConfig = { ... }
```

A **native-TJS** convenience only. It is **off** in
plain JS (`dialect: 'js'`), TS-originated, and VM code, so those pass through
unchanged (TJS ⊇ JS). It applies **only to the first assignment of an otherwise-
undeclared** uppercase name: a reassignment of an already-declared binding
(`let B = null; … B = 2`) is left untouched. Footgun: because the first
assignment becomes `const`, a later `Foo = …` in the same TJS file throws
(const reassignment) — declare `let Foo` up front if you need it mutable.

## Module Safety Directive

```typescript
// At top of file - sets default validation level
safety none     // No validation (metadata only)
safety inputs   // Validate function inputs (default)
safety all      // Validate everything (debug mode)
```

## The rules of `.tjs` (there are no mode directives)

**The file extension is the gate**, the way ESM made `"use strict"` implicit. A `.tjs` file
gets every rule, unconditionally. There is no per-file dial, and the nine mode directives
that used to provide one were removed on 2026-08-02 — writing one now is an error that
explains the replacement.

| rule                                                        | what `.tjs` does                                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| equality                                                    | `==`/`!=` are footgun-free — no coercion, boxed primitives unwrapped, `null == undefined` |
| `typeof`                                                    | `typeof null` is `'null'`                                                                 |
| truthiness                                                  | a boxed `new Boolean(false)` is falsy                                                     |
| statements                                                  | newlines terminate statements                                                             |
| classes                                                     | callable without `new` (additive — `new Point(1, 2)` still works)                         |
| `Date`                                                      | not allowed; `Timestamp`/`LegalDate` replace it                                           |
| `var`                                                       | not allowed; use `const`/`let`                                                            |
| `eval()`                                                    | not allowed; `Eval()` is the sandboxed form                                               |
| object-literal param defaults                               | dictionaries — per-member defaults, merged on partial, validated                          |
| a first bare assignment to an undeclared `Capitalised` name | becomes `const`                                                                           |

### Exceptions are expressed at the SITE, not per file

A whole-file opt-out would also silence the _next_, accidental use. So each escape marks one
construct:

| you need                              | write                                                      |
| ------------------------------------- | ---------------------------------------------------------- |
| a banned construct, deliberately      | `unsafe new Date(x)`, `unsafe var x = 1`, `unsafe eval(s)` |
| JavaScript's `==` / `!=`              | `DangerousLegacyEquals(a, b)` / `DangerousLegacyNot(a, b)` |
| JavaScript's `===` / `!==`            | `LegacyExactly(a, b)` / `LegacyNotExactly(a, b)`           |
| JavaScript's atomic parameter default | `args = LegacyDefault({ x: 0, y: 0 })`                     |
| any of the above, from a `.ts` file   | `/* @tjs-unsafe */`                                        |

### What is NOT a rule: dialect

Two directives survive, because they answer a different question — _which language is this?_

```typescript
TjsCompat // this file is JS-compatible: JS semantics, safety `none`
TjsStrict // this file is full TJS (useful in TS-originated source, where the default is off)
```

Plain JS (`dialect: 'js'`), TS-originated code (detected by the `/* tjs <- */` annotation)
and AJS/VM code all get JS semantics by default — otherwise TJS would stop being a superset
of JavaScript. Normally the file extension answers this and you write neither directive.

### Migrating is per-construct, not per-mode

The old ladder was "turn the rules off, then re-enable them one at a time". That is gone, and
what replaced it is finer: convert the file, then mark the individual sites that need the old
behaviour. The accidental use is still caught, where a modes-off file silenced it.

## Compile-Time Immutability (`const!`)

`const!` declares bindings whose properties cannot be mutated. Enforced at transpile time with zero runtime cost — emits as plain `const`.

```typescript
const! config = { debug: false, port: 8080 }
console.log(config.port)   // OK — reads are fine
config.debug = true        // ERROR at transpile time

const! items = [1, 2, 3]
items.map(x => x * 2)     // OK — non-mutating methods
items.push(4)              // ERROR — mutating method
```

Catches: property assignment, compound assignment (`+=`), increment/decrement, `delete`, and mutating array methods (`push`, `pop`, `splice`, `shift`, `unshift`, `sort`, `reverse`, `fill`).

When runtimes support records/tuples, `const!` can emit those instead.

## Literal Unions

A union whose members are **all literals of the same type** is a closed set of values, not
a union of their widened types:

```typescript
function setMode(m: 'on' | 'off') { return m }
// setMode('on')     -> 'on'
// setMode('maybe')  -> MonadicError: Expected "on" | "off"
```

This is the one place the examples model bends, and the line is **vacuity**. Read as
examples, `'a' | 'b'` widens to `string | string` — which means exactly what `''` means, so
it says nothing, and nobody writes it meaning "any string". A form that is empty under our
reading and obvious under the reader's is read the reader's way.

A union that _does_ say something under the example rule keeps the example rule:

```typescript
function f(x: 0 | '') { return x } // integer OR string — still a union of TYPES
// f(1) -> 1     f('s') -> 's'     f(true) -> MonadicError
```

**Membership is `==`, not `===`** — the union is pragmatic, not formal. Three consequences,
all deliberate:

```typescript
setMode(new String('on')) // a member: `==` unwraps boxed primitives
// `+0 | +1` is IDENTICAL to `0 | 1` — source-level narrowing does not survive into a value
// `1 | 1.0` is a ONE-member union — they are the same value
```

Use an `Enum` when the set wants a name, a description, and reverse lookup.

## Equality Operators

TJS fixes JavaScript's confusing `==` coercion without the performance cost of deep structural comparison. Always on in `.tjs`; see the Legacy bridges above for JavaScript's behaviour.

| Operator    | Meaning                                      | Example                            |
| ----------- | -------------------------------------------- | ---------------------------------- |
| `==`        | Honest equality (no coercion, unwraps boxed) | `new String('x') == 'x'` is `true` |
| `!=`        | Honest inequality                            | `0 != ''` is `true` (no coercion)  |
| `===`       | Identity (same reference)                    | `obj === obj` is `true`            |
| `!==`       | Not same reference                           | `{a:1} !== {a:1}` is `true`        |
| `a Is b`    | Deep structural equality (explicit)          | `{a:1} Is {a:1}` is `true`         |
| `a IsNot b` | Deep structural inequality (explicit)        | `[1,2] IsNot [2,1]` is `true`      |

```typescript
// == is honest: no coercion, unwraps boxed primitives
'foo' == 'foo'                    // true
new String('foo') == 'foo'        // true  (unwraps)
new Boolean(false) == false       // true  (unwraps)
null == undefined                 // true  (nullish equality preserved)
0 == ''                           // false (no coercion!)
false == []                       // false (no coercion!)

// == is fast: objects/arrays use reference equality (O(1))
{a:1} == {a:1}                    // false (different refs)
[1,2] == [1,2]                    // false (different refs)

// Is/IsNot for explicit deep structural comparison (O(n))
{a:1} Is {a:1}                    // true
[1,2,3] Is [1,2,3]               // true
new Set([1,2]) Is new Set([2,1]) // true  (Sets are order-independent)
```

**Implementation Notes:**

- **AJS (VM)**: The VM's expression evaluator (`src/vm/runtime.ts`) uses footgun-free `eqValue()` for `==`/`!=` — same semantics as TJS `Eq` (NOT structural). (Earlier the VM did deep structural comparison here; that early divergence was removed so AJS `==` matches TJS `==`.)
- **TJS (browser/Node)**: Source transformation converts `==` to `Eq()` and `!=` to `NotEq()` calls
- **`===` and `!==`**: Always preserved as identity checks, never transformed
- `Eq()`/`NotEq()` — fast honest equality (unwraps boxed primitives, nullish equality, reference for objects)
- `Is()`/`IsNot()` — deep structural comparison (arrays, objects, Sets, Maps, Dates, RegExps)

**Custom Equality Protocol:**

- `[tjsEquals]` symbol (`Symbol.for('tjs.equals')`) — highest priority, ideal for Proxies
- `.Equals` method — backward-compatible, works on any object/class
- Priority: symbol → `.Equals` → structural comparison
- `tjsEquals` is exported from `src/lang/runtime.ts` and available as `__tjs.tjsEquals`

## Honest typeof

In `.tjs`, `typeof null` returns `'null'` instead of `'object'` (JS's oldest bug). All other typeof results are unchanged. Transforms `typeof expr` to `TypeOf(expr)`.

## Honest Boolean Coercion

Raw JS: `Boolean(new Boolean(false)) === true` (a boxed primitive is an Object → truthy). Same trap for `if`, `!`, `&&`, `||`, `?:`, `while`, `for`, `do/while`. The spec's `ToBoolean` operation has no override hook (`Symbol.toPrimitive` doesn't fire for boolean coercion).

Native TJS rewrites every truthiness context to `__tjs.toBool(x)`, which unwraps boxed primitives before coercing. Always on — there is no legitimate opposite, so no escape is offered.

```typescript
Boolean(new Boolean(false))    // false  ✓
if (new Boolean(false)) ...    // does not enter  ✓
!new Boolean(false)            // true   ✓
new Boolean(false) || 'x'      // 'x'    ✓
new Boolean(false) ? 'a' : 'b' // 'b'    ✓
```

`&&` / `||` rewrites preserve JS's value-returning semantics (`a && b` returns `a` when falsy, else `b`). `??` is intentionally not touched (it checks null/undefined, not truthiness). `===` / `!==` are not touched (use `Is` for structural).

See [`guides/footguns.md`](guides/footguns.md) for the broader list of JS footguns TJS fixes, with a runnable example at [`examples/js-footguns-fixed.tjs`](examples/js-footguns-fixed.tjs).

## `@tjs` Annotations in TypeScript Source

TypeScript files can include `/* @tjs ... */` comments that `fromTS` uses to enrich
the TJS output. The TS compiler ignores them as regular comments.

```typescript
/* @tjs TjsStrict */ // Opt TS-originated code into full TJS semantics
/* @tjs-unsafe */ // Mark the next construct as a deliberate exception
/* @tjs-skip */ // Skip this declaration entirely
/* @tjs example: { name: 'Alice' } */ // Custom example value for Type
/* @tjs predicate(x) { return x > 0 } */ // Custom runtime predicate
/* @tjs declaration { value: T } */ // Declaration block for Generic .d.ts
```

`TjsStrict` is emitted at the top of the `.tjs` output. It is useful for TS-originated
code, which gets JS semantics by default, to opt in to full TJS. `/* @tjs-unsafe */`
becomes the `unsafe` marker — the bridge that lets a `.ts` file express an exception
that `tsc` would otherwise reject.

## Polymorphic Functions

Multiple function declarations with the same name are merged into a dispatcher:

```typescript
function area(radius: 3.14) {
  return Math.PI * radius * radius
}
function area(w: 0.0, h: 0.0) {
  return w * h
}

area(5) // dispatches to variant 1 (one number)
area(3, 4) // dispatches to variant 2 (two numbers)
```

Dispatch order: arity first, then type specificity, then declaration order. Ambiguous signatures (same types at same arity) are caught at transpile time.

## Polymorphic Constructors

Classes can have multiple constructor signatures:

```typescript
class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }
  constructor(coords: { x: 0.0; y: 0.0 }) {
    this.x = coords.x
    this.y = coords.y
  }
}

Point(3, 4) // variant 1
Point({ x: 10, y: 20 }) // variant 2 (both produce correct instanceof)
```

The first constructor becomes the real JS constructor; additional variants become factory functions using `Object.create`.

## Local Class Extensions

Add methods to built-in types without prototype pollution:

```typescript
extend String {
  capitalize() { return this[0].toUpperCase() + this.slice(1) }
}

extend Array {
  last() { return this[this.length - 1] }
}

'hello'.capitalize()  // 'Hello' — rewritten to __ext_String.capitalize.call('hello')
[1, 2, 3].last()      // 3
```

- Methods are rewritten to `.call()` at transpile time for known-type receivers (zero overhead)
- Runtime fallback via `registerExtension()`/`resolveExtension()` for unknown types
- Arrow functions rejected (need `this` binding)
- Multiple `extend` blocks for same type merge left-to-right
- File-local only — no cross-module leaking

## WASM Blocks

TJS supports inline WebAssembly for performance-critical code. WASM blocks are compiled at transpile time and embedded as base64 in the output.

### Syntax

```typescript
const add = wasm (a: i32, b: i32): i32 {
  local.get $a
  local.get $b
  i32.add
}
```

### Features

- **Transpile-time compilation**: WASM bytecode is generated during transpilation, not at runtime
- **WAT comments**: Human-readable WebAssembly Text format is included as comments above the base64
- **Type-safe**: Parameters and return types are validated
- **Self-contained**: Compiled WASM is embedded in output JS, no separate .wasm files needed

### Output Example

The transpiler generates code like:

```javascript
/*
 * WASM Block: add
 * WAT (WebAssembly Text):
 *   (func $add (param $a i32) (param $b i32) (result i32)
 *     local.get 0
 *     local.get 1
 *     i32.add
 *   )
 */
const add = await (async () => {
  const bytes = Uint8Array.from(atob('AGFzbQEAAAA...'), (c) => c.charCodeAt(0))
  const { instance } = await WebAssembly.instantiate(bytes)
  return instance.exports.fn
})()
```

### SIMD Intrinsics (f32x4)

WASM blocks support explicit SIMD via `f32x4_*` intrinsics:

```typescript
const scale = wasm (arr: Float32Array, len: 0, factor: 0.0): 0 {
  let s = f32x4_splat(factor)
  for (let i = 0; i < len; i += 4) {
    let off = i * 4
    let v = f32x4_load(arr, off)
    f32x4_store(arr, off, f32x4_mul(v, s))
  }
} fallback {
  for (let i = 0; i < len; i++) arr[i] *= factor
}
```

Available: `f32x4_load`, `f32x4_store`, `f32x4_splat`, `f32x4_extract_lane`, `f32x4_replace_lane`, `f32x4_add`, `f32x4_sub`, `f32x4_mul`, `f32x4_div`, `f32x4_neg`, `f32x4_sqrt`.

### Zero-Copy Arrays: `wasmBuffer()`

`wasmBuffer(Constructor, length)` allocates typed arrays directly in WASM linear memory. When passed to a `wasm {}` block, these arrays are zero-copy — no marshalling overhead.

```typescript
// Allocate in WASM memory (zero-copy when passed to wasm blocks)
const xs = wasmBuffer(Float32Array, 50000)

// Works like a normal Float32Array from JS
xs[0] = 3.14
for (let i = 0; i < xs.length; i++) xs[i] = Math.random()

// Zero-copy in WASM blocks — data is already in WASM memory
function process(! xs: Float32Array, len: 0, delta: 0.0) {
  wasm {
    let vd = f32x4_splat(delta)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      f32x4_store(xs, off, f32x4_add(f32x4_load(xs, off), vd))
    }
  } fallback {
    for (let i = 0; i < len; i++) xs[i] += delta
  }
}

// After WASM runs, JS sees mutations immediately (same memory)
```

- Regular `Float32Array` args are copied in before and out after each WASM call
- `wasmBuffer` arrays skip both copies (detected via `buffer === wasmMemory.buffer`)
- Uses a bump allocator — allocations persist for program lifetime (no deallocation)
- All WASM blocks in a file share one `WebAssembly.Memory` (64MB / 1024 pages)
- Supports `Float32Array`, `Float64Array`, `Int32Array`, `Uint8Array`

### Current Limitations

- No imports/exports beyond the function itself
- `wasmBuffer` allocations are permanent (bump allocator, no free)
