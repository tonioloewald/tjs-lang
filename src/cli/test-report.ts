/**
 * ONE tally of inline/signature test results, for every CLI command that reports them.
 *
 * `tjs test` and `tjs convert` both classify the same `testResults` array, and they had
 * drifted into disagreeing about it. `test` did the three-way split; `convert` filtered on
 * `!r.passed`, which silently folds INCONCLUSIVE into FAILED.
 *
 * That distinction is not cosmetic. A test the runner could not *execute* — an unresolved
 * cross-module import, a module-level throw — has not been observed to fail, and calling it
 * a failure makes legal code look broken (see PRINCIPLES.md: a richer layer may do more with
 * the same source, never reject what the subset allows). The runner already gets this right
 * and sets `inconclusive`; only the reporting threw the information away.
 *
 * The cost was real and compounding. tosijs saw **13 failures on every build** from two
 * files, in a build that exits 0, and learned to scroll past them — which is exactly the
 * ambient-noise condition that hides a real failure the day one arrives. It did: the #37
 * `new`-stripping regression, which made converted modules unimportable, initially read as
 * "more of the usual convert noise" (#40).
 *
 * So the rule lives here once, with a test, rather than in two commands that agree by care.
 */

export interface TestResultLike {
  passed?: boolean
  inconclusive?: boolean
  description?: string
  error?: string
  isSignatureTest?: boolean
  line?: number
}

export interface TestTally<T extends TestResultLike = TestResultLike> {
  /** Count of results that passed. */
  passed: number
  /** Could not be executed. Reported, never counted as a failure, never fails a build. */
  inconclusive: T[]
  /** Genuine failures: the test ran and disagreed. Only these may fail a build. */
  failed: T[]
}

/**
 * Split results into passed / inconclusive / failed.
 *
 * The one invariant: **`inconclusive` wins over `!passed`.** A result carrying both is
 * inconclusive, because the flag records *why* it did not pass.
 */
export function tallyTestResults<T extends TestResultLike>(
  results: readonly T[]
): TestTally<T> {
  const tally: TestTally<T> = { passed: 0, inconclusive: [], failed: [] }
  for (const r of results) {
    if (r.passed) tally.passed++
    else if (r.inconclusive) tally.inconclusive.push(r)
    else tally.failed.push(r)
  }
  return tally
}

/** How a result is named in CLI output. Signature tests say so; inline tests are quoted. */
export function testLabel(r: TestResultLike): string {
  const where = r.line ? `:${r.line}` : ''
  return r.isSignatureTest
    ? `Signature: ${r.description ?? ''}${where}`
    : `'${r.description ?? ''}'${where}`
}
