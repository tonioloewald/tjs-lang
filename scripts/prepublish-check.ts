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
 * The actual fix is upstream of this file: `prepublishOnly` now runs `bun run make` FIRST,
 * so `dist/` is rebuilt from the tree being published every single time and staleness is not
 * a state the publish can be in. That makes a post-publish "did it work?" ritual unnecessary,
 * which is the point — a check you have to remember is not a control.
 *
 * What remains here is the cheap backstop for the OTHER half: a build that half-succeeds.
 * `make` starts with `rm -rf dist`, so an interrupted or partially-failed build leaves a tree
 * that still packs, just with holes — and this repo has already shipped an EMPTY module once
 * (the functions transpile truncated its target before failing). So: read `exports`, resolve
 * every path it names, and refuse if any is missing or empty.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

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

if (git('status', '--porcelain').out) {
  problems.push(
    'the working tree has uncommitted changes — publish what you committed'
  )
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
const published = npm('view', pkg0.name, 'version')
if (published.ok && published.out && published.out !== version) {
  const prevTag = `v${published.out}`
  if (!git('rev-parse', `${prevTag}^{commit}`).ok) {
    problems.push(
      `${published.out} is on npm but has NO tag ${prevTag} — the previous release was ` +
        `published and never tagged. Tag it before shipping another (find the commit with ` +
        `\`git log --oneline --grep "${published.out}"\`), or the history loses the name ` +
        `for a version that is permanently public.`
    )
  }
}

// `@{u}` is the upstream of the current branch; unpushed commits mean the reviewed history
// exists only here.
const unpushed = git('rev-list', '@{u}..HEAD', '--count')
if (unpushed.ok && unpushed.out !== '0') {
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
      )}\n    (prepublishOnly runs \`bun run make\` first, so this means the BUILD failed, not that you forgot to run it)`
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
