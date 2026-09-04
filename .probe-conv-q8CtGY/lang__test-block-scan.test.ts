/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { extractTests } from '/Users/tonioloewald/tjs-lang/src/lang/tests'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

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
  const run = (body) => {
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
    let message = 'no failure — the assertion was never executed'
    try {
      run([
        '  const re = /[}]/',
        '  // a } in a comment',
        "  const s = '}'",
        '  expect(f(2)).toBe(999)',
      ])
    } catch (e) {
      message = String(e.message)
    }
    expect(
      message,
      'the failing assertion was never reached — the body was truncated at a brace ' +
        'inside a literal, and the runner would have reported a pass'
    ).toContain('Expected 999 but got 4')
  })
})
