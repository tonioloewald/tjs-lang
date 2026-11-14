/**
 * `tjsPlugin({ convertTs: true })` loads `.ts` through `fromTS` (decided 2026-11-14: an opt-in).
 *
 * Without it Bun strips a `.ts` file's types and checks nothing. With it the file goes TypeScript
 * -> TJS -> JavaScript; converted TypeScript keeps JavaScript's semantics, so a file that opts in
 * with `/* @tjs TjsStrict *\/` gets its inputs checked. Off by default (it loads the TypeScript
 * compiler).
 */
import { describe, it, expect, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tjsPlugin } from './build-plugin'

const root = mkdtempSync(join(tmpdir(), 'tjs-convert-ts-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
writeFileSync(
  join(root, 'strict.ts'),
  `/* @tjs TjsStrict */\nexport function double(n: number): number { return n * 2 }\n`
)

const bundle = async (plugins: any[]) => {
  const out = await Bun.build({
    entrypoints: [join(root, 'strict.ts')],
    plugins,
    target: 'bun',
  })
  expect(out.success).toBe(true)
  // Each output in its own directory: importing a second bundle beside the first in one test
  // process failed to resolve (Bun's loader), though each case passes alone.
  const dir = mkdtempSync(join(root, 'out-'))
  const file = join(dir, 'bundle.mjs')
  writeFileSync(file, await out.outputs[0].text())
  return import(file)
}

describe('convertTs', () => {
  it('a TjsStrict .ts file gets its inputs checked', async () => {
    const { double } = await bundle([tjsPlugin({ convertTs: true })])
    expect(double(2)).toBe(4)
    const refused = double('x' as any)
    expect(refused instanceof Error).toBe(true)
  })
  it('without the option, Bun strips the types and checks nothing (the default)', async () => {
    const { double } = await bundle([])
    expect(Number.isNaN(double('x' as any))).toBe(true)
  })
})
