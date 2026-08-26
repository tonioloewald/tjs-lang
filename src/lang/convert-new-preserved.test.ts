/**
 * `convert` must PRESERVE `new` on locally-declared classes.
 *
 * Dropping it is only safe where a class is callable. In native `.tjs` it is —
 * `class X {}` emits `let X = class X {}; X = new Proxy(X, { apply … })`. But every
 * `fromTS` output carries the `/* tjs <- file *␀/` annotation, and that annotation means
 * **JS semantics**: no Proxy wrap, so the class genuinely requires `new`.
 *
 * `dropRedundantNew` ran inside `fromTS` anyway, so converted modules could not be
 * IMPORTED — a `static zero = new Thing(0)` field throws at module-evaluation time, before
 * any of the module's code runs:
 *
 *     TypeError: Class constructor Thing cannot be invoked without 'new'
 *
 * Regressed in 0.13.0 (0.12.0 and earlier are correct), reported from tosijs against
 * 0.13.4 as issue #37, and unconditional — independent of types, affecting both static
 * field initialisers and ordinary call sites.
 *
 * The transform now runs at GRADUATION instead (`dogfood-convert.test.ts`), which is the
 * step that strips the annotation and makes a file native TJS. Conversion and graduation
 * legitimately produce different text; that is the distinction the original placement
 * missed.
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fromTS } from './emitters/from-ts'
import { tjs } from './index'

const TS = `export class Thing {
  n: number
  constructor(n: number) { this.n = n }
  static zero = new Thing(0)
}
export function make(n: number): Thing { return new Thing(n) }
`

const roots: string[] = []
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
    // A static field initialiser and an ordinary call site fail differently: the first
    // throws at import, the second at first use. Both were broken.
    const js = tjs(
      fromTS(TS, { emitTJS: true, filename: 'thing.ts' }).code
    ).code
    expect(js).toContain('new Thing(0)')
    expect(js).toContain('new Thing(n)')
  })

  it('the converted module can actually be IMPORTED and used', async () => {
    // The property that matters. Asserting on emitted text alone would pass for output
    // that is subtly wrong in some other way.
    const dir = mkdtempSync(join(tmpdir(), 'tjs-convert-new-'))
    roots.push(dir)
    const file = join(dir, 'thing.mjs')
    writeFileSync(
      file,
      tjs(fromTS(TS, { emitTJS: true, filename: 'thing.ts' }).code).code
    )
    const mod: any = await import(file)
    expect(mod.make(5).n).toBe(5)
    expect(mod.Thing.zero.n).toBe(0)
  })

  it('imported and global constructors were never affected (control)', () => {
    // The rewrite only ever targeted locally-declared classes, which is what made this
    // look module-specific when it was reported.
    const src = `export function f(): Map<string, number> { return new Map() }\n`
    const out = fromTS(src, { emitTJS: true, filename: 'm.ts' }).code
    expect(out).toContain('new Map()')
  })

  it('NATIVE .tjs still rejects `new` on a declared class (the other half)', () => {
    // Preserving `new` for converted code must not weaken the native rule — there a class
    // IS callable, so `new` is redundant and rejected.
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
