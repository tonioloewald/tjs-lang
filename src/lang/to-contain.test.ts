/**
 * `expect(…).toContain(…)` — substring for strings, membership for arrays.
 *
 * It used to be array-only. The guard read `!Array.isArray(actual) || …`, so a string could
 * never pass however obviously it contained the argument — and the failure was reported as
 * `Expected "<source>:17:sized.opts.x" to contain "opts.x"`, a CONTENT message for what was
 * actually a TYPE refusal. Every comparable harness (bun:test, jest) does substring, so the
 * spelling that works everywhere else failed here, and said the wrong thing about why.
 *
 * Found by writing a documentation example, not by a test: `dictionary-defaults.md` asserts
 * that a member-validation error names its path. That is the argument for examples being
 * executed rather than illustrative — this matcher had been in the harness for months.
 *
 * The behaviour runs through the real transpile-and-run path rather than against the matcher
 * in isolation, because the harness is generated as SOURCE into the emitted output
 * (`tests.ts` builds it as a string). Testing the string's meaning requires running it.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'

/** Transpile with inline tests and report what passed and failed. */
function runTests(body: string): {
  passed: string[]
  failed: string[]
  errors: string[]
} {
  const result = tjs(body, { filename: 'a.tjs', runTests: 'report' }) as any
  const all = (result.testResults ?? []).filter((t: any) => !t.isSignatureTest)
  return {
    passed: all.filter((t: any) => t.passed).map((t: any) => t.description),
    failed: all.filter((t: any) => !t.passed).map((t: any) => t.description),
    errors: all.filter((t: any) => !t.passed).map((t: any) => String(t.error)),
  }
}

describe('toContain on strings', () => {
  it('passes on a substring — the case that could never pass before', () => {
    const { passed, failed } = runTests(`
      test 'substring' {
        expect('a.tjs:17:sized.opts.x').toContain('opts.x')
      }
    `)
    expect({ passed, failed }).toEqual({ passed: ['substring'], failed: [] })
  })

  it('fails when the substring is genuinely absent', () => {
    // The control. Without it, a matcher that passes unconditionally satisfies the test
    // above — which is the shape of the bug being fixed, in the opposite direction.
    const { failed } = runTests(`
      test 'absent' {
        expect('hello world').toContain('goodbye')
      }
    `)
    expect(failed).toEqual(['absent'])
  })

  it('fails on a non-string needle rather than coercing', () => {
    const { failed } = runTests(`
      test 'needle type' {
        expect('12345').toContain(234)
      }
    `)
    expect(failed).toEqual(['needle type'])
  })

  it('and SAYS it is a type refusal, not a content one', () => {
    // The mirror of the defect this file exists for. The string branch reported
    // `Expected "12345" to contain 234` — a comparison that never happened — for a needle it
    // refused on TYPE. The haystack case names the type; the needle case must too.
    const { errors } = runTests(`
      test 'needle type' {
        expect('12345').toContain(234)
      }
    `)
    expect(errors[0]).toMatch(/number/)
    expect(errors[0]).not.toMatch(/^Expected "12345" to contain 234$/)
  })
})

describe('toContain on arrays still works', () => {
  it('finds a member, including by deep equality', () => {
    const { passed, failed } = runTests(`
      test 'primitive member' {
        expect([1, 2, 3]).toContain(2)
      }
      test 'deep member' {
        expect([{ a: 1 }, { b: 2 }]).toContain({ b: 2 })
      }
    `)
    expect({ passed: passed.sort(), failed }).toEqual({
      passed: ['deep member', 'primitive member'],
      failed: [],
    })
  })

  it('fails when the member is absent', () => {
    const { failed } = runTests(`
      test 'no member' {
        expect([1, 2, 3]).toContain(9)
      }
    `)
    expect(failed).toEqual(['no member'])
  })
})

describe('the diagnostic distinguishes a type refusal from a content miss', () => {
  it('a number haystack says what toContain accepts', () => {
    // Errors-as-curriculum: "Expected 42 to contain 4" would describe a content comparison
    // that never happened. The whole reason this defect was confusing is that it did exactly
    // that for strings.
    const result = tjs(`test 'wrong haystack' { expect(42).toContain(4) }`, {
      filename: 'a.tjs',
      runTests: 'report',
    }) as any
    const failure = (result.testResults ?? []).find(
      (t: any) => t.description === 'wrong haystack'
    )
    expect(failure?.passed).toBe(false)
    expect(String(failure?.error)).toContain('toContain expects')
  })
})
