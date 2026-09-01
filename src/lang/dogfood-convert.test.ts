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
import { graduate } from './graduate'
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
      // GRADUATION is a real operation now (`graduate.ts`), not three lines inlined here.
      // It strips the `/* tjs <- … */` annotation — whose presence means JS SEMANTICS — and
      // then applies the rewrites that only become correct once it is gone: dropping `new`
      // on locally-declared classes, and `switch` → `given`. Doing either at CONVERSION time
      // ships files that cannot be imported or cannot be parsed (#37).
      tjs(graduate(converted).code, { runTests: false })
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
 * Back to 95/95 on 2026-08-11, once the ASI guard stopped reading a `//` inside a template
 * literal as a comment (`literal-blindness.test.ts`). `parser-transforms.ts` was the last
 * holdout, and it failed on its OWN error messages: multi-line template concatenations
 * documenting the predicate forms, whose lines contain `// function form`.
 *
 * Raised to 97 on 2026-08-13 by the PROMOTE-CHECK below — three literal-blindness fixes
 * (the `try`/`catch` transform counting braces raw, `extractTests` matching `test {` in
 * strings, and the return-type scanner having no case for a regex literal) each unblocked
 * files that had never converted. The floor is raised because the check demanded it, which
 * is the point of having one: a ratchet that only ever protects the number it was set at
 * lets the gap between actual and asserted widen in silence.
 *
 * Raised to 99 on 2026-08-19 — 99/99, the whole corpus — again by the promote-check. The
 * emit and compile stages had already reached 99/99; graduation was the last one behind,
 * and the review round's parser fixes closed it. There is no slack left to reclaim: the
 * floor now IS the corpus, so any regression at all fails here.
 *
 * Raised to 105 on 2026-08-29 — 105/105, the whole corpus again, and again by the
 * promote-check. The two holdouts were `predicate-canonical.ts` and `runtime.ts`, both
 * failing on `new X` for a locally-declared class; graduation drops that `new`, and it was
 * the `switch` -> `given` work that put graduation in one place (`graduate.ts`) instead of
 * three lines inlined in this file, which is what let the drop actually run. The other half
 * came from a literal-blindness fix in `isFromTS`: it scanned RAW source for the
 * `tjs <- …` provenance comment, so any file MENTIONING it in a string silently lost every
 * TJS mode. `from-ts.ts` emits that annotation from a template, so the converter's own
 * source was the first casualty.
 */
/*
 * Raised to 106 on 2026-08-29 — the whole corpus again. The two holdouts both failed on
 * shapes `fromTS` emits and the TJS parser could not read: an annotated generator
 * (`function* f():! 0.0`) and a destructured parameter with an inline type. Neither was
 * visible while `fromTS` emitted JavaScript through `ts.transpileModule` — nothing ran our
 * parser over the converter's output. See `src/no-ts-emitter.test.ts`.
 */
/*
 * Raised to 108 on 2026-09-01 — the WHOLE corpus converts, compiles and graduates. The last
 * two came from fixes driven by other projects' test suites rather than by this one: an
 * optional parameter no longer acquires its type example as a default (TJS's `?:` means
 * "same as `= value`", so it was the wrong spelling for a TypeScript optional), and a type
 * annotation on a class-method parameter is no longer left as a runtime default.
 *
 * 108/108 is a ceiling, not a finish line — the corpus grows, and this floor exists so a
 * regression on any file already converting fails by name.
 */
const GRADUATION_FLOOR = 108

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
