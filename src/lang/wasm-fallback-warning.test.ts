/**
 * A `wasm{}` block that can't compile is a HARD ERROR (2026-10-07).
 *
 * History: it used to fall back to its `fallback{}` (JS) silently (the failure was only on
 * `result.wasmCompiled`, which consumers don't inspect), so WASM looked like it "worked" while
 * the JS ran. The first fix mirrored the failure into `result.warnings` (tosijs-ui UI-#1). A
 * warning still ships JavaScript where the author asked for WASM, and both of this file's own
 * fixtures turned out to be wrong without anyone noticing: `SUPPORTED` took a plain array, so
 * its "compiled" block trapped on the first call. `fallback {}` is for a RUNTIME that cannot run
 * WASM (wasm-fallback.test.ts), not for code the compiler cannot compile.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const UNSUPPORTED = `function fill(out: [0.0], w: 0, h: 0) {
  wasm {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) { out[y * w + x] = 1.0 }
    }
  } fallback {
    for (let i = 0; i < w * h; i++) out[i] = 0
  }
  return out
}`

const SUPPORTED = `function scale(! arr: Float32Array, len: 0, factor: 0.0) {
  wasm {
    for (let i = 0; i < len; i += 4) {
      let off = i * 4
      f32x4_store(arr, off, f32x4_mul(f32x4_load(arr, off), f32x4_splat(factor)))
    }
  } fallback {
    for (let i = 0; i < len; i++) arr[i] *= factor
  }
  return arr
}`

describe('a wasm{} block that cannot compile stops the build', () => {
  it('refuses it, with the reason', () => {
    expect(() => tjs(UNSUPPORTED)).toThrow(
      /did not compile: out is not a typed array parameter/
    )
  })

  it('compiles a supported block, with no wasm warning', () => {
    const r = tjs(SUPPORTED)
    expect(r.wasmCompiled?.[0]?.success).toBe(true)
    expect(r.warnings?.some((w) => /wasm/.test(w)) ?? false).toBe(false)
  })
})
