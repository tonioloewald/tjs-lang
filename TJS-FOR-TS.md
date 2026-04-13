<!--{"section": "tjs-for-ts", "group": "docs", "order": 0, "navTitle": "TJS for TS Devs"}-->

# TJS for TypeScript Programmers

_What if your types didn't disappear at runtime?_

---

TypeScript is great. It catches bugs at compile time, makes refactoring safer,
and gives you autocomplete. But it has a fundamental limitation: types are
fiction. They exist only in your editor, and they vanish completely at runtime.

TJS starts from a different premise: **types are example values that survive
to runtime**. This gives you everything TypeScript gives you, plus runtime
validation, reflection, documentation, inline tests of private methods, and traceability of errors back to source code -- from a single source of truth.

This guide is split into two paths:

1. **[Using TJS from TypeScript](#part-1-using-tjs-from-typescript)** -- Keep your TS codebase, use TJS for safe eval and agent execution
2. **[Migrating to TJS](#part-2-migrating-to-tjs)** -- Convert your codebase from TypeScript to TJS

---

# Part 1: Using TJS from TypeScript

You don't have to rewrite anything. TJS provides tools you can use directly
from your TypeScript codebase.

## Safe Eval

The most common reason to reach for TJS from TypeScript: running untrusted
code safely.

```typescript
import { Eval, SafeFunction } from 'tjs-lang/eval'

// Run user-provided code with a gas limit
const { result, fuelUsed } = await Eval({
  code: userCode,
  context: { items: data, threshold: 10 },
  fuel: 1000,
  capabilities: {
    fetch: sandboxedFetch, // your whitelist-wrapped fetch
  },
})

// Or create a reusable safe function
const transform = await SafeFunction({
  body: 'return items.filter(x => x.price < budget)',
  params: ['items', 'budget'],
  fuel: 500,
})

const { result } = await transform(products, 100)
```

No `eval()`. No CSP violations. No Docker containers. The code runs in a
fuel-metered sandbox with only the capabilities you inject.

## Agent VM

Build and execute JSON-serializable agents:

```typescript
import { ajs, AgentVM } from 'tjs-lang'

// Parse agent source to JSON AST
const agent = ajs`
  function analyze({ data, query }) {
    let filtered = data.filter(x => x.score > 0.5)
    let summary = llmPredict({
      prompt: 'Summarize findings for: ' + query,
      data: filtered
    })
    return { query, summary, count: filtered.length }
  }
`

// Execute with resource limits
const vm = new AgentVM()
const { result } = await vm.run(
  agent,
  { data, query },
  {
    fuel: 1000,
    timeoutMs: 5000,
    capabilities: { fetch: myFetch, llm: myLlm },
  }
)
```

The agent AST is JSON. You can store it in a database, send it over the
network, version it, diff it, audit it.

## Type-Safe Builder

Construct agents programmatically with full TypeScript support:

```typescript
import { Agent, AgentVM, s } from 'tjs-lang'

const pipeline = Agent.take(s.object({ url: s.string, maxResults: s.number }))
  .httpFetch({ url: { $kind: 'arg', path: 'url' } })
  .as('response')
  .varSet({
    key: 'results',
    value: {
      $expr: 'member',
      object: { $expr: 'ident', name: 'response' },
      property: 'items',
    },
  })
  .return(s.object({ results: s.array(s.any) }))

const vm = new AgentVM()
const { result } = await vm.run(
  pipeline.toJSON(),
  { url, maxResults: 10 },
  {
    fuel: 500,
    capabilities: { fetch },
  }
)
```

## TypeScript Entry Points

TJS is tree-shakeable. Import only what you need:

```typescript
import { Agent, AgentVM, ajs, tjs } from 'tjs-lang' // Everything
import { Eval, SafeFunction } from 'tjs-lang/eval' // Safe eval only
import { tjs, transpile } from 'tjs-lang/lang' // Language tools
import { fromTS } from 'tjs-lang/lang/from-ts' // TS -> TJS converter
```

## When to Stay in TypeScript

If your codebase is TypeScript and you're happy with it, you probably only
need TJS for:

- Running user-provided or LLM-generated code safely
- Building agents that travel over the network
- Adding runtime type validation at system boundaries
- Eval without `eval()`

You don't need to migrate anything. The libraries work from TypeScript.

---

# Part 2: Migrating to TJS

If you want the full TJS experience -- runtime types, structural equality,
monadic errors, inline tests -- here's how to convert.

## The Core Idea: Types as Examples

TypeScript describes types abstractly. TJS describes them concretely:

```typescript
// TypeScript: what TYPE is this?
function greet(name: string): string { ... }

// TJS: what's an EXAMPLE of this?
function greet(name: 'World'): '' { ... }
```

`'World'` tells TJS: this is a string, it's required, and here's a valid
example. The example doubles as documentation and test data.

## Conversion Reference

### Primitives

```typescript
// TypeScript                    // TJS
name: string                     name: ''
count: number                    count: 0.0       // float (any number)
index: number                    index: 0         // integer
age: number                      age: +0          // non-negative integer
flag: boolean                    flag: true
items: string[]                  items: ['']
nested: number[][]               nested: [[0]]
```

**Important:** The example value determines the _type_, not a literal
constraint. `name: 'World'` means "required string" -- not "must be the
string `'World'`." Any string passes validation. The example is there for
documentation, testing, and type inference. Think of it as `string` with
a built-in `@example` tag.

**Numeric precision:** TJS distinguishes three numeric types using valid
JavaScript syntax that JS itself ignores:

| You Write | TJS Type               | Runtime Check                   |
| --------- | ---------------------- | ------------------------------- |
| `3.14`    | `number` (float)       | Any number                      |
| `0.0`     | `number` (float)       | Any number                      |
| `42`      | `integer`              | `Number.isInteger(x)`           |
| `0`       | `integer`              | `Number.isInteger(x)`           |
| `+20`     | `non-negative integer` | `Number.isInteger(x) && x >= 0` |
| `+0`      | `non-negative integer` | `Number.isInteger(x) && x >= 0` |

TypeScript's `number` is a single type. TJS gives you three levels of
precision -- all using expressions that are already legal JavaScript.
The automatic converter maps TypeScript `number` to `0.0` (float) to
preserve the widest behavior; you can then narrow manually to `0` (integer)
or `+0` (non-negative integer) where appropriate.

### Optional Parameters

```typescript
// TypeScript                    // TJS
function f(x?: string) {}
function f(x = '') {}
function f(x: string = 'hi') {}
function f(x = 'hi') {}
```

In TypeScript, `?` means optional with type `string | undefined`.
In TJS, `= value` means optional with that default. Same semantics, less syntax.

### Object Shapes

```typescript
// TypeScript
function createUser(opts: { name: string; age: number; email?: string }) {}

// TJS
function createUser(opts: { name: '', age: 0, email = '' }) {}
```

Required properties use `:`, optional ones use `=`.

### Return Types

```typescript
// TypeScript                              // TJS
function add(a: number, b: number): number    function add(a: 0, b: 0): 0
function getUser(): { name: string }          function getUser(): { name: '' }
function fetchData(): Promise<string[]>       function fetchData(): ['']
```

The `fromTS` converter unwraps `Promise<T>` in return type annotations --
you annotate the resolved type, not the wrapper. This only applies when
converting from TypeScript; in native TJS you just write normal
`async`/`await` and annotate what the function resolves to.

The return annotation also generates an automatic test: `add(0, 0)` must
return a number. If it doesn't, you get an error at transpile time.

### Interfaces and Type Aliases

```typescript
// TypeScript
interface User {
  name: string
  age: number
  email?: string
}

type Status = 'active' | 'inactive' | 'banned'

// TJS
Type User {
  description: 'a registered user'
  example: { name: '', age: 0, email = '' }
}

Union Status 'account status' 'active' | 'inactive' | 'banned'
```

### Enums

```typescript
// TypeScript
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}

// TJS
Enum Color 'CSS color' {
  Red = 'red'
  Green = 'green'
  Blue = 'blue'
}
```

### Classes

```typescript
// TypeScript
class Point {
  private x: number
  private y: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  distanceTo(other: Point): number {
    return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2)
  }
}

const p = new Point(10, 20)

// TJS
class Point {
  #x
  #y

  constructor(x: 0, y: 0) {
    this.#x = x
    this.#y = y
  }

  distanceTo(other: Point): 0 {
    return Math.sqrt((this.#x - other.#x) ** 2 + (this.#y - other.#y) ** 2)
  }
}

const p = Point(10, 20) // no 'new' needed
```

Key differences:

- `private` is stripped by default (TS `private` is compile-time only).
  With `TjsClass` (on by default in native TJS, add via `/* @tjs TjsClass */` for TS-originated code), `private` converts to `#` (true JS runtime privacy).
- Type annotations become example values
- With `TjsClass`, `new` is optional (linter warns against it)

### Generics

TJS takes a different approach to generics. TypeScript has function-level
type parameters (`<T>`) that vanish at runtime. TJS has `Generic` declarations
that produce runtime-checkable type constructors:

```typescript
// TypeScript -- compile-time only, gone at runtime
function identity<T>(x: T): T { return x }
interface Box<T> { value: T }

// TJS -- no function-level generics; use Generic for container types
Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
}

// Usage: Box(Number) is a runtime type checker
const isNumberBox = Box(Number)
isNumberBox({ value: 42 })     // true
isNumberBox({ value: 'nope' }) // false
```

For simple generic functions like `identity` or `first`, you don't need
generics at all -- just skip the type parameter. TJS validates the
concrete types at call sites, not the abstract relationship between them.

```javascript
// Simple -- no generics needed, the function just works
function first(arr: [0]) { return arr[0] }

// If you need runtime-checked containers, use Generic
Generic Pair<T, U> {
  description: 'a typed pair'
  predicate(x, T, U) { return T(x[0]) && U(x[1]) }
}
```

When converting from TypeScript, the `fromTS` converter preserves generic
metadata but types become `any`. This is a place where manual review helps.

### Nullability

```typescript
// TypeScript
function find(id: number): User | null { ... }

// TJS
function find(id: 0): { name: '', age: 0 } || null { ... }
```

TJS distinguishes `null` from `undefined` -- they're different types, just
as `typeOf(null)` returns `'null'` and `typeOf(undefined)` returns
`'undefined'`. Writing `|| null` means the value can be the base type or
`null`, but not `undefined`. Optional parameters (using `=`) accept
`undefined` because that's what you get when the caller omits the argument.

## What TypeScript Has That TJS Doesn't

TJS intentionally skips TypeScript features that don't survive to runtime
or add complexity without proportional value:

| TypeScript Feature          | TJS Equivalent                              |
| --------------------------- | ------------------------------------------- |
| `interface`                 | `Type` with example                         |
| `type` aliases              | `Type`, `Union`, or `Enum`                  |
| Conditional types           | Preserved in `.d.ts` via declaration blocks |
| Mapped types                | Preserved in `.d.ts` via declaration blocks |
| `keyof`, `typeof`           | Use runtime `Object.keys()`, `typeOf()`     |
| `Partial<T>`, `Pick<T>`     | Define the shape you need directly          |
| Declaration files (`.d.ts`) | Generated from `__tjs` metadata (`--dts`)   |
| `as` type assertions        | Not needed (values are checked)             |
| `any` escape hatch          | `safety none` per-module or `!` per-fn      |
| Decorators                  | Not supported                               |
| `namespace`                 | Use modules                                 |

The philosophy: if a type feature doesn't do something at runtime, it's
complexity without payoff.

### But What About Narrowing?

TypeScript's type system is Turing-complete. You can express astonishing
constraints -- `Pick<Omit<T, K>, Extract<keyof T, string>>` -- but the
resulting types are often harder to understand than the code they describe.
And they vanish at runtime, so they can't protect you from bad API data.

TJS takes the opposite approach: `Type()` gives you a predicate function.
If you can write a boolean expression, you can define a type. No type-level
programming language to learn.

```javascript
// TypeScript: branded types + manual validation
type Email = string & { __brand: 'email' }
function isEmail(s: string): s is Email {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}
function validateEmail(input: string): Email {
  if (!isEmail(input)) throw new Error('Invalid email')
  return input
}

// TJS: one line, works at runtime
Type Email {
  description: 'email address'
  example: 'user@example.com'
  predicate(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) }
}
```

The TJS `Type()` built-in handles everything from simple shapes to
sophisticated domain constraints:

```javascript
// Simple -- infer from example
Type Name 'Alice'                          // string

// Constrained -- predicate narrows beyond the base type
Type PositiveInt {
  description: 'a positive integer'
  example: 1
  predicate(v) { return typeof v === 'number' && Number.isInteger(v) && v > 0 }
}

// Domain-specific -- readable business rules
Type USZipCode {
  description: '5-digit US zip code'
  example: '90210'
  predicate(v) { return typeof v === 'string' && /^\d{5}$/.test(v) }
}

// Combinators -- compose types
Type OptionalEmail Nullable(Email)         // Email | null

// Schema-based -- use tosijs-schema for structured validation
Type AgeRange {
  description: 'valid age'
  example: 25
  predicate(v) { return typeof v === 'number' && v >= 0 && v <= 150 }
}
```

Compare the TypeScript equivalents:

| What you want       | TypeScript                                                  | TJS                                    |
| ------------------- | ----------------------------------------------------------- | -------------------------------------- |
| String with format  | Branded type + type guard + validation function             | `Type Email { predicate(v) {...} }`    |
| Number in range     | Branded type + manual check                                 | `Type Age { predicate(v) {...} }`      |
| Non-empty string    | Template literal type (compile-only)                        | `Type NonEmpty { predicate(v) {...} }` |
| Nullable variant    | `T \| null` (compile-only)                                  | `Nullable(MyType)` (runtime-checked)   |
| Union of literals   | `'a' \| 'b' \| 'c'` (compile-only)                          | `Union Status 'a' \| 'b' \| 'c'`       |
| Discriminated union | `type Shape = { kind: 'circle' } \| ...` + manual narrowing | `Union('kind', { circle: {...} })`     |
| Generic container   | `interface Box<T>` (compile-only)                           | `Generic Box<T> { predicate(...) }`    |

Every row in the TypeScript column is compile-time fiction that disappears
when your code runs. Every row in the TJS column is a runtime check that
actually catches bugs in production. And the TJS versions are shorter,
because a predicate is just a function -- not a type-level program.

TJS also ships common types out of the box: `TString`, `TNumber`,
`TBoolean`, `TInteger`, `TPositiveInt`, `TNonEmptyString`, `TEmail`,
`TUrl`, `TUuid`, `Timestamp`, `LegalDate`. No imports from a validation
library needed.

### Tooling Comparison

| Concern             | TypeScript                         | TJS                                                                    |
| ------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| **Type checking**   | `tsc` (compile-time only)          | Runtime validation (survives build)                                    |
| **Runtime schemas** | Zod / io-ts / Ajv (separate)       | Built-in (types _are_ schemas)                                         |
| **Linting**         | ESLint + plugins                   | Built-in linter (unused vars, unreachable code, no-explicit-new)       |
| **Testing**         | Vitest / Jest (separate files)     | Inline `test` blocks (transpile-time)                                  |
| **Equality**        | Reference-based only               | Honest `==` (no coercion), `Is`/`IsNot` (structural), `===` (identity) |
| **Build toolchain** | tsc + bundler (webpack/Vite/etc)   | Transpiles in-browser, no build step                                   |
| **Debugging**       | Source maps (brittle, build bloat) | Functions carry source identity via `__tjs` metadata                   |
| **Documentation**   | JSDoc / TypeDoc (manual)           | Generated from `__tjs` metadata                                        |
| **Editor support**  | Mature (VSCode, etc)               | Monaco/CodeMirror/Ace + VSCode/Cursor extensions                       |

## What TJS Has That TypeScript Doesn't

### Runtime Validation

TypeScript:

```typescript
// Types are a promise. A lie, if the data comes from outside.
function processOrder(order: Order) {
  // If order came from an API, nothing guarantees it matches Order.
  // You need Zod/io-ts/ajv AND the TypeScript type AND keep them in sync.
}
```

TJS:

```javascript
// Types are checked at runtime. One source of truth.
function processOrder(order: { items: [{ id: 0, qty: 0 }], total: 0 }): {
  status: '',
} {
  // If order doesn't match, caller gets a MonadicError -- no crash.
}
```

### Honest Equality

TypeScript inherits JavaScript's broken equality. Native TJS fixes this by default. For TS-originated code, add the `TjsEquals` directive (or use `/* @tjs TjsEquals */` in the source `.ts` file):

```javascript
TjsEquals  // needed for TS-originated code; native TJS has this on by default

// == is honest: no coercion, unwraps boxed primitives
0 == ''                           // false (JS: true!)
[] == ![]                         // false (JS: true!)
new String('foo') == 'foo'        // true  (unwraps boxed)
null == undefined                 // true  (useful pattern preserved)
typeof null                       // 'null' (JS: 'object')

// == is fast: O(1) reference equality for objects/arrays
{a: 1} == {a: 1}                 // false (different refs)
[1, 2] == [1, 2]                 // false (different refs)

// Is/IsNot for explicit deep structural comparison (O(n))
{a: 1} Is {a: 1}                 // true
[1, 2, 3] Is [1, 2, 3]           // true
new Set([1,2]) Is new Set([2,1]) // true (Sets are order-independent)

// === unchanged: identity check
obj === obj                       // true (same reference)
```

`==` fixes coercion without the performance cost of deep comparison.
Use `Is`/`IsNot` when you explicitly need structural comparison.

### Monadic Errors

TypeScript uses exceptions. TJS uses values:

```javascript
// TypeScript -- you have to remember to try/catch
function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}
// Caller forgets try/catch? Crash.

// TJS -- errors flow through the pipeline
function divide(a: 0, b: 0): 0 {
  if (b === 0) return MonadicError('Division by zero')
  return a / b
}
// Caller gets an error value. No crash. Ever.
```

**How the caller handles it:**

```javascript
// Option 1: Check the result
const result = divide(10, 0)
if (result instanceof Error) {
  console.log(result.message) // 'Division by zero'
} else {
  useResult(result)
}

// Option 2: Just keep going -- errors propagate automatically
const a = divide(10, 0) // MonadicError
const b = double(a) // Receives error, returns it immediately (skips execution)
const c = format(b) // Same -- error flows through the whole chain
// c is still the original MonadicError from divide()
```

If you've used Rust's `Result<T, E>` or Haskell's `Either`, the pattern
is familiar. The key difference from TypeScript: you never have to guess
whether a function might throw. Type errors and validation failures are
always values, never exceptions.

### Inline Tests

```javascript
function fibonacci(n: 0): 0 {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

test 'fibonacci sequence' {
  expect(fibonacci(0)).toBe(0)
  expect(fibonacci(1)).toBe(1)
  expect(fibonacci(10)).toBe(55)
}
```

Tests run at transpile time. They're stripped from production output.
No separate test files, no test runner configuration.

### Safety Controls

```javascript
safety none       // This module: skip all validation (performance)
safety inputs     // This module: validate inputs only (default)
safety all        // This module: validate everything (debug)

// Per-function overrides
function hot(! x: 0) {}   // Skip validation even if module says 'inputs'
function safe(? x: 0) {}  // Force validation even if module says 'none'
```

Use `!` (skip validation) only in hot loops where every microsecond counts
and the data source is already trusted. In all other cases, the ~1.5x
overhead of `safety inputs` is negligible compared to the bugs it catches.

#### Additional Safety Features

```javascript
TjsNoVar              // var declarations are syntax errors
const! config = {}    // Compile-time immutability (zero runtime cost)

// Debug mode: make type errors visible
import { configure } from 'tjs-lang/lang'
configure({ logTypeErrors: true })   // console.error on every type error
configure({ throwTypeErrors: true }) // throw instead of returning MonadicError
```

TypeScript has no equivalent to most of these. You're either all-in on
types or you use `as any` to escape.

---

## Automatic Conversion

TJS includes a TypeScript-to-TJS converter that has been validated against
the tosijs production codebase (35 files, 523 tests passing):

```bash
# Convert a single file
bun src/cli/tjs.ts convert input.ts --emit-tjs > output.tjs

# Convert a directory (produces .js + .d.ts + .md per file)
bun src/cli/tjs.ts convert src/ -o tjs-out/

# Emit JavaScript directly
bun src/cli/tjs.ts convert input.ts > output.js
```

From code:

```typescript
import { fromTS } from 'tjs-lang/lang/from-ts'

const result = fromTS(tsSource, { emitTJS: true })
console.log(result.code) // TJS source
```

### What `fromTS` Handles

- Primitive annotations (`string`, `number`, `boolean`) → example values
- Interfaces → `Type` declarations with declaration blocks for `.d.ts` round-tripping
- Generic interfaces → `Generic` with predicates + declaration blocks
- Conditional/mapped types → preserved verbatim in declaration blocks
- Function type aliases → `FunctionPredicate` declarations (including generics)
- String literal unions → `Union`
- Enums → `Enum`
- Rest parameters (`...args: T[]`) → preserved with `...` prefix
- Nullable types (`T | null`) → proper null guards in runtime checks
- Optional params, default values
- `private` → stripped (or `#` with `TjsClass`)
- Static getters/setters → `static` keyword preserved
- `Promise<T>` → unwrapped return types
- DOM types (130+) → `{}` (opaque object, keeps params annotated)
- JSDoc comments → TDoc comments
- Exported constants → type-inferred `.d.ts` entries

### `@tjs` Annotations in TypeScript

Annotate your `.ts` files with `/* @tjs ... */` comments to enrich
the TJS output. The TS compiler ignores them.

```typescript
/* @tjs TjsClass TjsEquals */ // Enable TJS modes (off by default in TS-originated code)

/* @tjs-skip */ // Skip this type declaration
export type Unboxed<T> = T extends { value: infer U } ? U : T

/* @tjs predicate(x, T) { return typeof x === 'object' && T(x.value) } */
export interface Box<T> {
  value: T
}

/* @tjs example: { name: 'Alice', age: 30 } */
export interface User {
  name: string
  age: number
}

/* @tjs declaration { value: T; path: string } */
export interface BoxedProxy<T> {
  /* complex conditional type */
}
```

### `.d.ts` Generation

The DTS emitter produces TypeScript declarations from TJS transpilation:

```bash
bun src/cli/tjs.ts emit input.tjs  # emits .js, .d.ts, .md
```

- **Interfaces with declaration blocks** → `export interface Name<T> { ... }`
- **Conditional/mapped types** → `export type Name<T> = ...` (verbatim TS body)
- **Function types** → `export type Name = (...) => T`
- **Simple type aliases** → `export type Name = original TS body`
- **Constants** → `export declare const Name: type`
- **Functions** → `export declare function Name(params): returnType`
- **Classes** → callable function + class declaration

### Constrained Generics

When the converter encounters a constrained generic like
`<T extends { id: number }>`, it uses the constraint shape as the
example value instead of falling back to `any`. This means:

```typescript
// TypeScript
function first<T extends { id: number }>(items: T[]): T {
  return items[0]
}

// Converted TJS — uses constraint shape, not 'any'
function first(items: [{ id: 0.0 }]):! { id: 0.0 } { ... }
```

Generic defaults also work: `<T = string>` uses `string` as the example.
Unconstrained generics (`<T>` with no `extends` or default) still degrade
to `any` — there's genuinely no information about what T is.

### What `fromTS` Can't Fully Express

TJS types are example values, not abstract type algebra. Some TypeScript
patterns have no direct TJS equivalent — but most now preserve their
original TS body for `.d.ts` round-tripping:

| TypeScript Pattern                          | What Happens                                          |
| ------------------------------------------- | ----------------------------------------------------- |
| Conditional types (`T extends U ? X : Y`)   | TS body preserved verbatim in `.d.ts`                 |
| Mapped types (`{ [K in keyof T]: ... }`)    | TS body preserved verbatim in `.d.ts`                 |
| Intersection types (`A & B`)                | TS body preserved verbatim in `.d.ts`                 |
| `Partial<T>`, `Required<T>`, `Pick`, `Omit` | Emits warning, uses base shape                        |
| `ReturnType<T>`, `Parameters<T>`            | Drops to `any`                                        |
| Template literal types (`` `${A}-${B}` ``)  | Becomes `string`                                      |
| Deeply nested generics (`Foo<Bar<U>>`)      | Inner params become `any`                             |
| `readonly`, `as const`                      | Stripped (use `const!` for compile-time immutability) |

The key improvement: complex types that can't be expressed as runtime
predicates are still preserved in the `.d.ts` output via declaration blocks.
The runtime code works with `any`, but TypeScript consumers of your library
get the full type information.

## Migration Strategy

### Incremental Adoption

You don't have to convert everything at once:

1. **Start at boundaries.** Convert API handlers and validation layers
   first -- these benefit most from runtime types.
2. **Convert hot modules.** Modules with frequent type-related bugs are
   good candidates.
3. **Leave internals for last.** Pure computational code that's already
   well-tested benefits least from migration.

### The Bun Plugin

If you use Bun, `.tjs` files work alongside `.ts` files with zero config:

```javascript
// bunfig.toml already preloads the TJS plugin
import { processOrder } from './orders.tjs' // just works
import { validateUser } from './users.ts' // also works
```

### What to Watch For

**Example values matter.** `count: 0` means "number, example is 0." If
your function breaks on 0 (division, array index), the automatic signature
test will catch it immediately. Choose examples that exercise the
happy path.

**Return types generate tests.** `: 0` means TJS will call your function
with the parameter examples and check the result. If your function has
side effects or requires setup, use `:! 0` to skip the signature test.

**Structural equality changes behavior.** If your code relies on `==`
for type coercion (comparing numbers to strings, etc.), you'll need to
update those comparisons. This is almost always a bug fix.

---

## Side-by-Side: A Complete Example

### TypeScript

```typescript
interface Product {
  id: string
  name: string
  price: number
  tags: string[]
}

interface CartItem {
  product: Product
  quantity: number
}

function calculateTotal(items: CartItem[], taxRate: number = 0.1): number {
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )
  return Math.round(subtotal * (1 + taxRate) * 100) / 100
}

function applyDiscount(
  total: number,
  code: string | null
): { final: number; discount: number } {
  const discounts: Record<string, number> = {
    SAVE10: 0.1,
    SAVE20: 0.2,
  }
  const rate = code ? discounts[code] ?? 0 : 0
  return {
    final: Math.round(total * (1 - rate) * 100) / 100,
    discount: rate,
  }
}
```

### TJS

```javascript
Type Product {
  description: 'a product in the catalog'
  example: { id: '', name: '', price: 0.0, tags: [''] }
}

Type CartItem {
  description: 'a product with quantity'
  example: { product: { id: '', name: '', price: 0.0, tags: [''] }, quantity: +0 }
}

function calculateTotal(items: [CartItem], taxRate = 0.1): 0.0 {
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )
  return Math.round(subtotal * (1 + taxRate) * 100) / 100
}

function applyDiscount(total: 0.0, code: '' || null): { final: 0.0, discount: 0.0 } {
  const discounts = {
    SAVE10: 0.1,
    SAVE20: 0.2,
  }
  const rate = code ? discounts[code] ?? 0 : 0
  return {
    final: Math.round(total * (1 - rate) * 100) / 100,
    discount: rate,
  }
}

test 'cart calculation' {
  const items = [
    { product: { id: '1', name: 'Widget', price: 10, tags: [] }, quantity: 3 }
  ]
  expect(calculateTotal(items, 0)).toBe(30)
  expect(calculateTotal(items, 0.1)).toBe(33)
}

test 'discount codes' {
  expect(applyDiscount(100, 'SAVE10')).toEqual({ final: 90, discount: 0.1 })
  expect(applyDiscount(100, null)).toEqual({ final: 100, discount: 0 })
  expect(applyDiscount(100, 'INVALID')).toEqual({ final: 100, discount: 0 })
}
```

The TJS version is about the same length, but the types exist at runtime,
the tests live with the code, and invalid inputs return errors instead
of crashing.

---

## Traceability: The Death of Source Maps

TypeScript debugging relies on source maps -- external files that try to
map minified, transpiled JavaScript back to your original code. They're
brittle, often out of sync, and fail entirely in complex build pipelines.

TJS eliminates source maps. Every function carries its source identity
in `__tjs` metadata:

```javascript
function add(a: 0, b: 0): 0 {
  return a + b
}

add.__tjs.source // "mymodule.tjs:3"
```

- **Zero-config debugging:** If a function fails validation, the error
  points to the exact line in your `.tjs` source, not a generated `.js` file.
- **Transparent eval:** Even code run via `Eval()` or the `AgentVM`
  provides clear traces because AST and source metadata are preserved.
- **No build bloat:** You don't ship `.map` files to production just to
  know why your app crashed.

---

## FAQ

### How do I use TJS with existing NPM packages?

TJS is a superset of JavaScript. Import any NPM package as usual:

```javascript
import lodash from 'https://esm.sh/lodash@4.17.21'
import { z } from 'zod' // works, though you won't need it
```

When you import a vanilla JS library, its exports have no TJS metadata.
You can wrap them in a TJS boundary to get runtime safety:

```javascript
import { rawGeocode } from 'legacy-geo-pkg'

// Wrap to validate at your system boundary
function geocode(addr: ''): { lat: 0.0, lon: 0.0 } {
  return rawGeocode(addr)
}
```

The untyped library code runs freely. Your TJS wrapper validates the
result before it enters your typed world.

### Do Proxies, WeakMaps, and other advanced patterns work?

Yes. TJS is purely additive — it adds inline type checks and metadata
properties but does not wrap, intercept, or modify JavaScript runtime
behavior. Specifically:

- **Proxies** work identically to plain JS. TJS attaches `.__tjs` as a
  plain property on function objects, which doesn't trigger Proxy traps.
  If your Proxy needs custom equality, use the `[tjsEquals]` symbol protocol.
- **WeakMap/WeakSet** are unaffected. TJS doesn't inspect collection contents.
- **Symbols** work normally. TJS reserves `Symbol.for('tjs.equals')` for
  custom equality but doesn't interfere with other symbols.
- **`Object.defineProperty`**, getters/setters, non-enumerable properties
  — all work as expected. TJS validation checks value types, not property
  descriptors.
- **Prototype chains** are preserved. `instanceof` works correctly with
  TJS-wrapped classes.

If you're building a Proxy-heavy library (reactive state, ORMs, etc.),
TJS will not interfere. The transpiled output is plain JavaScript with
some `typeof` checks at function entry points.

### Does structural equality (`==`) handle circular references?

No. Circular structures will cause infinite recursion. Use identity
comparison (`===`) for objects that might be circular, or define a
custom `.Equals` method on the class.

### What happens to TypeScript's `strict` mode checks?

TJS doesn't have `strictNullChecks` or `noImplicitAny` because the
problems they solve don't exist:

- **Null safety:** `|| null` explicitly marks nullable parameters.
  Functions without it reject null at runtime.
- **Implicit any:** Every TJS parameter has an example value that
  determines its type. There's nothing to be implicit about.
- **Strict property access:** Runtime validation catches missing
  properties with a clear error message instead of `undefined`.

---

## Learn More

- [TJS Language Reference](DOCS-TJS.md) -- Full syntax and features
- [TJS for JavaScript Programmers](TJS-FOR-JS.md) -- Coming from vanilla JS?
- [AJS Agent Language](DOCS-AJS.md) -- The sandboxed agent VM
- [Playground](https://tjs-platform.web.app) -- Try it live
