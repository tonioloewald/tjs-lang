# TJS Syntax Reference

This file is the detailed TJS syntax reference, extracted from CLAUDE.md for readability.
See CLAUDE.md for commands, architecture, and development patterns.

## Classes (Callable Without `new`)

TJS classes are wrapped to be callable without the `new` keyword:

```typescript
class Point {
  constructor(public x: number, public y: number) {}
}

// Both work identically:
const p1 = Point(10, 20) // TJS way - clean
const p2 = new Point(10, 20) // Still works, but linter warns

// The linter flags explicit `new` usage:
// Warning: Unnecessary 'new' keyword. In TJS, classes are callable without 'new'
```

The `wrapClass()` function in the runtime uses a Proxy to intercept calls and auto-construct. In native TJS, `TjsClass` is on by default, so all `class` declarations are wrapped. TS-originated code requires an explicit `TjsClass` directive. Built-in constructors (`Boolean`, `Number`, `String`, etc.) and old-style `function` + `prototype` constructors are never touched because they may have intentional dual behavior (e.g., `Boolean(0)` returns `false` but `new Boolean(0)` returns a truthy wrapper object).

## Function Parameters

```typescript
// Required param with example value (colon shorthand)
function greet(name: 'Alice') { }        // name is required, type inferred as string

// Numeric type narrowing (all valid JS syntax)
function calc(rate: 3.14) { }            // number (float) -- has decimal point
function calc(count: 42) { }             // integer -- whole number
function calc(index: +0) { }             // non-negative integer -- + prefix

// Optional param with default
function greet(name = 'Alice') { }       // name is optional, defaults to 'Alice'

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

// Type with predicate (auto-generates type guard from example)
Type EvenNumber {
  description: 'an even number'
  example: 2
  predicate(x) { return x % 2 === 0 }
}
```

## Generic Declarations

```typescript
// Simple generic
Generic Box<T> {
  description: 'a boxed value'
  predicate(x, T) {
    return typeof x === 'object' && x !== null && 'value' in x && T(x.value)
  }
}

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

## Module Safety Directive

```typescript
// At top of file - sets default validation level
safety none     // No validation (metadata only)
safety inputs   // Validate function inputs (default)
safety all      // Validate everything (debug mode)
```

## TJS Mode Directives

Native TJS (`.tjs` files) has all modes ON by default: `TjsEquals`, `TjsClass`, `TjsDate`, `TjsNoeval`, `TjsNoVar`, `TjsStandard`. The default safety level is `inputs`.

TS-originated code (from `fromTS`, detected by the `/* tjs <- */` annotation) and AJS/VM code get all modes OFF with safety `none`, matching plain JavaScript semantics.

```typescript
// Individual modes (on by default in native TJS, off by default in TS-originated/AJS)
TjsEquals // == and != use honest equality (Eq/NotEq) — no coercion, unwraps boxed primitives
TjsClass // Classes callable without new, explicit new is banned
TjsDate // Date is banned, use Timestamp/LegalDate instead
TjsNoeval // eval() and new Function() are banned
TjsNoVar // var declarations are syntax errors — use const or let
TjsStandard // Newlines as statement terminators (prevents ASI footguns)
TjsSafeEval // Include Eval/SafeFunction in runtime for dynamic code (always opt-in, adds an import)

// Meta-directives
TjsStrict // Enables ALL modes (useful for TS-originated code opting in to TJS semantics)
TjsCompat // Disables ALL modes (for gradual migration or JS interop in native TJS files)
```

`TjsSafeEval` is always opt-in regardless of file origin because it adds a runtime import.

Individual directives still work for selective enable/disable. Multiple directives can be combined. Place them at the top of the file before any code.

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

## Equality Operators

With `TjsEquals` (or `TjsStrict`), TJS fixes JavaScript's confusing `==` coercion without the performance cost of deep structural comparison.

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

With `TjsEquals`, `typeof null` returns `'null'` instead of `'object'` (JS's oldest bug). All other typeof results are unchanged. Transforms `typeof expr` to `TypeOf(expr)`.

## Honest Boolean Coercion (TjsStandard)

Raw JS: `Boolean(new Boolean(false)) === true` (a boxed primitive is an Object → truthy). Same trap for `if`, `!`, `&&`, `||`, `?:`, `while`, `for`, `do/while`. The spec's `ToBoolean` operation has no override hook (`Symbol.toPrimitive` doesn't fire for boolean coercion).

Native TJS rewrites every truthiness context to `__tjs.toBool(x)`, which unwraps boxed primitives before coercing. Always-on under `TjsStandard`.

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
/* @tjs TjsClass TjsEquals */ // Enable TJS modes in TS-originated code
/* @tjs-skip */ // Skip this declaration entirely
/* @tjs example: { name: 'Alice' } */ // Custom example value for Type
/* @tjs predicate(x) { return x > 0 } */ // Custom runtime predicate
/* @tjs declaration { value: T } */ // Declaration block for Generic .d.ts
```

Mode directives (`TjsClass`, `TjsEquals`, etc.) are emitted at the top of the `.tjs`
output. These are mainly useful for TS-originated code (where modes are off by
default) to opt in to TJS features like `private → #` conversion (`TjsClass`).

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

Classes can have multiple constructor signatures (`TjsClass` is on by default in native TJS):

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
