/**
 * Refuse to publish from a tree that is not exactly what was tagged and pushed.
 *
 * This exists because the failure it prevents ALREADY HAPPENED. 0.13.0 was published from
 * a working tree with no tag: the version was meant to be a release candidate, the
 * `.githooks/pre-push` full-suite gate never fired (it triggers on a tag push), and the
 * result sat on `latest` carrying a blocker that a later review found. Recovering cost a
 * retroactive tag, two deprecations and three patch releases.
 *
 * ## The order changed: PUBLISH, then tag (2026-09-13)
 *
 * This file used to require a tag at HEAD, because the release gate lived in
 * `.githooks/pre-push` and fired on a TAG PUSH — so tagging first was what made the suite
 * run. Under publish-then-tag that arrangement inverts into a trap: the gate would fire
 * *after* `npm publish`, which is the one step that cannot be taken back. A gate downstream
 * of the irreversible act is decoration.
 *
 * So the full suite moved INTO `prepublishOnly`, ahead of this check. The comment that used
 * to sit here — "the test gate lives in the pre-push hook and running it again here would
 * just make publishing slow enough to be bypassed" — was right about the cost and wrong
 * about where the gate belongs; the answer to slowness is the stamp in the pre-push hook
 * (which skips a re-run it can prove is redundant), not moving the gate somewhere cheaper
 * than it is useful.
 *
 * What this file asserts is that the artifact you are about to send is the artifact that was
 * reviewed:
 *
 *   1. the working tree is clean            (you are not publishing uncommitted work)
 *   2. HEAD is pushed                       (the code is somewhere other than this laptop)
 *   3. no CONFLICTING tag `v<version>`      (the name is not already spoken for)
 *   4. the PREVIOUS published version is tagged
 *                                           (the step after publish actually happens —
 *                                            see the block below for why this is the only
 *                                            place it can be enforced)
 *
 * `npm publish --ignore-scripts` bypasses this, which is fine: the point is to make the
 * accident hard, not to make the deliberate act impossible.
 *
 * ## Plus: every path `exports` names actually exists in the built tree
 *
 * Added 2026-09-04, and the reason is worth stating because it changes what this file is for.
 * 0.13.7 shipped a security fix in `src/` but not in `dist/` — Bun resolves `src/` so it
 * looked fixed locally, Node resolves `dist/` so consumers got the vulnerable build. The
 * response at the time was a freshness TEST, but `dist/` is gitignored, so the tree-clean
 * check above is structurally blind to it, and CI rebuilds before asserting freshness, so
 * that guard cannot fail where it runs.
 *
 * The actual fix is upstream of this file, in `scripts/release-gate.ts`, which runs before
 * this in `prepublishOnly`. Either it rebuilds `dist/` from the committed tree and runs the
 * full suite, or it SKIPS both because a stamp proves they already ran for exactly this
 * commit and this `dist/` (same SHA, clean tree, identical `dist/` hash — see
 * `release-stamp.ts`). Either way staleness is not a state the publish can be in. (This said
 * "`make` runs FIRST, every single time" until the stamp made that untrue — 0.14.0
 * re-review.)
 *
 * What remains here is the cheap backstop for the OTHER half: a build that half-succeeds.
 * `make` starts with `rm -rf dist`, so an interrupted or partially-failed build leaves a tree
 * that still packs, just with holes — and this repo has already shipped an EMPTY module once
 * (the functions transpile truncated its target before failing). So: read `exports`, resolve
 * every path it names, and refuse if any is missing or empty.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { treeDirtyReason } from './release-stamp'

const ROOT = join(import.meta.dir, '..')

function git(...args: string[]): { ok: boolean; out: string } {
  const p = Bun.spawnSync(['git', '-C', ROOT, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  return {
    ok: p.exitCode === 0,
    out: new TextDecoder().decode(p.stdout).trim(),
  }
}

/** `npm view`, which needs the network. A failure is "unknown", never "absent". */
function npm(...args: string[]): { ok: boolean; out: string } {
  const p = Bun.spawnSync(['npm', ...args], { stdout: 'pipe', stderr: 'pipe' })
  return {
    ok: p.exitCode === 0,
    out: new TextDecoder().decode(p.stdout).trim(),
  }
}

const problems: string[] = []
const pkg0 = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const version = pkg0.version as string
const tag = `v${version}`

// The ONE clean-tree check (release-stamp.ts): honours git's exit code, so an unreadable tree
// is a refusal rather than "clean", and counts untracked files whatever the user's git config.
{
  const dirty = treeDirtyReason(ROOT)
  if (dirty) problems.push(`${dirty} — publish what you committed`)
}

// The tag for THIS version is not required to exist — under publish-then-tag it cannot.
//
// It is, however, required not to CONTRADICT us: a tag that already exists and points
// somewhere other than HEAD means the name is spoken for by different code.
const tagCommit = git('rev-parse', `${tag}^{commit}`)
if (tagCommit.ok && tagCommit.out !== git('rev-parse', 'HEAD').out) {
  problems.push(
    `${tag} already exists at ${tagCommit.out.slice(0, 7)} but HEAD is at ` +
      `${git('rev-parse', 'HEAD').out.slice(
        0,
        7
      )} — that tag names different code. ` +
      `Either you are republishing a version, or the tag is wrong.`
  )
}

// THE HOLE THE ORDER FLIP OPENS, and the reason this block exists.
//
// Tag-before-publish made "published but untagged" impossible: the tag was a PREREQUISITE.
// Publish-then-tag makes it merely a step you might not get to — and the moment `npm
// publish` returns, the release is irreversible while the tag is still hypothetical. Nothing
// fails if you stop there. You would find out months later, from a `git describe` that skips
// a version.
//
// So the discipline is enforced one release LATE, which is the only place it can be checked
// without being the thing it is checking: before publishing N, assert that N-1 got tagged.
// Still cheap to fix at that point (`git tag v<prev> <sha> && git push origin v<prev>`), and
// it cannot rot, because the next publish always runs it.
//
// 0.13.0 is the precedent for why this matters: it shipped from an untagged tree, and
// recovering cost a retroactive tag, two deprecations and three patch releases.
// Every DIST-TAG, not just `latest`. `npm view <pkg> version` answers with `latest` only, and
// a prerelease published to `rc` never becomes `latest` — so this check used to be blind to
// every prerelease: it passed "previous release tagged" with 0.14.0-rc.0 published and
// untagged, and called 0.14.0-rc.0 "unclaimed" while it was on the registry (2026-09-24).
const distTags = npm(
  'view',
  '--prefer-online',
  pkg0.name,
  'dist-tags',
  '--json'
)
// Unknown is NOT empty. This used to fall back to `{}` on a failed or unparseable read, which
// made "every published version is tagged" pass silently — fail-open on the one check that
// exists to catch a forgotten tag (0.14.0 re-review).
let tagged: Record<string, string> = {}
try {
  if (!distTags.ok) throw new Error('npm view failed')
  tagged = JSON.parse(distTags.out)
  if (!tagged || typeof tagged !== 'object' || !Object.keys(tagged).length)
    throw new Error('no dist-tags')
} catch {
  tagged = {}
  problems.push(
    'could not read the published dist-tags — cannot confirm every published version is tagged. Check your network, or publish deliberately with --ignore-scripts.'
  )
}
for (const [channel, v] of Object.entries(tagged)) {
  if (v === version) continue
  if (!git('rev-parse', `v${v}^{commit}`).ok) {
    problems.push(
      `${v} is on npm (dist-tag \`${channel}\`) but has NO tag v${v} — it was published and ` +
        `never tagged. Tag it before shipping another (find the commit with ` +
        `\`git log --oneline --grep "${v}"\`), or the history loses the name for a version ` +
        `that is permanently public.`
    )
  }
}

// First-party DOWNSTREAM peer ranges. A published library whose `peerDependencies` range
// excludes this version makes every npm 7+ consumer of BOTH hard-fail with ERESOLVE — an
// optional peer is only optional when absent. `bun install` resolves it cleanly, so neither
// repo's own workflow shows it. It has shipped twice: tosijs-ui#98 (0.13.0 vs `^0.12.0`) and
// tosijs-ui#182 (0.14.0 vs `^0.13.1`), each found after the fact. A 0.x caret range expires at
// EVERY minor, so without this it recurs at 0.15.0.
//
// Only libraries with a PEER range belong here. A downstream pinning us in devDependencies,
// or an app, just stays on the old version until bumped — worth a nudge, never an install
// failure (measured 2026-09-25 across the sibling repos: tosijs-ui is the only one).
//
// Prereleases are exempt: semver skips them in ranges anyway, and an rc is precisely how a
// downstream verifies before widening.
const DOWNSTREAM_PEERS = ['tosijs-ui']
if (!version.includes('-')) {
  for (const dep of DOWNSTREAM_PEERS) {
    const r = Bun.spawnSync(
      [
        'curl',
        '-s',
        '--max-time',
        '10',
        `https://registry.npmjs.org/${dep}/latest`,
      ],
      { stdout: 'pipe' }
    )
    let range: string | undefined
    try {
      const doc = JSON.parse(new TextDecoder().decode(r.stdout))
      // A registry ERROR is also JSON — `{"error":"Not found"}` has no peerDependencies either,
      // and used to read as "no range, OK". Only a real package document may say so.
      if (doc?.name !== dep || typeof doc?.version !== 'string')
        throw new Error('not a package document')
      range = doc.peerDependencies?.[pkg0.name]
    } catch {
      problems.push(
        `could not read ${dep}'s published peer range — check your network, or publish deliberately with --ignore-scripts`
      )
      continue
    }
    if (range && !Bun.semver.satisfies(version, range))
      problems.push(
        `${dep}@latest declares peerDependencies["${pkg0.name}"]: "${range}", which EXCLUDES ` +
          `${version}. Publishing makes every npm consumer of both fail with ERESOLVE. Get ` +
          `${dep} to widen its range first (publish an rc for it to verify against), or ` +
          `publish deliberately with --ignore-scripts and put the --legacy-peer-deps remedy ` +
          `in the release notes.`
      )
  }
}

// The tarball is EXACTLY the committed tree plus dist/. npm packs the WORKING tree, filtered by
// `files` — so a gitignored file that happens to sit on the publishing machine ships from that
// machine and from nowhere else. 0.14.0-rc.0 carried six: stale January build output under
// examples/modules/dist/ (with a macOS `.metadata_never_index`) and a stray
// src/lang/keywords.d.ts (0.14.0 re-review). It also makes the release stamp's claim true by
// construction: the stamp covers HEAD (tracked files) plus a hash of dist/, and with this
// invariant there is nothing else in the tarball for it to miss.
{
  const packed = Bun.spawnSync(['npm', 'pack', '--dry-run', '--json'], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe', // `prepare` writes to stderr; only stdout is the JSON
  })
  let files: string[] | null = null
  try {
    files = JSON.parse(new TextDecoder().decode(packed.stdout))[0].files.map(
      (f: { path: string }) => f.path
    )
  } catch {
    files = null
  }
  if (!files) {
    problems.push(
      'could not read `npm pack --dry-run --json` — cannot confirm the tarball is the committed tree plus dist/'
    )
  } else {
    const tracked = new Set(git('ls-files').out.split('\n'))
    const stray = files.filter(
      (f) => !tracked.has(f) && !f.startsWith('dist/') && f !== 'package.json'
    )
    if (stray.length)
      problems.push(
        `the tarball would ship ${stray.length} file(s) that no commit contains — they exist only ` +
          `on this machine:\n      ${stray.join(
            '\n      '
          )}\n    Delete them, or exclude them ` +
          `in package.json "files". The tarball must be the committed tree plus dist/.`
      )
  }
}

// This EXACT version already exists? Asked of the per-version endpoint, not the packument:
// the packument lags a publish by minutes, the per-version document does not. npm refuses a
// republish anyway, but only after the whole gate has run — and a stamp for an already-
// published version would print "Ready" for a publish that cannot happen.
{
  const res = Bun.spawnSync(
    [
      'curl',
      '-s',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      '--max-time',
      '10',
      `https://registry.npmjs.org/${pkg0.name}/${version}`,
    ],
    { stdout: 'pipe' }
  )
  const code = new TextDecoder().decode(res.stdout).trim()
  if (code === '200')
    problems.push(
      `${version} is ALREADY published — npm will refuse it. Bump the version (the successor ` +
        `to -rc.N is -rc.N+1, never a beta: releasing.md), commit, and run release:ready again.`
    )
  else if (code !== '404')
    problems.push(
      `could not ask the registry whether ${version} exists (HTTP ${
        code || 'no response'
      }) — ` +
        `check your network, or publish deliberately with --ignore-scripts`
    )
}

// `@{u}` is the upstream of the current branch; unpushed commits mean the reviewed history
// exists only here.
const unpushed = git('rev-list', '@{u}..HEAD', '--count')
if (!unpushed.ok) {
  // No upstream, or a detached HEAD. This used to skip the check entirely — fail-open: a
  // publish from an unpushed branch passed as if pushed (0.14.0 re-review).
  problems.push(
    'cannot tell whether HEAD is pushed (no upstream branch, or detached HEAD) — push with `git push -u` from a branch first'
  )
} else if (unpushed.out !== '0') {
  problems.push(`${unpushed.out} commit(s) not pushed — push before publishing`)
}

// An existing tag for THIS version must be on the remote if it exists locally — same
// reasoning as 0.13.4, which shipped because the tag was local-only. Under the new order
// this is the republish case rather than the normal one, so it is gated on existence.
if (tagCommit.ok) {
  const remoteTag = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`)
  if (!remoteTag.ok) {
    problems.push(
      `could not reach origin to confirm ${tag} was pushed — check your network, or publish deliberately with --ignore-scripts`
    )
  } else if (!remoteTag.out.includes(`refs/tags/${tag}`)) {
    problems.push(
      `${tag} exists locally but is NOT on origin — push it (\`git push origin ${tag}\`)`
    )
  }
}

// Every file `exports` promises is present and non-empty.
//
// Walks the exports map generically rather than checking a hand-written list of bundles: a
// list would need remembering every time a subpath is added, and the whole reason this block
// exists is that things which need remembering get forgotten. Relative paths only — a bare
// specifier in an exports map is a package, not our file.
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const promised = new Set<string>()
const collect = (node: unknown): void => {
  if (typeof node === 'string') {
    if (node.startsWith('./')) promised.add(node)
    return
  }
  if (node && typeof node === 'object')
    for (const v of Object.values(node as Record<string, unknown>)) collect(v)
}
collect(pkg.exports)

const missing: string[] = []
for (const rel of [...promised].sort()) {
  // A wildcard subpath (`./editors/*`) names a pattern, not a file; the concrete targets it
  // expands to are covered by the non-wildcard entries and by editors-build.test.ts.
  if (rel.includes('*')) continue
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) missing.push(`${rel} — MISSING`)
  else if (statSync(abs).size === 0) missing.push(`${rel} — EMPTY (0 bytes)`)
}
if (missing.length) {
  problems.push(
    `the built tree does not satisfy package.json "exports" — a consumer's import would ` +
      `fail on:\n      ${missing.join(
        '\n      '
      )}\n    (release-gate rebuilds dist/ or verified it by stamp, so this means the BUILD failed, not that you forgot to run it)`
  )
}

if (problems.length) {
  console.error(`\nRefusing to publish ${version}:\n`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  console.error(
    `\n0.13.0 shipped by accident from an untagged working tree; this check is why that\n` +
      `cannot happen quietly again. If you really mean it: npm publish --ignore-scripts\n`
  )
  process.exit(1)
}

console.log(
  `prepublish: tree clean, history pushed, ${tag} unclaimed, previous release tagged.`
)
console.log(
  `prepublish: REMEMBER — publish, then \`git tag ${tag} && git push origin ${tag}\`. ` +
    `The next publish refuses to run until you do.`
)
