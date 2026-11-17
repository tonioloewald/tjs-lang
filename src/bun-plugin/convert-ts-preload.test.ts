/**
 * The `TJS_CONVERT_TS=1` preload works, through the real runtime `plugin()` (0.14.0 final review M2).
 *
 * Two crashes, both in the skip branch of the `.ts` hook: with tjs-lang as a checkout, link or
 * workspace, the hook caught tjs-lang's own sources, so loading the converter recursed into a
 * RangeError; and a file it skipped (a dependency under node_modules) returned `undefined`, which
 * Bun's runtime plugin API rejects ("onLoad() expects an object returned"), though `Bun.build`
 * accepts it. Run in a subprocess, because a preload is process-wide.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const PRELOAD = join(import.meta.dir, 'tjs-plugin.ts')
let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tjs-convert-preload-'))
  mkdirSync(join(dir, 'node_modules', 'dep'), { recursive: true })
  writeFileSync(
    join(dir, 'node_modules', 'dep', 'index.ts'),
    'export const plus = (a: number, b: number): number => a + b\n'
  )
  writeFileSync(
    join(dir, 'main.ts'),
    `/* @tjs TjsStrict */
import { plus } from './node_modules/dep/index.ts'
export function double(n: number): number { return n * 2 }
console.log('result', double(2), double('x' as any) instanceof Error, plus(1, 2))
`
  )
})
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('TJS_CONVERT_TS=1 preload', () => {
  it('converts the project file and leaves the dependency and tjs-lang as TypeScript', () => {
    const r = spawnSync('bun', ['--preload', PRELOAD, 'main.ts'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, TJS_CONVERT_TS: '1' },
    })
    expect(r.stderr).not.toMatch(/RangeError|expects an object/)
    expect(r.stdout).toContain('result 4 true 3')
  })
})
