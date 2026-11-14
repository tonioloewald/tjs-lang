/**
 * Two modules may each declare a `wasm function` of the same name (#4109).
 *
 * Each bound `globalThis.__tjs_wasm_<name>` with no per-module part, so loading the second module
 * rebound the first module's function to the second's body: module A's `f(2)` returned 3, then
 * 200 once module B loaded. Inline `wasm {}` blocks were already salted with the module's tag;
 * named functions now are too.
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { tjs } from './index'

const g = globalThis as any

const load = async (src: string) => {
  const f = new Function(
    tjs(src).code.replace(/^export /gm, '') + '\nreturn f'
  )()
  await g.__tjs_wasm_ready?.()
  return f
}

describe('wasm function names are per module', () => {
  afterEach(() => {
    delete g.__tjs_wasm_pending
    delete g.__tjs_wasm_ready
  })

  it("a second module's f does not replace the first's", async () => {
    const a = await load(
      'export wasm function f(x: f64): f64 { return x + 1.0 }'
    )
    expect(a(2)).toBe(3)
    const b = await load(
      'export wasm function f(x: f64): f64 { return x * 100.0 }'
    )
    expect(b(2)).toBe(200)
    expect(a(2)).toBe(3) // was 200
  })

  it('the id is still deterministic for the same source', () => {
    const src = 'wasm function f(x: f64): f64 { return x }'
    const id = (s: string) => tjs(s).wasmCompiled![0].id
    expect(id(src)).toBe(id(src))
    expect(id(src)).toMatch(/^__tjs_wasm_[0-9a-z]+_f$/)
  })
})
