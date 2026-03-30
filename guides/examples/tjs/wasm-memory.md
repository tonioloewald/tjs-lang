<!--{"section":"tjs","type":"example","group":"patterns","order":27}-->

# WASM Memory

> New to WASM in TJS? Start with the **[WASM Quick Start](https://github.com/tonioloewald/tjs-lang/blob/main/docs/WASM-QUICKSTART.md)**.

Zero-copy arrays and automatic data marshaling between JS and WASM.

```tjs
/*#
## How Data Moves Between JS and WASM

The #1 WebAssembly question: "How do I get my data into WASM?"
TJS handles it automatically. Three modes:

### 1. Scalars — pass through
`i32`, `f32`, `f64` go directly as WASM parameters. No marshaling.

### 2. Regular typed arrays — transparent copy
Pass a normal `Float32Array` and TJS copies it into WASM memory
before the call, then copies results back out after. You don't
have to think about it.

### 3. `wasmBuffer()` — zero-copy shared memory
Allocate directly in WASM memory. Both JS and WASM see the same
bytes. No copy in, no copy out. Mutations are instantly visible.

    const xs = wasmBuffer(Float32Array, 50000)
    xs[0] = 3.14        // JS writes to WASM memory
    wasmFunction(xs)     // WASM reads/writes the same memory
    console.log(xs[0])   // JS sees WASM's mutations immediately

### Supported types
`Float32Array`, `Float64Array`, `Int32Array`, `Uint8Array`

### How it works internally
All WASM blocks in a file share one `WebAssembly.Memory` (64MB).
`wasmBuffer` is a bump allocator — it hands out slices of this memory.
When a typed array argument's `.buffer === wasmMemory.buffer`, the
wrapper skips the copy and passes the byte offset directly.
*/

// --- Regular arrays: transparent copy ---

function addOne(! arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      let v = f32x4_load(arr, off)
      let ones = f32x4_splat(1.0)
      f32x4_store(arr, off, f32x4_add(v, ones))
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] += 1
  }
}

// Regular Float32Array — TJS copies in before, copies out after
const regular = new Float32Array([10, 20, 30, 40])
addOne(regular, 4)
console.log('Regular array after WASM:', Array.from(regular))
// [11, 21, 31, 41] — changes visible in JS

// --- wasmBuffer: zero-copy shared memory ---

const shared = wasmBuffer(Float32Array, 4)
shared[0] = 100
shared[1] = 200
shared[2] = 300
shared[3] = 400

addOne(shared, 4)
console.log('wasmBuffer after WASM:', Array.from(shared))
// [101, 201, 301, 401] — zero copy, same memory

// --- Practical: large array processing ---

const SIZE = 10000
const data = wasmBuffer(Float32Array, SIZE)
for (let i = 0; i < SIZE; i++) data[i] = i * 0.01

// Process in WASM — no marshaling overhead
function normalize(! arr: Float32Array, len: 0) {
  wasm {
    // Find max (scalar — SIMD max needs horizontal reduction)
    let max = 0.0
    for (let i = 0; i < len; i++) {
      let off = i * 4
      let v = f32x4_extract_lane(f32x4_load(arr, off), 0)
      if (v > max) { max = v }
    }
    // Scale to [0, 1]
    if (max > 0.0) {
      let inv = f32x4_splat(1.0 / max)
      for (let i = 0; i < len; i += 4) {
        let off = i * 4
        f32x4_store(arr, off, f32x4_mul(f32x4_load(arr, off), inv))
      }
    }
  } fallback {
    let max = 0
    for (let i = 0; i < len; i++) if (arr[i] > max) max = arr[i]
    if (max > 0) for (let i = 0; i < len; i++) arr[i] /= max
  }
}

const t0 = performance.now()
normalize(data, SIZE)
const elapsed = performance.now() - t0

console.log(`Normalized ${SIZE} floats in ${elapsed.toFixed(2)}ms`)
console.log('First 4:', data[0].toFixed(4), data[1].toFixed(4), data[2].toFixed(4), data[3].toFixed(4))
console.log('Last:', data[SIZE - 1].toFixed(4))
```
