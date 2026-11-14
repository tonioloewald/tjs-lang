/**
 * How the CLI reports tests that could not run, and keeps emitted output clean (2026-11-14).
 *
 * - `tjs check` reported ✓ for a file whose test could not run (a typo, `okk(2, 3)`, is
 *   inconclusive at build time: it looks exactly like code naming `document`, which only a page
 *   provides, so PRINCIPLES.md keeps it inconclusive rather than failed). Each inconclusive test
 *   is now a warning, counted by `--max-warnings` (#4120).
 * - `tjs emit` counted an inconclusive test as a FAILURE, so it refused a file `check` passed
 *   (#3994 A4.1); it now uses the same passed / inconclusive / failed split as `tjs test`.
 * - `tjs emit file.tjs > out.js` wrote test narration to stdout, into the JavaScript (#2118).
 * - An async function's signature example was reported as PASSED although it never ran
 *   (#3826); it is inconclusive.
 * - `test 'x'` (a one-character name) was reported as `test 1` (#4120).
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tjs } from '../lang/index'

const CLI = join(import.meta.dir, 'tjs.ts')
const roots: string[] = []
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})
const file = (body: string) => {
  const root = mkdtempSync(join(tmpdir(), 'tjs-inconclusive-'))
  roots.push(root)
  const f = join(root, 'x.tjs')
  writeFileSync(f, body)
  return f
}
const cli = (...args: string[]) => {
  const p = Bun.spawnSync(['bun', CLI, ...args])
  return {
    code: p.exitCode,
    out: p.stdout.toString(),
    err: p.stderr.toString(),
  }
}

const TYPO = `function ok(a: 2, b: 3): 5 { return a + b }
test 'typo' { expect(okk(2, 3)).toBe(5) }
`

describe('tjs check', () => {
  it('reports an inconclusive test as a warning', () => {
    const r = cli('check', file(TYPO))
    expect(r.code).toBe(0)
    expect(r.err).toMatch(/'typo':2 could not run: okk is not defined/)
  })
  it('--max-warnings 0 fails on it', () => {
    expect(cli('check', file(TYPO), '--max-warnings', '0').code).toBe(1)
  })
  it('a clean file has no such warning (the other direction)', () => {
    const r = cli(
      'check',
      file(
        `function ok(a: 2, b: 3): 5 { return a + b }\ntest 'fine' { expect(ok(2, 3)).toBe(5) }\n`
      ),
      '--max-warnings',
      '0'
    )
    expect(r.code).toBe(0)
    expect(r.err).not.toMatch(/could not run/)
  })
})

describe('tjs emit', () => {
  it('emits a file whose only problem is an inconclusive test, as check passes it', () => {
    const r = cli('emit', file(TYPO))
    expect(r.code).toBe(0)
    expect(r.err).toMatch(/inconclusive: okk is not defined/)
  })
  it('stdout holds only JavaScript, even when a test fails and --jfdi emits anyway', () => {
    const r = cli(
      'emit',
      file(`function bad(a: 2, b: 3): 0 { return a + b }\n`),
      '--jfdi'
    )
    expect(r.out).not.toMatch(/passed|failed|Signature/)
    expect(r.err).toMatch(/failed/)
    expect(() => new Function(r.out.replace(/^export /gm, ''))).not.toThrow()
  })
  it('still refuses a real failure without --jfdi (the other direction)', () => {
    expect(
      cli('emit', file(`function bad(a: 2, b: 3): 0 { return a + b }\n`)).code
    ).toBe(1)
  })
})

describe('test results', () => {
  it("an async function's signature example is inconclusive, not passed", () => {
    const r = tjs(`async function later(x: 1): 1 { return x }`, {
      runTests: 'report',
    } as any)
    const sig = r.testResults!.find((t: any) => t.isSignatureTest)!
    expect(sig.passed).toBe(false)
    expect(sig.inconclusive).toBe(true)
  })
  it('a one-character test name is kept', () => {
    const r = tjs(
      `test 'x' { expect(1).toBe(1) }\ntest "y" { expect(1).toBe(1) }`,
      { runTests: 'report' } as any
    )
    expect(r.testResults!.map((t: any) => t.description)).toEqual(['x', 'y'])
  })
})
