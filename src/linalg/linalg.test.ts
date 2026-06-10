/**
 * Tests for tjs-lang/linalg (v1 MVP)
 *
 * Verifies the two functions that unlock the canonical vector-search
 * demo: `dot` (f32x4 dot product) and `norm_sq` (sum of squares).
 *
 * Coverage:
 *   - The library file transpiles cleanly to a self-contained .js
 *   - Correctness against a JS scalar reference
 *   - Phase 3 composition: consumer imports linalg via moduleLoader,
 *     calls compose correctly (no JS↔wasm boundary inside the library
 *     module — `dot` is local to the consumer's wasm module)
 *   - Boundary form: same library imported via dynamic ESM, same results
 */

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFileSync, unlinkSync } from 'node:fs'

const LINALG_PATH = join(import.meta.dir, 'index.tjs')
const LINALG_SOURCE = readFileSync(LINALG_PATH, 'utf8')

/** JS scalar reference for cross-checking wasm results */
function dotJS(a: Float32Array, b: Float32Array, n: number): number {
  let s = 0
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

function normSqJS(a: Float32Array, n: number): number {
  let s = 0
  for (let i = 0; i < n; i++) s += a[i] * a[i]
  return s
}

async function dynamicImportLibrary(transpiled: string): Promise<any> {
  const path = join(
    tmpdir(),
    `linalg-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mjs`
  )
  writeFileSync(path, transpiled)
  try {
    const mod = await import(path)
    // Wait for the async wasm bootstrap inside the module to finish
    await new Promise((r) => setTimeout(r, 100))
    return mod
  } finally {
    try {
      unlinkSync(path)
    } catch {
      /* ignore */
    }
  }
}

describe('tjs-lang/linalg v1', () => {
  it('source file transpiles cleanly: all wasm functions compile', async () => {
    const { tjs } = await import('../lang/index')
    const result = tjs(LINALG_SOURCE, { runTests: false })

    expect(result.wasmCompiled).toBeDefined()
    // v1 surface: dot, norm_sq, dot_at, norm_sq_at
    expect(result.wasmCompiled).toHaveLength(4)
    expect(result.wasmCompiled!.every((b) => b.success)).toBe(true)

    const ids = result.wasmCompiled!.map((b) => b.id).sort()
    expect(ids).toEqual([
      '__tjs_wasm_dot',
      '__tjs_wasm_dot_at',
      '__tjs_wasm_norm_sq',
      '__tjs_wasm_norm_sq_at',
    ])

    // One consolidated WebAssembly.Module per file
    const compileCalls = (result.code.match(/WebAssembly\.compile\(/g) || [])
      .length
    expect(compileCalls).toBe(1)
  })

  it('boundary form: dynamic import gives a working library', async () => {
    const { tjs } = await import('../lang/index')
    const result = tjs(LINALG_SOURCE, { runTests: false })
    const lib = await dynamicImportLibrary(result.code)

    expect(typeof lib.dot).toBe('function')
    expect(typeof lib.norm_sq).toBe('function')

    // Use wasmBuffer for zero-copy memory sharing with wasm
    const wasmBuffer = (globalThis as any).wasmBuffer
    expect(typeof wasmBuffer).toBe('function')

    const a = wasmBuffer(Float32Array, 8)
    const b = wasmBuffer(Float32Array, 8)
    for (let i = 0; i < 8; i++) {
      a[i] = i + 1 // [1,2,3,4,5,6,7,8]
      b[i] = i + 1 // [1,2,3,4,5,6,7,8]
    }

    // dot([1..8], [1..8]) = 1 + 4 + 9 + ... + 64 = 204
    expect(lib.dot(a, b, 8)).toBeCloseTo(204, 4)
    // norm_sq([1..8]) = same as dot([1..8], [1..8]) = 204
    expect(lib.norm_sq(a, 8)).toBeCloseTo(204, 4)
  })

  it('correctness against JS scalar reference (random vectors)', async () => {
    const { tjs } = await import('../lang/index')
    const result = tjs(LINALG_SOURCE, { runTests: false })
    const lib = await dynamicImportLibrary(result.code)

    const wasmBuffer = (globalThis as any).wasmBuffer

    // Several sizes (all multiples of 4 — current SIMD precondition)
    for (const n of [4, 16, 64, 128, 256]) {
      const a = wasmBuffer(Float32Array, n)
      const b = wasmBuffer(Float32Array, n)
      for (let i = 0; i < n; i++) {
        a[i] = Math.random() * 2 - 1
        b[i] = Math.random() * 2 - 1
      }

      // Copy to regular Float32Array for JS reference (otherwise SAB issues)
      const aRef = Float32Array.from(a)
      const bRef = Float32Array.from(b)

      const wasmDot = lib.dot(a, b, n)
      const jsDot = dotJS(aRef, bRef, n)
      // f32 precision: a few decimal digits of agreement is enough
      expect(wasmDot).toBeCloseTo(jsDot, 3)

      const wasmNorm = lib.norm_sq(a, n)
      const jsNorm = normSqJS(aRef, n)
      expect(wasmNorm).toBeCloseTo(jsNorm, 3)
    }
  })

  it('Phase 3 composition: consumer importing linalg works end-to-end', async () => {
    // The canonical Phase 5 + Phase 3 + Phase 0.5 integration test:
    // a consumer imports `dot` from linalg via the moduleLoader, the
    // function is composed into the consumer's wasm module, and calling
    // it from JS produces correct results.
    const { tjs } = await import('../lang/index')
    const { createRuntime } = await import('../lang/runtime')
    const { ModuleLoader, inMemoryFileSystem } = await import(
      '../lang/module-loader'
    )

    const loader = new ModuleLoader({
      fs: inMemoryFileSystem({ '/proj/linalg.tjs': LINALG_SOURCE }),
      baseDir: '/proj',
    })

    const consumerSource = `
import { dot, norm_sq } from './linalg.tjs'

function cosine(a, b, n) {
  const d = dot(a, b, n)
  const ma = norm_sq(a, n)
  const mb = norm_sq(b, n)
  if (ma <= 0 || mb <= 0) return 0
  return d / Math.sqrt(ma * mb)
}
`
    const result = tjs(consumerSource, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })

    // The consumer's emitted module contains both linalg functions as
    // local exports (Phase 3 acceptance criterion: composed-not-imported).
    expect(result.wasmCompiled).toHaveLength(2)
    const ids = result.wasmCompiled!.map((b) => b.id).sort()
    expect(ids).toEqual(['__tjs_wasm_dot', '__tjs_wasm_norm_sq'])
    const compileCalls = (result.code.match(/WebAssembly\.compile\(/g) || [])
      .length
    expect(compileCalls).toBe(1)

    // Run the consumer and verify the cosine function works correctly
    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${result.code}\n` +
          `globalThis.__test_cosine = cosine;\n` +
          `})();`
      )(globalThis.__tjs)
      await new Promise((r) => setTimeout(r, 100))

      const wasmBuffer = (globalThis as any).wasmBuffer
      const a = wasmBuffer(Float32Array, 8)
      const b = wasmBuffer(Float32Array, 8)
      for (let i = 0; i < 8; i++) {
        a[i] = i + 1
        b[i] = i + 1
      }
      // cosine(a, a) = 1 (identical vectors)
      const sim = (globalThis as any).__test_cosine(a, b, 8)
      expect(sim).toBeCloseTo(1, 4)

      // Orthogonal vectors → cosine 0
      const ox = wasmBuffer(Float32Array, 4)
      const oy = wasmBuffer(Float32Array, 4)
      ox[0] = 1
      ox[1] = 0
      ox[2] = 0
      ox[3] = 0
      oy[0] = 0
      oy[1] = 1
      oy[2] = 0
      oy[3] = 0
      const ortho = (globalThis as any).__test_cosine(ox, oy, 4)
      expect(ortho).toBeCloseTo(0, 4)
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).__test_cosine
      delete (globalThis as any).wasmBuffer
    }
  })

  it('boundary and composed forms return identical results', async () => {
    // Same linalg source consumed two ways — verifies the
    // "same source, two distribution forms" claim from the plan
    const { tjs } = await import('../lang/index')
    const { createRuntime } = await import('../lang/runtime')
    const { ModuleLoader, inMemoryFileSystem } = await import(
      '../lang/module-loader'
    )

    // Boundary form
    const result = tjs(LINALG_SOURCE, { runTests: false })
    const lib = await dynamicImportLibrary(result.code)
    const wasmBuffer = (globalThis as any).wasmBuffer
    const a = wasmBuffer(Float32Array, 16)
    const b = wasmBuffer(Float32Array, 16)
    for (let i = 0; i < 16; i++) {
      a[i] = (i * 0.7 + 0.3) % 1.0
      b[i] = (i * 1.3 + 0.7) % 1.0
    }
    const boundaryDot = lib.dot(a, b, 16)
    const boundaryNormA = lib.norm_sq(a, 16)
    const boundaryNormB = lib.norm_sq(b, 16)

    // Capture values BEFORE the composed run replaces wasmBuffer in globalThis
    const aValues = Array.from(a)
    const bValues = Array.from(b)

    // Composed form (Phase 3 path)
    const loader = new ModuleLoader({
      fs: inMemoryFileSystem({ '/proj/linalg.tjs': LINALG_SOURCE }),
      baseDir: '/proj',
    })
    const consumerSource = `
import { dot, norm_sq } from './linalg.tjs'
`
    const consumerResult = tjs(consumerSource, {
      moduleLoader: loader,
      filename: '/proj/app.tjs',
      runTests: false,
    })

    const savedTjs = globalThis.__tjs
    try {
      globalThis.__tjs = createRuntime()
      await new Function(
        '__tjs',
        `return (async () => { ${consumerResult.code}\n` +
          `globalThis.__test_dot = dot;\n` +
          `globalThis.__test_norm_sq = norm_sq;\n` +
          `})();`
      )(globalThis.__tjs)
      await new Promise((r) => setTimeout(r, 100))

      // Allocate from the new module's wasmBuffer (composed module
      // sets up its own __wasmMem)
      const composedBuffer = (globalThis as any).wasmBuffer
      const a2 = composedBuffer(Float32Array, 16)
      const b2 = composedBuffer(Float32Array, 16)
      for (let i = 0; i < 16; i++) {
        a2[i] = aValues[i]
        b2[i] = bValues[i]
      }
      const composedDot = (globalThis as any).__test_dot(a2, b2, 16)
      const composedNormA = (globalThis as any).__test_norm_sq(a2, 16)
      const composedNormB = (globalThis as any).__test_norm_sq(b2, 16)

      // Identical results from both distribution forms
      expect(composedDot).toBeCloseTo(boundaryDot, 4)
      expect(composedNormA).toBeCloseTo(boundaryNormA, 4)
      expect(composedNormB).toBeCloseTo(boundaryNormB, 4)
    } finally {
      globalThis.__tjs = savedTjs
      delete (globalThis as any).__test_dot
      delete (globalThis as any).__test_norm_sq
      delete (globalThis as any).wasmBuffer
    }
  })
})
