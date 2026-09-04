/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  compileToWasm,
  instantiateWasm,
} from '/Users/tonioloewald/tjs-lang/src/lang/wasm'

/* line 13 */
async function kernel(body, captures) {
  const block = { id: 'k', body, captures, start: 0, end: 0 }
  const result = compileToWasm(block)
  expect(result.error).toBeFalsy()

  const memory = new WebAssembly.Memory({ initial: 16 })
  const instance = await instantiateWasm(result.bytes, memory)
  return instance.exports.compute
}
kernel.__tjs = {
  params: {
    body: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    captures: {
      type: {
        kind: 'array',
        items: {
          kind: 'string',
        },
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:13',
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
  const via = (cmp) =>
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
    const f = await kernel(
      'return f32x4_extract_lane(f32x4_min(f32x4_max(f32x4_splat(a), f32x4_splat(0.0)), f32x4_splat(3.0)), 0)',
      ['a', 'b']
    )
    expect(f(-5, 0)).toBe(0)
    expect(f(1.5, 0)).toBe(1.5)
    expect(f(10, 0)).toBe(3)
  })
})
