<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 28, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# WASM Functions (reusable kernels)

WebAssembly (WASM) is a compact, low-level instruction format that browsers, Node and Bun
compile to machine code and run beside JavaScript. It only works on numbers and arrays of
numbers, and in exchange a tight numeric loop runs at close to native speed. A **kernel** is a
small function of that kind: it takes numbers and arrays, loops over them, and returns a number
or fills an array.

This page assumes [Inline WASM](/wasm-basics/), which covers the other form: a `wasm { }`
block that speeds up one loop inside one JavaScript function. A `wasm function` is a kernel in
its own right: declared at module scope, callable from anywhere in the file, and exportable to
other files. Reach for either one when profiling shows a numeric loop (a dot product, a hash, a
pixel or audio buffer) is your bottleneck. For everything else, plain TJS is fast enough and
far easier to change.

```tjs:inline
/#
## `wasm function`: a WebAssembly kernel you can call by name

`wasm function NAME(...)` is declared at the top level of a file, with
WebAssembly types on its parameters and its return value. When the file
loads, every `wasm function` in it is compiled together into a single
WebAssembly module. The transpiler leaves a plain JavaScript function of
the same name in each one's place, so callers cannot tell it from any
other function.
#/

// A scalar dot product: one multiply and one add per element
wasm function dot_scalar(a: Float32Array, b: Float32Array, n: i32): f64 {
  let acc = 0.0
  for (let i = 0; i < n; i++) {
    acc = acc + a[i] * b[i]
  }
  return acc
}

// The SIMD version: each f32x4 value holds four floats ("lanes"), so one
// multiply instruction and one add instruction handle four elements
wasm function dot_simd(a: Float32Array, b: Float32Array, n: i32): f64 {
  let acc = f32x4_splat(0.0) // four lanes, all 0.0
  for (let i = 0; i < n; i += 4) {
    let off = i * 4 // a BYTE offset: each float is 4 bytes
    let av = f32x4_load(a, off) // a[i] .. a[i + 3]
    let bv = f32x4_load(b, off)
    acc = f32x4_add(acc, f32x4_mul(av, bv))
  }
  // Add the four lanes together
  return f32x4_extract_lane(acc, 0)
    + f32x4_extract_lane(acc, 1)
    + f32x4_extract_lane(acc, 2)
    + f32x4_extract_lane(acc, 3)
}

// Two random vectors, allocated in WASM memory so no call copies them.
// Allocate once: wasmBuffer memory is never freed.
const N = 128 // dot_simd needs a multiple of 4
const a = wasmBuffer(Float32Array, N)
const b = wasmBuffer(Float32Array, N)
for (let i = 0; i < N; i++) {
  a[i] = Math.random()
  b[i] = Math.random()
}

const scalarResult = dot_scalar(a, b, N)
const simdResult = dot_simd(a, b, N)

console.log('dot_scalar:', scalarResult.toFixed(4))
console.log('dot_simd:  ', simdResult.toFixed(4))
console.log('match:     ', Math.abs(scalarResult - simdResult) < 1e-3) // true
```

The `/# … #/` comment at the top is a TJS doc comment: markdown that the documentation tools
render above the code ([TJS Syntax](/TJS-SYNTAX/)).

## What the example shows

An inline block is part of one JavaScript function: it captures that function's variables,
and nothing else can call it. `dot_scalar` and `dot_simd` are ordinary functions as far as the
rest of the file is concerned. The transpiler replaces each declaration with a short wrapper,
`function dot_simd(a, b, n) { … }`, that hands the arguments to the WASM export and returns
its result.

The example checks that the two versions agree; it does not time them. [WASM SIMD](/wasm-simd/)
explains the `f32x4_*` intrinsics in full and includes a benchmark.

Things to notice:

- **Parameters use WebAssembly type names.** In the example, `n: i32` is a 32-bit integer,
  and `a: Float32Array` is an array of 32-bit floats. The number types are `i32`, `f32` and
  `f64` (a JavaScript-style double), plus the aliases `int` (for `i32`) and `number` (for
  `f64`). An array parameter can be any typed array: `Float32Array`, `Float64Array`,
  `Int32Array`, `Uint8Array`, `Int8Array`, `Uint8ClampedArray`, `Int16Array`, `Uint16Array`
  or `Uint32Array`.
- **An array parameter is an address.** Inside the kernel, `a` is a position in WASM memory,
  and `a[i]` reads from there. If the array was allocated with `wasmBuffer`, it already lives
  in WASM memory and the wrapper passes its address. A plain `new Float32Array(n)` does not, so
  the wrapper copies it into WASM memory before the call and back afterwards. That copy works
  for `Float32Array`, `Float64Array`, `Int32Array` and `Uint8Array` only; pass the other typed
  arrays as `wasmBuffer` arrays, because a plain one currently reads as zeros.
- **A TJS example value is not a type here.** Everywhere else in TJS, `n: 0` means "an
  integer, for example 0". Inside a `wasm function`, anything that is not one of the type names
  above is compiled as `f64`, without a warning: `n: 0` does not make an integer, and a
  misspelt `n: I32` does not either. Write the type name.
- **The return type is `f64` or nothing.** An `: i32` or `: f32` return annotation is
  accepted, but the function still returns an `f64`, which reaches JavaScript as an ordinary
  number.
- **There is no `fallback`.** A `wasm function` is pure WASM. If the runtime cannot run
  WebAssembly, there is no JavaScript version to run instead. When you need one, use an
  inline block with a `fallback { }` ([Inline WASM](/wasm-basics/)).
- **`wasmBuffer` arrays skip the copy, and are permanent.** `a` and `b` live in WASM memory,
  so no call copies 128 floats in and out. But `wasmBuffer` memory is never freed, so allocate
  your buffers once and reuse them; never call `wasmBuffer` per call or per request
  ([WASM Memory](/wasm-memory/)).

The two results agree to within rounding but are not bit-identical: the SIMD version adds the
products in four interleaved partial sums, and floating-point addition is not associative.

### In a browser, await the module before the first call

A file's WASM module is compiled when the file loads. That is synchronous everywhere except a
browser's main thread, where a module over 4KB must compile asynchronously. A `wasm function`
has no fallback to run in the meantime, so a call that arrives first throws a `TypeError`
(`globalThis.__tjs_wasm_1q2w3e_dot_simd is not a function`). The runtime provides
`globalThis.__tjs_wasm_ready()`, which returns a promise that resolves once every module in
the page is ready. It resolves at once when they already are, so in browser code await it once
at startup:

```javascript
await globalThis.__tjs_wasm_ready()
dot_simd(a, b, N)
```

The examples on this page skip it because their modules are a few hundred bytes, well under
the limit.

## Integers with WebAssembly semantics

Only a `wasm function` can take `i32` parameters. An inline block's parameters are always
`f64`, so they behave exactly like JavaScript numbers, and the integer-only operators (`%` and
the bitwise `&`, `|`, `^`, `<<`, `>>`, `>>>`) are not available on them. Declared `i32`, they
compile, and the arithmetic is WebAssembly's 32-bit arithmetic. That is the right tool for
hashes, checksums and random-number generators, and a surprise if you expected JavaScript
numbers.

```tjs:inline
wasm function add32(a: i32, b: i32): f64 {
  return a + b
}

wasm function div(a: i32, b: i32): f64 {
  return a / b
}

// Integer division: truncate the quotient yourself
wasm function idiv(a: i32, b: i32): f64 {
  return Math.trunc(a / b)
}

wasm function rem(a: i32, b: i32): f64 {
  return a % b
}

// A tiny integer hash. `17` is an integer literal, so `h` is an i32 local,
// and its multiply and add wrap at 32 bits, which is the point
wasm function hash3(a: i32, b: i32, c: i32): f64 {
  let h = 17
  h = h * 31 + a
  h = h * 31 + b
  h = h * 31 + c
  return h
}

// One wasm function may call another in the same file
wasm function sq(x: f64): f64 {
  return x * x
}

wasm function hypot2(a: f64, b: f64): f64 {
  return Math.sqrt(sq(a) + sq(b))
}

console.log('add32(2, 3):           ', add32(2, 3)) // 5
console.log('add32(2e9, 2e9):       ', add32(2e9, 2e9), '; JavaScript says', 2e9 + 2e9) // -294967296
console.log('add32(2.9, 0):         ', add32(2.9, 0), '; the fraction is dropped at the call') // 2
console.log('div(7, 2):             ', div(7, 2)) // 3.5
console.log('idiv(-7, 2):           ', idiv(-7, 2)) // -3
console.log('rem(-7, 2):            ', rem(-7, 2)) // -1
console.log('hash3(1, 2, 3):        ', hash3(1, 2, 3)) // 507473
console.log('hash3(123456789, 2, 3):', hash3(123456789, 2, 3)) // -1616603547
console.log('hypot2(3, 4):          ', hypot2(3, 4)) // 5

// A remainder by zero is a WebAssembly trap: it throws, it does not return NaN
try {
  rem(7, 0)
} catch (e) {
  console.log('rem(7, 0) threw:       ', e instanceof WebAssembly.RuntimeError) // true
}
```

The rules for `i32`:

| | `i32` in a `wasm function` | JavaScript |
| --- | --- | --- |
| A fractional argument | truncated at the call: `f(2.5)` sees `2` | `2.5` |
| An argument beyond 32 bits | wraps modulo 2³²: `3e9` arrives as `-1294967296` | `3e9` |
| `+`, `-`, `*` | wrap at 32 bits: `2e9 + 2e9` is `-294967296` | `4000000000` |
| `/` | JavaScript division: `7 / 2` is `3.5` | `3.5` |
| `%` | same as JavaScript, sign of the dividend: `-7 % 2` is `-1` | `-1` |
| `% 0` | **throws** a `WebAssembly.RuntimeError` (a trap) | `NaN` |
| The return value | widened to `f64`: an ordinary number | |

`/` was deliberately kept as floating-point division, so that the same source gives the same
quotient in WASM and in JavaScript. For integer division, `Math.trunc(a / b)` rounds toward
zero, as C does.

A local variable takes its type from its initializer, and keeps it:

- `let h = 17`: an integer literal, so `h` is an `i32`.
- `let acc = 0.0`: a literal with a decimal point, so `acc` is an `f64`.
- `let q = a / b` with `i32` operands: `/` produces an `f64`, so `q` is an `f64`.
- `+`, `-`, `*`, `%` and the bitwise operators on two `i32` values give an `i32`; mixing in an
  `f64` gives an `f64`.
- `let x = seed`: the type of `seed`, here `i32`. A `let` with no initializer is an `f64`.

## Output parameters

A `wasm function` cannot create an array: JavaScript owns all the memory. A kernel that
produces many values takes an array to write them into, and the caller allocates it. Here is a
xorshift random-number generator that fills an `Int32Array`, using the bitwise operators that
only `i32` values allow:

```tjs:inline
// Fill out[0..n) with xorshift32 random integers, starting from `seed`
wasm function xorshift_fill(out: Int32Array, n: i32, seed: i32) {
  let x = seed
  for (let i = 0; i < n; i++) {
    x = x ^ (x << 13)
    x = x ^ (x >>> 17)
    x = x ^ (x << 5)
    out[i] = x
  }
}

// The same algorithm in JavaScript, to check the kernel against
function xorshiftJS(n, seed) {
  const result = []
  let x = seed | 0 // wrap to 32 bits, as the i32 parameter does
  for (let i = 0; i < n; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    result.push(x)
  }
  return result
}

// 2463534242 is above 2³¹ - 1, so it arrives as a negative i32
const out = wasmBuffer(Int32Array, 5)
xorshift_fill(out, 5, 2463534242)
console.log('wasm:', Array.from(out).join(', '))
// wasm: 723471715, -1797600390, 2064144800, 2008045182, -762662687
console.log('js:  ', xorshiftJS(5, 2463534242).join(', '))
// js:   723471715, -1797600390, 2064144800, 2008045182, -762662687

// Fill the same buffer again: no new allocation
xorshift_fill(out, 5, 1)
console.log('seed 1:', Array.from(out).join(', '))
// seed 1: 270369, 67634689, -1647531835, 307599695, -1896278063
```

The seed 2463534242 does not fit in an `i32`, so it wraps at the call, as the table says; the
JavaScript twin does the same wrap with `seed | 0`. `>>>` is the unsigned right shift: it moves
the bits right and fills with zeros, ignoring the sign, which is what xorshift needs. JavaScript's
`>>>` does the same to the bits.

`xorshift_fill` has no return annotation, so it returns nothing; the results are in `out`.
An ordinary `new Int32Array(5)` also works as the output, but the wrapper then copies it into
WASM memory and back on every call. The runtime notes that copy once in
`__tjs.records({ source: 'wasm' })`, its diagnostic log ([Error History](/error-history/)).

## Exporting a library

Write `export wasm function`, and the same declaration becomes a library other files import
like any other function (TJS source, in a plain fence because it is two files):

```javascript
// vec.tjs
export wasm function dot(a: Float32Array, b: Float32Array, n: i32): f64 {
  let acc = 0.0
  for (let i = 0; i < n; i++) {
    acc = acc + a[i] * b[i]
  }
  return acc
}

// app.tjs
import { dot } from './vec.tjs'
```

Importing a `.tjs`
file directly needs something that transpiles it on import, such as the Bun plugin
(`preload = ["tjs-lang/bun-plugin"]` in `bunfig.toml`); otherwise import the library's
transpiled `.js` ([Local Module Imports](/local-module-imports/)).

How the import is linked depends on how the consumer is transpiled. If the consumer is
transpiled with a `ModuleLoader` (`tjs(source, { moduleLoader })`), the transpiler reads
`vec.tjs` and compiles `dot` into the consumer's own WASM module, so calls between the
consumer's kernels and the library's never pass through JavaScript. Otherwise the import stays
an ordinary import of the library's transpiled `.js`, which carries its own WASM. Building and
consuming a library is covered by [WASM Library: SIMD Linalg](/wasm-library-author/),
[Using a WASM Library](/wasm-library-consumer/) and [WASM in TJS](/DOCS-WASM/), which are on
the main documentation site, not in this book. The production `dot` and `norm_sq` kernels ship
in the `tjs-lang/linalg` package, also documented there.

## Limits

- **No calls to JavaScript.** A `wasm function` may call the math intrinsics that are each one
  WebAssembly instruction (`Math.sqrt`, `Math.abs`, `Math.floor`, `Math.ceil`, `Math.trunc`,
  `Math.min`, `Math.max`), the `f32x4_*` intrinsics, and other `wasm function`s in the same
  module. Nothing else compiles. `Math.sin` has no WebAssembly instruction and would need a
  call out to JavaScript, and a call to an ordinary function is refused for the same reason.
  The transpile stops with a compile error. This source:

  ```javascript
  wasm function s(x: f64): f64 {
    return Math.sin(x)
  }
  ```

  stops with:

  ```text
  `wasm function s` (line 1) did not compile: Math.sin requires JS import (not yet implemented).
  ```

  A call to an ordinary function `g` is refused by name:
  `'g' cannot be called from WASM: it is not a WASM intrinsic or another \`wasm function\` in this module`.
- **Only parameters and locals.** A `wasm function` cannot read module-level variables:
  `return x * K`, with `const K = 3` at the top of the file, stops with
  `Unknown identifier: K.` Pass the value as a parameter.
- **Numbers and typed arrays only.** No strings, objects, closures or `try`/`catch`. `while`
  is not implemented either (`Unsupported statement type: WhileStatement`); write a `for`
  loop. See [Inline WASM](/wasm-basics/) for the full subset, which is the same for blocks and
  functions.
- **No allocation.** The caller allocates every array; a kernel that produces one takes an
  output parameter. Allocate `wasmBuffer` arrays once and reuse them, because their memory is
  never freed.
- **SIMD loops need lengths that are a multiple of 4.** `dot_simd(a, b, 130)` loads four
  floats at a time, so its last load reads two floats past the end of each array. Whatever
  happens to lie next in WASM memory is added into the result, and nothing reports it. Pad
  with zeros to a multiple of 4.
- **`% 0` traps.** Check the divisor in JavaScript if it can be zero.
- **In a browser, a large module needs `await globalThis.__tjs_wasm_ready()`** before the
  first call (see above).
