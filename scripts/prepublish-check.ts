/**
 * Refuse to publish from a tree that is not exactly what was tagged and pushed.
 *
 * This exists because the failure it prevents ALREADY HAPPENED. 0.13.0 was published from
 * a working tree with no tag: the version was meant to be a release candidate, the
 * `.githooks/pre-push` full-suite gate never fired (it triggers on a tag push), and the
 * result sat on `latest` carrying a blocker that a later review found. Recovering cost a
 * retroactive tag, two deprecations and three patch releases.
 *
 * Every check here is about the SHAPE of the publish, not the quality of the code — the
 * test gate lives in the pre-push hook and running it again here would just make publishing
 * slow enough to be bypassed. What this asserts is that the artifact you are about to send
 * is the artifact that was reviewed:
 *
 *   1. the working tree is clean            (you are not publishing uncommitted work)
 *   2. a tag `v<version>` exists            (there is a named thing to point at)
 *   3. that tag is at HEAD                  (the tag names THIS code)
 *   4. HEAD is pushed                       (the code is somewhere other than this laptop)
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

const problems: string[] = []
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  .version as string
const tag = `v${version}`

if (git('status', '--porcelain').out) {
  problems.push(
    'the working tree has uncommitted changes — publish what you committed'
  )
}

const tagCommit = git('rev-parse', `${tag}^{commit}`)
if (!tagCommit.ok) {
  problems.push(
    `no tag ${tag} — tag the release so there is a named commit to point at ` +
      `(and so the pre-push full-suite gate runs)`
  )
} else if (tagCommit.out !== git('rev-parse', 'HEAD').out) {
  problems.push(
    `${tag} is at ${tagCommit.out.slice(0, 7)} but HEAD is at ` +
      `${git('rev-parse', 'HEAD').out.slice(
        0,
        7
      )} — the tag does not name this code`
  )
}

// `@{u}` is the upstream of the current branch; unpushed commits mean the reviewed history
// exists only here.
const unpushed = git('rev-list', '@{u}..HEAD', '--count')
if (unpushed.ok && unpushed.out !== '0') {
  problems.push(`${unpushed.out} commit(s) not pushed — push before publishing`)
}

// The TAG must be on the remote too, not merely local.
//
// This check was missing, and 0.13.4 shipped because of it: the tag existed locally, the
// branch was pushed, this guard passed — and `git push origin v0.13.4` had not landed. The
// pre-push hook that runs the full suite fires on a TAG PUSH, so an unpushed tag means the
// release gate never ran at all. That is the whole point of tagging before publishing, and
// the guard was checking the half that was not load-bearing.
//
// Cheap to get wrong by hand, too: `git tag && git push origin <tag>` in one compound
// command reports the branch push and the hook output, and a failure in the tag push itself
// is easy to read past.
//
// Only meaningful when the tag EXISTS locally. Ungated, this branch fired alongside "no tag
// v0.13.10" and claimed the tag "exists locally but is NOT on origin" — two contradictory
// diagnostics for one cause, in the file whose entire job is telling you precisely what is
// wrong with a publish. Reported by a real run on 2026-09-04.
if (tagCommit.ok) {
  const remoteTag = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`)
  if (!remoteTag.ok) {
    problems.push(
      `could not reach origin to confirm ${tag} was pushed — check your network, or publish deliberately with --ignore-scripts`
    )
  } else if (!remoteTag.out.includes(`refs/tags/${tag}`)) {
    problems.push(
      `${tag} exists locally but is NOT on origin — push it (\`git push origin ${tag}\`), ` +
        `which is also what runs the full-suite gate`
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

console.log(`prepublish: ${tag} is at HEAD, tree clean, history pushed.`)
