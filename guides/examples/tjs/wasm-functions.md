<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 28, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# WASM Functions (reusable kernels)

An inline `wasm { }` block speeds up one loop inside one JavaScript function. A `wasm function`
is a WebAssembly kernel in its own right: declared at module scope, callable from anywhere in
the file, and exportable to other files.

```tjs:inline
/#
## `wasm function`: a WebAssembly kernel you can call by name

`wasm function NAME(...)` is declared at the top level of a file, with
WebAssembly types on its parameters and its return value. It compiles into
the file's one `WebAssembly.Module`, and the transpiler leaves a plain
JavaScript function of the same name in its place, so callers cannot tell
it from any other function.
#/

// A scalar dot product: one multiply-add per element
wasm function dot_scalar(a: Float32Array, b: Float32Array, n: i32): f64 {
  let acc = 0.0
  for (let i = 0; i < n; i++) {
    acc = acc + a[i] * b[i]
  }
  return acc
}

// The SIMD version: four multiply-adds per instruction
wasm function dot_simd(a: Float32Array, b: Float32Array, n: i32): f64 {
  let acc = f32x4_splat(0.0)
  for (let i = 0; i < n; i += 4) {
    let off = i * 4
    let av = f32x4_load(a, off)
    let bv = f32x4_load(b, off)
    acc = f32x4_add(acc, f32x4_mul(av, bv))
  }
  return f32x4_extract_lane(acc, 0)
    + f32x4_extract_lane(acc, 1)
    + f32x4_extract_lane(acc, 2)
    + f32x4_extract_lane(acc, 3)
}

// Two random vectors, allocated in WASM memory so no call copies them
const N = 128
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
console.log('match:     ', Math.abs(scalarResult - simdResult) < 1e-3)
```

## What the example shows

An inline block is part of one JavaScript function: it captures that function's variables,
and nothing else can call it. `dot_scalar` and `dot_simd` are ordinary functions as far as the
rest of the file is concerned. The transpiler replaces each declaration with a short wrapper,
`function dot_simd(a, b, n) { … }`, that hands the arguments to the WASM export and returns
its result.

Things to notice:

- **Parameters use WebAssembly type names.** `n: i32` is a 32-bit integer, `x: f64` a
  double, and `a: Float32Array` a pointer into WASM memory that the wrapper fills in. The
  other names are `f32`, `Float64Array`, `Int32Array` and `Uint8Array`, plus the aliases
  `int` (for `i32`) and `number` (for `f64`).
- **A TJS example value is not a type here.** Anything that is not one of those names is
  compiled as `f64`, without a warning. `n: 0` does not make an integer, and a misspelt
  `n: I32` does not either. Write the type name.
- **The return type is `f64` or nothing.** An `: i32` or `: f32` return annotation is
  accepted, but the function still returns an `f64`, which reaches JavaScript as an ordinary
  number.
- **There is no `fallback`.** A `wasm function` is pure WASM. If the runtime cannot run
  WebAssembly, there is no JavaScript version to run instead. When you need one, use an
  inline block with a `fallback { }` ([Inline WASM](/wasm-basics/)).
- **`wasmBuffer` arrays skip the copy.** `a` and `b` live in WASM memory, so the wrapper
  passes their offsets instead of copying 128 floats in and out on every call
  ([WASM Memory](/wasm-memory/)).

The two results agree to within rounding but are not bit-identical: the SIMD version adds the
products in four interleaved partial sums, and floating-point addition is not associative.

## Integers with WebAssembly semantics

`i32` parameters are what a `wasm function` can do and an inline block cannot. Inline blocks
are JavaScript-exact: their parameters arrive as `f64`, so `%` and the bitwise operators,
which need integers, do not compile there. Declared `i32`, they compile, and the arithmetic is
WebAssembly's 32-bit arithmetic. That is the right tool for hashes, checksums and
random-number generators, and a surprise if you expected JavaScript numbers.

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

// A tiny integer hash: multiply and add wrap at 32 bits, which is the point
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

console.log('add32(2, 3):           ', add32(2, 3))
console.log('add32(2e9, 2e9):       ', add32(2e9, 2e9), '; JavaScript says', 2e9 + 2e9)
console.log('add32(2.9, 0):         ', add32(2.9, 0), '; the fraction is dropped at the call')
console.log('div(7, 2):             ', div(7, 2))
console.log('idiv(-7, 2):           ', idiv(-7, 2))
console.log('rem(-7, 2):            ', rem(-7, 2))
console.log('hash3(1, 2, 3):        ', hash3(1, 2, 3))
console.log('hash3(123456789, 2, 3):', hash3(123456789, 2, 3))
console.log('hypot2(3, 4):          ', hypot2(3, 4))

// A remainder by zero is a WebAssembly trap: it throws, it does not return NaN
try {
  rem(7, 0)
} catch (e) {
  console.log('rem(7, 0) threw:       ', e instanceof WebAssembly.RuntimeError)
}
```

The rules for `i32`, which the test suite measures and pins:

| | `i32` in a `wasm function` | JavaScript |
| --- | --- | --- |
| A fractional argument | truncated at the call: `f(2.5)` sees `2` | `2.5` |
| An argument beyond 32 bits | wraps modulo 2³²: `3e9` arrives as `-1294967296` | `3e9` |
| `+`, `-`, `*` | wrap at 32 bits: `2e9 + 2e9` is `-294967296` | `4000000000` |
| `/` | JavaScript division: `7 / 2` is `3.5` | `3.5` |
| `%` | sign of the dividend: `-7 % 2` is `-1` | `-1` |
| `% 0` | **throws** a `WebAssembly.RuntimeError` (a trap) | `NaN` |
| The return value | widened to `f64`: an ordinary number | |

`/` is the one operator that does not stay integral, so the same source gives the same quotient
in WASM and in JavaScript. For integer division, `Math.trunc(a / b)` rounds toward zero, as C
does.

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
  let x = seed | 0
  for (let i = 0; i < n; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    result.push(x)
  }
  return result
}

const out = wasmBuffer(Int32Array, 5)
xorshift_fill(out, 5, 2463534242)
console.log('wasm:', Array.from(out).join(', '))
console.log('js:  ', xorshiftJS(5, 2463534242).join(', '))

// Fill the same buffer again: no new allocation
xorshift_fill(out, 5, 1)
console.log('seed 1:', Array.from(out).join(', '))
```

`xorshift_fill` has no return annotation, so it returns nothing; the results are in `out`.
Allocate the output once with `wasmBuffer` and reuse it, because `wasmBuffer` memory is never
freed. An ordinary `new Int32Array(5)` also works, but the wrapper then copies it into WASM
memory and back on every call, and notes that once in `__tjs.records({ source: 'wasm' })`.

## Exporting a library

Write `export wasm function`, and the same declaration becomes a library other files import
like any other function:

```javascript
// vec.tjs
export wasm function dot(a: Float32Array, b: Float32Array, n: i32): f64 { … }

// app.tjs
import { dot } from './vec.tjs'
```

A TJS consumer that transpiles with a module loader composes the imported kernel into its own
WASM module, so calls between its WASM and the library's never pass through JavaScript.
Anyone else imports the library's transpiled `.js`, which carries its own WASM. Building and
consuming one is covered by [WASM Library: SIMD Linalg](/wasm-library-author/) and
[Using a WASM Library](/wasm-library-consumer/), which are on the main documentation site,
not in this book. The production `dot` and `norm_sq` kernels ship in the `tjs-lang/linalg`
package (also documented there, and in DOCS-WASM.md).

## Limits

- **No calls to JavaScript.** A `wasm function` may call the math intrinsics (`Math.sqrt`,
  `abs`, `floor`, `ceil`, `trunc`, `min`, `max`, each one WebAssembly instruction), the
  `f32x4_*` intrinsics, and other `wasm function`s in the same module. Nothing else compiles:
  `Math.sin` has no WebAssembly instruction and would need a call out to JavaScript, and a
  call to an ordinary function is refused for the same reason. The transpile stops with an
  error naming the construct:

  ```text
  `wasm function s` (line 1) did not compile: Math.sin requires JS import (not yet implemented).
  ```

- **Numbers and typed arrays only.** No strings, objects, closures, `try`/`catch` or `while`
  (use `for`). See [Inline WASM](/wasm-basics/) for the full subset, which is the same for
  blocks and functions.
- **No allocation.** The caller allocates every array; a kernel that produces one takes an
  output parameter.
- **SIMD loops need lengths that are a multiple of 4.** `dot_simd(a, b, 130)` would read past
  the data. Pad with zeros.
- **`% 0` traps.** Check the divisor in JavaScript if it can be zero.
- **Await readiness for large modules in a browser.** A file's module is compiled when the
  file loads. On a browser's main thread, a module over 4KB has to compile asynchronously, and
  a `wasm function` has no fallback to run in the meantime, so
  `await globalThis.__tjs_wasm_ready()` before the first call.
