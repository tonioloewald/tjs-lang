<!--{"section": "tjs", "type": "example", "group": "wasmlib", "order": 1, "parent": "tjs-wasmlib.md"}-->

# Using a WASM Library

Imports `dot` and `norm_sq` from `mylinalg` and computes cosine similarity. Run **after** saving the "WASM Library: SIMD Linalg" example as `mylinalg`.

> **Needs a second module.** This example imports the `mylinalg` module from the "WASM Library: SIMD Linalg" example, which a single example on this
> page cannot load. Run it in the [playground](https://tjs-platform.web.app) after saving that
> module, or locally with `tjs run` beside it.

```tjs:static
/#
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
tracked on the project board.
#/

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
  // orthogonal → cosine 0
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
//   row 1: 0.0000   (orthogonal)
//   row 2: -1.0000  (anti-parallel)
//   row 3: 0.9804   (mostly aligned)
```

<!-- TODO review -->
## What the example shows

From the consumer's side, a WASM library is just a module. `import { dot, norm_sq } from
'mylinalg'` is plain ESM; `dot` and `norm_sq` are JavaScript functions that happen to run
WebAssembly. The consumer never sees bytecode, memory or instantiation.

Things to notice:

- **`cosine` is ordinary JavaScript.** Only the inner products run in WASM; the division,
  the square root and the zero-length guard are cheap and stay in JavaScript.
- **One `sqrt`, not two.** `norm_sq` returns the squared norm, so cosine similarity is
  `dot / sqrt(|a|² · |b|²)`.
- **The vectors are `wasmBuffer`s**, so the library's wrappers pass them without copying. A
  regular `Float32Array` would also work, copied on each call.
- **`DIM` is 8**, a multiple of 4, because the SIMD kernels process four floats per step and
  have no tail loop.

The results read as you would expect: row 0 is the query itself (1), row 1 is exactly
orthogonal to it (0), row 2 points the opposite way (-1), and row 3, the query with
neighbouring pairs swapped, is close to parallel (0.98).

<!-- TODO review -->
## Using the shipped library instead

You do not have to write these kernels. `tjs-lang/linalg` ships SIMD `dot` and `norm_sq`
(and offset variants, `dot_at` and `norm_sq_at`, for vectors packed into one large buffer),
with the same preconditions:

```tjs:static
import { dot, norm_sq } from 'tjs-lang/linalg'

const a = wasmBuffer(Float32Array, 128)
const b = wasmBuffer(Float32Array, 128)
for (let i = 0; i < 128; i++) {
  a[i] = Math.random()
  b[i] = Math.random()
}

const cos = dot(a, b, 128) / Math.sqrt(norm_sq(a, 128) * norm_sq(b, 128))
console.log('cosine:', cos)
```

<!-- TODO review -->
## Composed or boundary: who pays for the call

How the import is resolved decides what each call costs, never what it returns.

- **Boundary form** (this page, and any consumer of a published `.js`): the library is a
  separate module with its own WASM, and every call crosses from JavaScript into WebAssembly.
  The crossing costs a few nanoseconds.
- **Composed form**: when the consumer is transpiled with a `ModuleLoader`, the imported
  `wasm function`s are compiled into the consumer's own module. Calls from the consumer's WASM
  into them are plain WASM calls.

Composition is opt-in, because only the caller knows where files live:

```typescript
import { tjs, ModuleLoader } from 'tjs-lang'

const loader = new ModuleLoader({ baseDir: '/path/to/project' })
const result = tjs(appSource, {
  moduleLoader: loader,
  filename: '/path/to/project/app.tjs',
})
```

Composition only removes crossings that happen **inside WASM**. Here the loop over rows is
JavaScript, so each row still makes three calls (one `dot`, two `norm_sq`) from
JavaScript whichever form you use. When that overhead matters, move the loop into WASM, as
[Vector Search Benchmark](/wasm-vector-search/) does with one call for the whole corpus.

<!-- TODO review -->
## Limits

- **`n` must be a multiple of 4**; pad shorter vectors with zeros, which change neither the
  dot product nor the norm.
- **A zero vector has no direction.** `cosine` returns 0 for one rather than dividing by
  zero; decide what your application should do.
- **Each `wasmBuffer` is permanent.** The demo allocates one per corpus row, which is fine
  for four rows. For a real corpus, pack the rows into one buffer and use offsets.
