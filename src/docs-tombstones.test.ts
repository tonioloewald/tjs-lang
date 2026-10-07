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
  TjsClass:
    'always on in .tjs; `X()` does what `new X()` does, so no escape is needed',
  TjsDate: 'always on in .tjs; per-site escape is `LegacyDate(x)`',
  TjsNoeval: 'always on in .tjs; no escape — `Eval()` for sandboxed evaluation',
  TjsNoVar: 'always on in .tjs; no escape — `let`/`const`',
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

/**
 * The capability membrane no longer uses `structuredClone` (0.14.0-rc.2 round 39): it builds its
 * own copy of JSON data plus Date, and refuses Map, Set, typed arrays, ArrayBuffer, RegExp and
 * Error. Docs that still promised "a structuredClone membrane" or "structured-cloneable" returns
 * told consumers those types were fine (cumulative review 14). History is exempt.
 */
describe('the structuredClone membrane is not taught anywhere', () => {
  const pattern =
    /structured-?clone(able)?\s+(membrane|boundary)|cross(es)?\s+(a\s+)?`?structuredClone|structured-cloneable/i
  const docs = [
    ...globSync('*.md', { cwd: ROOT }),
    ...globSync('docs/**/*.md', { cwd: ROOT }),
    ...globSync('guides/**/*.md', { cwd: ROOT }),
    'llms.txt',
    'src/lang/eval.ts',
  ]
    .map((p) => p.replaceAll('\\', '/'))
    .filter((p) => !HISTORICAL[p] && !p.startsWith('docs/reviews/'))

  it('the pattern catches the retired phrasing (apparatus)', () => {
    for (const old of [
      'every capability return crosses a `structuredClone` membrane',
      'Return structured-cloneable data only',
      'the capability-boundary structured-clone membrane',
    ])
      expect(old).toMatch(pattern)
  })

  for (const doc of docs) {
    it(`${doc} does not teach the structuredClone membrane`, () => {
      const hit = readFileSync(join(ROOT, doc), 'utf8').match(pattern)
      expect(hit?.[0] ?? '').toBe('')
    })
  }
})

describe('`predicate => …` is not taught anywhere (removed before 0.14.0 final)', () => {
  // A LINE OF CODE that begins `predicate =>`; prose naming the removed form is fine.
  const pattern = /^\s*predicate\s*=>\s*\S/m
  const docs = [
    ...globSync('*.md', { cwd: ROOT }),
    ...globSync('docs/**/*.md', { cwd: ROOT }),
    ...globSync('guides/**/*.md', { cwd: ROOT }),
    'llms.txt',
    'editors/codemirror/ajs-language.ts',
  ]
    .map((p) => p.replaceAll('\\', '/'))
    .filter((p) => !HISTORICAL[p] && !p.startsWith('docs/reviews/'))

  it('the pattern catches the form and spares prose about it (apparatus)', () => {
    expect(
      'Type Even {\n  example: 2\n  predicate => Even % 2 === 0\n}'
    ).toMatch(pattern)
    expect('(There is no `predicate => …` one-liner.)').not.toMatch(pattern)
  })

  for (const doc of docs) {
    it(`${doc} does not teach \`predicate =>\``, () => {
      const hit = readFileSync(join(ROOT, doc), 'utf8').match(pattern)
      expect(hit?.[0] ?? '').toBe('')
    })
  }
})

describe('the deprecated `unsafe` prefix is not taught anywhere (deprecated in 0.14.0)', () => {
  // `unsafe new Date(x)` → `LegacyDate(x)`; `unsafe new X()` → `X()`; `unsafe var`/`unsafe eval`
  // are refused outright. A line that SAYS it is deprecated/refused/historical is prose about
  // the form, not teaching it.
  const pattern = /\bunsafe\s+(new|var|eval)\b/
  const aboutIt = /deprecat|refused|used to|older spelling/i
  const docs = [
    ...globSync('*.md', { cwd: ROOT }),
    ...globSync('docs/**/*.md', { cwd: ROOT }),
    ...globSync('guides/**/*.md', { cwd: ROOT }),
    'llms.txt',
    'editors/codemirror/ajs-language.ts',
    'editors/tjs-syntax.ts',
  ]
    .map((p) => p.replaceAll('\\', '/'))
    .filter((p) => !HISTORICAL[p] && !p.startsWith('docs/reviews/'))

  const teaching = (text: string) =>
    text
      .split('\n')
      .filter((l) => pattern.test(l) && !aboutIt.test(l))
      .map((l) => l.trim())

  it('the filter catches teaching and spares prose about the form (apparatus)', () => {
    expect(teaching('const d = unsafe new Date(0)')).toHaveLength(1)
    expect(
      teaching('| `Timestamp.now()` | `unsafe new Date()` |')
    ).toHaveLength(1)
    expect(
      teaching('The prefix (`unsafe new Date(ts)`) is deprecated.')
    ).toEqual([])
    expect(teaching('wait for the unsafe variant')).toEqual([])
  })

  for (const doc of docs) {
    it(`${doc} does not teach \`unsafe new\`/\`var\`/\`eval\``, () => {
      expect(teaching(readFileSync(join(ROOT, doc), 'utf8'))).toEqual([])
    })
  }
})

describe('a wasm{} block that cannot compile is not taught to fall back (0.14.0)', () => {
  // Since 0.14 an uncompilable block is a compile error; `fallback {}` is for a RUNTIME with no
  // WebAssembly. Prose about a runtime without WASM is fine; "unsupported → falls back" is not.
  const pattern =
    /runs its fallback,? with a warning|fall back to its `?fallback ?\{\}`?|block (using one )?falls back|anything else falls back/i
  const docs = [
    ...globSync('*.md', { cwd: ROOT }),
    ...globSync('docs/**/*.md', { cwd: ROOT }),
    ...globSync('guides/**/*.md', { cwd: ROOT }),
    'llms.txt',
  ]
    .map((p) => p.replaceAll('\\', '/'))
    .filter((p) => !HISTORICAL[p] && !p.startsWith('docs/reviews/'))

  it('the pattern catches the retired phrasing (apparatus)', () => {
    for (const old of [
      'compile and runs its fallback, with a warning naming the operator.',
      'outside it makes an inline block fall back to its `fallback{}`',
      'so a block using one falls back (see § Purity).',
      'the supported subset and that anything else falls back.',
    ])
      expect(old).toMatch(pattern)
  })

  for (const doc of docs) {
    it(`${doc} does not teach the compile-time wasm fallback`, () => {
      const hit = readFileSync(join(ROOT, doc), 'utf8').match(pattern)
      expect(hit?.[0] ?? '').toBe('')
    })
  }
})
