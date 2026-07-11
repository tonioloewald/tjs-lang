# WASM in TJS

Canonical reference for WebAssembly in TJS — what you can write, how it's
compiled, and how cross-file composition works.

For a 5-minute introduction, start with [`docs/WASM-QUICKSTART.md`](docs/WASM-QUICKSTART.md).
For the cross-file libraries design rationale, see [`wasm-library-plan.md`](wasm-library-plan.md).

---

## Two flavors

TJS supports two related ways of writing WebAssembly:

| Flavor                    | Syntax                                               | Use when                                                                              |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Inline block**          | `wasm { ... }` inside a regular function             | One-off acceleration of a hot inner loop in a single function; you want a JS fallback |
| **Top-level declaration** | `wasm function NAME(...): T { ... }` at module scope | Reusable kernel that other files (or this one) may want to import                     |

Both flavors compile to the same `WebAssembly.Module` per file (one module per
file, multiple exported functions), and both share one linear memory.

### Inline blocks

The original form. Captures (free variables) are auto-detected from the
enclosing scope and become wasm function parameters. Optional `fallback { ... }`
provides a JS path when SIMD or other features are unavailable.

```tjs
function double(arr: Float32Array, len: 0) {
  wasm {
    for (let i = 0; i < len; i++) {
      arr[i] = arr[i] * 2.0
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= 2
  }
}
```

See `docs/WASM-QUICKSTART.md` for a thorough walkthrough.

### Runtime: readiness, silent-fallback warnings, and the enable toggle

Inline `wasm{}` blocks instantiate **asynchronously** (`WebAssembly.compile` +
`instantiate` in a fire-and-forget IIFE), so code that runs synchronously right
after transpile+eval takes the JS `fallback{}` — the module isn't ready yet.
Three runtime controls (all on `globalThis`):

- **`await globalThis.__tjs_wasm_ready()`** — resolves once every emitted module's
  WASM has instantiated. Await it before your first call to guarantee the WASM
  path instead of racing the fallback. (Modules push their instantiation promise
  onto `globalThis.__tjs_wasm_pending`; `__tjs_wasm_ready()` awaits them all.)
- **`globalThis.__tjs_wasm_enabled = false`** — forces every block to run its
  `fallback{}` (JS) even when the WASM is instantiated. A public A/B toggle for
  "WASM vs JS, N×" benchmarking without poking the internal `__tjs_wasm_<id>`
  globals. Set back to `true` (or delete) to re-enable.
- **Silent-fallback is now surfaced.** A block that _can't compile_ (unsupported
  construct) still falls back — but that used to be invisible. The failure is now
  in `result.wasmCompiled` (per-block `success:false` + `error`) **and** mirrored
  into `result.warnings` (`"wasm{} block '<id>' did not compile — running the
fallback{} (JS): <reason>"`), so it no longer looks like WASM "worked."

### Top-level declarations

The Phase 1+ form. Declared with explicit parameters and return type, at module
scope. The function name is what consumers (in this file or other files) call.
No `fallback {}` block — these are pure wasm kernels.

```tjs
export wasm function dot(a: Float32Array, b: Float32Array, n: i32): f64 {
  let acc = f32x4_splat(0.0)
  for (let i = 0; i < n; i += 4) {
    let off = i * 4
    let av = f32x4_load(a, off)
    let bv = f32x4_load(b, off)
    acc = f32x4_add(acc, f32x4_mul(av, bv))
  }
  return f32x4_extract_lane(acc, 0)
    + f32x4_extract_lane(acc, 1)
    + f32x4_extract_lane(acc, 2)
    + f32x4_extract_lane(acc, 3)
}
```

The transpiler replaces the declaration with a regular JS wrapper that forwards
to the wasm export. Callers see a normal JavaScript function.

---

## Parameter types

`wasm function` parameters use wasm type names, **not** TJS example-based
syntax. (Inside a `wasm function`, `name: 'hello'` would be a type error, not
an example value.)

| Annotation           | WASM type       | Notes                                 |
| -------------------- | --------------- | ------------------------------------- |
| `name: i32`          | `i32`           | 32-bit signed integer                 |
| `name: i64`          | `i64`           | 64-bit signed integer                 |
| `name: f32`          | `f32`           | 32-bit float                          |
| `name: f64`          | `f64`           | 64-bit float                          |
| `name: number`       | `f64`           | Alias                                 |
| `name: int`          | `i32`           | Alias                                 |
| `name: Float32Array` | `i32` (pointer) | Pointer to f32 array in linear memory |
| `name: Float64Array` | `i32` (pointer) | Pointer to f64 array                  |
| `name: Int32Array`   | `i32` (pointer) | Pointer to i32 array                  |
| `name: Uint8Array`   | `i32` (pointer) | Pointer to u8 array                   |

The JS-side wrapper auto-marshals typed arrays: if you pass a regular
`Float32Array`, the wrapper copies it into wasm memory and back; if you pass a
`wasmBuffer(Float32Array, n)`, the wrapper detects the shared backing buffer
and skips the copy (zero-copy fast path).

## Return types

**Current backend limitation:** wasm functions return `f64` or void only.

`: f64` and omitted-return both work today. Other return types (`: i32`,
`: f32`, `: v128`) are parsed but not yet driving the emitted bytecode; the
backend always emits f64. This is a known limitation tracked in
`wasm-library-plan.md` as "Phase 1.5 work."

Practically: if your function would naturally return f32 (e.g., a SIMD reduce),
return f64 and let the caller downcast. If you need integer results, return
f64 and cast on the JS side.

## SIMD intrinsics

v1 of the wasm-library plan **requires SIMD baseline**. All the f32x4
intrinsics from inline blocks work in `wasm function` bodies:

- **memory / lanes:** `f32x4_splat`, `f32x4_load`, `f32x4_store`,
  `f32x4_extract_lane`, `f32x4_replace_lane`
- **arithmetic:** `f32x4_add`, `f32x4_sub`, `f32x4_mul`, `f32x4_div`,
  `f32x4_neg`, `f32x4_sqrt`, `f32x4_min`, `f32x4_max`
- **comparisons** (return a v128 lane **mask** — all-1s where true, all-0s else):
  `f32x4_eq`, `f32x4_ne`, `f32x4_lt`, `f32x4_gt`, `f32x4_le`, `f32x4_ge`
- **branch-free blend:** `f32x4_select(mask, a, b)` — picks lane `a` where the
  mask lane is true, `b` where false (compiles to `v128.bitselect`).

The compare → mask → `select` trio is what makes **data-dependent** SIMD possible
(clamp/saturate, conditional blends, per-lane escape masking à la SIMD Mandelbrot)
— not just branchless arithmetic. Example, a branch-free clamp:

```tjs
let lo = f32x4_splat(0.0)
let hi = f32x4_splat(1.0)
let clamped = f32x4_min(f32x4_max(v, lo), hi)          // via min/max
// or, equivalently, via a mask + select:
let tooBig = f32x4_gt(v, hi)                            // → lane mask
let out = f32x4_select(tooBig, hi, clamped)            // hi where v>hi, else clamped
```

Lengths must be multiples of 4 for SIMD loops. Callers pad as needed.

---

## Memory discipline

**JS allocates every byte; wasm functions never allocate.**

This is the load-bearing invariant of the whole system. Wasm functions receive
typed-array pointers and operate on memory regions reachable from arguments.
The JS-side wrapper (or the caller, for `wasmBuffer`-backed arrays) is
responsible for allocation and lifetime.

### `wasmBuffer()`

Allocate a typed array backed by wasm linear memory:

```tjs
const xs = wasmBuffer(Float32Array, 50000)
xs[0] = 1.0  // writes directly into wasm memory
dot(xs, ys, 50000)  // zero-copy: wrapper detects the shared buffer
```

### Bump allocator caveat

`wasmBuffer` uses a bump allocator with **no free** — allocations persist for
program lifetime. This is deliberate: it eliminates lifetime/ownership
questions across library boundaries. The cost: long-running programs that
allocate per-call would leak.

The stdlib API shape (Phase 5+) follows from this: every function that would
produce a buffer takes an `out` parameter instead, so the caller allocates
once and reuses. Functions returning scalars (`dot`, `norm_sq`) are fine
as-is.

### What this eliminates

- Cross-block allocator coordination
- Lifetime / ownership across library boundaries
- Fragmentation
- Inline-vs-boundary semantic divergence

---

## Cross-file composition (Phase 3)

A file can declare `wasm function`s; another file can import and use them.
The import is resolved **at transpile time** and the imported function's body
is composed into the consumer's wasm module as a local function — no
JS↔wasm boundary on intra-module calls.

### Library file

```tjs
// my-lib/index.tjs
export wasm function dot(a: Float32Array, b: Float32Array, n: i32): f64 {
  // ... SIMD dot product ...
}
```

### Consumer file

```tjs
// app.tjs
import { dot } from './my-lib/index.tjs'

const a = wasmBuffer(Float32Array, 128)
const b = wasmBuffer(Float32Array, 128)
// ... populate ...
const d = dot(a, b, 128)  // calls into the composed wasm module
```

The consumer's transpiled output contains the wasm bytes for `dot` as a local
function in its single `WebAssembly.Module`. No separate library bundle is
fetched at runtime.

### Enabling composition

The composition pass is opt-in: pass a `ModuleLoader` to `tjs()` or
`transpileToJS()`. Without one, imports are preserved verbatim and the
runtime resolves them as before.

```typescript
import { tjs, ModuleLoader } from 'tjs-lang/lang'

const loader = new ModuleLoader({ baseDir: '/path/to/project' })
const result = tjs(appSource, {
  moduleLoader: loader,
  filename: '/path/to/project/app.tjs',
})
```

---

## Two distribution forms

Same source produces two outputs depending on how the library is consumed:

**Composed form** (tjs-to-tjs, when the consumer transpiles with a loader):

- Library's wasm functions become local exports in the consumer's module
- One `WebAssembly.compile` per consumer file
- Intra-module calls between the consumer's own wasm and the imported wasm are
  pure wasm calls (no JS↔wasm boundary)

**Boundary form** (when the library is consumed as a published `.js`):

- Library transpiles to a self-contained `.js` with embedded wasm + JS wrappers
- Consumer imports the `.js` via normal ESM
- Each call from JS into a library wrapper crosses the JS↔wasm boundary
- Per-call cost is single-digit nanoseconds for small functions — usually
  negligible after JIT warmup

Both forms compile from the same TJS source and produce identical results.

A published library typically ships both:

```
my-lib/
  src/
    index.tjs      ← TJS source, used by tjs consumers (composed form)
  dist/
    index.js       ← Transpiled, used by everyone else (boundary form)
```

`package.json` `exports`:

```json
"exports": {
  "./my-lib": {
    "bun": "./src/index.tjs",
    "default": "./dist/index.js"
  }
}
```

---

## Purity and the `(!)` unsafe marker

A `wasm function` may not call any host function. This rule is enforced by
the backend: the bytecode builder has no support for emitting host imports,
so any attempt (e.g. `Math.sin`, which would require a JS-side trampoline)
fails at compile time. Math functions with wasm intrinsics — `sqrt`, `abs`,
`floor`, `ceil`, `min`, `max` — work fine.

The `(!)` marker is **reserved syntax** for a future "unsafe wasm function"
variant that would relax purity (allow host imports, side-effecting globals).
Writing `wasm function (! name(...)` today produces a clear error directing
you to either remove the bang or wait for the unsafe variant to be implemented.

---

## tjs-lang/linalg

The first stdlib library built on this infrastructure ships two SIMD
kernels:

```tjs
import { dot, norm_sq } from 'tjs-lang/linalg'

const a = wasmBuffer(Float32Array, 128)
const b = wasmBuffer(Float32Array, 128)
// ... populate ...
const cos = dot(a, b, 128) / Math.sqrt(norm_sq(a, 128) * norm_sq(b, 128))
```

**Preconditions:** `n` must be a multiple of 4 (the SIMD lane width). Pad
shorter vectors with zeros.

**Future additions** (planned, not yet shipped): `norm`, `normalize`,
`add`, `sub`, `scale`, `lerp`, `matmul`, `transpose`, `cross`, `quat_mul`,
`look_at`, `perspective`. See `wasm-library-plan.md` § 5.

---

## Supported subset inside `wasm{}` / `wasm function`

A `wasm{}` body is a **small, typed subset** of JS, not arbitrary code. Anything
outside it makes an inline block fall back to its `fallback{}` (and now emits a
warning — see § Runtime). Supported:

- **Numeric locals:** `let x = <expr>` (i32 or f64, inferred from the initializer).
- **`for` loops** with numeric bounds — `for (let i = 0; i < n; i += k) { … }` —
  including **nested** loops. `break` / `continue` work.
- **`if` / `else`** and the logical operators `&&` / `||`.
- **Arithmetic / comparison** on i32 and f64 (see the coercion gotcha below).
- **Typed-array element access** — `arr[i]` reads/writes, where `arr` is a typed-
  array **parameter** (annotated `Float32Array` / `Float64Array` / `Int32Array` /
  `Uint8Array`, marshaled to a pointer). A plain `[0.0]` example-typed param is a
  JS array, **not** a wasm pointer — annotate it as `Float32Array`.
- **Math intrinsics:** `sqrt`, `abs`, `floor`, `ceil`, `min`, `max`, `sin`, `cos`,
  `log`, `exp`, `pow`.
- **SIMD:** the full `f32x4_*` set (see § SIMD intrinsics).

Not supported (→ fallback + warning): allocation (JS owns all memory), function
calls other than the intrinsics above, closures, objects/strings, `try`/`catch`,
`while` (use `for`). Watch the `result.warnings` / `result.wasmCompiled` to catch
a block that fell back.

### Numeric gotcha: i32 / i32 is **integer** division

Types are inferred per operand, and coercion to f64 happens **per binary op**, at
the _next_ operator — so a division where both operands are i32 (loop vars,
`0`-annotated params, integer literals) does **integer** division and truncates,
even in a float-heavy kernel:

```tjs
// x and w are i32 (loop var / param): x / w truncates to 0 for all x < w,
// so (x / w - 0.5) is (0 - 0.5) everywhere — a constant, silently wrong.
let bad = x / w - 0.5
// Force float early by adding 0.0 to one operand:
let fx = x + 0.0
let good = fx / w - 0.5          // now f64 division
```

This bit a real Mandelbrot kernel. Rule of thumb: in a float kernel, seed your
integer loop vars into f64 (`let fx = i + 0.0`) before dividing. (A compile-time
lint for i32/i32 division feeding a float context is a tracked follow-up.)

## Current limitations (v1)

These are real constraints worth knowing about. Most are scoped follow-ups
from the wasm-library plan.

- **Return types:** `f64` and void only. `i32`, `f32`, `v128` returns are
  parsed but not yet emitted as the bytecode return type.
- **SIMD lengths:** SIMD kernels assume `n % 4 == 0`. No tail-loop yet.
- **Bump allocator:** `wasmBuffer` allocations persist forever. Use `out`
  parameters for repeated allocations; design APIs around buffer reuse.
- **Unsafe marker reserved:** `(!)` syntax is parsed but rejected pending the
  unsafe variant implementation (Phase 7).
- **One file = one module:** the consumer's transpiled output has exactly one
  `WebAssembly.Module`, period. Cross-module wasm-to-wasm calls aren't a thing
  — they're composed at the source level into the same module.
- **Boundary form per-call cost:** when a library is consumed via its
  transpiled `.js`, each call crosses the JS↔wasm boundary. Engines inline
  small functions at JIT time, but the boundary still costs single-digit
  nanoseconds. Composed form (tjs-to-tjs) avoids this.
- **Library duplication across `.js` deps:** if two third-party libraries both
  embed `linalg` in their `.js` distribution, the consumer carries two copies.
  Matches JS ecosystem norms — a future "shared wasm module registry" could
  dedup at the cost of new infrastructure.

---

## References

- `docs/WASM-QUICKSTART.md` — 5-minute introduction (inline blocks)
- `wasm-library-plan.md` — Design rationale and phased implementation plan
- `CLAUDE-TJS-SYNTAX.md` § "WASM Blocks" — Inline block reference
- `src/linalg/index.tjs` — First stdlib library, readable as source
