/**
 * Guards the "update both" convention in CLAUDE.md: `llms.txt` is the
 * agent-facing navigation index, and it only works if it stays complete. A doc
 * or entry point that exists but isn't indexed is invisible to the agents the
 * index exists for — which is how `predicate.ts`, the north-star doc, and the
 * CHANGELOG all went missing without anyone noticing.
 *
 * Three checks, all cheap:
 *   1. every top-level and `docs/` markdown file is linked from llms.txt
 *   2. every `exports` subpath in package.json is named in llms.txt
 *   3. every relative link in llms.txt actually resolves
 *
 * To exempt something, add it to the allowlist below WITH A REASON. The reason
 * is the point — an unexplained exemption is just a silent hole.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { globSync } from 'fs'

const ROOT = join(import.meta.dir, '..')
const llms = readFileSync(join(ROOT, 'llms.txt'), 'utf8')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** Docs deliberately absent from the agent index, and why. */
const UNINDEXED_DOCS: Record<string, string> = {
  'docs/README.md':
    'the human/website docs index; llms.txt is its agent-facing counterpart',
  '.haltija.md': 'local browser-debugging tool setup, not part of the package',
}

/** Entry points deliberately absent from the agent index, and why. */
const UNINDEXED_EXPORTS: Record<string, string> = {
  './src': 'raw-source escape hatch, not a supported import',
}

describe('llms.txt is a complete index', () => {
  it('links every top-level and docs/ markdown file', () => {
    const docs = [
      ...globSync('*.md', { cwd: ROOT }),
      ...globSync('docs/*.md', { cwd: ROOT }),
    ].map((p) => p.replaceAll('\\', '/'))

    const missing = docs
      .filter((d) => !UNINDEXED_DOCS[d])
      .filter((d) => !llms.includes(`(${d})`))

    expect(missing).toEqual([])
  })

  it('names every package entry point', () => {
    const subpaths = Object.keys(pkg.exports)
      .filter((s) => !UNINDEXED_EXPORTS[s])
      // '.' is the bare package name; './lang' is imported as 'tjs-lang/lang'
      .map((s) => (s === '.' ? 'tjs-lang' : `tjs-lang/${s.slice(2)}`))

    const missing = subpaths.filter((s) => !llms.includes(`\`${s}\``))

    expect(missing).toEqual([])
  })

  it('has no broken relative links', () => {
    const links = [...llms.matchAll(/\]\((?!https?:)([^)]+)\)/g)].map(
      (m) => m[1]
    )

    expect(links.length).toBeGreaterThan(10) // the regex still finds links
    const broken = links.filter((l) => !existsSync(join(ROOT, l)))

    expect(broken).toEqual([])
  })
})
