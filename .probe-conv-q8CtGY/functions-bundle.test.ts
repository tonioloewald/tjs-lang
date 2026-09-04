/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { existsSync, readFileSync } from 'node:fs'

import { join } from 'node:path'

const ROOT = join('/Users/tonioloewald/tjs-lang/src', '..')
export {}

const FN = join(ROOT, 'functions')

const BUNDLE = join(FN, 'lib', 'index.js')

const pkg = JSON.parse(readFileSync(join(FN, 'package.json'), 'utf-8'))

describe('functions/ declares its dependencies unambiguously', () => {
  it('no package appears in both dependencies and devDependencies', () => {
    const deps = Object.keys(pkg.dependencies ?? {})
    const dev = new Set(Object.keys(pkg.devDependencies ?? {}))
    const both = deps.filter((d) => dev.has(d))
    expect(
      both,
      'a package in both sections lets the narrower range win the install tree silently'
    ).toEqual([])
  })
  it('depends on a tjs-lang new enough to have the capability membrane', () => {
    const range = String(pkg.dependencies?.['tjs-lang'] ?? '')
    const [major, minor] = range
      .replace(/^[^\d]*/, '')
      .split('.')
      .map(Number)
    expect(range, 'functions/ must depend on tjs-lang').not.toBe('')
    expect(
      major > 0 || minor >= 12,
      `functions/ depends on tjs-lang ${range}; the membrane landed in 0.12.0`
    ).toBe(true)
  })
})

describe('the committed functions bundle carries the hardening', () => {
  it('the artifact exists (it is committed, and it is what deploys)', () => {
    expect(existsSync(BUNDLE), `${BUNDLE} is missing`).toBe(true)
  })
  const bundle = existsSync(BUNDLE) ? readFileSync(BUNDLE, 'utf-8') : ''
  it('contains a VM at all — the apparatus check', () => {
    expect(bundle).toContain('AgentVM')
  })
  it('reports the tjs-lang it was built against, and it is a real version', () => {
    const stamped = bundle.match(/TJS_LANG_VERSION\s*=\s*"([^"]+)"/)?.[1]
    expect(
      stamped,
      'functions/lib/index.js has no resolved TJS_LANG_VERSION — did build:version run?'
    ).toMatch(/^\d+\.\d+\.\d+/)
    const [major, minor] = String(stamped).split('.').map(Number)
    expect(
      major > 0 || minor >= 12,
      `the deployed bundle was built against tjs-lang ${stamped}; the membrane landed in 0.12.0`
    ).toBe(true)
  })
  it('contains the capability membrane and its budgets', () => {
    for (const marker of [
      'Capability boundary rejected',
      'membraneMaxBytes',
      'maxHeapBytes',
    ]) {
      expect(
        bundle.includes(marker),
        `functions/lib/index.js has no "${marker}" — the deployed VM predates the ` +
          `capability membrane. Rebuild: (cd functions && npm install && npm run build)`
      ).toBe(true)
    }
  })
})
