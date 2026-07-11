/**
 * f32x4 min/max, lane comparisons (lt/le/gt/ge/eq/ne → mask), and select
 * (branch-free blend) — the intrinsics that unlock DATA-DEPENDENT SIMD (clamp,
 * saturate, SIMD Mandelbrot). Before this, f32x4 was arithmetic-only, so masked
 * SIMD was impossible (tosijs-ui feedback UI-#6). Executed as real WASM and
 * checked lane 0 via `extract_lane` (compares are checked through `select`, since
 * a raw mask isn't a meaningful float).
 */
import { describe, it, expect } from 'bun:test'
import { compileToWasm, instantiateWasm, type WasmBlock } from './wasm'

/** Compile+instantiate a 2-arg f32 kernel `compute(a, b)` from a block body. */
async function kernel(body: string, captures: string[]) {
  const block: WasmBlock = { id: 'k', body, captures, start: 0, end: 0 }
  const result = compileToWasm(block)
  expect(result.error).toBeFalsy()
  // SIMD modules import env.memory (for potential v128 load/store); provide one.
  const memory = new WebAssembly.Memory({ initial: 16 })
  const instance = await instantiateWasm(result.bytes, memory)
  return instance.exports.compute as (...a: number[]) => number
}

describe('f32x4 min / max', () => {
  it('max', async () => {
    const f = await kernel(
      'return f32x4_extract_lane(f32x4_max(f32x4_splat(a), f32x4_splat(b)), 0)',
      ['a', 'b']
    )
    expect(f(3, 5)).toBe(5)
    expect(f(-2, -8)).toBe(-2)
    expect(f(4.5, 4.5)).toBe(4.5)
  })
  it('min', async () => {
    const f = await kernel(
      'return f32x4_extract_lane(f32x4_min(f32x4_splat(a), f32x4_splat(b)), 0)',
      ['a', 'b']
    )
    expect(f(3, 5)).toBe(3)
    expect(f(-2, -8)).toBe(-8)
  })
})

describe('f32x4 select + comparisons (branch-free lane blend)', () => {
  // select(cmp(a,b), 1, 2) → 1 when the comparison is true (mask lane all-1s), else 2
  const via = (cmp: string) =>
    kernel(
      `return f32x4_extract_lane(f32x4_select(${cmp}(f32x4_splat(a), f32x4_splat(b)), f32x4_splat(1.0), f32x4_splat(2.0)), 0)`,
      ['a', 'b']
    )

  it('gt', async () => {
    const f = await via('f32x4_gt')
    expect(f(5, 3)).toBe(1)
    expect(f(3, 5)).toBe(2)
  })
  it('lt', async () => {
    const f = await via('f32x4_lt')
    expect(f(3, 5)).toBe(1)
    expect(f(5, 3)).toBe(2)
  })
  it('ge / le at equality', async () => {
    expect(await (await via('f32x4_ge'))(4, 4)).toBe(1)
    expect(await (await via('f32x4_le'))(4, 4)).toBe(1)
    expect(await (await via('f32x4_ge'))(3, 4)).toBe(2)
  })
  it('eq / ne', async () => {
    expect(await (await via('f32x4_eq'))(4, 4)).toBe(1)
    expect(await (await via('f32x4_eq'))(4, 5)).toBe(2)
    expect(await (await via('f32x4_ne'))(4, 5)).toBe(1)
  })
})

describe('clamp via min/max (the canonical use)', () => {
  it('clamps to [lo, hi] on lane 0', async () => {
    // clamp(v, lo, hi) = min(max(v, lo), hi); fix lo=0, hi=3 via constants
    const f = await kernel(
      'return f32x4_extract_lane(f32x4_min(f32x4_max(f32x4_splat(a), f32x4_splat(0.0)), f32x4_splat(3.0)), 0)',
      ['a', 'b']
    )
    expect(f(-5, 0)).toBe(0)
    expect(f(1.5, 0)).toBe(1.5)
    expect(f(10, 0)).toBe(3)
  })
})
