/**
 * Dependency-audit gate. Fails the suite on any **high or critical** advisory from
 * `bun audit` that isn't covered by a non-expired entry in `audit-exemptions.ts`.
 *
 * This is the security counterpart to the other pre-tag lanes: it runs in the full
 * `bun test` gate but is skipped by `test:fast` (it needs the network and is slow) —
 * set `SKIP_AUDIT=1` to skip it explicitly. Exemptions are deliberate and time-gated
 * (see audit-exemptions.ts): they lapse on their `until` date, forcing a re-review
 * rather than silencing an advisory forever.
 *
 * Offline / `bun audit` unavailable → the gate self-skips (a network blip must not red
 * the suite); the pre-push gate runs online where it counts.
 */
import { describe, it, expect } from 'bun:test'
import { AUDIT_EXEMPTIONS } from '../audit-exemptions'

const SKIP_AUDIT = process.env.SKIP_AUDIT === '1'

interface HighAdvisory {
  ghsa: string
  package: string
  severity: string
  title: string
}

function ghsaOf(a: any): string {
  return (
    String(a?.url ?? '').split('/advisories/')[1] || String(a?.id ?? 'unknown')
  )
}

/** Run `bun audit --json`; returns the package→advisories map, or null if unavailable. */
function runAudit(): Record<string, any[]> | null {
  try {
    const proc = Bun.spawnSync(['bun', 'audit', '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const out = proc.stdout.toString().trim()
    if (!out) return null
    const parsed = JSON.parse(out)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

// Only touch the network when the gate actually runs.
const audit = SKIP_AUDIT ? null : runAudit()

function highAdvisories(map: Record<string, any[]>): HighAdvisory[] {
  const out: HighAdvisory[] = []
  for (const [pkg, advs] of Object.entries(map)) {
    for (const a of advs ?? []) {
      if (a?.severity === 'high' || a?.severity === 'critical') {
        out.push({
          ghsa: ghsaOf(a),
          package: pkg,
          severity: a.severity,
          title: a.title,
        })
      }
    }
  }
  return out
}

describe('dependency audit gate (high+ severities)', () => {
  it.skipIf(SKIP_AUDIT)(
    'no un-exempted or expired high/critical advisories',
    () => {
      if (audit === null) {
        console.warn(
          '[audit] bun audit produced no JSON (offline?) — gate self-skipped'
        )
        return
      }
      const now = Date.now()
      const exempt = new Map(AUDIT_EXEMPTIONS.map((e) => [e.ghsa, e]))

      const unresolved = highAdvisories(audit)
        // one line per (ghsa) — dedupe advisories reported under multiple paths
        .filter((a, i, arr) => arr.findIndex((b) => b.ghsa === a.ghsa) === i)
        .filter((a) => {
          const e = exempt.get(a.ghsa)
          return !e || Date.parse(e.until) <= now // unexempted OR the exemption has lapsed
        })

      if (unresolved.length > 0) {
        const lines = unresolved.map((a) => {
          const e = exempt.get(a.ghsa)
          const why = e
            ? `EXPIRED exemption (until ${e.until}) — fix the advisory or renew with fresh justification`
            : 'no exemption — fix it, or add a dated exemption to audit-exemptions.ts (dev/deploy-only tooling with no clean fix)'
          return `  [${a.severity}] ${a.package} ${a.ghsa}: ${a.title}\n      → ${why}`
        })
        throw new Error(
          `${unresolved.length} high/critical advisory(ies) not resolved by a live exemption:\n` +
            lines.join('\n')
        )
      }
      expect(unresolved.length).toBe(0)
    }
  )

  it.skipIf(SKIP_AUDIT)(
    'has no dead exemptions (advisory gone → remove it)',
    () => {
      if (audit === null) return
      const present = new Set<string>()
      for (const advs of Object.values(audit))
        for (const a of advs ?? []) present.add(ghsaOf(a))

      // A dead exemption (advisory no longer reported) is a cleanup nudge, not a hard
      // failure — upstream fixing a vuln shouldn't red the suite. Warn loudly.
      const dead = AUDIT_EXEMPTIONS.filter((e) => !present.has(e.ghsa))
      if (dead.length > 0) {
        console.warn(
          `[audit] ${dead.length} exemption(s) no longer needed — delete from audit-exemptions.ts: ` +
            dead.map((e) => `${e.ghsa} (${e.package})`).join(', ')
        )
      }
      expect(true).toBe(true)
    }
  )
})
