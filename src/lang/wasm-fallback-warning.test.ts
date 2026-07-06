/**
 * A `wasm{}` block that can't compile falls back to its `fallback{}` (JS) — which
 * used to happen SILENTLY (the failure was only on `result.wasmCompiled`, which
 * consumers don't inspect), so WASM looked like it "worked" when it was running
 * the JS fallback. Now the failure is also mirrored into `result.warnings`.
 * (tosijs-ui feedback UI-#1.)
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

const SUPPORTED = `function scale(arr: [0.0], len: 0, factor: 0.0) {
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

describe('silent wasm{} fallback is now surfaced as a warning', () => {
  it('warns (with the reason) when a block cannot compile', () => {
    const r = tjs(UNSUPPORTED)
    expect(r.wasmCompiled?.[0]?.success).toBe(false) // signal already existed…
    const w = r.warnings?.find((w) =>
      /wasm\{\} block .* did not compile/.test(w)
    )
    expect(w).toBeTruthy() // …now it's in warnings too
    expect(w).toMatch(/fallback/)
  })

  it('does not warn when the block compiles to WASM', () => {
    const r = tjs(SUPPORTED)
    expect(r.wasmCompiled?.[0]?.success).toBe(true)
    expect(r.warnings?.some((w) => /wasm\{\}/.test(w)) ?? false).toBe(false)
  })
})
