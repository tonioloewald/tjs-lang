/**
 * `--help` describes the CLI that exists, and `--version` reports this package.
 *
 * Both had drifted, in the way documentation always drifts — silently, and in the output
 * users quote back in bug reports:
 *
 *   - `VERSION` was hard-coded `'0.6.45'` in a 0.13.0 package. Seven minor versions of
 *     wrong, and `bin/dev.ts` had been reading `pkg.version` correctly the whole time.
 *   - `--max-warnings`, the release's flagship CI ergonomic, appeared in no help text and
 *     no document except one CHANGELOG line.
 *
 * A flag nobody can discover is a flag nobody uses, and a version string nobody can trust
 * makes every bug report name the wrong release. Neither is caught by a test that only
 * exercises behaviour, so this file reads the help text itself.
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import pkg from '../../package.json'

const SOURCE = readFileSync(join(import.meta.dir, 'tjs.ts'), 'utf8')
const HELP = SOURCE.slice(
  SOURCE.indexOf('const HELP = `') + 'const HELP = `'.length,
  SOURCE.indexOf(
    '`',
    SOURCE.indexOf('const HELP = `') + 'const HELP = `'.length
  )
)

describe('the version is the package version', () => {
  it('is not hard-coded', () => {
    expect(SOURCE).toContain('pkg.version')
    expect(
      /const VERSION = '[\d.]+'/.test(SOURCE),
      'a literal version string drifts — read it from package.json'
    ).toBe(false)
  })

  it('matches package.json', async () => {
    const proc = Bun.spawn(
      ['bun', join(import.meta.dir, 'tjs.ts'), '--version'],
      { stdout: 'pipe', stderr: 'ignore' }
    )
    const out = await new Response(proc.stdout).text()
    expect(out.trim()).toBe(`tjs v${pkg.version}`)
  })
})

describe('every flag the CLI parses is documented', () => {
  // Read the flags the argument parser actually looks for, and require each to appear in
  // the help text. Derived rather than listed, so a new flag cannot be added without
  // either documenting it or failing here.
  // Scoped to flags THIS file's argument parser recognises. `src/cli/commands/test.ts`
  // also mentions `--preload`/`--coverage`/`--bail`/`--timeout`, but those are arguments
  // it PASSES to `bun test`, not flags it accepts from the user.
  const parsed = [
    ...new Set(
      [
        ...SOURCE.matchAll(
          /(?:a === |args\.includes\(|args\[i - 1\] === )'(--[a-z-]+)'/g
        ),
      ].map((m) => m[1])
    ),
  ]

  it('found flags to check — apparatus', () => {
    expect(parsed.length).toBeGreaterThan(5)
    expect(parsed).toContain('--max-warnings')
  })

  for (const flag of parsed) {
    it(`${flag} appears in --help`, () => {
      expect(HELP).toContain(flag)
    })
  }
})

describe('the help text describes what commands actually do', () => {
  it('mentions that `test` runs inline test blocks, not only .test.tjs files', () => {
    // `tjs test <file.tjs>` gained inline-test running in this release while the help
    // still said "Run .test.tjs test files".
    const testLine = HELP.slice(
      HELP.indexOf('  test '),
      HELP.indexOf('  convert ')
    )
    expect(testLine).toMatch(/inline|test \{ \}/)
  })
})

/**
 * `--max-warnings` behaves, and a fumbled argument does not fail the build.
 *
 * The release's flagship CI ergonomic had NO behavioural test, and `Number(undefined)` is
 * `NaN` while `0 > NaN` is `false` — so a bare `--max-warnings`, or a typo'd value,
 * printed `0 warnings exceeds --max-warnings NaN` and exited 1 on a CLEAN file.
 *
 * A CI flag that fails the build when you fumble its argument is worse than no flag: the
 * failure looks like the codebase rather than the invocation, and the message names a
 * value nobody typed.
 */
describe('--max-warnings', () => {
  const CLI = join(import.meta.dir, 'tjs.ts')
  const tmp = join(process.env.TMPDIR ?? '/tmp', `tjs-maxwarn-${process.pid}`)

  const run = async (file: string, ...flags: string[]) => {
    const proc = Bun.spawn(['bun', CLI, 'check', file, ...flags], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    return { code: await proc.exited, text: out + err }
  }

  const clean = `${tmp}-clean.tjs`
  const warns = `${tmp}-warns.tjs`
  Bun.write(clean, 'function ok(n: 0): 0 { return n * 2 }\n')
  // An unresolvable annotation degrades to unchecked WITH a warning — the exact thing the
  // flag exists to gate on.
  Bun.write(warns, 'function warn(x: NotAType): 0 { return 0 }\n')

  it('a clean file passes at zero', async () => {
    expect((await run(clean, '--max-warnings', '0')).code).toBe(0)
  })

  it('a warning trips the gate at zero', async () => {
    expect((await run(warns, '--max-warnings', '0')).code).toBe(1)
  })

  it('the same warning passes under a higher ceiling', async () => {
    // The control: exiting 1 unconditionally would satisfy the test above.
    expect((await run(warns, '--max-warnings', '5')).code).toBe(0)
  })

  it('warnings alone do not fail the build without the flag', async () => {
    expect((await run(warns)).code).toBe(0)
  })

  it('a MISSING value is rejected as a usage error, not a build failure', async () => {
    const r = await run(clean, '--max-warnings')
    expect(r.code).toBe(2) // usage error, distinct from 1 = the check failed
    expect(r.text).toContain('non-negative number')
    expect(r.text).not.toContain('NaN')
  })

  it('a non-numeric value is rejected the same way', async () => {
    const r = await run(clean, '--max-warnings', 'abc')
    expect(r.code).toBe(2)
    expect(r.text).toContain("'abc'")
  })
})

/**
 * Every invocation the CLI PRINTS actually runs.
 *
 * `--max-warnings`'s own error text recommends `tjs check src/ --max-warnings 0`, and
 * `check` was the only command that could not take a directory — so following the
 * diagnostic produced a raw `EISDIR: illegal operation on a directory, read`. A tool whose
 * diagnostic recommends an invocation it rejects sends the reader looking for their own
 * mistake.
 *
 * Help text is a claim like any other. This harvests the example invocations out of
 * `--help` and the `--max-warnings` message and RUNS them, which is the only way that
 * class of drift gets caught — the previous tests here asserted on wording.
 */
describe('printed invocations are runnable', () => {
  const CLI = join(import.meta.dir, 'tjs.ts')
  const dir = mkdtempSync(join(tmpdir(), 'tjs-help-'))
  const spawn = async (args: string[]) => {
    const proc = Bun.spawn(['bun', CLI, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: dir,
    })
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    return { code: await proc.exited, text: out + err }
  }

  it('`check` accepts a directory', async () => {
    writeFileSync(join(dir, 'a.tjs'), `function a(n: 0) { return n }\n`)
    mkdirSync(join(dir, 'sub'), { recursive: true })
    writeFileSync(join(dir, 'sub', 'b.tjs'), `function b(n: 0) { return n }\n`)
    const r = await spawn(['check', '.'])
    expect(r.code).toBe(0)
    // Recursive, like every sibling walker.
    expect(r.text).toContain('b.tjs')
  })

  it('the invocation the --max-warnings error recommends actually runs', async () => {
    // Not "does it mention a directory" — does it WORK.
    const r = await spawn(['check', '.', '--max-warnings', '99'])
    expect(r.text).not.toContain('EISDIR')
    expect(r.code).toBe(0)
  })

  it('a directory with no source files is a clear error, not a crash', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'tjs-help-empty-'))
    const proc = Bun.spawn(['bun', CLI, 'check', empty], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const text = await new Response(proc.stderr).text()
    expect(await proc.exited).toBe(1)
    // Assert on the SUBSTANCE, not the wording: it must name what it wanted. "No source
    // files found" was true and useless — it reads like the path is wrong.
    expect(text).toContain('.tjs')
    expect(text.toLowerCase()).toContain('no ')
    rmSync(empty, { recursive: true, force: true })
  })

  it('a parse failure anywhere in the tree fails the run', async () => {
    // The control: walking a directory must not turn a hard error into a summary nobody
    // reads. One bad file, non-zero exit.
    const bad = mkdtempSync(join(tmpdir(), 'tjs-help-bad-'))
    writeFileSync(join(bad, 'ok.tjs'), `function a(n: 0) { return n }\n`)
    writeFileSync(join(bad, 'bad.tjs'), `function ( { \n`)
    const proc = Bun.spawn(['bun', CLI, 'check', bad], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    await new Response(proc.stdout).text()
    await new Response(proc.stderr).text()
    expect(await proc.exited).toBe(1)
    rmSync(bad, { recursive: true, force: true })
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))
})
