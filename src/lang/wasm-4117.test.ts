/**
 * Three wasm defects from one report (#4117), each pinned.
 *
 * 1. A wasm function with a typed-array parameter whose body never touches memory threw
 *    `ReferenceError: __wasmMem is not defined`: the memory was declared only when the MODULE
 *    used it, but the binding passes arrays through it regardless.
 * 2. An i32 value stored into a Float32Array element emitted invalid WebAssembly: the plain
 *    store converted only three of the type pairs.
 * 3. An i64 parameter could not be called (`Invalid argument type in ToBigInt`); it is now
 *    refused at transpile time, by name.
 *
 * (The report's fourth item, `let k = 0; k = NaN` trapping, is documented behaviour: assigning
 * a value an i32 cannot hold traps, as `% 0` does. See DOCS-WASM "Numbers in WASM".)
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { tjs } from './index'

const g = globalThis as any
const load = async (src: string, name: string) => {
  const f = new Function(tjs(src).code + `\nreturn ${name}`)()
  await g.__tjs_wasm_ready?.()
  return f
}

describe('#4117', () => {
  afterEach(() => {
    delete g.__tjs_wasm_pending
    delete g.__tjs_wasm_ready
    delete g.wasmBuffer
  })

  it('a typed-array parameter the body ignores', async () => {
    const dot = await load(
      'wasm function dot(a: Float32Array, b: Float32Array, n: i32): f64 { return 42.0 }',
      'dot'
    )
    expect(dot(new Float32Array(4), [1, 2, 3, 4], 4)).toBe(42)
  })

  it('an i32 stored into a Float32Array element', async () => {
    const fill = await load(
      `wasm function fill(xs: Float32Array, n: i32): f64 {
        for (let i = 0; i < n; i++) { let v = i * 2; xs[i] = v }
        return 0.0
      }`,
      'fill'
    )
    const xs = g.wasmBuffer(Float32Array, 4)
    fill(xs, 4)
    expect([...xs]).toEqual([0, 2, 4, 6])
  })

  it('an f32 element stored into an Int32Array truncates', async () => {
    const copy = await load(
      `wasm function copy(src: Float32Array, dst: Int32Array, n: i32): f64 {
        for (let i = 0; i < n; i++) { dst[i] = src[i] }
        return 0.0
      }`,
      'copy'
    )
    const src = g.wasmBuffer(Float32Array, 2)
    src.set([2.75, -1.5])
    const dst = g.wasmBuffer(Int32Array, 2)
    copy(src, dst, 2)
    expect([...dst]).toEqual([2, -1])
  })

  it('an i64 parameter is refused by name', () => {
    expect(() => tjs('wasm function big(n: i64): f64 { return 1.0 }')).toThrow(
      /parameter `n` is i64, which is not supported yet/
    )
  })
})
