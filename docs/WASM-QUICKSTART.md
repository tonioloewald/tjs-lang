<!--{"parent": "tjs.md", "order": 7}-->

# WASM Quick Start

**Build WASM-accelerated functions in TJS with zero toolchain setup.**

No Emscripten. No Rust. No `.wasm` files. No webpack plugins. Write WASM inline, and the
compiled bytecode is embedded in your JavaScript output. Ship one `.js` file.

## Why TJS for WASM?

The traditional WASM workflow:

1. Install a C/Rust/Go toolchain
2. Write code in a separate language
3. Compile to `.wasm` (configure a build system)
4. Load the `.wasm` file at runtime (async, CORS, bundler config)
5. Marshal data between the JS and WASM heaps (manual, error-prone)
6. Ship multiple files

The TJS workflow:

1. Write `wasm { }` inside your function, with a `fallback { }` in plain JavaScript
2. Run `tjs emit myfile.tjs > myfile.js`
3. Ship the output `.js`

The compiler handles bytecode generation, base64 embedding, memory, and typed-array
marshaling. The output is a single self-contained JavaScript file.

## Your First WASM Block

```tjs:static
function add(! a: 0, b: 0):! 0 {
  return wasm {
    return a + b
  } fallback {
    return a + b
  }
}

test 'computed in WASM' {
  expect(add(3, 4)).toBe(7)
}
```

**What's happening:**

- `wasm { }` is a JavaScript block compiled to WASM bytecode at transpile time. Like any
  JavaScript block it returns only with `return`: a bare `a + b` would compute a value and
  throw it away, so the compiler refuses it.
- `fallback { }` is the same computation in plain JavaScript. It runs where WebAssembly is
  unavailable, and wherever the `wasm` block uses something outside the supported subset (see
  [What compiles to WASM](#what-compiles-to-wasm)). Both must give the same answer.
- `!` marks the function unsafe: its arguments are not type-checked on each call. For a tiny
  kernel that check can cost more than the work.
- `:!` declares the return type without a worked example. A plain `: 0` would be checked as a
  worked example (`add` would have to return `0`), which is not what this function does.

## Running it

TJS's command-line tool runs on [Bun](https://bun.sh). In a project:

```bash
bun add -d tjs-lang
bunx tjs run myfile.tjs              # transpile and run
bunx tjs emit myfile.tjs > myfile.js # emit standalone JavaScript
node myfile.js                       # the output runs anywhere: WASM is embedded as base64
```

## What the Compiler Produces

For `add` above, the emitted JavaScript carries the compiled function as a comment in
WebAssembly text (WAT), followed by the embedded module:

```text
/**
 * WASM: __tjs_wasm_1wub6pu_0 (export: compute_0)
 * (func (export "compute") (param $a f64) (param $b f64) (result f64)
 *   local.get $a
 *   local.get $b
 *   f64.add
 *   return
 * )
 */
```

The module is instantiated synchronously when the file loads, so the first call already
runs in WASM. (If an engine refuses synchronous compilation, it retries asynchronously and
uses the fallback until it is ready.) The WAT comment is generated from the bytecode
actually emitted, so it is a reliable view of what will run.

## Numeric Types

Parameters take their WASM type from their TJS annotation:

| TJS annotation | WASM type | Example |
| --- | --- | --- |
| `0`, `+0` (integer) | `f64` | `function f(x: 0)` |
| `0.0` (number) | `f64` | `function f(x: 0.0)` |
| `Float32Array` (and other typed arrays) | `i32` (a pointer into WASM memory) | `function f(arr: Float32Array, len: 0)` |

Integer parameters are `f64` on purpose. A TJS integer is any whole number JavaScript
represents exactly (up to 2⁵³), and `f64` holds all of them with exactly JavaScript's
arithmetic. A 32-bit `i32` would wrap on overflow (`2e9 + 2e9` would be negative) and trap
on division by zero, so the WASM path and the fallback would disagree.

Inside a block, `let i = 0` declares an `i32`, which is what loop counters and array
offsets want. `/` always means JavaScript's division, even with two integer operands:
`7 / 2` is `3.5` in WASM as in JavaScript. For integer division, write `Math.trunc(a / b)`.

## SIMD: four floats per instruction

`f32x4_*` intrinsics operate on four `float32` values at once:

```tjs:static
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

test 'scales every element' {
  const data = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8])
  scale(data, 8, 10.0)
  expect(Array.from(data)).toEqual([10, 20, 30, 40, 50, 60, 70, 80])
}
```

The loop steps by 4, so `len` must be a multiple of 4. Handle a remainder with a scalar
loop (see [Patterns](#patterns)). The intrinsics map directly to WASM SIMD opcodes: no
auto-vectorization, no surprises.

### Available SIMD intrinsics

| Intrinsic | Operation |
| --- | --- |
| `f32x4_load(arr, byteOffset)` | Load 4 floats from memory |
| `f32x4_store(arr, byteOffset, vec)` | Store 4 floats to memory |
| `f32x4_splat(value)` | Fill all 4 lanes with one value |
| `f32x4_add`, `f32x4_sub`, `f32x4_mul`, `f32x4_div` `(a, b)` | Lane-wise arithmetic |
| `f32x4_min`, `f32x4_max` `(a, b)` | Lane-wise minimum / maximum |
| `f32x4_neg(v)`, `f32x4_sqrt(v)` | Negate / square root of every lane |
| `f32x4_eq`, `f32x4_ne`, `f32x4_lt`, `f32x4_le`, `f32x4_gt`, `f32x4_ge` `(a, b)` | Lane-wise comparison (a mask) |
| `f32x4_select(a, b, mask)` | Per lane, `a` where the mask is set, else `b` |
| `f32x4_extract_lane(vec, N)` | One float from lane `N` (0–3) |
| `f32x4_replace_lane(vec, N, val)` | Set lane `N` |

## Memory

### Regular typed arrays: copied in and out

Pass a normal `Float32Array` and TJS copies it into WASM memory before the call and back
afterwards:

```tjs:static
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

test 'copy-out happens automatically' {
  const data = new Float32Array([1, 2, 3, 4])
  double(data, 4)
  expect(Array.from(data)).toEqual([2, 4, 6, 8])
}
```

That is convenient, but on a large array the copy can cost more than WASM saves, and the
result is SLOWER than the plain JavaScript fallback. When that happens the runtime records a
notice; read them with `__tjs.records({ source: 'wasm' })`.

### `wasmBuffer()`: zero-copy shared memory

For hot paths with large arrays, allocate the array in WASM memory to begin with:

```tjs:static
const positions = wasmBuffer(Float32Array, 1024)

function shift(! arr: Float32Array, len: 0, delta: 0.0) {
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

test 'WASM and JavaScript see the same memory' {
  for (let i = 0; i < 1024; i++) positions[i] = i
  shift(positions, 1024, 0.5)
  expect(positions[0]).toBe(0.5)
  expect(positions[1023]).toBe(1023.5)
}
```

**How it works:** all WASM blocks in a file share one `WebAssembly.Memory` (64MB).
`wasmBuffer` is a bump allocator that hands out views into it. When a typed array's
`.buffer` is the WASM memory's buffer, the wrapper skips the copy and passes the byte offset.

**Supported types:** `Float32Array`, `Float64Array`, `Int32Array`, `Uint8Array`.

**Trade-off:** `wasmBuffer` allocations are permanent (a bump allocator, no `free`). Use them
for long-lived buffers, not temporary scratch space.

## What compiles to WASM

A `wasm { }` block is a JavaScript subset: numeric locals (`let`), arithmetic and comparison,
`if`, `for`, `return`, typed-array element access (`arr[i]`), the SIMD intrinsics above, and
`Math.abs`, `ceil`, `floor`, `trunc`, `sqrt`, `min` and `max`.

Anything else (an object, a string, a call to your own function, `Math.sin`) means the block
**does not compile, and the fallback runs instead**, with a warning in the transpile result
(`result.warnings`). The program still works, at JavaScript speed. Check the warnings when a
block is meant to be fast. [WASM in TJS](../DOCS-WASM.md) has the full reference.

A block returns a number (`f64`) or nothing.

## Patterns

### Dot product (horizontal SIMD reduction)

```tjs:static
function dot(! a: Float32Array, b: Float32Array, len: 0):! 0.0 {
  return wasm {
    let acc = f32x4_splat(0.0)
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      acc = f32x4_add(acc, f32x4_mul(f32x4_load(a, off), f32x4_load(b, off)))
    }
    return f32x4_extract_lane(acc, 0) + f32x4_extract_lane(acc, 1)
      + f32x4_extract_lane(acc, 2) + f32x4_extract_lane(acc, 3)
  } fallback {
    let sum = 0
    for (let i = 0; i < len; i++) sum += a[i] * b[i]
    return sum
  }
}

test 'dot product' {
  const a = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8])
  const b = new Float32Array([1, 1, 1, 1, 2, 2, 2, 2])
  expect(dot(a, b, 8)).toBe(62)
}
```

### Rescale an array to [0, 1]

Find the minimum and maximum with scalar reads, then rescale four values at a time:

```tjs:static
function rescale(! arr: Float32Array, len: 0) {
  wasm {
    let min = arr[0]
    let max = arr[0]
    for (let i = 1; i < len; i++) {
      min = Math.min(min, arr[i])
      max = Math.max(max, arr[i])
    }
    if (max > min) {
      let lo = f32x4_splat(min)
      let inv = f32x4_splat(1.0 / (max - min))
      for (let i = 0; i < len; i += 4) {
        let off = i * 4
        f32x4_store(arr, off, f32x4_mul(f32x4_sub(f32x4_load(arr, off), lo), inv))
      }
    }
  } fallback {
    let min = arr[0]
    let max = arr[0]
    for (let i = 1; i < len; i++) {
      min = Math.min(min, arr[i])
      max = Math.max(max, arr[i])
    }
    if (max > min) for (let i = 0; i < len; i++) arr[i] = (arr[i] - min) / (max - min)
  }
}

test 'rescales to [0, 1]' {
  const data = new Float32Array([-10, 0, 10, 30])
  rescale(data, 4)
  expect(Array.from(data)).toEqual([0, 0.25, 0.5, 1])
}
```

## Tips

- **Always provide a `fallback`.** It is your safety net, and it makes the code testable
  without WASM.
- **Check `result.warnings`** when a block is meant to be fast: a block that did not compile
  runs its fallback silently otherwise.
- **Align to 4 elements** for SIMD, or finish the remainder with a scalar loop.
- **Use `wasmBuffer` for large arrays in hot loops**: copying a regular array in and out can
  cost more than WASM saves.
- **WASM blocks share memory per file**: all blocks in one `.tjs` file use the same 64MB
  `WebAssembly.Memory`.

## Limitations

- Calls inside a block are limited to the SIMD intrinsics and the `Math` functions above.
  To compose WASM across functions and files, use `wasm function` declarations
  ([WASM in TJS](../DOCS-WASM.md)).
- A block returns a number (`f64`) or nothing.
- `wasmBuffer` allocations are permanent (bump allocator).
- SIMD is `f32` only (`f32x4`): no `i32x4` or `f64x2` yet.

## Next Steps

- [WASM in TJS](../DOCS-WASM.md): the full reference, including `wasm function`
  declarations, cross-file composition and the `tjs-lang/linalg` kernels.
- [WASM Basics](../guides/examples/tjs/wasm-basics.md): integer math, floats, array processing.
- [WASM SIMD](../guides/examples/tjs/wasm-simd.md): SIMD patterns and benchmarking.
- [WASM Memory](../guides/examples/tjs/wasm-memory.md): marshaling and `wasmBuffer()` in depth.
- [WASM Functions](../guides/examples/tjs/wasm-functions.md): `wasm function` declarations.
- [WASM Starfield](../guides/examples/tjs/wasm-starfield.md): 50K SIMD-accelerated particles.
- [WASM Vector Search](../guides/examples/tjs/wasm-vector-search.md): SIMD cosine similarity
  against JavaScript.
