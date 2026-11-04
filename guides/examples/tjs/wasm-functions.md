<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 28, "parent": "tjs-patterns.md"}-->

# WASM Functions (reusable kernels)

Top-level `wasm function` declarations — the building block for cross-file WASM libraries.

```tjs:inline
/#
## `wasm function` — reusable WebAssembly kernels

Inline `wasm { ... }` blocks live inside a specific JS function. They're
convenient for one-off accelerations but they're not reusable.

`wasm function NAME(...)` at module scope is the reusable form:

- Declared at top level with explicit parameters and return type
- Compiles into the file's single `WebAssembly.Module`
- Other files can `import { NAME } from '...'` (cross-file composition,
  via the moduleLoader path)
- Same source produces both "composed" (tjs-to-tjs) and "boundary" (.js)
  distribution forms — see DOCS-WASM.md

Parameters use WASM type names (`i32`, `f64`, `Float32Array`, etc.), not
TJS example-based syntax. Return types must be `f64` or omitted in v1.
#/

// A scalar dot product — for educational reference.
// Real production code would use the SIMD version below.
wasm function dot_scalar(a: Float32Array, b: Float32Array, n: i32): f64 {
  let acc = 0.0
  for (let i = 0; i < n; i++) {
    acc = acc + a[i] * b[i]
  }
  return acc
}

// SIMD f32x4 version — processes 4 elements per instruction
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

// Both functions are now callable from JS. The transpiler emits a wrapper:
//   function dot_scalar(a, b, n) { return globalThis.__tjs_wasm_dot_scalar(a, b, n) }
// that handles type marshaling automatically. Float32Array args use a
// zero-copy fast path when allocated via wasmBuffer().

// Demo: build two random vectors and compare the two implementations
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

// The real version of this lives in tjs-lang/linalg — just `import { dot }`
// and you get the same SIMD kernel, ready to use.
```

<!-- TODO review -->
## What the example shows

An inline `wasm { }` block is part of one JavaScript function: it captures that function's
variables and nothing else can call it. A `wasm function` is a kernel in its own right. It is
declared at module scope with explicit WebAssembly types, compiled into the file's single
`WebAssembly.Module`, and replaced in the output by a plain JavaScript wrapper, so callers
cannot tell it from any other function.

Things to notice:

- **Parameters use WebAssembly type names.** `n: i32` is a 32-bit integer and `x: f64` a
  double; `a: Float32Array` is a pointer into WASM memory, marshaled by the wrapper. TJS
  example values do not work here: inside a `wasm function`, `n: 0` is not an example.
- **The return type is `f64` or nothing.** `i32`, `f32` and `v128` return annotations are
  parsed but the backend always returns `f64`, which reaches JavaScript as an ordinary number.
- **There is no `fallback`.** A `wasm function` is pure WASM. If the runtime cannot run WASM,
  there is no JavaScript path to fall back to, so use an inline block when you need one.
- **`wasmBuffer` arrays skip the copy.** `a` and `b` are allocated in WASM memory, so the
  wrapper passes their offsets instead of copying 128 floats in on every call.

The two implementations agree to within rounding. They are not bit-identical: the SIMD
version adds the products in four interleaved partial sums, and floating-point addition is
not associative.

<!-- TODO review -->
## Integers with WebAssembly semantics

`i32` parameters are where a `wasm function` does something a block cannot. Inline blocks
are JavaScript-exact (numbers arrive as `f64`), so `%` and the bitwise operators, which need
integers, do not compile there. Declared `i32`, they do, and the arithmetic is WebAssembly's
32-bit arithmetic: the right tool for hashes, checksums and random-number generators, and a
surprise if you expected JavaScript numbers.

```tjs:inline
// i32 parameters have WebAssembly's 32-bit semantics, not JavaScript's
wasm function add32(a: i32, b: i32): f64 {
  return a + b
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

console.log('add32(2, 3):         ', add32(2, 3))
console.log('add32(2e9, 2e9):     ', add32(2e9, 2e9), '; JavaScript says', 2e9 + 2e9)
console.log('add32(2.9, 0):       ', add32(2.9, 0), '; the fraction is dropped at the call')
console.log('rem(-7, 2):          ', rem(-7, 2))
console.log('hash3(1, 2, 3):      ', hash3(1, 2, 3))
console.log('hash3(123456789, 2, 3):', hash3(123456789, 2, 3))
console.log('hypot2(3, 4):        ', hypot2(3, 4))
```

The rules for `i32`, measured and pinned by the test suite:

| | `i32` in a `wasm function` | JavaScript |
| --- | --- | --- |
| A fractional argument | truncated at the call: `f(2.5)` sees `2` | `2.5` |
| An argument beyond 32 bits | wraps modulo 2³²: `3e9` arrives as `-1294967296` | `3e9` |
| `+`, `-`, `*` | wrap at 32 bits: `2e9 + 2e9` is `-294967296` | `4000000000` |
| `/` | JavaScript division: `7 / 2` is `3.5` | `3.5` |
| `%` | sign of the dividend: `-7 % 2` is `-1` | `-1` |
| `% 0` | **throws** (WebAssembly traps) | `NaN` |

<!-- TODO review -->
## Limits

- **No host calls.** A `wasm function` may call the math intrinsics (`Math.sqrt`, `abs`,
  `floor`, `ceil`, `trunc`, `min`, `max`), the `f32x4_*` intrinsics and other `wasm function`s
  in the same module, and nothing else. `Math.sin` needs JavaScript, so it does not compile.
- **No allocation.** The caller allocates every array; a kernel that produces one takes an
  output parameter.
- **SIMD loops need lengths that are a multiple of 4.** `dot_simd(a, b, 130)` would read past
  the data; pad with zeros.
- **`% 0` traps.** Guard the divisor in JavaScript if it can be zero.

Exported with `export wasm function`, the same declarations become a library other files can
import. [WASM Library: SIMD Linalg](/wasm-library-author/) builds one, and `tjs-lang/linalg`
ships the production version of `dot`.
