/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

/* line 10 */
function intDivWarning(r) {
  return r.warnings?.find((w) => /integer division/.test(w))
}
intDivWarning.__tjs = {
  params: {
    r: {
      type: {
        kind: 'object',
        shape: {
          warnings: {
            kind: 'array',
            items: {
              kind: 'string',
            },
          },
        },
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:10',
}

describe('i32/i32 division lint', () => {
  it('warns when both operands are i32 (loop vars)', () => {
    const r = tjs(`function f(n: 0) {
      wasm {
        for (let y = 1; y < n; y += 1) {
          for (let x = 1; x < n; x += 1) { let r = x / y }
        }
      } fallback { }
      return n
    }`)
    expect(r.wasmCompiled?.[0]?.success).toBe(true)
    expect(intDivWarning(r)).toBeTruthy()
    expect(intDivWarning(r)).toMatch(/\+ 0\.0/)
  })
  it('warns once per block, not per occurrence', () => {
    const r = tjs(`function f(n: 0) {
      wasm {
        for (let i = 1; i < n; i += 1) { let a = i / n; let b = n / i; let c = i / i }
      } fallback { }
      return n
    }`)
    expect(r.warnings?.filter((w) => /integer division/.test(w)).length).toBe(1)
  })
  it('does NOT warn on float division', () => {
    const r = tjs(`function g(a: 0.0, b: 0.0) {
      wasm { let r = a / b } fallback { }
      return a
    }`)
    expect(intDivWarning(r)).toBeUndefined()
  })
})
