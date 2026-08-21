/**
 * `tjs check`'s three shipped behaviours, none of which had a test.
 *
 * Verified by mutation during review 6: reverting all three left the suite fully green
 * while `tjs check src/ --max-warnings 0` — the invocation the tool's own diagnostic
 * recommends — emitted a wall of false failures again. The repo's rule is a reproduction
 * test BEFORE the fix; these three arrived without one.
 *
 *   1. `.ts` is excluded from the directory walk (collecting it reported 15 of this
 *      project's own files as broken: `export interface` is not TJS).
 *   2. A `#!` line parses. It is standard ES2023 and acorn handles it — rejecting it was a
 *      PRINCIPLES.md TJS ⊇ JS violation, and it is now fixed in `preprocess` so every
 *      command agrees rather than just this one.
 *   3. Narration is gated on `--verbose` for a DIRECTORY and unconditional for a single
 *      file — and is NOT affected by `--max-warnings`, which is a budget flag and briefly
 *      doubled as a hidden verbosity switch.
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CLI = join(import.meta.dir, 'tjs.ts')
const roots: string[] = []
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'tjs-check-'))
  roots.push(root)
  for (const [name, body] of Object.entries(files)) {
    const full = join(root, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return root
}

async function check(...args: string[]) {
  const proc = Bun.spawn(['bun', CLI, 'check', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { code: await proc.exited, text: out + err }
}

const GOOD = `function add(a: 1, b: 2): 3 { return a + b }\n`

describe('tjs check', () => {
  it('does not collect .ts from a directory', async () => {
    // `export interface` is valid TypeScript and not TJS. Collecting it turned a clean
    // directory into a wall of syntax errors.
    const root = fixture({
      'a.tjs': GOOD,
      'b.ts': `export interface X { a: number }\n`,
    })
    const r = await check(root)
    expect(r.code).toBe(0)
    expect(r.text).not.toContain('b.ts')
  })

  it('says what it wants, and points at convert, when a directory is all TypeScript', async () => {
    const root = fixture({ 'a.ts': `export const x: number = 1\n` })
    const r = await check(root)
    expect(r.code).toBe(1)
    expect(r.text).toContain('.tjs')
    expect(r.text).toContain('tjs convert')
  })

  it('accepts a #! line', async () => {
    const root = fixture({ 'bin.tjs': `#!/usr/bin/env bun\n${GOOD}` })
    const r = await check(join(root, 'bin.tjs'))
    expect(r.text).not.toContain("Unexpected character '!'")
    expect(r.code).toBe(0)
  })

  it('a single file narrates', async () => {
    const root = fixture({ 'a.tjs': GOOD })
    const r = await check(join(root, 'a.tjs'))
    expect(r.text).toContain('add(')
  })

  it('--max-warnings does NOT silence a single file', async () => {
    // A budget flag briefly doubled as a hidden verbosity switch, while `--help` asserted
    // "a single file always narrates".
    const root = fixture({ 'a.tjs': GOOD })
    const r = await check(join(root, 'a.tjs'), '--max-warnings', '0')
    expect(r.text).toContain('add(')
  })

  it('a directory is quiet by default and narrates with --verbose', async () => {
    const root = fixture({ 'a.tjs': GOOD })
    expect((await check(root)).text).not.toContain('add(')
    expect((await check(root, '--verbose')).text).toContain('add(')
  })
})
