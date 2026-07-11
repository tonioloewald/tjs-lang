/**
 * `globalThis.__tjs_wasm_ready()` — an awaitable signal for WASM instantiation.
 *
 * The emitted bootstrap instantiates WASM asynchronously (fire-and-forget), so
 * synchronous code right after transpile+eval used to hit the JS `fallback{}`
 * because `globalThis.__tjs_wasm_N` wasn't set yet — with no way to await it
 * (tosijs-ui feedback UI-#2, "bit us hard"). Now each module pushes its
 * instantiation promise onto `globalThis.__tjs_wasm_pending` and
 * `__tjs_wasm_ready()` awaits them all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

const g = globalThis as any
g.__tjs = createRuntime()

// The `__tjs_wasm_*` globals are shared process-wide, so other test files that
// eval a bootstrap can leave them set. Clear before each test so the
// "undefined before ready" assertion reflects THIS module's state.
const clearWasmGlobals = () => {
  delete g.__tjs_wasm_pending
  delete g.__tjs_wasm_ready
  delete g.__tjs_wasm_0
}

const KERNEL = `function scale(arr: [0.0], len: 0, f: 0.0) {
  wasm {
    let s = f32x4_splat(f)
    for (let i = 0; i < len; i += 4) { let o = i * 4; f32x4_store(arr, o, f32x4_mul(f32x4_load(arr, o), s)) }
  } fallback { for (let i = 0; i < len; i++) arr[i] *= f }
  return arr
}`

beforeEach(clearWasmGlobals)
afterEach(clearWasmGlobals)

describe('__tjs_wasm_ready', () => {
  it('resolves once WASM is instantiated (was a fallback race before)', async () => {
    const { code } = tjs(KERNEL)
    new Function(code)() // run the bootstrap (fire-and-forget instantiation)

    expect(typeof g.__tjs_wasm_ready).toBe('function')
    // synchronously right after eval, the module isn't ready yet…
    expect(g.__tjs_wasm_0).toBeUndefined()

    await g.__tjs_wasm_ready()

    // …now it is — a sync call here takes the WASM path, not the fallback.
    expect(typeof g.__tjs_wasm_0).toBe('function')
  })

  it('accumulates pending across modules and awaits all', async () => {
    new Function(tjs(KERNEL).code)()
    const firstReady = g.__tjs_wasm_ready
    new Function(tjs(KERNEL.replace('scale', 'scale2')).code)()
    // same shared helper + a growing pending list, not overwritten per module
    expect(g.__tjs_wasm_ready).toBe(firstReady)
    expect(g.__tjs_wasm_pending.length).toBe(2)

    await g.__tjs_wasm_ready()
    expect(typeof g.__tjs_wasm_0).toBe('function')
  })
})

describe('__tjs_wasm_enabled toggle (force the JS fallback for benchmarking)', () => {
  // A scalar kernel so input validation passes (a Float32Array isn't
  // `Array.isArray`, which would early-return before the dispatch). We spy on the
  // compiled export to detect which path the dispatch takes.
  const SCALAR = `function pick(x: 0.0) { wasm { return x } fallback { return x } }`

  it('routes to the fallback when disabled, even though WASM is ready', async () => {
    const pick = new Function(tjs(SCALAR).code + '\nreturn pick')()
    await g.__tjs_wasm_ready()
    const real = g.__tjs_wasm_0
    let wasmCalls = 0
    g.__tjs_wasm_0 = (...a: any[]) => {
      wasmCalls++
      return real(...a)
    }

    pick(1) // default (enabled) → WASM path
    expect(wasmCalls).toBe(1)

    g.__tjs_wasm_enabled = false
    pick(1) // forced fallback → WASM not called
    expect(wasmCalls).toBe(1)

    g.__tjs_wasm_enabled = true
    pick(1) // back to WASM
    expect(wasmCalls).toBe(2)
    delete g.__tjs_wasm_enabled
  })
})
