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

describe('tests run for an INDENTED module source (pre-tag review M1)', () => {
  // extractTests stopped trimming (so compile errors name the right line), and the trim had
  // been dedenting an indented first `export`. stripModuleSyntax stripped `export` only at
  // column 0, so the test module failed to build and EVERY test came back inconclusive,
  // silently — the guardrail canary included. Template-literal fixtures are indented.
  it('a failing test in an indented source fails', () => {
    expect(() =>
      tjs(`
  export function inc(count: 0) { return count + 1 }
  test 'fails' { expect(inc(1)).toBe(3) }
`)
    ).toThrow()
  })

  it('the signature canary in an indented source fails', () => {
    expect(() =>
      tjs(`
  export function add(a: 2, b: 3): 0 { return a + b }
`)
    ).toThrow(/signature example is inconsistent/)
  })

  it('a passing test in an indented source passes (not inconclusive)', () => {
    const r = tjs(
      `
  export function inc(count: 0) { return count + 1 }
  test 'passes' { expect(inc(1)).toBe(2) }
`,
      { runTests: 'report' }
    ) as any
    const t = (r.testResults ?? []).find((x: any) => x.description === 'passes')
    expect(t?.passed).toBe(true)
    expect(t?.inconclusive ?? false).toBe(false)
  })

  it('a template line that begins with "export " is data, not syntax (m4)', () => {
    expect(() =>
      tjs(`
const banner = \`a
export b\`
function f(x: 0) { return x }
test 'banner' { expect(banner).toBe('a\\nexport b') }
`)
    ).not.toThrow()
  })
})

describe('blanked regions cost lines, not bytes (pre-tag review m1)', () => {
  // Doc comments and test blocks are blanked to spaces so offsets hold while the source is
  // rewritten; the output used to keep every space (a 3.5KB module emitted ~12KB).
  const docs =
    '/#\n' +
    Array.from({ length: 100 }, (_, i) => `line ${i} of documentation`).join(
      '\n'
    ) +
    '\n#/'
  const body = Array.from(
    { length: 200 },
    (_, i) => `  expect(f(${i})).toBe(${i})`
  ).join('\n')
  const src =
    docs +
    '\nfunction f(x: 0): 0 { return x }\nconst t = `a   \nb`\n' +
    `test 'x' {\n${body}\n}\nconst z = 1\n`
  const r = tjs(src)

  it('no line of the output ends in padding outside a literal', () => {
    const padded = r.code
      .split('\n')
      .filter((l: string) => /[ \t]$/.test(l) && !l.startsWith('const t = `'))
    expect(padded).toEqual([])
    expect(r.code.length).toBeLessThan(5000)
  })

  it('keeps every line, and a template literal keeps its trailing spaces', () => {
    expect(r.code).toContain('const t = `a   \nb`')
    const line = (code: string, needle: string) =>
      code.slice(0, code.indexOf(needle)).split('\n').length
    // The output carries a runtime prelude, so compare DISTANCES from the first statement.
    const span = (code: string) =>
      line(code, 'const z = 1') - line(code, 'const t = `')
    expect(span(r.code)).toBe(span(src))
  })
})
