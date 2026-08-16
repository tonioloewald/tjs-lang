/**
 * Nothing the repo means to ignore is tracked, and the tarball is what we think it is.
 *
 * Two failures this release, both silent, both from a rule that looked right:
 *
 * **`.gitignore` has no inline comments.** A line reading
 * `.models.cache.json  # pre-0.13.0 location` matches **nothing** — git treats the whole
 * line as the pattern. So the very commit that stopped the model-audit cache littering a
 * consumer's cwd committed 830 bytes of local LM Studio inventory (`localhost:1234`, a
 * model list, no `probeVersion`) into the repo. The annotation that broke it was added in
 * the same session as the fix, which is the shape to watch for: a comment explaining a
 * pattern, written *onto* the pattern.
 *
 * **`files` is an allowlist that nobody diffed.** It gained 14 entries and 3 exclusions
 * this release with no assertion on what actually ships. `docs` was included wholesale,
 * so 258KB of internal review reports were going out in the tarball until someone ran
 * `npm pack --dry-run` by hand.
 *
 * Both are cheap to check and neither was checked. `git ls-files -i -c` asks git itself
 * whether a tracked file matches an ignore rule, so it cannot disagree with the rules the
 * way a hand-maintained list would.
 */
import { describe, it, expect } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })

describe('tracked files respect .gitignore', () => {
  it('no tracked file matches an ignore rule', () => {
    // If this fails, either the file should not be committed, or the rule is wrong —
    // and a rule that is wrong is usually a rule that matches nothing.
    const offenders = git('ls-files', '-i', '-c', '--exclude-standard')
      .split('\n')
      .filter(Boolean)
    expect(offenders).toEqual([])
  })

  it('.gitignore has no inline comments', () => {
    // The mechanism behind the failure above, checked directly so the diagnosis arrives
    // with the symptom. A `#` mid-line is not a comment; it is part of the pattern.
    // The WORKING TREE, not `HEAD` — a guard should describe the state you are about to
    // commit, not the one you already did.
    const lines = readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n')
    const inline = lines
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(({ l }) => {
        const t = l.trim()
        if (!t || t.startsWith('#')) return false
        // A literal `\#` is an escaped hash and legitimately part of a pattern.
        return /[^\\]\s#/.test(l)
      })
      .map(({ l, n }) => `.gitignore:${n}: ${l.trim()}`)
    expect(inline).toEqual([])
  })
})

describe('the published tarball', () => {
  /** What `npm pack` would actually ship. */
  const packed = (): string[] => {
    const out = execFileSync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    )
    const parsed = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>
    return parsed[0].files.map((f) => f.path)
  }

  const files = packed()

  it('ships a plausible number of files (apparatus check)', () => {
    // A parse that returned nothing would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(100)
  })

  it('does not ship tests', () => {
    expect(files.filter((f) => f.endsWith('.test.ts'))).toEqual([])
  })

  it('does not ship review reports', () => {
    // `docs` is included wholesale, so this exclusion is load-bearing and easy to lose.
    expect(files.filter((f) => f.startsWith('docs/reviews/'))).toEqual([])
  })

  it('every directory named in `files` contributes something', () => {
    // An allowlist entry that matches nothing is either a typo or a directory that moved,
    // and both read as "we ship that" until someone looks.
    const pkg = JSON.parse(
      execFileSync('cat', ['package.json'], { cwd: ROOT, encoding: 'utf8' })
    ) as { files: string[] }
    const dirs = pkg.files.filter(
      (f) => !f.startsWith('!') && !f.includes('.') && f !== 'bin'
    )
    const empty = dirs.filter((d) => !files.some((f) => f.startsWith(`${d}/`)))
    expect(empty).toEqual([])
  })
})
