/**
 * Canonical wasm-library acceptance test: vector-search inline vs composed.
 *
 * This is the test that proves the conceptual goal from
 * `wasm-library-plan.md` § "Canonical end-to-end demo". The same
 * cosine-similarity workload is run two ways:
 *
 *   Inline baseline: one big `wasm {}` block computing dot/magA/magB
 *                    together — what the original `wasm-vector-search.md`
 *                    playground example does today.
 *
 *   Composed:        a JS outer loop calling imported `dot` and `norm_sq`
 *                    from `tjs-lang/linalg`. The library's wasm functions
 *                    are composed into the consumer's wasm module via the
 *                    Phase 3 ModuleLoader path.
 *
 * Acceptance criteria (matches the plan):
 *   1. Correctness:  both implementations pick the same best index across
 *                    a randomized corpus. ✓ asserted.
 *   2. Performance:  within ~5% of the inline baseline. Timing is reported
 *                    for inspection but not asserted as a hard limit
 *                    (engine variance makes hard thresholds flaky in CI).
 *   3. Module shape: composed-not-imported. Verified by Phase 3 tests in
 *                    wasm.test.ts; not re-checked here.
 *   4. Boundary form: same library works for non-tjs consumers. Verified
 *                    by Phase 4 tests; not re-checked here.
 */

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const LINALG_SOURCE = readFileSync(join(import.meta.dir, 'index.tjs'), 'utf8')

// The inline baseline — single wasm{} block computing dot, magA, magB
// together. Mirrors what guides/examples/tjs/wasm-vector-search.md does.
const INLINE_SOURCE = `
function inlineSearch(corpus: Float32Array, query: Float32Array, count: 0, dim: 0) {
  return wasm {
    let bestIdx = 0
    let bestScore = -2.0

    for (let v = 0; v < count; v++) {
      let dotAcc = f32x4_splat(0.0)
      let magAAcc = f32x4_splat(0.0)
      let magBAcc = f32x4_splat(0.0)

      for (let j = 0; j < dim; j += 4) {
        let qOff = j * 4
        let cOff = (v * dim + j) * 4
        let a = f32x4_load(query, qOff)
        let b = f32x4_load(corpus, cOff)
        dotAcc = f32x4_add(dotAcc, f32x4_mul(a, b))
        magAAcc = f32x4_add(magAAcc, f32x4_mul(a, a))
        magBAcc = f32x4_add(magBAcc, f32x4_mul(b, b))
      }

      let dot = f32x4_extract_lane(dotAcc, 0) + f32x4_extract_lane(dotAcc, 1)
              + f32x4_extract_lane(dotAcc, 2) + f32x4_extract_lane(dotAcc, 3)
      let magA = f32x4_extract_lane(magAAcc, 0) + f32x4_extract_lane(magAAcc, 1)
               + f32x4_extract_lane(magAAcc, 2) + f32x4_extract_lane(magAAcc, 3)
      let magB = f32x4_extract_lane(magBAcc, 0) + f32x4_extract_lane(magBAcc, 1)
               + f32x4_extract_lane(magBAcc, 2) + f32x4_extract_lane(magBAcc, 3)

      let mA = Math.sqrt(magA)
      let mB = Math.sqrt(magB)
      if (mA > 0.000001) {
        if (mB > 0.000001) {
          let score = dot / (mA * mB)
          if (score > bestScore) {
            bestScore = score
            bestIdx = v
          }
        }
      }
    }
    return bestIdx
  }
}
`

// Composed, JS-outer-loop: outer iteration is JS calling imported linalg
// kernels. Each row costs 2 JS↔wasm boundary crossings (dot + norm_sq).
const COMPOSED_JS_LOOP_SOURCE = `
import { dot, norm_sq } from './linalg.tjs'

function composedJsSearch(corpus, query, count, dim) {
  const magA = Math.sqrt(norm_sq(query, dim))
  if (magA < 0.000001) return 0

  let bestIdx = 0
  let bestScore = -2

  for (let v = 0; v < count; v++) {
    const row = corpus.subarray(v * dim, (v + 1) * dim)
    const d = dot(query, row, dim)
    const magB = Math.sqrt(norm_sq(row, dim))
    if (magB > 0.000001) {
      const score = d / (magA * magB)
      if (score > bestScore) {
        bestScore = score
        bestIdx = v
      }
    }
  }
  return bestIdx
}
`

// Composed, WASM-outer-loop: outer iteration is itself a `wasm function`
// that calls imported `dot_at` / `norm_sq_at` via wasm-to-wasm
// `call <index>` instructions. NO JS↔wasm boundary in the inner loop —
// the whole workload runs inside one wasm call. This is the Phase 1.5
// payoff in action.
const COMPOSED_WASM_LOOP_SOURCE = `
import { dot_at, norm_sq_at } from './linalg.tjs'

wasm function composedWasmSearch(
  corpus: Float32Array,
  query: Float32Array,
  count: i32,
  dim: i32
): f64 {
  let magQ = norm_sq_at(query, 0, dim)
  if (magQ < 0.000001) return 0.0
  let mA = Math.sqrt(magQ)

  let bestIdx = 0
  let bestScore = -2.0

  for (let v = 0; v < count; v++) {
    let startIdx = v * dim
    let d = dot_at(corpus, startIdx, query, dim)
    let magB = norm_sq_at(corpus, startIdx, dim)
    if (magB > 0.000001) {
      let mB = Math.sqrt(magB)
      let score = d / (mA * mB)
      if (score > bestScore) {
        bestScore = score
        bestIdx = v
      }
    }
  }
  return bestIdx
}
`

/**
 * Compile one source and load it into a fresh globalThis.__tjs context,
 * exposing the named search function (and its wasmBuffer) on globalThis
 * under unique keys for the benchmark to pick up.
 *
 * Each variant gets its own wasm module + own __wasmMem, so wasmBuffer
 * allocations stay isolated.
 */
async function loadVariant(
  code: string,
  fnName: string,
  varName: string
): Promise<{
  search: (
    corpus: Float32Array,
    query: Float32Array,
    count: number,
    dim: number
  ) => number
  wasmBuffer: (Ctor: any, len: number) => any
}> {
  await new Function(
    '__tjs',
    `return (async () => { ${code}\n` +
      `globalThis.__${varName}_search = ${fnName};\n` +
      `globalThis.__${varName}_wasmBuffer = globalThis.wasmBuffer;\n` +
      `})();`
  )(globalThis.__tjs)
  await new Promise((r) => setTimeout(r, 100))
  const search = (globalThis as any)[`__${varName}_search`]
  const wasmBuffer = (globalThis as any)[`__${varName}_wasmBuffer`]
  if (typeof search !== 'function') {
    throw new Error(`${varName} search function not registered`)
  }
  if (typeof wasmBuffer !== 'function') {
    throw new Error(`${varName} wasmBuffer not available`)
  }
  return { search, wasmBuffer }
}

describe('Canonical demo: vector-search across three forms', () => {
  // Compares THREE implementations of the same cosine-similarity workload:
  //   - inline:    one big wasm{} block (no boundary crossings)
  //   - composedJs: imported linalg + JS outer loop (2 crossings per row)
  //   - composedWasm: imported linalg + wasm-function outer loop calling
  //                   dot_at/norm_sq_at via wasm `call <index>` (1 crossing
  //                   for the whole workload)
  //
  // The point: composedWasm should match (or beat) inline. If it does,
  // the perf criterion from the wasm-library plan is proven.
  it('all three forms agree on best index; composed-wasm matches inline perf', async () => {
    const { tjs } = await import('../lang/index')
    const { createRuntime } = await import('../lang/runtime')
    const { ModuleLoader, inMemoryFileSystem } = await import(
      '../lang/module-loader'
    )

    // Compile each source (composed versions share a loader pointing at linalg)
    const inlineResult = tjs(INLINE_SOURCE, { runTests: false })
    expect(inlineResult.wasmCompiled!.every((b) => b.success)).toBe(true)

    const loader = new ModuleLoader({
      fs: inMemoryFileSystem({ '/proj/linalg.tjs': LINALG_SOURCE }),
      baseDir: '/proj',
    })

    const composedJsResult = tjs(COMPOSED_JS_LOOP_SOURCE, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })
    expect(composedJsResult.wasmCompiled!.every((b) => b.success)).toBe(true)

    const composedWasmResult = tjs(COMPOSED_WASM_LOOP_SOURCE, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })
    expect(composedWasmResult.wasmCompiled!.every((b) => b.success)).toBe(true)

    const savedTjs = globalThis.__tjs
    try {
      // ---- Inline ----
      globalThis.__tjs = createRuntime()
      const inline = await loadVariant(
        inlineResult.code,
        'inlineSearch',
        'inline'
      )

      // ---- Composed, JS outer loop ----
      globalThis.__tjs = createRuntime()
      const composedJs = await loadVariant(
        composedJsResult.code,
        'composedJsSearch',
        'composedJs'
      )

      // ---- Composed, WASM outer loop ----
      globalThis.__tjs = createRuntime()
      const composedWasm = await loadVariant(
        composedWasmResult.code,
        'composedWasmSearch',
        'composedWasm'
      )

      // ---- Workload configs ----
      // Each config: { dim, count, label }. Sized to keep the test under
      // a few seconds in CI but large enough for SIMD to matter.
      const configs = [
        { dim: 128, count: 500, label: '500x128' },
        { dim: 256, count: 500, label: '500x256' },
        { dim: 128, count: 2000, label: '2000x128' },
      ]

      const timings: {
        label: string
        inlineMs: number
        composedJsMs: number
        composedWasmMs: number
        bestIdx: number
      }[] = []

      for (const cfg of configs) {
        const total = cfg.count * cfg.dim

        // Allocate corpus/query in EACH variant's wasm memory so the
        // wasmBuffer fast path is hit on all three runs.
        const inlineCorpus = inline.wasmBuffer(Float32Array, total)
        const inlineQuery = inline.wasmBuffer(Float32Array, cfg.dim)
        const composedJsCorpus = composedJs.wasmBuffer(Float32Array, total)
        const composedJsQuery = composedJs.wasmBuffer(Float32Array, cfg.dim)
        const composedWasmCorpus = composedWasm.wasmBuffer(Float32Array, total)
        const composedWasmQuery = composedWasm.wasmBuffer(Float32Array, cfg.dim)

        // Seed all three with the same values
        for (let i = 0; i < total; i++) {
          const v = Math.random() * 2 - 1
          inlineCorpus[i] = v
          composedJsCorpus[i] = v
          composedWasmCorpus[i] = v
        }
        for (let i = 0; i < cfg.dim; i++) {
          const v = Math.random() * 2 - 1
          inlineQuery[i] = v
          composedJsQuery[i] = v
          composedWasmQuery[i] = v
        }

        // Warm up all three (JIT)
        const warmCount = Math.min(100, cfg.count)
        for (let w = 0; w < 3; w++) {
          inline.search(inlineCorpus, inlineQuery, warmCount, cfg.dim)
          composedJs.search(
            composedJsCorpus,
            composedJsQuery,
            warmCount,
            cfg.dim
          )
          composedWasm.search(
            composedWasmCorpus,
            composedWasmQuery,
            warmCount,
            cfg.dim
          )
        }

        // Time each variant over REPS calls, not one.
        //
        // Each `search()` here takes a fraction of a millisecond, and this used to
        // time a SINGLE call — then assert 2× and 3× ratios on that one sample.
        // At ~0.45ms per measurement that is timer noise, not a benchmark: the
        // test failed intermittently on ratios that swung from 0.45× to 27×
        // between runs, on identical code. Widening the threshold (the previous
        // response to the flakiness) treats the symptom; the measurement itself
        // was unsound. Summing REPS calls puts each timing in the tens of
        // milliseconds, where the ratios are stable and actually mean something.
        const REPS = 50
        const timeSearch = (
          fn: (...a: any[]) => number,
          corpus: Float32Array,
          query: Float32Array
        ): { ms: number; idx: number } => {
          const start = performance.now()
          let idx = -1
          for (let r = 0; r < REPS; r++) {
            idx = fn(corpus, query, cfg.count, cfg.dim)
          }
          return { ms: performance.now() - start, idx }
        }

        const inlineRun = timeSearch(inline.search, inlineCorpus, inlineQuery)
        const composedJsRun = timeSearch(
          composedJs.search,
          composedJsCorpus,
          composedJsQuery
        )
        const composedWasmRun = timeSearch(
          composedWasm.search,
          composedWasmCorpus,
          composedWasmQuery
        )

        const inlineMs = inlineRun.ms
        const composedJsMs = composedJsRun.ms
        const composedWasmMs = composedWasmRun.ms
        const inlineIdx = inlineRun.idx
        const composedJsIdx = composedJsRun.idx
        const composedWasmIdx = composedWasmRun.idx

        // All three implementations must agree on best index
        expect(composedJsIdx).toBe(inlineIdx)
        expect(composedWasmIdx).toBe(inlineIdx)

        timings.push({
          label: cfg.label,
          inlineMs,
          composedJsMs,
          composedWasmMs,
          bestIdx: inlineIdx,
        })
      }

      // Report (visible in test output)
      console.log(
        '\n=== Vector-search: inline / composed-JS-loop / composed-WASM-loop ==='
      )
      console.log(
        '  config       |   inline | composed-JS |  ratio | composed-WASM |  ratio'
      )
      console.log(
        '  -------------|----------|-------------|--------|---------------|-------'
      )
      for (const t of timings) {
        const jsRatio = t.composedJsMs / t.inlineMs
        const wasmRatio = t.composedWasmMs / t.inlineMs
        console.log(
          `  ${t.label.padEnd(12)} | ${t.inlineMs
            .toFixed(2)
            .padStart(8)} | ${t.composedJsMs
            .toFixed(2)
            .padStart(11)} | ${jsRatio
            .toFixed(2)
            .padStart(6)}x | ${t.composedWasmMs
            .toFixed(2)
            .padStart(13)} | ${wasmRatio.toFixed(2).padStart(5)}x`
        )
      }

      // The composed-WASM path should match inline within a small factor.
      // Engine variance means hard thresholds are flaky; we use a wide
      // 3× ceiling that catches catastrophic regressions while tolerating
      // JIT-warmup noise and CI-environment variability. Observed ratios
      // are typically 1.0–1.3× — i.e., parity with inline.
      for (const t of timings) {
        const wasmRatio = t.composedWasmMs / t.inlineMs
        expect(wasmRatio).toBeLessThan(3.0)
      }

      // The composed-JS path is expected to be slower than composed-WASM
      // (boundary-crossing tax). This is the "before/after" demonstration:
      // composed-WASM must be at least 2× faster than composed-JS for the
      // wasm-to-wasm optimization to be considered "working." In practice
      // the gap is much larger (5–10×).
      for (const t of timings) {
        expect(t.composedJsMs).toBeGreaterThan(t.composedWasmMs * 2)
      }
    } finally {
      globalThis.__tjs = savedTjs
      for (const v of ['inline', 'composedJs', 'composedWasm']) {
        delete (globalThis as any)[`__${v}_search`]
        delete (globalThis as any)[`__${v}_wasmBuffer`]
      }
      delete (globalThis as any).wasmBuffer
      for (const key of Object.keys(globalThis)) {
        if (key.startsWith('__tjs_wasm_')) {
          delete (globalThis as any)[key]
        }
      }
    }
  })
})
