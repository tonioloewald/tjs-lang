/**
 * The CLI honours the conversion marker, as the Bun plugin does (#3842; 2026-11-14: "the plugin
 * should be consistent but both should do what's best").
 *
 * A file `fromTS` wrote starts with `/* tjs <- x.ts *\/`, which means JavaScript semantics. The
 * CLI passed `dialect: 'tjs'` from the `.tjs` extension, which overrode the marker: `tjs emit`
 * turned a converted `a == b` into TJS's `==` and added input checks, while a Bun-plugin import of
 * the same file kept JavaScript's meaning. `dialectForSource` now leaves the dialect to the
 * marker. A string merely MENTIONING the marker is not a conversion (literal blindness).
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dialectForSource, hasConversionMarker } from '../lang/dialect'

const CLI = join(import.meta.dir, 'tjs.ts')
const roots: string[] = []
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

describe('dialectForSource', () => {
  it('a converted .tjs file gets no dialect, so tjs() reads the marker', () => {
    expect(
      dialectForSource('q.tjs', '/* tjs <- q.ts */\nexport const a = 1')
    ).toBeUndefined()
  })
  it('a native .tjs file is tjs, and a .js file is js (the other direction)', () => {
    expect(dialectForSource('q.tjs', 'export const a = 1')).toBe('tjs')
    expect(dialectForSource('q.js', '/* tjs <- q.ts */')).toBe('js')
  })
  it('the marker inside a string is not a conversion', () => {
    expect(hasConversionMarker("const doc = '/* tjs <- q.ts */'")).toBe(false)
  })
})

it('tjs emit keeps a converted file JavaScript', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tjs-marker-'))
  roots.push(root)
  writeFileSync(
    join(root, 'q.tjs'),
    `/* tjs <- q.ts */\nexport function same(a, b) { return a == b }\n`
  )
  const p = Bun.spawnSync(['bun', CLI, 'emit', join(root, 'q.tjs')])
  const out = p.stdout.toString()
  writeFileSync(join(root, 'q.mjs'), out)
  const { same } = await import(join(root, 'q.mjs'))
  expect(same('1', 1)).toBe(true) // JavaScript's ==, as the converted TypeScript meant
})
