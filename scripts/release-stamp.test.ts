/**
 * The stamp decides whether `npm publish` may skip the build and the full suite — i.e.
 * whether untested code can ship. Every way the stamp can stop describing the publish is a
 * case here, against a real scratch git repo, plus the one case where it does.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashDist, releaseStampProblem } from './release-stamp'

let root = ''
const git = (...args: string[]) => {
  const p = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe' })
  return new TextDecoder().decode(p.stdout).trim()
}
/** Write a stamp exactly as release-gate.ts does, for the current HEAD and dist/. */
const stamp = () =>
  writeFileSync(
    join(root, '.release-gate'),
    `${git('rev-parse', 'HEAD')}\ndist-sha256 ${hashDist(root)}\n# comment\n`
  )

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stamp-'))
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  // dist/ and the stamp are gitignored, as in the real repo — so git cannot see them.
  writeFileSync(join(root, '.gitignore'), 'dist/\n.release-gate\n')
  writeFileSync(join(root, 'a.ts'), 'export const a = 1\n')
  mkdirSync(join(root, 'dist'))
  writeFileSync(join(root, 'dist', 'index.js'), 'export const a = 1\n')
  git('add', '.')
  git('commit', '-qm', 'one')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('releaseStampProblem', () => {
  it('COVERS the publish: same commit, clean tree, identical dist/ — apparatus check', () => {
    // Every refusal below is satisfied by a function that always refuses.
    stamp()
    expect(releaseStampProblem(root)).toBeNull()
  })

  it('refuses with no stamp', () => {
    expect(releaseStampProblem(root)).toBe('no stamp')
  })

  it('refuses when HEAD moved past the stamp', () => {
    stamp()
    writeFileSync(join(root, 'a.ts'), 'export const a = 2\n')
    git('commit', '-qam', 'two')
    expect(releaseStampProblem(root)).toMatch(/^stamp names/)
  })

  it('refuses with uncommitted changes — the stamp describes a COMMIT', () => {
    stamp()
    writeFileSync(join(root, 'a.ts'), 'export const a = 3\n')
    expect(releaseStampProblem(root)).toBe('the working tree is dirty')
  })

  it('refuses when dist/ was REBUILT differently — the case a SHA cannot see', () => {
    // dist/ is gitignored, so HEAD and a clean tree both still match. This is the check
    // that stops untested bundles shipping under a valid-looking stamp.
    stamp()
    writeFileSync(join(root, 'dist', 'index.js'), 'export const a = 999\n')
    expect(git('status', '--porcelain')).toBe('')
    expect(releaseStampProblem(root)).toBe(
      'dist/ changed since the suite passed'
    )
  })

  it('refuses when a file was ADDED to dist/', () => {
    stamp()
    writeFileSync(join(root, 'dist', 'extra.js'), '')
    expect(releaseStampProblem(root)).toBe(
      'dist/ changed since the suite passed'
    )
  })

  it('refuses an old-format stamp (SHA only) rather than trusting it', () => {
    writeFileSync(join(root, '.release-gate'), `${git('rev-parse', 'HEAD')}\n`)
    expect(releaseStampProblem(root)).toBe('stamp predates dist hashing')
  })
})
