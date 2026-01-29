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

// Find all .test.tjs files recursively
function findTestFiles(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir)

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)

    if (
      stats.isDirectory() &&
      !entry.startsWith('.') &&
      entry !== 'node_modules'
    ) {
      findTestFiles(fullPath, files)
    } else if (stats.isFile() && entry.endsWith('.test.tjs')) {
      files.push(fullPath)
    }
  }

  return files
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

export async function test(
  input?: string,
  options: TestOptions = {}
): Promise<void> {
  const pluginPath = getPluginPath()

  // Determine what to test
  let testFiles: string[] = []

  if (!input) {
    // Find all .test.tjs files in current directory
    testFiles = findTestFiles(process.cwd())
  } else if (input.endsWith('.test.tjs')) {
    // Single test file
    testFiles = [resolve(input)]
  } else if (existsSync(input) && statSync(input).isDirectory()) {
    // Directory
    testFiles = findTestFiles(resolve(input))
  } else {
    // Treat as a filter pattern for bun test
    testFiles = findTestFiles(process.cwd())
  }

  if (testFiles.length === 0) {
    console.log('No .test.tjs files found')
    return
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
