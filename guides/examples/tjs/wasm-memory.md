<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 27, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# WASM Memory

> New to WASM in TJS? Start with the **[WASM Quick Start](/WASM-QUICKSTART/)**,
> [WASM Basics](/wasm-basics/) and [WASM SIMD](/wasm-simd/). [`DOCS-WASM.md`](/DOCS-WASM/) is
> the reference: its "Parameter types" table lists every type a block accepts, and "Memory
> discipline" states the rules this chapter puts to work.

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
function addOne(! arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      f32x4_store(arr, off, f32x4_add(f32x4_load(arr, off), f32x4_splat(1.0)))
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] += 1
  }
}

// The flight recorder is the installed runtime on globalThis.
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
for (const r of globalThis.__tjs.records({ source: 'wasm' })) {
  console.log(`[${r.severity}] copied param '${r.data.param}' (${r.data.bytes} bytes)`)
}
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

The `!` before `arr` turns off the parameter check for this function. A kernel like this sits
in hot loops and is handed exactly what it expects; see [Safety Markers](/TJS-SYNTAX/).

### The flight recorder notices the copy

A copied array is not an error, so nothing throws and every test passes. That is why the
runtime writes it down: the first time a WASM block is handed an array outside WASM memory,
it adds a `notice` to the [Flight Recorder](/error-history/) with `source: 'wasm'`. The
record's `data` names the parameter (`param`) and its size in bytes (`bytes`), and its
message says what to do: allocate the array with `wasmBuffer()`.

It records once per block, not once per call. The example calls `addOne(regular, 4)` twice
and gets one record. A recorder that wrote on every call of a hot kernel would become the
slowdown it exists to report.

Two details matter when you look for this record:

- **Read it from `globalThis.__tjs`.** The WASM wrapper writes to the installed runtime.
  Inside a `.tjs` file, a bare `__tjs` is that file's own runtime instance, and its
  `records()` does not include the WASM notices.
- **It appears only when the WASM ran.** If the block ran its `fallback { }` (no WebAssembly
  in this runtime, or a browser still compiling the module asynchronously), no copy happened
  and there is nothing to record. A block that falls back because the module could not be
  created or instantiated is recorded as well, as a `warning` with the same `source: 'wasm'`.

## What a copy costs

The next example times one read-only kernel over 100,000 floats, once with an ordinary
`Float32Array` and once with a `wasmBuffer` array. The kernel only reads, so every call does
the same work and the only difference is the copy.

```tjs:inline
// Adds up the first len values of arr. It only reads, so every call does the same work.
function sum(! arr: Float32Array, len: 0) {
  return wasm {
    let total = 0.0
    for (let i = 0; i < len; i++) {
      total = total + arr[i]
    }
    return total
  } fallback {
    let total = 0
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
console.log(`plain Float32Array: ${plainUs.toFixed(0)}us per call (copied in and out)`)
console.log(`wasmBuffer:         ${sharedUs.toFixed(0)}us per call (no copy)`)
```

Both calls return the same total. The timings depend on your machine, but the plain array is
consistently the slower of the two: under Bun, on the machine this chapter was written on
(November 2026), about 105us against 68us per call. The copied version moves 400KB in and 400KB out on every call, and the copy back
happens even though `sum` changed nothing.

The `return wasm { ... }` form hands the block's value back to the caller. The block returns
a number; a block never returns an array (see the limits below).

## Allocate once, reuse forever

`wasmBuffer` is a **bump allocator with no free**. Each call hands out the next unused slice
of WASM memory, and that slice is never given back. This is deliberate: nobody has to decide
who owns a buffer or when it dies, even across libraries. The price is that a `wasmBuffer`
call inside a loop, or once per request, uses up memory that never returns.

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
      let off = i * 4
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
passed in place, and only `plainOut` is copied.

The copy path does not use up memory. An ordinary array is copied into scratch space past the
last `wasmBuffer` slice, and that space is reused by the next call.

## Limits

- **WASM never allocates.** Neither an inline block nor a `wasm function` can create an array;
  JavaScript allocates every byte. That rule is what makes a bump allocator with no free safe.
- **The memory is finite.** All the WASM in one file shares one `WebAssembly.Memory` of a fixed
  size, and `wasmBuffer` slices are permanent. Budget for your largest working set, once.
  [TJS-SYNTAX](/TJS-SYNTAX/) gives the size.
- **Only typed arrays can be shared.** The element types a block accepts are listed in the
  "Parameter types" table in [`DOCS-WASM.md`](/DOCS-WASM/). A plain JavaScript array is not a
  typed array: `[1, 2, 3]`, or a parameter whose example is `[0.0]`, has no bytes to share.
  Annotate kernel parameters as typed arrays and pass typed arrays.
- **SIMD loops step by 4.** A kernel that uses `f32x4_*` instructions, like `addOne` and
  `squares`, processes four floats at a time, so its length must be a multiple of 4.
- **No WASM, no shared memory.** In a runtime that cannot create WASM memory, `wasmBuffer`
  returns an ordinary typed array and every block runs its `fallback { }`. Code written with
  `wasmBuffer` still runs; it is no faster than plain JavaScript.

The copy path is not wrong, only slower. For a small array called rarely it is the simpler
choice. Reach for `wasmBuffer` when the array is large or the call is hot, and let the flight
recorder tell you which calls are paying for copies.
