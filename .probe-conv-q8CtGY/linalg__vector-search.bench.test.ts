/**
 * WASM: __tjs_wasm_composedWasmSearch (export: compute_0)
 * (failed: Unsupported function call: Identifier; Unsupported function call: Identifier; Unsupported function call: Identifier)
 */
globalThis.__tjs_wasm_pending ??= []
globalThis.__tjs_wasm_ready ??= () => Promise.all(globalThis.__tjs_wasm_pending)
;(() => {
  const __rec = (e) => {
    try {
      globalThis.__tjs?.record?.(e)
    } catch {}
  }
  const __wasmExports = []
  const __wasmModuleB64 =
    'AGFzbQEAAAABCQFgBH9/f38BfAMCAQAHDQEJY29tcHV0ZV8wAAAKDQELAEQAAAAAAAAAAAs='
  const __b64ToBytes = (s) => {
    const b = atob(s),
      a = new Uint8Array(b.length)
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i)
    return a
  }
  const __parseType = (c) => {
    const m = c.match(/^(\w+)\s*:\s*(\w+)$/)
    if (!m) return { n: c, t: 'f64', a: false }
    const [, n, ts] = m
    const at = {
      Float32Array: 'f32',
      Float64Array: 'f64',
      Int32Array: 'i32',
      Uint8Array: 'i32',
    }
    if (at[ts]) return { n, t: 'i32', a: true, at: ts }
    return { n, t: 'f64', a: false }
  }

  const __bind = (__wasmInst) => {
    for (const { id, n, c, m } of __wasmExports) {
      const compute = __wasmInst.exports[n]
      const params = c.map(__parseType)
      const hasArrays = params.some((p) => p.a)
      if (!hasArrays) {
        globalThis[id] = compute
        continue
      }
      let __copied = false
      globalThis[id] = function (...args) {
        const mv = new Uint8Array(__wasmMem.buffer)
        let off = __woff
        const ptrs = []
        for (let i = 0; i < params.length; i++) {
          const p = params[i],
            a = args[i]
          if (p.a && a?.buffer) {
            if (a.buffer === __wasmMem.buffer) {
              ptrs.push(a.byteOffset)
            } else {
              if (!__copied) {
                __copied = true
                __rec({
                  source: 'wasm',
                  severity: 'notice',
                  message:
                    "'" +
                    id +
                    "' was passed a typed array outside wasm memory — copying in and out on every call. This can be SLOWER than plain JS. Allocate it with wasmBuffer() to pass it zero-copy.",
                  data: { fn: id, param: p.n, bytes: a.byteLength },
                })
              }
              const ab = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
              off = (off + 15) & ~15
              mv.set(ab, off)
              ptrs.push(off)
              off += ab.length
            }
          } else ptrs.push(a)
        }
        const r = compute(...ptrs)
        off = __woff
        for (let i = 0; i < params.length; i++) {
          const p = params[i],
            a = args[i]
          if (p.a && a?.buffer) {
            if (a.buffer === __wasmMem.buffer) continue
            const ab = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
            off = (off + 15) & ~15
            ab.set(mv.slice(off, off + ab.length))
            off += ab.length
          }
        }
        return r
      }
    }
  }
  const __fail = (e) => {
    try {
      globalThis.__tjs?.record?.({
        source: 'wasm',
        severity: 'warning',
        message:
          'wasm module failed to instantiate — every wasm{} block in this file is running its JS fallback: ' +
          ((e && e.message) || e),
        data: { error: String(e) },
      })
    } catch {}
  }
  try {
    __bind(
      new WebAssembly.Instance(
        new WebAssembly.Module(__b64ToBytes(__wasmModuleB64)),
        {}
      )
    )
    globalThis.__tjs_wasm_pending.push(Promise.resolve())
  } catch (__syncErr) {
    // The async retry needs its OWN guard — it can throw SYNCHRONOUSLY.
    //
    // `WebAssembly.instantiate` normally returns a promise and rejects, so a `.catch` was
    // assumed sufficient. Under memory pressure SpiderMonkey instead throws
    // `no WebAssembly compiler available` synchronously, and that throw was inside the catch
    // block with nothing around it — so it escaped and took down the whole module, in a file
    // whose `wasm{} fallback{}` exists precisely so the program does not need WebAssembly.
    //
    // `fallback` covered "this module failed to validate" but not "this engine has no wasm
    // compiler right now", which is the broader of the two and the one an author cannot code
    // around: intermittent, engine-resource-dependent, ~1 run in 6 on a loaded Firefox.
    // Reported from tosijs-ui's Playwright lane (#36).
    try {
      globalThis.__tjs_wasm_pending.push(
        WebAssembly.instantiate(__b64ToBytes(__wasmModuleB64), {})
          .then((r) => __bind(r.instance))
          .catch(__fail)
      )
    } catch (__asyncErr) {
      __fail(__asyncErr)
      globalThis.__tjs_wasm_pending.push(Promise.resolve())
    }
  }
})()
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync } from 'node:fs'

import { join } from 'node:path'

const LINALG_SOURCE = readFileSync(
  join('/Users/tonioloewald/tjs-lang/src/linalg', 'index.tjs'),
  'utf8'
)
export {}

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

const COMPOSED_JS_LOOP_SOURCE = `
import { dot, norm_sq } from '/Users/tonioloewald/tjs-lang/src/linalg/linalg.tjs'

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

const COMPOSED_WASM_LOOP_SOURCE = `
import { dot_at, norm_sq_at } from '/Users/tonioloewald/tjs-lang/src/linalg/linalg.tjs'

function composedWasmSearch(corpus, query, count, dim) { return globalThis.__tjs_wasm_composedWasmSearch(corpus, query, count, dim) }
`

/* line 156 */
async function loadVariant(code, fnName, varName) {
  await new Function(
    '__tjs',
    `return (async () => { ${code}\n` +
      `globalThis.__${varName}_search = ${fnName};\n` +
      `globalThis.__${varName}_wasmBuffer = globalThis.wasmBuffer;\n` +
      `})();`
  )(globalThis.__tjs)
  await new Promise((r) => setTimeout(r, 100))
  const search = globalThis[`__${varName}_search`]
  const wasmBuffer = globalThis[`__${varName}_wasmBuffer`]
  if (typeof search !== 'function') {
    throw new Error(`${varName} search function not registered`)
  }
  if (typeof wasmBuffer !== 'function') {
    throw new Error(`${varName} wasmBuffer not available`)
  }
  return { search, wasmBuffer }
}
loadVariant.__tjs = {
  params: {
    code: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    fnName: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    varName: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'object',
      shape: {
        search: {
          kind: 'any',
        },
        wasmBuffer: {
          kind: 'any',
        },
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:156',
}

describe('Canonical demo: vector-search across three forms', () => {
  it('all three forms agree on best index; composed-wasm matches inline perf', async () => {
    const { tjs } = await import('/Users/tonioloewald/tjs-lang/src/lang/index')
    const { createRuntime } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/runtime'
    )
    const { ModuleLoader, inMemoryFileSystem } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/module-loader'
    )

    const inlineResult = tjs(INLINE_SOURCE, { runTests: false })
    expect(inlineResult.wasmCompiled.every((b) => b.success)).toBe(true)
    const loader = new ModuleLoader({
      fs: inMemoryFileSystem({ '/proj/linalg.tjs': LINALG_SOURCE }),
      baseDir: '/proj',
    })
    const composedJsResult = tjs(COMPOSED_JS_LOOP_SOURCE, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })
    expect(composedJsResult.wasmCompiled.every((b) => b.success)).toBe(true)
    const composedWasmResult = tjs(COMPOSED_WASM_LOOP_SOURCE, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })
    expect(composedWasmResult.wasmCompiled.every((b) => b.success)).toBe(true)
    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      const inline = await loadVariant(
        inlineResult.code,
        'inlineSearch',
        'inline'
      )

      globalThis.__tjs = createRuntime()
      const composedJs = await loadVariant(
        composedJsResult.code,
        'composedJsSearch',
        'composedJs'
      )

      globalThis.__tjs = createRuntime()
      const composedWasm = await loadVariant(
        composedWasmResult.code,
        'composedWasmSearch',
        'composedWasm'
      )

      const configs = [
        { dim: 128, count: 500, label: '500x128' },
        { dim: 256, count: 500, label: '500x256' },
        { dim: 128, count: 2000, label: '2000x128' },
      ]
      const timings = []
      for (const cfg of configs) {
        const total = cfg.count * cfg.dim

        const inlineCorpus = inline.wasmBuffer(Float32Array, total)
        const inlineQuery = inline.wasmBuffer(Float32Array, cfg.dim)
        const composedJsCorpus = composedJs.wasmBuffer(Float32Array, total)
        const composedJsQuery = composedJs.wasmBuffer(Float32Array, cfg.dim)
        const composedWasmCorpus = composedWasm.wasmBuffer(Float32Array, total)
        const composedWasmQuery = composedWasm.wasmBuffer(Float32Array, cfg.dim)

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

        const TARGET_MS = 5
        const clampReps = (perCallMs) =>
          Math.max(
            50,
            Math.min(20_000, Math.ceil(TARGET_MS / Math.max(perCallMs, 1e-5)))
          )
        const probe = (fn, c, q, reps) => {
          const t0 = performance.now()
          for (let r = 0; r < reps; r++) fn(c, q, cfg.count, cfg.dim)
          return (performance.now() - t0) / reps
        }

        const fastestCallMs = (reps) =>
          Math.min(
            probe(inline.search, inlineCorpus, inlineQuery, reps),
            probe(
              composedWasm.search,
              composedWasmCorpus,
              composedWasmQuery,
              reps
            )
          )
        const REPS = clampReps(fastestCallMs(clampReps(fastestCallMs(10))))
        const timeSearch = (fn, corpus, query) => {
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

      for (const t of timings) {
        const wasmRatio = t.composedWasmMs / t.inlineMs
        expect(wasmRatio).toBeLessThan(3.0)
      }

      for (const t of timings) {
        expect(t.composedJsMs).toBeGreaterThan(t.composedWasmMs * 2)
      }
    } finally {
      globalThis.__tjs = savedTjs
      for (const v of ['inline', 'composedJs', 'composedWasm']) {
        delete globalThis[`__${v}_search`]
        delete globalThis[`__${v}_wasmBuffer`]
      }
      delete globalThis.wasmBuffer
      for (const key of Object.keys(globalThis)) {
        if (key.startsWith('__tjs_wasm_')) {
          delete globalThis[key]
        }
      }
    }
  })
})
