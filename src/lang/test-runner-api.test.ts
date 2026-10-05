/**
 * `tjs(source).testRunner` runs the inline tests with TJS semantics, the way `tjs test` does.
 *
 * tosijs-ui's live examples run an example's inline tests as
 * `stripModuleSyntax(code) + testUtils + 'return ' + testRunner`. The runner used to be built
 * from the RAW test bodies, before `js.ts` rewrote them (TJS `==`, bool coercion) and before
 * `runAllTests` rewrote extension calls, so on the doc site passing tests were shown FAILING:
 * `"hello world".capitalize is not a function` (local-extensions),
 * `Boolean(new Boolean(false)) is false — Expected false but got true` (js-footgun-fixes).
 */
import { describe, it, expect } from 'bun:test'
import { tjs, stripModuleSyntax } from './index'
import { testUtils } from './tests'
import { installRuntime } from './runtime'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

/** Run a transpile result's inline tests exactly as tosijs-ui does. */
async function runLikeTosijsUi(source: string) {
  const r = tjs(source, { dialect: 'tjs', runTests: false })
  const body = `${stripModuleSyntax(r.code)}\n${testUtils}\nreturn ${
    r.testRunner
  }`
  return (await new AsyncFunction(body)()) as {
    passed: number
    failed: number
    results: { description: string; passed: boolean; error?: string }[]
  }
}

describe('tjs().testRunner runs tests with TJS semantics', () => {
  it('extension calls inside a test body are rewritten (local-extensions)', async () => {
    const out = await runLikeTosijsUi(`
extend String {
  shout() { return this.toUpperCase() + '!' }
}
test 'extension method' {
  expect('hi'.shout()).toBe('HI!')
}`)
    expect(out.results).toEqual([
      { description: 'extension method', passed: true },
    ])
  })

  it('TJS == and boxed-primitive truthiness hold inside a test body (js-footgun-fixes)', async () => {
    const saved = (globalThis as any).__tjs
    installRuntime()
    try {
      const out = await runLikeTosijsUi(`
function id(x: 0) { return x }
test 'footguns are fixed in tests too' {
  expect('5' == 5).toBe(false)
  expect(null == undefined).toBe(true)
  expect(Boolean(new Boolean(false))).toBe(false)
}`)
      expect(out.results).toEqual([
        { description: 'footguns are fixed in tests too', passed: true },
      ])
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  })

  it('works with NO runtime installed (falls back to the module’s own inline runtime)', async () => {
    const saved = (globalThis as any).__tjs
    delete (globalThis as any).__tjs
    try {
      const out = await runLikeTosijsUi(`
function id(x: 0) { return x }
test 'equality without a global runtime' {
  expect('5' == 5).toBe(false)
}`)
      expect(out.failed).toBe(0)
    } finally {
      ;(globalThis as any).__tjs = saved
    }
  })
})
