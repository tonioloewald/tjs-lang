/**
 * The doc-site structure holds: unique identities, resolvable parents, four non-empty books.
 *
 * The tosijs-ui doc system (tjs-site.config.ts) identifies a page by its BARE FILENAME — slugs,
 * the nav tree and `parent` lookup are all keyed on it. That has two silent failure modes, and
 * both are why this file exists:
 *
 *   - **Two visible docs with the same basename** collide in the nav tree: one is shown twice
 *     and the other not at all, with no warning (measured 2026-09-25 against tosijs-ui 1.15:
 *     two `error-handling.md` examples rendered as "AJS errors" twice). The corpus had five
 *     such collisions when the site was organised.
 *   - **A `parent` that does not resolve** is not an error: the build auto-creates an empty
 *     stub section page for it, so a typo quietly grows the nav a new, empty section.
 *
 * Plus the books: `epub.volumeTitles` names four volumes, and a volume with no chapters is a
 * build failure at ePub time — far from the metadata edit that caused it.
 */
import { describe, it, expect } from 'bun:test'
import { extractDocs } from 'tosijs-ui/site'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import config, { SOURCE_PAGES } from '../tjs-site.config'

const all: any[] =
  (extractDocs({ paths: (config as any).docPaths } as any) as any[]) ?? []
const visible = all.filter((d) => !d.hidden)

describe('doc-site structure', () => {
  it('apparatus check: the corpus is really there', () => {
    // Every assertion below passes vacuously on an empty corpus.
    expect(visible.length).toBeGreaterThan(80)
  })

  it('every visible doc has a UNIQUE basename — the nav loses duplicates silently', () => {
    const seen = new Map<string, string[]>()
    for (const d of visible)
      seen.set(d.filename, [...(seen.get(d.filename) ?? []), d.path])
    const dups = [...seen].filter(([, paths]) => paths.length > 1)
    expect(dups.map(([name, paths]) => `${name}: ${paths.join(', ')}`)).toEqual(
      []
    )
  })

  it('every `parent` names a visible doc — an unresolved one becomes an empty stub page', () => {
    const names = new Set(visible.map((d) => d.filename))
    const orphans = visible
      .filter((d) => d.parent && !names.has(d.parent))
      .map((d) => `${d.path} -> ${d.parent}`)
    expect(orphans).toEqual([])
  })

  it('each of the four books has chapters', () => {
    const byName = new Map(visible.map((d) => [d.filename, d]))
    // `book` is inherited down the parent chain, nearest declaration winning.
    const bookOf = (d: any): string[] => {
      for (
        let cur = d, hops = 0;
        cur && hops < 20;
        cur = byName.get(cur.parent), hops++
      )
        if (cur.book) return [cur.book].flat()
      return ['default']
    }
    const counts: Record<string, number> = {}
    for (const d of visible)
      for (const b of bookOf(d)) counts[b] = (counts[b] ?? 0) + 1
    const volumes = Object.keys((config as any).epub?.volumeTitles ?? {})
    expect(volumes.sort()).toEqual(['ajs', 'language', 'ts'])
    for (const v of ['default', ...volumes])
      expect({ [v]: (counts[v] ?? 0) > 1 }).toEqual({ [v]: true })
  })

  it('working notes and agent instructions are not published', () => {
    const leaked = visible
      .map((d) => d.path)
      .filter((p: string) =>
        /^(AGENTS|CLAUDE|TODO|TODO-ARCHIVE|UPSTREAM)\.md$|^experiments\/|\.test\.ts$/.test(
          p
        )
      )
    expect(leaked).toEqual([])
  })

  // The docs review's B-1. `extractDocs` scans DIRECTORIES for `/*# */` blocks and silently
  // ignores a path that names a single .ts file, so narrowing `src` to a list of files dropped
  // runtime.ts and the store docs from BOTH corpora — and the live playground's AJS Docs nav
  // (which finds runtime.ts BY NAME) went empty. Every test here stayed green, because each
  // built its corpus with the same `extractDocs` call that was dropping them.
  it('every listed SOURCE doc actually yields a page', () => {
    const paths = new Set(all.map((d) => d.path))
    const siteMissing = SOURCE_PAGES.filter((p: string) => !paths.has(p))
    expect(siteMissing).toEqual([])
  })

  // A generated page's placement must come from its GENERATOR. Both of these once carried a
  // hand-added metadata header that the next regeneration would silently erase, dropping the
  // page back to the nav's root (docs review, 0.14.0).
  it('generated docs get their placement metadata from the generator', () => {
    const root = join(import.meta.dir, '..')
    const firstLine = (f: string) =>
      readFileSync(join(root, f), 'utf8').split('\n')[0]
    const generators: [string, string][] = [
      ['benchmarks.md', 'bin/benchmarks.ts'],
      ['docs/tjs-vs-typescript.md', 'scripts/build-differences.ts'],
    ]
    const handAdded = generators
      .filter(([doc]) => firstLine(doc).startsWith('<!--{'))
      .filter(
        ([doc, gen]) =>
          !readFileSync(join(root, gen), 'utf8').includes(firstLine(doc))
      )
      .map(([doc, gen]) => `${doc} header is not emitted by ${gen}`)
    expect(handAdded).toEqual([])
    // Apparatus: both generated pages DO carry placement, so the filter above is not vacuous.
    expect(
      generators.every(([doc]) => firstLine(doc).startsWith('<!--{'))
    ).toBe(true)
  })

  it('the OLD playground still finds every doc it looks up by name', () => {
    // demo/src/demo-nav.ts selects these by filename, not by section.
    const playground = JSON.parse(
      readFileSync(join(import.meta.dir, '..', 'demo', 'docs.json'), 'utf8')
    )
    const names = new Set(
      (Array.isArray(playground)
        ? playground
        : Object.values(playground).flat()
      ).map((d: any) => d.filename)
    )
    const missing = ['runtime.ts', 'CONTEXT.md', 'PLAN.md'].filter(
      (n) => !names.has(n)
    )
    expect(missing).toEqual([])
  })
})
