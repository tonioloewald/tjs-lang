/**
 * `tjs test <file>` must actually test the file it was given.
 *
 * It did not. The command was built entirely around `.test.tjs` wrapper files, so any other
 * path fell into an `else` branch that discarded it and reinterpreted it as a bun-test
 * filter pattern — printing "No .test.tjs files found" and exiting **0**. A real file with a
 * failing inline test and a path that did not exist produced byte-identical output and the
 * same success exit code.
 *
 * That is the vacuous-success class: a command that reports "fine" while doing nothing.
 * It matters more here than most, because `tjs test` is the command a CI job runs and the
 * first one a reader following the docs types — and because the whole premise of the
 * language is that the tests live in the source.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

const REPO_ROOT = resolve(import.meta.dir, '../../..')
const BUN = process.execPath

let tmpDir: string
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'tjs-test-cmd-'))
})
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

async function runTjsTest(arg: string) {
  const proc = Bun.spawn([BUN, 'src/cli/tjs.ts', 'test', arg], {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { out: stdout + stderr, code: await proc.exited }
}

describe('tjs test <file> runs that file’s inline tests', () => {
  it('reports a failing inline test and exits non-zero', async () => {
    const file = join(tmpDir, 'failing.tjs')
    writeFileSync(
      file,
      `function greeting(who: 'world'): 'hello world' { return \`hello \${who}\` }\n` +
        `test 'passes' { expect(greeting('alice')).toBe('hello alice') }\n` +
        `test 'fails' { expect(greeting('bob')).toBe('goodbye bob') }\n`
    )

    const { out, code } = await runTjsTest(file)

    expect(out).toContain('fails')
    expect(out).toContain('1 failed')
    // The exit code is the part CI reads, and the part that was wrong.
    expect(code).not.toBe(0)
  })

  it('passes a file whose inline tests all pass', async () => {
    const file = join(tmpDir, 'passing.tjs')
    writeFileSync(
      file,
      `function add(a: 2, b: 3): 5 { return a + b }\n` +
        `test 'adds' { expect(add(1, 1)).toBe(2) }\n`
    )

    const { out, code } = await runTjsTest(file)

    expect(out).toContain('2 passed')
    expect(out).toContain('0 failed')
    expect(code).toBe(0)
  })

  it('fails on a path that does not exist', async () => {
    // Previously indistinguishable from success — same message, same exit 0, as a real
    // file whose tests failed.
    const { out, code } = await runTjsTest(join(tmpDir, 'no-such-file.tjs'))

    expect(out).toContain('No such file')
    expect(code).not.toBe(0)
  })

  it('fails rather than silently passing when a directory has no test files', async () => {
    const empty = join(tmpDir, 'empty-dir')
    require('fs').mkdirSync(empty, { recursive: true })

    const { out, code } = await runTjsTest(empty)

    expect(out).toContain('No .test.tjs files found')
    // A mis-pathed directory in CI would otherwise pass forever while running nothing.
    expect(code).not.toBe(0)
  })
})
