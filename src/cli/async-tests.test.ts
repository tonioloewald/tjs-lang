/**
 * The CLI runs tests that await, and rebuilds `mock` blocks per test (#3828, 2026-11-14).
 *
 * `tjs()` is synchronous, so a module with an `await` in a test could not run at build time:
 * every test was inconclusive, a genuinely failing one hid among them, and `tjs check` passed the
 * file. The CLI now runs such a module with the page's async runner. `mock { }` state was shared
 * across tests on the command line and rebuilt per test on the page; per test now, everywhere.
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, 'tjs.ts')
const roots: string[] = []
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})
const file = (body: string) => {
  const root = mkdtempSync(join(tmpdir(), 'tjs-async-tests-'))
  roots.push(root)
  const f = join(root, 'x.tjs')
  writeFileSync(f, body)
  return f
}
const cli = (...a: string[]) => {
  const p = Bun.spawnSync(['bun', CLI, ...a])
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() }
}

const AWAITS = `async function later(x: 1):! 0 { return x * 2 }
test 'awaits' { const v = await later(2)
 expect(v).toBe(4) }
`

describe('a test that awaits', () => {
  it('runs and passes under tjs test and tjs check', () => {
    const f = file(AWAITS)
    const t = cli('test', f)
    expect(t.code).toBe(0)
    expect(t.out).toMatch(/✓ 'awaits'/)
    expect(cli('check', f, '--max-warnings', '0').code).toBe(0)
  })
  it('no longer hides a failing test in the same file', () => {
    const f = file(
      AWAITS +
        `function bad(a: 2, b: 3):! 0 { return a + b }\ntest 'wrong' { expect(bad(2, 3)).toBe(6) }\n`
    )
    expect(cli('test', f).code).toBe(1)
    const c = cli('check', f)
    expect(c.code).toBe(1)
    expect(c.out).toMatch(/'wrong'.*Expected 6 but got 5/)
  })
})

it('mock state is rebuilt for each test', () => {
  const t = cli(
    'test',
    file(
      `mock { let n = 0 }\ntest 'first' { n++\n expect(n).toBe(1) }\ntest 'second' { n++\n expect(n).toBe(1) }\n`
    )
  )
  expect(t.code).toBe(0)
  expect(t.out).toMatch(/2 passed, 0 failed/)
})
