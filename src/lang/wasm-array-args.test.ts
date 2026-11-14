/**
 * A typed-array parameter of a wasm function never takes a non-typed-array as a pointer (#4108,
 * a 0.14.0 blocker).
 *
 * The binding pushed any argument that was not a typed array straight through as the parameter,
 * so a plain array became address 0 and the wasm code overwrote whatever lived there: another
 * `wasmBuffer` was silently changed, and the function returned its input untouched. A typed array
 * of the wrong kind had its bytes reinterpreted. Now a typed array of the declared kind in wasm
 * memory passes zero-copy as before; any other array-like is copied in as the declared kind and
 * its results written back element by element (what the JS fallback does to it); anything else
 * is a TypeError naming the function and parameter.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { tjs } from './index'
import { createRuntime } from './runtime'

const g = globalThis as any

const SRC = `
wasm function scale(a: Float32Array, n: i32): f64 {
  for (let i = 0; i < n; i++) { a[i] = a[i] * 2.0 }
  return 0.0
}
`

describe('wasm typed-array parameters', () => {
  let saved: any
  beforeEach(async () => {
    saved = g.__tjs
    const rt = createRuntime()
    g.__tjs = { record: rt.record, records: rt.records }
    new Function(tjs(SRC).code)()
    await g.__tjs_wasm_ready?.()
    if (typeof g.__tjs_wasm_scale !== 'function')
      throw new Error('wasm export missing — test needs a compiled module')
  })
  afterEach(() => {
    g.__tjs = saved
    delete g.__tjs_wasm_pending
    delete g.__tjs_wasm_ready
    delete g.wasmBuffer
  })

  it('a plain array is scaled in place and corrupts nothing else', () => {
    const other = g.wasmBuffer(Float32Array, 2)
    other.set([5, 6])
    const plain = [1, 2]
    g.__tjs_wasm_scale(plain, 2)
    expect(plain).toEqual([2, 4]) // what the JS fallback does
    expect([...other]).toEqual([5, 6]) // untouched (was 10,12)
  })

  it('a typed array of another kind is converted, scaled and written back', () => {
    const other = g.wasmBuffer(Float32Array, 2)
    other.set([5, 6])
    // 0x3F800000 is 1.0 read as float bits: reinterpreted, it would double to 2.0's bits
    // (1073741824). Small integers are denormals, whose bits double too, so they cannot tell.
    const ints = new Int32Array([1065353216, 4])
    g.__tjs_wasm_scale(ints, 2)
    expect([...ints]).toEqual([2130706432, 8])
    expect([...other]).toEqual([5, 6])
  })

  it('anything else is refused, naming the function and parameter', () => {
    expect(() => g.__tjs_wasm_scale(null, 2)).toThrow(
      /'scale' expects a Float32Array .* for 'a', got null/
    )
    expect(() => g.__tjs_wasm_scale(7, 2)).toThrow(/got number/)
  })

  it('the zero-copy and copy-in paths still work (the other direction)', () => {
    const fast = g.wasmBuffer(Float32Array, 2)
    fast.set([1, 2])
    g.__tjs_wasm_scale(fast, 2)
    expect([...fast]).toEqual([2, 4])
    const outside = new Float32Array([3, 4])
    g.__tjs_wasm_scale(outside, 2)
    expect([...outside]).toEqual([6, 8])
  })
})
