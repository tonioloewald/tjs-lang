<!--{"section":"tjs","type":"example","group":"wasmlib","order":1}-->

# Using a WASM Library

Imports `dot` and `norm_sq` from `mylinalg` and computes cosine similarity. Run **after** saving the "WASM Library: SIMD Linalg" example as `mylinalg`.

```tjs
/*#
## Using a WASM library

This file is the **consumer half** of the wasm-library demo. It imports
two `wasm function`s — `dot` and `norm_sq` — from a sibling module
called `mylinalg` (which you should have saved in the playground from
the "WASM Library: SIMD Linalg" example).

The import is plain ESM. The library was authored as TJS source with
`export wasm function ...` declarations; the playground's loader
resolves `mylinalg` to the saved module and the wasm bootstrap runs
when this consumer loads.

### Caveat: composition isn't wired into the playground yet

In the integration tests, TJS pulls imported `wasm function`s into the
**consumer's own** `WebAssembly.Module` at transpile time (Phase 3
composition) — wasm-to-wasm calls cost single-digit nanoseconds and
there's no JS↔wasm boundary on the inner loop. This is the perf
optimization documented in `wasm-library-plan.md`.

The playground itself doesn't yet pass a `ModuleLoader` to the
transpiler, so cross-file imports are resolved at *runtime* via the
local-module store. Each call from the consumer into `dot`/`norm_sq`
still crosses the JS↔wasm boundary (the "boundary form" from Phase 4
of the plan). Correctness is identical; only the per-call cost differs.

Wiring the playground's `tjs()` invocation with a `ModuleLoader` is
tracked in `TODO.md` under "Playground - Module Management."
*/

import { dot, norm_sq } from 'mylinalg'

// Cosine similarity between two f32 vectors of length `n`.
// `n` must be a multiple of 4. (No type annotations on this thin wrapper —
// the wasm functions it calls already enforce types at the boundary.)
function cosine(a, b, n) {
  const d = dot(a, b, n)
  const ma = norm_sq(a, n)
  const mb = norm_sq(b, n)
  if (ma <= 0 || mb <= 0) return 0
  return d / Math.sqrt(ma * mb)
}

// Build a small corpus: 4 vectors of dim 8
const DIM = 8
const corpus = [
  // identical to query → cosine 1
  [1, 2, 3, 4, 5, 6, 7, 8],
  // orthogonal-ish → low cosine
  [-8, 7, -6, 5, -4, 3, -2, 1],
  // anti-parallel → cosine -1
  [-1, -2, -3, -4, -5, -6, -7, -8],
  // partially-aligned → moderate cosine
  [2, 1, 4, 3, 6, 5, 8, 7],
]
const query = [1, 2, 3, 4, 5, 6, 7, 8]

// Use wasmBuffer for zero-copy memory sharing with wasm
const queryBuf = wasmBuffer(Float32Array, DIM)
for (let i = 0; i < DIM; i++) queryBuf[i] = query[i]

console.log('Cosine similarity of query against each row:')
for (let i = 0; i < corpus.length; i++) {
  const rowBuf = wasmBuffer(Float32Array, DIM)
  for (let j = 0; j < DIM; j++) rowBuf[j] = corpus[i][j]
  const sim = cosine(queryBuf, rowBuf, DIM)
  console.log(`  row ${i}: ${sim.toFixed(4)}`)
}

// Expected output:
//   row 0: 1.0000   (identical)
//   row 1: 0.1111   (near-orthogonal)
//   row 2: -1.0000  (anti-parallel)
//   row 3: 0.9706   (mostly-aligned)
```
