# WASM Libraries in tjs — Design & Plan

## Phase 0 status: COMPLETE (2026-05-04)

Assumptions A1–A7 verified against `src/lang/wasm.ts`, `src/lang/emitters/js-wasm.ts`,
`src/lang/parser.ts`, `src/lang/index.ts`, `src/lang/transpiler.test.ts`,
`src/bun-plugin/tjs-plugin.ts`, and `CLAUDE-TJS-SYNTAX.md`. Two assumptions came back
false (A3, A4) and one partly false (A2). The plan below reflects those findings —
see "Implementation plan" for the new Phase 0.5 / Phase 0.75 prereqs.

## Base assumptions (verified)

| # | Assumption | Status | Finding (with citation) |
|---|---|---|---|
| A1 | `wasm {}` blocks today are inline expressions inside a tjs function, not standalone exportable units. There is no `wasm function name(...)` declaration syntax yet. | ✅ true | Current form is inline `wasm { ... }` block inside a regular function, with optional `fallback { ... }` (`wasm.test.ts:1518`). Captures (free variables) become wasm function params automatically (`emitters/js-wasm.ts:89`). The `const x = wasm(...){...}` expression form mentioned in `CLAUDE-TJS-SYNTAX.md:381` doesn't appear in tests — likely vestigial. **Phase 1 (declaration syntax) is real new work.** |
| A2 | All `wasm {}` content in a tjs source file is currently compiled into a single `WebAssembly.Module` per file. Linear memory is shared within a file. | ⚠️ partly false | Each `wasm {}` block compiles to its **own** `WebAssembly.Module` — they're separate modules instantiated independently (`js-wasm.ts:97-103`). They *do* share one linear memory (64MB / 1024 pages, `js-wasm.ts:92`) by importing it via `{env: {memory: __wasmMem}}`. So: **N modules per file, 1 memory per file.** Need a new "consolidate to one module" step — see Phase 0.5. |
| A3 | `wasmBuffer()` is the JS-side primitive for getting a typed-array view backed by the wasm module's linear memory. Allocation lifetime is tied to JS GC. | ❌ false on lifetime | `wasmBuffer()` uses a **bump allocator** with no free (`__woff` only increments — `js-wasm.ts:94`). Allocations are permanent for program lifetime. JS owns the *view* (typed array), but the underlying bytes never get reclaimed — there is no GC link. `CLAUDE-TJS-SYNTAX.md:465` confirms: "Uses a bump allocator — allocations persist for program lifetime (no deallocation)." **Implication: §6 wording is wrong, and the stdlib API must be allocate-once-mutate-in-place.** |
| A4 | The transpiler can resolve `import` statements at transpile time and read the imported `.tjs` source. Cross-file dependency tracking already exists for non-wasm symbols. | ❌ false | Transpiler preserves imports verbatim — no cross-file resolution. `transpiler.test.ts:355` confirms: `expect(result.code).toContain("import { add } from './math.tjs'")`. The bun plugin (`src/bun-plugin/tjs-plugin.ts`) re-transpiles each `.tjs` file independently at runtime when imported. **There is no transpile-time module loader.** This is the real long pole — see Phase 0.75. |
| A5 | Transpiled `.js` output already supports embedding `WebAssembly.Module` bytes (base64 or fetched). This is how single-file wasm blocks reach the browser/node today. | ✅ true | `js-wasm.ts:36-44` produces base64-embedded wasm in self-contained JS. The "boundary distribution form" the plan describes IS the current form. |
| A6 | `(! ...)` after the open paren is the established tjs unsafe-function marker. Same semantics here. | ✅ notation only | Fine. |
| A7 | tjs has no existing multi-module wasm linking, no shared `WebAssembly.Memory` import, no allocator. Greenfield. | ✅ true | No `WebAssembly.Table`, no real linking, no cross-module calls. Memory is shared because it's imported into each module separately — but each module is otherwise standalone. Greenfield for composition. |

---

## Goals

1. **Reusable wasm functions across files.** `import { dot } from 'tjs-lang/linalg'` — and it works.
2. **Zero ceremony for consumers.** No init, no memory management, no awareness of the wasm/JS boundary. Same call site whether the consumer is tjs or plain JS.
3. **Two-tier performance.** tjs consumers compose imported wasm functions into a single module (no JS↔wasm boundary on intra-library calls; engine JIT inlines hot paths). Non-tjs consumers get a normal JS lib with a baked-in `WebAssembly.Module`. Same source, two distribution forms.
4. **Stdlib as educational artifact.** Linalg first. Each function readable as TJS wrapper → scalar wasm → SIMD wasm progression.
5. **Safety by construction.** Wasm functions are pure compute. The transpiler enforces it. Escape hatch exists (`(! ...)`) but is rare and visible.

---

## Design

### 1. Compilation model

**One `WebAssembly.Module` per tjs source file.** All `wasm {}` blocks and `wasm function` declarations in a file lower into the same module. Single linear memory, shared `wasmBuffer`, shared function table (if/when needed).

Today this is N modules per file sharing one memory; Phase 0.5 unifies to one module per file. After that, the rest of the design lands cleanly on the existing memory model.

Cross-file: each `.tjs` consumer file produces *its own* module. Library wasm functions are composed into the consumer's module at transpile time, not linked at runtime.

### 2. Authoring a wasm library

```ts
// tjs-lang/linalg/vec.tjs

/** Dot product of two f32 vectors. */
export wasm function dot(a: Ptr<f32>, b: Ptr<f32>, n: i32): f32 {
  // ... wasm body, SIMD (v1 requires baseline SIMD; see §7)
}

/** Sum of squares. */
export wasm function norm_sq(a: Ptr<f32>, n: i32): f32 {
  // ... can call dot internally — same module after composition
}

// TJS-facing wrapper. This is what `import { dot } from ...` actually returns.
// The wasm function is module-internal (auto-mangled to e.g. `_dot`) and the
// JS-facing wrapper is what consumers see and import.
export function dot(a: F32Array, b: F32Array): 0.0 {
  if (a.length !== b.length) return MonadicError('length mismatch')
  return _dot(a, b, a.length)
}
```

**Pointer typing:** `Ptr<T>` is a real type. It lowers to `i32` in wasm but carries `T` (the element type) through the type system, so the JS-facing wrapper knows what typed-array view to construct. The existing `Float32Array → i32 ptr` mapping in `js-wasm.ts:89` already does the underlying lowering — `Ptr<f32>` formalizes it. Naming conventions like `aPtr` are not relied upon.

**Metadata:** `wasm function`s appear in `__tjs` metadata exactly like regular functions — signature, source location, the works. Introspection works uniformly across both.

Constraints enforced on `wasm function`:

- No allocator calls. No `malloc`-style anything.
- No reads/writes to module-level globals (other than reading constants).
- No mutation outside memory regions reachable from arguments.
- Calls to other `wasm function`s in the same library are fine (they end up in the same composed module and call each other directly).

**Practical purity check (simplified from earlier draft):** a non-`!` `wasm function` may not import or call any host function. That's the same constraint, expressed at the syntactic boundary the parser already enforces — no static analysis of "allocator-shaped intrinsics" needed.

Violations are transpile errors with a hint to the escape hatch.

### 3. Escape hatch

```ts
export wasm function weird_thing(! aPtr: i32, n: i32): i32 {
  // unsafe: may touch globals, may use allocator, transpiler trusts you
}
```

Two consequences of `(! ...)` on a wasm function:

1. **Never composed.** The function is *not* emitted into the consumer's module. Instead, it ships as its own separate `WebAssembly.Module` and is called across the wasm/JS boundary, even when the consumer is tjs. This matters because unsafe functions may carry module-level state (allocator heap, globals) — composing them into each consumer's module would give every consumer its own private copy of that state, with subtly different behavior depending on who imported what. Keeping unsafe functions in their own module means there's one shared instance with one consistent state.
2. **Visible at import.** The transpiler refuses to import `weird_thing` without acknowledging unsafety:

```ts
import { weird_thing! } from 'some-lib/dsp'  // bang at import = consumer consent
```

Rationale: the user pays a complexity tax (writing `!`), but in return gets predictable behavior and a clear audit trail of where unsafety enters the program.

**Reserve the syntax in v1; defer implementation.** YAGNI until the stdlib hits a wall. Linalg as designed will not.

### 4. Import resolution and module composition

> **Design note (revised):** earlier drafts called this "inlining" and described
> splicing imported function bodies into the consumer's module at the bytecode
> level. That was unnecessarily complex. The actual operation is *module
> composition*: imported `wasm function`s are emitted as ordinary functions
> inside the consumer's single module, with cross-file references rewritten to
> local function indices. The wasm engine's JIT (V8/SpiderMonkey/JSC) handles
> any actual body inlining at runtime, and intra-module call overhead is
> single-digit nanoseconds after warmup. We do not try to beat the JIT.

When tjs consumer A imports `dot` from library B:

1. Transpiler reads B's source (or its sidecar metadata file). **Prerequisite: Phase 0.75.**
2. Identifies `dot` as a wasm function.
3. Walks `dot`'s call graph within B, transitively, collecting all reachable `wasm function` declarations.
4. Emits each reached function as a regular function inside A's single `WebAssembly.Module`. Rewrites `call $linalg_dot`-style references to local function indices in the composed module. Renames as needed to avoid collisions.
5. Generates the same JS-facing wrapper as B's source declares.

Deduplication falls out for free: if A imports both `stats` and `linalg`, and `stats` internally calls `linalg/dot`, the symbol resolves once and `dot` is emitted once.

When the consumer is **plain JS** (or has only the transpiled `.js` of B available):

1. No transpile step on consumer side.
2. B's transpiled `.js` already contains a baked `WebAssembly.Module` and JS wrappers.
3. Consumer imports the JS wrappers normally. Calls cross the wasm/JS boundary as usual.
4. Functionally identical, ~10–100ns per-call slower depending on argument shape.

The two distribution forms are now literally the same wasm module bytes with different wrappers around them — boundary-mode wrappers go through `WebAssembly.Instance.exports`, in-module wrappers call the local function index directly. "Same source, two forms" is true at the bytecode level, not just semantically.

### 5. Distribution

A published library ships **both forms**:

```
tjs-lang/linalg/
  src/
    vec.tjs           ← TJS source for tjs consumers (gets module composition)
    matrix.tjs
  dist/
    index.js          ← Transpiled JS with embedded WASM (everyone else)
    index.d.ts
```

`package.json` `exports` field routes:
- tjs transpiler → prefers `src/*.tjs`
- everything else → resolves to `dist/index.js`

### 6. Memory discipline (the rule that makes it all work)

**JS allocates every byte; wasm functions never allocate.** Wasm functions receive `(ptr, len, ...)` and operate on memory regions reachable from arguments. The TJS wrapper allocates output and scratch buffers via `wasmBuffer()`, calls the wasm function, and returns a typed-array view onto the result.

**Important:** `wasmBuffer()` is a **bump allocator** with no free (`js-wasm.ts:94`, `CLAUDE-TJS-SYNTAX.md:465`). Allocations persist for program lifetime. Because of this, the stdlib API is **allocate-once-mutate-in-place**: every operation that produces a buffer takes an `out` parameter rather than allocating a new one. This matches gl-matrix and the performance-oriented JS linalg ecosystem.

```ts
// Linalg API shape — out parameter, no per-call allocation
add(a, b, out)        // out is preallocated by caller, mutated in place
matmul(a, b, out)
dot(a, b)             // returns scalar — no buffer needed
```

Allocate-per-call APIs (`const result = add(a, b)`) are explicitly *not* offered. That convenience would silently leak memory in any long-running program. The price of zero-cost zero-copy is that the caller manages buffers — it's the right tradeoff for a compute kernel library, the wrong one for general-purpose code.

The "JS allocates" invariant eliminates:
- Cross-block allocator coordination
- Lifetime / ownership questions across library boundaries
- Fragmentation across imported libraries
- Inline-vs-boundary semantic divergence
- A whole category of teaching material the stdlib has no business teaching

### 7. SIMD baseline

**v1 requires SIMD.** Wasm SIMD has been stable in V8 (Chrome 91, May 2021), SpiderMonkey (Firefox 89), and JSC (Safari 16.4) for years. Writing a non-SIMD scalar fallback alongside every SIMD function would double the maintenance surface and educational complexity for a vanishingly small audience. If this proves wrong — or if a runtime emerges where this matters — we revisit; the cost of changing later is lower than the cost of carrying scalar duplicates from the start.

The three-layer educational story (TJS wrapper → scalar wasm → SIMD wasm) is preserved in source for *readability* — authors write the scalar version first, then the SIMD version side-by-side. Only the SIMD path ships as runtime code.

---

## Stdlib v1: `tjs-lang/linalg`

Initial surface area, sized to be "useful, not exhaustive":

| Group | Functions |
|---|---|
| Vector | `dot`, `norm`, `normalize`, `add`, `sub`, `scale`, `lerp` |
| Matrix | `matmul`, `transpose`, `identity`, `inverse_3x3`, `inverse_4x4` |
| 3D-specific | `cross`, `quat_mul`, `mat4_from_quat`, `look_at`, `perspective` |

Each ships with three layers visible in source:

1. TJS wrapper (ergonomic API, type-checked, takes `out` buffer)
2. Scalar wasm function (the loop, readable)
3. SIMD wasm function (the optimized version, behind a feature check)

Playground examples link these three side-by-side as the educational artifact.

---

## Implementation plan

### ✅ Phase 0 — verify assumptions (½ day, complete)
Done 2026-05-04. See assumption table above.

### Phase 0.5 — module consolidation (~2 days, **new prereq**)
Refactor `js-wasm.ts` so all `wasm {}` blocks in a file lower into **one** `WebAssembly.Module` with N exports, sharing the existing `__wasmMem`. Today each block is its own module (per A2 finding). This is the foundation: once one-module-per-file lands, "module composition" becomes mechanical.

- Collect all compiled-block bytecodes during emit
- Generate a single module with N exported functions
- Single `WebAssembly.compile` + `WebAssembly.instantiate` per file
- Existing per-block test cases should all still pass (behavior unchanged from caller's perspective)

### Phase 0.75 — transpile-time module loader (~3 days, **new prereq**)
Add a hook that, given an import specifier, can read the target `.tjs`, parse it, and surface its `wasm function` declarations and their call graph. Today the transpiler preserves imports verbatim and the bun plugin re-transpiles each file on demand at runtime (per A4 finding) — that path is fine for regular JS interop but doesn't give us the static info we need for cross-file wasm composition.

- Synchronous file read for filesystem paths (`./math.tjs`)
- Lazy/cached read for package specs (`tjs-lang/linalg`)
- Parse imported source enough to enumerate `wasm function` declarations and their internal calls
- Fail clearly when a target can't be resolved (preserves verbatim-import behavior for non-tjs imports)
- Reusable for future static analysis (type-flow, dead-code, etc.)

### Phase 1 — `wasm function` declaration syntax (1–2 days)
- Add parser support for `(export)? wasm function name(...): RetType { ... }`.
- Type-check signatures (i32/i64/f32/f64/v128 only, plus pointer-as-i32 convention).
- Existing `Float32Array → i32 ptr` mapping in `js-wasm.ts:89` already handles the type lowering — extend to user-declared wasm functions.
- Single-file end-to-end test: declare a wasm function, call it from a regular function, run it.

### Phase 2 — purity enforcement (1 day)
- Static check: a non-`!` `wasm function` may not import or call any host function. (Simpler equivalent of the original "no globals / no allocator" rule.)
- Reserve `(! ...)` slot — parser accepts it, but emits "unsafe wasm functions not yet implemented; remove the bang or wait for v2."

### Phase 3 — cross-file module composition (3–5 days, depends on Phase 0.5 and 0.75)
- Use the loader from Phase 0.75 to walk imported wasm-function dependency graphs.
- Module composition: emit transitively-reached imported wasm functions as ordinary functions in the consumer's single module. Rewrite cross-file references to local function indices. Symbol renaming to avoid collisions; symbol dedup when the same import is reached through multiple paths.
- Test: linalg `dot` imported and called from a separate consumer file, with composition verified by inspecting the emitted module (one module, `dot` present as a local function, no extra imports).

### Phase 4 — JS distribution form (2 days)
- Emitter: produce a standalone `.js` from a tjs library with the wasm module base64-embedded. The boundary-form wrapper generation reuses Phase 1's wrapper codegen with a different output mode (cross-boundary call instead of intra-module call) — same source produces both forms.
- `package.json` `exports` routing for the dual distribution.
- Test: same library, consumed once by tjs (composed) and once by plain JS (boundary), both produce identical results.

### Phase 5 — linalg stdlib (1 week)
- Implement vector / matrix / 3D groups, all with `out`-parameter API per §6.
- Both scalar and SIMD versions.
- Playground examples with the three-layer layout.
- Benchmark vs gl-matrix and similar.

### Phase 6 — docs (2 days)
- New `DOCS-WASM.md` covering authoring, importing, the memory discipline.
- TJS-FOR-JS / TJS-FOR-TS additions.
- Playground tutorial: "Write a fast dot product."

### Phase 7 (deferred) — escape hatch implementation
Only if stdlib hits a real wall. Implement `(! ...)` per §3, including the import-site bang requirement.

---

## Resolved decisions

- **SIMD baseline (was Q1).** v1 requires SIMD. See §7.
- **Pointer typing (was Q2).** Real `Ptr<T>` type. See §2.
- **`__tjs` metadata for wasm functions (was Q3).** Yes, uniform with regular functions. See §2.
- **Symbol dedup under transitive imports (was Q4).** Falls out of the module composition pass — symbols resolve once per consumer module. See §4.

## Open questions

1. **Library duplication across boundary-form deps.** If an app imports two third-party libraries A and B (both shipped as transpiled `.js` per Phase 4), and both internally use `linalg`, each carries its own embedded copy of `linalg`'s wasm. There's no cross-package dedup — same as how every JS dep carries its own copy of `lodash` unless explicitly hoisted. **For v1, accept this.** It matches existing JS ecosystem behavior, and the tjs-to-tjs path (composition) already gives the win where it matters most. A future "shared wasm module registry" (runtime-side, peer-dep style) could dedup at the cost of new infrastructure — defer until someone hits a real bundle-size wall.
2. **Wasm-level tree-shaking.** Phase 3 walks the call graph from imported entry points and emits only reached functions (already designed). Worth verifying with a test that consumers don't accidentally pull in the entire library when they only call `dot` — particularly when the library has SIMD intrinsics that share helpers.
3. **Versioning collisions.** If two transitive deps in a tjs consumer's import graph resolve to *different* versions of `linalg` (one v1.2, one v1.3), how does composition handle it? Strict separate copies (correct, larger output) vs. error-out (forces the user to dedup) vs. pick-one (silent risk). Probably "error out with a clear message" until someone has a concrete need otherwise.

---

## What this design explicitly is not

- Not a general-purpose wasm linker. No multi-module runtime, no shared memory imports, no `WebAssembly.Table` coordination. The transpile-time module composition approach sidesteps all of it.
- Not a substitute for hand-written wasm. Authors who need an arena allocator, threads, or shared memory should write their own `.wasm` and import it as a regular WebAssembly module — outside this system.
- Not a path to non-tjs authors writing wasm libraries for tjs consumers. Library *authors* must use tjs. Library *consumers* can use anything.
