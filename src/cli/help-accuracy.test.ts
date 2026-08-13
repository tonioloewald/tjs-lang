/**
 * `--help` describes the CLI that exists, and `--version` reports this package.
 *
 * Both had drifted, in the way documentation always drifts — silently, and in the output
 * users quote back in bug reports:
 *
 *   - `VERSION` was hard-coded `'0.6.45'` in a 0.13.0 package. Seven minor versions of
 *     wrong, and `bin/dev.ts` had been reading `pkg.version` correctly the whole time.
 *   - `--max-warnings`, the release's flagship CI ergonomic, appeared in no help text and
 *     no document except one CHANGELOG line.
 *
 * A flag nobody can discover is a flag nobody uses, and a version string nobody can trust
 * makes every bug report name the wrong release. Neither is caught by a test that only
 * exercises behaviour, so this file reads the help text itself.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import pkg from '../../package.json'

const SOURCE = readFileSync(join(import.meta.dir, 'tjs.ts'), 'utf8')
const HELP = SOURCE.slice(
  SOURCE.indexOf('const HELP = `') + 'const HELP = `'.length,
  SOURCE.indexOf(
    '`',
    SOURCE.indexOf('const HELP = `') + 'const HELP = `'.length
  )
)

describe('the version is the package version', () => {
  it('is not hard-coded', () => {
    expect(SOURCE).toContain('pkg.version')
    expect(
      /const VERSION = '[\d.]+'/.test(SOURCE),
      'a literal version string drifts — read it from package.json'
    ).toBe(false)
  })

  it('matches package.json', async () => {
    const proc = Bun.spawn(
      ['bun', join(import.meta.dir, 'tjs.ts'), '--version'],
      { stdout: 'pipe', stderr: 'ignore' }
    )
    const out = await new Response(proc.stdout).text()
    expect(out.trim()).toBe(`tjs v${pkg.version}`)
  })
})

describe('every flag the CLI parses is documented', () => {
  // Read the flags the argument parser actually looks for, and require each to appear in
  // the help text. Derived rather than listed, so a new flag cannot be added without
  // either documenting it or failing here.
  // Scoped to flags THIS file's argument parser recognises. `src/cli/commands/test.ts`
  // also mentions `--preload`/`--coverage`/`--bail`/`--timeout`, but those are arguments
  // it PASSES to `bun test`, not flags it accepts from the user.
  const parsed = [
    ...new Set(
      [
        ...SOURCE.matchAll(
          /(?:a === |args\.includes\(|args\[i - 1\] === )'(--[a-z-]+)'/g
        ),
      ].map((m) => m[1])
    ),
  ]

  it('found flags to check — apparatus', () => {
    expect(parsed.length).toBeGreaterThan(5)
    expect(parsed).toContain('--max-warnings')
  })

  for (const flag of parsed) {
    it(`${flag} appears in --help`, () => {
      expect(HELP).toContain(flag)
    })
  }
})

describe('the help text describes what commands actually do', () => {
  it('mentions that `test` runs inline test blocks, not only .test.tjs files', () => {
    // `tjs test <file.tjs>` gained inline-test running in this release while the help
    // still said "Run .test.tjs test files".
    const testLine = HELP.slice(
      HELP.indexOf('  test '),
      HELP.indexOf('  convert ')
    )
    expect(testLine).toMatch(/inline|test \{ \}/)
  })
})
