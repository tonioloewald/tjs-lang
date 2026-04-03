#!/usr/bin/env bun
/**
 * ts-pattern Compatibility Test
 *
 * Clones ts-pattern, transpiles its TS source using TJS's fromTS,
 * and runs ts-pattern's own test suite to verify compatibility.
 *
 * Usage:
 *   bun scripts/compat-ts-pattern.ts            # Direct mode (fromTS → JS)
 *   bun scripts/compat-ts-pattern.ts --full      # Full pipeline (fromTS → TJS → JS)
 *   bun scripts/compat-ts-pattern.ts --clean     # Remove clone and start fresh
 */

import { fromTS } from '../src/lang/emitters/from-ts'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  readdirSync,
} from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const COMPAT_DIR = join(ROOT, '.compat-tests')
const REPO_DIR = join(COMPAT_DIR, 'ts-pattern')
const SRC_DIR = join(REPO_DIR, 'src')

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
      if (
        entry.name === 'test' ||
        entry.name === 'tests' ||
        entry.name === '__tests__'
      )
        continue
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
  console.log(`\n  ts-pattern Compatibility Test — ${mode}\n`)

  // ── Step 0: Clean if requested ──
  if (clean && existsSync(REPO_DIR)) {
    console.log('Cleaning previous clone...')
    await run(['rm', '-rf', REPO_DIR])
  }

  // ── Step 1: Clone ──
  if (!existsSync(REPO_DIR)) {
    console.log('Cloning ts-pattern...')
    mkdirSync(COMPAT_DIR, { recursive: true })
    const { exitCode } = await run([
      'git',
      'clone',
      '--depth',
      '1',
      'https://github.com/gvergnaud/ts-pattern.git',
      REPO_DIR,
    ])
    if (exitCode !== 0) {
      console.error('Failed to clone ts-pattern')
      process.exit(1)
    }
  } else {
    console.log('Resetting clone to clean state...')
    await run(['git', 'checkout', '.'], { cwd: REPO_DIR })
  }

  // ── Step 2: Install deps ──
  if (!existsSync(join(REPO_DIR, 'node_modules'))) {
    console.log('Installing ts-pattern dependencies...')
    const { exitCode } = await run(['npm', 'install'], { cwd: REPO_DIR })
    if (exitCode !== 0) {
      console.error('Failed to install dependencies')
      process.exit(1)
    }
  }

  // ── Step 3: Transpile source files ──
  // Skip type-only files (src/types/) — they contain no runtime code
  console.log('\nTranspiling source files...')
  const allSourceFiles = findSourceFiles(SRC_DIR)
  const sourceFiles = allSourceFiles.filter((f) => {
    // Skip pure type files — they're type-level only, no runtime code
    const rel = f.replace(SRC_DIR + '/', '')
    if (rel.startsWith('types/')) {
      const content = readFileSync(f, 'utf-8').trim()
      // If file only has types/interfaces/imports (no runtime code), skip
      const hasRuntime = content.split('\n').some((line) => {
        const trimmed = line.trim()
        return (
          trimmed &&
          !trimmed.startsWith('//') &&
          !trimmed.startsWith('*') &&
          !trimmed.startsWith('/*') &&
          !trimmed.startsWith('import ') &&
          !trimmed.startsWith('export type ') &&
          !trimmed.startsWith('export interface ') &&
          !trimmed.startsWith('type ') &&
          !trimmed.startsWith('interface ')
        )
      })
      if (!hasRuntime) {
        console.log(`  ⊘ ${rel} (types only, skipped)`)
        return false
      }
    }
    return true
  })

  const transpileResults = {
    ok: 0,
    fail: 0,
    errors: [] as { file: string; error: string }[],
  }

  for (const filePath of sourceFiles) {
    const relPath = filePath.replace(REPO_DIR + '/', '')
    const source = readFileSync(filePath, 'utf-8')

    try {
      let jsCode: string

      if (fullPipeline) {
        const { tjs } = await import('../src/lang')
        const tjsResult = fromTS(source, { emitTJS: true, filename: relPath })
        const jsResult = tjs(tjsResult.code)
        jsCode = jsResult.code
      } else {
        const result = fromTS(source, { filename: relPath })
        jsCode = result.code
      }

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
      ` (${sourceFiles.length} files)`
  )

  if (transpileResults.fail > 0) {
    console.log('\nTranspilation errors:')
    for (const { file, error } of transpileResults.errors) {
      console.log(`  ${file}: ${error}`)
    }
  }

  // ── Step 4: Patch Jest config ──
  // Create jest config with diagnostics disabled for ts-jest
  // Remove any extra jest config files to avoid conflicts, then write ours
  const jestConfigJs = join(REPO_DIR, 'jest.config.js')
  const jestConfigCjs = join(REPO_DIR, 'jest.config.cjs')
  try {
    unlinkSync(jestConfigJs)
  } catch {}
  const patchedConfig = `module.exports = {
  testEnvironment: 'node',
  testMatch: ["**/tests/**/*.test.ts"],
  transform: {
    "^.+\\\\.ts$": "ts-jest"
  },
  globals: {
    "ts-jest": {
      diagnostics: false,
      tsconfig: "tsconfig.compat.json"
    }
  }
}
`
  writeFileSync(jestConfigCjs, patchedConfig)

  // Create permissive tsconfig
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
        isolatedModules: true,
      },
      include: ['src/**/*', 'tests/**/*'],
    },
    null,
    2
  )
  writeFileSync(join(REPO_DIR, 'tsconfig.compat.json'), tsconfigCompat)

  // ── Step 5: Run tests ──
  console.log('\nRunning ts-pattern test suite...\n')
  const { stdout, stderr, exitCode } = await run(
    ['npx', 'jest', '--no-coverage', '--forceExit', '--json'],
    { cwd: REPO_DIR, capture: true }
  )

  // ── Step 6: Parse and report ──
  const jsonStart = stdout.indexOf('{')
  const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : ''

  try {
    const json = JSON.parse(jsonStr)
    const passed = json.numPassedTests ?? 0
    const failed = json.numFailedTests ?? 0
    const total = json.numTotalTests ?? passed + failed
    const suitesFailed = json.numFailedTestSuites ?? 0

    console.log('━'.repeat(50))
    console.log(`  Total:  ${total}`)
    console.log(`  Passed: ${passed}`)
    console.log(`  Failed: ${failed}`)
    if (suitesFailed > 0) {
      console.log(`  Suites failed to run: ${suitesFailed}`)
    }
    console.log('━'.repeat(50))

    if (failed > 0 && json.testResults) {
      console.log('\nFailed tests:\n')
      let shown = 0
      for (const suite of json.testResults) {
        if (suite.status === 'failed') {
          const suiteName = suite.name.replace(REPO_DIR + '/', '')
          // Check if suite failed to run (0 assertions = crash)
          const assertions = suite.assertionResults || []
          if (assertions.length === 0 && suite.message) {
            console.log(`  ✗ ${suiteName} (failed to run)`)
            const firstLine = suite.message
              .split('\n')
              .find((l: string) => l.trim() && !l.includes('at '))
            if (firstLine) console.log(`    ${firstLine.trim().slice(0, 120)}`)
            shown++
          }
          for (const tr of assertions) {
            if (tr.status === 'failed' && shown < 30) {
              const name = [...(tr.ancestorTitles || []), tr.title].join(' > ')
              console.log(`  ✗ ${name}`)
              const msg = tr.failureMessages?.[0]
              if (msg) {
                const firstLine = msg
                  .split('\n')
                  .find((l: string) => l.trim() && !l.includes('at '))
                if (firstLine)
                  console.log(`    ${firstLine.trim().slice(0, 120)}`)
              }
              shown++
            }
          }
        }
      }
      if (shown >= 30) console.log(`  ... and more`)
    }

    if (passed === total && total > 0) {
      console.log(`\n  All ${total} tests passed!\n`)
    }
  } catch {
    console.log('Could not parse Jest JSON output.\n')
    // Show raw output summary
    const output = stderr || stdout
    const lines = output.split('\n')
    for (const line of lines.slice(-30)) {
      if (line.trim()) console.log(`  ${line}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
