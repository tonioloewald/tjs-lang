<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 26, "parent": "tjs-patterns.md"}-->

# WASM SIMD

> New to WASM in TJS? Start with the **[WASM Quick Start](https://github.com/tonioloewald/tjs-lang/blob/main/docs/WASM-QUICKSTART.md)**.

Process 4 floats per instruction. No setup, no toolchain.

```tjs:inline
/#
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
| `f32x4_min(a, b)` / `f32x4_max(a, b)` | Lane-wise minimum / maximum |
| `f32x4_eq`, `ne`, `lt`, `gt`, `le`, `ge` | Compare 4 pairs, giving a lane mask |
| `f32x4_select(mask, a, b)` | `a` where the mask is set, else `b` |
| `f32x4_extract_lane(vec, lane)` | Get one float (0-3) |
| `f32x4_replace_lane(vec, lane, val)` | Set one float |
#/

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
    return f32x4_extract_lane(acc, 0)
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
// Measure per-op time by running until at least minMs of wall clock has elapsed,
// then dividing. Timing a single sub-millisecond pass does not work: Firefox clamps
// `performance.now()` to ~1ms for fingerprinting resistance, so a fast result reads
// as 0.00ms — and on hardware faster than whatever the iteration count was tuned for,
// a fixed count drifts back under the clock all by itself.
function timePerOp(fn, minMs = 25) {
  let iters = 0
  const start = performance.now()
  do {
    fn()
    iters++
  } while (performance.now() - start < minMs)
  return (performance.now() - start) / iters
}

const perOp = timePerOp(() => scale(arr, SIZE, 1.001))
console.log(`scale on ${SIZE} floats: ${(perOp * 1000).toFixed(1)}us per op`)
console.log(`  (${(SIZE / perOp / 1000).toFixed(1)} million floats/sec)`)
```

<!-- TODO review -->
## What the example shows

An `f32x4` value is a 128-bit WebAssembly SIMD register holding four 32-bit floats, called
**lanes**. Every `f32x4_*` intrinsic works on all four lanes at once, so a loop that steps
`i += 4` does a quarter of the iterations a scalar loop would.

Read the loops with three things in mind:

- **Offsets are in bytes, indexes are in elements.** `f32x4_load(arr, off)` takes a byte
  offset, and a float is 4 bytes, hence `let off = i * 4`. Getting this wrong usually does not
  fail loudly: it reads the wrong floats.
- **`f32x4_splat` builds a constant once, outside the loop.** `scale` multiplies every group
  of four by the same four-lane `s`.
- **A reduction ends with a horizontal sum.** `dot` accumulates four partial sums in one
  register, then adds the four lanes with `f32x4_extract_lane` and returns the total. The
  block must `return` it: a trailing expression on its own returns nothing.

The benchmark at the end runs `scale` repeatedly for at least 25ms and divides, because a
single sub-millisecond call is below the resolution some browsers give `performance.now()`.

<!-- TODO review -->
## Branch-free decisions: compare, mask, select

SIMD has no per-lane `if`. Instead a comparison produces a **mask** (all ones in each lane
where it is true, all zeros where it is false), and `f32x4_select(mask, a, b)` picks from `a`
or `b` lane by lane. `f32x4_min` and `f32x4_max` cover the common case of clamping.

```tjs:inline
// Clamp every value into [0, 1], four lanes at a time
function clamp01(! xs: Float32Array, len: 0) {
  wasm {
    let lo = f32x4_splat(0.0)
    let hi = f32x4_splat(1.0)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      let v = f32x4_load(xs, off)
      f32x4_store(xs, off, f32x4_min(f32x4_max(v, lo), hi))
    }
  } fallback {
    for (let i = 0; i < len; i++) xs[i] = Math.min(Math.max(xs[i], 0), 1)
  }
}

// Replace negatives with zero using a lane mask and select
function relu(! xs: Float32Array, len: 0) {
  wasm {
    let zero = f32x4_splat(0.0)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      let v = f32x4_load(xs, off)
      let negative = f32x4_lt(v, zero)
      f32x4_store(xs, off, f32x4_select(negative, zero, v))
    }
  } fallback {
    for (let i = 0; i < len; i++) if (xs[i] < 0) xs[i] = 0
  }
}

const a = new Float32Array([-0.5, 0.25, 0.75, 1.5, 2, -3, 0.5, 1])
clamp01(a, a.length)
console.log('clamp01:', Array.from(a).join(', '))

const b = new Float32Array([-1, 2, -3, 4, 5, -6, 7, -8])
relu(b, b.length)
console.log('relu:   ', Array.from(b).join(', '))

// Length 6 is not a multiple of 4: run SIMD on the first 4, finish the tail in JS
const c = new Float32Array([-1, 2, -3, 4, -5, 6])
const whole = c.length - (c.length % 4)
relu(c, whole)
for (let i = whole; i < c.length; i++) if (c[i] < 0) c[i] = 0
console.log('relu with a tail:', Array.from(c).join(', '))
```

<!-- TODO review -->
## Limits

- **Lengths must be a multiple of 4.** A SIMD loop reads and writes four floats per step, and
  there is no automatic tail loop. Either pad your arrays (zeros are harmless in a sum or a
  dot product) or finish the last one to three elements in JavaScript, as the last lines
  above do.
- **SIMD loads need a typed array.** Annotate the parameter `Float32Array`. A plain array, or
  a parameter typed by an example such as `[0.0]`, is not a pointer into WASM memory, and a
  SIMD load from it does not compile.
- **Only `f32x4`.** There are no integer or `f64x2` lane types yet.
- **SIMD is a baseline requirement.** All current browsers, Node and Bun support WebAssembly
  SIMD; where it is missing, the `fallback` runs and the event is recorded in
  `__tjs.records({ source: 'wasm' })`.

Copying a regular `Float32Array` into WASM memory and back on every call costs time too. The
next chapter, [WASM Memory](/wasm-memory/), shows how `wasmBuffer()` removes that copy.
