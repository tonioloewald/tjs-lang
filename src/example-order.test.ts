/**
 * Every playground example has a UNIQUE nav slot within its group.
 *
 * `order` decides where an example sits in the sidebar. When two examples in the same
 * `(section, group)` share one, the tie is broken by whatever order they happen to occupy in
 * `demo/docs.json` — which is derived from a directory walk. So a duplicate slot is not a
 * cosmetic tie: it is **nav order decided by the filesystem**, and the same defect as the
 * unsorted `.tjs` walk that made `docs.json` differ between APFS and ext4 (fixed 2026-09-12).
 * One was caught because a committed artifact changed; this one changes nothing and shows up
 * only as two entries swapping places in the sidebar between machines.
 *
 * Found with seven examples in `tjs/basics` contending for three slots (15, 16, 17), plus
 * pairs in `tjs/featured` and `tjs/patterns` — 3 of 12 groups. Resolved by cascading within
 * each group, preserving relative order rather than redesigning the sequence (the K&R
 * reordering is separate, tracked work).
 *
 * Asserting uniqueness, NOT contiguity: gaps are deliberate and harmless — `tjs/basics` runs
 * 1-4 then 15-22 — and demanding 0..n-1 would fail every time someone inserts an example
 * without renumbering the rest, which is exactly the friction that produced the collisions.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const DOCS = join(ROOT, 'demo', 'docs.json')

interface Doc {
  type?: string
  section?: string
  group?: string
  order?: number
  title?: string
  path?: string
}

describe('playground example nav slots', () => {
  const docs: Doc[] = existsSync(DOCS)
    ? JSON.parse(readFileSync(DOCS, 'utf8'))
    : []
  const examples = docs.filter((d) => d.type === 'example')

  it('the corpus is present and non-trivial — apparatus check', () => {
    // Every assertion below passes vacuously on an empty corpus, and `docs.json` is
    // generated, so "absent" is a real possibility rather than a hypothetical.
    expect(examples.length).toBeGreaterThan(20)
  })

  it('no two examples in a group share an order', () => {
    const groups = new Map<string, Map<number, string[]>>()
    for (const d of examples) {
      const key = `${d.section}/${d.group}`
      if (!groups.has(key)) groups.set(key, new Map())
      const slots = groups.get(key)!
      const order = d.order ?? -1
      if (!slots.has(order)) slots.set(order, [])
      slots.get(order)!.push(d.title ?? d.path ?? '(untitled)')
    }

    const collisions: string[] = []
    for (const [group, slots] of groups)
      for (const [order, titles] of slots)
        if (titles.length > 1)
          collisions.push(`${group} slot ${order}: ${titles.sort().join(', ')}`)

    expect(collisions.sort()).toEqual([])
  })

  it('every example actually yields code for the editor', () => {
    // The playground lifts `code` into a live editor (`element.setCode(example.code)`), so an
    // example with none is a blank editor with a title — and NOTHING reports it. Extraction
    // returning null is indistinguishable from an example that legitimately has no fence.
    //
    // Not hypothetical: `given-dispatch.md` was written with an unclosed ```tjs fence and
    // registered perfectly happily with `code: ''`. It even passed `tjs check`, because the
    // awk snippet the authoring guide recommends has no closing fence to find and runs to
    // EOF — which happened to be exactly the code. Two extractors disagreeing, with the
    // wrong one silent.
    const empty = examples
      .filter((d) => !((d as any).code ?? '').trim())
      .map((d) => d.path ?? d.title ?? '(unknown)')
      .sort()
    expect(empty).toEqual([])
  })

  it('every example declares an order at all', () => {
    // An absent `order` sorts as -1 above, so a missing one would collide with any other
    // missing one and be reported as a slot clash — a confusing way to learn it is absent.
    const missing = examples
      .filter((d) => typeof d.order !== 'number')
      .map((d) => d.path ?? d.title ?? '(unknown)')
      .sort()
    expect(missing).toEqual([])
  })
})
