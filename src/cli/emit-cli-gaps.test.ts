/**
 * Two `tjs emit` gaps (#4126).
 *
 * 1. `tjs emit f.tjs -o outdir/` took `outdir/` as the file to write: ENOENT when it was
 *    missing, EISDIR when it existed. A trailing separator, or an existing directory, now means
 *    `outdir/f.js`.
 * 2. A directory emit with `--verbose` printed each file's output line on stdout and its test
 *    line on stderr, so the next file's test line could land between a file's output line and
 *    its own. All narration is on stderr now, and a file's test line follows its output line.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const CLI = join(import.meta.dir, 'tjs.ts')
let dir: string
const cli = (...args: string[]) =>
  spawnSync('bun', [CLI, ...args], { encoding: 'utf8', cwd: dir })

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tjs-emit-gaps-'))
  mkdirSync(join(dir, 'src'))
  writeFileSync(
    join(dir, 'src', 'main.tjs'),
    'export function add(a: 1, b: 2): 3 { return a + b }\n'
  )
  writeFileSync(
    join(dir, 'src', 'cart.tjs'),
    "export function mul(a: 2, b: 3): 6 { return a * b }\ntest 'm' { expect(mul(2, 2)).toBe(4) }\n"
  )
})
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('tjs emit', () => {
  it('-o dir/ writes dir/<name>.js, creating dir', () => {
    expect(cli('emit', 'src/main.tjs', '-o', 'fresh/').status).toBe(0)
    expect(existsSync(join(dir, 'fresh', 'main.js'))).toBe(true)
  })
  it('-o naming an existing directory writes into it', () => {
    mkdirSync(join(dir, 'exists'))
    expect(cli('emit', 'src/main.tjs', '-o', 'exists').status).toBe(0)
    expect(existsSync(join(dir, 'exists', 'main.js'))).toBe(true)
  })
  it('-o naming a file still writes that file (the other direction)', () => {
    expect(cli('emit', 'src/main.tjs', '-o', 'named.js').status).toBe(0)
    expect(existsSync(join(dir, 'named.js'))).toBe(true)
  })
  it('a verbose directory emit reads file by file, on one stream', () => {
    const r = cli('emit', 'src', '-o', 'out', '--verbose')
    const lines = r.stderr.split('\n').filter((l) => /^✓ /.test(l))
    // each file's output line is followed by its own test line
    for (let i = 0; i < lines.length; i += 2) {
      const file = lines[i].match(/^✓ (\S+) ->/)?.[1]
      expect(file).toBeDefined()
      expect(lines[i + 1].startsWith(`✓ ${file}:`)).toBe(true)
    }
    expect(r.stdout).not.toContain('->')
  })
})
