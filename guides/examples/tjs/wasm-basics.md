<!--{"section": "tjs", "type": "example", "group": "patterns", "order": 25, "parent": "tjs-patterns.md"}-->
<!-- TODO review -->

# Inline WASM

> New to WASM in TJS? Start with the **[WASM Quick Start](/WASM-QUICKSTART/)**.

Write WebAssembly inline — compiled at transpile time, embedded in the output.

```tjs:inline
/#
## The Problem

Using WebAssembly in JavaScript requires:
1. Write WAT or compile from C/Rust
2. Load a separate .wasm file
3. Instantiate the module async
4. Marshal data between JS and WASM heaps

TJS does all of this for you. Write WASM inline using JS-like
syntax, it compiles at transpile time and embeds as base64.

## Syntax

    function fast(x: 0, y: 0) {
      wasm {
        // JS-like syntax compiled to WASM bytecode
      } fallback {
        // JS fallback if WASM unavailable
        return x + y
      }
    }

    // Or with a return value:
    function compute(x: 0) {
      return wasm {
        return x * x + 1
      } fallback {
        return x * x + 1
      }
    }

The enclosing function's variables are captured automatically. Numbers
arrive in the block as `f64` (JavaScript-exact); typed arrays annotated
`Float32Array`, `Float64Array`, `Int32Array` or `Uint8Array` arrive as
pointers into WASM memory.
#/

// --- Basic: integer math in WASM ---

function addInts(! a: 0, b: 0):! 0 {
  return wasm {
    return a + b
  } fallback {
    return a + b
  }
}

function factorial(! n: 0):! 0 {
  return wasm {
    let result = 1
    for (let i = 2; i <= n; i++) {
      result = result * i
    }
    return result
  } fallback {
    let result = 1
    for (let i = 2; i <= n; i++) result *= i
    return result
  }
}

// --- Float math ---

function lerp(! a: 0.0, b: 0.0, t: 0.0):! 0.0 {
  return wasm {
    return a + (b - a) * t
  } fallback {
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
  } fallback {
    let sum = 0
    for (let i = 0; i < len; i++) sum += arr[i]
    return sum
  }
}

console.log('addInts(3, 4):', addInts(3, 4))
console.log('factorial(10):', factorial(10))
console.log('lerp(0, 100, 0.25):', lerp(0.0, 100.0, 0.25))
console.log('sumArray([1,2,3,4]):', sumArray(new Float32Array([1, 2, 3, 4]), 4))
```

## What the example shows

A `wasm { }` block sits inside an ordinary TJS function. The transpiler compiles the block to
WebAssembly bytecode **when the file is transpiled**, embeds the bytes in the emitted
JavaScript, and replaces the block with a call into the compiled module. There is no `.wasm`
file to ship, no build step to add, and no async loading for you to write: inline blocks
instantiate synchronously when the file loads, so the first call already runs in WASM.

Things to notice:

- **The block can `return` a value**, and the function returns it with `return wasm { … }`.
  There is no implicit last-expression return: a block that ends in a bare expression
  returns nothing.
- **Variables are captured, not declared.** `a`, `b`, `n`, `arr` and `len` are the outer
  function's parameters. The transpiler sees which ones the block uses and passes them in.
- **Typed arrays are read by index.** `arr[i]` reads an element of a parameter annotated
  `Float32Array`, `Float64Array`, `Int32Array` or `Uint8Array`; the array arrives as a
  pointer into WASM memory, and `len` tells the block how many elements to read.
- **`let` inside the block is typed by its initializer.** `let result = 1` is an `i32`,
  which is what a loop counter wants; `let sum = 0.0` is an `f64`.
- **Every function is marked `!`, and every return is `:!`.** Both turn checks off, for
  different reasons. The `!` before the parameters skips TJS's runtime validation of the
  arguments on every call. A WASM block exists to make a hot path fast, and checking each
  argument costs more than adding two numbers in WASM saves. Without it, scalar parameters
  such as `len: 0` are checked at the call (a fractional `len` returns a `MonadicError`),
  while a `Float32Array` annotation is not a runtime type at all: the transpiler warns that
  it is unchecked. The `:!` makes the return annotation a type only. A plain `: 0` is a
  worked example that the transpiler tests by calling the function with the parameter
  examples; `:!` says "returns an integer" without that test. Drop the `!` when the function
  is called with untrusted input and you want the check.
- **`fallback { }` is ordinary TJS.** It runs only when the runtime cannot run WASM at all
  (no `WebAssembly`, as in iOS Lockdown Mode, or a refused instantiation). Each such fallback
  is recorded once in `__tjs.records({ source: 'wasm' })`.

## Checking the block against its fallback

A block and its fallback should give the same answer, and you can make the runtime prove it.
Setting `globalThis.__tjs_wasm_enabled = false` forces every block to run its fallback, even
though the WASM is loaded: an A/B switch for testing and benchmarking.

```tjs:inline
function mean(! xs: Float32Array, len: 0):! 0.0 {
  return wasm {
    let sum = 0.0
    for (let i = 0; i < len; i++) {
      sum = sum + xs[i]
    }
    return sum / len
  } fallback {
    let sum = 0
    for (let i = 0; i < len; i++) sum += xs[i]
    return sum / len
  }
}

// `/` is JavaScript's division in a block, even between two i32 values
function sevenHalves(! n: 0):! 0.0 {
  return wasm {
    let k = 7
    return k / 2 + n
  }
}

const xs = new Float32Array([1, 2, 3, 4, 5])
console.log('mean, in WASM:     ', mean(xs, 5))

globalThis.__tjs_wasm_enabled = false
console.log('mean, in fallback: ', mean(xs, 5))
delete globalThis.__tjs_wasm_enabled

console.log('7 / 2 in a block:  ', sevenHalves(0))
```

The `sevenHalves` function has no `fallback`; that is allowed, and when WASM is unavailable the
transpiler's implicit fallback runs the same body as JavaScript.

## Limits

A `wasm { }` body is a small, typed subset of JavaScript, not arbitrary code. Anything outside
it is a **compile error** that names the construct; it is never silently shipped as
JavaScript, because writing `wasm { }` is a request for WASM.

- **Allowed:** numeric `let`, `for` loops (nested, with `break` and `continue`), `if`/`else`,
  `&&`/`||`, arithmetic and comparison, typed-array element access, the `f32x4_*` SIMD
  intrinsics, and the math intrinsics `Math.sqrt`, `abs`, `floor`, `ceil`, `trunc`, `min`
  and `max`.
- **Not allowed:** `while` (use `for`), function calls other than those intrinsics, closures,
  objects, strings, `try`/`catch`, and any allocation. `Math.sin`, `cos`, `log`, `exp` and
  `pow` have no WebAssembly instruction, so a block that uses them does not compile.
- **`%` and the bitwise operators need `i32` operands.** Parameters arrive as `f64`, so
  `x % 2` on a captured number does not compile. For integer algorithms, use a
  [`wasm function`](/wasm-functions/) with `i32` parameters.
- **`==` and `!=` are JavaScript's inside a block**, not TJS's: `x != x` is true for NaN.
- **This subset is not AJS.** AJS, the agent language, has `while` and no `for`; a WASM block
  has `for` and no `while`. They are separate subsets with separate purposes, and rules from
  one do not carry over to the other.

<!-- tjs-doc: expect-error -->

```tjs:static
function wave(! t: 0.0):! 0.0 {
  return wasm {
    return Math.sin(t)  // compile error: Math.sin has no WASM instruction
  }
}
```

When should you reach for a block at all? When a profiler says a numeric inner loop is hot.
Most code is faster written plainly; WASM pays off on tight loops over typed arrays, and most
of all with SIMD, which the next chapter covers. [`DOCS-WASM.md`](/DOCS-WASM/) is the full
reference.
