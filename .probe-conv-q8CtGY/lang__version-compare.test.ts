/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  compareVersions,
  versionsCompatible,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

describe('compareVersions handles prerelease versions', () => {
  it('two IDENTICAL prerelease versions are equal', () => {
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

describe('prerelease ordering follows semver §11', () => {
  const cases = [
    ['0.13.0-beta.2', '0.13.0-beta.10'],
    ['0.13.0-beta.9', '0.13.0-beta.10'],

    ['1.0.0-alpha', '1.0.0-alpha.1'],
    ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
    ['1.0.0-alpha.beta', '1.0.0-beta'],
    ['1.0.0-beta', '1.0.0-beta.2'],
    ['1.0.0-beta.2', '1.0.0-beta.11'],
    ['1.0.0-beta.11', '1.0.0-rc.1'],
    ['1.0.0-rc.1', '1.0.0'],
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
