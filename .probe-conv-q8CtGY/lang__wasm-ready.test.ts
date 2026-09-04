/**
 * WASM: __tjs_wasm_triple (export: compute_0)
 * (failed: Parse error: Expecting Unicode escape sequence \uXXXX (1:24))
 */
globalThis.__tjs_wasm_pending ??= []
globalThis.__tjs_wasm_ready ??= () => Promise.all(globalThis.__tjs_wasm_pending)
;(() => {
  const __rec = (e) => {
    try {
      globalThis.__tjs?.record?.(e)
    } catch {}
  }
  const __wasmExports = []
  const __wasmModuleB64 =
    'AGFzbQEAAAABBgFgAXwBfAMCAQAHDQEJY29tcHV0ZV8wAAAKDQELAEQAAAAAAAAAAAs='
  const __b64ToBytes = (s) => {
    const b = atob(s),
      a = new Uint8Array(b.length)
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i)
    return a
  }
  const __parseType = (c) => {
    const m = c.match(/^(\w+)\s*:\s*(\w+)$/)
    if (!m) return { n: c, t: 'f64', a: false }
    const [, n, ts] = m
    const at = {
      Float32Array: 'f32',
      Float64Array: 'f64',
      Int32Array: 'i32',
      Uint8Array: 'i32',
    }
    if (at[ts]) return { n, t: 'i32', a: true, at: ts }
    return { n, t: 'f64', a: false }
  }

  const __bind = (__wasmInst) => {
    for (const { id, n, c, m } of __wasmExports) {
      const compute = __wasmInst.exports[n]
      const params = c.map(__parseType)
      const hasArrays = params.some((p) => p.a)
      if (!hasArrays) {
        globalThis[id] = compute
        continue
      }
      let __copied = false
      globalThis[id] = function (...args) {
        const mv = new Uint8Array(__wasmMem.buffer)
        let off = __woff
        const ptrs = []
        for (let i = 0; i < params.length; i++) {
          const p = params[i],
            a = args[i]
          if (p.a && a?.buffer) {
            if (a.buffer === __wasmMem.buffer) {
              ptrs.push(a.byteOffset)
            } else {
              if (!__copied) {
                __copied = true
                __rec({
                  source: 'wasm',
                  severity: 'notice',
                  message:
                    "'" +
                    id +
                    "' was passed a typed array outside wasm memory — copying in and out on every call. This can be SLOWER than plain JS. Allocate it with wasmBuffer() to pass it zero-copy.",
                  data: { fn: id, param: p.n, bytes: a.byteLength },
                })
              }
              const ab = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
              off = (off + 15) & ~15
              mv.set(ab, off)
              ptrs.push(off)
              off += ab.length
            }
          } else ptrs.push(a)
        }
        const r = compute(...ptrs)
        off = __woff
        for (let i = 0; i < params.length; i++) {
          const p = params[i],
            a = args[i]
          if (p.a && a?.buffer) {
            if (a.buffer === __wasmMem.buffer) continue
            const ab = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
            off = (off + 15) & ~15
            ab.set(mv.slice(off, off + ab.length))
            off += ab.length
          }
        }
        return r
      }
    }
  }
  const __fail = (e) => {
    try {
      globalThis.__tjs?.record?.({
        source: 'wasm',
        severity: 'warning',
        message:
          'wasm module failed to instantiate — every wasm{} block in this file is running its JS fallback: ' +
          ((e && e.message) || e),
        data: { error: String(e) },
      })
    } catch {}
  }
  try {
    __bind(
      new WebAssembly.Instance(
        new WebAssembly.Module(__b64ToBytes(__wasmModuleB64)),
        {}
      )
    )
    globalThis.__tjs_wasm_pending.push(Promise.resolve())
  } catch (__syncErr) {
    // The async retry needs its OWN guard — it can throw SYNCHRONOUSLY.
    //
    // `WebAssembly.instantiate` normally returns a promise and rejects, so a `.catch` was
    // assumed sufficient. Under memory pressure SpiderMonkey instead throws
    // `no WebAssembly compiler available` synchronously, and that throw was inside the catch
    // block with nothing around it — so it escaped and took down the whole module, in a file
    // whose `wasm{} fallback{}` exists precisely so the program does not need WebAssembly.
    //
    // `fallback` covered "this module failed to validate" but not "this engine has no wasm
    // compiler right now", which is the broader of the two and the one an author cannot code
    // around: intermittent, engine-resource-dependent, ~1 run in 6 on a loaded Firefox.
    // Reported from tosijs-ui's Playwright lane (#36).
    try {
      globalThis.__tjs_wasm_pending.push(
        WebAssembly.instantiate(__b64ToBytes(__wasmModuleB64), {})
          .then((r) => __bind(r.instance))
          .catch(__fail)
      )
    } catch (__asyncErr) {
      __fail(__asyncErr)
      globalThis.__tjs_wasm_pending.push(Promise.resolve())
    }
  }
})()
/* tjs <- input.ts */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

const g = globalThis

g.__tjs = createRuntime()

/* line 22 */
function clearWasmGlobals() {
  for (const k of Object.keys(g)) {
    if (k.startsWith('__tjs_wasm_')) delete g[k]
  }
}
clearWasmGlobals.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:22',
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
    const id = result.wasmCompiled[0].id
    new Function(result.code)()
    expect(typeof g.__tjs_wasm_ready).toBe('function')

    expect(typeof g[id]).toBe('function')

    await g.__tjs_wasm_ready()
    expect(typeof g[id]).toBe('function')
  })
  it('a wasm function can be called immediately, with no await (was: TypeError)', () => {
    const { code } = tjs(
      `function triple(x) { return globalThis.__tjs_wasm_triple(x) }`
    )
    const triple = new Function(`${code}; return triple`)()
    expect(triple(14)).toBe(42)
  })
  it('two modules do not fight over one global id (was: both used __tjs_wasm_0)', () => {
    const doubler = tjs(`function d(x: 0.0) { return wasm { return x * 2.0 } }`)
    const tripler = tjs(`function t(x: 0.0) { return wasm { return x * 3.0 } }`)
    expect(doubler.wasmCompiled[0].id).not.toBe(tripler.wasmCompiled[0].id)
    const d = new Function(doubler.code + '\nreturn d')()
    const t = new Function(tripler.code + '\nreturn t')()

    expect(d(7)).toBe(14)
    expect(t(7)).toBe(21)
  })
  it('accumulates pending across modules and awaits all', async () => {
    const a = tjs(KERNEL)
    new Function(a.code)()
    const firstReady = g.__tjs_wasm_ready
    const b = tjs(KERNEL.replace('scale', 'scale2'))
    new Function(b.code)()

    expect(g.__tjs_wasm_ready).toBe(firstReady)
    expect(g.__tjs_wasm_pending.length).toBe(2)

    const idA = a.wasmCompiled[0].id
    const idB = b.wasmCompiled[0].id
    expect(idA).not.toBe(idB)
    await g.__tjs_wasm_ready()
    expect(typeof g[idA]).toBe('function')
    expect(typeof g[idB]).toBe('function')
  })
})

describe('__tjs_wasm_enabled toggle (force the JS fallback for benchmarking)', () => {
  const SCALAR = `function pick(x: 0.0) { wasm { return x } fallback { return x } }`
  it('routes to the fallback when disabled, even though WASM is ready', async () => {
    const result = tjs(SCALAR)
    const id = result.wasmCompiled[0].id
    const pick = new Function(result.code + '\nreturn pick')()
    await g.__tjs_wasm_ready()
    const real = g[id]
    let wasmCalls = 0
    g[id] = (...a) => {
      wasmCalls++
      return real(...a)
    }
    pick(1)
    expect(wasmCalls).toBe(1)
    g.__tjs_wasm_enabled = false
    pick(1)
    expect(wasmCalls).toBe(1)
    g.__tjs_wasm_enabled = true
    pick(1)
    expect(wasmCalls).toBe(2)
    delete g.__tjs_wasm_enabled
  })
})
