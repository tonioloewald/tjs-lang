import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { fromTS } from '../../lang/emitters/from-ts'
import { tjs } from '../../lang'

const REPO_ROOT = resolve(import.meta.dir, '../../..')
const BUN = process.execPath

const TS_SIMPLE = `
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
`

const TS_WITH_TESTS = `
function add(a: number, b: number): number {
  return a + b
}

/*test 'add works' {
  expect(add(2, 3)).toBe(5)
}*/

/*test 'add negative' {
  expect(add(-1, 1)).toBe(0)
}*/
`

const TS_WITH_FAILING_TEST = `
function broken(): number {
  return 42
}

/*test 'this fails' {
  expect(broken()).toBe(99)
}*/
`

describe('tjs convert - TS to JS pipeline', () => {
  describe('default mode (TS → JS)', () => {
    it('produces JavaScript with __tjs metadata', () => {
      const tjsResult = fromTS(TS_SIMPLE, { emitTJS: true })
      const jsResult = tjs(tjsResult.code, { runTests: 'report' })

      expect(jsResult.code).toContain('function greet')
      expect(jsResult.code).toContain('__tjs')
      // TS-originated code (/* tjs <- */) gets safety 'none', so no validation
      expect(jsResult.code).toContain('"unsafe": true')
    })

    it('TS-originated code skips runtime validation (safety none)', () => {
      const tjsResult = fromTS(TS_SIMPLE, { emitTJS: true })
      const jsResult = tjs(tjsResult.code, { runTests: 'report' })

      // TS-originated code (/* tjs <- */) gets safety 'none', no type checks
      expect(jsResult.code).not.toContain("typeof name !== 'string'")
      expect(jsResult.code).not.toContain('typeError')
      expect(jsResult.code).toContain('"unsafe": true')
    })

    it('includes type metadata on functions', () => {
      const tjsResult = fromTS(TS_SIMPLE, { emitTJS: true })
      const jsResult = tjs(tjsResult.code, { runTests: 'report' })

      // Should have __tjs metadata attached
      expect(jsResult.code).toContain('greet.__tjs')
      expect(jsResult.code).toContain('"kind": "string"')
    })

    it('runs inline tests and reports results', () => {
      const tjsResult = fromTS(TS_WITH_TESTS, { emitTJS: true })
      const jsResult = tjs(tjsResult.code, { runTests: 'report' })

      expect(jsResult.testResults).toBeDefined()
      expect(jsResult.testResults!.length).toBeGreaterThanOrEqual(2)

      const userTests = jsResult.testResults!.filter((r) => !r.isSignatureTest)
      const passed = userTests.filter((r) => r.passed)
      expect(passed.length).toBe(2)
    })

    it('reports failing tests without throwing', () => {
      const tjsResult = fromTS(TS_WITH_FAILING_TEST, { emitTJS: true })
      const jsResult = tjs(tjsResult.code, { runTests: 'report' })

      expect(jsResult.testResults).toBeDefined()
      const userTests = jsResult.testResults!.filter((r) => !r.isSignatureTest)
      const failures = userTests.filter((r) => !r.passed)
      expect(failures.length).toBe(1)
      expect(failures[0].description).toBe('this fails')
    })

    it('handles multiple functions', () => {
      const ts = `
function getName(): string { return 'Alice' }
function getAge(): number { return 30 }
`
      const tjsResult = fromTS(ts, { emitTJS: true })
      const jsResult = tjs(tjsResult.code, { runTests: 'report' })

      expect(jsResult.code).toContain('getName.__tjs')
      expect(jsResult.code).toContain('getAge.__tjs')
    })
  })

  describe('--emit-tjs mode (TS → TJS)', () => {
    it('produces TJS source with colon syntax', () => {
      const result = fromTS(TS_SIMPLE, { emitTJS: true })

      expect(result.code).toContain('name: string')
      expect(result.code).not.toContain("name: ''")
    })

    it('produces TJS with return type annotations', () => {
      const result = fromTS(TS_SIMPLE, { emitTJS: true })

      expect(result.code).toContain(':! string')
    })

    it('preserves inline test comments', () => {
      const result = fromTS(TS_WITH_TESTS, { emitTJS: true })

      expect(result.code).toContain("/*test 'add works'")
      expect(result.code).toContain("/*test 'add negative'")
    })

    it('converts number to float example', () => {
      const ts = `function calc(rate: number): number { return rate * 2 }`
      const result = fromTS(ts, { emitTJS: true })

      expect(result.code).toContain('rate: number')
    })
  })

  describe('CLI integration', () => {
    let tmpDir: string

    beforeAll(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'tjs-convert-'))
    })

    afterAll(() => {
      rmSync(tmpDir, { recursive: true, force: true })
    })

    /**
     * The `#!` line survives conversion — a headline 0.13.2 fix that shipped with no test.
     *
     * `convert` had NO hashbang handling at all, while the CHANGELOG claimed it was
     * "handled in `preprocess`, which every path goes through". It is not: the TS→TJS→JS
     * chain loses the line at the first step, so it has to be captured from the ORIGINAL
     * TypeScript. `convert` is the command the migration docs point TypeScript users at,
     * i.e. the one most likely to meet a real bin script.
     *
     * Both sinks are covered, because fixing one and leaving the other is exactly what
     * happened to `emit` one release earlier.
     */
    it('preserves the #! line when writing a file', async () => {
      const inputPath = join(tmpDir, 'bin.ts')
      const outputPath = join(tmpDir, 'bin.js')
      writeFileSync(
        inputPath,
        `#!/usr/bin/env node\nexport const x: number = 1\n`
      )
      const proc = Bun.spawn(
        [BUN, 'src/cli/tjs.ts', 'convert', inputPath, '-o', outputPath],
        { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' }
      )
      await new Response(proc.stdout).text()
      expect(await proc.exited).toBe(0)
      expect(
        readFileSync(outputPath, 'utf8').startsWith('#!/usr/bin/env node\n')
      ).toBe(true)
    })

    it('preserves the #! line on STDOUT too', async () => {
      const inputPath = join(tmpDir, 'bin2.ts')
      writeFileSync(
        inputPath,
        `#!/usr/bin/env node\nexport const x: number = 1\n`
      )
      const proc = Bun.spawn([BUN, 'src/cli/tjs.ts', 'convert', inputPath], {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const out = await new Response(proc.stdout).text()
      await proc.exited
      expect(out.startsWith('#!/usr/bin/env node\n')).toBe(true)
    })

    it('a file WITHOUT a hashbang gains none', async () => {
      // The control: unconditionally prepending something would satisfy both tests above.
      const inputPath = join(tmpDir, 'plain.ts')
      const outputPath = join(tmpDir, 'plain.js')
      writeFileSync(inputPath, `export const x: number = 1\n`)
      const proc = Bun.spawn(
        [BUN, 'src/cli/tjs.ts', 'convert', inputPath, '-o', outputPath],
        { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' }
      )
      await new Response(proc.stdout).text()
      expect(readFileSync(outputPath, 'utf8').startsWith('#!')).toBe(false)
    })

    it('converts a single TS file to JS via CLI', async () => {
      const inputPath = join(tmpDir, 'hello.ts')
      writeFileSync(inputPath, TS_SIMPLE)

      const proc = Bun.spawn([BUN, 'src/cli/tjs.ts', 'convert', inputPath], {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const stdout = await new Response(proc.stdout).text()
      await proc.exited

      expect(stdout).toContain('function greet')
      expect(stdout).toContain('__tjs')
      // TS-originated code gets safety 'none', so no typeError validation
      expect(stdout).toContain('"unsafe": true')
    })

    it('converts a single TS file to TJS with --emit-tjs', async () => {
      const inputPath = join(tmpDir, 'hello2.ts')
      writeFileSync(inputPath, TS_SIMPLE)

      const proc = Bun.spawn(
        [BUN, 'src/cli/tjs.ts', 'convert', '--emit-tjs', inputPath],
        { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' }
      )
      const stdout = await new Response(proc.stdout).text()
      await proc.exited

      expect(stdout).toContain('name: string')
      expect(stdout).toContain(':! string')
      expect(stdout).not.toContain('__tjs')
    })

    it('runs inline tests during conversion', async () => {
      const inputPath = join(tmpDir, 'tested.ts')
      writeFileSync(inputPath, TS_WITH_TESTS)

      const proc = Bun.spawn(
        [BUN, 'src/cli/tjs.ts', 'convert', '-V', inputPath],
        { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' }
      )
      const stderr = await new Response(proc.stderr).text()
      await proc.exited

      expect(stderr).toContain('2 tests passed')
    })

    it('reports failing tests on stderr', async () => {
      const inputPath = join(tmpDir, 'failing.ts')
      writeFileSync(inputPath, TS_WITH_FAILING_TEST)

      const proc = Bun.spawn([BUN, 'src/cli/tjs.ts', 'convert', inputPath], {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const stderr = await new Response(proc.stderr).text()
      await proc.exited

      expect(stderr).toContain('failed')
      expect(stderr).toContain('this fails')
    })

    it('converts directory of TS files to JS', async () => {
      const srcDir = join(tmpDir, 'src')
      const outDir = join(tmpDir, 'out')
      mkdtempSync(srcDir) // won't work, use mkdirSync
      rmSync(srcDir, { recursive: true, force: true })
      const { mkdirSync } = await import('fs')
      mkdirSync(srcDir, { recursive: true })

      writeFileSync(
        join(srcDir, 'utils.ts'),
        `function double(n: number): number { return n * 2 }`
      )
      writeFileSync(
        join(srcDir, 'greet.ts'),
        `function hello(name: string): string { return 'hi ' + name }`
      )
      // Should be skipped
      writeFileSync(join(srcDir, 'utils.test.ts'), `// test file`)
      writeFileSync(join(srcDir, 'types.d.ts'), `// declaration file`)

      const proc = Bun.spawn(
        [BUN, 'src/cli/tjs.ts', 'convert', srcDir, '-o', outDir],
        { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' }
      )
      await proc.exited

      // Should produce .js files, not .tjs
      const { existsSync } = await import('fs')
      expect(existsSync(join(outDir, 'utils.js'))).toBe(true)
      expect(existsSync(join(outDir, 'greet.js'))).toBe(true)
      // Test and declaration files should be skipped
      expect(existsSync(join(outDir, 'utils.test.js'))).toBe(false)
      expect(existsSync(join(outDir, 'types.js'))).toBe(false)

      // Output should be JS with metadata
      const utilsJs = readFileSync(join(outDir, 'utils.js'), 'utf-8')
      expect(utilsJs).toContain('__tjs')
      expect(utilsJs).toContain('double')
    })

    it('converts directory to TJS with --emit-tjs', async () => {
      const srcDir = join(tmpDir, 'src-tjs')
      const outDir = join(tmpDir, 'out-tjs')
      const { mkdirSync } = await import('fs')
      mkdirSync(srcDir, { recursive: true })

      writeFileSync(
        join(srcDir, 'utils.ts'),
        `function double(n: number): number { return n * 2 }`
      )

      const proc = Bun.spawn(
        [BUN, 'src/cli/tjs.ts', 'convert', '--emit-tjs', srcDir, '-o', outDir],
        { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' }
      )
      await proc.exited

      // Should produce .tjs files
      const { existsSync } = await import('fs')
      expect(existsSync(join(outDir, 'utils.tjs'))).toBe(true)
      expect(existsSync(join(outDir, 'utils.js'))).toBe(false)
    })

    /**
     * Regression for the second half of #24, which shipped without one.
     *
     * `convertFile` caught its own error and returned normally whenever
     * `outputPath` was set, so `convertDirectory`'s `catch { failed++ }` was
     * unreachable: one good file and one bad file reported **"2 converted, 0
     * failed"** and exited **0**, with the bad file silently missing. The
     * failure surfaced two steps later as a bundler resolution error, which is
     * the expensive part — a build tool that reports success while dropping
     * output moves the diagnosis to a place with no evidence in it.
     *
     * The failure is forced at the WRITE, not the parse, on purpose. `fromTS`
     * is error-tolerant by design (TypeScript's own parser recovers), so a
     * malformed `.ts` file converts happily — there is no convenient "bad
     * source" that trips this path. What the bug was about is any throw inside
     * the try with `outputPath` set, and an unwritable destination is the
     * deterministic, portable way to produce one.
     */
    it('counts a failed file and exits non-zero', async () => {
      const { mkdirSync, existsSync } = await import('fs')
      const srcDir = join(tmpDir, 'src-partial')
      const outDir = join(tmpDir, 'out-partial')
      mkdirSync(join(srcDir, 'sub'), { recursive: true })

      writeFileSync(join(srcDir, 'good.ts'), TS_SIMPLE)
      writeFileSync(join(srcDir, 'sub', 'blocked.ts'), TS_SIMPLE)

      // `out-partial/sub` is a FILE, so writing `out-partial/sub/blocked.js`
      // cannot succeed — while its sibling at the top level still can.
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, 'sub'), 'not a directory')

      const proc = Bun.spawn(
        [BUN, 'src/cli/tjs.ts', 'convert', srcDir, '-o', outDir],
        { cwd: REPO_ROOT, stdout: 'pipe', stderr: 'pipe' }
      )
      const stdout = await new Response(proc.stdout).text()
      const exitCode = await proc.exited

      // The tally must report the drop…
      expect(stdout).toContain('1 converted, 1 failed')
      // …and the exit code must carry it, since that is what a build script reads.
      expect(exitCode).not.toBe(0)
      // The good file still converted — a partial failure is not an abort.
      expect(existsSync(join(outDir, 'good.js'))).toBe(true)
    })
  })
})
