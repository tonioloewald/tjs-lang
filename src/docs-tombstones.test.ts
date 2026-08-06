/**
 * The nine abolished mode directives must not be *taught* anywhere.
 *
 * 0.13.0 made `TjsEquals`, `TjsClass`, `TjsDate`, `TjsNoeval`, `TjsNoVar`,
 * `TjsStandard`, `TjsDictDefaults`, `TjsSafeEval` and `TjsSafeAssign` hard
 * errors — the file extension is the gate now. But `PLAN.md` still carried a
 * section headed "Death to Semicolons (`TjsStandard`)", and `PLAN.md` is served
 * in the live playground, so the docs were handing people a construct the
 * compiler rejects on sight. Removing a feature is only half the job; the other
 * half is that nothing keeps recommending it.
 *
 * History is exempt — a changelog that couldn't name what it removed would be
 * useless. The rule is about **live guidance**, so the allowlist is documents
 * whose job is to record the past.
 *
 * If you abolish something else, add it here. A guard that only knows about the
 * last removal is a guard for exactly one release.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { globSync } from 'fs'

const ROOT = join(import.meta.dir, '..')

/** Directives abolished in 0.13.0, and what replaced each. */
const ABOLISHED: Record<string, string> = {
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

/** Documents whose job is to record history, and why each is exempt. */
const HISTORICAL: Record<string, string> = {
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
    // An empty glob would make every assertion below vacuously true.
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
