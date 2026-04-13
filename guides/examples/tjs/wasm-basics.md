<!--{"section":"tjs","type":"example","group":"patterns","order":25}-->

# Inline WASM

> New to WASM in TJS? Start with the **[WASM Quick Start](https://github.com/tonioloewald/tjs-lang/blob/main/docs/WASM-QUICKSTART.md)**.

Write WebAssembly inline — compiled at transpile time, embedded in the output.

```tjs
/*#
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
        x * x + 1
      } fallback {
        return x * x + 1
      }
    }

Param types: `i32` (integer), `f32`/`f64` (float), `Float32Array`, etc.
*/

// --- Basic: integer math in WASM ---

function addInts(! a: 0, b: 0):! 0 {
  return wasm {
    a + b
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
  } fallback {
    let result = 1
    for (let i = 2; i <= n; i++) result *= i
    return result
  }
}

// --- Float math ---

function lerp(! a: 0.0, b: 0.0, t: 0.0):! 0.0 {
  return wasm {
    a + (b - a) * t
  } fallback {
    return a + (b - a) * t
  }
}

// --- Array processing ---

function sumArray(! arr: Float32Array, len: 0):! 0.0 {
  return wasm {
    let sum = 0.0
    for (let i = 0; i < len; i++) {
      let off = i * 4
      sum = sum + f32x4_extract_lane(f32x4_load(arr, off), 0)
    }
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
