/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync, readdirSync, statSync } from 'node:fs'

import { join } from 'node:path'

import { reDoSRisk } from '/Users/tonioloewald/tjs-lang/src/redos'

import { scanLiterals } from '/Users/tonioloewald/tjs-lang/src/strip-comments'

const SRC = join('/Users/tonioloewald/tjs-lang/src')
export {}

/* line 38 */
function flaggedPatterns() {
  const files = []
  ;(function walk(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (
        p.endsWith('.ts') &&
        !p.endsWith('.test.ts') &&
        !p.endsWith('.d.ts')
      )
        files.push(p)
    }
  })(SRC)
  const out = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')

    for (const r of scanLiterals(src)) {
      if (r.kind !== 'regex') continue
      const pattern = src.slice(r.innerStart, r.innerEnd)
      const why = reDoSRisk(pattern)
      if (!why) continue
      const line = src.slice(0, r.start).split('\n').length
      out.push({ where: `${f.replace(SRC + '/', '')}:${line}`, pattern, why })
    }
  }
  return out
}
flaggedPatterns.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'array',
      items: {
        kind: 'object',
        shape: {
          where: {
            kind: 'string',
          },
          pattern: {
            kind: 'string',
          },
          why: {
            kind: 'string',
          },
        },
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:38',
}

const CEILING = 2

describe('our own regexes meet the bar we set for user predicates', () => {
  const flagged = flaggedPatterns()
  it('the scan is not vacuously passing', () => {
    expect(flagged.length).toBeLessThan(100)
    expect(typeof reDoSRisk('(a+)+b')).toBe('string')
    expect(reDoSRisk('^abc$')).toBe(null)
  })
  it(`no more than ${CEILING} shipped regexes are ReDoS-risky`, () => {
    const listed = flagged.map((f) => `${f.where}  /${f.pattern}/`)
    expect(
      `${flagged.length} flagged`,
      `a new catastrophic-backtracking regex was added to shipped source. The ` +
        `transpiler already has a 116s slow path on an ordinary 55KB file because of ` +
        `this class.\n  ${listed.join('\n  ')}`
    ).toBe(`${Math.min(flagged.length, CEILING)} flagged`)
  })
  it('the ceiling is lowered when the count drops', () => {
    expect(
      flagged.length < CEILING
        ? `improved to ${flagged.length} — lower CEILING in this file`
        : 'ok'
    ).toBe('ok')
  })
})
