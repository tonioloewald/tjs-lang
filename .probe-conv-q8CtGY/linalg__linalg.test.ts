/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync, realpathSync } from 'node:fs'

import { join } from 'node:path'

import { tmpdir } from 'node:os'

import { pathToFileURL } from 'node:url'

import { writeFileSync, unlinkSync } from 'node:fs'

const LINALG_PATH = join('/Users/tonioloewald/tjs-lang/src/linalg', 'index.tjs')
export {}

const LINALG_SOURCE = readFileSync(LINALG_PATH, 'utf8')

/* line 27 */
function dotJS(a, b, n) {
  let s = 0
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}
dotJS.__tjs = {
  params: {
    a: {
      type: {
        kind: 'any',
      },
      required: true,
      default: null,
    },
    b: {
      type: {
        kind: 'any',
      },
      required: true,
      default: null,
    },
    n: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'number',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:27',
}

/* line 33 */
function normSqJS(a, n) {
  let s = 0
  for (let i = 0; i < n; i++) s += a[i] * a[i]
  return s
}
normSqJS.__tjs = {
  params: {
    a: {
      type: {
        kind: 'any',
      },
      required: true,
      default: null,
    },
    n: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'number',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:33',
}

/* line 39 */
/* TODO: TS types degraded — return: Promise<any> */
async function dynamicImportLibrary(transpiled) {
  const path = join(
    tmpdir(),
    `linalg-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mjs`
  )
  writeFileSync(path, transpiled)

  const url = pathToFileURL(realpathSync(path)).href
  try {
    const mod = await import(url)

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
dynamicImportLibrary.__tjs = {
  params: {
    transpiled: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:38',
}

describe('tjs-lang/linalg v1', () => {
  it('source file transpiles cleanly: all wasm functions compile', async () => {
    const { tjs } = await import('/Users/tonioloewald/tjs-lang/src/lang/index')
    const result = tjs(LINALG_SOURCE, { runTests: false })
    expect(result.wasmCompiled).toBeDefined()

    expect(result.wasmCompiled).toHaveLength(4)
    expect(result.wasmCompiled.every((b) => b.success)).toBe(true)
    const ids = result.wasmCompiled.map((b) => b.id).sort()
    expect(ids).toEqual([
      '__tjs_wasm_dot',
      '__tjs_wasm_dot_at',
      '__tjs_wasm_norm_sq',
      '__tjs_wasm_norm_sq_at',
    ])

    const modules = (result.code.match(/const __wasmModuleB64=/g) || []).length
    expect(modules).toBe(1)
  })
  it('boundary form: dynamic import gives a working library', async () => {
    const { tjs } = await import('/Users/tonioloewald/tjs-lang/src/lang/index')
    const result = tjs(LINALG_SOURCE, { runTests: false })
    const lib = await dynamicImportLibrary(result.code)
    expect(typeof lib.dot).toBe('function')
    expect(typeof lib.norm_sq).toBe('function')

    const wasmBuffer = globalThis.wasmBuffer
    expect(typeof wasmBuffer).toBe('function')
    const a = wasmBuffer(Float32Array, 8)
    const b = wasmBuffer(Float32Array, 8)
    for (let i = 0; i < 8; i++) {
      a[i] = i + 1
      b[i] = i + 1
    }

    expect(lib.dot(a, b, 8)).toBeCloseTo(204, 4)

    expect(lib.norm_sq(a, 8)).toBeCloseTo(204, 4)
  })
  it('correctness against JS scalar reference (random vectors)', async () => {
    const { tjs } = await import('/Users/tonioloewald/tjs-lang/src/lang/index')
    const result = tjs(LINALG_SOURCE, { runTests: false })
    const lib = await dynamicImportLibrary(result.code)
    const wasmBuffer = globalThis.wasmBuffer

    for (const n of [4, 16, 64, 128, 256]) {
      const a = wasmBuffer(Float32Array, n)
      const b = wasmBuffer(Float32Array, n)
      for (let i = 0; i < n; i++) {
        a[i] = Math.random() * 2 - 1
        b[i] = Math.random() * 2 - 1
      }

      const aRef = Float32Array.from(a)
      const bRef = Float32Array.from(b)
      const wasmDot = lib.dot(a, b, n)
      const jsDot = dotJS(aRef, bRef, n)

      expect(wasmDot).toBeCloseTo(jsDot, 3)
      const wasmNorm = lib.norm_sq(a, n)
      const jsNorm = normSqJS(aRef, n)
      expect(wasmNorm).toBeCloseTo(jsNorm, 3)
    }
  })
  it('Phase 3 composition: consumer importing linalg works end-to-end', async () => {
    const { tjs } = await import('/Users/tonioloewald/tjs-lang/src/lang/index')
    const { createRuntime } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/runtime'
    )
    const { ModuleLoader, inMemoryFileSystem } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/module-loader'
    )
    const loader = new ModuleLoader({
      fs: inMemoryFileSystem({ '/proj/linalg.tjs': LINALG_SOURCE }),
      baseDir: '/proj',
    })
    const consumerSource = `
import { dot, norm_sq } from '/Users/tonioloewald/tjs-lang/src/linalg/linalg.tjs'

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

    expect(result.wasmCompiled).toHaveLength(2)
    const ids = result.wasmCompiled.map((b) => b.id).sort()
    expect(ids).toEqual(['__tjs_wasm_dot', '__tjs_wasm_norm_sq'])
    const modules = (result.code.match(/const __wasmModuleB64=/g) || []).length
    expect(modules).toBe(1)

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
      const wasmBuffer = globalThis.wasmBuffer
      const a = wasmBuffer(Float32Array, 8)
      const b = wasmBuffer(Float32Array, 8)
      for (let i = 0; i < 8; i++) {
        a[i] = i + 1
        b[i] = i + 1
      }

      const sim = globalThis.__test_cosine(a, b, 8)
      expect(sim).toBeCloseTo(1, 4)

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
      const ortho = globalThis.__test_cosine(ox, oy, 4)
      expect(ortho).toBeCloseTo(0, 4)
    } finally {
      globalThis.__tjs = savedTjs
      delete globalThis.__test_cosine
      delete globalThis.wasmBuffer
    }
  })
  it('boundary and composed forms return identical results', async () => {
    const { tjs } = await import('/Users/tonioloewald/tjs-lang/src/lang/index')
    const { createRuntime } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/runtime'
    )
    const { ModuleLoader, inMemoryFileSystem } = await import(
      '/Users/tonioloewald/tjs-lang/src/lang/module-loader'
    )

    const result = tjs(LINALG_SOURCE, { runTests: false })
    const lib = await dynamicImportLibrary(result.code)
    const wasmBuffer = globalThis.wasmBuffer
    const a = wasmBuffer(Float32Array, 16)
    const b = wasmBuffer(Float32Array, 16)
    for (let i = 0; i < 16; i++) {
      a[i] = (i * 0.7 + 0.3) % 1.0
      b[i] = (i * 1.3 + 0.7) % 1.0
    }
    const boundaryDot = lib.dot(a, b, 16)
    const boundaryNormA = lib.norm_sq(a, 16)
    const boundaryNormB = lib.norm_sq(b, 16)

    const aValues = Array.from(a)
    const bValues = Array.from(b)

    const loader = new ModuleLoader({
      fs: inMemoryFileSystem({ '/proj/linalg.tjs': LINALG_SOURCE }),
      baseDir: '/proj',
    })
    const consumerSource = `
import { dot, norm_sq } from '/Users/tonioloewald/tjs-lang/src/linalg/linalg.tjs'
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

      const composedBuffer = globalThis.wasmBuffer
      const a2 = composedBuffer(Float32Array, 16)
      const b2 = composedBuffer(Float32Array, 16)
      for (let i = 0; i < 16; i++) {
        a2[i] = aValues[i]
        b2[i] = bValues[i]
      }
      const composedDot = globalThis.__test_dot(a2, b2, 16)
      const composedNormA = globalThis.__test_norm_sq(a2, 16)
      const composedNormB = globalThis.__test_norm_sq(b2, 16)

      expect(composedDot).toBeCloseTo(boundaryDot, 4)
      expect(composedNormA).toBeCloseTo(boundaryNormA, 4)
      expect(composedNormB).toBeCloseTo(boundaryNormB, 4)
    } finally {
      globalThis.__tjs = savedTjs
      delete globalThis.__test_dot
      delete globalThis.__test_norm_sq
      delete globalThis.wasmBuffer
    }
  })
})
