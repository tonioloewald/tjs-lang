/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  tallyTestResults,
  testLabel,
} from '/Users/tonioloewald/tjs-lang/src/cli/test-report'

/* line 19 */
function R(o) {
  return o
}
R.__tjs = {
  params: {
    o: {
      type: {
        kind: 'object',
        shape: {},
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:19',
}

describe('tallyTestResults', () => {
  it('splits three ways', () => {
    const t = tallyTestResults([
      R({ passed: true, description: 'a' }),
      R({ passed: false, inconclusive: true, description: 'b' }),
      R({ passed: false, description: 'c' }),
    ])
    expect(t.passed).toBe(1)
    expect(t.inconclusive.map((r) => r.description)).toEqual(['b'])
    expect(t.failed.map((r) => r.description)).toEqual(['c'])
  })
  it('INCONCLUSIVE WINS over !passed — the whole issue, in one assertion', () => {
    const t = tallyTestResults([R({ passed: false, inconclusive: true })])
    expect(t.failed).toEqual([])
    expect(t.inconclusive).toHaveLength(1)
  })
  it('the reported case: a module that could not execute is 0 failed', () => {
    const note =
      'Module could not be executed for testing: clamp is not defined'
    const results = Array.from({ length: 8 }, (_, i) =>
      R({
        passed: false,
        inconclusive: true,
        isSignatureTest: true,
        description: `fn${i}`,
        error: note,
      })
    )
    const t = tallyTestResults(results)
    expect(t.failed).toHaveLength(0)
    expect(t.inconclusive).toHaveLength(8)
    expect(t.passed).toBe(0)
  })
  it('a genuine value mismatch is still a failure', () => {
    const t = tallyTestResults([
      R({ passed: false, description: 'add', error: 'expected 5, got 0' }),
    ])
    expect(t.failed).toHaveLength(1)
    expect(t.inconclusive).toEqual([])
  })
  it('an empty run is not a failure', () => {
    expect(tallyTestResults([])).toEqual({
      passed: 0,
      inconclusive: [],
      failed: [],
    })
  })
})

describe('testLabel', () => {
  it('names signature tests as such, and quotes inline ones', () => {
    expect(testLabel(R({ isSignatureTest: true, description: 'add' }))).toBe(
      'Signature: add'
    )
    expect(testLabel(R({ description: 'clamps' }))).toBe("'clamps'")
  })
  it('carries the line when there is one, and omits it when there is not', () => {
    expect(testLabel(R({ description: 'x', line: 12 }))).toBe("'x':12")
    expect(testLabel(R({ description: 'x' }))).toBe("'x'")
  })
})
