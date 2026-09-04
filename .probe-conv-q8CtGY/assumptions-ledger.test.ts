/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { existsSync, readFileSync } from 'node:fs'

import { join } from 'node:path'

const ROOT = join('/Users/tonioloewald/tjs-lang/src', '..')
export {}

const LEDGER = readFileSync(join(ROOT, 'ASSUMPTIONS.md'), 'utf8')

/* line 21 */
function rows() {
  const out = []
  for (const line of LEDGER.split('\n')) {
    const m = line.match(/^\|\s*([A-Z]\d+)\s*\|(.+?)\|(.+?)\|(.+?)\|\s*$/)
    if (m)
      out.push({
        id: m[1],
        assumption: m[2].trim(),
        verdict: m[3].trim(),
        evidence: m[4].trim(),
      })
  }
  return out
}
rows.__tjs = {
  params: {},
  returns: {
    type: {
      kind: 'array',
      items: {
        kind: 'object',
        shape: {
          id: {
            kind: 'string',
          },
          assumption: {
            kind: 'string',
          },
          verdict: {
            kind: 'string',
          },
          evidence: {
            kind: 'string',
          },
        },
      },
    },
  },
  unsafeReturn: true,
  unsafe: true,
  source: 'input.ts:21',
}

describe('assumptions ledger is anchored to reality', () => {
  it('has claims to check', () => {
    expect(rows().length).toBeGreaterThan(10)
  })
  it('every claim carries one of the four verdicts', () => {
    for (const r of rows()) {
      const hasVerdict = /supported|refuted|nuanced|untested/i.test(r.verdict)
      expect(
        hasVerdict,
        `${r.id} has no verdict: "${r.verdict.slice(0, 60)}"`
      ).toBe(true)
    }
  })
  it('every cited local file exists', () => {
    const missing = []
    for (const r of rows()) {
      for (const m of r.evidence.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
        const target = m[1]
        if (/^https?:/.test(target)) continue
        if (!existsSync(join(ROOT, target))) missing.push(`${r.id} → ${target}`)
      }
    }
    expect(
      missing,
      `ledger cites files that no longer exist — a verdict backed by a deleted test is ` +
        `a confident claim backed by nothing:\n  ${missing.join('\n  ')}`
    ).toEqual([])
  })
  it('a tested claim cites evidence; an untested one need not', () => {
    for (const r of rows()) {
      if (/untested/i.test(r.verdict)) continue
      const cites = /\]\(/.test(r.evidence)
      expect(
        cites,
        `${r.id} claims a tested verdict but cites no evidence — either link the test ` +
          `or downgrade it to 🔍 untested.`
      ).toBe(true)
    }
  })
})
