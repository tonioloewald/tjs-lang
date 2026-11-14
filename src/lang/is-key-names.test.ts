/**
 * `Is` compares key NAMES, not just key counts (#4110). `Is({ a: undefined }, { b: undefined })`
 * was true: both objects have one key, and reading the other object by a missing key gives
 * `undefined` too. Checked in the inline runtime emitted code uses and in the shared runtime,
 * which must agree (equality-invariants.test.ts).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { Is } from './runtime'

const inlineIs = () => {
  const saved = (globalThis as any).__tjs
  delete (globalThis as any).__tjs
  try {
    return new Function(tjs(`const x = Is(1, 1)`).code + '\nreturn Is')()
  } finally {
    ;(globalThis as any).__tjs = saved
  }
}

for (const [name, is] of [
  ['inline', inlineIs()],
  ['shared', Is],
] as const)
  describe(`Is (${name} runtime)`, () => {
    it('different key names are not equal, even with undefined values', () => {
      expect(is({ a: undefined }, { b: undefined })).toBe(false)
      expect(is({ a: 1, b: undefined }, { a: 1, c: undefined })).toBe(false)
    })
    it('same keys and values are equal (the other direction)', () => {
      expect(is({ a: undefined }, { a: undefined })).toBe(true)
      expect(is({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true)
    })
  })
