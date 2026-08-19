/**
 * The benchmark harness still runs, and its fixtures are still valid TJS.
 *
 * `bun run bench` was broken for **four and a half months** and nobody knew. Its fixtures
 * were written in the `-> ` arrow return form, abolished before 0.13.0, so every
 * invocation died on `Unexpected token at <source>:1:26`. Twelve occurrences across the
 * file.
 *
 * It rotted because it is in NO gate at all:
 *
 *   - `test:fast` sets `SKIP_BENCHMARKS`, and CI runs `test:fast`
 *   - the pre-tag lane runs `bun test`, and `bin/benchmarks.ts` is a separate entry point
 *     that `bun test` never touches
 *
 * So the safe-vs-unsafe table in `benchmarks.md` — a published, consumer-facing claim about
 * this language's cost — sat at numbers measured on 2026-03-31 under Bun 1.3.11, against a
 * version of the language that no longer parses the file that produced them. The baseline
 * had moved by 2.7× in that time.
 *
 * ## Why this test and not a freshness diff
 *
 * `demo/docs.json` and `docs/tjs-vs-typescript.md` are gated with `git diff --exit-code`
 * after `bun run make`, which works because those artifacts are deterministic.
 * `benchmarks.md` contains TIMINGS: it differs on every run, on every machine. Diffing it
 * would fail constantly and be disabled within a week.
 *
 * So this asserts the part that CAN rot silently and IS deterministic — that the harness's
 * TJS fixtures compile. That is the whole failure mode: the numbers going stale is a
 * consequence of the harness not running, and the harness not running is a consequence of
 * its source no longer being valid TJS.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tjs } from './lang'
import { scanLiterals } from './strip-comments'

const HARNESS = join(import.meta.dir, '..', 'bin', 'benchmarks.ts')
const source = readFileSync(HARNESS, 'utf8')

/**
 * The TJS snippets the harness feeds to `tjs()` — its template literals containing a
 * `function` declaration.
 *
 * Read out of the file rather than restated here, so a fixture added tomorrow is covered
 * without anyone remembering to add it.
 */
function fixtures(): string[] {
  const out: string[] = []
  for (const r of scanLiterals(source)) {
    if (r.kind !== 'template') continue
    const body = source.slice(r.innerStart, r.innerEnd)
    if (!/\bfunction\s+\w+\s*\(/.test(body)) continue
    if (body.includes('${')) continue // interpolated — not a standalone snippet
    out.push(body)
  }
  return out
}

describe('the benchmark harness is runnable', () => {
  const found = fixtures()

  it('finds the fixtures (apparatus check)', () => {
    // A scan that matched nothing would make the assertion below vacuous — which is
    // exactly the shape of the bug it is guarding.
    expect(found.length).toBeGreaterThan(4)
  })

  it('every TJS fixture in bin/benchmarks.ts compiles', () => {
    const broken: string[] = []
    for (const f of found) {
      try {
        tjs(f, { filename: 'bench.tjs', runTests: false })
      } catch (e: any) {
        broken.push(`${f.trim().split('\n')[0]} — ${e.message.split('\n')[0]}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('no fixture uses the abolished arrow return form', () => {
    // The specific syntax that broke it, named so the diagnosis arrives with the failure
    // rather than as "some fixture does not compile".
    const arrows = found.filter((f) => /\)\s*-[>!?]\s*/.test(f))
    expect(arrows).toEqual([])
  })
})

/**
 * Timings live in ONE place — the generated `benchmarks.md` — and nowhere else.
 *
 * `guides/benchmarks.md` carried a hand-copied table that drifted an order of magnitude and
 * sat wrong for seven months: it told readers safe TJS cost 17–28× when it cost under 2×,
 * because validation had moved off the `wrap()` call those figures measured. A second copy
 * of a generated number cannot be regenerated, so it cannot be noticed going stale.
 *
 * The guide now explains the drift and points at the generated file. This keeps it that way:
 * a `12x` or `13ms` reappearing in a hand-maintained guide is a number nobody will ever
 * refresh. Historical figures are allowed where they are explicitly dated, which is what the
 * "why this page has no table" section is.
 */
describe('timings live only in the generated benchmark file', () => {
  it('every millisecond figure in guides/benchmarks.md sits under a date stamp', () => {
    const text = readFileSync(
      join(import.meta.dir, '..', 'guides', 'benchmarks.md'),
      'utf8'
    )
    const lines = text.split('\n')
    // A figure is DATED if a `2026-…` stamp appears within the dozen lines above it —
    // close enough to be the same table or paragraph. That is the whole rule: a reader
    // must be able to see how old a number is without leaving it.
    const DATE = /\b20\d\d-\d\d-\d\d\b/
    const TIMING = /\b\d+(\.\d+)?\s*(ms|µs|ns)\b/
    const undated = lines.filter((l, i) => {
      if (!TIMING.test(l)) return false
      return !lines.slice(Math.max(0, i - 12), i + 1).some((p) => DATE.test(p))
    })
    expect(undated).toEqual([])
  })

  it('the rule really rejects an undated figure (apparatus check)', () => {
    // Without this, a regex that matched nothing would read as a clean document.
    const DATE = /\b20\d\d-\d\d-\d\d\b/
    const TIMING = /\b\d+(\.\d+)?\s*(ms|µs|ns)\b/
    expect(TIMING.test('safe functions cost 13ms')).toBe(true)
    expect(DATE.test('Generated: 2026-08-18')).toBe(true)
  })
})
