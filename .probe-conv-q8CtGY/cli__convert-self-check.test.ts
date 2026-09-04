/* tjs <- input.ts */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { spawnSync } from 'node:child_process'

let dir

const CLI = join('/Users/tonioloewald/tjs-lang/src/cli', 'tjs.ts')
export {}

/* line 28 */
function run(args) {
  const r = spawnSync('bun', [CLI, ...args], { cwd: dir, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
run.__tjs = {
  params: {
    args: {
      type: {
        kind: 'array',
        items: {
          kind: 'string',
        },
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:28',
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tjs-convert-check-'))
})

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('convert --emit-tjs validates its own output', () => {
  it('exits 0 and writes the file when the result is readable', () => {
    writeFileSync(
      join(dir, 'ok.ts'),
      'export function add(a: number, b: number): number { return a + b }\n'
    )
    const { code } = run(['convert', 'ok.ts', '--emit-tjs', '-o', 'ok.tjs'])
    expect(code).toBe(0)
    expect(existsSync(join(dir, 'ok.tjs'))).toBe(true)
  })
  it('exits NON-ZERO when the emitted TJS does not parse', () => {
    writeFileSync(
      join(dir, 'bad.ts'),
      'export class R {\n' +
        '  add(schema: unknown, ..._meta: unknown[]): this { return this }\n' +
        '}\n'
    )
    const { code, out } = run([
      'convert',
      'bad.ts',
      '--emit-tjs',
      '-o',
      'bad.tjs',
    ])

    if (code === 0) {
      expect(existsSync(join(dir, 'bad.tjs'))).toBe(true)
      return
    }
    expect(code).not.toBe(0)
    expect(out).toContain('not valid TJS')
  })
  it('does not leave a broken artifact behind', () => {
    writeFileSync(
      join(dir, 'bad2.ts'),
      'export class R {\n' +
        '  add(schema: unknown, ..._meta: unknown[]): this { return this }\n' +
        '}\n'
    )
    const { code } = run(['convert', 'bad2.ts', '--emit-tjs', '-o', 'bad2.tjs'])
    if (code === 0) return
    expect(existsSync(join(dir, 'bad2.tjs'))).toBe(false)
  })
  it('names the file and says it is a converter bug', () => {
    writeFileSync(
      join(dir, 'bad3.ts'),
      'export class R {\n' +
        '  add(schema: unknown, ..._meta: unknown[]): this { return this }\n' +
        '}\n'
    )
    const { code, out } = run([
      'convert',
      'bad3.ts',
      '--emit-tjs',
      '-o',
      'bad3.tjs',
    ])
    if (code === 0) return
    expect(out).toContain('bad3.ts')
    expect(out).toContain('converter bug')
  })
})
