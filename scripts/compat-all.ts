#!/usr/bin/env bun
/**
 * Run every `compat-*.ts` and report a table — the `test:compat` lane.
 *
 * ## Why this exists rather than chaining the scripts with `&&`
 *
 * It was `bun scripts/compat-zod.ts && bun scripts/compat-effect.ts && …`, and the first run
 * ever attempted died immediately: zod's monorepo needs `pnpm`, which was not on PATH. With
 * `&&`, that meant **five healthy suites reported nothing**. The lane's first outing produced
 * a single ENOENT and no information about the converter at all.
 *
 * A compatibility lane exists to tell you what still works. One missing prerequisite must
 * cost one row, not the report. So: run all, keep going, summarise, and exit non-zero only
 * if something genuinely FAILED — a skipped prerequisite is reported and does not fail the
 * lane, because "zod needs pnpm" is not a fact about our converter.
 *
 * Run: `bun run test:compat`   (or `bun scripts/compat-all.ts --only zod,effect`)
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/**
 * Prerequisites a script needs beyond bun. Reported as SKIP rather than FAIL when absent,
 * with the remedy — an unmet prerequisite says nothing about the converter.
 */
const NEEDS: Record<string, { cmd: string; hint: string }> = {
  zod: {
    cmd: 'pnpm',
    hint: 'zod is a pnpm monorepo — `corepack enable pnpm`, or `npm i -g pnpm`',
  },
}

async function has(cmd: string): Promise<boolean> {
  const p = Bun.spawn(['which', cmd], { stdout: 'ignore', stderr: 'ignore' })
  return (await p.exited) === 0
}

const only = (() => {
  const i = process.argv.indexOf('--only')
  return i === -1 ? null : process.argv[i + 1]?.split(',').map((s) => s.trim())
})()

const targets = readdirSync(join(ROOT, 'scripts'))
  .filter((f) => /^compat-(?!all)[a-z0-9-]+\.ts$/.test(f))
  .map((f) => f.replace(/^compat-|\.ts$/g, ''))
  .filter((n) => !only || only.includes(n))
  .sort()

type Row = { name: string; status: 'pass' | 'fail' | 'skip'; note: string }
const rows: Row[] = []

for (const name of targets) {
  const need = NEEDS[name]
  if (need && !(await has(need.cmd))) {
    rows.push({ name, status: 'skip', note: need.hint })
    console.log(`\n=== ${name}: SKIPPED — ${need.hint}\n`)
    continue
  }
  console.log(`\n=== ${name} ===`)
  const proc = Bun.spawn(['bun', join(ROOT, 'scripts', `compat-${name}.ts`)], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const out = await new Response(proc.stdout).text()
  const err = await new Response(proc.stderr).text()
  const code = await proc.exited
  const tail = (out + err).trimEnd().split('\n').slice(-6).join('\n')
  console.log(tail)
  // Each script prints its own summary; the exit code is the verdict.
  const m = (out + err).match(
    /(\d+)\s*\/\s*(\d+)\s*(?:tests? passed|source files)/i
  )
  rows.push({
    name,
    status: code === 0 ? 'pass' : 'fail',
    note: m ? m[0] : code === 0 ? 'ok' : `exit ${code}`,
  })
}

console.log('\n━━━━━━━━━━━━━━━━ compat lane ━━━━━━━━━━━━━━━━')
for (const r of rows) {
  const mark = r.status === 'pass' ? '✓' : r.status === 'skip' ? '–' : '✗'
  console.log(`  ${mark} ${r.name.padEnd(14)} ${r.status.padEnd(5)} ${r.note}`)
}
const failed = rows.filter((r) => r.status === 'fail')
const skipped = rows.filter((r) => r.status === 'skip')
console.log(
  `\n  ${rows.filter((r) => r.status === 'pass').length} passed, ` +
    `${failed.length} failed, ${skipped.length} skipped`
)
if (skipped.length) {
  console.log(`  (skips are unmet PREREQUISITES, not converter results)`)
}
process.exit(failed.length > 0 ? 1 : 0)
