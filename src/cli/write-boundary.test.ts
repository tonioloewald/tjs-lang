/**
 * Every file the CLI writes goes through ONE boundary, and `result.code` never carries a `#!`.
 *
 * Two enumerations, because the defect they guard has recurred three times in a row and a
 * lens can be forgotten while a test cannot:
 *
 *   - 0.13.1 fixed the symlink-write hazard for `emit`'s JS output and left `--dts` and
 *     `--docs` on raw `writeFileSync` — twenty lines below the fix. `emit --dts` still
 *     destroyed a symlink's target and reported success.
 *   - 0.13.1 re-attached the `#!` line inside `result.code`, which is a FRAGMENT with
 *     TWELVE consumer sites. Four were tested. `tjsx` — a published bin — threw
 *     `Invalid character: '#'`.
 *
 * Both are the same shape: a fix applied at the site that prompted it and not at its
 * siblings. `docs/review-lenses.md` lens 1 is literally "where else?", and it still got past
 * two nine-lens reviews. So the sweep is mechanical here rather than remembered.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tjs } from '../lang/index'

const COMMANDS = join(import.meta.dir, 'commands')

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
      // Strip comments so the explanatory prose naming `writeFileSync` does not trip this.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(
        code.includes('writeFileSync('),
        `${f} writes a file directly. Use writeEmitted() from '../walk' — it re-attaches ` +
          `the #! line and refuses to write THROUGH a symlink, which raw writeFileSync ` +
          `does silently (it overwrote a file outside the named tree and reported success).`
      ).toBe(false)
    })
  }
})

describe('result.code is a fragment, never a whole script', () => {
  const CASES: Array<[string, string, any]> = [
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
      // The property every consumer depends on. `tjsx`, the CLAUDE.md-documented idiom,
      // and the playground all embed the fragment at a NON-ZERO offset, where `#!` is a
      // hard SyntaxError.
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
