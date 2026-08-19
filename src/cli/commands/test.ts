/**
 * tjs test - Run TJS test files
 *
 * Usage:
 *   tjs test                     Run all .test.tjs files
 *   tjs test <file>              Run specific test file
 *   tjs test <dir>               Run all .test.tjs files in directory
 *   tjs test -t <pattern>        Run tests matching pattern
 *
 * This command wraps `bun test` with the TJS plugin preloaded,
 * and generates temporary wrapper files for .test.tjs files since
 * Bun's test runner only recognizes standard extensions.
 */

import { findFiles } from '../walk'
import {
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from 'fs'
import { join, dirname, resolve, relative } from 'path'
import { spawn } from 'bun'

export interface TestOptions {
  pattern?: string // -t, --test-name-pattern
  timeout?: number // --timeout
  watch?: boolean // --watch
  coverage?: boolean // --coverage
  bail?: number // --bail
}

/** Every `.test.tjs` under `dir`. See `findFiles` for the two exclusions it applies. */
function findTestFiles(dir: string): string[] {
  return findFiles(dir, (name) => name.endsWith('.test.tjs'))
}

// Get the plugin path relative to cwd
function getPluginPath(): string {
  // Find the tjs-plugin relative to this file
  const pluginPath = resolve(
    dirname(import.meta.path),
    '../../bun-plugin/tjs-plugin.ts'
  )
  return pluginPath
}

// Create temporary wrapper directory
function getTempDir(): string {
  const tempDir = join(process.cwd(), '.tjs-test-temp')
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true })
  }
  return tempDir
}

// Generate wrapper .test.ts files that import .test.tjs files
function generateWrappers(testFiles: string[], tempDir: string): string[] {
  const wrappers: string[] = []

  for (const testFile of testFiles) {
    const relativePath = relative(tempDir, testFile)

    // Handle potential name collisions by including directory info
    const uniqueName = testFile
      .replace(process.cwd(), '')
      .replace(/[/\\]/g, '_')
      .replace('.test.tjs', '.test.ts')
      .replace(/^_/, '')
    const uniqueWrapperPath = join(tempDir, uniqueName)

    const wrapperContent = `// Auto-generated wrapper for TJS test\nimport '${relativePath}';\n`
    writeFileSync(uniqueWrapperPath, wrapperContent)
    wrappers.push(uniqueWrapperPath)
  }

  return wrappers
}

// Clean up wrapper files
function cleanupWrappers(wrappers: string[], tempDir: string): void {
  for (const wrapper of wrappers) {
    try {
      unlinkSync(wrapper)
    } catch {
      // Ignore cleanup errors
    }
  }

  // Try to remove temp directory if empty
  try {
    const remaining = readdirSync(tempDir)
    if (remaining.length === 0) {
      unlinkSync(tempDir)
    }
  } catch {
    // Ignore
  }
}

/**
 * Run the inline `test '…' { }` blocks (and signature tests) of one source file.
 *
 * These run at TRANSPILE time — `tjs()` executes them and returns `testResults` — so this
 * needs no test runner and no wrapper file. Reports every result and exits non-zero if any
 * genuine failure occurred.
 *
 * `inconclusive` results are reported and do NOT fail the run: a test that could not be
 * *executed* (it names something unresolvable at build time) is not a test that failed, and
 * treating it as one would make legal code un-testable (PRINCIPLES.md).
 */
async function runInlineTests(file: string): Promise<void> {
  const { readFileSync } = await import('fs')
  const { tjs } = await import('../../lang')
  const { dialectForFilename } = await import('../../lang')

  let results
  try {
    const source = readFileSync(file, 'utf-8')
    results =
      tjs(source, {
        filename: file,
        dialect: dialectForFilename(file),
        runTests: 'report',
      }).testResults ?? []
  } catch (e: any) {
    console.error(`✗ ${file}: ${e.message}`)
    process.exit(1)
  }

  if (results.length === 0) {
    console.log(`${file}: no inline tests`)
    return
  }

  let failed = 0
  for (const r of results) {
    const name = r.isSignatureTest ? `${r.description}` : `'${r.description}'`
    const where = r.line ? `:${r.line}` : ''
    if (r.passed) {
      console.log(`  ✓ ${name}`)
    } else if (r.inconclusive) {
      console.log(`  ? ${name}${where} — inconclusive: ${r.error ?? ''}`)
    } else {
      failed++
      console.error(`  ✗ ${name}${where} — ${r.error ?? 'failed'}`)
    }
  }

  const passed = results.filter((r) => r.passed).length
  console.log(`\n${file}: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

export async function test(
  input?: string,
  options: TestOptions = {}
): Promise<void> {
  const pluginPath = getPluginPath()

  // Determine what to test
  let testFiles: string[]

  if (!input) {
    // Find all .test.tjs files in current directory
    testFiles = findTestFiles(process.cwd())
  } else if (input.endsWith('.test.tjs')) {
    // Single test file
    testFiles = [resolve(input)]
  } else if (existsSync(input) && statSync(input).isDirectory()) {
    // Directory
    testFiles = findTestFiles(resolve(input))
  } else if (existsSync(input)) {
    // A source file that is not a `.test.tjs` wrapper — run ITS INLINE TESTS, which is
    // what CLAUDE.md has always documented this command as doing and what it never did.
    //
    // It used to fall through to the branch below and reinterpret the path as a bun-test
    // filter pattern, so `tjs test greeting.tjs` printed "No .test.tjs files found" and
    // exited **0** — indistinguishable from a passing run, and identical to what a
    // nonexistent path produced. A command that reports success while testing nothing is
    // worse than one that errors, and this is the command a CI job or a reader following
    // the docs types first.
    await runInlineTests(resolve(input))
    return
  } else {
    // Not a path at all — a filter pattern for bun test over discovered files.
    console.error(`✗ No such file or directory: ${input}`)
    process.exit(1)
  }

  if (testFiles.length === 0) {
    // Exiting 0 here is the same vacuous-success trap: a mis-pathed directory in CI would
    // pass forever while running nothing.
    console.error(
      input
        ? `✗ No .test.tjs files found in ${input}`
        : '✗ No .test.tjs files found'
    )
    process.exit(1)
  }

  console.log(`Found ${testFiles.length} TJS test file(s)`)

  // Generate wrapper files
  const tempDir = getTempDir()
  const wrappers = generateWrappers(testFiles, tempDir)

  try {
    // Build bun test command
    const args = ['test', '--preload', pluginPath]

    if (options.pattern) {
      args.push('--test-name-pattern', options.pattern)
    }
    if (options.timeout) {
      args.push('--timeout', String(options.timeout))
    }
    if (options.coverage) {
      args.push('--coverage')
    }
    if (options.bail !== undefined) {
      args.push('--bail', String(options.bail))
    }

    // Add wrapper files
    args.push(...wrappers)

    // Run bun test
    const proc = spawn({
      cmd: ['bun', ...args],
      cwd: process.cwd(),
      stdout: 'inherit',
      stderr: 'inherit',
    })

    const exitCode = await proc.exited

    // Cleanup
    cleanupWrappers(wrappers, tempDir)

    if (exitCode !== 0) {
      process.exit(exitCode)
    }
  } catch (error) {
    // Cleanup on error
    cleanupWrappers(wrappers, tempDir)
    throw error
  }
}
