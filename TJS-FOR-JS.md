<!--{"section": "tjs-for-js", "group": "docs", "order": 0, "navTitle": "TJS for JS Devs"}-->

# TJS for JavaScript Programmers

_Everything you already know, plus the things you always wished JavaScript had._

---

## The One-Sentence Pitch

TJS is JavaScript with types that actually exist at runtime, equality that actually works, and errors that don't crash your program.

---

## What Stays the Same

TJS is a superset of JavaScript. All of this works exactly as you expect:

```javascript
const x = 42
let name = 'Alice'
const items = [1, 2, 3].map((n) => n * 2)
const user = { name: 'Bob', age: 30 }
const { name: userName, age } = user
const merged = { ...defaults, ...overrides }
const greeting = `Hello, ${name}!`

for (const item of items) {
  console.log(item)
}
while (condition) {
  /* ... */
}
if (x > 0) {
  /* ... */
} else {
  /* ... */
}

try {
  riskyThing()
} catch (e) {
  handleError(e)
}

class Dog {
  #name
  constructor(name) {
    this.#name = name
  }
  get name() {
    return this.#name
  }
}

import { something } from './module.js'
export function myFunction() {
  /* ... */
}
```

The _syntax_ above is all valid TJS. But note the next section: when you transpile **native TJS**, TJS also _improves_ some runtime behaviour (footgun-free `==`, honest truthiness, …). Those improvements are exactly the point of writing TJS — but they would change the meaning of existing JavaScript.

So TJS gates them on a **dialect**:

```javascript
import { tjs } from 'tjs-lang/lang'

tjs(jsSource) //                    → native TJS (improvements ON — the default)
tjs(jsSource, { dialect: 'js' }) // → plain JS  (semantics preserved, untouched)
```

For file-based tools, the extension is the dialect — `.js`/`.mjs` ⇒ `dialect: 'js'`, `.tjs` ⇒ native. Use the canonical helper so every tool agrees:

```javascript
import { tjs, dialectForFilename } from 'tjs-lang/lang'
tjs(source, { dialect: dialectForFilename(filename) })
```

Handling `.ts` too (a doc system, a bundler plugin)? Route the TS path through `fromTS`, imported from its own entry so the TypeScript compiler only loads when you actually transpile TS — `tjs-lang/lang` itself stays TS-free:

```javascript
import { tjs, sourceKindForFilename } from 'tjs-lang/lang'
import { fromTS } from 'tjs-lang/lang/from-ts' // TS compiler — only on the ts path

const kind = sourceKindForFilename(filename) // 'js' | 'ts' | 'tjs'
const code =
  kind === 'ts'
    ? tjs(fromTS(source, { emitTJS: true }).code).code
    : tjs(source, { dialect: kind }).code
```

With `dialect: 'js'` (or a `.js` file), if you don't use any TJS features your code is just JavaScript — same behaviour, no lock-in.

This extends to advanced patterns too: **Proxies**, **WeakMap/WeakSet**, **Symbols**, **generators**, **async iterators**, **`Object.defineProperty`** — all work identically. TJS adds type checks at function boundaries; it doesn't wrap or intercept any JS runtime behavior.

---

## What's Different

### 1. Types Are Example Values

In JavaScript, there are no types. In TJS, you annotate parameters with
an example of a valid value:

```javascript
// JavaScript
function greet(name) {
  return `Hello, ${name}!`
}

// TJS - name is required and must be a string (like 'World')
function greet(name: 'World'): '' {
  return `Hello, ${name}!`
}
```

The `: 'World'` means "required, must be a string, here's an example." The `: ''` means "returns a string." These aren't abstract type annotations -- they're concrete values the system can use for testing, documentation, and validation.

| You Write         | TJS Infers                    |
| ----------------- | ----------------------------- |
| `name: 'Alice'`   | Required string               |
| `count: 42`       | Required integer              |
| `rate: 3.14`      | Required number (float)       |
| `age: +20`        | Required non-negative integer |
| `flag: true`      | Required boolean              |
| `items: [0]`      | Required integer[]            |
| `values: [0.0]`   | Required number[]             |
| `user: { n: '' }` | Required object               |
| `id: 0 \|\| null` | integer or null               |

All of these are valid JavaScript expressions. `42` vs `42.0` vs `+42` are
all legal JS -- TJS leverages this to distinguish integer, float, and
non-negative integer types at the syntax level.

Note: `|| null` means the value accepts the base type _or_ `null`, but not
`undefined`. TJS treats `null` and `undefined` as distinct types
(`typeOf(null) === 'null'`, `typeOf(undefined) === 'undefined'`).

**Optional** parameters use `=` (just like JS default values):

```javascript
function greet(name = 'World') {
  /* ... */
} // optional, defaults to 'World'
function retry(count = 3) {
  /* ... */
} // optional, defaults to 3 (integer)
```

**The difference:** `: value` means required. `= value` means optional with a default. In plain JS, both would be written as `= value`.

### 2. Numeric Type Narrowing

TJS distinguishes three numeric types using valid JavaScript syntax:

```javascript
function process(
  rate: 3.14,    // number (float) -- has a decimal point
  count: 42,     // integer -- whole number, no decimal
  index: +0      // non-negative integer -- prefixed with +
) { /* ... */ }
```

| You Write | Type Inferred          | Validates                       |
| --------- | ---------------------- | ------------------------------- |
| `3.14`    | `number` (float)       | Any number                      |
| `0.0`     | `number` (float)       | Any number                      |
| `42`      | `integer`              | `Number.isInteger(x)`           |
| `0`       | `integer`              | `Number.isInteger(x)`           |
| `+20`     | `non-negative integer` | `Number.isInteger(x) && x >= 0` |
| `+0`      | `non-negative integer` | `Number.isInteger(x) && x >= 0` |
| `-5`      | `integer`              | `Number.isInteger(x)`           |
| `-3.5`    | `number` (float)       | Any number                      |

These are all valid JavaScript expressions -- TJS just reads the syntax more
carefully than JS does. At runtime, passing `3.14` to a parameter typed as
integer returns a monadic error.

### 3. Return Type Annotations

TJS uses `:` for return types (same as TypeScript):

```javascript
// Returns an integer
function add(a: 0, b: 0): 0 {
  return a + b
}

// Returns an object with specific shape
function getUser(id: 0): { name: '', age: 0 } {
  return { name: 'Alice', age: 30 }
}
```

The return type example doubles as an automatic test. When you write `: 0`, TJS will call `add(0, 0)` at transpile time and verify the result is a number.

### 4. Equality That Works

JavaScript's `==` is notoriously broken (type coercion). TJS fixes `==` to be a
**footgun-free `===`** — and adds `Is` for deep structural comparison:

```javascript
// JavaScript
'5' == 5                    // true  (coercion — footgun!)
0 == false                  // true  (coercion — footgun!)
new Boolean(false) == false // false (boxed primitive — footgun!)

// TJS (footgun-free == is on by default)
'5' == 5                    // false (no coercion)
0 == false                  // false (no coercion)
new Boolean(false) == false // true  (unwraps boxed primitives)
null == undefined           // true  (nullish equality)
NaN == NaN                  // true  (JS gets this wrong)

// TJS == is NOT structural — distinct objects are distinct:
[1, 2] == [1, 2]            // false (different references)
{ a: 1 } == { a: 1 }        // false (different references)

// For deep structural comparison, use Is:
[1, 2] Is [1, 2]            // true (same structure)
{ a: 1 } Is { a: 1 }        // true (same structure)
```

TJS redefines the operators:

| Operator | JavaScript          | TJS                                                                                           |
| -------- | ------------------- | --------------------------------------------------------------------------------------------- |
| `==`     | Coercive equality   | Footgun-free `===` (no coercion, unwraps boxed, `null==undefined`); NOT structural — use `Is` |
| `!=`     | Coercive inequality | Negation of the above                                                                         |
| `===`    | Strict equality     | Identity (same ref) — unchanged from JS                                                       |
| `!==`    | Strict inequality   | Not same reference — unchanged from JS                                                        |

For deep structural comparison, use the explicit forms `Is` and `IsNot`:

```javascript
user Is expectedUser       // structural deep equality
result IsNot errorValue    // structural deep inequality
```

Classes can define custom equality:

```javascript
class Point {
  constructor(x: 0, y: 0) { this.x = x; this.y = y }
  Equals(other) { return this.x === other.x && this.y === other.y }
}

Point(1, 2) Is Point(1, 2)  // true, uses .Equals
```

Note: `Is` (structural comparison) does not handle circular references. Use `==`
or `===` for objects that might be circular, or define an `.Equals` method.

### 5. Errors Are Values, Not Exceptions

In JavaScript, type errors crash your program. In TJS, they're values:

```javascript
function double(x: 0): 0 {
  return x * 2
}

double(5) // 10
double('oops') // { $error: true, message: "Expected number for 'double.x', got string" }
```

No `try`/`catch`. No crashes. The caller gets a clear error value they can inspect:

```javascript
const result = double(input)
if (result?.$error) {
  console.log(result.message) // handle gracefully
} else {
  useResult(result)
}
```

Errors propagate automatically through function calls. If you pass a monadic error to another TJS function, it passes through without executing:

```javascript
const a = step1(badInput) // MonadicError
const b = step2(a) // skips execution, returns the same error
const c = step3(b) // skips again -- error flows to the surface
```

This is sometimes called "railway-oriented programming."

### 6. Classes Without `new`

TJS classes are callable as functions:

```javascript
// JavaScript
const p = new Point(10, 20)

// TJS - both work, but the clean form is preferred
const p1 = Point(10, 20) // works
const p2 = new Point(10, 20) // also works (linter warns)
```

This is cleaner and more consistent with functional style. Under the hood, TJS uses a Proxy to auto-construct when you call a class as a function.

### 7. `const` for Free

Uppercase identifiers automatically get `const`:

```javascript
// TJS
Config = { debug: true, version: '1.0' }
MaxRetries = 3

// Transpiles to
const Config = { debug: true, version: '1.0' }
const MaxRetries = 3
```

Lowercase identifiers behave normally. This is a **native-TJS** feature — it's
off when you transpile a plain-JS file (`dialect: 'js'`), so JS keeps its own
semantics. It also only applies to the **first** assignment of an
otherwise-undeclared uppercase name: `let B = null; … B = 2` (a reassignment) is
left alone. Since the first assignment becomes a `const`, use `let Foo = …` up
front if `Foo` needs to change later — otherwise a later `Foo = …` throws.

---

## The Type System

JavaScript has no type system. Libraries like Zod and Ajv bolt one on,
but they're separate from your function signatures -- a second source of
truth that drifts. TJS's `Type()` built-in gives you as much narrowing
and specificity as you want, in one place, using plain functions you
already know how to write.

### From Simple to Sophisticated

```javascript
// Simple -- infer type from an example value
Type Name 'Alice'                            // any string

// Descriptive -- add documentation
Type User {
  description: 'a registered user'
  example: { name: '', age: 0, email: '' }
}

// Constrained -- add a predicate for narrowing
Type PositiveNumber {
  description: 'a number greater than zero'
  example: 1
  predicate(x) { return typeof x === 'number' && x > 0 }
}

// Domain-specific -- real business rules
Type USZipCode {
  description: '5-digit US zip code'
  example: '90210'
  predicate(v) { return typeof v === 'string' && /^\d{5}$/.test(v) }
}

Type Email {
  description: 'email address'
  example: 'user@example.com'
  predicate(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) }
}
```

The key insight: a `predicate` is just a function that returns `true` or
`false`. If you can express a constraint as a boolean check, you can make
it a type. No schema DSL to learn, no special syntax -- it's JavaScript
all the way down.

Types work in function signatures:

```javascript
function sendWelcome(email: Email, name: Name): '' {
  return `Welcome, ${name}! Confirmation sent to ${email}.`
}

sendWelcome('alice@example.com', 'Alice') // works
sendWelcome('not-an-email', 'Alice') // MonadicError
```

TJS also ships common types out of the box: `TString`, `TNumber`,
`TBoolean`, `TInteger`, `TPositiveInt`, `TNonEmptyString`, `TEmail`,
`TUrl`, `TUuid`, `Timestamp`, `LegalDate`. No imports from a validation
library needed.

### Combinators

Compose types from other types:

```javascript
Type OptionalEmail Nullable(Email)         // Email | null
Type UserIds TArray(TPositiveInt)           // array of positive integers
```

### Unions and Enums

```javascript
// Union of string literals
Union Status 'task status' 'pending' | 'active' | 'done'

// Enum with named members
Enum Color 'CSS color' {
  Red = 'red'
  Green = 'green'
  Blue = 'blue'
}

// Discriminated union -- like tagged unions or sum types
const Shape = Union('kind', {
  circle: { radius: 0 },
  rectangle: { width: 0, height: 0 }
})
```

### Generics

Runtime-checkable generic types:

```javascript
Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
}

// Instantiate with a concrete type
const NumberBox = Box(TNumber)
NumberBox.check({ value: 42 })     // true
NumberBox.check({ value: 'nope' }) // false
```

---

## Runtime Metadata

Every TJS function carries its type information at runtime via `__tjs`:

```javascript
function createUser(input: { name: '', age: 0 }): { id: 0 } {
  return { id: 123 }
}

createUser.__tjs
// {
//   params: { input: { type: { kind: 'object', shape: {...} }, required: true } },
//   returns: { type: { kind: 'object', shape: { id: { kind: 'number' } } } }
// }
```

This metadata enables autocomplete from live objects, automatic documentation
generation, and runtime reflection -- things that require build tools and
external libraries in vanilla JavaScript.

---

## Safety Levels

You control how much validation TJS applies:

```javascript
// Per-module (top of file)
safety none     // Metadata only -- no runtime checks (fastest)
safety inputs   // Validate inputs only (default)
safety all      // Validate everything (debug mode)

// Per-function
function fastPath(! x: 0) { /* ... */ }   // Skip validation
function safePath(? x: 0) { /* ... */ }   // Force validation
```

Use `!` (skip validation) only in hot loops where every microsecond counts
and the data source is already trusted. In all other cases, the ~1.5x
overhead of `safety inputs` is negligible compared to the bugs it catches.

### Unsafe Blocks

Skip validation for a hot inner loop:

```javascript
unsafe {
  for (let i = 0; i < million; i++) {
    hotFunction(data[i])
  }
}
```

---

## Inline Tests

Tests live next to the code they test and run at transpile time:

```javascript
function isPrime(n: 2): true {
  if (n < 2) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}

test 'prime detection' {
  expect(isPrime(2)).toBe(true)
  expect(isPrime(4)).toBe(false)
  expect(isPrime(17)).toBe(true)
}
```

Tests are stripped from production output. They're also generated
automatically from return type annotations -- `: true` means TJS will call
`isPrime(2)` and verify it returns a boolean.

---

## WASM Blocks

For compute-heavy code, drop into WebAssembly:

```javascript
const add = wasm (a: i32, b: i32): i32 {
  local.get $a
  local.get $b
  i32.add
}

add(1, 2)  // 3, runs as native WASM
```

WASM is compiled at transpile time and embedded as base64 in the output.
No separate `.wasm` files.

### Reusable WASM Functions

For a kernel that other files can import, use a top-level `wasm function`
declaration:

```javascript
export wasm function dot(a: Float32Array, b: Float32Array, n: i32): f64 {
  // ... SIMD f32x4 implementation ...
}
```

Other files can import it directly:

```javascript
import { dot } from './my-lib.tjs'
// `dot` is composed into your file's wasm module at transpile time
// — no JS↔WASM boundary on intra-library calls
```

The first stdlib built on this is `tjs-lang/linalg` — SIMD vector kernels
ready to use:

```javascript
import { dot, norm_sq } from 'tjs-lang/linalg'
const cos = dot(a, b, n) / Math.sqrt(norm_sq(a, n) * norm_sq(b, n))
```

See [`DOCS-WASM.md`](DOCS-WASM.md) for the full story — declaration syntax,
the JS-owns-memory model, cross-file composition, and the two distribution
forms (composed vs. boundary).

---

## Safe Eval

The killer feature for many use cases. Run untrusted code safely:

```javascript
import { Eval, SafeFunction } from 'tjs-lang/eval'

// One-shot evaluation
const { result } = await Eval({
  code: 'return items.filter(x => x > threshold)',
  context: { items: [1, 5, 10, 15], threshold: 7 },
  fuel: 1000,
})
// result: [10, 15]

// Reusable safe function
const transform = await SafeFunction({
  body: 'return x * multiplier',
  params: ['x'],
  fuel: 500,
})

await transform(21) // { result: 42, fuelUsed: 8 }
```

- Gas-limited (fuel runs out = execution stops, no infinite loops)
- Capability-based (no I/O unless you grant it)
- No `eval()`, no CSP violations, no containers

---

## What You Give Up

TJS is opinionated. Here's what changes:

| JavaScript                 | TJS                           | Why                             |
| -------------------------- | ----------------------------- | ------------------------------- |
| `==` (type coercion)       | `==` (footgun-free `===`)     | Coercion is a bug factory       |
| Exceptions for type bugs   | Monadic error values          | Exceptions escape, values don't |
| `new ClassName()`          | `ClassName()` preferred       | Cleaner, more functional        |
| No runtime types           | `__tjs` metadata on functions | Types should exist at runtime   |
| `typeof null === 'object'` | `typeOf(null) === 'null'`     | JS got this wrong in 1995       |

Nothing is taken away. `new` still works. `===` still works. You can write
plain JavaScript in a `.tjs` file and it works. The type-related additions
use explicit syntax (`:` annotations, `:` return types, `Type` declarations).
Behavioral modes like footgun-free `==`, callable classes, and honest
`typeof` are enabled by default in native TJS files. Use `TjsCompat` at the
top of a file to disable all modes for gradual migration or JS interop.

---

## Getting Started

```bash
npm install tjs-lang
```

### Try It in the Browser

The playground runs the full TJS compiler in your browser -- no backend needed:

**[tjs-platform.web.app](https://tjs-platform.web.app)**

### CLI

```bash
bun src/cli/tjs.ts check file.tjs   # Parse and type check
bun src/cli/tjs.ts run file.tjs     # Transpile and execute
bun src/cli/tjs.ts emit file.tjs    # Output transpiled JS
bun src/cli/tjs.ts test file.tjs    # Run inline tests
```

### From Code

```javascript
import { tjs } from 'tjs-lang'

const output = tjs`
  function add(a: 0, b: 0): 0 {
    return a + b
  }
`
```

---

## Runtime Traceability

Every TJS function carries its source identity in `__tjs` metadata.
When validation fails, the error tells you exactly which function and
parameter failed, in which source file:

```javascript
function add(a: 0, b: 0): 0 {
  return a + b
}

add.__tjs.source // "mymodule.tjs:3"
add('oops', 1) // MonadicError { path: "mymodule.tjs:3:add.a", expected: "integer", actual: "string" }
```

No source maps. No build artifacts. The function _knows where it came from_.

---

## Learn More

- [TJS Language Reference](DOCS-TJS.md) -- Full syntax and features
- [AJS Agent Language](DOCS-AJS.md) -- The sandboxed agent VM
- [TJS for TypeScript Programmers](TJS-FOR-TS.md) -- Coming from TypeScript?
- [Playground](https://tjs-platform.web.app) -- Try it live
