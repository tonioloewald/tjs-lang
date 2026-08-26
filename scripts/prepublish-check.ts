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
 */
import { readFileSync } from 'node:fs'
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
