/** The doc page's caps on a live AJS example's run options (site/run-options.ts). */
import { describe, it, expect } from 'bun:test'
import { pageRunOptions, PAGE_CAPS } from './run-options'

describe('pageRunOptions', () => {
  it('defaults: 10,000 fuel and the 10s page timeout', () => {
    expect(pageRunOptions({})).toEqual({ fuel: 10_000, timeoutMs: 10_000 })
  })
  it('passes a modest budget through', () => {
    expect(
      pageRunOptions({
        fuel: 500,
        timeoutMs: 200,
        maxHeapBytes: 1e6,
        quotas: { httpFetch: 2 },
      })
    ).toEqual({
      fuel: 500,
      timeoutMs: 200,
      maxHeapBytes: 1e6,
      quotas: { httpFetch: 2 },
    })
  })
  it('caps what would freeze a tab', () => {
    const o = pageRunOptions({
      fuel: 1e12,
      timeoutMs: 1e9,
      maxHeapBytes: 1e12,
      membraneMaxBytes: 1e12,
    })
    expect(o).toEqual({ ...PAGE_CAPS })
  })
  it('ignores nonsense and unknown keys', () => {
    expect(
      pageRunOptions({
        fuel: -1,
        timeoutMs: 'soon',
        maxHeapBytes: NaN,
        quotas: { a: 1.5, b: -1, c: 3 },
        evil: true,
      })
    ).toEqual({ fuel: 10_000, timeoutMs: 10_000, quotas: { c: 3 } })
  })
})
