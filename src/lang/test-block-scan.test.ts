/**
 * A `}` inside a regex, a string or a comment does not end a `test { }` block.
 *
 * This is the sixth instance of the repo's dominant defect class — a source-processing pass
 * mis-reading code that mentions the syntax it scans for — and the notable part is WHERE it
 * survived. `docs.ts:findMatchingBrace` and `parser-transforms.ts:findFunctionBodyEnd` were
 * both migrated to the masked scan in the same release, under a commit message naming the
 * pattern. The third sibling, the one that delimits every inline `test { }` block, was not.
 *
 * Two symptoms, and the second is much worse than the first:
 *
 *   - `test 'x' { const re = /[}]/ … }` makes legal TJS FAIL TO COMPILE, which at least
 *     announces itself.
 *   - a `}` in a comment truncates the body at that point, so the generated runner
 *     executes a fragment and reports **`passed: true` with no assertion run**. A test that
 *     silently stops testing is worse than one that fails, and this path is live in
 *     `docs.ts` and in the playground's module store — the playground RUNS that runner.
 */
import { describe, it, expect } from 'bun:test'
import { extractTests } from './tests'
import { tjs } from './index'

describe('a brace inside a literal does not close a test block', () => {
  it('a regex containing } does not truncate the body', () => {
    const src = [
      "test 'regex' {",
      '  const re = /[}]/',
      "  expect(re.test('}')).toBe(true)",
      '}',
    ].join('\n')
    const { tests } = extractTests(src)
    expect(tests.length).toBe(1)
    expect(tests[0].body).toContain('expect(')
  })

  it('a string containing } does not truncate the body', () => {
    const src = [
      "test 'string' {",
      "  const s = '}'",
      "  expect(s).toBe('}')",
      '}',
    ].join('\n')
    const { tests } = extractTests(src)
    expect(tests[0].body).toContain('expect(')
  })

  it('a COMMENT containing } does not truncate the body', () => {
    // The silent one. Truncated here, the runner ran a fragment with no assertion in it
    // and reported success.
    const src = [
      "test 'comment' {",
      '  // closing brace in prose: }',
      '  expect(1 + 1).toBe(2)',
      '}',
    ].join('\n')
    const { tests } = extractTests(src)
    expect(tests.length).toBe(1)
    expect(
      tests[0].body,
      'the body was truncated at the comment, so the runner would report a pass ' +
        'having executed no assertion'
    ).toContain('expect(1 + 1)')
  })

  it('a template literal containing } does not truncate the body', () => {
    const src = [
      "test 'template' {",
      '  const t = `a } b`',
      "  expect(t).toBe('a } b')",
      '}',
    ].join('\n')
    const { tests } = extractTests(src)
    expect(tests[0].body).toContain('expect(')
  })
})

describe('such a file still compiles and its tests still run', () => {
  const run = (body: string[]) => {
    const src = [
      'function f(n: 0): 0 { return n * 2 }',
      "test 'braces everywhere' {",
      ...body,
      '}',
    ].join('\n')
    const result = tjs(src, { filename: 'tb.tjs', runTests: true })
    return result.testResults?.find(
      (t) => t.description === 'braces everywhere'
    )
  }

  it('transpiles and the test passes', () => {
    expect(
      run([
        '  const re = /[}]/',
        '  // a } in a comment',
        "  const s = '}'",
        '  expect(f(2)).toBe(4)',
        '  expect(re.test(s)).toBe(true)',
      ])?.passed
    ).toBe(true)
  })

  it('a FAILING assertion after the braces is actually reached', () => {
    // The claim that matters, and the only way to prove it without an assertion count: put
    // a deliberately failing expectation AFTER every brace-bearing line. If the body were
    // truncated at the regex or the comment, this test would report `passed: true` — which
    // is precisely the silent failure being guarded. A green run here is the bug.
    // `tjs` THROWS on a transpile-time test failure rather than returning it, so reaching
    // the assertion is observable as the throw carrying its message.
    let message = 'no failure — the assertion was never executed'
    try {
      run([
        '  const re = /[}]/',
        '  // a } in a comment',
        "  const s = '}'",
        '  expect(f(2)).toBe(999)',
      ])
    } catch (e: any) {
      message = String(e.message)
    }
    expect(
      message,
      'the failing assertion was never reached — the body was truncated at a brace ' +
        'inside a literal, and the runner would have reported a pass'
    ).toContain('Expected 999 but got 4')
  })
})
