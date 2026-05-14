<!--{"section":"tjs","type":"example","group":"wasmlib","order":0}-->

# WASM Library: SIMD Linalg

A reusable WASM library exporting f32x4 SIMD vector kernels. Save this as `mylinalg`, then run the "Using a WASM Library" example.

```tjs
/*#
## A reusable WASM library

This file is the **library half** of a two-example demo. Save it in the
playground as a local module named `mylinalg`, then run the companion
example ("Using a WASM Library") which imports from it.

The exports below are real `wasm function` declarations — top-level
WebAssembly kernels with explicit parameters and SIMD f32x4 bodies.
Each is compiled to wasm bytecode at transpile time and exported as a
regular JS function that the consumer can call.

**Note:** TJS ships a fuller version of these (and more) in
`tjs-lang/linalg`. This example mirrors the source so you can read
exactly what a wasm library looks like.
*/

/**
 * Dot product of two f32 vectors of length `n`.
 * Returns the sum of element-wise products as f64.
 * `n` must be a multiple of 4 (the SIMD lane width).
 */
export wasm function dot(a: Float32Array, b: Float32Array, n: i32): f64 {
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

/**
 * Sum-of-squares of an f32 vector of length `n`.
 * For the L2 norm, take `Math.sqrt(norm_sq(a, n))` on the JS side.
 * Returning the squared value saves a sqrt; cosine similarity divides
 * by `sqrt(norm_sq(a) * norm_sq(b))`, which is one sqrt instead of two.
 */
export wasm function norm_sq(a: Float32Array, n: i32): f64 {
  let acc = f32x4_splat(0.0)
  for (let i = 0; i < n; i += 4) {
    let off = i * 4
    let av = f32x4_load(a, off)
    acc = f32x4_add(acc, f32x4_mul(av, av))
  }
  return f32x4_extract_lane(acc, 0)
    + f32x4_extract_lane(acc, 1)
    + f32x4_extract_lane(acc, 2)
    + f32x4_extract_lane(acc, 3)
}

// Sanity check before saving as a module
const a = wasmBuffer(Float32Array, 8)
const b = wasmBuffer(Float32Array, 8)
for (let i = 0; i < 8; i++) {
  a[i] = i + 1 // [1, 2, 3, 4, 5, 6, 7, 8]
  b[i] = i + 1
}

// dot([1..8], [1..8]) = 1 + 4 + 9 + 16 + 25 + 36 + 49 + 64 = 204
console.log('dot:', dot(a, b, 8))

// norm_sq([1..8]) = same as dot([1..8], [1..8]) = 204
console.log('norm_sq:', norm_sq(a, 8))

console.log('\nLooks good! Save this as `mylinalg` and run the consumer example next.')
```
