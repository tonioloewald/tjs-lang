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
      fromTS(source, { filename: relPath })
      ok++
    } catch (e: any) {
      fail++
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

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
