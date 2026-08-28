/**
 * Every `scripts/compat-*.ts` is wired into the `test:compat` lane.
 *
 * These six scripts clone a REAL TypeScript project — zod, effect, kysely, radash,
 * superstruct, ts-pattern — transpile its source with `fromTS`, and run **that project's own
 * test suite** against the result. It is the most honest evidence the converter works that
 * this repo has: nobody wrote those tests to make us look good.
 *
 * They were in **no npm script, no CI lane and no release gate** — six scripts someone had to
 * remember. That is precisely how the dogfood ratchets sat unrun for months while a
 * known-failure list rotted at eleven entries, nine of which were one already-fixed defect.
 * A lane that is not invoked does not rot loudly; it rots silently.
 *
 * This test does not run them (they need network and minutes). It asserts the CHEAP thing
 * that fails when the lane is forgotten: that adding a seventh script also adds it to the
 * command. Coverage of the lane's membership, not of its result.
 */
import { describe, it, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))

describe('the compat lane covers every compat script', () => {
  const scripts = readdirSync(join(ROOT, 'scripts'))
    .filter((f) => /^compat-.+\.ts$/.test(f))
    .sort()

  it('there are compat scripts to run (apparatus check)', () => {
    // If the glob ever matches nothing, every assertion below passes vacuously.
    expect(scripts.length).toBeGreaterThan(0)
  })

  it('a `test:compat` lane exists', () => {
    expect(pkg.scripts?.['test:compat']).toBeTruthy()
  })

  it('every compat script is named by it', () => {
    const lane = String(pkg.scripts?.['test:compat'] ?? '')
    const missing = scripts.filter((f) => !lane.includes(f))
    expect(
      missing,
      'add these to the `test:compat` script — a compat script nobody invokes is a ' +
        'test suite that silently stops covering the converter'
    ).toEqual([])
  })

  it('is documented, so it can be found without reading package.json', () => {
    const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf-8')
    expect(claude).toContain('test:compat')
  })
})
