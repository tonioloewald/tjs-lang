/**
 * Inconclusive is not failed — the rule that `tjs convert` and `tjs test` had drifted on.
 *
 * `convert` classified with `testResults.filter(r => !r.passed)`, which folds INCONCLUSIVE
 * into FAILED. `test` did the three-way split. Same array, same flags, two answers.
 *
 * The consequence was 13 "failures" printed on every tosijs build — from two files whose
 * converted output was *correct and shipping* — in a build that exits 0. They learned to
 * scroll past them, which is exactly the ambient-noise condition that hides a real failure
 * the day one arrives. It did: the #37 regression, which made converted modules throw on
 * import, first read as "more of the usual convert noise" (#40).
 *
 * So these tests pin the classification, not the wording. The reporting text may change;
 * a result the harness could not execute may never be counted as a failure.
 */
import { describe, it, expect } from 'bun:test'
import { tallyTestResults, testLabel } from './test-report'

const R = (o: Record<string, unknown>) => o as any

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
    // Every inconclusive result also has `passed: false`. A classifier keying on `!passed`
    // gets this "right" by accident on the passed row and wrong on every other.
    const t = tallyTestResults([R({ passed: false, inconclusive: true })])
    expect(t.failed).toEqual([])
    expect(t.inconclusive).toHaveLength(1)
  })

  it('the reported case: a module that could not execute is 0 failed', () => {
    // What `convert` printed as `13 failed` across two files. Every result carries the
    // module-level note, because no test could run — not because thirteen tests disagreed.
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
    // The control. Making inconclusive non-fatal must not make everything non-fatal —
    // a signature example that RAN and disagreed is exactly what these tests exist to catch.
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
    // The module-level catch attributes NO line, deliberately — the error came from module
    // execution, not a site, and pointing an editor at a guessed line is worse than silence.
    expect(testLabel(R({ description: 'x', line: 12 }))).toBe("'x':12")
    expect(testLabel(R({ description: 'x' }))).toBe("'x'")
  })
})
