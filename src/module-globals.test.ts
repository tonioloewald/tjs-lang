/**
 * The shipped modules LOAD in a host that lacks optional globals (cumulative review 15).
 *
 * Round 40 read `SharedArrayBuffer.prototype` at module scope. Browsers leave `SharedArrayBuffer`
 * undefined unless the page is cross-origin isolated, so `tjs-lang`, `/vm`, `/vm-ast` and `/eval`
 * threw on import in an ordinary page, and no lane noticed: Bun and Node always define it. This
 * loads the source entries and every built bundle in a subprocess with the optional globals
 * DELETED, so the next module-scope read of one fails here instead.
 */
import { describe, it, expect } from 'bun:test'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..')

/** Globals a real host may lack, and why. */
const OPTIONAL_GLOBALS: Record<string, string> = {
  SharedArrayBuffer:
    'browsers: defined only when the page is cross-origin isolated',
  WeakRef: 'older engines',
  FinalizationRegistry: 'older engines',
}

/** Every package entry's SOURCE that can load in a browser (bun-plugin and the CLI cannot). */
const SOURCES = [
  'src/index.ts',
  'src/vm/index.ts',
  'src/vm/ast.ts',
  'src/vm/runtime.ts',
  'src/lang/eval.ts',
  'src/lang/transpiler.ts',
  'src/lang/browser.ts',
  'src/css/index.ts',
  'src/schema/index.ts',
  'src/linalg/index.tjs',
  'src/import-resolver/index.ts',
  'src/lang/runtime.ts',
]

function loadsWithout(path: string): { ok: boolean; out: string } {
  const script = `
    for (const g of ${JSON.stringify(
      Object.keys(OPTIONAL_GLOBALS)
    )}) delete globalThis[g]
    await import(${JSON.stringify(join(ROOT, path))})
    console.log('LOADED')
  `
  const r = Bun.spawnSync(['bun', '-e', script], { cwd: ROOT })
  const out = r.stdout.toString() + r.stderr.toString()
  return { ok: out.includes('LOADED'), out }
}

describe('modules load without optional host globals', () => {
  it('the apparatus: deleting the globals actually removes them', () => {
    const r = Bun.spawnSync(
      [
        'bun',
        '-e',
        `delete globalThis.SharedArrayBuffer; console.log(typeof SharedArrayBuffer)`,
      ],
      { cwd: ROOT }
    )
    expect(r.stdout.toString().trim()).toBe('undefined')
  })

  for (const src of SOURCES)
    it(`source: ${src}`, () => {
      const { ok, out } = loadsWithout(src)
      expect(ok, out).toBe(true)
    })

  const dist = join(ROOT, 'dist')
  const bundles = existsSync(dist)
    ? readdirSync(dist).filter(
        (f) => f.endsWith('.js') && !f.includes('worker')
      )
    : []
  if (process.env.CI)
    it('dist exists in CI', () => expect(bundles.length).toBeGreaterThan(5))
  for (const b of bundles)
    it(`bundle: dist/${b}`, () => {
      const { ok, out } = loadsWithout(`dist/${b}`)
      expect(ok, out).toBe(true)
    })
})
