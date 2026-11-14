/**
 * Run a module's tests the way the page does, asynchronously, when the build-time run could not
 * (#3828, 2026-11-14).
 *
 * `tjs()` is synchronous, so its build-time test run cannot execute a module containing a
 * top-level `await` or a test body that awaits: every test came back inconclusive, and a genuinely
 * failing test in the same file was hidden with them. The page runs tests with the async runner
 * `tjs()` also returns (`testRunner`); the CLI now does the same when the build-time run reports
 * that the module could not execute. A module with `import` statements cannot run here (there is
 * no module loader), so its tests stay inconclusive, honestly.
 */
import { testUtils } from '../lang/tests'
import type { TestResultLike } from './test-report'

const MODULE_FAILED = /^Module could not be executed for testing/

/** The build-time run could not execute the module, so the async runner may do better. */
export function needsAsyncRun(results: TestResultLike[]): boolean {
  return results.some(
    (r) => r.inconclusive && MODULE_FAILED.test(String(r.error ?? ''))
  )
}

/**
 * Results from the async runner, or null when it cannot run here (no runner, or the module
 * imports something).
 */
export async function runTestsAsync(result: {
  code: string
  testRunner?: string
}): Promise<TestResultLike[] | null> {
  if (!result.testRunner || /^\s*import\s/m.test(result.code)) return null
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
  const body = result.code.replace(/^export /gm, '')
  let out: any
  try {
    out = await new AsyncFunction(
      `${testUtils}\n${body}\nreturn await ${result.testRunner}`
    )()
  } catch (e: any) {
    return [
      {
        description: 'module',
        passed: false,
        inconclusive: true,
        error: `Module could not be executed for testing: ${e?.message ?? e}`,
      },
    ]
  }
  const sig = (d: string) => /signature example$/.test(d)
  return [
    ...(out.results ?? []).map((r: any) => ({
      description: r.description,
      passed: !!r.passed,
      error: r.error,
      isSignatureTest: sig(String(r.description)),
    })),
    ...(out.inconclusive ?? []).map((r: any) => ({
      description: r.description,
      passed: false,
      inconclusive: true,
      error: r.error,
      isSignatureTest: sig(String(r.description)),
    })),
  ]
}
