/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync, readdirSync } from 'node:fs'

import { join } from 'node:path'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

const COMMANDS = join('/Users/tonioloewald/tjs-lang/src/cli', 'commands')
export {}

describe('all CLI file writes go through writeEmitted', () => {
  const files = readdirSync(COMMANDS).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
  )
  it('found the command files (apparatus)', () => {
    expect(files.length).toBeGreaterThan(3)
    expect(files).toContain('emit.ts')
  })
  for (const f of files) {
    it(`${f} calls no raw writeFileSync`, () => {
      const src = readFileSync(join(COMMANDS, f), 'utf8')

      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(
        code.includes('writeFileSync('),
        `${f} writes a file directly. Use writeEmitted() from '/Users/tonioloewald/tjs-lang/src/walk' — it re-attaches ` +
          `the #! line and refuses to write THROUGH a symlink, which raw writeFileSync ` +
          `does silently (it overwrote a file outside the named tree and reported success).`
      ).toBe(false)
    })
  }
})

describe('result.code is a fragment, never a whole script', () => {
  const CASES = [
    ['js dialect', '#!/usr/bin/env node\nconsole.log(1)\n', { dialect: 'js' }],
    [
      'native tjs',
      '#!/usr/bin/env bun\nfunction f(a: 1):! 0 { return a }\n',
      {},
    ],
    ['no hashbang', 'function f(a: 1):! 0 { return a }\n', {}],
  ]
  for (const [label, src, opts] of CASES) {
    it(`${label}: code does not start with #!`, () => {
      const r = tjs(src, opts)
      expect(r.code.startsWith('#!')).toBe(false)
    })
    it(`${label}: code is embeddable in new Function`, () => {
      const r = tjs(src, opts)
      expect(() => new Function(`return (() => { ${r.code} })`)).not.toThrow()
    })
  }
  it('the hashbang is still reported, just separately', () => {
    expect(
      tjs('#!/usr/bin/env node\nconsole.log(1)\n', { dialect: 'js' }).hashbang
    ).toBe('#!/usr/bin/env node')
    expect(tjs('function f(a: 1):! 0 { return a }\n').hashbang).toBeUndefined()
  })
})
