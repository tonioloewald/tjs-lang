/**
 * Guards the "update both" convention in CLAUDE.md: `llms.txt` is the
 * agent-facing navigation index, and it only works if it stays complete. A doc
 * or entry point that exists but isn't indexed is invisible to the agents the
 * index exists for — which is how `predicate.ts`, the north-star doc, and the
 * CHANGELOG all went missing without anyone noticing.
 *
 * Four checks, all cheap:
 *   1. every top-level and `docs/` markdown file is linked from llms.txt
 *   2. every `exports` subpath in package.json is named in llms.txt
 *   3. every relative link in llms.txt actually resolves in the repo
 *   4. every relative link ALSO resolves in the published tarball
 *
 * Check 4 exists because checks 1–3 certified the wrong artifact. `llms.txt`
 * ships in the npm package, so the copy that matters is the one a consumer
 * reads from `node_modules` — and resolving its links against the repo root
 * said "complete" while **29 of 43 were 404 in the tarball**, including
 * `CLAUDE-TJS-SYNTAX.md`, the doc llms.txt names as the thing to read first.
 * A relative link is a promise about the artifact it ships inside.
 *
 * Two ways to keep it green: ship the file (add it to `files` in package.json),
 * or link it absolutely on GitHub — which is right for repo-process docs
 * (TODO/PLAN/AGENTS) that describe the repository rather than the package.
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

/** Where a doc that doesn't ship in the package is linked instead. */
const BLOB = 'https://github.com/tonioloewald/tjs-lang/blob/main/'

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

    // Indexed either way: a package-relative link (the doc ships) or an absolute
    // GitHub link (a repo-process doc that deliberately doesn't). Both are real
    // index entries; only the second survives check 4.
    const missing = docs
      .filter((d) => !UNINDEXED_DOCS[d])
      .filter((d) => !llms.includes(`(${d})`) && !llms.includes(`${BLOB}${d})`))

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
    expect(RELATIVE_LINKS.length).toBeGreaterThan(10) // the regex still finds links
    const broken = RELATIVE_LINKS.filter((l) => !existsSync(join(ROOT, l)))

    expect(broken).toEqual([])
  })

  it('has no relative link that 404s in the published package', () => {
    const shipped = publishedFiles()
    const isShipped = (link: string) => {
      const p = link.split('#')[0].replace(/^\.\//, '')
      if (!p) return true // a bare '#anchor' is same-document
      // A directory link (`examples/`) is satisfied by anything shipped under it.
      return p.endsWith('/')
        ? shipped.some((f) => f.startsWith(p))
        : shipped.includes(p)
    }

    const missing = RELATIVE_LINKS.filter((l) => !isShipped(l))
    expect(missing).toEqual([])
  })
})

const RELATIVE_LINKS = [
  ...new Set([...llms.matchAll(/\]\((?!https?:)([^)]+)\)/g)].map((m) => m[1])),
]

/**
 * The file list `npm publish` would actually produce — npm's own packlist, not a
 * re-implementation of its `files`/`.npmignore` precedence rules. Modelling those
 * by hand is how you get a guard that agrees with itself and disagrees with npm.
 *
 * Deliberately throws rather than degrading to "assume everything ships": a probe
 * that can't run must fail the test, not silently certify. `--dry-run` writes no
 * tarball; it costs ~0.9s.
 */
function publishedFiles(): string[] {
  const { execFileSync } =
    require('child_process') as typeof import('child_process')
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const parsed = JSON.parse(out) as Array<{ files: Array<{ path: string }> }>
  const files = parsed[0]?.files?.map((f) => f.path)
  if (!files?.length) throw new Error('npm pack --dry-run returned no files')
  return files
}

/**
 * `demo/docs.json` is a SHIPPED, GENERATED artifact, and generated artifacts rot silently.
 *
 * It is the playground's entire content, and `package.json` `files` includes `demo`, so it
 * also goes out in the npm tarball. Two independent failures had both already happened by
 * 0.13.0:
 *
 *   - **Stale.** Twelve documents differed from HEAD. The shipped `CLAUDE-TJS-SYNTAX.md`
 *     still taught `new Point(10, 20) // Still works, but linter warns` (a compile error)
 *     and a WASM assignment form that was never implemented — the two claims
 *     `src/doc-snippets.test.ts` cites as its whole reason for existing. Fixed in the repo,
 *     still shipping to readers.
 *   - **Bloated.** The traversal's ignore list named `.git`/`.archive`/`.demo`
 *     individually, so `.compat-tests/` — a scratch checkout of zod, effect, radash and
 *     friends — walked in. Effect's changelogs were the five largest entries in the file,
 *     7.1MB of a third party's documentation in our package.
 *
 * Neither is visible by reading the diff of a release: nobody reviews a 7MB JSON blob. So
 * the check is mechanical, and it is two-directional — content must match HEAD, and
 * nothing may come from a directory we do not publish.
 */
describe('demo/docs.json is fresh and contains only our documentation', () => {
  const docs = JSON.parse(
    readFileSync(join(ROOT, 'demo', 'docs.json'), 'utf8')
  ) as Array<{ path: string; filename: string; text?: string }>

  it('was generated at all', () => {
    // Apparatus. Every assertion below is vacuous over an empty array, and an empty
    // generation is exactly the failure mode the builder's own guard exists to stop.
    expect(docs.length).toBeGreaterThan(50)
  })

  it('carries no document from a scratch or unpublished directory', () => {
    const foreign = docs
      .map((d) => d.path.replace(/^\.\//, ''))
      .filter((p) => p.split('/').some((seg) => seg.startsWith('.')))
    expect(
      foreign,
      'a dotted directory is tooling or scratch — it must never reach the shipped docs'
    ).toEqual([])
  })

  it('every markdown document matches the file on disk', () => {
    // Only `.md` entries carry the whole file; a `.ts`/`.js` entry holds just its
    // extracted `/*# … */` blocks, so comparing those to the file would be wrong.
    const stale: string[] = []
    for (const doc of docs) {
      if (!doc.text || !doc.path.endsWith('.md')) continue
      const abs = join(ROOT, doc.path.replace(/^\.\//, ''))
      if (!existsSync(abs)) {
        stale.push(`${doc.path} (indexed but missing on disk)`)
        continue
      }
      if (readFileSync(abs, 'utf8') !== doc.text) stale.push(doc.path)
    }
    expect(
      stale,
      'run `bun run docs` and commit demo/docs.json — the playground and the npm ' +
        'package serve THIS file, not the repository'
    ).toEqual([])
  })
})
