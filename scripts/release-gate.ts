/**
 * The full test suite, run BEFORE `npm publish` — and a stamp so the tag push need not
 * repeat it.
 *
 * ## Why this moved
 *
 * The gate used to live in `.githooks/pre-push`, firing on a TAG PUSH. That worked while
 * the order was tag-then-publish: the tag was a prerequisite, so gating the tag gated the
 * release. Under **publish-then-tag** the same hook fires *after* `npm publish` — the one
 * step that cannot be taken back. A gate downstream of the irreversible act does not gate
 * anything; it reports.
 *
 * So the suite runs here, inside `prepublishOnly`, which `npm publish` invokes before it
 * packs or uploads anything. A non-zero exit stops the publish.
 *
 * ## Why the stamp
 *
 * The objection that kept the suite out of `prepublishOnly` was real: "running it again
 * here would just make publishing slow enough to be bypassed." Under the new order the tag
 * push still happens, so leaving the pre-push hook alone would mean running ~3.5 minutes of
 * tests twice per release — and a hook that wastes your time is a hook that gets
 * `--no-verify`d, which costs the protection for everyone who has not published yet.
 *
 * So this writes `.release-gate` naming the commit it verified. The pre-push hook reads it
 * and skips only when the stamp names the exact SHA being tagged. Anything else — a missing
 * stamp, a different SHA, a tag pushed by someone who never published — and the hook runs
 * the suite itself.
 *
 * The stamp records a SHA, not a timestamp or a version: what makes a re-run redundant is
 * that the same code was tested, and a SHA is the only thing that says so. It is gitignored
 * — it describes a local act, and committing it would let one machine's claim clear another
 * machine's gate.
 *
 * ## Run it AHEAD of the publish: `bun run release:ready`
 *
 * The suite has to pass BEFORE the publish, not DURING it. So it can run unattended —
 * `bun run release:ready` (or an agent) does the build and the suite and writes the stamp,
 * and the publish itself then takes seconds, because `prepublishOnly` finds a stamp naming
 * exactly what is about to ship and does not repeat the work. Watching four minutes of green
 * scroll past is not part of the control; the control is that nothing unverified ships.
 *
 * The skip is only sound if "exactly what is about to ship" is checked, not assumed, so it
 * requires ALL of:
 *
 *   - the stamp's SHA is HEAD, and the tree is clean — the source is what was tested;
 *   - `dist/` hashes the same as when the suite passed. `dist/` is gitignored, so a SHA says
 *     nothing about it, and `dist/` is most of what npm packs. Without this, a rebuild after
 *     the stamp (a different bun, a stray `build:bundles`) would ship untested bundles under
 *     a valid-looking stamp.
 *
 * Anything else — no stamp, another SHA, a dirty tree, a changed `dist/` — and the publish
 * runs the full gate itself, exactly as before. So skipping `release:ready` costs time, never
 * safety — PROVIDED no stamp is ever written for uncommitted code, which `writeStamp`
 * enforces (the 0.14.0 re-review's B-1 was the path where it was not). Both modes refuse a
 * dirty tree before building, and again if `make` dirtied tracked files: a stamp would then
 * name a SHA that is not the code it tested.
 *
 * ## What it deliberately does NOT do
 *
 * It does not shell out to `test:fast`. `test:fast` sets `SKIP_LLM_TESTS`, `SKIP_BENCHMARKS`
 * and `SKIP_AUDIT` — precisely the three categories most likely to rot unseen, and the
 * reason the full run is the release gate at all (CLAUDE.md → "Full run before tagging").
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  releaseStampProblem,
  suiteEnvProblem,
  treeDirtyReason,
  writeStamp,
} from './release-stamp'

const ROOT = join(import.meta.dir, '..')

function sh(cmd: string[], opts: { inherit?: boolean } = {}) {
  const p = Bun.spawnSync(cmd, {
    cwd: ROOT,
    stdout: opts.inherit ? 'inherit' : 'pipe',
    stderr: opts.inherit ? 'inherit' : 'pipe',
  })
  return {
    ok: p.exitCode === 0,
    out: p.stdout ? new TextDecoder().decode(p.stdout).trim() : '',
  }
}

const fail = (msg: string): never => {
  console.error(`\n  release-gate: ${msg}\n`)
  process.exit(1)
}

const PREPARE = process.argv.includes('--prepare')

const head = () => sh(['git', 'rev-parse', 'HEAD']).out
// The ONE clean-tree check (release-stamp.ts) — exit code honoured, untracked files included.
const treeClean = () => treeDirtyReason(ROOT) === null
const stampProblem = () => releaseStampProblem(ROOT)

// The fast path — the whole point of `release:ready`.
if (!PREPARE) {
  const problem = stampProblem()
  if (problem === null) {
    console.log(
      `release-gate: ${head().slice(
        0,
        7
      )} was verified by \`release:ready\` — same commit, clean ` +
        `tree, identical dist/. Not re-running the build or the suite.`
    )
    process.exit(0)
  }
  console.log(
    `release-gate: no valid stamp (${problem}) — running the build and the full suite now.\n` +
      `  Next time: \`bun run release:ready\` beforehand, and the publish takes seconds.`
  )
}

// Clean tree, in BOTH modes, before anything is built. This used to run only under
// `--prepare`, so a plain `npm publish` on a dirty tree built, tested and STAMPED uncommitted
// code (0.14.0 re-review, B-1). `writeStamp` now refuses a dirty tree too — this early check is
// for speed and a clear message; the writer's is the one that cannot be forgotten.
if (!treeClean())
  fail(
    'the working tree is dirty — commit or stash first. A publish packs the working tree, so ' +
      'publishing uncommitted code would ship something no commit names; prepublish-check ' +
      'refuses it for the same reason.'
  )

// Preflight the LLM server BEFORE spending three minutes discovering it is down. The full
// suite includes live LLM tests, and a cold server fails the first run on model load.
//
// The backend is a CONFIG CHOICE, not a constant — hardcoding :1234 would fail a publish for
// a perfectly healthy MLX setup. Same reasoning as the pre-push hook it inherits this from.
const LLM_URL = process.env.TJS_LLM_BASE_URL || 'http://localhost:1234/v1'
if (!sh(['curl', '-s', '--max-time', '5', `${LLM_URL}/models`]).ok) {
  fail(
    `no LLM server reachable at ${LLM_URL} — the full suite needs a chat + embedding
  model loaded (docs/lm-studio-setup.md, docs/mlx-setup.md). Start it, warm the models,
  and publish again. To ship anyway after running the suite green another way:
  npm publish --ignore-scripts`
  )
}

// The build moved IN here from `prepublishOnly`, so that a valid stamp skips it too.
if (!sh(['bun', 'run', 'make'], { inherit: true }).ok)
  fail('`bun run make` FAILED — nothing was published.')
if (!treeClean())
  fail(
    '`make` changed tracked files (regenerated docs/editors output?). Commit them and run release:ready again — otherwise the stamp would name a SHA that is not the code it tested.'
  )

// A partial run must not stamp. Checked here, before the suite, not just before the stamp: four
// minutes of tests that cannot certify anything is its own waste.
{
  const envProblem = suiteEnvProblem(process.env)
  if (envProblem) fail(envProblem)
}
console.log('release-gate: running the FULL suite (~3-4 min; no SKIP_* flags).')

// Vision tests self-skip when no vision model is reachable — expected, not a failure. They
// do NOT self-skip when one is present but the probe misjudges it, which is what turned this
// gate red at 0.13.0-beta.1 while test:fast stayed green.
if (!sh(['bun', 'test'], { inherit: true }).ok) {
  fail(
    `full test suite FAILED — nothing was published. Fix the failures above and try again.
  This is the gate that used to run on the tag push, which under publish-then-tag would
  have fired after the release was already public.`
  )
}

// The writer refuses a dirty tree itself — the suite may have dirtied it — and writes the
// stamp and the ledger together or not at all. See `writeStamp`.
const stamped = writeStamp(ROOT)
const sha = stamped.ok
  ? stamped.sha
  : fail(
      `the suite passed but NOTHING was stamped: ${stamped.reason}. The next publish will re-run the gate.`
    )

console.log(`release-gate: full suite green — stamped ${sha.slice(0, 7)}.`)
if (PREPARE) {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    .version as string
  // Only say "Ready" if the rest of prepublishOnly would pass too — pushed, tags sane,
  // exports resolvable. Otherwise the fast publish would fail at the next step anyway.
  if (!sh(['bun', 'run', 'scripts/prepublish-check.ts'], { inherit: true }).ok)
    fail(
      'the suite passed and the stamp is written, but prepublish-check would refuse this publish (above). Fix that; the stamp stays valid if HEAD does not move.'
    )
  const cmd = version.includes('-') ? 'npm publish --tag rc' : 'npm publish'
  console.log(
    `\n  Ready: ${version} at ${sha.slice(
      0,
      7
    )}. Publishing will skip the build and the suite.\n` +
      `    ${cmd}\n` +
      `  then: git tag v${version} && git push origin v${version}\n` +
      `  Any new commit, or a rebuild of dist/, and the publish re-verifies on its own.\n`
  )
}
