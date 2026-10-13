/**
 * The site's `tjs` dialect returns the runner that gives inline tests TJS semantics.
 *
 * tosijs-ui runs `code + testUtils + 'return ' + testRunner` (component.ts,
 * inlineTjsTestBody). Our dialect returned only `code`, so tosijs-ui fell back to the RAW
 * test bodies, and the book's `expect('42' == 42).toBe(false)` failed on the site.
 */
import { describe, it, expect } from 'bun:test'
import { tjsDialect } from './tjs-dialect'
import { testUtils } from '../src/lang/tests'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

async function runLikeTosijsUi(source: string) {
  const whole = tjsDialect.transform(source)
  expect(typeof whole.testRunner).toBe('string')
  const preview = { append() {} }
  return new AsyncFunction(
    'preview',
    `${whole.code}\n${testUtils}\nreturn ${whole.testRunner}`
  )(preview)
}

describe("the site's tjs dialect gives inline tests TJS semantics", () => {
  it("'42' == 42 is false inside a test (the book's values-and-names example)", async () => {
    const result = await runLikeTosijsUi(`const answer = 42
const guess = 40 + 2
preview.append(\`Is the guess right? \${guess == answer}\`)

test 'comparing values' {
  expect(guess == answer).toBe(true)
  expect('42' == 42).toBe(false)
}`)
    expect(result.failed).toBe(0)
    expect(result.passed).toBe(1)
  })

  it('a module example still has its `export` stripped', () => {
    expect(tjsDialect.transform('export const x = 1').code).not.toMatch(
      /\bexport\b/
    )
  })
})
