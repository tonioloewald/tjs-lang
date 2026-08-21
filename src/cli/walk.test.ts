/**
 * `walk.ts` shipped with no tests, and the two things it gets wrong are both silent-ish.
 *
 * It used `statSync`, which FOLLOWS symlinks. Three consequences, all reproduced before
 * the fix:
 *
 *   - a DANGLING link threw a raw `ENOENT` and `tjs check <dir>` checked zero files
 *   - a link to a DIRECTORY was descended, so the walk escaped the tree it was handed and
 *     double-counted those files' warnings into `--max-warnings`
 *   - a link CYCLE recursed 33 deep and died with `ELOOP`
 *
 * A broken or looping link in a tree is a normal thing to find, not a reason to abort, and
 * "check this directory" must not mean "check wherever this directory points".
 */
import { describe, it, expect, afterAll } from 'bun:test'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { findFiles, shouldDescend } from './walk'

const roots: string[] = []
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

function tree(): string {
  const root = mkdtempSync(join(tmpdir(), 'tjs-walk-'))
  roots.push(root)
  return root
}

const isTjs = (n: string) => n.endsWith('.tjs')
// `.map(basename)` passes the INDEX as basename's second (`ext`) argument — an arity
// footgun, not a shorthand. It throws `The "ext" property must be of type string, got
// number` on the second element.
const names = (fs: string[]) => fs.map((f) => basename(f)).sort()

describe('findFiles', () => {
  it('finds files recursively', () => {
    const root = tree()
    writeFileSync(join(root, 'a.tjs'), '')
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'b.tjs'), '')
    writeFileSync(join(root, 'sub', 'c.txt'), '')
    expect(names(findFiles(root, isTjs))).toEqual(['a.tjs', 'b.tjs'])
  })

  it('skips node_modules and dot-directories', () => {
    const root = tree()
    writeFileSync(join(root, 'a.tjs'), '')
    for (const d of ['node_modules', '.git', '.hidden']) {
      mkdirSync(join(root, d))
      writeFileSync(join(root, d, 'skip.tjs'), '')
    }
    expect(names(findFiles(root, isTjs))).toEqual(['a.tjs'])
  })

  it('a DANGLING symlink does not abort the walk', () => {
    const root = tree()
    writeFileSync(join(root, 'a.tjs'), '')
    symlinkSync(join(root, 'gone.tjs'), join(root, 'dangling.tjs'))
    // Before the fix this threw `ENOENT` and returned nothing at all.
    expect(names(findFiles(root, isTjs))).toEqual(['a.tjs'])
  })

  it('does not follow a symlinked DIRECTORY out of the tree', () => {
    const root = tree()
    const outside = tree()
    writeFileSync(join(root, 'a.tjs'), '')
    writeFileSync(join(outside, 'elsewhere.tjs'), '')
    symlinkSync(outside, join(root, 'link'))
    // "Check this directory" must not mean "check wherever this directory points".
    expect(names(findFiles(root, isTjs))).toEqual(['a.tjs'])
  })

  it('a symlink CYCLE terminates', () => {
    const root = tree()
    writeFileSync(join(root, 'a.tjs'), '')
    symlinkSync(root, join(root, 'cycle'))
    // Before the fix: 33 levels deep, then ELOOP.
    expect(names(findFiles(root, isTjs))).toEqual(['a.tjs'])
  })

  it('DOES collect a symlink to a real file', () => {
    // The half that must follow. Trusting the Dirent blindly (a symlink is neither
    // `isFile()` nor `isDirectory()`) silently skipped it, so `tjs check <dir>` printed a
    // tick and exited 0 without reading a source file the user had put there — green
    // because it did not look. 0.13.0 followed the link, so this was a regression.
    const root = tree()
    const outside = tree()
    writeFileSync(join(outside, 'target.tjs'), '')
    symlinkSync(join(outside, 'target.tjs'), join(root, 'linked.tjs'))
    expect(names(findFiles(root, isTjs))).toEqual(['linked.tjs'])
  })

  it('matches on the BASENAME, not the path', () => {
    // A caller's `.tjs` test must not be satisfied by a directory component.
    const root = tree()
    mkdirSync(join(root, 'stuff.tjs'))
    writeFileSync(join(root, 'stuff.tjs', 'inner.js'), '')
    expect(findFiles(root, isTjs)).toEqual([])
  })
})

describe('shouldDescend', () => {
  it('is the one policy the three walks share', () => {
    expect(shouldDescend('src')).toBe(true)
    expect(shouldDescend('node_modules')).toBe(false)
    expect(shouldDescend('.git')).toBe(false)
    expect(shouldDescend('.')).toBe(false)
  })
})

/**
 * `emit -r` and `convert -r` walk the same way `check` does.
 *
 * They were left on `readdirSync` + `statSync` when `findFiles` moved to Dirents, so the
 * three walks disagreed about what a symlink is — and these two are the ones that WRITE:
 *
 *   - a dangling link killed the run with a raw ENOENT and emitted ZERO files, losing
 *     valid siblings that had nothing to do with the link
 *   - a linked directory was descended, so output was written derived from a file OUTSIDE
 *     the tree the user named, while the tally still reported success
 *   - a cycle recursed 33 levels, writing 33 nested copies, before ELOOP
 *
 * Driven through the CLI end-to-end, because the defect was in the command's own walk and
 * a unit test of `findFiles` never touched it.
 */
describe('emit and convert survive symlinks', () => {
  const CLI = join(import.meta.dir, 'tjs.ts')

  async function run(cmd: string, ...args: string[]) {
    const proc = Bun.spawn(['bun', CLI, cmd, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    return { code: await proc.exited, text: out + err }
  }

  const SRC = `function ok(x: 1):! 0 { return x }\n`

  it('a dangling link does not abort emit, and siblings still emit', async () => {
    const root = tree()
    writeFileSync(join(root, 'good.tjs'), SRC)
    symlinkSync(join(root, 'gone.tjs'), join(root, 'dangling.tjs'))
    const out = join(tree(), 'out')
    const r = await run('emit', root, '-o', out, '-r')
    expect(r.text).not.toContain('ENOENT')
    expect(existsSync(join(out, 'good.js'))).toBe(true)
  })

  it('emit does not descend a symlinked directory out of the tree', async () => {
    const root = tree()
    const outside = tree()
    writeFileSync(join(root, 'good.tjs'), SRC)
    mkdirSync(join(outside, 'secret'))
    writeFileSync(join(outside, 'secret', 'secret.tjs'), SRC)
    symlinkSync(join(outside, 'secret'), join(root, 'link'))
    const out = join(tree(), 'out')
    await run('emit', root, '-o', out, '-r')
    expect(existsSync(join(out, 'good.js'))).toBe(true)
    expect(existsSync(join(out, 'link', 'secret.js'))).toBe(false)
  })

  it('a symlink cycle terminates instead of writing 33 nested copies', async () => {
    const root = tree()
    writeFileSync(join(root, 'good.tjs'), SRC)
    symlinkSync(root, join(root, 'cycle'))
    const out = join(tree(), 'out')
    const r = await run('emit', root, '-o', out, '-r')
    expect(r.text).not.toContain('ELOOP')
    expect(existsSync(join(out, 'cycle', 'cycle', 'good.js'))).toBe(false)
  })

  it('convert skips node_modules and dot-directories', async () => {
    const root = tree()
    writeFileSync(join(root, 'a.ts'), `export const x: number = 1\n`)
    mkdirSync(join(root, 'node_modules', 'dep'), { recursive: true })
    writeFileSync(
      join(root, 'node_modules', 'dep', 'b.ts'),
      `export const y = 2\n`
    )
    const out = join(tree(), 'out')
    await run('convert', root, '-o', out, '-r')
    expect(existsSync(join(out, 'node_modules'))).toBe(false)
  })
})
