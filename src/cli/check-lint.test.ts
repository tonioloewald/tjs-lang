/**
 * `tjs check` runs the linter, and TjsStrict makes two of its rules errors (2026-11-14).
 *
 * The linter (unused variables, unreachable code, safe-assign, misspelled dictionary-default keys)
 * existed and nothing in the CLI called it, so `tjs check` passed a call with a misspelled option.
 * Now its findings are warnings on native .tjs files (counted by --max-warnings), and under
 * `TjsStrict` safe-assign and excess dictionary keys are errors that fail the check. Plain .js
 * keeps JavaScript's rules.
 *
 * Also pinned here: a directive line (`TjsStrict`, `safety …`) no longer shifts every later line
 * number. The directive's whitespace was spliced out newlines and all.
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
const file = (name: string, body: string) => {
  const root = mkdtempSync(join(tmpdir(), 'tjs-check-lint-'))
  roots.push(root)
  const f = join(root, name)
  writeFileSync(f, body)
  return f
}
const check = (f: string, ...args: string[]) => {
  const p = Bun.spawnSync(['bun', CLI, 'check', f, ...args])
  return { code: p.exitCode, err: p.stderr.toString() }
}

const TYPO = `function connect(url: '', opts = { retries: 3 }) { return url + opts.retries }
connect('https://a.dev', { retryz: 9 })
`

describe('tjs check runs the linter', () => {
  it('a misspelled dictionary key is a warning', () => {
    const r = check(file('a.tjs', TYPO))
    expect(r.code).toBe(0)
    expect(r.err).toMatch(/'retryz' is not a member .*dict-default-excess-key/)
  })
  it('under TjsStrict it is an error, with the right line', () => {
    const r = check(file('b.tjs', `TjsStrict\n${TYPO}`))
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/line 3: 'retryz'/)
  })
  it('plain .js is not linted (JavaScript keeps its rules)', () => {
    const r = check(
      file(
        'c.js',
        `function f(opts) { return opts }\nf({ a: 1 })\nconst unused = 1\n`
      )
    )
    expect(r.err).not.toMatch(/no-unused-vars/)
  })
})

it('a directive line does not shift later line numbers', () => {
  const src = `TjsStrict\n\nfunction f(x: 0) { return x }\n`
  const code = tjs(src, { filename: 'ln.tjs' }).code
  expect(code).toContain("'ln.tjs:3:f.x'")
})
