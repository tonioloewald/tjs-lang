/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { readFileSync } from 'fs'

import { join } from 'path'

import { globSync } from 'fs'

const ROOT = join('/Users/tonioloewald/tjs-lang/src', '..')
export {}

const ABOLISHED = {
  TjsEquals: 'always on in .tjs; per-site escape is DangerousLegacyEquals',
  TjsClass: 'always on in .tjs; per-site escape is `unsafe new X()`',
  TjsDate: 'always on in .tjs; per-site escape is `unsafe new Date()`',
  TjsNoeval: 'always on in .tjs; per-site escape is `unsafe eval(s)`',
  TjsNoVar: 'always on in .tjs; per-site escape is `unsafe var x = 1`',
  TjsStandard: 'always on in .tjs; no escape — newlines are meaningful',
  TjsDictDefaults: 'always on in .tjs; per-param escape is LegacyDefault(…)',
  TjsSafeEval: 'always on in .tjs',
  TjsSafeAssign: 'always on in .tjs',
}

const HISTORICAL = {
  'CHANGELOG.md': 'the release record — it must name what it removed',
  'TODO.md': 'backlog, including completed items that shipped the abolition',
  'TODO-ARCHIVE.md': 'completed-work history',
  'ASSUMPTIONS.md': 'the ledger — entries are dated claims, not guidance',
  'experiments/agent-legibility/FINDINGS.md':
    'a measurement report on messages produced at the time',
}

describe('abolished directives are not taught anywhere', () => {
  const pattern = new RegExp(`\\b(${Object.keys(ABOLISHED).join('|')})\\b`)
  const docs = [
    ...globSync('*.md', { cwd: ROOT }),
    ...globSync('docs/**/*.md', { cwd: ROOT }),
    ...globSync('guides/**/*.md', { cwd: ROOT }),
  ]
    .map((p) => p.replaceAll('\\', '/'))
    .filter((p) => !HISTORICAL[p])
  it('scans a plausible number of documents', () => {
    expect(docs.length).toBeGreaterThan(20)
  })
  for (const doc of docs) {
    it(`${doc} teaches no abolished directive`, () => {
      const hit = readFileSync(join(ROOT, doc), 'utf8').match(pattern)
      const remedy = hit ? `${hit[1]} → ${ABOLISHED[hit[1]]}` : ''
      expect(remedy).toBe('')
    })
  }
})
