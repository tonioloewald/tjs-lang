#!/usr/bin/env bun
/**
 * Zod Compatibility Test
 *
 * Clones Zod (monorepo), transpiles its TS source using TJS's fromTS,
 * and runs Zod's own test suite to verify compatibility.
 *
 * Usage:
 *   bun scripts/compat-zod.ts              # Direct mode (fromTS → JS)
 *   bun scripts/compat-zod.ts --clean      # Remove clone and start fresh
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
const REPO_DIR = join(COMPAT_DIR, 'zod')
const ZOD_PKG = join(REPO_DIR, 'packages', 'zod')
const ZOD_SRC = join(ZOD_PKG, 'src')

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
  const clean = args.includes('--clean')

  console.log(`\n  Zod Compatibility Test — direct (TS → JS)\n`)

  // ── Step 0: Clean if requested ──
  if (clean && existsSync(REPO_DIR)) {
    console.log('Cleaning previous clone...')
    await run(['rm', '-rf', REPO_DIR])
  }

  // ── Step 1: Clone ──
  if (!existsSync(REPO_DIR)) {
    console.log('Cloning Zod...')
    mkdirSync(COMPAT_DIR, { recursive: true })
    const { exitCode } = await run([
      'git', 'clone', '--depth', '1',
      'https://github.com/colinhacks/zod.git', REPO_DIR,
    ])
    if (exitCode !== 0) {
      console.error('Failed to clone Zod')
      process.exit(1)
    }
  } else {
    console.log('Resetting clone to clean state...')
    await run(['git', 'checkout', '.'], { cwd: REPO_DIR })
  }

  // ── Step 2: Install deps (pnpm monorepo) ──
  if (!existsSync(join(REPO_DIR, 'node_modules'))) {
    console.log('Installing Zod dependencies (pnpm)...')
    const { exitCode } = await run(['pnpm', 'install', '--frozen-lockfile'], {
      cwd: REPO_DIR,
    })
    if (exitCode !== 0) {
      // Try without frozen lockfile
      console.log('Retrying without frozen lockfile...')
      const { exitCode: exitCode2 } = await run(['pnpm', 'install'], {
        cwd: REPO_DIR,
      })
      if (exitCode2 !== 0) {
        console.error('Failed to install dependencies')
        process.exit(1)
      }
    }
  }

  // ── Step 3: Transpile source files ──
  console.log('\nTranspiling source files...')
  const sourceFiles = findSourceFiles(ZOD_SRC)
  const transpileResults = {
    ok: 0,
    fail: 0,
    errors: [] as { file: string; error: string }[],
  }

  for (const filePath of sourceFiles) {
    const relPath = filePath.replace(REPO_DIR + '/', '')
    const source = readFileSync(filePath, 'utf-8')

    try {
      const result = fromTS(source, { filename: relPath })
      writeFileSync(filePath, result.code)
      transpileResults.ok++
      // Only log failures and summary to avoid noise (114 files)
    } catch (e: any) {
      transpileResults.fail++
      transpileResults.errors.push({ file: relPath, error: e.message })
      console.error(`  ✗ ${relPath}: ${e.message}`)
    }
  }

  console.log(
    `  Transpilation: ${transpileResults.ok} ok, ${transpileResults.fail} failed` +
      ` (${sourceFiles.length} files, ~30K LOC)`
  )

  if (transpileResults.fail > 0) {
    console.log('\nTranspilation errors:')
    for (const { file, error } of transpileResults.errors) {
      console.log(`  ${file}: ${error}`)
    }
  }

  // ── Step 4: Run tests ──
  // Zod uses vitest with pnpm workspaces. Run from the monorepo root.
  // Disable typecheck since transpiled files won't pass TS type checks.
  // Filter to just the zod package tests.
  console.log('\nRunning Zod test suite...\n')

  // Patch vitest config to disable typecheck
  const vitestConfig = join(REPO_DIR, 'vitest.config.ts')
  const vitestSrc = readFileSync(vitestConfig, 'utf-8')
  const patched = vitestSrc
    .replace(/typecheck:\s*\{[^}]*\}/s, 'typecheck: { enabled: false }')
    .replace(/silent:\s*true/, 'silent: false')
  writeFileSync(vitestConfig, patched)

  const { stdout, stderr, exitCode } = await run(
    [
      'npx', 'vitest', 'run',
      '--reporter=json',
      '--project=zod',
    ],
    { cwd: REPO_DIR, capture: true }
  )

  // ── Step 5: Parse and report ──
  const jsonStart = stdout.indexOf('{')
  const jsonStr = jsonStart >= 0 ? stdout.slice(jsonStart) : ''

  try {
    const json = JSON.parse(jsonStr)
    const passed = json.numPassedTests ?? 0
    const failed = json.numFailedTests ?? 0
    const total = json.numTotalTests ?? (passed + failed)

    console.log('━'.repeat(50))
    console.log(`  Total:  ${total}`)
    console.log(`  Passed: ${passed}`)
    console.log(`  Failed: ${failed}`)
    console.log('━'.repeat(50))

    if (failed > 0 && json.testResults) {
      console.log('\nFailed tests (first 30):\n')
      let shown = 0
      for (const suite of json.testResults) {
        if (suite.status === 'failed' && shown < 30) {
          const suiteName = suite.name.replace(REPO_DIR + '/', '')
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
    } else if (total > 0) {
      const pct = ((passed / total) * 100).toFixed(1)
      console.log(`\n  ${pct}% pass rate (${passed}/${total})\n`)
    }
  } catch {
    console.log('Could not parse Vitest JSON output.\n')
    // Show useful lines from stderr
    const output = stderr || stdout
    const lines = output.split('\n')
    const useful = lines.filter(
      (l: string) =>
        l.includes('Tests') ||
        l.includes('FAIL') ||
        l.includes('PASS') ||
        l.includes('Error') ||
        l.includes('passed') ||
        l.includes('failed')
    )
    if (useful.length > 0) {
      for (const line of useful.slice(0, 20)) {
        console.log(`  ${line.trim()}`)
      }
    } else {
      // Show last 40 lines
      for (const line of lines.slice(-40)) {
        if (line.trim()) console.log(`  ${line}`)
      }
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
