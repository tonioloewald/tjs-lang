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
 * becomes a graveyard. Recorded 2026-08-31 at 1956/1973 (99.14%).
 */
const KNOWN = new Map<string, string>([
  // --- ambiguous polymorphic overloads (5) -----------------------------------------------
  // TypeScript separates these by types that do not exist at runtime, so TJS dispatch
  // genuinely cannot. `emitOverloadGroup` already falls back to the implementation when it
  // can SEE the ambiguity; these reach the parser instead, so the detection is incomplete.
  ['effect/packages/platform/src/HttpApi.ts', "overloads for 'process'"],
  ['effect/packages/effect/src/internal/effectable.ts', "overloads for 'Base'"],
  ['effect/packages/effect/src/Iterable.ts', "overloads for 'next'"],
  ['effect/packages/sql-pg/src/PgClient.ts', "overloads for 'onError'"],
  [
    'effect/packages/platform-node/src/internal/httpClient.ts',
    "overloads for 'onError'",
  ],

  // --- a declaration collides with a value of the same name (2) ---------------------------
  // The `valueNames` guard exists and covers the common shape; these are the ones it misses.
  // Two more lived here, plus one from the cluster below, until destructuring renames stopped
  // being rewritten as dictionary members — the collision was a SYMPTOM of the rename.
  [
    'effect/packages/cluster/src/ShardingRegistrationEvent.ts',
    "'EntityRegistered' already declared",
  ],
  ['kysely/test/node/src/test-setup.ts', "'Database' already declared"],

  // --- emitted shape acorn rejects (2) ----------------------------------------------------
  // Not parse GAPS — these are constructs we emit that are not valid JavaScript, which is
  // the more serious kind. See the export/super/generator fixes for the same class.
  // Two more lived here until the method-head guard learned about `new` (see below).
  [
    'effect/packages/effect/src/internal/ref.ts',
    'getter emitted with parameters',
  ],
  ['effect/packages/rpc/src/RpcServer.ts', 'parenthesized binding pattern'],

  // --- parse failures needing individual diagnosis (8) ------------------------------------
  // Locate these in the PREPROCESSED source, not the emitted TJS: acorn's offsets are into
  // the former, and reading the TJS line at that number produces innocent-looking lines and
  // several wrong turns.
  ['effect/packages/effect/src/Schema.ts', 'Unexpected token'],
  [
    'effect/packages/effect/src/internal/subscriptionRef.ts',
    'Unexpected token',
  ],
  [
    'effect/packages/platform-node-shared/src/internal/commandExecutor.ts',
    'Unexpected token',
  ],
  ['effect/packages/ai/ai/src/Tool.ts', 'Unexpected token'],
  ['effect/packages/ai/ai/src/Prompt.ts', 'Unexpected token'],
  ['effect/packages/ai/ai/src/Response.ts', 'Unexpected token'],
  [
    'zod/packages/zod/src/v4/core/registries.ts',
    'rest param with a type annotation, in a method',
  ],
  [
    'zod/packages/zod/src/v4/core/core.ts',
    'FunctionPredicate(...) as a parameter type',
  ],
])

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
