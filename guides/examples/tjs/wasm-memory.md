<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 27, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# WASM Memory

> New to WASM in TJS? Start with the **[WASM Quick Start](/WASM-QUICKSTART/)**.
> [`DOCS-WASM.md`](/DOCS-WASM/) is the reference; its "Memory discipline" section states the
> rules this chapter puts to work.

WebAssembly code can read and write only its own **linear memory**: one flat block of bytes,
separate from the rest of the JavaScript heap. Whatever a `wasm { }` block works on has to be
in that memory when the block runs. TJS moves values there for you, in one of three ways:

- **Numbers pass straight through.** A number parameter becomes a WASM parameter. Nothing is
  copied or allocated.
- **An ordinary typed array is copied.** The wrapper TJS generates copies it into WASM memory
  before the call and copies it back afterwards, so the block's changes reach your array.
- **A `wasmBuffer()` array is not copied.** `wasmBuffer(Float32Array, n)` allocates the array
  inside WASM memory, so JavaScript and WASM read and write the same bytes.

The first example shows both array paths, and what the runtime says about the first one.

```tjs:inline
// Adds 1 to the first len floats of arr, four at a time. len must be a multiple of 4.
// The ! turns off the parameter checks for this whole function (see below).
function addOne(! arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i += 4) {
      let off = i * 4 // f32x4 load/store take a BYTE offset: 4 bytes per float
      f32x4_store(arr, off, f32x4_add(f32x4_load(arr, off), f32x4_splat(1.0)))
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] += 1
  }
}

// WASM notices go to the global runtime's flight recorder, not to this file's own
// __tjs (see "Read it from globalThis.__tjs" below).
globalThis.__tjs.clearRecords()

// 1. An ordinary Float32Array: copied into WASM memory and back on every call.
const regular = new Float32Array([10, 20, 30, 40])
addOne(regular, 4)
addOne(regular, 4)
console.log('regular, after two calls:', Array.from(regular).join(', '))

// 2. A wasmBuffer array: its bytes ARE WASM memory, so nothing is copied.
const shared = wasmBuffer(Float32Array, 4)
shared.set([100, 200, 300, 400])
addOne(shared, 4)
console.log('shared, after one call:  ', Array.from(shared).join(', '))
console.log('shared is a Float32Array:', shared instanceof Float32Array)

// 3. The runtime noticed the copies, and wrote it down once.
for (const r of globalThis.__tjs.records({ source: 'wasm', severity: 'notice' })) {
  console.log(`[${r.severity}] copied param '${r.data.param}' (${r.data.bytes} bytes)`)
}
```

It prints:

```text
regular, after two calls: 12, 22, 32, 42
shared, after one call:   101, 201, 301, 401
shared is a Float32Array: true
[notice] copied param 'arr' (16 bytes)
```

## What the example shows

Both arrays end up changed, so from the outside the two paths look the same. The difference
is what happens on each call.

`addOne(regular, 4)` copies the 16 bytes of `regular` into WASM memory, runs the block, and
copies the 16 bytes back. It does that on every call. For 4 floats the cost is nothing; for a
large array called in a loop, two copies per call can cost more than the arithmetic.

`wasmBuffer(Float32Array, 4)` returns an ordinary `Float32Array` (it works with `set`,
`Array.from`, indexing and everything else), but its `.buffer` is WASM memory. When the
wrapper sees that, it passes the array's position in memory and copies nothing.

Inside the block, `f32x4_load` and `f32x4_store` take a **byte** offset into memory, not an
element index. The loop counts floats (`i += 4`), so the offset is `i * 4`.

The `!` at the start of the parameter list turns off every parameter check in the function,
not only the check on `arr`. Here that means `len` is no longer checked as an integer, which
a kernel called in a hot loop with known inputs does not need. `Float32Array` is not checked
at runtime in any case: in an ordinary signature it tells the `wasm` block that `arr` is a
typed array, and without the `!` TJS warns that it leaves that parameter unchecked. See
[Safety markers](/TJS-SYNTAX/#safety-markers).

These blocks are small, so they compile synchronously when the file loads and the first call
already runs in WASM. The exception is a browser main thread with a module over 4KB, which
runs the `fallback { }` until the module is ready; `await globalThis.__tjs_wasm_ready()`
waits for it (DOCS-WASM, "Runtime: readiness, failures, and the enable toggle").

### The flight recorder notices the copy

A copied array is not an error, so nothing throws and every test passes. That is why the
runtime writes it down: the first time a WASM block is handed an array outside WASM memory,
it adds a `notice` to the [Flight Recorder](/error-history/) with `source: 'wasm'`. The
record's `data` names the first copied parameter (`param`) and its size in bytes (`bytes`),
and its message says what to do: allocate the array with `wasmBuffer()`. The message and
`data.fn` name the block by an internal id (such as `__tjs_wasm_1anfoz_0`), not by the
function you wrote, which is why the example prints only `param` and `bytes`.

It records once per block, not once per call and not once per parameter. The example calls
`addOne(regular, 4)` twice and gets one record. A later call that copies a different
parameter of the same block adds nothing. A recorder that wrote on every call of a hot kernel
would become the slowdown it exists to report.

Two details matter when you look for this record:

- **Read it from `globalThis.__tjs`.** The WASM wrapper writes to the installed runtime.
  Inside a `.tjs` file, a bare `__tjs` is that file's own runtime instance, and its
  `records()` does not include the WASM notices.
- **The copy notice appears only when the WASM ran.** When a block runs its `fallback { }`
  nothing is copied, so there is no copy notice. Why it fell back decides whether anything
  else is recorded. A runtime with no WebAssembly, or a module that fails to instantiate,
  records one `warning` with the same `source: 'wasm'` (the example's `severity: 'notice'`
  filter leaves it out). A browser still compiling the module asynchronously records nothing.

## What a copy costs

The next example times one read-only kernel over 100,000 floats, once with an ordinary
`Float32Array` and once with a `wasmBuffer` array. The kernel only reads, so every call does
the same work and the only difference is the copy.

```tjs:inline
// Adds up the first len values of arr. It only reads, so every call does the same work.
// total starts at 0.0, not 0: inside a wasm block `let total = 0` would be an integer.
function sum(! arr: Float32Array, len: 0) {
  return wasm {
    let total = 0.0
    for (let i = 0; i < len; i++) total += arr[i]
    return total
  } fallback {
    let total = 0.0
    for (let i = 0; i < len; i++) total += arr[i]
    return total
  }
}

// Run fn until at least minMs of wall clock has passed, then divide. A single
// sub-millisecond call cannot be timed: some browsers round performance.now()
// to about 1ms, so it would read as zero.
function timePerOp(fn, minMs = 50) {
  let iters = 0
  const start = performance.now()
  do {
    fn()
    iters++
  } while (performance.now() - start < minMs)
  return (performance.now() - start) / iters
}

const SIZE = 100000
const plain = new Float32Array(SIZE)          // ordinary JavaScript memory
const shared = wasmBuffer(Float32Array, SIZE) // WASM memory
for (let i = 0; i < SIZE; i++) plain[i] = shared[i] = i % 10

console.log('plain sum: ', sum(plain, SIZE))
console.log('shared sum:', sum(shared, SIZE))

const plainUs = timePerOp(() => sum(plain, SIZE)) * 1000
const sharedUs = timePerOp(() => sum(shared, SIZE)) * 1000
console.log(`plain Float32Array: ${plainUs.toFixed(0)}µs per call (copied in and out)`)
console.log(`wasmBuffer:         ${sharedUs.toFixed(0)}µs per call (no copy)`)
```

`return wasm { ... }` hands the block's value back to the caller: a `wasm` block can be the
value of a `return`. The block returns a number; a block never returns an array (see the
limits below).

Both calls return the same total, 450000. The timings depend on your machine; in our runs the
plain array was the slower of the two. Under Bun, on the machine this chapter was written on
(November 2026), it was about 105µs against 68µs per call. The copied version moves 400KB in
and 400KB out on every call, and the copy back happens even though `sum` changed nothing.

## Allocate once, reuse forever

`wasmBuffer` is a **bump allocator with no free**. It keeps one pointer to the first unused
byte of WASM memory; each call hands out the slice starting there and moves the pointer past
it. Nothing ever moves the pointer back, so a slice is never given back. This is deliberate:
nobody has to decide who owns a buffer or when it dies, even across libraries. The price is
that a `wasmBuffer` call inside a loop, or once per request, uses up memory that never
returns.

So the pattern is: allocate the working buffers once, when the module loads, and refill them.
A kernel that produces an array takes an **output parameter** instead of allocating one, so
the caller decides where the result goes.

```tjs:inline
// Allocate the working buffers ONCE, when the module loads.
const LEN = 8
const src = wasmBuffer(Float32Array, LEN)
const dst = wasmBuffer(Float32Array, LEN)

// The kernel reads one buffer and writes another; it never allocates.
function squares(! input: Float32Array, output: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i += 4) {
      let off = i * 4 // byte offset: 4 bytes per float
      let v = f32x4_load(input, off)
      f32x4_store(output, off, f32x4_mul(v, v))
    }
  } fallback {
    for (let i = 0; i < len; i++) output[i] = input[i] * input[i]
  }
}

// Each "request" refills the same buffers instead of allocating new ones.
for (const start of [1, 10, 100]) {
  for (let i = 0; i < LEN; i++) src[i] = start + i
  squares(src, dst, LEN)
  console.log(`squares from ${start}:`, Array.from(dst).join(', '))
}

// An ordinary Float32Array still works as the output: copied in, and copied back out.
const plainOut = new Float32Array(LEN)
squares(src, plainOut, LEN)
console.log('into a plain Float32Array:', Array.from(plainOut).join(', '))
```

The three "requests" reuse `src` and `dst`; the module allocates 64 bytes of WASM memory in
total, however many times the loop runs. The last call mixes the two kinds of array: `src` is
passed in place, and only `plainOut` is copied. That call is the first time `squares` copies
anything, so it adds the block's one copy notice to the flight recorder.

The copy path does not use up memory. An ordinary array is copied into scratch space past the
last `wasmBuffer` slice, and that space is reused by the next call.

## Limits

- **WASM never allocates.** Neither an inline block nor a `wasm function` can create an array;
  JavaScript allocates every byte. That is why one allocator on the JavaScript side is enough:
  there is no second allocator inside WASM for it to coordinate with.
- **The memory is finite.** All the WASM in one file shares one `WebAssembly.Memory` of
  64MB (1024 pages of 64KB), which never grows, and `wasmBuffer` slices are permanent. Budget
  for your largest working set, once. Running past the end **throws** a `RangeError` rather
  than returning an error value: from `wasmBuffer` when the slice does not fit, and from a
  call whose copied arrays do not fit after the last `wasmBuffer` slice.
- **A `wasmBuffer` array is zero-copy only in its own file.** Every file containing WASM has
  its own memory, and loading the file points the global `wasmBuffer` at that memory. A
  buffer allocated after file B loaded lives in B's memory; handed to a kernel in file A, it
  is copied (and recorded) like any ordinary array. Allocate buffers in the module whose
  kernels use them.
- **Only typed arrays can be shared.** A block accepts `Float32Array`, `Float64Array`,
  `Int32Array` and `Uint8Array` parameters (DOCS-WASM, "Parameter types"). A plain JavaScript
  array is not a typed array: `[1, 2, 3]`, or a parameter whose example is `[0.0]`, has no
  bytes to share. Annotate kernel parameters as typed arrays and pass typed arrays.
- **SIMD loops step by 4.** A kernel that uses `f32x4_*` instructions, like `addOne` and
  `squares`, processes four floats at a time, so its length must be a multiple of 4. Nothing
  checks this. With `i < len` the loop rounds up: `addOne(arr, 6)` on an 8-float array
  changes all 8 floats in WASM, while the fallback changes 6. Keep lengths a multiple of 4,
  or handle the last few elements with an ordinary loop.
- **No WASM, no shared memory.** In a runtime that cannot create WASM memory, `wasmBuffer`
  returns an ordinary typed array and every block runs its `fallback { }`. Code written with
  `wasmBuffer` still runs; it is no faster than plain JavaScript.

The copy path is not wrong, only slower. For a small array called rarely it is the simpler
choice. Reach for `wasmBuffer` when the array is large or the call is hot, and let the flight
recorder tell you which calls are paying for copies.
