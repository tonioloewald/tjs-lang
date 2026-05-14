<!--{"section":"tjs","type":"example","group":"patterns","order":28}-->

# WASM Functions (reusable kernels)

Top-level `wasm function` declarations — the building block for cross-file WASM libraries.

```tjs
/*#
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
*/

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
