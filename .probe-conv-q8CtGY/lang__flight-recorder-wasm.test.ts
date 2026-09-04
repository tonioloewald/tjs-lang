/**
 * WASM: __tjs_wasm_total (export: compute_0)
 * (func (export "compute") (param $a i32) (param $n i32) (result f64)
 *   (local $L2 v128) (local $L3 i32) (local $L4 i32)
 *   f64.const 0
 *   f32.demote.f64
 *   f32x4.splat
 *   local.set $L2
 *   i32.const 0
 *   local.set $L3
 *   block
 *     loop
 *       local.get $L3
 *       local.get $n
 *       i32.lt.s
 *       i32.eqz
 *       br.if 1
 *       local.get $L3
 *       i32.const 4
 *       i32.mul
 *       local.set $L4
 *       local.get $L2
 *       local.get $a
 *       local.get $L4
 *       i32.add
 *       v128.load
 *       f32x4.add
 *       local.tee $L2
 *       drop
 *       local.get $L3
 *       i32.const 4
 *       i32.add
 *       local.tee $L3
 *       drop
 *       br 0
 *     end
 *   end
 *   local.get $L2
 *   f32x4.extract.lane 0
 *   local.get $L2
 *   f32x4.extract.lane 1
 *   f32.add
 *   local.get $L2
 *   f32x4.extract.lane 2
 *   f32.add
 *   local.get $L2
 *   f32x4.extract.lane 3
 *   f32.add
 *   f64.promote.f32
 *   return
 * )
 */
globalThis.__tjs_wasm_pending ??= []
globalThis.__tjs_wasm_ready ??= () => Promise.all(globalThis.__tjs_wasm_pending)
;(() => {
  const __rec = (e) => {
    try {
      globalThis.__tjs?.record?.(e)
    } catch {}
  }
  const __wasmExports = [
    {
      id: '__tjs_wasm_total',
      n: 'compute_0',
      c: ['a: Float32Array', 'n: i32'],
      m: true,
    },
  ]
  const __wasmModuleB64 =
    'AGFzbQEAAAABBwFgAn9/AXwCDwEDZW52Bm1lbW9yeQIAAQMCAQAHDQEJY29tcHV0ZV8wAAAKYwFhAgF7An9EAAAAAAAAAAC2/RMhAkEAIQMCQANAIAMgAUhFDQEgA0EEbCEEIAIgACAEav0AAgD95AEiAhogA0EEaiIDGgwACwsgAv0fACAC/R8BkiAC/R8CkiAC/R8DkrsPCw=='
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
  const __wasmMem = new WebAssembly.Memory({ initial: 1024 })
  let __woff = 0
  globalThis.wasmBuffer = function (Ctor, len) {
    const bytes = len * Ctor.BYTES_PER_ELEMENT
    const align = Math.max(Ctor.BYTES_PER_ELEMENT, 16)
    __woff = (__woff + align - 1) & ~(align - 1)
    const arr = new Ctor(__wasmMem.buffer, __woff, len)
    __woff += bytes
    return arr
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
        { env: { memory: __wasmMem } }
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
        WebAssembly.instantiate(__b64ToBytes(__wasmModuleB64), {
          env: { memory: __wasmMem },
        })
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

const SRC = `
function total(a, n) { return globalThis.__tjs_wasm_total(a, n) }
`

describe('flight recorder: wasm', () => {
  let saved
  let rt
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

    const plain = new Float32Array([1, 2, 3, 4])
    for (let i = 0; i < 50; i++) wasmFn(plain, 4)
    const notices = rt.records({ source: 'wasm' })
    expect(notices).toHaveLength(1)
    expect(notices[0].severity).toBe('notice')
    expect(notices[0].message).toContain('wasmBuffer()')
    expect(notices[0].data.fn).toContain('total')
  })
  it('stays silent when the array IS wasm memory (the fast path)', async () => {
    const { code } = tjs(SRC)
    new Function(code)()
    await g.__tjs_wasm_ready?.()
    const wasmFn = g.__tjs_wasm_total
    const fast = g.wasmBuffer(Float32Array, 4)
    fast.set([1, 2, 3, 4])
    for (let i = 0; i < 50; i++) wasmFn(fast, 4)

    expect(rt.records({ source: 'wasm' })).toHaveLength(0)
  })
  it('records a module that fails to instantiate instead of swallowing it', async () => {
    const { code } = tjs(SRC)
    const corrupted = code.replace(
      /const __wasmModuleB64=".*?";/,
      'const __wasmModuleB64="AAAA";'
    )
    expect(corrupted).not.toBe(code)
    new Function(corrupted)()
    await g.__tjs_wasm_ready?.()
    const found = rt.records({ source: 'wasm', severity: 'warning' })
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('failed to instantiate')
  })
})
