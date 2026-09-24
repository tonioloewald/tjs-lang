/**
 * The `.release-gate` stamp: what it records, and the one decision that reads it.
 *
 * `prepublishOnly` skips the build and the full suite when this says the stamp covers the
 * publish — so this function is what decides whether UNTESTED code can ship. It lives apart
 * from `release-gate.ts` (which runs the suite at import) so it can be tested directly.
 * See `release-gate.ts` → "Run it AHEAD of the publish" for why each condition exists.
 */
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'

/** Content hash of everything under `<root>/dist` — paths and bytes, in a stable order. */
export function hashDist(root: string): string {
  const dir = join(root, 'dist')
  if (!existsSync(dir)) return 'absent'
  const files: string[] = []
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const f = join(d, n)
      if (statSync(f).isDirectory()) walk(f)
      else files.push(f)
    }
  }
  walk(dir)
  const h = createHash('sha256')
  for (const f of files.sort()) {
    h.update(relative(root, f))
    h.update('\0')
    h.update(readFileSync(f))
    h.update('\0')
  }
  return h.digest('hex')
}

function git(root: string, ...args: string[]): string {
  const p = Bun.spawnSync(['git', '-C', root, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return new TextDecoder().decode(p.stdout).trim()
}

/** Why the stamp does NOT cover a publish of `root` right now, or `null` if it does. */
export function releaseStampProblem(root: string): string | null {
  const stamp = join(root, '.release-gate')
  if (!existsSync(stamp)) return 'no stamp'
  const lines = readFileSync(stamp, 'utf8').split('\n')
  const head = git(root, 'rev-parse', 'HEAD')
  if (lines[0] !== head)
    return `stamp names ${lines[0]?.slice(0, 7)}, HEAD is ${head.slice(0, 7)}`
  if (git(root, 'status', '--porcelain') !== '')
    return 'the working tree is dirty'
  const recorded = lines
    .find((l) => l.startsWith('dist-sha256 '))
    ?.slice('dist-sha256 '.length)
  if (!recorded) return 'stamp predates dist hashing'
  if (recorded !== hashDist(root)) return 'dist/ changed since the suite passed'
  return null
}

/**
 * Write the stamp AND the ledger entry for HEAD — or refuse, writing neither.
 *
 * The clean-tree check lives HERE, in the writer, not in its callers. The 0.14.0 re-review's
 * B-1 was a caller that forgot it: on the plain `npm publish` path release-gate stamped a dirty
 * tree, so after the publish was refused and the edits discarded, the next publish found a
 * matching stamp and skipped the suite — shipping a dist/ built from code in no commit. A stamp
 * names a COMMIT, so it may only ever describe committed code; enforcing that at the one place
 * stamps are written means a new caller cannot get it wrong.
 */
export function writeStamp(
  root: string
): { ok: true; sha: string } | { ok: false; reason: string } {
  if (git(root, 'status', '--porcelain') !== '')
    return {
      ok: false,
      reason:
        'the working tree is dirty — a stamp names a COMMIT, so it may only describe committed code',
    }
  const sha = git(root, 'rev-parse', 'HEAD')
  if (!sha) return { ok: false, reason: 'could not resolve HEAD' }
  // Line 1 is the SHA and nothing else: `.githooks/pre-push` reads it with `head -n1`.
  writeFileSync(
    join(root, '.release-gate'),
    `${sha}\n`.concat(
      `dist-sha256 ${hashDist(root)}\n`,
      '# Written by scripts/release-stamp.ts: the full suite passed for this commit.\n',
      '# .githooks/pre-push skips its own run when line 1 names the SHA being tagged;\n',
      '# prepublishOnly skips when line 1 is HEAD, the tree is clean, and dist/ still hashes the same.\n'
    )
  )
  // The LEDGER: every SHA whose full suite passed here. The stamp names only the latest.
  appendFileSync(join(root, '.release-gate-verified'), `${sha}\n`)
  return { ok: true, sha }
}
