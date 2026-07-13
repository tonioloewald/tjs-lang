/**
 * WASM instruments on the flight recorder (#9, #15, #17).
 *
 * Every WASM failure mode in TJS is quiet: a block that won't compile runs the
 * JS fallback, a module that won't instantiate runs the JS fallback, and a
 * typed array from outside wasm memory is copied in and out on EVERY call —
 * which can make "⚡ SIMD" slower than the plain JS it replaced. Each is
 * individually reasonable; together they let you ship a page that claims
 * WebAssembly and runs JavaScript, with every test green.
 *
 * These record. The load-bearing detail is that they record ONCE PER SITE, not
 * once per call — a recorder that fires inside a hot loop becomes the
 * performance problem it exists to detect.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

const g = globalThis as any

// Same shape as the real tjs-lang/linalg kernels: wasm types (f64/i32), SIMD
// loads, Float32Array in.
const SRC = `
wasm function total(a: Float32Array, n: i32): f64 {
  let acc = f32x4_splat(0.0)
  for (let i = 0; i < n; i += 4) {
    let off = i * 4
    acc = f32x4_add(acc, f32x4_load(a, off))
  }
  return f32x4_extract_lane(acc, 0)
    + f32x4_extract_lane(acc, 1)
    + f32x4_extract_lane(acc, 2)
    + f32x4_extract_lane(acc, 3)
}
`

describe('flight recorder: wasm', () => {
  let saved: any
  let rt: ReturnType<typeof createRuntime>

  beforeEach(() => {
    saved = g.__tjs
    rt = createRuntime()
    g.__tjs = { record: rt.record, records: rt.records }
  })
  afterEach(() => {
    g.__tjs = saved
    delete g.__tjs_wasm_pending
    delete g.__tjs_wasm_ready
    delete g.wasmBuffer
  })

  it('records the copy penalty ONCE, not once per call', async () => {
    const { code } = tjs(SRC)
    new Function(code)()
    await g.__tjs_wasm_ready?.()

    const wasmFn = g.__tjs_wasm_total
    if (typeof wasmFn !== 'function') {
      throw new Error('wasm export missing — test needs a compiled block')
    }

    // A plain Float32Array — NOT allocated with wasmBuffer(). This is the
    // 4.4x-slower-than-JS trap from #9.
    const plain = new Float32Array([1, 2, 3, 4])
    for (let i = 0; i < 50; i++) wasmFn(plain, 4)

    const notices = rt.records({ source: 'wasm' })
    expect(notices).toHaveLength(1) // 50 calls, ONE record
    expect(notices[0].severity).toBe('notice')
    expect(notices[0].message).toContain('wasmBuffer()')
    expect((notices[0].data as any).fn).toContain('total')
  })

  it('stays silent when the array IS wasm memory (the fast path)', async () => {
    const { code } = tjs(SRC)
    new Function(code)()
    await g.__tjs_wasm_ready?.()

    const wasmFn = g.__tjs_wasm_total
    const fast = g.wasmBuffer(Float32Array, 4)
    fast.set([1, 2, 3, 4])
    for (let i = 0; i < 50; i++) wasmFn(fast, 4)

    // Zero-copy path — nothing to report.
    expect(rt.records({ source: 'wasm' })).toHaveLength(0)
  })

  it('records a module that fails to instantiate instead of swallowing it', async () => {
    // The bootstrap used to end in `.catch(()=>{})` — a wasm module that failed
    // to instantiate vanished without a trace and every block silently ran JS.
    const { code } = tjs(SRC)
    const corrupted = code.replace(
      /const __wasmModuleB64=".*?";/,
      'const __wasmModuleB64="AAAA";'
    )
    expect(corrupted).not.toBe(code) // the substitution actually happened

    new Function(corrupted)()
    await g.__tjs_wasm_ready?.()

    const found = rt.records({ source: 'wasm', severity: 'warning' })
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('failed to instantiate')
  })
})
