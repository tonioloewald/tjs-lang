#!/usr/bin/env bun
/**
 * Effect Compatibility Test
 *
 * Clones Effect (the "final boss" of TypeScript complexity), transpiles
 * its source using fromTS, and attempts to run its Vitest suite.
 *
 * Effect uses higher-kinded types, massive intersections, and the most
 * advanced TypeScript patterns in the wild.
 *
 * Usage:
 *   bun scripts/compat-effect.ts
 *   bun scripts/compat-effect.ts --clean
 *   bun scripts/compat-effect.ts --test     # Also run tests (requires pnpm)
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
const REPO_DIR = join(COMPAT_DIR, 'effect')
const EFFECT_PKG = join(REPO_DIR, 'packages', 'effect')
const SRC_DIR = join(EFFECT_PKG, 'src')

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

async function main() {
  const clean = process.argv.includes('--clean')
  const runTests = process.argv.includes('--test')

  console.log(
    `\n  Effect Compatibility Test — ${
      runTests ? 'transpile + test' : 'transpilation only'
    }\n`
  )

  if (clean && existsSync(REPO_DIR)) {
    await run(['rm', '-rf', REPO_DIR])
  }

  if (!existsSync(REPO_DIR)) {
    console.log('Cloning Effect...')
    mkdirSync(COMPAT_DIR, { recursive: true })
    const { exitCode } = await run([
      'git',
      'clone',
      '--depth',
      '1',
      'https://github.com/Effect-TS/effect.git',
      REPO_DIR,
    ])
    if (exitCode !== 0) {
      console.error('Failed to clone Effect')
      process.exit(1)
    }
  } else {
    console.log('Resetting clone to clean state...')
    await run(['git', 'checkout', '.'], { cwd: REPO_DIR })
  }

  // Transpile
  console.log('\nTranspiling source files...')
  const sourceFiles = findSourceFiles(SRC_DIR)
  let ok = 0,
    fail = 0
  const errors: string[] = []

  for (const filePath of sourceFiles) {
    const relPath = filePath.replace(REPO_DIR + '/', '')
    const source = readFileSync(filePath, 'utf-8')
    try {
      const result = fromTS(source, { filename: relPath })
      if (runTests) {
        writeFileSync(filePath, result.code)
      }
      ok++
    } catch (e: any) {
      fail++
      errors.push(`  ${relPath}: ${e.message}`)
    }
  }

  console.log('\n' + '━'.repeat(50))
  console.log(`  Source files: ${sourceFiles.length}`)
  console.log(`  Transpiled:  ${ok}`)
  console.log(`  Failed:      ${fail}`)
  console.log('━'.repeat(50))

  if (fail > 0) {
    console.log('\nTranspilation failures:')
    errors.forEach((e) => console.log(e))
  } else {
    console.log(`\n  All ${ok} source files transpile cleanly!`)
  }

  // Run tests if requested
  if (runTests && fail === 0) {
    console.log('\nInstalling dependencies...')
    if (!existsSync(join(REPO_DIR, 'node_modules'))) {
      await run(['pnpm', 'install'], { cwd: REPO_DIR })
    }

    console.log('\nRunning Effect test suite...\n')
    const { stdout, stderr } = await run(
      ['npx', 'vitest', 'run', '--reporter=json', '--project=effect'],
      { cwd: REPO_DIR, capture: true }
    )

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
      if (passed === total && total > 0) {
        console.log(`\n  All ${total} tests passed!\n`)
      }
    } catch {
      console.log('Could not parse Vitest JSON output.')
      const lines = (stderr || stdout).split('\n')
      for (const line of lines.slice(-20)) {
        if (line.trim()) console.log(`  ${line}`)
      }
    }
  }

  console.log()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
