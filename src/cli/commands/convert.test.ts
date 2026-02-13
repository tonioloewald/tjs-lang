import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fromTS } from '../../lang/emitters/from-ts'
import { tjs } from '../../lang'

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
      expect(jsResult.code).toContain('pushStack')
    })

    it('includes runtime type validation', () => {
      const tjsResult = fromTS(TS_SIMPLE, { emitTJS: true })
      const jsResult = tjs(tjsResult.code, { runTests: 'report' })

      // Should have type checking for string param
      expect(jsResult.code).toContain("typeof name !== 'string'")
      expect(jsResult.code).toContain('typeError')
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

      expect(result.code).toContain("name: ''")
      expect(result.code).not.toContain('name: string')
    })

    it('produces TJS with return type annotations', () => {
      const result = fromTS(TS_SIMPLE, { emitTJS: true })

      expect(result.code).toContain("-! ''")
    })

    it('preserves inline test comments', () => {
      const result = fromTS(TS_WITH_TESTS, { emitTJS: true })

      expect(result.code).toContain("/*test 'add works'")
      expect(result.code).toContain("/*test 'add negative'")
    })

    it('converts number to float example', () => {
      const ts = `function calc(rate: number): number { return rate * 2 }`
      const result = fromTS(ts, { emitTJS: true })

      expect(result.code).toContain('rate: 0.0')
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

    it('converts a single TS file to JS via CLI', async () => {
      const inputPath = join(tmpDir, 'hello.ts')
      writeFileSync(inputPath, TS_SIMPLE)

      const proc = Bun.spawn(
        ['bun', 'src/cli/tjs.ts', 'convert', inputPath],
        { cwd: '/Users/tonioloewald/tjs-lang', stdout: 'pipe', stderr: 'pipe' }
      )
      const stdout = await new Response(proc.stdout).text()
      await proc.exited

      expect(stdout).toContain('function greet')
      expect(stdout).toContain('__tjs')
      expect(stdout).toContain('typeError')
    })

    it('converts a single TS file to TJS with --emit-tjs', async () => {
      const inputPath = join(tmpDir, 'hello2.ts')
      writeFileSync(inputPath, TS_SIMPLE)

      const proc = Bun.spawn(
        ['bun', 'src/cli/tjs.ts', 'convert', '--emit-tjs', inputPath],
        { cwd: '/Users/tonioloewald/tjs-lang', stdout: 'pipe', stderr: 'pipe' }
      )
      const stdout = await new Response(proc.stdout).text()
      await proc.exited

      expect(stdout).toContain("name: ''")
      expect(stdout).toContain("-! ''")
      expect(stdout).not.toContain('__tjs')
    })

    it('runs inline tests during conversion', async () => {
      const inputPath = join(tmpDir, 'tested.ts')
      writeFileSync(inputPath, TS_WITH_TESTS)

      const proc = Bun.spawn(
        ['bun', 'src/cli/tjs.ts', 'convert', '-V', inputPath],
        { cwd: '/Users/tonioloewald/tjs-lang', stdout: 'pipe', stderr: 'pipe' }
      )
      const stderr = await new Response(proc.stderr).text()
      await proc.exited

      expect(stderr).toContain('2 tests passed')
    })

    it('reports failing tests on stderr', async () => {
      const inputPath = join(tmpDir, 'failing.ts')
      writeFileSync(inputPath, TS_WITH_FAILING_TEST)

      const proc = Bun.spawn(
        ['bun', 'src/cli/tjs.ts', 'convert', inputPath],
        { cwd: '/Users/tonioloewald/tjs-lang', stdout: 'pipe', stderr: 'pipe' }
      )
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
        ['bun', 'src/cli/tjs.ts', 'convert', srcDir, '-o', outDir],
        { cwd: '/Users/tonioloewald/tjs-lang', stdout: 'pipe', stderr: 'pipe' }
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
        [
          'bun',
          'src/cli/tjs.ts',
          'convert',
          '--emit-tjs',
          srcDir,
          '-o',
          outDir,
        ],
        { cwd: '/Users/tonioloewald/tjs-lang', stdout: 'pipe', stderr: 'pipe' }
      )
      await proc.exited

      // Should produce .tjs files
      const { existsSync } = await import('fs')
      expect(existsSync(join(outDir, 'utils.tjs'))).toBe(true)
      expect(existsSync(join(outDir, 'utils.js'))).toBe(false)
    })
  })
})
