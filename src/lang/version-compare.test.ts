/**
 * Version comparison gates RUNTIME REPLACEMENT, so getting it wrong loses data.
 *
 * `installRuntime` returns early when two versions are equal, and replaces the global
 * runtime when the incoming one is newer. `parseVersion` split on '.', so
 * '0.13.0-beta.1' became [0, 13, NaN, 1] — and `NaN !== NaN` is true, so two IDENTICAL
 * prerelease versions compared as "newer". Every module that installed the runtime
 * therefore replaced the previous instance, discarding whatever the flight recorder had
 * collected.
 *
 * Found by the pre-push gate on the first tag that used a prerelease version. It had been
 * latent since prereleases were possible — no release had ever used one.
 */
import { describe, it, expect } from 'bun:test'
import { compareVersions, versionsCompatible } from './runtime'

describe('compareVersions handles prerelease versions', () => {
  it('two IDENTICAL prerelease versions are equal', () => {
    // The bug: this returned 1, so the runtime "upgraded" itself and lost its records.
    expect(compareVersions('0.13.0-beta.1', '0.13.0-beta.1')).toBe(0)
  })

  it('a release is newer than its own prerelease (semver)', () => {
    expect(compareVersions('0.13.0', '0.13.0-beta.1')).toBe(1)
    expect(compareVersions('0.13.0-beta.1', '0.13.0')).toBe(-1)
  })

  it('later prereleases of the same version compare correctly', () => {
    expect(compareVersions('0.13.0-beta.2', '0.13.0-beta.1')).toBe(1)
    expect(compareVersions('0.13.0-beta.1', '0.13.0-beta.2')).toBe(-1)
  })

  it('numeric components still dominate', () => {
    expect(compareVersions('0.14.0-beta.1', '0.13.0')).toBe(1)
    expect(compareVersions('0.13.0-beta.1', '0.12.9')).toBe(1)
    expect(compareVersions('1.0.0-beta.1', '0.99.0')).toBe(1)
  })

  it('plain versions are unaffected', () => {
    expect(compareVersions('0.13.0', '0.13.0')).toBe(0)
    expect(compareVersions('0.13.1', '0.13.0')).toBe(1)
    expect(compareVersions('0.12.0', '0.13.0')).toBe(-1)
  })

  it('compatibility ignores the prerelease suffix', () => {
    expect(versionsCompatible('0.13.0-beta.1', '0.13.0')).toBe(true)
    expect(versionsCompatible('1.0.0-beta.1', '0.13.0')).toBe(false)
  })
})

/**
 * Prerelease ORDERING, per semver §11.
 *
 * `parseVersion` was fixed so identical prereleases compare equal (the bug that made
 * `installRuntime` replace the runtime with itself and discard the flight recorder). The
 * ORDERING half was left as a plain string compare, which gets the most common case
 * exactly backwards: `'beta.2' > 'beta.10'`, because `'2' > '1'`. So the tenth beta looked
 * OLDER than the second, and — combined with the same wholesale replacement — an older
 * beta would "upgrade" over a newer one, discarding the recorder and any applied
 * `configure()`.
 *
 * The examples below are lifted from the specification's own ordering clause, so this is
 * pinned against the standard rather than against our reading of it.
 */
describe('prerelease ordering follows semver §11', () => {
  const cases: Array<[lower: string, higher: string]> = [
    // The regression: numeric identifiers compare NUMERICALLY.
    ['0.13.0-beta.2', '0.13.0-beta.10'],
    ['0.13.0-beta.9', '0.13.0-beta.10'],
    // The spec's worked example, in order.
    ['1.0.0-alpha', '1.0.0-alpha.1'],
    ['1.0.0-alpha.1', '1.0.0-alpha.beta'], // numeric ranks BELOW alphanumeric
    ['1.0.0-alpha.beta', '1.0.0-beta'],
    ['1.0.0-beta', '1.0.0-beta.2'],
    ['1.0.0-beta.2', '1.0.0-beta.11'],
    ['1.0.0-beta.11', '1.0.0-rc.1'],
    ['1.0.0-rc.1', '1.0.0'], // a release outranks its own prerelease
  ]

  for (const [lower, higher] of cases) {
    it(`${lower} < ${higher}`, () => {
      expect(compareVersions(lower, higher)).toBe(-1)
      expect(compareVersions(higher, lower)).toBe(1)
    })
  }

  it('identical prereleases are equal (the runtime-replacement bug)', () => {
    expect(compareVersions('0.13.0-beta.1', '0.13.0-beta.1')).toBe(0)
  })
})
