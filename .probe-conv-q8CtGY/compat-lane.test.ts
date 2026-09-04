/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readdirSync, readFileSync } from 'node:fs'

import { join } from 'node:path'

const ROOT = join('/Users/tonioloewald/tjs-lang/src', '..')
export {}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))

describe('the compat lane covers every compat script', () => {
  const scripts = readdirSync(join(ROOT, 'scripts'))
    .filter((f) => /^compat-(?!all)[a-z0-9-]+\.ts$/.test(f))
    .sort()
  it('there are compat scripts to run (apparatus check)', () => {
    expect(scripts.length).toBeGreaterThan(0)
  })
  it('a `test:compat` lane exists', () => {
    expect(pkg.scripts?.['test:compat']).toBeTruthy()
  })
  it('every compat script is picked up by the runner', () => {
    const runner = readFileSync(join(ROOT, 'scripts', 'compat-all.ts'), 'utf-8')
    const rx = runner.match(/\/\^compat-\(\?!all\)\[a-z0-9-\]\+\\\.ts\$\//)
    expect(
      rx,
      'compat-all.ts must discover compat scripts by glob'
    ).toBeTruthy()
    const discover = /^compat-(?!all)[a-z0-9-]+\.ts$/
    const missing = scripts.filter((f) => !discover.test(f))
    expect(
      missing,
      'add these to the `test:compat` script — a compat script nobody invokes is a ' +
        'test suite that silently stops covering the converter'
    ).toEqual([])
  })
  it('is documented, so it can be found without reading package.json', () => {
    const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf-8')
    expect(claude).toContain('test:compat')
  })
})
