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
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  chmodSync,
  existsSync,
} from 'node:fs'
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

  it('emit PRESERVES the #! line, so the output is still executable', async () => {
    // The trap version of the hashbang fix. `preprocess` blanks the line for offset
    // stability and nothing re-prepended it, so `tjs emit` produced a file opening with 19
    // spaces — exit 0, no warning, and `./bin.js` died with a shell syntax error.
    //
    // That is WORSE than the bug it replaced: 0.13.0 rejected the file loudly with
    // `Unexpected character '!'`, which at least names the problem. Accepting it and
    // quietly deleting the line that makes it executable is the version nobody diagnoses.
    const root = fixture({
      'bin.tjs': `#!/usr/bin/env bun\n${GOOD}\nconsole.log(add(1, 2))\n`,
    })
    const out = join(root, 'bin.js')
    const proc = Bun.spawn(
      ['bun', CLI, 'emit', join(root, 'bin.tjs'), '-o', out],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      }
    )
    await proc.exited
    const emitted = readFileSync(out, 'utf8')
    expect(emitted.startsWith('#!/usr/bin/env bun\n')).toBe(true)

    // And it RUNS. Asserting on the first line alone would pass for output that is
    // otherwise mangled.
    chmodSync(out, 0o755)
    const ran = Bun.spawn([out], { stdout: 'pipe', stderr: 'pipe' })
    const stdout = await new Response(ran.stdout).text()
    expect(await ran.exited).toBe(0)
    expect(stdout.trim()).toBe('3')
  })

  it('the hashbang does NOT leak into result.code (it breaks every embedder)', async () => {
    // 0.13.1 put the `#!` line into `result.code`, which is a FRAGMENT. `tjsx` is a
    // published bin that wraps it in `new Function`, and CLAUDE.md documents that same
    // idiom — both died with `Invalid character: '#'`, an error naming neither the
    // shebang nor the file. The line belongs at the file-write seam, not in the fragment.
    const { tjs } = await import('../lang/index')
    const r = tjs('#!/usr/bin/env node\nconsole.log(1)\n', { dialect: 'js' })
    expect(r.code.startsWith('#!')).toBe(false)
    expect(r.hashbang).toBe('#!/usr/bin/env node')
    expect(() => new Function(r.code)).not.toThrow()
  })

  it('tjsx RUNS a file with a hashbang', async () => {
    const root = fixture({
      'g.tjs': `#!/usr/bin/env bun\n${GOOD}\nconsole.log(add(1, 2))\n`,
    })
    const proc = Bun.spawn(
      ['bun', join(import.meta.dir, 'tjsx.ts'), join(root, 'g.tjs')],
      { stdout: 'pipe', stderr: 'pipe' }
    )
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    // The property under test is that the shebang does not break the embed. `tjsx` also
    // invokes the exported function with CLI args after running the module, so asserting
    // on exact stdout would be asserting on that unrelated feature.
    expect(err).not.toContain("Invalid character: '#'")
    expect(await proc.exited).toBe(0)
    expect(out).toContain('3')
  })

  it('emit FAILS LOUDLY when a file cannot be emitted', async () => {
    // `2 emitted, 0 failed` + exit 0 with the output MISSING. `tjs emit` is the documented
    // production build path, so a CI step went green having produced no module.
    const root = fixture({
      'src/good.tjs': GOOD,
      'src/bad.tjs': `function bad(a: 2, b: 3): 0 { return a + b }\n`,
    })
    const out = join(root, 'out')
    const proc = Bun.spawn(
      ['bun', CLI, 'emit', join(root, 'src'), '-o', out, '-r'],
      { stdout: 'pipe', stderr: 'pipe' }
    )
    const [so, se] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    expect(await proc.exited).toBe(1)
    expect(so + se).toContain('1 failed')
    expect(existsSync(join(out, 'good.js'))).toBe(true)
    expect(existsSync(join(out, 'bad.js'))).toBe(false)
  })

  it('a single file that cannot be emitted exits non-zero', async () => {
    const root = fixture({
      'bad.tjs': `function bad(a: 2, b: 3): 0 { return a + b }\n`,
    })
    const proc = Bun.spawn(
      ['bun', CLI, 'emit', join(root, 'bad.tjs'), '-o', join(root, 'bad.js')],
      { stdout: 'pipe', stderr: 'pipe' }
    )
    await new Response(proc.stderr).text()
    expect(await proc.exited).toBe(1)
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
