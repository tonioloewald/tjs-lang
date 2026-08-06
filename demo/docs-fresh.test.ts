import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { tjs } from '../src/lang'
import { transpile } from '../src/lang'

/**
 * `demo/docs.json` is a COMMITTED build artifact, and it has already shipped stale once:
 * it taught all nine abolished mode directives in the live playground for days after the
 * source markdown was rewritten. Nothing failed in the meantime, because nothing checked.
 *
 * Two different failures are possible and both have happened:
 *
 *   1. the artifact is stale relative to its sources (the 2026-08-02 case), and
 *   2. the artifact is FRESH but its sources are wrong — two AJS examples shipped
 *      truncated mid-expression because the fence parser was not fence-length aware, so
 *      `bun run docs` faithfully regenerated broken content.
 *
 * (2) is the harder one, because the freshness check passes. So this file checks the
 * property that actually matters to a user: **every example in the shipped bundle
 * compiles.** A truncated, stale or malformed example fails that regardless of which way
 * it got there.
 */
describe('every shipped playground example is usable', () => {
  const docs = JSON.parse(
    readFileSync(join(import.meta.dir, 'docs.json'), 'utf-8')
  )
  const entries: any[] = Array.isArray(docs) ? docs : Object.values(docs).flat()
  const examples = entries.filter((e: any) => e?.type === 'example' && e?.code)

  it('finds examples at all (guards a vacuous pass)', () => {
    expect(examples.length).toBeGreaterThan(20)
  })

  // Deliberately NOT filtered to section === 'tjs'. `demo/src/examples.test.ts` does that,
  // which is exactly why the two broken examples were both on the AJS side.
  for (const ex of examples) {
    const label = `${ex.section ?? '?'}/${ex.title ?? ex.slug}`
    it(`${label} compiles`, () => {
      // A truncated example fails with "Unterminated regular expression" — the symptom
      // both shipped ones had, in the live playground and in the npm package.
      if (ex.section === 'ajs') {
        expect(() => transpile(ex.code, { vmTarget: true })).not.toThrow()
      } else {
        expect(() => tjs(ex.code, { runTests: false })).not.toThrow()
      }
    })
  }
})

/**
 * A benchmark in a shipped example must be sized by DURATION, not by a fixed count.
 *
 * A fixed iteration count is tuned to the hardware of the day and goes stale silently.
 * `wasm-memory.md` timed a single 10,000-float pass and reported it with `toFixed(2)` —
 * already only 0.17ms here, and Firefox clamps `performance.now()` to ~1ms for
 * fingerprinting resistance, so that example printed **"0.00ms"** in Firefox. Published
 * teaching material reading as either "instant" or "broken", depending on the reader's
 * charity. `wasm-simd.md` was heading the same way at 1.6ms.
 *
 * The fix already existed, in exactly one file: `wasm-vector-search.md` carried a
 * `timePerOp` helper AND a comment describing this precise failure — while its two
 * siblings had the bug the comment warns about. That is the sibling-site shape this repo
 * keeps hitting: the correct implementation exists and does not travel.
 *
 * So this asserts the IDIOM rather than a timing, which is the part a reader can't
 * verify by eye: if you measure with `performance.now()`, accumulate until a minimum
 * elapsed time. Examples that use the clock for something other than benchmarking (an
 * FPS counter, a frame delta) are exempt by name, with the reason.
 */
describe('shipped benchmarks are sized by duration, not iteration count', () => {
  const { readFileSync, globSync } = require('fs') as typeof import('fs')
  const { join } = require('path') as typeof import('path')
  const ROOT = join(import.meta.dir, '..')

  /** Uses the clock, but not to benchmark — and why that's fine. */
  const NOT_BENCHMARKS: Record<string, string> = {
    'wasm-starfield.md':
      'animation loop — frame delta and an FPS counter, not a measurement of anything',
  }

  const files = globSync('guides/examples/**/*.md', { cwd: ROOT }).map((p) =>
    p.replaceAll('\\', '/')
  )

  it('scans a plausible number of examples', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const rel of files) {
    const name = rel.split('/').pop() as string
    if (NOT_BENCHMARKS[name]) continue
    const src = readFileSync(join(ROOT, rel), 'utf8')
    if (!src.includes('performance.now()')) continue

    it(`${name} accumulates until a minimum elapsed time`, () => {
      // The shape that makes a measurement hardware-independent: keep going while
      // less than N ms has passed. Anything else is a count someone guessed.
      const accumulates =
        /while\s*\(\s*performance\.now\(\)\s*-\s*\w+\s*<\s*\w+/.test(src)
      expect(accumulates).toBe(true)
    })
  }
})
