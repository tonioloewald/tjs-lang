/**
 * Guardrail: the README's bundle-size table must match reality.
 *
 * A published size claim is a **rot-prone claim** — it was honest when written and
 * silently drifts with every dependency and feature. Ours did: the table said the VM
 * was 66 KB gzipped while it had grown to 74 KB (the 0.12.0 security work), and the
 * "full" row was off by 19 KB. That matters more than the 12%: when a reader can
 * disprove a checkable claim in thirty seconds, they discount the *unverifiable* ones
 * too — and the load-bearing claims here are about security.
 *
 * So the numbers are measured, not remembered. This test re-measures the built bundles
 * and fails when the table drifts past TOLERANCE. It runs against `dist/`, which is a
 * build artifact, so it **self-skips when dist/ is absent** (a fresh clone / the fast
 * loop) — and bites where it counts: after `bun run make`, which is part of the
 * pre-tag/publish flow.
 *
 * The general practice: any claim that can rot gets an "as of vX" qualifier AND either
 * self-updates or is tracked by a test. Prefer the test — a qualifier ages honestly but
 * still ages.
 */
import { describe, it, expect } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const DIST = join(ROOT, 'dist')

/** Allowed drift before the table is considered stale. */
const TOLERANCE = 0.1 // 10%

const kb = (bytes: number) => Math.round(bytes / 1024)

function measure(file: string): { raw: number; gz: number } | null {
  const p = join(DIST, file)
  if (!existsSync(p)) return null
  const buf = readFileSync(p)
  return { raw: kb(statSync(p).size), gz: kb(gzipSync(buf).length) }
}

/** Parse the README table rows: | … | <bundle>.js | <n> KB | **<n> KB** | */
function readmeClaims(): Array<{ file: string; raw: number; gz: number }> {
  const md = readFileSync(join(ROOT, 'README.md'), 'utf8')
  const rows: Array<{ file: string; raw: number; gz: number }> = []
  const re =
    /\|[^|\n]*\|\s*([\w.-]+\.js)\s*\|\s*\*{0,2}(\d+)\s*KB\*{0,2}\s*\|\s*\*{0,2}(\d+)\s*KB\*{0,2}\s*\|/g
  for (const m of md.matchAll(re)) {
    rows.push({ file: m[1], raw: Number(m[2]), gz: Number(m[3]) })
  }
  return rows
}

const distBuilt = existsSync(DIST)

describe('README bundle-size table matches the built bundles', () => {
  it.skipIf(!distBuilt)('every claimed size is within tolerance', () => {
    const claims = readmeClaims()
    // If this fails, the table's shape changed — fix the regex or the table.
    expect(claims.length).toBeGreaterThan(0)

    const drifted: string[] = []
    for (const c of claims) {
      const actual = measure(c.file)
      if (!actual) {
        drifted.push(`${c.file}: claimed in README but not present in dist/`)
        continue
      }
      for (const [what, claimed, real] of [
        ['raw', c.raw, actual.raw],
        ['gzip', c.gz, actual.gz],
      ] as const) {
        const off = Math.abs(real - claimed) / Math.max(claimed, 1)
        // The table is written in whole KB, so its own resolution is 1 KB: a bundle
        // moving 3.4→3.6 KB rounds 3→4 and reads as "33% off" while nothing meaningful
        // changed. Require BOTH a relative drift and a delta the table can actually
        // express, or small bundles produce noise that trains people to ignore this.
        if (off > TOLERANCE && Math.abs(real - claimed) > 1) {
          drifted.push(
            `${
              c.file
            } ${what}: README says ${claimed} KB, actual ${real} KB (${(
              off * 100
            ).toFixed(0)}% off)`
          )
        }
      }
    }

    if (drifted.length) {
      throw new Error(
        'README bundle-size table has drifted — re-measure and update it ' +
          '(and bump the "Measured at vX" qualifier):\n  ' +
          drifted.join('\n  ')
      )
    }
  })

  it.skipIf(!distBuilt)(
    'the table carries an "as of version" qualifier',
    () => {
      // A size claim without a version is unfalsifiable-by-inspection: a reader can't
      // tell whether it's current. Require the qualifier so staleness is legible even
      // between runs of this test.
      const md = readFileSync(join(ROOT, 'README.md'), 'utf8')
      expect(md).toMatch(/Measured at v\d+\.\d+\.\d+/)
    }
  )
})
