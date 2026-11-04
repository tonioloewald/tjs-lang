<!--{"section": "tjs", "type": "example", "group": "wasmlib", "order": 0, "parent": "tjs-wasmlib.md"}-->

# WASM Library: SIMD Linalg

A reusable WASM library exporting f32x4 SIMD vector kernels. Save this as `mylinalg`, then run the "Using a WASM Library" example.

```tjs:inline
/#
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
#/

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

<!-- TODO review -->
## What makes this a library

Two words: `export wasm function`. Each declaration is a WebAssembly kernel compiled into
the file's one `WebAssembly.Module`, and `export` makes its JavaScript wrapper an ordinary
ES module export. Nothing else is needed: no build configuration, no `.wasm` file, no loader
code. The doc comments above each function are part of the API, and they say what a caller
must know that the types cannot: `n` must be a multiple of 4, and `norm_sq` returns the
**squared** norm.

The sanity check at the bottom is worth keeping in a real library too, or better, turning
into `test` blocks: a SIMD kernel with an off-by-four offset compiles perfectly and returns
plausible wrong numbers.

<!-- TODO review -->
## Design rule: the caller allocates

WASM code never allocates; JavaScript owns every byte. A library function that returns a
scalar, like `dot` or `norm_sq`, needs nothing more. A function that produces an **array**
takes an output parameter instead, so the caller can allocate it once with `wasmBuffer` and
reuse it. Here is that shape, a SIMD `axpy` (`out = a * x + y`, the classic linear-algebra
building block):

```tjs:inline
/**
 * out[i] = a * x[i] + y[i] for i < n.
 * `n` must be a multiple of 4. `out` may be `x` or `y` (an in-place update).
 */
export wasm function axpy(a: f64, x: Float32Array, y: Float32Array, out: Float32Array, n: i32) {
  let va = f32x4_splat(a)
  for (let i = 0; i < n; i += 4) {
    let off = i * 4
    let r = f32x4_add(f32x4_mul(va, f32x4_load(x, off)), f32x4_load(y, off))
    f32x4_store(out, off, r)
  }
}

const N = 8
const x = wasmBuffer(Float32Array, N)
const y = wasmBuffer(Float32Array, N)
const out = wasmBuffer(Float32Array, N)
for (let i = 0; i < N; i++) {
  x[i] = i
  y[i] = 100
}

axpy(2, x, y, out, N)
console.log('axpy(2, x, y):   ', Array.from(out).join(', '))

// The same output buffer, reused: no new allocation
axpy(-1, x, y, out, N)
console.log('axpy(-1, x, y):  ', Array.from(out).join(', '))
```

`axpy` has no return annotation, so it returns nothing; the result is in `out`. Returning
`f64` or nothing are the only choices today.

<!-- TODO review -->
## How a library is consumed

The same source serves two kinds of consumer:

- **Composed form.** A TJS consumer that transpiles with a `ModuleLoader` pulls the imported
  `wasm function`s into **its own** module at transpile time. Calls between the consumer's
  WASM and the library's are plain WASM calls, with no JavaScript in between.
- **Boundary form.** Everyone else imports the library's transpiled `.js`, which carries its
  own embedded WASM and JavaScript wrappers. Each call crosses from JavaScript into WASM;
  that costs a few nanoseconds, which matters only for very small kernels called in a tight
  JavaScript loop.

Both forms give identical results. A published library usually ships the TJS source for TJS
consumers and the transpiled `.js` for everyone else, selected by `package.json` `exports`:

```json
"exports": {
  ".": {
    "bun": "./src/index.tjs",
    "default": "./dist/index.js"
  }
}
```

<!-- TODO review -->
## Limits

- **Pure kernels only.** A `wasm function` cannot call JavaScript, so no `Math.sin`, no
  logging, no callbacks. Do that work in the JavaScript that calls the kernel.
- **Return `f64` or nothing.** Other return annotations are parsed but not yet honoured.
- **No tail loop.** SIMD kernels assume `n % 4 == 0`; document it, as these do, and let the
  caller pad.
- **Each `.js` dependency carries its own copy.** If two published libraries both embed the
  same kernels in their boundary form, the consumer ships both copies.

The next chapter, [Using a WASM Library](/wasm-library-consumer/), imports `dot` and
`norm_sq` from this file. The production versions live in `tjs-lang/linalg`, whose source,
`src/linalg/index.tjs`, reads much like this page.
