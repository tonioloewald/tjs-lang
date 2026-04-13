<!--{"section":"tjs","type":"example","group":"patterns","order":26}-->

# WASM SIMD

> New to WASM in TJS? Start with the **[WASM Quick Start](https://github.com/tonioloewald/tjs-lang/blob/main/docs/WASM-QUICKSTART.md)**.

Process 4 floats per instruction. No setup, no toolchain.

```tjs
/*#
## SIMD: Single Instruction, Multiple Data

SIMD processes 4 float values per instruction — a 4x throughput
improvement for vectorized math. TJS provides SIMD via `f32x4_*`
intrinsics that compile directly to WASM SIMD opcodes.

### Available Intrinsics

| Intrinsic | Operation |
|-----------|-----------|
| `f32x4_load(arr, offset)` | Load 4 floats from array |
| `f32x4_store(arr, offset, vec)` | Store 4 floats to array |
| `f32x4_splat(value)` | Fill all 4 lanes with one value |
| `f32x4_add(a, b)` | Add 4 pairs |
| `f32x4_sub(a, b)` | Subtract 4 pairs |
| `f32x4_mul(a, b)` | Multiply 4 pairs |
| `f32x4_div(a, b)` | Divide 4 pairs |
| `f32x4_neg(a)` | Negate 4 values |
| `f32x4_sqrt(a)` | Square root of 4 values |
| `f32x4_extract_lane(vec, lane)` | Get one float (0-3) |
| `f32x4_replace_lane(vec, lane, val)` | Set one float |
*/

// --- Scale an array by a constant (SIMD: 4 elements per step) ---

function scale(! arr: Float32Array, len: 0, factor: 0.0) {
  wasm {
    let s = f32x4_splat(factor)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      let v = f32x4_load(arr, off)
      f32x4_store(arr, off, f32x4_mul(v, s))
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= factor
  }
}

// --- Dot product (sum of element-wise products) ---

function dot(! a: Float32Array, b: Float32Array, len: 0):! 0.0 {
  return wasm {
    let acc = f32x4_splat(0.0)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      let va = f32x4_load(a, off)
      let vb = f32x4_load(b, off)
      acc = f32x4_add(acc, f32x4_mul(va, vb))
    }
    // Sum the 4 lanes
    f32x4_extract_lane(acc, 0)
      + f32x4_extract_lane(acc, 1)
      + f32x4_extract_lane(acc, 2)
      + f32x4_extract_lane(acc, 3)
  } fallback {
    let sum = 0
    for (let i = 0; i < len; i++) sum += a[i] * b[i]
    return sum
  }
}

// --- Demo ---

const SIZE = 1024

// Create test arrays
const arr = new Float32Array(SIZE)
const a = new Float32Array(SIZE)
const b = new Float32Array(SIZE)

for (let i = 0; i < SIZE; i++) {
  arr[i] = i + 1
  a[i] = 1.0
  b[i] = 2.0
}

// Scale
scale(arr, SIZE, 0.5)
console.log('scale([1..1024], 0.5) first 4:', arr[0], arr[1], arr[2], arr[3])

// Dot product: 1.0 * 2.0 * 1024 = 2048
const d = dot(a, b, SIZE)
console.log('dot([1,1,...], [2,2,...], 1024):', d)

// Benchmark
const iters = 1000
const t0 = performance.now()
for (let i = 0; i < iters; i++) scale(arr, SIZE, 1.001)
const elapsed = performance.now() - t0
console.log(`${iters} scale ops on ${SIZE} floats: ${elapsed.toFixed(1)}ms`)
```
