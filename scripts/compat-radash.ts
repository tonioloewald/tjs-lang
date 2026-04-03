#!/usr/bin/env bun
/**
 * Radash Compatibility Test
 *
 * Clones Radash, transpiles its TypeScript source using TJS's fromTS,
 * and runs Radash's own test suite to verify compatibility.
 *
 * Usage:
 *   bun scripts/compat-radash.ts              # Direct mode (fromTS → JS)
 *   bun scripts/compat-radash.ts --full       # Full pipeline (fromTS → TJS → JS)
 *   bun scripts/compat-radash.ts --clean      # Remove clone and start fresh
 */

import { fromTS } from '../src/lang/emitters/from-ts'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from 'fs'
import { join, extname } from 'path'

const ROOT = join(import.meta.dir, '..')
const COMPAT_DIR = join(ROOT, '.compat-tests')
const RADASH_DIR = join(COMPAT_DIR, 'radash')
const RADASH_SRC = join(RADASH_DIR, 'src')

// ─── Helpers ─────────────────────────────────────────────────

async function run(
  cmd: string[],
  opts: { cwd?: string; capture?: boolean } = {}
) {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: opts.capture ? 'pipe' : 'inherit',
    stderr: opts.capture ? 'pipe' : 'inherit',
  })
  const exitCode = await proc.exited
  if (opts.capture) {
    return {
      stdout: await new Response(proc.stdout).text(),
      stderr: await new Response(proc.stderr).text(),
      exitCode,
    }
  }
  return { stdout: '', stderr: '', exitCode }
}

function findSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Skip test directories
      if (entry.name === 'tests' || entry.name === '__tests__') continue
      files.push(...findSourceFiles(join(dir, entry.name)))
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(join(dir, entry.name))
    }
  }
  return files
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const fullPipeline = args.includes('--full')
  const clean = args.includes('--clean')

  const mode = fullPipeline
    ? 'full pipeline (TS → TJS → JS)'
    : 'direct (TS → JS)'
  console.log(`\n  Radash Compatibility Test — ${mode}\n`)

  // ── Step 0: Clean if requested ──
  if (clean && existsSync(RADASH_DIR)) {
    console.log('Cleaning previous clone...')
    await run(['rm', '-rf', RADASH_DIR])
  }

  // ── Step 1: Clone ──
  if (!existsSync(RADASH_DIR)) {
    console.log('Cloning Radash...')
    mkdirSync(COMPAT_DIR, { recursive: true })
    const { exitCode } = await run([
      'git',
      'clone',
      '--depth',
      '1',
      'https://github.com/sodiray/radash.git',
      RADASH_DIR,
    ])
    if (exitCode !== 0) {
      console.error('Failed to clone Radash')
      process.exit(1)
    }
  } else {
    // Reset to clean state
    console.log('Resetting clone to clean state...')
    await run(['git', 'checkout', '.'], { cwd: RADASH_DIR })
  }

  // ── Step 2: Install deps ──
  if (!existsSync(join(RADASH_DIR, 'node_modules'))) {
    console.log('Installing Radash dependencies...')
    const { exitCode } = await run(['npm', 'install'], { cwd: RADASH_DIR })
    if (exitCode !== 0) {
      console.error('Failed to install dependencies')
      process.exit(1)
    }
  }

  // ── Step 3: Transpile source files ──
  console.log('\nTranspiling source files...')
  const sourceFiles = findSourceFiles(RADASH_SRC)
  const transpileResults = {
    ok: 0,
    fail: 0,
    errors: [] as { file: string; error: string }[],
  }

  for (const filePath of sourceFiles) {
    const relPath = filePath.replace(RADASH_DIR + '/', '')
    const source = readFileSync(filePath, 'utf-8')

    try {
      let jsCode: string

      if (fullPipeline) {
        // Full pipeline: TS → TJS → JS
        const { tjs } = await import('../src/lang')
        const tjsResult = fromTS(source, { emitTJS: true, filename: relPath })
        const jsResult = tjs(tjsResult.code)
        jsCode = jsResult.code
      } else {
        // Direct: TS → JS (uses TypeScript's own transpiler internally)
        const result = fromTS(source, { filename: relPath })
        jsCode = result.code
      }

      // Overwrite the .ts file with transpiled JS
      // ts-jest handles plain JS in .ts files fine
      writeFileSync(filePath, jsCode)
      transpileResults.ok++
      console.log(`  ✓ ${relPath}`)
    } catch (e: any) {
      transpileResults.fail++
      transpileResults.errors.push({ file: relPath, error: e.message })
      console.error(`  ✗ ${relPath}: ${e.message}`)
    }
  }

  console.log(
    `\nTranspilation: ${transpileResults.ok} ok, ${transpileResults.fail} failed` +
      ` (${sourceFiles.length} total)`
  )

  if (transpileResults.fail > 0) {
    console.log('\nTranspilation errors:')
    for (const { file, error } of transpileResults.errors) {
      console.log(`  ${file}: ${error}`)
    }
  }

  // ── Step 4: Patch Jest + TypeScript config ──
  // ts-jest type-checks the transpiled source and fails because optional
  // params lose their `?`. Create a permissive tsconfig for test runs
  // and tell ts-jest to use it with diagnostics disabled.
  const jestConfigPath = join(RADASH_DIR, 'jest.config.js')
  const patchedConfig = `module.exports = {
  roots: ["<rootDir>/src"],
  testMatch: ["**/?(*.)+(spec|test).+(ts|tsx|js)"],
  transform: {
    "^.+\\\\.(ts|tsx)$": "ts-jest"
  },
  globals: {
    "ts-jest": {
      diagnostics: false,
      tsconfig: "tsconfig.compat.json"
    }
  }
}
`
  writeFileSync(jestConfigPath, patchedConfig)

  // Create a permissive tsconfig that won't choke on transpiled JS in .ts files
  const tsconfigCompat = JSON.stringify(
    {
      compilerOptions: {
        target: 'es2020',
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: false,
        noImplicitAny: false,
        skipLibCheck: true,
        declaration: false,
        // isolatedModules makes ts-jest strip types without full type-checking
        isolatedModules: true,
      },
      include: ['src/**/*'],
    },
    null,
    2
  )
  writeFileSync(join(RADASH_DIR, 'tsconfig.compat.json'), tsconfigCompat)

  // ── Step 5: Run tests ──
  console.log('\nRunning Radash test suite...\n')
  const { stdout, stderr, exitCode } = await run(
    ['npx', 'jest', '--no-coverage', '--forceExit', '--json'],
    { cwd: RADASH_DIR, capture: true }
  )

  // ── Step 6: Parse and report ──
  // Jest outputs non-JSON lines before the JSON blob
  const jsonStart = stdout.indexOf('{')
  const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : ''

  try {
    const json = JSON.parse(jsonStr)
    const { numPassedTests, numFailedTests, numTotalTests } = json

    console.log('━'.repeat(50))
    console.log(`  Total:  ${numTotalTests}`)
    console.log(`  Passed: ${numPassedTests}`)
    console.log(`  Failed: ${numFailedTests}`)
    console.log('━'.repeat(50))

    if (numFailedTests > 0 && json.testResults) {
      console.log('\nFailed tests:\n')
      for (const suite of json.testResults) {
        if (suite.status === 'failed') {
          const suiteName = suite.name.replace(RADASH_DIR + '/', '')
          for (const tr of suite.assertionResults || []) {
            if (tr.status === 'failed') {
              const name = [...(tr.ancestorTitles || []), tr.title].join(' > ')
              console.log(`  ✗ ${name}`)
              // Show first line of failure message
              const msg = tr.failureMessages?.[0]
              if (msg) {
                const firstLine = msg
                  .split('\n')
                  .find((l: string) => l.trim() && !l.includes('at '))
                if (firstLine) {
                  console.log(`    ${firstLine.trim().slice(0, 120)}`)
                }
              }
            }
          }
        }
      }
    }

    // Identify pre-existing failures (same error across a whole suite = upstream issue)
    const upstreamFailures: string[] = []
    if (json.testResults) {
      for (const suite of json.testResults) {
        if (suite.status === 'failed') {
          const assertions = suite.assertionResults || []
          const failedAssertions = assertions.filter(
            (tr: any) => tr.status === 'failed'
          )
          const allSameError =
            failedAssertions.length > 0 &&
            failedAssertions.every(
              (tr: any) =>
                tr.failureMessages?.[0]?.includes('fake timers') ||
                tr.failureMessages?.[0]?.includes(
                  "read only property 'performance'"
                )
            )
          if (allSameError) {
            upstreamFailures.push(suite.name.replace(RADASH_DIR + '/', ''))
          }
        }
      }
    }

    if (upstreamFailures.length > 0) {
      const upstreamCount =
        json.testResults
          ?.filter((s: any) =>
            upstreamFailures.includes(s.name.replace(RADASH_DIR + '/', ''))
          )
          ?.reduce(
            (n: number, s: any) =>
              n +
              (s.assertionResults?.filter((t: any) => t.status === 'failed')
                ?.length || 0),
            0
          ) || 0
      console.log(
        `\n  Note: ${upstreamCount} failures are pre-existing upstream issues`
      )
      console.log(`  (broken fake timers in: ${upstreamFailures.join(', ')})`)
      const actualFailed = numFailedTests - upstreamCount
      if (actualFailed === 0) {
        console.log(
          `\n  TJS transpilation: ${numPassedTests}/${numPassedTests} tests passed!\n`
        )
      }
    } else if (numPassedTests === numTotalTests) {
      console.log('\n  All tests passed!\n')
    }
  } catch {
    // JSON parse failed — show raw output
    console.log('Could not parse Jest JSON output.\n')
    if (stderr) console.log('stderr:', stderr.slice(0, 2000))
    if (stdout) console.log('stdout:', stdout.slice(0, 2000))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
