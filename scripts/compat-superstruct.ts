#!/usr/bin/env bun
/**
 * Superstruct Compatibility Test
 *
 * Clones Superstruct, transpiles its TS source using TJS's fromTS,
 * and runs Superstruct's own test suite to verify compatibility.
 *
 * Usage:
 *   bun scripts/compat-superstruct.ts           # Direct mode (fromTS → JS)
 *   bun scripts/compat-superstruct.ts --full     # Full pipeline (fromTS → TJS → JS)
 *   bun scripts/compat-superstruct.ts --clean    # Remove clone and start fresh
 */

import { fromTS } from '../src/lang/emitters/from-ts'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const COMPAT_DIR = join(ROOT, '.compat-tests')
const REPO_DIR = join(COMPAT_DIR, 'superstruct')
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
      if (entry.name === 'test' || entry.name === '__tests__') continue
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
  console.log(`\n  Superstruct Compatibility Test — ${mode}\n`)

  // ── Step 0: Clean if requested ──
  if (clean && existsSync(REPO_DIR)) {
    console.log('Cleaning previous clone...')
    await run(['rm', '-rf', REPO_DIR])
  }

  // ── Step 1: Clone ──
  if (!existsSync(REPO_DIR)) {
    console.log('Cloning Superstruct...')
    mkdirSync(COMPAT_DIR, { recursive: true })
    const { exitCode } = await run([
      'git',
      'clone',
      '--depth',
      '1',
      'https://github.com/ianstormtaylor/superstruct.git',
      REPO_DIR,
    ])
    if (exitCode !== 0) {
      console.error('Failed to clone Superstruct')
      process.exit(1)
    }
  } else {
    console.log('Resetting clone to clean state...')
    await run(['git', 'checkout', '.'], { cwd: REPO_DIR })
  }

  // ── Step 2: Install deps ──
  if (!existsSync(join(REPO_DIR, 'node_modules'))) {
    console.log('Installing Superstruct dependencies...')
    const { exitCode } = await run(['npm', 'install'], { cwd: REPO_DIR })
    if (exitCode !== 0) {
      console.error('Failed to install dependencies')
      process.exit(1)
    }
  }

  // ── Step 3: Transpile source files ──
  console.log('\nTranspiling source files...')
  const sourceFiles = findSourceFiles(SRC_DIR)
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
      ` (${sourceFiles.length} total)`
  )

  if (transpileResults.fail > 0) {
    console.log('\nTranspilation errors:')
    for (const { file, error } of transpileResults.errors) {
      console.log(`  ${file}: ${error}`)
    }
  }

  // ── Step 4: Run tests ──
  // Vitest runs the tests; source files are already transpiled in-place.
  // Vitest uses esbuild to transform .ts files so it handles plain JS in .ts.
  console.log('\nRunning Superstruct test suite...\n')
  const { stdout, stderr, exitCode } = await run(
    ['npx', 'vitest', 'run', '--reporter=json'],
    { cwd: REPO_DIR, capture: true }
  )

  // ── Step 5: Parse and report ──
  // Vitest JSON output may be mixed with other text
  const jsonStart = stdout.indexOf('{')
  const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : ''

  try {
    const json = JSON.parse(jsonStr)
    const passed = json.numPassedTests ?? 0
    const failed = json.numFailedTests ?? 0
    const total = json.numTotalTests ?? passed + failed

    console.log('━'.repeat(50))
    console.log(`  Total:  ${total}`)
    console.log(`  Passed: ${passed}`)
    console.log(`  Failed: ${failed}`)
    console.log('━'.repeat(50))

    if (failed > 0 && json.testResults) {
      console.log('\nFailed tests:\n')
      for (const suite of json.testResults) {
        if (suite.status === 'failed') {
          for (const tr of suite.assertionResults || []) {
            if (tr.status === 'failed') {
              const name = [...(tr.ancestorTitles || []), tr.title].join(' > ')
              console.log(`  ✗ ${name}`)
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

    if (passed === total && total > 0) {
      console.log(`\n  All ${total} tests passed!\n`)
    }
  } catch {
    // JSON parse failed — try to extract useful info from raw output
    console.log('Could not parse Vitest JSON output.\n')
    // Vitest often prints summary to stderr
    const output = stderr || stdout
    const lines = output.split('\n')
    const summaryLines = lines.filter(
      (l: string) =>
        l.includes('Tests') ||
        l.includes('passed') ||
        l.includes('failed') ||
        l.includes('FAIL') ||
        l.includes('PASS')
    )
    if (summaryLines.length > 0) {
      console.log('Summary from Vitest output:')
      for (const line of summaryLines.slice(0, 20)) {
        console.log(`  ${line.trim()}`)
      }
    } else {
      console.log('stderr (last 2000 chars):')
      console.log(stderr.slice(-2000))
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
