/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { existsSync, readFileSync } from 'node:fs'

import { join } from 'node:path'

const ROOT = join('/Users/tonioloewald/tjs-lang/src', '..')
export {}

const BUNDLE = join(ROOT, '.demo', 'index.js')

const MARKER = 'Unrecognized extension value in extension set'

const built = existsSync(BUNDLE)

describe('the demo bundle has a single CodeMirror state instance', () => {
  it('CI actually built .demo/ before running this', () => {
    if (!process.env.CI) return
    expect(
      built,
      `.demo/index.js is missing in CI — run build:demo before test:fast`
    ).toBe(true)
  })
  it.skipIf(!built)('exactly one copy of @codemirror/state is bundled', () => {
    const code = readFileSync(BUNDLE, 'utf8')
    const copies = code.split(MARKER).length - 1

    expect(
      copies,
      `the '${MARKER}' marker is absent — @codemirror/state may have changed its ` +
        `error text, in which case this guard is measuring nothing and needs updating`
    ).toBeGreaterThan(0)
    expect(
      copies,
      `${copies} copies of @codemirror/state in the demo bundle. Every CodeMirror ` +
        `editor will fail with "Unrecognized extension value" and the site will render ` +
        `blank. Fix the install tree, not the code: rm -rf node_modules && bun install ` +
        `(the lockfile should not change).`
    ).toBe(1)
  })
})
