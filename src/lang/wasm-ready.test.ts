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
// eval a bootstrap can leave them set. Clear every one of them before each test
// so each assertion reflects THIS module's state. (Block ids are salted with a
// content hash of their module, so there is no fixed list to delete.)
const clearWasmGlobals = () => {
  for (const k of Object.keys(g)) {
    if (k.startsWith('__tjs_wasm_')) delete g[k]
  }
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
  it('is bound synchronously — there is no longer a race to lose', async () => {
    const result = tjs(KERNEL)
    const id = result.wasmCompiled![0].id
    new Function(result.code)() // run the bootstrap

    expect(typeof g.__tjs_wasm_ready).toBe('function')

    // This assertion used to be `expect(g.__tjs_wasm_0).toBeUndefined()` — it
    // pinned the very race it was written to work around: instantiation was a
    // fire-and-forget async IIFE, so nothing was bound until a microtask later.
    // An inline `wasm{} fallback{}` block survives that window by running its JS
    // fallback, but a `wasm function` declaration has no fallback and simply
    // threw. The bootstrap now instantiates synchronously (`new WebAssembly.Module`),
    // so the binding exists the moment the bootstrap returns.
    expect(typeof g[id]).toBe('function')

    // …and ready() still resolves, because a browser main thread with a >4KB
    // module is still forced down the async path. Awaiting it stays correct.
    await g.__tjs_wasm_ready()
    expect(typeof g[id]).toBe('function')
  })

  it('a wasm function can be called immediately, with no await (was: TypeError)', () => {
    // The bug this guards: `import { dot } from 'tjs-lang/linalg'; dot(a, b, 3)`
    // threw "globalThis.__tjs_wasm_dot is not a function". A `wasm function` has
    // no JS fallback{} to degrade into, so losing the instantiation race was fatal
    // rather than merely slow — which made a shipped entry point unusable via a
    // plain import. No `await __tjs_wasm_ready()` here on purpose: needing one is
    // the bug.
    const { code } = tjs(
      `wasm function triple(x: f64): f64 {\n  return x * 3.0\n}`
    )
    const triple = new Function(`${code}; return triple`)()
    expect(triple(14)).toBe(42)
  })

  it('two modules do not fight over one global id (was: both used __tjs_wasm_0)', () => {
    // Inline block ids were a per-FILE counter, so every module's first block
    // claimed `globalThis.__tjs_wasm_0`. Loading a second module overwrote the
    // first module's binding — and because the emitted call site guards the wasm
    // path on that global merely EXISTING, module A would then happily call
    // module B's compiled function with A's captures. Both modules here define a
    // first inline block; each must keep calling its own.
    const doubler = tjs(`function d(x: 0.0) { return wasm { return x * 2.0 } }`)
    const tripler = tjs(`function t(x: 0.0) { return wasm { return x * 3.0 } }`)
    expect(doubler.wasmCompiled![0].id).not.toBe(tripler.wasmCompiled![0].id)

    const d = new Function(doubler.code + '\nreturn d')()
    const t = new Function(tripler.code + '\nreturn t')()

    // Load order must not matter: `t` was evaluated second, so under the old
    // per-file counter it had just clobbered `d`'s binding and this returned 21.
    expect(d(7)).toBe(14)
    expect(t(7)).toBe(21)
  })

  it('accumulates pending across modules and awaits all', async () => {
    const a = tjs(KERNEL)
    new Function(a.code)()
    const firstReady = g.__tjs_wasm_ready
    const b = tjs(KERNEL.replace('scale', 'scale2'))
    new Function(b.code)()
    // same shared helper + a growing pending list, not overwritten per module
    expect(g.__tjs_wasm_ready).toBe(firstReady)
    expect(g.__tjs_wasm_pending.length).toBe(2)

    // Two DIFFERENT modules, so two different ids — this is the collision that
    // the content-hash salt exists to prevent. Before it, both were
    // `__tjs_wasm_0` and the second module's bootstrap silently clobbered the
    // first module's binding.
    const idA = a.wasmCompiled![0].id
    const idB = b.wasmCompiled![0].id
    expect(idA).not.toBe(idB)

    await g.__tjs_wasm_ready()
    expect(typeof g[idA]).toBe('function')
    expect(typeof g[idB]).toBe('function')
  })
})

describe('__tjs_wasm_enabled toggle (force the JS fallback for benchmarking)', () => {
  // A scalar kernel so input validation passes (a Float32Array isn't
  // `Array.isArray`, which would early-return before the dispatch). We spy on the
  // compiled export to detect which path the dispatch takes.
  const SCALAR = `function pick(x: 0.0) { wasm { return x } fallback { return x } }`

  it('routes to the fallback when disabled, even though WASM is ready', async () => {
    const result = tjs(SCALAR)
    const id = result.wasmCompiled![0].id
    const pick = new Function(result.code + '\nreturn pick')()
    await g.__tjs_wasm_ready()
    const real = g[id]
    let wasmCalls = 0
    g[id] = (...a: any[]) => {
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
