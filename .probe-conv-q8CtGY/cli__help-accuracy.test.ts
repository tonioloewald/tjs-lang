/* tjs <- input.ts */

import { describe, it, expect, afterAll } from 'bun:test'

import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'

import { tmpdir } from 'os'

import { join } from 'path'

import pkg from '/Users/tonioloewald/tjs-lang/package.json'

const SOURCE = readFileSync(
  join('/Users/tonioloewald/tjs-lang/src/cli', 'tjs.ts'),
  'utf8'
)
export {}

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
      [
        'bun',
        join('/Users/tonioloewald/tjs-lang/src/cli', 'tjs.ts'),
        '--version',
      ],
      { stdout: 'pipe', stderr: 'ignore' }
    )
    const out = await new Response(proc.stdout).text()
    expect(out.trim()).toBe(`tjs v${pkg.version}`)
  })
})
export {}

describe('every flag the CLI parses is documented', () => {
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
    const testLine = HELP.slice(
      HELP.indexOf('  test '),
      HELP.indexOf('  convert ')
    )
    expect(testLine).toMatch(/inline|test \{ \}/)
  })
})

describe('--max-warnings', () => {
  const CLI = join('/Users/tonioloewald/tjs-lang/src/cli', 'tjs.ts')
  const tmp = join(process.env.TMPDIR ?? '/tmp', `tjs-maxwarn-${process.pid}`)
  const run = async (file, ...flags) => {
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

  Bun.write(warns, 'function warn(x: NotAType): 0 { return 0 }\n')
  it('a clean file passes at zero', async () => {
    expect((await run(clean, '--max-warnings', '0')).code).toBe(0)
  })
  it('a warning trips the gate at zero', async () => {
    expect((await run(warns, '--max-warnings', '0')).code).toBe(1)
  })
  it('the same warning passes under a higher ceiling', async () => {
    expect((await run(warns, '--max-warnings', '5')).code).toBe(0)
  })
  it('warnings alone do not fail the build without the flag', async () => {
    expect((await run(warns)).code).toBe(0)
  })
  it('a MISSING value is rejected as a usage error, not a build failure', async () => {
    const r = await run(clean, '--max-warnings')
    expect(r.code).toBe(2)
    expect(r.text).toContain('non-negative number')
    expect(r.text).not.toContain('NaN')
  })
  it('a non-numeric value is rejected the same way', async () => {
    const r = await run(clean, '--max-warnings', 'abc')
    expect(r.code).toBe(2)
    expect(r.text).toContain("'abc'")
  })
})
export {}

describe('printed invocations are runnable', () => {
  const CLI = join('/Users/tonioloewald/tjs-lang/src/cli', 'tjs.ts')
  const dir = mkdtempSync(join(tmpdir(), 'tjs-help-'))
  const spawn = async (args) => {
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

    expect(r.text).toContain('b.tjs')
  })
  it('the invocation the --max-warnings error recommends actually runs', async () => {
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

    expect(text).toContain('.tjs')
    expect(text.toLowerCase()).toContain('no ')
    rmSync(empty, { recursive: true, force: true })
  })
  it('a parse failure anywhere in the tree fails the run', async () => {
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
export {}
