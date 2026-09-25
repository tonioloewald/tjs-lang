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
import config from '../tjs-site.config'

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
})
