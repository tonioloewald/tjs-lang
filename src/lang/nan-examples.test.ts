/**
 * NaN and Infinity in examples and tests (#4119 item 4).
 *
 * A `: NaN` return example was serialised through JSON, so the signature test expected `null`
 * ("Expected null at 'nan', got NaN"), and a test block's `expect(NaN).toBe(NaN)` failed because
 * the test harness compared with `===` (the signature harness already treated NaN as NaN).
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

const results = (src: string) =>
  (tjs(src).testResults ?? []).map((r: any) => [r.description, r.passed])

describe('NaN and Infinity', () => {
  it('a NaN return example is checked as NaN', () => {
    expect(results('function nan(x: 0.0): NaN { return x / 0 * 0 }')).toEqual([
      ['nan signature example', true],
    ])
  })
  it('an Infinity return example is checked as Infinity', () => {
    expect(results('function inf(x: 1.0): Infinity { return x / 0 }')).toEqual([
      ['inf signature example', true],
    ])
  })
  it('expect(NaN).toBe(NaN) passes in a test block', () => {
    expect(results("test 'n' { expect(NaN).toBe(NaN) }")).toEqual([['n', true]])
  })
  it('a wrong NaN example still fails (the other direction)', () => {
    expect(() => tjs('function one(x: 0.0): NaN { return 1 }')).toThrow(
      /signature example/
    )
    expect(() => tjs("test 'n' { expect(1).toBe(NaN) }")).toThrow(
      /Expected NaN/
    )
  })
})
