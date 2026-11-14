/**
 * Cross-file `wasm function` composition through the shipped tools (#4125).
 *
 * `app.tjs` imports `sq` from `./lib.tjs` and calls it inside its own `wasm function`. Only
 * the API passed a ModuleLoader, so `tjs emit`, `run`, `check` and the Bun plugins failed on it
 * with "Unsupported function call". Run from another working directory, so a relative import
 * must resolve from the file, not from the process.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tjsPlugin } from '../bun-plugin/build-plugin'

const CLI = join(import.meta.dir, 'tjs.ts')
let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tjs-wasm-compose-'))
  writeFileSync(
    join(dir, 'lib.tjs'),
    'export wasm function sq(x: f64): f64 { return x * x }\n'
  )
  writeFileSync(
    join(dir, 'app.tjs'),
    `import { sq } from './lib.tjs'
export wasm function sq2(x: f64): f64 { return sq(x) + sq(x) }
console.log('result', sq2(3))
`
  )
})
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

const cli = (...args: string[]) =>
  spawnSync('bun', [CLI, ...args], { encoding: 'utf8', cwd: tmpdir() })

describe('wasm function composition in the CLI and the plugin', () => {
  it('tjs run composes the imported wasm function', () => {
    const r = cli('run', join(dir, 'app.tjs'))
    expect(r.stdout).toContain('result 18')
  })
  it('tjs check and tjs emit accept the file', () => {
    expect(cli('check', join(dir, 'app.tjs')).status).toBe(0)
    const e = cli('emit', join(dir, 'app.tjs'))
    expect(e.status).toBe(0)
    expect(e.stdout).toContain('WebAssembly')
  })
  it('Bun.build with tjsPlugin composes it', async () => {
    const out = await Bun.build({
      entrypoints: [join(dir, 'app.tjs')],
      outdir: join(dir, 'out'),
      plugins: [tjsPlugin()],
      target: 'bun',
    })
    expect(out.success).toBe(true)
    const r = spawnSync('bun', [out.outputs[0].path], { encoding: 'utf8' })
    expect(r.stdout).toContain('result 18')
  })
})
