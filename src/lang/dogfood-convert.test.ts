/**
 * Dogfood: run OUR OWN TypeScript through the converter.
 *
 * We had been measuring TS compatibility on 25 hand-written snippets while ~90 real
 * TypeScript files sat in this repo untouched by the converter. Hand-written cases test what
 * you thought to write down; a real codebase tests what you didn't.
 *
 * Three stages, because they fail for completely different reasons and only one of them is
 * a bug:
 *
 *   1. TS → TJS emit          — can the converter read our TypeScript at all?
 *   2. full chain, modes OFF  — does the emitted TJS actually COMPILE? A failure here is a
 *                               straight converter bug: we produced code that doesn't build,
 *                               which fails obligation 1 of the conversion contract
 *                               (equivalent) before equivalence is even testable.
 *   3. graduation, modes ON   — could the file drop its marker and become real TJS? Failures
 *                               here are mostly LEGITIMATE (`new Date()`, `var`,
 *                               `new Function()`) — they are the footguns TJS exists to fix,
 *                               and each is a site the converter should rewrite or flag with
 *                               guidance (obligation 3). This number is the ladder's
 *                               scoreboard, not a bug count.
 *
 * Ratchets: each stage has a floor it may not fall below. Raise the floor when you improve
 * a stage — that is how a measurement becomes a guarantee instead of a dashboard.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fromTS } from './emitters/from-ts'
import { tjs } from './index'

const SRC = join(import.meta.dir, '..')

/** Every non-test, non-declaration TypeScript file we ship. */
function sources(): string[] {
  const out: string[] = []
  ;(function walk(d: string) {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (
        p.endsWith('.ts') &&
        !p.endsWith('.test.ts') &&
        !p.endsWith('.d.ts')
      )
        out.push(p)
    }
  })(SRC)
  return out
}

const FILES = sources()

/**
 * Slow by nature: the TypeScript compiler runs once per file. Converting ONCE and reusing
 * the result for all three stages keeps it to a single compiler pass instead of three.
 * Gated with the benchmark lane so the inner loop stays fast; the full `bun test` (the
 * pre-tag gate) still runs it.
 */
const SKIP = !!process.env.SKIP_BENCHMARKS

type Stage = { ok: number; fails: Array<{ file: string; why: string }> }
const blank = (): Stage => ({ ok: 0, fails: [] })

function measure() {
  const emit = blank()
  const compiles = blank()
  const graduates = blank()
  const why = (e: any) => String(e.message).split('\n')[0].slice(0, 70)

  for (const f of FILES) {
    const rel = f.replace(SRC + '/', '')
    const src = readFileSync(f, 'utf8')

    let converted: string
    try {
      converted = fromTS(src, { emitTJS: true }).code
      emit.ok++
    } catch (e) {
      emit.fails.push({ file: rel, why: why(e) })
      continue // later stages are unreachable for this file
    }

    try {
      tjs(converted, { runTests: false })
      compiles.ok++
    } catch (e) {
      compiles.fails.push({ file: rel, why: why(e) })
    }

    try {
      tjs(converted.replace(/\/\* tjs <- [^*]*\*\/\n?/, ''), {
        runTests: false,
      })
      graduates.ok++
    } catch (e) {
      graduates.fails.push({ file: rel, why: why(e) })
    }
  }
  return { emit, compiles, graduates, total: FILES.length }
}

const report = (label: string, st: Stage, total: number) => {
  console.log(
    `  ${label}: ${st.ok}/${total} (${Math.round((st.ok / total) * 100)}%)`
  )
  for (const f of st.fails.slice(0, 5)) console.log(`      ${f.file}: ${f.why}`)
  if (st.fails.length > 5)
    console.log(`      … and ${st.fails.length - 5} more`)
}

describe.skipIf(SKIP)(
  'dogfood: our own TypeScript through the converter',
  () => {
    it('has a corpus worth measuring', () => {
      expect(FILES.length).toBeGreaterThan(50)
    })

    it(
      'converts, compiles, and graduates at or above the ratchet floors',
      () => {
        const r = measure()
        report('stage 1 emit      ', r.emit, r.total)
        report('stage 2 compiles  ', r.compiles, r.total)
        report('stage 3 graduation', r.graduates, r.total)

        // Stage 1 — the converter must be able to READ all of our TypeScript.
        expect(
          r.emit.ok / r.total,
          'the converter cannot read some of our own TypeScript'
        ).toBe(1)

        // Stage 2 — converted output that does NOT COMPILE is a straight converter bug: it
        // breaks obligation 1 of the conversion contract before equivalence is even testable.
        // Highest-priority number on this page. Raise the floor as bugs are fixed.
        expect(
          r.compiles.ok / r.total,
          'we are emitting TJS that does not build'
        ).toBeGreaterThanOrEqual(0.88)

        // Stage 3 — the ladder's scoreboard, not a bug count. Most failures are legitimate
        // footgun sites the converter should rewrite or flag with guidance.
        expect(r.graduates.ok / r.total).toBeGreaterThanOrEqual(0.73)
      },
      { timeout: 180_000 }
    )
  }
)
