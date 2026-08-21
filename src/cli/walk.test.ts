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
