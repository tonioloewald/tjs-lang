/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { statSync, existsSync, readdirSync } from 'node:fs'

import { join } from 'node:path'

import { execSync } from 'node:child_process'

const ROOT = join('/Users/tonioloewald/tjs-lang/src', '..')
export {}

const DIST = join(ROOT, 'dist')

/* line 39 */
function newestSource(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      newestSource(p, out)
      continue
    }
    if (!entry.name.endsWith('.ts')) continue

    if (entry.name.endsWith('.test.ts')) continue
    const m = statSync(p).mtimeMs
    if (m > out.mtime) {
      out.mtime = m
      out.path = p
    }
  }
}
newestSource.__tjs = {
  params: {
    dir: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    out: {
      type: {
        kind: 'object',
        shape: {
          path: {
            kind: 'string',
          },
          mtime: {
            kind: 'number',
          },
        },
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:39',
}

describe('dist is built from the current source', () => {
  it('no shipped source file is newer than the bundles', () => {
    if (!existsSync(DIST)) {
      if (process.env.CI) throw new Error('dist/ is missing in CI')
      return
    }
    const bundles = readdirSync(DIST).filter((f) => f.endsWith('.js'))
    expect(bundles.length).toBeGreaterThan(0)
    const oldestBundle = Math.min(
      ...bundles.map((f) => statSync(join(DIST, f)).mtimeMs)
    )
    const newest = { path: '', mtime: 0 }
    newestSource(join(ROOT, 'src'), newest)

    let tracked = true
    try {
      execSync(`git ls-files --error-unmatch "${newest.path}"`, {
        cwd: ROOT,
        stdio: 'ignore',
      })
    } catch {
      tracked = false
    }
    if (!tracked) return
    const stale = newest.mtime > oldestBundle
    expect({
      stale,
      newestSource: stale ? newest.path.slice(ROOT.length + 1) : null,
    }).toEqual({ stale: false, newestSource: null })
  })
})
