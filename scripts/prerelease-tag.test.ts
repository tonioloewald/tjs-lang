/**
 * The prerelease dist-tag guard, as a table. The inputs are the environment npm 11.18.0
 * ACTUALLY produced for each command, measured against a throwaway package on 2026-09-24 —
 * not what the docs say it produces. See `scripts/prerelease-tag.ts` for the measurement.
 */
import { describe, it, expect } from 'bun:test'
import { checkPrereleaseTag } from './prerelease-tag'

const NPM = 'npm/11.18.0 node/v24 darwin arm64'
const BUN = 'bun/1.4.0 npm/? node/v24 darwin arm64'

describe('checkPrereleaseTag', () => {
  const CASES: Array<
    [string, Parameters<typeof checkPrereleaseTag>[0], string]
  > = [
    // The ordinary path must stay frictionless, or the guard gets worked around.
    [
      'stable, no flag',
      {
        version: '0.14.0',
        tag: undefined,
        userAgent: NPM,
        allowOnLatest: false,
      },
      'ok',
    ],
    [
      'prerelease, --tag rc',
      {
        version: '0.14.0-rc.0',
        tag: 'rc',
        userAgent: NPM,
        allowOnLatest: false,
      },
      'ok',
    ],
    [
      'prerelease, --tag next',
      {
        version: '0.14.0-rc.0',
        tag: 'next',
        userAgent: NPM,
        allowOnLatest: false,
      },
      'ok',
    ],
    // npm refuses this one itself — but only after prepublishOnly has run the full gate.
    [
      'prerelease, no flag (npm)',
      {
        version: '0.14.0-rc.0',
        tag: undefined,
        userAgent: NPM,
        allowOnLatest: false,
      },
      'refuse',
    ],
    // THE hole: npm publishes a prerelease as `latest` here, and the env is identical to no flag.
    [
      'prerelease, --tag latest (npm leaves the var unset)',
      {
        version: '0.14.0-rc.0',
        tag: undefined,
        userAgent: NPM,
        allowOnLatest: false,
      },
      'refuse',
    ],
    [
      'prerelease, override',
      {
        version: '0.14.0-rc.0',
        tag: undefined,
        userAgent: NPM,
        allowOnLatest: true,
      },
      'ok',
    ],
    // bun never sets npm_config_tag, so a correct `bun publish --tag rc` must not be refused.
    [
      'prerelease under bun, tag unknowable',
      {
        version: '0.14.0-rc.0',
        tag: undefined,
        userAgent: BUN,
        allowOnLatest: false,
      },
      'warn',
    ],
  ]

  for (const [label, input, want] of CASES) {
    it(label, () => {
      expect(checkPrereleaseTag(input).kind).toBe(want)
    })
  }

  it('the refusal carries the recovery commands — you need them the moment you read it', () => {
    const v = checkPrereleaseTag({
      version: '0.14.0-rc.0',
      tag: undefined,
      userAgent: NPM,
      allowOnLatest: false,
    })
    expect(v.kind).toBe('refuse')
    const msg = (v as any).message as string
    expect(msg).toContain('npm publish --tag rc')
    expect(msg).toContain('npm dist-tag add tjs-lang@0.14.0-rc.0 rc')
    expect(msg).toContain('ALLOW_PRERELEASE_ON_LATEST=1')
  })
})
