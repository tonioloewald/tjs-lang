/**
 * Every file in the compat corpus through TS -> TJS -> JS, as a RATCHET.
 *
 * The compat scripts run each project's own test suite, which is the honest end-to-end
 * measure but slow, network-dependent, and coarse: a target either passes or does not. This
 * is the other half — does every file CONVERT AND PARSE — and it names the exact files that
 * do not, so the number cannot drift without somebody being told which file moved.
 *
 * Two directions, like the dogfood ratchets:
 *
 *   - a file that fails and is NOT in `KNOWN` is a regression;
 *   - a file in `KNOWN` that now passes must be removed, or a fix rots there unnoticed.
 *
 * ## Skips are named, never silent
 *
 * Files over `MAX_BYTES` are skipped because `preprocess` is QUADRATIC in file size —
 * measured on effect's 1.96 MB generated `httpApiSwagger.ts`: 16KB 182ms, 32KB 642ms,
 * 64KB 2.5s, 128KB 10.2s, 256KB 39.4s, a clean 4x per doubling, extrapolating to ~37 minutes
 * for the whole file. It does not fail, it HANGS — a corpus scan sat at 100% CPU for 51
 * minutes with no output. Every skip is printed with its size, because a skip that reads like
 * a pass is the defect this repo keeps rediscovering.
 *
 * Run:  bun scripts/compat-scan.ts            (ratchet; non-zero exit on drift)
 *       bun scripts/compat-scan.ts --list     (print a ready-to-paste KNOWN block)
 */
import { readFileSync, statSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { fromTS } from '../src/lang/emitters/from-ts'
import { tjs } from '../src/lang'

const ROOT = join(import.meta.dir, '..')
const CORPUS = join(ROOT, '.compat-tests')
const TARGETS = [
  'radash',
  'ts-pattern',
  'zod',
  'superstruct',
  'kysely',
  'effect',
]

/** Above this, `preprocess`'s quadratic makes the scan hang rather than finish. */
const MAX_BYTES = 400 * 1024

/**
 * Files that do not convert-and-parse today, with WHY.
 *
 * A cause, not just an error string — "known failure" with no diagnosis is how a ratchet
 * becomes a graveyard. Recorded 2026-09-02 at 1973/1973 (100%).
 */
/**
 * Files that do not convert-and-parse today.
 *
 * EMPTY, as of 2026-09-02 — 1973/1973. Every file in six real TypeScript projects converts
 * and parses. Keep it that way: an entry appearing here is a regression, and the scan fails
 * on it by name. It is deliberately not deleted, because "no known failures" is a state to
 * defend rather than a milestone to celebrate — the corpus grows, and the next `bun run
 * test:compat` clone may add files nobody here has seen.
 *
 * If you add an entry, record the CAUSE and not the error text. Three entries in this map
 * were filed under the wrong cause because the message described where the parser stopped
 * rather than what was wrong: "ambiguous overloads" was a scope-blind merge, "rest param in a
 * method" was a `$` in a function name, and "getter emitted with parameters" was a type-only
 * class field two lines above absorbing the next member.
 */
const KNOWN = new Map<string, string>([])

interface Failure {
  file: string
  cause: string
}

function scan() {
  const failures: Failure[] = []
  const skipped: Array<[string, number]> = []
  const perTarget: Array<[string, number, number]> = []
  let ok = 0
  let total = 0

  for (const name of TARGETS) {
    const dir = join(CORPUS, name)
    if (!existsSync(dir)) continue
    const files = execSync(
      `find ${dir} -name '*.ts' ! -name '*.d.ts' ! -name '*.test.ts' ! -path '*/node_modules/*' ! -path '*/tests/*' ! -path '*/dist/*'`
    )
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)

    let tOk = 0
    let tTot = 0
    for (const f of files) {
      const size = statSync(f).size
      const rel = f.slice(CORPUS.length + 1)
      if (size > MAX_BYTES) {
        skipped.push([rel, size])
        continue
      }
      tTot++
      let out: string
      try {
        out = fromTS(readFileSync(f, 'utf8'), {
          emitTJS: true,
          filename: f,
        }).code
      } catch (e: any) {
        failures.push({
          file: rel,
          cause: 'CONVERT: ' + String(e.message).slice(0, 60),
        })
        continue
      }
      try {
        tjs(out, { runTests: false })
        tOk++
      } catch (e: any) {
        failures.push({
          file: rel,
          cause: String(e.message).split(' at <source>')[0].slice(0, 60),
        })
      }
    }
    ok += tOk
    total += tTot
    perTarget.push([name, tOk, tTot])
  }
  return { failures, skipped, perTarget, ok, total }
}

const listMode = process.argv.includes('--list')

if (!existsSync(CORPUS)) {
  // An absent corpus is NOT a pass. Say so and exit non-zero for the ratchet, so this can
  // never read as "everything converts".
  console.error(
    `\n  No corpus at ${CORPUS}.\n` +
      `  Run \`bun run test:compat\` once to clone it, then re-run.\n`
  )
  process.exit(listMode ? 0 : 1)
}

const { failures, skipped, perTarget, ok, total } = scan()

console.log('')
for (const [name, tOk, tTot] of perTarget) {
  console.log(
    `  ${name.padEnd(12)}${String(tOk).padStart(5)}/${String(tTot).padEnd(6)}${(
      (100 * tOk) /
      tTot
    ).toFixed(1)}%`
  )
}
console.log(
  `\n  TOTAL ${ok}/${total}  (${((100 * ok) / total).toFixed(2)}%)   ` +
    `failures ${failures.length}   skipped ${skipped.length}`
)

for (const [f, size] of skipped) {
  console.log(
    `  SKIP  ${Math.round(size / 1024)}KB  ${f}   (preprocess is quadratic)`
  )
}

if (listMode) {
  console.log('\n// paste into KNOWN:')
  for (const { file, cause } of failures) {
    console.log(`  ['${file}', '${cause.replace(/'/g, "\\'")}'],`)
  }
  process.exit(0)
}

const failed = new Set(failures.map((f) => f.file))
const unexpected = failures.filter((f) => !KNOWN.has(f.file))
const fixed = [...KNOWN.keys()].filter((k) => !failed.has(k))

if (unexpected.length) {
  console.log('\n  REGRESSION — these fail and are not in KNOWN:')
  for (const { file, cause } of unexpected)
    console.log(`    ${cause}\n       ${file}`)
}
if (fixed.length) {
  console.log(
    '\n  FIXED — remove these from KNOWN (a fix must not rot here unnoticed):'
  )
  for (const f of fixed) console.log(`    ${f}`)
}
if (!unexpected.length && !fixed.length) {
  console.log(`\n  ratchet holds: ${KNOWN.size} known failures, no drift\n`)
}
process.exit(unexpected.length || fixed.length ? 1 : 0)
