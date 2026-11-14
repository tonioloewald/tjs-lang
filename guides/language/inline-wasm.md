<!--{"parent": "the-tjs-language.md", "order": 90}-->
<!-- TODO review -->

# Inline WebAssembly

WebAssembly (WASM) is a compact instruction format that browsers, Node and Bun compile to
machine code and run beside JavaScript. It works only on numbers and on arrays of numbers.
In return, a tight numeric loop runs close to native speed, and with SIMD it can handle four
floats per instruction.

Using it from plain JavaScript usually means a second language (C, Rust or WAT), a separate
toolchain, a `.wasm` file to ship and load asynchronously, and hand-written code to move data
between JavaScript and WASM memory. TJS removes all of that. You write a small, typed subset of
JavaScript inside `wasm { }`, and the transpiler compiles it to WebAssembly and embeds the
bytes in the emitted `.js` file. There is no extra file and no extra build step.

This chapter goes from one `wasm { }` block to a library of composed SIMD kernels. The
reference, with the full subset and the type tables, is [WASM in TJS](/DOCS-WASM/).

## When WASM is worth it

WASM pays off on **tight numeric loops over typed arrays**: dot products, vector math,
image filters, particle updates, audio buffers, hashes. It does not help with strings,
objects, or code that spends its time calling other code. A block cannot touch those at all.

Calling into WASM is cheap but not free, and an array that does not already live in WASM
memory is copied in and out on every call. A kernel that does one multiply per float can come
out slower than the JavaScript loop it replaced; the [WASM SIMD](/wasm-simd/) page shows such a
case with dated measurements. So measure first. Reach for WASM when a profiler names a numeric
loop, and measure again afterwards. The [Vector Search Benchmark](/wasm-vector-search/) runs a
WASM-against-JavaScript comparison on your own machine.

## A `wasm { }` block

Here is a function that doubles every element of a `Float32Array` in place:

```tjs:inline
function double(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) {
      arr[i] *= 2.0
    }
  }
  return arr
}

console.log(double(new Float32Array([1, 2, 3]), 3).join())  // 2,4,6

// len is checked: it must be an integer
console.log(isMonadicError(double(new Float32Array([1, 2]), 1.5)))  // true
```

Everything outside `wasm { }` is ordinary TJS. The block itself is compiled to WebAssembly
when the file is transpiled.

**Free variables become the block's parameters.** The block uses `arr` and `len`, which belong
to the enclosing function. The transpiler finds them and passes them into the WASM function
on each call. You never declare the block's inputs.

**`arr: Float32Array` names a type.** Everywhere else in a TJS signature the colon value is an
example, but there is no literal for a typed array, so the annotation names the type. The
block needs it: it is what tells the compiler that `arr` is an array in memory and `arr[i]`
is an element read, not a number.

TJS has no runtime check for typed-array names, so this parameter is unchecked, and
transpiling the file prints a warning that says so:

```text
'arr: Float32Array' could not be resolved to a runtime type, so it is unchecked (best effort).
```

There are two usual responses to that warning:

- **Leave it.** `len` is still checked on every call, as the example shows, and the warning
  stays.
- **Mark the function `!`**, as in `function double(! arr: Float32Array, len: 0)`. The `!` at
  the start of the parameter list turns off argument checks for the **whole function**, so
  the warning goes away and so does the check on `len`. Kernels called in a hot loop with
  known inputs usually take this option, because checking each argument can cost more than
  the WASM saves. [Safety and Validation](/safety-markers/) explains `!` in general.

The rest of the warning suggests a third choice, which checks `arr` itself: declare a `Type`
with that exact name, `Type Float32Array { predicate(v) { return v instanceof
globalThis.Float32Array } }`. The block still compiles, because it goes by the name, and a
plain array passed as `arr` becomes an error value. The catch is that the `Type` replaces the
global `Float32Array` throughout the file, so `new Float32Array(…)` there stops working
(`function is not a constructor`) and has to be written `new globalThis.Float32Array(…)`. A
`Type` with any other name will not do: `arr: MyFloats` stops the block from compiling
(`arr is not a typed array parameter`).

Without that check, pass a real typed array; what happens otherwise is under
[Types and memory](#types-and-memory).

### `fallback { }` and returning a value

A block can produce a value: write `return` inside it, and `return wasm { … }` in the
function. It can also carry a `fallback { }`, a JavaScript version of the same computation:

```tjs:inline
function mean(! xs: Float32Array, len: 0):! 0.0 {
  return wasm {
    let sum = 0.0
    for (let i = 0; i < len; i++) {
      sum += xs[i]
    }
    return sum / len
  } fallback {
    return xs.subarray(0, len).reduce((total, x) => total + x, 0) / len
  }
}

console.log(mean(new Float32Array([1, 2, 3, 4, 5]), 5))  // 3
```

The fallback runs instead of the block in three cases:

- the runtime cannot run WebAssembly at all;
- the WASM module is still loading (on a browser's main thread, for a large module);
- you switched WASM off with `globalThis.__tjs_wasm_enabled = false` to compare the two paths.

[When WASM is unavailable or not ready](#when-wasm-is-unavailable-or-not-ready) covers all
three. `fallback` is optional: without one, the block's own body runs as JavaScript in those
cases, which is what happened in `double`. Write one when the JavaScript version is better as
different code, such as `mean`'s `reduce`, which a block cannot call. A fallback should compute
the same thing as the block: this one sums only the first `len` elements, as the block does.

`:! 0.0` declares a number return without a worked example. A plain `: 0.0` would be a
worked example that TJS tests by calling the function ([Testing](/testing/)), but `xs` has no
example value to call `mean` with, so that test could never run. `:!` says what is meant: the
result is a number, and nothing more.

### What a block may contain

A block is a small, typed subset of JavaScript:

- numeric `let` and `const`, assignment, and the compound assignments (`+=`, `*=` and so on);
- `for` loops (nested), `if` and `else`;
- arithmetic and comparisons;
- typed-array element reads and writes;
- the `f32x4_*` [SIMD](#simd) intrinsics;
- the math functions that are single WASM instructions: `Math.sqrt`, `Math.abs`, `Math.floor`,
  `Math.ceil`, `Math.trunc`, `Math.min` and `Math.max`;
- calls to a [`wasm function`](#wasm-function-declarations) declared in the same file. That is
  how several blocks share one kernel.

It may not contain `while` (use `for`), `break` or `continue`, `&&` or `||` (nest the `if`s),
calls to anything else, closures, objects, strings, `try`/`catch`, or anything that
allocates. A block cannot read `arr.length`, which is why the examples pass the length as its
own parameter.

`Math.sin`, `Math.exp`, `Math.pow` and their relatives have no WASM instruction. Using one
would mean calling back out to JavaScript, which TJS does not do yet, so they are refused. So
is `Math.round`, with a different message (`Unknown Math method: round`). The usual
substitute is `Math.floor(x + 0.5)`, which, like `Math.round`, rounds halves up.

**A block that cannot compile is a compile error.** The transpile stops and names the
construct:

```text
A `wasm` block (line 2) did not compile: Math.sin requires JS import (not yet implemented).
```

"JS import" is the call back out to JavaScript that the paragraph above describes. Writing
`wasm { }` is a request for WASM, so TJS does not quietly ship it as JavaScript. `fallback` is
for a runtime that cannot run WASM, not for code the compiler cannot compile.

## `wasm function` declarations

A block belongs to one function. When you want a kernel you can call from anywhere in the
file, or export to other files, declare a `wasm function` at module scope:

```tjs:inline
wasm function sq(x: f64): f64 {
  return x * x
}

// One wasm function can call another in the same file
wasm function hypot(a: f64, b: f64): f64 {
  return Math.sqrt(sq(a) + sq(b))
}

// Sum the first n floats of xs
wasm function total(xs: Float32Array, n: i32): f64 {
  let acc = 0.0
  for (let i = 0; i < n; i++) {
    acc += xs[i]
  }
  return acc
}

console.log(hypot(3, 4))                                 // 5
console.log(total(new Float32Array([1, 2, 3, 4.5]), 4))  // 10.5
console.log(typeof hypot)                                // function
```

Every `wasm function` in a file is compiled into one WebAssembly module, together with the
file's `wasm { }` blocks. In each declaration's place the transpiler leaves an ordinary
JavaScript function of the same name that forwards to the WASM export, so callers cannot tell
it from any other function. `hypot`'s call to `sq` is a WASM-to-WASM call, with no JavaScript
in between.

### Parameters are type names, never examples

In a `wasm function`, every parameter is a type name. The types are:

| Name                | Type                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `i32`, or `int`     | A 32-bit integer                                                  |
| `f64`, or `number`  | A 64-bit float, the same thing as a JavaScript number             |
| `f32`               | A 32-bit float, what each element of a `Float32Array` holds       |
| `Float32Array`, `Float64Array`, `Int32Array`, `Uint8Array` | A typed array in WASM memory |

[WASM in TJS](/DOCS-WASM/#parameter-types) has the full table.

> **`n: 0` is not an integer here.** Anything that is not a type name, an example such as
> `n: 0` or `name: 'hello'` included, is compiled as `f64` without a warning, and so is a
> misspelling such as `n: I32`. The habit the rest of TJS teaches is exactly the one that
> goes wrong.

What goes wrong is usually found later. A loop `for (let i = 0; i < n; i++)` still works with
an `f64` `n`, but a fractional count is no longer refused, and the first integer operation
fails to compile:

```tjs:static
wasm function tail(n: 0): f64 {
  return n % 4
}
```

```text
`wasm function tail` (line 1) did not compile: `%` needs integer (i32) operands in WASM, and these are f64.
```

Write `n: i32`.

### What else to know

The rest of the rules are short:

- **No argument checks.** WebAssembly converts each argument to its declared type: a fraction
  passed to an `i32` is truncated (see [Numbers in WASM](#numbers-in-wasm)), and an `f32`
  is rounded to single precision.
- **Return `f64` or nothing.** A function with no return annotation returns nothing, which is
  the shape for kernels that write into an output array. `: i32` and `: f32` are accepted
  and ignored: the function returns whatever its `return` expression computes, as an ordinary
  JavaScript number. `return x` in a function declared `: i32` returns `2.7` for `x = 2.7`.
- **Calls stay inside WASM.** A `wasm function` can call the math intrinsics, the `f32x4_*`
  intrinsics and other `wasm function`s in the same module, and nothing else: no host
  functions, no logging, no callbacks. A call to an ordinary function is refused by name:
  `'log' cannot be called from WASM: it is not a WASM intrinsic or another \`wasm function\``.
- **Only parameters come in.** A `wasm function` cannot read module-level variables:
  `return x * K` with a top-level `const K = 3` stops with `Unknown identifier: K`. Pass the
  value as a parameter.
- **Exporting.** `export wasm function` exports the wrapper like any other function. That is
  how a WASM library is written; see [Libraries and composition](#libraries-and-composition).

## Types and memory

### JavaScript allocates every byte

WASM code can read and write only its own linear memory: one flat block of bytes, separate
from the JavaScript heap. The rule that keeps this simple:

> **JavaScript allocates every byte. WASM never allocates.**

Neither a block nor a `wasm function` can create an array. A kernel that produces many values
takes an output array, and the caller provides it. Numbers pass straight through as
parameters. An array reaches WASM memory in one of two ways:

- **An ordinary typed array is copied.** The wrapper copies it into WASM memory before the
  call and copies it back afterwards, so the kernel's writes reach your array.
- **A `wasmBuffer()` array is not copied.** `wasmBuffer(Float32Array, n)` allocates the array
  inside WASM memory. It is an ordinary `Float32Array` in every other respect, and JavaScript
  and WASM read and write the same bytes.

A copy is not an error, so nothing throws and every test passes. That is why the runtime writes
it down in the flight recorder ([Errors as Values](/errors-as-values/)): the first time a
kernel is handed a typed array outside WASM memory, it records a `notice` with
`source: 'wasm'`, naming the kernel's parameter that received it. Read these entries from
`globalThis.__tjs`, not a bare `__tjs`: the WASM loader records into the page-wide runtime,
and inside a `.tjs` file, a bare `__tjs` is that file's own runtime, which keeps only the
file's own records.

```tjs:inline
// Writes input[i] * factor into output[i]. It allocates nothing:
// the caller owns both arrays.
wasm function scaleInto(input: Float32Array, output: Float32Array, n: i32, factor: f64) {
  for (let i = 0; i < n; i++) {
    output[i] = input[i] * factor
  }
}

globalThis.__tjs.clearRecords()

// 1. Ordinary typed arrays: copied into wasm memory and back on every call.
const plainIn = new Float32Array([1, 2, 3, 4])
const plainOut = new Float32Array(4)
scaleInto(plainIn, plainOut, 4, 10)
scaleInto(plainIn, plainOut, 4, 10)
console.log('plain:', plainOut.join(', '))

// 2. wasmBuffer arrays live in wasm memory: nothing is copied.
//    Allocate them once and reuse them; this memory is never freed.
const bufIn = wasmBuffer(Float32Array, 4)
const bufOut = wasmBuffer(Float32Array, 4)
bufIn.set([1, 2, 3, 4])
for (const factor of [10, 100]) {
  scaleInto(bufIn, bufOut, 4, factor)
  console.log(`x${factor}:`, bufOut.join(', '))
}

// 3. The runtime noticed the copies, once, not once per call.
for (const r of globalThis.__tjs.records({ source: 'wasm' })) {
  console.log(`[${r.severity}] copied '${r.data.param}' (${r.data.bytes} bytes)`)
}
```

It prints the lines below. The last one names `scaleInto`'s parameter `input`, which received
`plainIn`. It names only the first array copied, so `plainOut`, also copied, is not listed:

```text
plain: 10, 20, 30, 40
x10: 10, 20, 30, 40
x100: 100, 200, 300, 400
[notice] copied 'input' (16 bytes)
```

Both paths give the same answer. The difference is what each call does: the plain arrays are
copied in and out every time, and the `wasmBuffer` arrays are not. The runtime records once
per kernel, never once per call, so the notice costs nothing in a hot loop.

### What a copy costs

This example times one read-only kernel over 100,000 floats, once with an ordinary
`Float32Array` and once with a `wasmBuffer` array. The kernel does the same work both times, so
the difference is the copy:

```tjs:inline
function sum(! arr: Float32Array, len: 0):! 0.0 {
  return wasm {
    let total = 0.0
    for (let i = 0; i < len; i++) total += arr[i]
    return total
  }
}

// Repeat for at least 50ms and divide: one fast call is too short to time
function timePerCall(fn) {
  let calls = 0
  const start = performance.now()
  do { fn(); calls++ } while (performance.now() - start < 50)
  return (performance.now() - start) / calls
}

const SIZE = 100000
const plain = new Float32Array(SIZE)
const shared = wasmBuffer(Float32Array, SIZE)
for (let i = 0; i < SIZE; i++) plain[i] = shared[i] = i % 10

console.log(sum(plain, SIZE), sum(shared, SIZE))  // 450000 450000
const copiedUs = timePerCall(() => sum(plain, SIZE)) * 1000
const sharedUs = timePerCall(() => sum(shared, SIZE)) * 1000
console.log(`copied: ${copiedUs.toFixed(0)}µs  wasmBuffer: ${sharedUs.toFixed(0)}µs per call`)
```

On an Apple M5 Max under Bun (November 2026) it printed `copied: 100µs  wasmBuffer: 65µs per
call`: the copy added half as much again as the work itself. Your numbers will differ, but the
cause will not. The copied version moves 400KB in and 400KB out on every call, and it copies
back even though `sum` changed nothing. For a small array called rarely, the copy is the
simpler choice. For a large array or a hot call, use `wasmBuffer`.

### Allocate once, reuse forever

`wasmBuffer` is a **bump allocator with no free**. It hands out the next slice of WASM memory
and never takes one back. That is deliberate: nobody has to decide who owns a buffer or when it
dies. The price is that calling `wasmBuffer` inside a loop, or once per request, uses up
memory that never returns.

So allocate working buffers once, when the module loads, and refill them. That is why kernels
take an **output parameter** instead of returning an array: `scaleInto` writes into `bufOut`,
and the loop above reuses the same two buffers for every factor.

A few more rules:

- **The memory is finite.** All the WASM in one file shares one 64MB memory, which does not
  grow. Allocating past the end with `wasmBuffer` throws a `RangeError`. A kernel that indexes
  past the end of an array is not checked at all: it reads or writes whatever comes next.
- **Only typed arrays can be shared.** A plain array such as `[1, 2, 3]` has no bytes to
  share, and it is not detected either. The kernel receives a meaningless address (usually 0)
  and reads or writes whatever is there, which may be one of your `wasmBuffer` arrays. Always
  pass typed arrays.

### One memory per file

Each file that contains WASM has its own memory, and loading the file points the global
`wasmBuffer` at it. So `wasmBuffer` allocates in the memory of the **most recently loaded**
file with WASM in it. JavaScript modules load their imports first, which gives a simple rule:

- In a file with WASM of its own, `wasmBuffer` allocates in that file's memory.
- In a file without any, it allocates in the memory of the last WASM file it imported (or
  that was imported before it).

A buffer from one file's memory still works with another file's kernel, but it is copied, and
the flight recorder says so. Here `app.tjs` has a kernel of its own and also calls one from
`vec.tjs`:

```tjs:static
// app.tjs
import { libSum } from './vec.tjs'

wasm function appSum(a: Float32Array, n: i32): f64 {
  let acc = 0.0
  for (let i = 0; i < n; i++) acc += a[i]
  return acc
}

const mine = wasmBuffer(Float32Array, 4)   // app.tjs's memory: it loaded last
mine.set([1, 2, 3, 4])
console.log(appSum(mine, 4))   // 10, zero-copy
console.log(libSum(mine, 4))   // 10, but copied into vec.tjs's memory
```

There is no supported way to ask for a particular file's memory. When the hot path calls a
library's kernels, either keep your own file free of WASM (then `wasmBuffer` lands in the
library's memory, as in the [`tjs-lang/linalg`](#ready-made-kernels)
example), or [compose](#the-composed-form) the library into your file, so that there is only
one module and one memory.

### Numbers in WASM

A WASM block has no JavaScript numbers. Its variables have one of two types: `f64`, a 64-bit
float, the same thing as a JavaScript number; and `i32`, a 32-bit integer. The third type,
`f32`, appears only as storage: in a `Float32Array`, and as a `wasm function` parameter.

- **A block's captured numbers are always `f64`**, whatever the TJS example (`0`, `0.0`). So
  they start out identical to the values the `fallback` sees.
- **A `let` or `const` takes the type of its initializer.** `let i = 0` is an `i32`, which
  suits loop counters and offsets; `let sum = 0.0` is an `f64`. Arithmetic that mixes the two
  gives `f64`.
- **Assigning an `f64` to an `i32` variable truncates it** toward zero: with `let k = 0`,
  `k = 2.7` makes `k` 2, and `k = -2.7` makes it -2. A value outside the 32-bit range, or
  `NaN`, is a WebAssembly trap: the call throws a `WebAssembly.RuntimeError`. This is the way
  to get an integer from a captured number. `Math.trunc` will not do it: it returns an `f64`.
- **An `i32` wraps on overflow.** Start an accumulator at `0.0` or `1.0`, not `0` or `1`.
- **Typed-array elements are stored at their own precision.** A `Float32Array` element is
  read as the nearest `f64` to the `f32` stored there, so `0.1` comes back as
  `0.10000000149011612`, exactly as JavaScript reads it from the same array. A write rounds
  back to `f32`.
- **`/` is JavaScript's division**, even between two `i32` values: `7 / 2` is `3.5`. For integer
  division write `Math.trunc(a / b)`.
- **`%` and the bitwise operators need `i32` operands.** WASM has no float remainder, so
  `x % 2` on a captured number is a compile error. Assign it to an `i32` `let` first.
- **Comparisons are WASM's numeric comparisons.** TJS's `==` adds rules for `null`, `undefined`
  and boxed values, none of which can exist in a block, so for numbers the answers are the
  same.

Those rules mean a block can give a different answer from its `fallback`: an `i32` that wraps
where the JavaScript number would not, or a value rounded to `f32` when it is stored. To check
that yours agree, run both paths with `globalThis.__tjs_wasm_enabled = false`
([Comparing the two paths](#comparing-the-two-paths)).

For integer algorithms (hashes, checksums, random-number generators, packed pixels), use a
`wasm function` with `i32` parameters. Its arithmetic is WebAssembly's, which is the point:

```tjs:inline
// An inline block: captured numbers are f64, so it agrees with JavaScript.
function factorial(! n: 0):! 0 {
  return wasm {
    let result = 1.0          // 1.0 makes an f64; `let result = 1` would be an i32
    for (let i = 2; i <= n; i++) {
      result *= i
    }
    return result
  }
}

// wasm functions with i32 parameters: 32-bit integer arithmetic.
wasm function add32(a: i32, b: i32): f64 {
  return a + b
}

wasm function div(a: i32, b: i32): f64 {
  return a / b
}

wasm function rem(a: i32, b: i32): f64 {
  return a % b                // % needs i32 operands
}

console.log(factorial(13))       // 6227020800
console.log(add32(2e9, 2e9))     // -294967296: wrapped at 32 bits
console.log(add32(2.9, 0))       // 2: the fraction is dropped at the call
console.log(div(7, 2))           // 3.5: `/` is always float division
console.log(rem(-7, 2))          // -1
```

With `let result = 1`, `factorial(13)` would wrap and return 1932053504. `add32` returns an
`i32` sum, which wraps first and is then converted to an ordinary number on the way out. A
remainder by zero in an `i32` function is a WebAssembly trap: `rem(7, 0)` throws a
`WebAssembly.RuntimeError` instead of returning `NaN`.
[WASM in TJS](/DOCS-WASM/#numbers-what-is-f64-and-what-is-i32) has the full table of `i32`
behaviour.

## SIMD

SIMD (single instruction, multiple data) does the same operation on several values at once.
In TJS, an `f32x4` value holds four 32-bit floats, called **lanes**, and the `f32x4_*`
intrinsics compile to single SIMD instructions:

| Intrinsic                            | What it does                                                 |
| ------------------------------------ | ------------------------------------------------------------ |
| `f32x4_splat(x)`                     | A vector with `x` in all four lanes                          |
| `f32x4_load(arr, byteOffset)`        | Reads four floats from `arr`, starting `byteOffset` bytes in |
| `f32x4_store(arr, byteOffset, v)`    | Writes the four lanes of `v` into `arr`                      |
| `f32x4_add(a, b)`, `f32x4_mul(a, b)` | Lane-by-lane arithmetic                                      |
| `f32x4_extract_lane(v, n)`           | Lane `n` (0 to 3) of `v`, as a number                        |

A dot product is the classic example. It multiplies four pairs at a time into four running
sums, then adds the four sums together. (The kernel is called `simdDot` rather than `dot` for a
reason given under [Libraries and composition](#libraries-and-composition).)

```tjs:inline
wasm function simdDot(a: Float32Array, b: Float32Array, n: i32): f64 {
  // Four lanes of partial sums, all starting at 0.0
  let acc = f32x4_splat(0.0)
  // The largest multiple of 4 that fits in n
  let whole = n - n % 4
  for (let i = 0; i < whole; i += 4) {
    let off = i * 4                       // a BYTE offset: 4 bytes per float
    let va = f32x4_load(a, off)           // a[i] .. a[i + 3]
    let vb = f32x4_load(b, off)
    acc = f32x4_add(acc, f32x4_mul(va, vb))
  }
  // Add the four partial sums together
  let sum = f32x4_extract_lane(acc, 0) + f32x4_extract_lane(acc, 1)
    + f32x4_extract_lane(acc, 2) + f32x4_extract_lane(acc, 3)
  // The tail: the last n % 4 elements, one at a time
  for (let i = whole; i < n; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

const N = 10 // not a multiple of 4, on purpose
const a = wasmBuffer(Float32Array, N)
const b = wasmBuffer(Float32Array, N)
for (let i = 0; i < N; i++) {
  a[i] = i + 1   // 1, 2, ..., 10
  b[i] = 2
}

let expected = 0
for (let i = 0; i < N; i++) expected += a[i] * b[i]

console.log('wasm:', simdDot(a, b, N))   // 110
console.log('js:  ', expected)           // 110

test 'simdDot matches the scalar sum, tail included' {
  const got = simdDot(a, b, N)
  // Equal to within rounding: SIMD adds in a different order
  expect(Math.abs(got - expected) <= 1e-6 * Math.abs(expected)).toBe(true)
}
```

The test block is worth copying into your own kernels. A SIMD loop with a wrong offset
compiles cleanly and returns plausible wrong numbers; a test against a plain loop catches it.
([Testing](/testing/) covers test blocks.) Compare with a tolerance, as the test does. With
these small whole numbers the two results happen to be identical, but the SIMD loop adds four
`f32` partial sums in a different order from the scalar loop, so with real data the last few
bits differ, and an exact `toBe(expected)` would fail a correct kernel.

Three things to get right in every SIMD loop:

- **Offsets are bytes, indexes are elements.** `f32x4_load` and `f32x4_store` take a byte
  offset, and a float is 4 bytes, so element `i` is at `i * 4`. A wrong offset does not fail;
  it reads the wrong floats.
- **Handle the tail.** A loop that steps by 4 has nothing to do with the last `n % 4` elements.
  `simdDot` finishes them in a scalar loop, which needs `n % 4`, which needs an `i32`: one
  reason to write kernels as `wasm function`s. The other choice is to pad arrays with zeros to
  a multiple of 4, which changes neither a sum nor a dot product. What you must not do is loop
  past the end: nothing checks the length, and with a `wasmBuffer` array the extra loads and
  stores read and write whatever was allocated next.
- **A lane index is a literal.** `f32x4_extract_lane(acc, 0)` compiles; a variable lane does
  not, because the lane is encoded in the instruction. The error does not say that, so
  recognise it: `f32x4_extract_lane: lane must be 0-3, got undefined.`

Beyond these, there are `f32x4_sub`, `f32x4_div`, `f32x4_neg`, `f32x4_sqrt`, `f32x4_min`,
`f32x4_max` and `f32x4_replace_lane`, plus comparisons that produce lane masks and
`f32x4_select` to blend by mask, which lets SIMD code make per-lane decisions without
branches. All of these are listed in [WASM in TJS](/DOCS-WASM/#simd-intrinsics), and
[WASM SIMD](/wasm-simd/) works through clamping and masking. Only `f32x4` exists today: there
are no integer or `f64x2` lane types.

SIMD loads expect a `Float32Array`. Another typed array compiles, but `f32x4_load` reads its
bytes as floats without converting them, so the results are wrong.

TJS requires the WebAssembly SIMD baseline, which every current browser, Node and Bun support.
On an engine without it, a module that uses SIMD fails to instantiate, and is handled like any
other refused module (next section).

## When WASM is unavailable or not ready

### Readiness

A file's WASM module is compiled and instantiated **synchronously** when the file loads, so
the first call already runs in WASM. There is one exception. On a browser's main thread, the
engine refuses to compile a module over 4KB synchronously, so TJS compiles it asynchronously,
and every `wasm { }` block runs its `fallback` until the module is ready.

`globalThis.__tjs_wasm_ready()` returns a promise that resolves once every module on the page
has instantiated, at once if they already have. You do not need to work out whether your
modules are over 4KB: in browser code, await it once, at the top level of your entry module,
after its imports and before anything calls a kernel:

```javascript
// main.js (or main.tjs), loaded with <script type="module">
import { startApp } from './app.js'

await globalThis.__tjs_wasm_ready()
startApp()
```

### No WebAssembly at all

Some runtimes cannot run WASM: iOS Lockdown Mode removes `WebAssembly` entirely, and an engine
under memory pressure can refuse to compile. Then every `wasm { }` block in the file runs its
`fallback` (or its own body as JavaScript), and the runtime records one `warning` in
`globalThis.__tjs.records({ source: 'wasm' })` saying so. `wasmBuffer` returns an ordinary
typed array in that case, so code written with it still runs, no faster than plain JavaScript.

### A `wasm function` has no fallback

A `wasm function` is WASM only. Its JavaScript wrapper calls the WASM export directly, so when
the export does not exist, the call throws a `TypeError`:

```text
TypeError: globalThis.__tjs_wasm_1q2w3e_sq is not a function
```

That happens in a runtime with no `WebAssembly`, after a refused instantiation, and on a
browser main thread when a large module is called before `__tjs_wasm_ready()` resolves.

If your code must run everywhere, give the kernel a fallback by calling it from a `wasm { }`
block. The block calls the `wasm function` inside WASM, and when WASM is not available the
block's `fallback` runs instead:

```tjs:inline
wasm function sq(x: f64): f64 {
  return x * x
}

// sq, with a JavaScript path for runtimes that cannot run it
function square(! x: 0.0):! 0.0 {
  return wasm { return sq(x) } fallback { return x * x }
}

console.log(square(3))                    // 9, in WASM
globalThis.__tjs_wasm_enabled = false     // pretend WASM is unavailable
console.log(square(4))                    // 16, from the fallback
delete globalThis.__tjs_wasm_enabled
```

### Comparing the two paths

`globalThis.__tjs_wasm_enabled = false` forces every block to run its `fallback`, even when the
WASM is loaded. Use it to check that the two paths agree, or to benchmark one against the
other. Delete it, or set it back to `true`, to switch WASM on again. It affects only blocks; a
`wasm function` has no other path to switch to.

```tjs:inline
function mean(! xs: Float32Array, len: 0):! 0.0 {
  return wasm {
    let sum = 0.0
    for (let i = 0; i < len; i++) {
      sum += xs[i]
    }
    return sum / len
  } fallback {
    return xs.subarray(0, len).reduce((total, x) => total + x, 0) / len
  }
}

const xs = new Float32Array([1, 2, 3, 4, 5, 99])   // the 99 is past len
const inWasm = mean(xs, 5)

globalThis.__tjs_wasm_enabled = false   // every block runs its fallback
const inFallback = mean(xs, 5)
delete globalThis.__tjs_wasm_enabled    // back to wasm

console.log(inWasm, inFallback, inWasm === inFallback)  // 3 3 true
```

## Libraries and composition

A WASM library is a `.tjs` file of `export wasm function` declarations, and nothing more:

```tjs:static
// vec.tjs: the library
export wasm function vecDot(a: Float32Array, b: Float32Array, n: i32): f64 {
  let acc = 0.0
  for (let i = 0; i < n; i++) {
    acc += a[i] * b[i]
  }
  return acc
}
```

The same source can be consumed in two ways: as an ordinary import (the boundary form), or
compiled into the consumer's own WASM module (the composed form). These examples are two
files, so they cannot run in the page.

### The boundary form

Without anything special, the import is an ordinary import
([Modules and Imports](/modules-and-imports/)). The library's transpiled `.js` carries its own
embedded WASM and wrappers, and each call into `vecDot` crosses from JavaScript into WASM:

```tjs:static
// app.tjs: calls the library from ordinary code
import { vecDot } from './vec.tjs'

const v = wasmBuffer(Float32Array, 4)   // vec.tjs's memory: app.tjs has no WASM
v.set([1, 2, 2, 4])
console.log(vecDot(v, v, 4))  // 25
```

That works whether the caller is plain JavaScript or TJS, as long as the call is made from
ordinary code, not from inside a `wasm { }` block or a `wasm function`. The crossing is cheap;
it matters for very small kernels called in a tight JavaScript loop, and then the fix is to
move the loop into WASM, which is what composition is for.

To run the pair with Bun, preload the TJS plugin, which transpiles each `.tjs` file as it is
imported: `bun --preload tjs-lang/bun-plugin app.tjs`, or put
`preload = ["tjs-lang/bun-plugin"]` in `bunfig.toml`. (`tjs run app.tjs` cannot run it: it does
not load relative `.tjs` imports.)

### The composed form

Now suppose `app.tjs` wants a kernel of its own that calls the library's kernel from inside
WASM:

```tjs:static
// app.tjs: a consumer with a kernel of its own
import { vecDot } from './vec.tjs'

wasm function norm(a: Float32Array, n: i32): f64 {
  return Math.sqrt(vecDot(a, a, n))   // a call from WASM into the library's WASM
}

const v = wasmBuffer(Float32Array, 4)
v.set([1, 2, 2, 4])
console.log(norm(v, 4))       // 5
console.log(vecDot(v, v, 4))  // 25
```

In the boundary form this does not compile: `norm`'s call to the imported `vecDot` is a call
WASM cannot make (`'vecDot' cannot be called from WASM`). It needs composition, in which the
transpiler reads `vec.tjs` and compiles `vecDot` into `app.tjs`'s own WASM module. The import
disappears from the output, the consumer ships one module with one memory, and `norm`'s call
to `vecDot` is a WASM-to-WASM call.

Composition needs a `ModuleLoader`: an object that tells the transpiler where imported files
live, so that it can read their source at transpile time. `tjs run`, `tjs emit`, `tjs check`,
`tjs test`, the Bun plugin and the Bun.build plugin pass one for any file that mentions
`wasm`, so with those it simply works:

```bash
tjs emit app.tjs -o app.js   # one file, vecDot compiled in, no import left
```

From the API, pass the loader yourself:

```javascript
// build.js
import { readFileSync, writeFileSync } from 'node:fs'
import { tjs, ModuleLoader } from 'tjs-lang'

const dir = '/path/to/project'
const appPath = `${dir}/app.tjs`
const result = tjs(readFileSync(appPath, 'utf8'), {
  moduleLoader: new ModuleLoader({ baseDir: dir }),
  filename: appPath,
})
writeFileSync(`${dir}/app.js`, result.code)   // one file, no imports left
```

`app.js` then runs on its own in Node, Bun or a browser. Without a loader (the API with none
passed) you get the boundary form, and a `wasm function` that calls an imported kernel does
not compile.

### Shipping a library

A published library usually ships its transpiled `.js` for everyone, and can ship its `.tjs`
source as well. The two serve different consumers:

- **The `.js`** is the boundary form. Any JavaScript or TJS consumer imports it as usual.
- **The `.tjs` source** is what a composing build reads. The `ModuleLoader` finds a source
  file by relative or absolute path, and for a package name it looks in `node_modules` for
  `<name>.tjs` or `<name>/index.tjs` (also `.ts` and `.js`), plus any directories you list in
  its `bareSpecifierRoots` option. It does not read `package.json`, so `exports`, `main` and
  conditions such as `"bun"` do not lead it to the source. A source kept at `src/index.tjs`
  is found only if the consumer adds that directory to `bareSpecifierRoots`, or imports the
  file by path.

An `exports` condition such as `"bun": "./src/index.tjs"` still has a use: with the Bun plugin
preloaded, Bun imports the source and transpiles it on load. That is the boundary form, the
same as importing the `.js`; it does not compose.

One current limit to design around: **each `.js` dependency carries its own copy** of the
kernels it embeds, so two libraries that both bundle the same kernels ship two copies.
(Kernel names are not global: two files may each declare a `wasm function` of the same name,
and each keeps its own.)

The [WASM Library: SIMD Linalg](/wasm-library-author/) and
[Using a WASM Library](/wasm-library-consumer/) examples build and consume a library end to
end.

## Ready-made kernels

Before you write a vector kernel, check `tjs-lang/linalg`. It ships four SIMD `f32x4` kernels,
written as `export wasm function`s (its source, `src/linalg/index.tjs`, reads like this
chapter):

| Kernel                               | Returns                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| `dot(a, b, n)`                       | The dot product of `a[0..n)` and `b[0..n)`                           |
| `norm_sq(a, n)`                      | The squared length of `a[0..n)`; take `Math.sqrt` for the length     |
| `dot_at(corpus, startIdx, query, n)` | The dot product of `query[0..n)` with `corpus[startIdx..startIdx+n)` |
| `norm_sq_at(arr, startIdx, n)`       | The squared length of `arr[startIdx..startIdx+n)`                    |

`n`, and `startIdx` for the `_at` variants, must be multiples of 4; pad shorter vectors with
zeros. The kernels have no tail loop: they step four floats at a time until they reach `n`, so
with `n = 6` they also count elements 6 and 7. Past the end of your array those belong to
whatever was allocated next, and the answer is silently wrong. `startIdx` counts elements, not
bytes.

The `_at` variants exist so that many vectors can be packed into one `wasmBuffer`, allocated
once, instead of one buffer per vector. Here is cosine similarity against three packed rows (it
imports a package, so it does not run in the page). This file has no WASM of its own, so its
`wasmBuffer` arrays live in linalg's memory and are passed without copying:

```javascript
import { dot, norm_sq, dot_at, norm_sq_at } from 'tjs-lang/linalg'

const DIM = 4
const query = wasmBuffer(Float32Array, DIM)
query.set([1, 2, 3, 4])

// Three rows packed into one buffer: row r starts at element r * DIM
const rows = wasmBuffer(Float32Array, 3 * DIM)
rows.set([
  1, 2, 3, 4,       // the query itself
  -1, -2, -3, -4,   // the opposite direction
  4, 3, 2, 1,       // somewhere in between
])

const qLenSq = norm_sq(query, DIM)
for (let r = 0; r < 3; r++) {
  const start = r * DIM
  // One square root per row: sqrt(|q|² × |row|²) = |q| × |row|
  const cos = dot_at(rows, start, query, DIM) /
    Math.sqrt(qLenSq * norm_sq_at(rows, start, DIM))
  console.log(`row ${r}: ${cos.toFixed(3)}`)   // 1.000, -1.000, 0.667
}
console.log('dot(query, query):', dot(query, query, DIM))  // 30
```

`norm_sq` returns the squared length so that you pay for square roots only where you need
them. Cosine similarity takes one per row, `dot / sqrt(|a|² × |b|²)`, instead of one per
length. Comparing distances needs none at all: if `|a|² < |b|²` then `|a| < |b|`.

## Go further

Two larger examples put all of this together:

- [Starfield](/wasm-starfield/): an animated starfield whose particles live in `wasmBuffer`
  arrays and move with SIMD.
- [Vector Search Benchmark](/wasm-vector-search/): a nearest-neighbour search over a packed
  corpus with the whole loop in one SIMD kernel, timed against JavaScript on your machine.

[WASM in TJS](/DOCS-WASM/) is the reference for everything in this chapter: the supported
subset, the parameter and number tables, the intrinsics and the current limits.
