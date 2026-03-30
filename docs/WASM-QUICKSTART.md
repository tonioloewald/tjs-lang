# WASM Quick Start

**Build WASM-accelerated libraries in TJS with zero toolchain setup.**

No Emscripten. No Rust. No `.wasm` files. No webpack plugins. Write WASM inline,
get compiled bytecode embedded in your JavaScript output. Ship one `.js` file.

## Why TJS for WASM?

The traditional WASM workflow:

1. Install a C/Rust/Go toolchain
2. Write code in a separate language
3. Compile to `.wasm` (configure build system)
4. Load the `.wasm` file at runtime (async, CORS, bundler config)
5. Marshal data between JS and WASM heaps (manual, error-prone)
6. Ship multiple files

The TJS workflow:

1. Write `wasm { }` inside your function
2. Run `tjs emit myfile.tjs`
3. Ship the output `.js`

That's it. The compiler handles bytecode generation, base64 embedding, memory
management, and typed array marshaling. Your output is a single self-contained
JavaScript file.

## Your First WASM Block

```tjs
function add(! a: 0, b: 0) -! 0 {
  return wasm {
    a + b
  } fallback {
    return a + b
  }
}

console.log(add(3, 4))  // 7 — computed in WASM
```

**What's happening:**

- `wasm { }` — JS-like syntax compiled to WASM bytecode at transpile time
- `fallback { }` — JS fallback if WASM isn't available (e.g., older runtimes)
- `!` — unsafe marker, skips runtime type checking for speed
- `-!` — assert-returns, the return type contract

Run it:

```bash
bun src/cli/tjs.ts run myfile.tjs
```

Or emit standalone JS:

```bash
bun src/cli/tjs.ts emit myfile.tjs > myfile.js
node myfile.js  # works anywhere — WASM is embedded as base64
```

## What the Compiler Produces

For the `add` function above, `tjs emit` generates something like:

```javascript
/**
 * WASM: __tjs_wasm_0
 * (func $compute (param $a f64) (param $b f64) (result f64)
 *   local.get 0
 *   local.get 1
 *   f64.add
 * )
 */
;(async()=>{
  // ... base64 decode, instantiate, register globalThis.__tjs_wasm_0
})();

function add(a, b) {
  // calls __tjs_wasm_0(a, b) with fallback
}
```

The WAT (WebAssembly Text) is included as a comment so you can inspect what was
compiled. The binary is embedded as base64 — no external files.

## Numeric Types

WASM blocks infer types from TJS parameter annotations:

| TJS annotation | WASM type | Example |
|---------------|-----------|---------|
| `0` | `i32` (integer) | `function f(x: 0)` |
| `0.0` | `f64` (float) | `function f(x: 0.0)` |
| `+0` | `i32` (non-negative) | `function f(x: +0)` |
| `Float32Array` | `i32` (pointer) | `function f(arr: Float32Array, len: 0)` |

Integers use `i32`, floats use `f64`. Typed arrays are passed as memory pointers
(the compiler handles marshaling automatically).

## SIMD: 4x Throughput

Process 4 float32 values per instruction using `f32x4_*` intrinsics:

```tjs
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

const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8])
scale(data, 8, 10.0)
console.log(Array.from(data))  // [10, 20, 30, 40, 50, 60, 70, 80]
```

### Available SIMD Intrinsics

| Intrinsic | Operation |
|-----------|-----------|
| `f32x4_load(arr, byteOffset)` | Load 4 floats from memory |
| `f32x4_store(arr, byteOffset, vec)` | Store 4 floats to memory |
| `f32x4_splat(value)` | Fill all 4 lanes with one value |
| `f32x4_add(a, b)` | Lane-wise addition |
| `f32x4_sub(a, b)` | Lane-wise subtraction |
| `f32x4_mul(a, b)` | Lane-wise multiplication |
| `f32x4_div(a, b)` | Lane-wise division |
| `f32x4_neg(v)` | Negate all lanes |
| `f32x4_sqrt(v)` | Square root of all lanes |
| `f32x4_extract_lane(vec, N)` | Get one float (lane 0-3) |
| `f32x4_replace_lane(vec, N, val)` | Set one float in lane |

These map directly to WASM SIMD opcodes — no auto-vectorization, no surprises.

## Memory Management

### Regular typed arrays: automatic copy

Pass a normal `Float32Array` and TJS copies it into WASM memory before the call,
copies results back after. Zero effort:

```tjs
function double(! arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      let v = f32x4_load(arr, off)
      f32x4_store(arr, off, f32x4_add(v, v))
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
}

const data = new Float32Array([1, 2, 3, 4])
double(data, 4)
// data is [2, 4, 6, 8] — copy-out happened automatically
```

### `wasmBuffer()`: zero-copy shared memory

For hot paths with large arrays, eliminate the copy overhead:

```tjs
const positions = wasmBuffer(Float32Array, 100000)

// JS writes directly to WASM memory
for (let i = 0; i < 100000; i++) positions[i] = Math.random()

// WASM reads/writes the same memory — no copy
function process(! arr: Float32Array, len: 0, delta: 0.0) {
  wasm {
    let vd = f32x4_splat(delta)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      f32x4_store(arr, off, f32x4_add(f32x4_load(arr, off), vd))
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] += delta
  }
}

process(positions, 100000, 0.01)
// JS sees mutations immediately — same backing memory
```

**How it works:** All WASM blocks in a file share one `WebAssembly.Memory` (64MB).
`wasmBuffer` is a bump allocator that hands out views into this memory. When a
typed array's `.buffer === wasmMemory.buffer`, the wrapper skips the copy and
passes the byte offset directly.

**Supported types:** `Float32Array`, `Float64Array`, `Int32Array`, `Uint8Array`

**Trade-off:** `wasmBuffer` allocations are permanent (bump allocator, no free).
Use them for long-lived buffers, not temporary scratch space.

## Patterns

### Dot product (horizontal SIMD reduction)

```tjs
function dot(! a: Float32Array, b: Float32Array, len: 0) -! 0.0 {
  return wasm {
    let acc = f32x4_splat(0.0)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      acc = f32x4_add(acc, f32x4_mul(f32x4_load(a, off), f32x4_load(b, off)))
    }
    f32x4_extract_lane(acc, 0) + f32x4_extract_lane(acc, 1)
      + f32x4_extract_lane(acc, 2) + f32x4_extract_lane(acc, 3)
  } fallback {
    let sum = 0
    for (let i = 0; i < len; i++) sum += a[i] * b[i]
    return sum
  }
}
```

### Normalize array to [0, 1]

```tjs
function normalize(! arr: Float32Array, len: 0) {
  wasm {
    let max = 0.0
    for (let i = 0; i < len; i++) {
      let off = i * 4
      let v = f32x4_extract_lane(f32x4_load(arr, off), 0)
      if (v > max) { max = v }
    }
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
```

## Tips

- **Always provide a `fallback`** — it's your safety net and makes code testable
  without WASM
- **Use `!` (unsafe) on WASM functions** — type checking overhead defeats the
  purpose of dropping to WASM
- **Align to 4 elements** for SIMD — `f32x4` processes 4 floats at a time; pad
  arrays to multiples of 4
- **Use `wasmBuffer` for hot loops** — the copy overhead of regular arrays can
  negate WASM's speed advantage for large data
- **WASM blocks share memory per file** — all blocks in one `.tjs` file use the
  same 64MB `WebAssembly.Memory`
- **Check the WAT comments** — the compiler includes human-readable WAT in the
  output so you can verify what was compiled

## Limitations

- No function calls inside WASM blocks (only intrinsics and arithmetic)
- No imports/exports beyond the function itself
- `wasmBuffer` allocations are permanent (bump allocator)
- Array lengths must be multiples of 4 for SIMD operations
- SIMD is f32 only (f32x4) — no i32x4, f64x2, etc. yet

## Next Steps

- **[WASM Basics](https://github.com/tonioloewald/tjs-lang/blob/main/guides/examples/tjs/wasm-basics.md)** — Runnable examples: integer math, floats, array processing
- **[WASM SIMD](https://github.com/tonioloewald/tjs-lang/blob/main/guides/examples/tjs/wasm-simd.md)** — SIMD patterns: scale, dot product, benchmarking
- **[WASM Memory](https://github.com/tonioloewald/tjs-lang/blob/main/guides/examples/tjs/wasm-memory.md)** — Data marshaling deep dive, `wasmBuffer()` patterns
- **[WASM Starfield](https://github.com/tonioloewald/tjs-lang/blob/main/guides/examples/tjs/wasm-starfield.md)** — Full demo: 50K SIMD-accelerated particles
- **[WASM Vector Search](https://github.com/tonioloewald/tjs-lang/blob/main/guides/examples/tjs/wasm-vector-search.md)** — Benchmark: SIMD cosine similarity vs JS scalar
- **[TJS Language Guide — WASM section](https://github.com/tonioloewald/tjs-lang/blob/main/DOCS-TJS.md)** — Complete language reference
