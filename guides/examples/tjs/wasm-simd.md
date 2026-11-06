<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 26, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# WASM SIMD

A `wasm { }` block inside a function is compiled to WebAssembly when the file is
transpiled. Its `fallback { }` is the same logic in plain JavaScript, used where WebAssembly
cannot run. There is no toolchain to install: the transpiler builds the module.

This page is about SIMD inside those blocks. Inside a `wasm { }` block, the `f32x4_*`
**intrinsics** (built-in functions that the compiler turns into a single SIMD instruction
rather than a function call) work on four 32-bit floats at once. An `f32x4` value holds four
floats, called **lanes**.

For more detail on `wasm { }` blocks themselves, see the
**[WASM Quick Start](/WASM-QUICKSTART/)** and [WASM Basics](/wasm-basics/). The full list of
intrinsics is in [DOCS-WASM, under "SIMD intrinsics"](/DOCS-WASM/#simd-intrinsics).

## The intrinsics used here

| Intrinsic                        | What it does                                                              |
| -------------------------------- | ------------------------------------------------------------------------- |
| `f32x4_splat(x)`                 | Makes a vector with `x` in all four lanes.                                |
| `f32x4_load(arr, byteOffset)`    | Reads four floats from `arr`, starting `byteOffset` bytes in.             |
| `f32x4_store(arr, byteOffset, v)`| Writes the four lanes of `v` into `arr`, starting `byteOffset` bytes in.  |
| `f32x4_extract_lane(v, n)`       | Reads lane `n` (0 to 3) of `v` as a single float.                         |
| `f32x4_add(a, b)`, `f32x4_mul(a, b)`, `f32x4_min`, `f32x4_max`, … | Lane-by-lane arithmetic: lane 0 with lane 0, and so on. |
| `f32x4_lt(a, b)`, `f32x4_gt`, …  | Lane-by-lane comparison, producing a mask (see below).                   |
| `f32x4_select(mask, a, b)`       | Takes each lane from `a` where the mask is set, from `b` where it is not. |

The rest of the list works the same way, in the same four groups: memory and lanes,
arithmetic, comparisons, and select.

## Reading the signatures

The examples below use TJS signatures, which are not TypeScript:

```javascript
function scale(! arr: Float32Array, len: 0, factor: 0.0) { … }
function dot(! a: Float32Array, b: Float32Array, len: 0):! 0.0 { … }
```

- **A colon value is an example, not a default.** `len: 0` means "a required integer";
  `factor: 0.0` means "a required float" (the `.0` is what makes it a float).
- **`!` at the start of the parameter list turns off runtime argument checks for every
  parameter of the function** ([Safety markers](/TJS-SYNTAX/#safety-markers)). Without it, a
  call such as `scale(xs, 'x', 2.0)` returns a type error instead of running. These functions
  are meant for hot loops whose callers already pass the right values, so the checks are
  switched off for speed.
- **`Float32Array` is not checked either way.** TJS cannot turn that name into a runtime
  check, so `arr` is unchecked even without `!`. A plain array passed in is silently ignored:
  no error, and its values do not change. Callers must pass a real `Float32Array`.
- **`:! 0.0` declares a float return value that is not checked or tested.** A plain `: 0.0`
  would be a worked example: TJS would call `dot` with example arguments and expect `0.0`
  back.

The examples below are live: each runs in its own scope, so names do not clash between them.

```tjs:inline
/#
## SIMD: Single Instruction, Multiple Data

Each step of these loops handles four floats with one instruction.
#/

// --- Scale an array by a constant (SIMD: 4 elements per step) ---

function scale(! arr: Float32Array, len: 0, factor: 0.0) {
  wasm {
    let s = f32x4_splat(factor)
    // Steps by 4, so len must be a multiple of 4
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
// → scale([1..1024], 0.5) first 4: 0.5 1 1.5 2

// Dot product: 1.0 * 2.0 * 1024 = 2048
const d = dot(a, b, SIZE)
console.log('dot([1,1,...], [2,2,...], 1024):', d)
// → dot([1,1,...], [2,2,...], 1024): 2048

// --- Benchmark ---
// Run until at least minMs of wall clock has elapsed, then divide. Timing a single
// sub-millisecond call does not work: some browsers clamp `performance.now()` to about
// 1ms, so a fast call reads as 0.
function timePerOp(fn, minMs = 25) {
  let iters = 0
  const start = performance.now()
  do {
    fn()
    iters++
  } while (performance.now() - start < minMs)
  return (performance.now() - start) / iters
}

function report(label, data) {
  // A factor near 1, so thousands of repeated calls don't drive the values to 0 or Infinity
  const simd = timePerOp(() => scale(data, SIZE, 1.001))
  // Switch every wasm block to its fallback, time the same calls, switch back
  globalThis.__tjs_wasm_enabled = false
  const js = timePerOp(() => scale(data, SIZE, 1.001))
  globalThis.__tjs_wasm_enabled = true
  console.log(`${label}: SIMD ${(simd * 1000).toFixed(2)}us, JS ${(js * 1000).toFixed(2)}us per call`)
}

// `arr` is an ordinary Float32Array: it is copied into WASM memory and back on every call
report('copied Float32Array', arr)

// A wasmBuffer array already lives in WASM memory, so nothing is copied
const shared = wasmBuffer(Float32Array, SIZE)
shared.set(arr)
report('wasmBuffer array    ', shared)
```

`/# … #/` is a TJS doc comment: its contents are markdown, which the playground and the doc
site render above the code ([Doc comments](/TJS-SYNTAX/#doc-comments-)).

## What the example shows

Every `f32x4_*` intrinsic works on all four lanes at once, so a loop that steps `i += 4` does
a quarter of the iterations a scalar loop would. That also means **the length must be a
multiple of 4**: the loop reads and writes four floats per step and has no tail loop.
1024 is.

Read the loops with these things in mind:

- **Offsets are in bytes, indexes are in elements.** `f32x4_load(arr, off)` takes a byte
  offset, and a float is 4 bytes, hence `let off = i * 4`. Getting this wrong usually does not
  fail loudly: it reads the wrong floats.
- **`f32x4_splat` builds the constant once, outside the loop.** It copies `factor` into all
  four lanes of `s`, and `scale` multiplies every group of four by that same `s`.
- **A reduction ends with a horizontal sum.** `dot` accumulates four partial sums in one
  vector, then adds the four lanes with `f32x4_extract_lane`.
- **A `wasm { }` block can produce a value.** Write `return` inside the block (and inside
  `fallback`) to give the block its value, and put `return wasm { … }` in the function to pass
  that value out, as `dot` does. Without an inner `return` the block produces nothing, as in
  `scale`. A bare expression on the block's last line does not count; it is a compile error.
- **A lane index is a literal.** `f32x4_extract_lane(acc, 0)` works; passing a variable as the
  lane does not compile, because the lane is encoded into the instruction itself. It must be
  0, 1, 2 or 3.
- **The `fallback { }` is the same algorithm in plain JavaScript.** It runs only where WASM
  cannot (no `WebAssembly` at all, as in iOS Lockdown Mode) or when you switch WASM off. It
  is not a safety net for code that does not compile: a `wasm { }` block outside the
  supported subset is a build error, naming the construct.

### Reading the benchmark

A WebAssembly module has its own **memory**: a separate block of bytes that the module can
read and write directly. It cannot read a JavaScript array where it lies, so when `scale` is
given an ordinary `Float32Array`, the generated wrapper copies the array's bytes into WASM
memory, runs the loop, and copies them back.

`wasmBuffer(Type, length)` allocates a typed array *inside* WASM memory instead, so the
wrapper hands the module its address and copies nothing.

> **`wasmBuffer` allocations are never freed.** Allocate once and reuse the array; calling
> `wasmBuffer` on every call of a long-running program leaks. See
> [WASM Memory](/wasm-memory/).

The benchmark times `scale` twice for each array: once in WASM, and once with
`globalThis.__tjs_wasm_enabled = false`. That is a documented switch for "WASM vs JS"
comparisons: while it is `false`, every `wasm { }` block in the page (or process) runs its
`fallback`, even though the WASM is loaded. Set it back to `true` afterwards, as `report`
does.

One illustrative run (2026-11-06, Apple M5 Max, Bun 1.4.2; your numbers will differ):

```text
copied Float32Array: SIMD 0.73us, JS 0.29us per call
wasmBuffer array    : SIMD 0.24us, JS 0.28us per call
```

With an ordinary `Float32Array`, the SIMD version is *slower* than the JavaScript loop.
`scale` does one multiply per float, and each call first copies all 1024 floats into WASM
memory and then copies them back out. That copying costs more than the multiplies save. The
`wasmBuffer` array removes the copy, which makes the SIMD call about three times faster than
the copied one, and level with or a little faster than plain JavaScript. The general lesson:
SIMD pays when there is enough arithmetic per byte moved, or when the data stays in WASM
memory between calls.

The runtime tells you about the copy. The first time a function is handed a typed array
outside WASM memory, it adds a notice to `globalThis.__tjs.records({ source: 'wasm' })`
saying the array is being copied in and out on every call. `globalThis.__tjs` is the
runtime's flight recorder ([Error History](/error-history/)); read it through `globalThis`,
because a bare `__tjs` inside a `.tjs` file is that file's own runtime and does not see
these entries.

## Branch-free decisions: compare, mask, select

SIMD has no per-lane `if`. Instead a comparison produces a **mask**: in each lane where the
comparison is true, every bit is set, and in each lane where it is false, every bit is clear.
A set lane is not the number 1.0 (read as a float it is `NaN`), so a mask is not something to
log or multiply by. It is meant to be passed to `f32x4_select(mask, a, b)`, which takes each
lane from `a` where the mask is set and from `b` where it is not. For the common case of
clamping, `f32x4_min` and `f32x4_max` do the job without a mask.

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

const clamped = new Float32Array([-0.5, 0.25, 0.75, 1.5, 2, -3, 0.5, 1])
clamp01(clamped, clamped.length)
console.log('clamp01:', Array.from(clamped).join(', '))
// → clamp01: 0, 0.25, 0.75, 1, 1, 0, 0.5, 1

const rectified = new Float32Array([-1, 2, -3, 4, 5, -6, 7, -8])
relu(rectified, rectified.length)
console.log('relu:   ', Array.from(rectified).join(', '))
// → relu:    0, 2, 0, 4, 5, 0, 7, 0

// Length 6 is not a multiple of 4: run SIMD on the first 4, finish the tail in JS
const ragged = new Float32Array([-1, 2, -3, 4, -5, 6])
const whole = ragged.length - (ragged.length % 4)
relu(ragged, whole)
for (let i = whole; i < ragged.length; i++) if (ragged[i] < 0) ragged[i] = 0
console.log('relu with a tail:', Array.from(ragged).join(', '))
// → relu with a tail: 0, 2, 0, 4, 0, 6
```

`relu` compares each value with zero, giving a mask that is set in the negative lanes, then
selects `zero` in those lanes and the original value everywhere else. The same pattern
handles any per-lane choice: saturating, or replacing out-of-range values.

## Limits

- **Lengths must be a multiple of 4.** A SIMD loop reads and writes four floats per step, and
  there is no automatic tail loop. Nothing checks this, and breaking it does not fail
  loudly. With an ordinary typed array, the last step reads and writes past the end of the
  copy inside WASM memory; those writes are not copied back, so they are lost. With a
  `wasmBuffer` array, the same step writes into whatever was allocated next, which silently
  corrupts a neighbouring array. Either pad your arrays (zeros are harmless in a sum or a dot
  product) or finish the last one to three elements in JavaScript, as the last lines above
  do.
- **SIMD loads need a typed-array parameter, and should get a `Float32Array`.** A plain
  array, or a parameter typed by an example such as `[0.0]`, is not a pointer into WASM
  memory, and the build stops with "is not a typed array parameter". Other typed arrays
  (`Float64Array`, `Int32Array`, `Uint8Array`) compile, but `f32x4_load` reads their bytes as
  32-bit floats without converting them, so the results are wrong.
- **Only `f32x4`.** There are no integer or `f64x2` lane types yet.
- **The `'wasm'` records hold two kinds of entry.** A *warning* when a file's blocks fall back
  to JavaScript because WebAssembly is unavailable or the module failed to instantiate, and a
  *notice* the first time a function is handed a typed array outside WASM memory (see
  "Reading the benchmark"). All current browsers, Node and Bun support WebAssembly SIMD, so
  on a normal setup you will see only the notices. Read them with
  `globalThis.__tjs.records({ source: 'wasm' })`.
