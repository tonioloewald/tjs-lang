/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { execFileSync } from 'node:child_process'

import { readFileSync } from 'node:fs'

import { join } from 'node:path'

const ROOT = join('/Users/tonioloewald/tjs-lang/src', '..')
export {}

/* line 30 */
function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
}
git.__tjs = {
  params: {
    args: {
      type: {
        kind: 'array',
        items: {
          kind: 'string',
        },
      },
      required: false,
    },
  },
  unsafe: true,
  source: 'input.ts:30',
}

describe('tracked files respect .gitignore', () => {
  it('no tracked file matches an ignore rule', () => {
    const offenders = git('ls-files', '-i', '-c', '--exclude-standard')
      .split('\n')
      .filter(Boolean)
    expect(offenders).toEqual([])
  })
  it('.gitignore has no inline comments', () => {
    const lines = readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n')
    const inline = lines
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(({ l }) => {
        const t = l.trim()
        if (!t || t.startsWith('#')) return false

        return /[^\\]\s#/.test(l)
      })
      .map(({ l, n }) => `.gitignore:${n}: ${l.trim()}`)
    expect(inline).toEqual([])
  })
})

describe('the published tarball', () => {
  /** What `npm pack` would actually ship. */
  const packed = () => {
    const out = execFileSync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    )
    const parsed = JSON.parse(out)
    return parsed[0].files.map((f) => f.path)
  }
  const files = packed()
  it('ships a plausible number of files (apparatus check)', () => {
    expect(files.length).toBeGreaterThan(100)
  })
  it('does not ship tests', () => {
    expect(files.filter((f) => f.endsWith('.test.ts'))).toEqual([])
  })
  it('does not ship review reports', () => {
    expect(files.filter((f) => f.startsWith('docs/reviews/'))).toEqual([])
  })
  it('every directory named in `files` contributes something', () => {
    const pkg = JSON.parse(
      execFileSync('cat', ['package.json'], { cwd: ROOT, encoding: 'utf8' })
    )
    const dirs = pkg.files.filter(
      (f) => !f.startsWith('!') && !f.includes('.') && f !== 'bin'
    )
    const empty = dirs.filter((d) => !files.some((f) => f.startsWith(`${d}/`)))
    expect(empty).toEqual([])
  })
})
