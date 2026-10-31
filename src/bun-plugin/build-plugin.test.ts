/**
 * `tjsPlugin` bundles `.tjs` with `Bun.build` (#3593), and runs signature examples on load
 * only when asked (#3599). Both from tosijs-native, which had to write its own build plugin
 * and found a wrong return example invisible to `bun test`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tjsPlugin } from './build-plugin'

let root = ''
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'tjs-build-'))
  writeFileSync(
    join(root, 'math.tjs'),
    `export function double(n: 0):! 0 { return n * 2 }\n`
  )
  writeFileSync(
    join(root, 'index.tjs'),
    `import { double } from './math.tjs'\nexport function quad(n: 0):! 0 { return double(double(n)) }\n`
  )
  // A WRONG return example: add(2, 3) is 5, not 0.
  writeFileSync(
    join(root, 'wrong.tjs'),
    `export function add(a: 2, b: 3): 0 { return a + b }\n`
  )
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('tjsPlugin with Bun.build', () => {
  it('bundles a .tjs graph that runs in plain node, checks intact', async () => {
    const out = await Bun.build({
      entrypoints: [join(root, 'index.tjs')],
      outdir: join(root, 'dist'),
      format: 'esm',
      target: 'node',
      plugins: [tjsPlugin()],
    })
    expect(out.success).toBe(true)
    const p = Bun.spawnSync(
      [
        'node',
        '-e',
        "import('./dist/index.js').then(m => { console.log(m.quad(3)); console.log(m.quad('x') instanceof Error) })",
      ],
      { cwd: root, stdout: 'pipe', stderr: 'pipe' }
    )
    expect(new TextDecoder().decode(p.stdout).trim().split('\n')).toEqual([
      '12',
      'true',
    ])
  })

  it('runs return examples only when asked (#3599)', async () => {
    const build = (runTests?: boolean) =>
      Bun.build({
        entrypoints: [join(root, 'wrong.tjs')],
        outdir: join(root, `dist-${runTests ? 'tests' : 'plain'}`),
        plugins: [tjsPlugin(runTests === undefined ? {} : { runTests })],
        throw: false,
      })
    expect((await build()).success).toBe(true) // the default: off
    expect((await build(true)).success).toBe(false)
  })
})

describe('the preload plugin opts in with TJS_RUN_TESTS=1 (#3599)', () => {
  const preload = join(import.meta.dir, 'tjs-plugin.ts')
  const run = (env: Record<string, string>) =>
    Bun.spawnSync(['bun', '--preload', preload, join(root, 'wrong.tjs')], {
      cwd: root,
      env: { ...process.env, ...env },
      stdout: 'pipe',
      stderr: 'pipe',
    }).exitCode
  it('off by default, so the import succeeds', () => {
    expect(run({ TJS_RUN_TESTS: '' })).toBe(0)
  })
  it('on, a wrong return example fails the import', () => {
    expect(run({ TJS_RUN_TESTS: '1' })).not.toBe(0)
  })
})
