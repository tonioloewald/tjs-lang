/**
 * Refuse to publish a PRERELEASE onto the `latest` dist-tag.
 *
 * A prerelease on `latest` is served to every bare `npm install tjs-lang`. tosijs did exactly
 * this with `1.8.0-rc.2` while the rule against it was written down, correct and unambiguous,
 * in `tosijs-coding-practices/practices/releasing.md` — a rule you must remember at one
 * moment, months apart, is a rule that gets forgotten. Hence enforcement, in `prepublishOnly`.
 *
 * ## What npm 11.18.0 actually does — measured 2026-09-24, not taken from the docs
 *
 * | command                  | `npm_config_tag` | npm itself                          |
 * | ------------------------ | ---------------- | ----------------------------------- |
 * | `npm publish`            | unset            | REFUSES a prerelease — but only AFTER `prepublishOnly`, i.e. after the ~4-minute full-suite gate |
 * | `npm publish --tag rc`   | `"rc"`           | publishes to `rc`                   |
 * | `npm publish --tag latest` | unset          | **publishes the prerelease as `latest`** |
 *
 * npm exports `npm_config_*` only for NON-DEFAULT values, and `tag` defaults to `latest`, so
 * the second and third rows are indistinguishable to a script — both unset. That is why the
 * deliberate override is an env var (`ALLOW_PRERELEASE_ON_LATEST=1`) rather than
 * `--tag latest`: a flag the hook cannot hear is not an override channel.
 *
 * So this guard adds two things npm does not: it closes `--tag latest`, and it refuses the
 * no-flag case BEFORE the release gate burns four minutes on a publish npm will reject anyway.
 *
 * bun does not set `npm_config_tag` at all, so under bun an absent tag is unknowable; that
 * case warns rather than refusing every correct `bun publish --tag rc`.
 */

export interface PrereleaseTagInput {
  version: string
  /** `process.env.npm_config_tag` */
  tag: string | undefined
  /** `process.env.npm_config_user_agent` */
  userAgent: string | undefined
  /** `process.env.ALLOW_PRERELEASE_ON_LATEST === '1'` */
  allowOnLatest: boolean
}

export type PrereleaseTagVerdict =
  | { kind: 'ok' }
  | { kind: 'warn'; message: string }
  | { kind: 'refuse'; message: string }

export function checkPrereleaseTag(
  input: PrereleaseTagInput
): PrereleaseTagVerdict {
  const { version, tag, userAgent, allowOnLatest } = input
  // A stable release with no --tag is the ordinary path and must pass untouched.
  if (!version.includes('-')) return { kind: 'ok' }
  if (tag && tag !== 'latest') return { kind: 'ok' }
  if (allowOnLatest) return { kind: 'ok' }

  if (!tag && (userAgent ?? '').includes('bun'))
    return {
      kind: 'warn',
      message:
        `${version} is a prerelease and bun does not report --tag, so this cannot be checked ` +
        `here. Verify after publishing: \`npm view tjs-lang dist-tags\` — \`latest\` must not ` +
        `name ${version}.`,
    }

  return {
    kind: 'refuse',
    message:
      `${version} is a PRERELEASE and would publish to \`latest\`, so every bare ` +
      `\`npm install tjs-lang\` would get it. Publish it to a prerelease channel:\n` +
      `      npm publish --tag rc\n` +
      `    (\`--tag latest\` cannot be told apart from no flag — npm omits default values from ` +
      `the script env. To really put a prerelease on latest: ALLOW_PRERELEASE_ON_LATEST=1.)\n` +
      `    If it already landed on latest, recover without unpublishing:\n` +
      `      npm dist-tag add tjs-lang@${version} rc\n` +
      `      npm dist-tag add tjs-lang@<last-stable> latest`,
  }
}

// Run as the FIRST step of `prepublishOnly`, ahead of `make` and the release gate, so a wrong
// tag is refused in seconds rather than after the ~4-minute suite.
if (import.meta.main) {
  const { readFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')
  )
  const verdict = checkPrereleaseTag({
    version: pkg.version,
    tag: process.env.npm_config_tag,
    userAgent: process.env.npm_config_user_agent,
    allowOnLatest: process.env.ALLOW_PRERELEASE_ON_LATEST === '1',
  })
  if (verdict.kind === 'refuse') {
    console.error(`\nRefusing to publish:\n\n  ✗ ${verdict.message}\n`)
    process.exit(1)
  }
  if (verdict.kind === 'warn') console.warn(`\n  ⚠ ${verdict.message}\n`)
  else
    console.log(
      `prerelease-tag: ${pkg.version} → ${
        process.env.npm_config_tag ?? 'latest'
      }, ok.`
    )
}
