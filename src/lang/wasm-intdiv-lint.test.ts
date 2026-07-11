/**
 * Lint the i32/i32 integer-division footgun inside `wasm{}`: `/` with two integer
 * operands truncates, and coercion to f64 only happens at the *next* operator, so
 * `x / w - 0.5` is silently `0 - 0.5` for all `x < w` — it silently broke a real
 * Mandelbrot kernel (tosijs-ui UI-#4). Now it's surfaced in `result.warnings`.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const intDivWarning = (r: { warnings?: string[] }) =>
  r.warnings?.find((w) => /integer division/.test(w))

describe('i32/i32 division lint', () => {
  it('warns when both operands are i32 (loop vars)', () => {
    const r = tjs(`function f(n: 0) {
      wasm {
        for (let y = 1; y < n; y += 1) {
          for (let x = 1; x < n; x += 1) { let r = x / y }
        }
      } fallback { }
      return n
    }`)
    expect(r.wasmCompiled?.[0]?.success).toBe(true) // block compiled…
    expect(intDivWarning(r)).toBeTruthy() // …and the footgun was flagged
    expect(intDivWarning(r)).toMatch(/\+ 0\.0/) // suggests the fix
  })

  it('warns once per block, not per occurrence', () => {
    const r = tjs(`function f(n: 0) {
      wasm {
        for (let i = 1; i < n; i += 1) { let a = i / n; let b = n / i; let c = i / i }
      } fallback { }
      return n
    }`)
    expect(r.warnings?.filter((w) => /integer division/.test(w)).length).toBe(1)
  })

  it('does NOT warn on float division', () => {
    const r = tjs(`function g(a: 0.0, b: 0.0) {
      wasm { let r = a / b } fallback { }
      return a
    }`)
    expect(intDivWarning(r)).toBeUndefined()
  })
})
