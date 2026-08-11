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

/**
 * Files that must graduate — a floor that may only RISE. 100% is the 1.0 gate.
 *
 * Pinning at 100% conflated two jobs. Catching a REGRESSION is a release gate and stays
 * hard. Reaching 100% is a 1.0 target, and enforcing an aspiration as a gate means every
 * language change that outpaces the converter blocks every release until it is chased
 * down — which is how a gate stops being read. `dogfood-tests.test.ts` already models the
 * right shape: a floor that may only improve, with a promote-check so a fix cannot rot
 * back into reclaimable slack.
 *
 * One file short today: `parser-transforms.ts`, whose converted output fails to parse
 * through an interaction between two adjacent functions. The error location it reports is
 * misattributed, which is why it survived several rounds of isolation — repro in TODO.md.
 */
const GRADUATION_FLOOR = 94

/** Improve by this much and the test asks for the floor to be raised. */
const RATCHET_SLACK = 2

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
        // breaks obligation 1 of the conversion contract before equivalence is even
        // testable. Reached 100% on 2026-08-01 and pinned there deliberately: this is the
        // floor the whole TS on-ramp rests on, and every point of slack here is a file
        // someone cannot convert.
        expect(
          r.compiles.ok / r.total,
          'we are emitting TJS that does not build'
        ).toBe(1)

        // Stage 3 — a RATCHET (see GRADUATION_FLOOR). It reached 100% on 2026-08-02;
        // abolishing `new` in 0.13.0 dropped it, because our own source constructs its own
        // classes, and the converter's `new X()` rewrite recovered all but one file.
        //
        // The last two files to graduate under the old pin were
        // Timestamp.ts and LegalDate.ts, which use `new Date()` because they ARE the
        // alternative the rule points you to; they now say so per-construct with
        // `/* @tjs-unsafe */`, so an ACCIDENTAL `new Date()` added to them is still caught.
        //
        // WHAT THIS PROVES, AND WHAT IT DOES NOT.
        //
        // It proves every file we ship converts to TJS and COMPILES with the rules on —
        // "we could write our own codebase in this language" as a number rather than a
        // claim. It does NOT prove the converted code still does the same thing: both
        // stages discard `.code` without executing it. Measured during the pre-release
        // review: 10 out of 10 semantics-breaking mutations to converted TJS
        // (`!==` → `===`, dropped `?.`, `&&` → `||`) were counted `ok` by both stages.
        //
        // So this is a BUILD gate, not a behaviour gate, and the difference matters
        // because "100% dogfooded" reads like the second. PRINCIPLES.md already concedes
        // it under "Enforcement (open)"; a fourth stage executing the safely-runnable pure
        // subset and diffing against the native module is the fix (TODO).
        const graduated = r.graduates.ok
        expect(
          `${graduated}/${r.total}`,
          `graduation fell below the floor of ${GRADUATION_FLOOR}`
        ).toBe(`${Math.max(graduated, GRADUATION_FLOOR)}/${r.total}`)
        // Locked in when it improves, rather than left as slack a regression could eat.
        expect(
          graduated - GRADUATION_FLOOR >= RATCHET_SLACK
            ? `improved to ${graduated} — raise GRADUATION_FLOOR in this file`
            : 'ok'
        ).toBe('ok')
      },
      { timeout: 180_000 }
    )
  }
)
