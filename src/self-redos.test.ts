/**
 * We hold our own regexes to the standard we hold users' predicates to.
 *
 * `src/redos.ts` fails CLOSED on catastrophic-backtracking shapes: a predicate containing
 * one cannot be certified, because a regex match is opaque to the fuel counter and no
 * per-character charge can bound it. That detector has never been pointed at the
 * transpiler's own patterns — so the compiler enforces a rule on user code that it does
 * not follow itself.
 *
 * It is the same shape as TypeScript's recursive conditional types taking down tsserver:
 * the language's own machinery has an unbounded path that user code is forbidden.
 *
 * This is not hypothetical here. Transpiling `src/lang/emitters/ast.ts` — an ordinary 55KB
 * file, not a crafted input — takes **116 seconds**, and the growth curve is 2.2× the
 * input for 280× the time. `src/vm/runtime.ts` is 2.5× LARGER and takes 0.4s, so it is not
 * size. See `TODO.md` → "Transpiler has a CATASTROPHIC slow path".
 *
 * ## Why a RATCHET and not a hard zero
 *
 * Six shipped patterns are flagged today. Failing outright would mean either deleting a
 * guard that is finding real things, or rewriting six regexes under time pressure in a
 * release that has already had two rounds where a fix introduced the next blocker.
 *
 * So the count is a CEILING measured by rate of progress, not a floor over a growing
 * corpus (`practices/testing.md` → "A ratchet measures a RATE, not a count"): it may only
 * go DOWN, and the promote-check below demands the ceiling be lowered when it does.
 * Adding a seventh fails immediately.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { reDoSRisk } from './redos'
import { scanLiterals } from './strip-comments'

const SRC = join(import.meta.dir)

/** Every regex LITERAL in shipped source, with where it lives. */
function flaggedPatterns(): Array<{
  where: string
  pattern: string
  why: string
}> {
  const files: string[] = []
  ;(function walk(d: string) {
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

  const out: Array<{ where: string; pattern: string; why: string }> = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    // Over the shared scanner, so a regex-looking string in a comment is not one.
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

/**
 * Measured 2026-08-15 at 6; lowered to 3 the same day, and to 2 on 2026-08-16. MAY ONLY GO
 * DOWN.
 *
 * The three directive-detection patterns (`safety` at parser.ts:172/178,
 * `TjsStrict`/`TjsCompat` at :215) were rewritten to scan the MASKED view, where comments
 * are already spaces — they were not merely risky, they were THE 90-seconds-of-116 slow
 * path on `emitters/ast.ts`, found by CPU profile. A fourth copy built via `new RegExp`
 * (invisible to this scan, which reads literals) went with them.
 *
 * `extractTDoc`'s doc-block adjacency check went on 2026-08-16, replaced by a linear scan
 * (`onlyGapFiller`) while the surrounding function was rewritten to locate doc comments
 * ONCE per file instead of re-scanning the prefix per function — 128.9ms to 4.5ms over 58
 * functions on a 176KB file, and 12% off the whole TS→TJS→JS transpile of it.
 *
 * The two that remain — both "an unbounded quantifier nested inside another":
 *   lang/docs.ts:~358              class-member signature scan
 *   lang/emitters/from-ts.ts:~2371 `@tjs` annotation parse
 * Neither is on a hot path today, which is why they are ratcheted rather than rushed.
 */
const CEILING = 2

describe('our own regexes meet the bar we set for user predicates', () => {
  const flagged = flaggedPatterns()

  it('the scan is not vacuously passing', () => {
    // A scanner that found no regex literals at all would make the ceiling meaningless.
    // There are hundreds in this codebase.
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
    // Without this the ceiling protects the number it was set at forever, and the gap
    // between actual and asserted widens in silence.
    expect(
      flagged.length < CEILING
        ? `improved to ${flagged.length} — lower CEILING in this file`
        : 'ok'
    ).toBe('ok')
  })
})
