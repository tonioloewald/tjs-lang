/**
 * `tjs().testRunner` carries signature examples (#3375).
 *
 * A return example (`greet(name: 'Ada'): 'Hello, Ada!'`) is a test TJS runs at build time.
 * The runner `tjs()` returns, which hosts such as tosijs-ui run for live examples, carried
 * only `test` blocks, so on a live page a wrong example was never reported. These rows run
 * the runner exactly as a host does: `code + testUtils + 'return ' + testRunner`.
 *
 * PRINCIPLES.md: an example that cannot be EVALUATED (its call throws, e.g. it reaches an
 * atom that does not exist here) is inconclusive, never a failure. Hosts count every entry
 * in `results` with `passed: false` as a failure, so an inconclusive example is reported in
 * a separate `inconclusive` list instead.
 */
import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { testUtils } from './tests'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

async function runLikeAHost(source: string) {
  const r = tjs(source, { runTests: false })
  expect(typeof r.testRunner).toBe('string')
  return new AsyncFunction(`${r.code}\n${testUtils}\nreturn ${r.testRunner}`)()
}

describe('the runner tjs() returns checks signature examples', () => {
  it('a module whose only test is a signature example gets a runner', async () => {
    const out = await runLikeAHost(
      `function greet(name: 'Ada'): 'Hello, Ada!' { return \`Hello, \${name}!\` }`
    )
    expect(out.failed).toBe(0)
    expect(out.results).toEqual([
      { description: 'greet signature example', passed: true },
    ])
  })

  it('a wrong example fails, saying what the function returned', async () => {
    const out = await runLikeAHost(
      `function greet(name: 'Ada'): 'Hi, Ada!' { return \`Hello, \${name}!\` }`
    )
    expect(out.failed).toBe(1)
    expect(out.results[0].error).toContain('Hello, Ada!')
  })

  it('test blocks and signature examples run together', async () => {
    const out = await runLikeAHost(`function double(n: 21): 42 { return n * 2 }
test 'double doubles' {
  expect(double(1)).toBe(2)
}`)
    expect(out.passed).toBe(2)
    expect(out.results.map((r: any) => r.description)).toEqual([
      'double doubles',
      'double signature example',
    ])
  })

  it('an example that cannot run is inconclusive, not a failure', async () => {
    const out = await runLikeAHost(
      `function fetchIt(url: 'x'): 'y' { return notAnAtomHere(url) }`
    )
    expect(out.failed).toBe(0)
    expect(out.results).toEqual([])
    expect(out.inconclusive.map((r: any) => r.description)).toEqual([
      'fetchIt signature example',
    ])
  })

  it('an async example is not checked, as at build time (page and build agree)', async () => {
    const out = await runLikeAHost(
      `async function later(n: 1): 99 { return n + 1 }`
    )
    expect(out.failed).toBe(0)
    expect(out.inconclusive.map((r: any) => r.description)).toEqual([
      'later signature example',
    ])
  })

  it('`:!` (type only) adds no example', async () => {
    const r = tjs(`function f(n: 1):! 0 { return n }`, { runTests: false })
    expect(r.testRunner).toBeUndefined()
  })
})

/**
 * DIFFERENTIAL: the page and the build agree on every signature example in the docs.
 *
 * The build compares with its own deep equality in `runAllTests`; the runner uses the shared
 * `expect().toEqual`. Two comparisons are two chances to disagree, and a disagreement means a
 * live page shows a failure the build does not (or the reverse). Its first run found exactly
 * that, for async functions, which the build skips.
 */
describe('signature examples: page and build agree across the docs', () => {
  const g = globalThis as any

  it('every example gets the same verdict from the runner as from the build', async () => {
    const { readFileSync, globSync } = await import('fs')
    const { join } = await import('path')
    const ROOT = join(import.meta.dir, '..', '..')
    const files = globSync('**/*.md', { cwd: ROOT }).filter(
      (f: string) =>
        !f.includes('node_modules') &&
        !f.startsWith('.') &&
        !f.startsWith('docs/reviews') &&
        f !== 'CHANGELOG.md'
    )
    const prevPreview = g.preview
    const prevLog = console.log
    g.preview = { append() {}, replaceChildren() {}, textContent: '' }
    console.log = () => {}
    let compared = 0
    const disagree: string[] = []
    try {
      for (const f of files) {
        const text = readFileSync(join(ROOT, f), 'utf8')
        for (const m of text.matchAll(/```tjs[^\n]*\n([\s\S]*?)```/g)) {
          let r: any
          try {
            r = tjs(m[1], { runTests: 'report' } as any)
          } catch {
            continue
          }
          const build = (r.testResults ?? []).filter(
            (t: any) => t.isSignatureTest && !t.inconclusive
          )
          if (!build.length || !r.testRunner) continue
          let out: any
          try {
            out = await new AsyncFunction(
              `${r.code}\n${testUtils}\nreturn ${r.testRunner}`
            )()
          } catch {
            continue
          }
          for (const b of build) {
            const onPage = out.results.find(
              (x: any) => x.description === b.description
            )
            // The build reports an async example as passed (skipped); the page lists it as
            // inconclusive. Both mean "not checked", which is agreement.
            const page = onPage ? onPage.passed : 'not checked'
            const builds =
              page === 'not checked' && b.passed ? 'not checked' : b.passed
            compared++
            if (page !== builds)
              disagree.push(
                `${f}: ${b.description} build=${b.passed} page=${page}`
              )
          }
        }
      }
    } finally {
      g.preview = prevPreview
      console.log = prevLog
    }
    expect(compared).toBeGreaterThan(20) // apparatus: the corpus has signature examples
    expect(disagree).toEqual([])
  })
})

/**
 * The build and the runner run signature examples under the SAME condition (#3412): native
 * TJS. Under `dialect: 'js'` the build failed the transpile on a return example while the
 * runner never ran it; a return annotation is a worked example only in native TJS.
 */
describe('signature examples: build and runner agree on the dialect', () => {
  const WRONG = 'function add(a: 2, b: 3): 0 { return a + b }'
  const RIGHT = 'function add(a: 2, b: 3): 5 { return a + b }'

  it("dialect 'js' runs neither: no failed transpile, no runner", () => {
    const r = tjs(WRONG, { dialect: 'js' })
    expect(r.testRunner).toBeUndefined()
    expect(r.testResults ?? []).toEqual([])
  })

  it('native TJS runs both: the build refuses a wrong example', () => {
    expect(() => tjs(WRONG)).toThrow(/signature example is inconsistent/)
  })

  it('native TJS runs both: a right example passes at build and is in the runner', async () => {
    const r = tjs(RIGHT)
    expect((r.testResults ?? []).every((t: any) => t.passed)).toBe(true)
    const out = await runLikeAHost(RIGHT)
    expect(out.failed).toBe(0)
    expect(out.passed).toBeGreaterThan(0)
  })
})
