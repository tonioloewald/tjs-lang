/**
 * The stamp decides whether `npm publish` may skip the build and the full suite — i.e.
 * whether untested code can ship. Every way the stamp can stop describing the publish is a
 * case here, against a real scratch git repo, plus the one case where it does.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashDist, releaseStampProblem, writeStamp } from './release-stamp'

let root = ''
// Isolated from the contributor's own git config — commit signing, a global hooksPath or a
// template would otherwise make these fail (or hang on a passphrase) for reasons unrelated to
// the code. Setup commands are also CHECKED: a silently failed `git commit` in setup would make
// every "refuses" case pass for the wrong reason (0.14.0 re-review).
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}
const git = (...args: string[]) => {
  const p = Bun.spawnSync(['git', '-C', root, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: GIT_ENV,
  })
  if (p.exitCode !== 0 && ['init', 'config', 'add', 'commit'].includes(args[0]))
    throw new Error(
      `test setup failed: git ${args.join(' ')}\n${new TextDecoder().decode(
        p.stderr
      )}`
    )
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
  writeFileSync(
    join(root, '.gitignore'),
    'dist/\n.release-gate\n.release-gate-verified\n'
  )
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

describe('writeStamp — the WRITER enforces the invariant, so no caller can stamp unsafely', () => {
  // The 0.14.0 re-review's B-1. The clean-tree refusal ran only under `--prepare`; on the plain
  // `npm publish` path release-gate built, tested and STAMPED whatever was on disk. Then:
  //   npm publish (dirty)  -> gate stamps HEAD + that dist/  -> prepublish-check refuses: dirty
  //   git checkout .       -> the obvious response to that refusal
  //   npm publish          -> stamp matches HEAD, tree clean, dist/ unchanged -> SKIPS the suite
  // and packs a dist/ built from code that is in no commit. Putting the check in the writer
  // rather than in each caller is the class fix: a new caller cannot forget it.
  it('REFUSES on a dirty tree and writes nothing — neither stamp nor ledger', () => {
    writeFileSync(join(root, 'a.ts'), 'export const a = 42 // uncommitted\n')
    const r = writeStamp(root)
    expect(r.ok).toBe(false)
    expect(existsSync(join(root, '.release-gate'))).toBe(false)
    expect(existsSync(join(root, '.release-gate-verified'))).toBe(false)
  })

  it('the B-1 sequence end to end: after a discard, nothing covers the publish', () => {
    writeFileSync(join(root, 'a.ts'), 'export const a = 42\n')
    // dist/ built from the uncommitted edit:
    writeFileSync(join(root, 'dist', 'index.js'), 'export const a = 42\n')
    writeStamp(root) // the dirty publish attempt
    git('checkout', '--', 'a.ts') // the obvious response to "tree is dirty"
    expect(git('status', '--porcelain')).toBe('')
    // Before the fix this returned null: stamp matched HEAD, tree clean, dist/ unchanged.
    expect(releaseStampProblem(root)).toBe('no stamp')
  })

  it('writes both on a clean tree, and the result covers the publish — apparatus check', () => {
    const r = writeStamp(root)
    expect(r.ok).toBe(true)
    expect(releaseStampProblem(root)).toBeNull()
    expect(
      readFileSync(join(root, '.release-gate-verified'), 'utf8')
    ).toContain(git('rev-parse', 'HEAD'))
  })
})
