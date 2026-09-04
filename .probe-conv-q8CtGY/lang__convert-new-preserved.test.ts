/* tjs <- input.ts */

import { describe, it, expect, afterAll } from 'bun:test'

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { fromTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

const TS = `export class Thing {
  n: number
  constructor(n: number) { this.n = n }
  static zero = new Thing(0)
}
export function make(n: number): Thing { return new Thing(n) }
`

const roots = []

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

describe('convert preserves `new` (issue #37)', () => {
  it('`--emit-tjs` output keeps it', () => {
    const out = fromTS(TS, { emitTJS: true, filename: 'thing.ts' }).code
    expect(out).toContain('new Thing(0)')
    expect(out).toContain('new Thing(n)')
  })
  it('the JS output keeps it, in BOTH positions', () => {
    const js = tjs(
      fromTS(TS, { emitTJS: true, filename: 'thing.ts' }).code
    ).code
    expect(js).toContain('new Thing(0)')
    expect(js).toContain('new Thing(n)')
  })
  it('the converted module can actually be IMPORTED and used', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tjs-convert-new-'))
    roots.push(dir)
    const file = join(dir, 'thing.mjs')
    writeFileSync(
      file,
      tjs(fromTS(TS, { emitTJS: true, filename: 'thing.ts' }).code).code
    )
    const mod = await import(file)
    expect(mod.make(5).n).toBe(5)
    expect(mod.Thing.zero.n).toBe(0)
  })
  it('imported and global constructors were never affected (control)', () => {
    const src = `export function f(): Map<string, number> { return new Map() }\n`
    const out = fromTS(src, { emitTJS: true, filename: 'm.ts' }).code
    expect(out).toContain('new Map()')
  })
  it('NATIVE .tjs still rejects `new` on a declared class (the other half)', () => {
    expect(() =>
      tjs(`class Point {}\nconst p = new Point()\n`, { filename: 'p.tjs' })
    ).toThrow(/not allowed in TJS/)
  })
  it('and native .tjs makes the class callable, which is WHY it may drop `new`', () => {
    const out = tjs(
      `export class Point {\n  constructor(x: 0) { this.x = x }\n}\n`,
      {
        filename: 'p.tjs',
      }
    ).code
    expect(out).toMatch(/new Proxy\(Point/)
  })
})
