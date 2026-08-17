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
