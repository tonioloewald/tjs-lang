#!/usr/bin/env bun
/**
 * Kysely Compatibility Test
 *
 * Clones Kysely, transpiles its TS source using TJS's fromTS.
 * Kysely's tests require database connections so we only verify
 * that all source files transpile without error.
 *
 * Usage:
 *   bun scripts/compat-kysely.ts
 *   bun scripts/compat-kysely.ts --clean
 */

import { fromTS } from '../src/lang/emitters/from-ts'
import { existsSync, readFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')
const COMPAT_DIR = join(ROOT, '.compat-tests')
const REPO_DIR = join(COMPAT_DIR, 'kysely')
const SRC_DIR = join(REPO_DIR, 'src')

function findSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
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

async function run(cmd: string[], opts: { cwd?: string } = {}) {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  return { exitCode: await proc.exited }
}

async function main() {
  const clean = process.argv.includes('--clean')

  console.log(`\n  Kysely Compatibility Test — transpilation only\n`)
  console.log('  (Kysely tests require database connections)\n')

  if (clean && existsSync(REPO_DIR)) {
    await run(['rm', '-rf', REPO_DIR])
  }

  if (!existsSync(REPO_DIR)) {
    console.log('Cloning Kysely...')
    mkdirSync(COMPAT_DIR, { recursive: true })
    await run([
      'git',
      'clone',
      '--depth',
      '1',
      'https://github.com/kysely-org/kysely.git',
      REPO_DIR,
    ])
  }

  console.log('Transpiling source files...')
  const sourceFiles = findSourceFiles(SRC_DIR)
  let ok = 0,
    fail = 0
  const errors: string[] = []

  for (const filePath of sourceFiles) {
    const relPath = filePath.replace(REPO_DIR + '/', '')
    const source = readFileSync(filePath, 'utf-8')
    try {
      // TS -> TJS -> JS: fromTS emits TJS, tjs emits JavaScript.
      //
      // This lane used to default to `fromTS(source)` alone, which emitted JS via
      // `ts.transpileModule`. So the suite that CLAUDE.md calls "the most honest evidence the
      // converter works that this repo has" was, in the main, evidence that the TypeScript
      // compiler works. Three of the six scripts had a `--full` flag for the real path,
      // defaulted off; three never had one; and `compat-all.ts` spawns every script with no
      // arguments. There is now one path and no flag. See `src/no-ts-emitter.test.ts`.
      const { tjs } = await import('../src/lang')
      tjs(fromTS(source, { filename: relPath }).code, { runTests: false })
      ok++
    } catch (e: any) {
      fail++
      // A transpile failure is a CONVERTER failure. Without this the script exits 0 and
      // `compat-all` reports the target as passing — it printed `5 passed, 0 failed` while
      // superstruct ran zero tests and ts-pattern failed on source that never transpiled.
      // A green that cannot go red is not a signal.
      process.exitCode = 1
      errors.push(`  ${relPath}: ${e.message}`)
      console.error(`  ✗ ${relPath}: ${e.message}`)
    }
  }

  console.log('\n' + '━'.repeat(50))
  console.log(`  Source files: ${sourceFiles.length}`)
  console.log(`  Transpiled:  ${ok}`)
  console.log(`  Failed:      ${fail}`)
  console.log('━'.repeat(50))

  if (fail > 0) {
    console.log('\nFailures:')
    errors.forEach((e) => console.log(e))
  } else {
    console.log(`\n  All ${ok} source files transpile cleanly!\n`)
  }
}

/**
 * Restore the clone on the way out, however we leave.
 *
 * Each script overwrites the checked-out `.ts` files with transpiled output and used to
 * reset only at the START of the next run. So between runs the clone held OUR OWN OUTPUT
 * under a `.ts` name, and anything measuring the corpus was re-converting that and calling
 * it TypeScript. Three of six clones were dirty when this was found; ts-pattern read 23/24
 * contaminated and is 24/24 clean.
 */
async function restore() {
  try {
    await run(['git', 'checkout', '.'], { cwd: REPO_DIR })
  } catch {
    // Best effort — a failed restore must not mask the run's own verdict.
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(restore)
