/**
 * `setTranspiler` is not public API on ANY entry (board #2247).
 *
 * It lived in `vm.ts`, which every entry re-exports, so `import { setTranspiler } from
 * 'tjs-lang/vm-ast'` worked — and armed a parser in the process of the one entry whose promise
 * is that it contains none. It now lives in the internal `./transpiler-slot`, imported by the
 * entries that want a parser and re-exported by none. Checked over EVERY package export with a
 * `bun` source, so a new entry that re-exports the slot fails here.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(import.meta.dir, '..', '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

const sources = Object.entries(pkg.exports as Record<string, any>)
  .map(([sub, t]) => [sub, typeof t === 'object' ? t.bun : undefined] as const)
  .filter(([, src]) => typeof src === 'string' && /\.ts$/.test(src))

describe('setTranspiler is internal', () => {
  it('the walk found the entries (apparatus)', () => {
    expect(sources.length).toBeGreaterThan(8)
    expect(sources.map(([s]) => s)).toContain('./vm-ast')
  })
  for (const [sub, src] of sources)
    it(`${sub} does not export setTranspiler`, async () => {
      const mod = await import(join(ROOT, src as string))
      expect('setTranspiler' in mod).toBe(false)
    })
})
