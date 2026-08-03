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
