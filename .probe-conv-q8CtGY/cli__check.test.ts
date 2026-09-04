/* tjs <- input.ts */

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

const CLI = join('/Users/tonioloewald/tjs-lang/src/cli', 'tjs.ts')
export {}

const roots = []

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

/* line 37 */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'tjs-check-'))
  roots.push(root)
  for (const [name, body] of Object.entries(files)) {
    const full = join(root, name)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return root
}
fixture.__tjs = {
  params: {
    files: {
      type: {
        kind: 'object',
        shape: {},
      },
      required: true,
      default: null,
    },
  },
  returns: {
    type: {
      kind: 'string',
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:37',
}

/* line 48 */
async function check(...args) {
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
check.__tjs = {
  params: {
    args: {
      type: {
        kind: 'array',
        items: {
          kind: 'string',
        },
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:48',
}

const GOOD = `function add(a: 1, b: 2): 3 { return a + b }\n`

describe('tjs check', () => {
  it('does not collect .ts from a directory', async () => {
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

    chmodSync(out, 0o755)
    const ran = Bun.spawn([out], { stdout: 'pipe', stderr: 'pipe' })
    const stdout = await new Response(ran.stdout).text()
    expect(await ran.exited).toBe(0)
    expect(stdout.trim()).toBe('3')
  })
  it('the hashbang does NOT leak into result.code (it breaks every embedder)', async () => {
    const { tjs } = await import('/Users/tonioloewald/tjs-lang/src/lang/index')
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
      [
        'bun',
        join('/Users/tonioloewald/tjs-lang/src/cli', 'tjsx.ts'),
        join(root, 'g.tjs'),
      ],
      { stdout: 'pipe', stderr: 'pipe' }
    )
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    expect(err).not.toContain("Invalid character: '#'")
    expect(await proc.exited).toBe(0)
    expect(out).toContain('3')
  })
  it('emit FAILS LOUDLY when a file cannot be emitted', async () => {
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
  it('emit to STDOUT keeps the #! line too', async () => {
    const root = fixture({ 'bin.tjs': `#!/usr/bin/env bun\n${GOOD}\n` })
    const proc = Bun.spawn(['bun', CLI, 'emit', join(root, 'bin.tjs')], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const out = await new Response(proc.stdout).text()
    await proc.exited
    expect(out.startsWith('#!/usr/bin/env bun\n')).toBe(true)
  })
  it('emit -o a.mjs does not overwrite the module with its own docs', async () => {
    const root = fixture({ 'a.tjs': GOOD })
    const out = join(root, 'out', 'a.mjs')
    const proc = Bun.spawn(
      ['bun', CLI, 'emit', join(root, 'a.tjs'), '-o', out],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      }
    )
    await new Response(proc.stdout).text()
    expect(await proc.exited).toBe(0)
    expect(readFileSync(out, 'utf8').startsWith('```')).toBe(false)
    expect(existsSync(join(root, 'out', 'a.md'))).toBe(true)
  })
  it('a single file narrates', async () => {
    const root = fixture({ 'a.tjs': GOOD })
    const r = await check(join(root, 'a.tjs'))
    expect(r.text).toContain('add(')
  })
  it('--max-warnings does NOT silence a single file', async () => {
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
export {}
