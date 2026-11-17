/**
 * Every Security entry in the CHANGELOG names the shipped versions it affected (0.14.0 final
 * review M4; practices/releasing.md step 2).
 *
 * A consumer reading a security entry needs one answer first: was the version I run affected?
 * Seven entries in 0.14.0's [Unreleased] did not say. Each `### Security` bullet in the newest
 * section must carry `Affected:`, or `Not a shipped defect` where that is the truth.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const changelog = readFileSync(
  join(import.meta.dir, '..', 'CHANGELOG.md'),
  'utf8'
)

/** The bullets of the first `### Security` block after the newest `## [` heading. */
function securityBullets(text: string): string[] {
  const top = text.indexOf('\n## [')
  const next = text.indexOf('\n## [', top + 5)
  const section = text.slice(top, next === -1 ? undefined : next)
  const at = section.indexOf('\n### Security')
  if (at === -1) return []
  const end = section.indexOf('\n### ', at + 5)
  const block = section.slice(at, end === -1 ? undefined : end)
  return block.split(/\n(?=- \*\*)/).filter((b) => b.startsWith('- **'))
}

describe('CHANGELOG Security entries', () => {
  it('the newest section has Security entries (apparatus)', () => {
    expect(securityBullets(changelog).length).toBeGreaterThan(0)
  })
  it('each names the affected shipped versions', () => {
    const missing = securityBullets(changelog)
      .filter((b) => !/Affected:|Not a shipped defect/.test(b))
      .map((b) => b.slice(0, 90))
    expect(missing).toEqual([])
  })
  it('a bullet without a range is caught (the other direction)', () => {
    expect(
      securityBullets(
        '\n## [Unreleased]\n\n### Security\n\n- **A hole.** Fixed.\n'
      ).filter((b) => !/Affected:/.test(b))
    ).toHaveLength(1)
  })
})
