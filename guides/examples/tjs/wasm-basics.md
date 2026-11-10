<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 25, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Inline WASM

A `wasm { }` block inside a TJS function is compiled to WebAssembly when the file is
transpiled, and the bytes are embedded in the emitted JavaScript. This page covers how a block
gets its inputs, which numbers it works with, and what it may contain. It assumes you know
roughly what WebAssembly is; if you have never used it from TJS, the
**[WASM Quick Start](/WASM-QUICKSTART/)** is a shorter walk-through.

## When to use a block

When a profiler says a numeric inner loop is hot. Most code is fast enough written plainly,
and a call into WASM has its own cost. WASM pays off on tight loops over typed arrays, and
most of all with SIMD, which the next chapter covers.

Using WebAssembly from plain JavaScript means writing WAT (WebAssembly's text format) or
compiling C or Rust, shipping a separate `.wasm` file, instantiating it asynchronously, and
copying data between JavaScript and WASM memory. A `wasm { }` block does all of that for you.
There is no `.wasm` file and no build step beyond transpiling the file, and inline blocks
instantiate synchronously when the file loads, so the first call already runs in WASM.

## The shape of a block

```javascript
function square(! x: 0.0):! 0.0 {
  return wasm {
    return x * x
  }
}
```

The block returns a value with `return`, and the function returns that with `return wasm { … }`.
Two markers appear on every function on this page:

- **`!` at the start of the parameter list** turns off TJS's argument checks for the whole
  function, every parameter, not only the first.
- **`:!` on the return** makes the return annotation a type only, not a tested example.

Both are explained under "Why `!` and `:!`" below.

## An example

```tjs:inline
// --- Scalar math ---

function addNumbers(! a: 0, b: 0):! 0 {
  return wasm {
    return a + b
  }
}

function factorial(! n: 0):! 0 {
  return wasm {
    let result = 1.0          // f64: an i32 here would overflow at 13!
    for (let i = 2; i <= n; i++) {
      result = result * i
    }
    return result
  }
}

function lerp(! a: 0.0, b: 0.0, t: 0.0):! 0.0 {
  return wasm {
    return a + (b - a) * t
  }
}

// --- Array processing ---

function sumArray(! arr: Float32Array, len: 0):! 0.0 {
  return wasm {
    let sum = 0.0
    for (let i = 0; i < len; i++) {
      sum = sum + arr[i]
    }
    return sum
  }
}

console.log('addNumbers(3, 4):', addNumbers(3, 4))       // 7
console.log('factorial(10):', factorial(10))             // 3628800
console.log('factorial(13):', factorial(13))             // 6227020800
console.log('lerp(0, 100, 0.25):', lerp(0.0, 100.0, 0.25)) // 25
console.log('sumArray([1,2,3,4]):', sumArray(new Float32Array([1, 2, 3, 4]), 4)) // 10
```

Things to notice:

- **Variables are captured, not declared.** `a`, `b`, `n`, `arr` and `len` are the outer
  function's parameters. The transpiler sees which ones the block uses and passes them in.
- **There is no implicit last-expression return.** A block whose last line is a bare
  expression such as `x * 2` does not compile; the error tells you to write `return x * 2`.
- **A `fallback` is optional.** None of these functions has one. When the runtime cannot run
  WASM, the block's own body runs as JavaScript instead. See
  [Checking the block against its fallback](#checking-the-block-against-its-fallback).
- **Typed arrays are read by index.** `arr[i]` reads an element of a parameter annotated
  `Float32Array`, `Float64Array`, `Int32Array` or `Uint8Array`. A block cannot read
  `arr.length`, so pass the length as its own parameter (`len` here).

## Numbers inside a block

A WASM block has no JavaScript numbers. It has two numeric types:

- **`f64`**, a 64-bit float: the same thing as a JavaScript number.
- **`i32`**, a 32-bit integer.

The rules:

- **Every captured number arrives as `f64`**, whatever its example. `a: 0` checks for an
  integer at the call when validation is on, but inside the block `a + b` is float addition.
- **A `let` takes the type of its initializer.** `let i = 2` is an `i32`, which suits a loop
  counter; `let sum = 0.0` is an `f64`.
- **Mixing the two gives `f64`.** `i <= n` compares as floats, and `result * i` is a float
  multiplication.
- **An `i32` wraps on overflow.** With `let result = 1`, the factorial above would be computed
  in 32 bits, and `factorial(13)` would return 1932053504 where JavaScript gives 6227020800.
  That is why the example writes `1.0`.
- **`/` is JavaScript's division**, even between two `i32` values: `7 / 2` is 3.5, never 3.
- **`%` and the bitwise operators (`|`, `&`, `^`, `<<`, `>>`, `>>>`) need `i32` operands.**
  WASM has no float remainder, so `x % 2` on a captured number is a compile error. For integer
  algorithms, use a [`wasm function`](/wasm-functions/), a standalone WASM function whose
  parameters you declare as `i32`.
- **A comparison is an `i32`, 1 or 0.** A block that returns `v != v` returns the number 1,
  not `true`.

## Why `!` and `:!`

- **`!` skips argument validation.** Without it, TJS checks the arguments on every call: a
  fractional `len` returns a `MonadicError` (TJS's returned error value) instead of running.
  A block exists to make a hot path fast, and checking each argument can cost more than the
  WASM saves. Drop the `!` when the function receives outside data and you want the check.
- **`:!` skips the signature test.** A plain return annotation is a worked example: the
  transpiler calls the function with the parameter examples and compares the result.
  `factorial(! n: 0): 0` would fail that test, because `factorial(0)` is 1, not 0. `:!` says
  only "returns a number".
- **A typed-array annotation is written by type name.** The colon value in TJS is normally an
  example, but there is no literal for a `Float32Array`, so the parameter names the type.
  Such a parameter is not checked at runtime even without `!`, and the transpiler warns that
  it is unchecked. The warning is expected; checking the array is up to the caller.

## Checking the block against its fallback

`fallback { }` is ordinary TJS that runs when the runtime cannot run WASM at all: no
`WebAssembly`, as in iOS Lockdown Mode, or a refused instantiation. When that happens the
runtime records it once per file in `__tjs.records({ source: 'wasm' })`, the
[flight recorder](/error-history/). Write an explicit fallback when the JavaScript version
should be different code, for example a library call the block cannot make; otherwise leave it
out and the block's body runs as JavaScript.

Setting `globalThis.__tjs_wasm_enabled = false` forces every block to run its fallback, even
though the WASM is loaded. Use it to test that the two paths agree, or to benchmark one
against the other.

```tjs:inline
function mean(! xs: Float32Array, len: 0):! 0.0 {
  return wasm {
    let sum = 0.0
    for (let i = 0; i < len; i++) {
      sum = sum + xs[i]
    }
    return sum / len
  } fallback {
    return xs.reduce((total, x) => total + x, 0) / len
  }
}

const xs = new Float32Array([1, 2, 3, 4, 5])
const inWasm = mean(xs, 5)

globalThis.__tjs_wasm_enabled = false
const inFallback = mean(xs, 5)
delete globalThis.__tjs_wasm_enabled

console.log('in WASM:    ', inWasm)                  // 3
console.log('in fallback:', inFallback)              // 3
console.log('agree:      ', inWasm === inFallback)   // true
```

## Limits

A `wasm { }` body is a small, typed subset of JavaScript, not arbitrary code. Anything outside
it is a **compile error** that names the construct; it is never silently shipped as
JavaScript, because writing `wasm { }` is a request for WASM.

- **Allowed:** numeric `let`, `for` loops (nested), `if`/`else`, arithmetic and comparison,
  typed-array element access, the `f32x4_*` SIMD intrinsics, and the math intrinsics
  `Math.sqrt`, `Math.abs`, `Math.floor`, `Math.ceil`, `Math.trunc`, `Math.min` and `Math.max`.
- **Not allowed:** `while` (use `for`), `break` and `continue` (put the exit condition in the
  `for` test), `&&` and `||` (nest the `if`s), function calls other than those intrinsics,
  closures, objects, strings, `try`/`catch`, and any allocation.
- **Not yet supported:** the trigonometric functions (`Math.sin`, `Math.cos`, `Math.tan` and
  their inverses), `Math.exp`, `Math.log` and `Math.pow`. WebAssembly has no instruction for
  them, and a block that uses one does not compile.
- **`==` and `!=` are WASM's inside a block**, not TJS's. In TJS `NaN == NaN` is true; inside a
  block, as in plain JavaScript, `x != x` is true for NaN.
- **This subset is not AJS**, the agent language, which has `while` and no `for`.

<!-- tjs-doc: expect-error -->

```tjs:static
function wave(! t: 0.0):! 0.0 {
  return wasm {
    return Math.sin(t)  // compile error: Math.sin is not supported in a block
  }
}
```

[`DOCS-WASM.md`](/DOCS-WASM/) is the full reference.
