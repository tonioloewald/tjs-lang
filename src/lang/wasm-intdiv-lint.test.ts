/**
 * `/` inside `wasm{}` is JavaScript's division, so the old integer-division footgun is gone.
 *
 * `/` with two integer operands used to compile to `i32.div_s`, which TRUNCATES, and the
 * coercion to f64 only happened at the next operator — so `x / w - 0.5` was silently
 * `0 - 0.5` for all `x < w`. It broke a real Mandelbrot kernel (tosijs-ui UI-#4). The first
 * answer was a warning (this file used to pin it). A warning reports a divergence between the
 * WASM path and the fallback; it does not remove one. Two integer operands now divide as f64,
 * so there is nothing left to warn about.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const g = globalThis as any
const intDivWarning = (r: { warnings?: string[] }) =>
  r.warnings?.find((w) => /integer division/.test(w))

describe('integer operands divide as JavaScript does', () => {
  it('the Mandelbrot shape: `x / w - 0.5` is not `0 - 0.5`', async () => {
    const SRC = `function centre(! w: 0):! 0.0 {
  return wasm {
    let s = 0.0
    for (let x = 0; x < w; x++) { s = s + (x / w - 0.5) }
    return s
  } fallback {
    let s = 0.0
    for (let x = 0; x < w; x++) s += x / w - 0.5
    return s
  }
}`
    const r = tjs(SRC, { runTests: false })
    expect(r.wasmCompiled?.[0]?.success).toBe(true)
    expect(intDivWarning(r)).toBeUndefined() // nothing to warn about any more
    const centre = new Function(`${r.code}\nreturn centre`)()
    await g.__tjs_wasm_ready?.()
    const wasm = centre(4)
    g.__tjs_wasm_enabled = false
    try {
      // 4 columns: -0.5, -0.25, 0, 0.25 → -0.5. Truncating gave -2 (every term -0.5).
      expect([wasm, centre(4)]).toEqual([-0.5, -0.5])
    } finally {
      delete g.__tjs_wasm_enabled
    }
  })

  it('float division compiles without a warning, as before', () => {
    const r = tjs(`function g(a: 0.0, b: 0.0) {
      wasm { let r = a / b } fallback { }
      return a
    }`)
    expect(intDivWarning(r)).toBeUndefined()
  })
})
