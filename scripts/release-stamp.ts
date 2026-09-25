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

/**
 * Why the working tree is NOT clean, or `null` if it is. The ONE clean-tree check — the stamp
 * writer, the stamp reader, release-gate and prepublish-check all call this.
 *
 * Two things the four hand-rolled copies got wrong (0.14.0 second re-review):
 *   - they compared `git status` stdout to '' and ignored the EXIT CODE, so a failing
 *     `git status` (a corrupt index) read as a clean tree — unknown is not clean;
 *   - they inherited `status.showUntrackedFiles`, so a user setting could hide an untracked
 *     file that npm would nonetheless pack. `--untracked-files=all` overrides it.
 */
export function treeDirtyReason(root: string): string | null {
  const p = Bun.spawnSync(
    ['git', '-C', root, 'status', '--porcelain', '--untracked-files=all'],
    { stdout: 'pipe', stderr: 'pipe' }
  )
  if (p.exitCode !== 0)
    return `could not read the working tree (git status exited ${
      p.exitCode
    }): ${new TextDecoder().decode(p.stderr).trim().split('\n')[0]}`
  return new TextDecoder().decode(p.stdout).trim() === ''
    ? null
    : 'the working tree is dirty'
}

/**
 * Why this environment would NOT run the full suite, or `null`. `bun test` inherits the caller's
 * environment, and this repo's lanes honour `SKIP_*` switches — so with `SKIP_LLM_TESTS` (or any
 * `SKIP_*`) exported in the shell, the release gate ran a PARTIAL suite and stamped HEAD as fully
 * tested (0.14.0 second re-review). Refusing beats scrubbing: a scrubbed variable is a surprise
 * to whoever set it, and a refusal says what happened. Any `SKIP_*`, not a fixed list, so a
 * switch added later is covered without anyone remembering this function.
 */
export function suiteEnvProblem(
  env: Record<string, string | undefined>
): string | null {
  const set = Object.keys(env).filter(
    (k) => k.startsWith('SKIP_') && env[k] !== undefined && env[k] !== ''
  )
  return set.length
    ? `${set.join(', ')} ${
        set.length === 1 ? 'is' : 'are'
      } set, so \`bun test\` would skip those lanes — a partial run cannot certify a release. Unset ${
        set.length === 1 ? 'it' : 'them'
      } and run again.`
    : null
}

/** Why the stamp does NOT cover a publish of `root` right now, or `null` if it does. */
export function releaseStampProblem(root: string): string | null {
  const stamp = join(root, '.release-gate')
  if (!existsSync(stamp)) return 'no stamp'
  const lines = readFileSync(stamp, 'utf8').split('\n')
  const head = git(root, 'rev-parse', 'HEAD')
  if (lines[0] !== head)
    return `stamp names ${lines[0]?.slice(0, 7)}, HEAD is ${head.slice(0, 7)}`
  const dirty = treeDirtyReason(root)
  if (dirty) return dirty
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
  const dirty = treeDirtyReason(root)
  if (dirty)
    return {
      ok: false,
      reason: `${dirty} — a stamp names a COMMIT, so it may only describe committed code`,
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
