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
 * ## What it deliberately does NOT do
 *
 * It does not shell out to `test:fast`. `test:fast` sets `SKIP_LLM_TESTS`, `SKIP_BENCHMARKS`
 * and `SKIP_AUDIT` — precisely the three categories most likely to rot unseen, and the
 * reason the full run is the release gate at all (CLAUDE.md → "Full run before tagging").
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

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

console.log(
  'release-gate: running the FULL suite before publish (~3-4 min; no SKIP_* flags).'
)

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

const sha = sh(['git', 'rev-parse', 'HEAD']).out
if (!sha)
  fail('could not resolve HEAD — refusing to stamp a gate I cannot name.')

writeFileSync(
  join(ROOT, '.release-gate'),
  `${sha}\n`.concat(
    '# Written by scripts/release-gate.ts: the full suite passed for this commit.\n',
    '# .githooks/pre-push skips its own run when this names the SHA being tagged.\n'
  )
)

console.log(`release-gate: full suite green — stamped ${sha.slice(0, 7)}.`)
