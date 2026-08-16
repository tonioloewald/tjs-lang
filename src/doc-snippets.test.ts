/**
 * Every code snippet in the language docs is COMPILED.
 *
 * `CLAUDE-TJS-SYNTAX.md` is the document a reader reaches for first, and nothing checked
 * it. That is how it came to teach `const p2 = new Point(10, 20) // Still works, but
 * linter warns` (a compile error) and a WASM assignment form
 * (`const add = wasm (a: i32…) { local.get $a … }`) that was never implemented — two
 * confident, wrong claims in the reference, surviving a suite of 3400 tests because none
 * of them read prose.
 *
 * `examples/` is executed by `src/examples.test.ts` and the comparison table by
 * `src/lang/differences.test.ts`. This closes the third and largest gap.
 *
 * ## Snippets that are not programs
 *
 * A reference contains fragments (`items.map(x => …)`), listings of alternatives that
 * would collide if concatenated (`safety none` / `safety inputs` / `safety all`), and
 * deliberate errors. Those are legitimate, so they are ANNOTATED rather than guessed at:
 *
 *     <!-- tjs-doc: fragment -->      not a whole program; not compiled
 *     <!-- tjs-doc: expect-error -->  MUST fail to compile
 *
 * `expect-error` is the important one, and the reason this is not merely a linter: a
 * snippet that demonstrates a rejection is itself a claim, and it goes stale in the
 * opposite direction. When `new` became an error, the doc still said "still works"; had
 * the doc been right and the compiler changed back, an unchecked `expect-error` would
 * quietly start passing. Both directions are asserted.
 *
 * An UNMARKED snippet that does not compile is a failure, so the default is "this is real
 * code" and every exemption is visible in the source.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { tjs } from './lang'

const REPO = resolve(import.meta.dir, '..')

/**
 * Docs whose fenced TJS/TS blocks are contracts, not illustrations of other tools.
 *
 * `TJS-FOR-TS.md` carries many side-by-side blocks where the TypeScript half is not valid
 * TJS by design; those are `fragment`. That is a weaker guarantee than the reference gets,
 * and the honest way to strengthen it is to make more of those snippets whole programs —
 * a doc-editing job, not a harness one.
 */
const DOCS = [
  'CLAUDE-TJS-SYNTAX.md',
  'DOCS-TJS.md',
  'DOCS-WASM.md',
  'TJS-FOR-TS.md',
  'TJS-FOR-JS.md',
  'README.md',
  'CONTEXT.md',
  'guides/footguns.md',
  'guides/patterns.md',
  'docs/dictionary-defaults.md',
  // Added after 0.13.0's review. Neither was checked, and it showed: `guides/tjs.md`
  // taught an `unsafe {}` block in prose AND in two reference tables, and
  // `guides/benchmarks.md` went further — inventing semantics for it ("wraps code in
  // try-catch") and quoting a measured overhead ("~1.3x") for a form that does not parse.
  // A performance guide citing a benchmark of a nonexistent feature is the strongest
  // possible argument for compiling the prose.
  'guides/tjs.md',
  'guides/benchmarks.md',
]

interface Snippet {
  doc: string
  line: number
  code: string
  mode: 'compile' | 'expect-error' | 'fragment'
}

/**
 * Fenced blocks, with the directive from the comment immediately preceding the fence.
 *
 * Only `typescript`/`tjs`/`js` fences are collected — a `json` or `bash` block is not a
 * claim about the language.
 */
function snippets(doc: string): Snippet[] {
  const text = readFileSync(resolve(REPO, doc), 'utf8')
  const out: Snippet[] = []
  const re =
    /(?:<!--\s*tjs-doc:\s*(fragment|expect-error)\s*-->\s*\n)?```(typescript|tjs|js|javascript)\n([\s\S]*?)```/g
  for (const m of text.matchAll(re)) {
    out.push({
      doc,
      line: text.slice(0, m.index).split('\n').length,
      code: m[3],
      mode: (m[1] as Snippet['mode']) ?? 'compile',
    })
  }
  return out
}

const ALL = DOCS.flatMap(snippets)

describe('documentation snippets are real code', () => {
  it('found snippets to check', () => {
    // A regex that matched nothing would make every assertion below vacuously green —
    // the apparatus-fails-closed hazard, which this repo has already been bitten by once
    // (the self-hosting baseline was inflated fourfold by a broken harness).
    expect(ALL.length).toBeGreaterThan(20)
    expect(ALL.some((s) => s.mode === 'compile')).toBe(true)
  })

  for (const s of ALL) {
    if (s.mode === 'fragment') continue

    it(`${s.doc}:${s.line} ${
      s.mode === 'expect-error' ? 'must NOT compile' : 'compiles'
    }`, () => {
      let error: string | null = null
      try {
        tjs(s.code, { filename: `${s.doc}:${s.line}`, runTests: false })
      } catch (e: any) {
        error = String(e.message).split('\n')[0]
      }

      if (s.mode === 'expect-error') {
        // The other direction. A snippet demonstrating a rejection is a claim too, and it
        // rots the opposite way — silently starting to compile.
        expect(
          error
            ? 'rejected'
            : `compiles, but is marked expect-error:\n${s.code
                .trim()
                .slice(0, 200)}`
        ).toBe('rejected')
      } else {
        expect(
          error
            ? `${error}\n--- snippet ---\n${s.code.trim().slice(0, 300)}`
            : 'ok'
        ).toBe('ok')
      }
    })
  }

  it('fragments are annotated, never silently skipped', () => {
    // Every exemption is visible in the markdown source. A skip nobody can see is how a
    // "checked" document ends up mostly unchecked.
    const fragments = ALL.filter((s) => s.mode === 'fragment')
    expect(fragments.length).toBeLessThan(ALL.length / 2)
  })

  it('no single document is mostly fragments', () => {
    // PER DOCUMENT, not pooled. A global ratio is exactly the wrong instrument here: one
    // reference going 56% unchecked disappears into a corpus average near 25%, and the
    // reader of that one document has no idea they are looking at the unchecked half.
    // The previous review's B4 was precisely a per-document failure hidden this way.
    //
    // A document is only judged once it has enough snippets for a ratio to mean anything
    // — 2 of 3 fragments in a short guide is not evidence of anything.
    const MIN_SNIPPETS = 8
    const MAX_RATIO = 0.4

    /**
     * Documents allowed to exceed it, with the reason and the measured value.
     *
     * RATIOS MAY ONLY GO DOWN — the promote-check below demands the number be lowered
     * when it improves, so a fixed snippet cannot leave slack a regression can occupy.
     *
     * A single blanket threshold is the wrong instrument twice over: too low and a
     * comparison guide is permanently red for doing its job, too high and a reference
     * silently goes half-unchecked. Both entries below are fragment-heavy by nature, and
     * saying so HERE is the point — an allowance nobody can see is the same failure the
     * surrounding test exists to prevent.
     */
    const ALLOWED: Record<string, { ratio: number; why: string }> = {
      'TJS-FOR-TS.md': {
        ratio: 0.56,
        why: 'a side-by-side migration guide: most snippets are a TS excerpt beside its TJS counterpart, neither of which is a whole program',
      },
      'guides/footguns.md': {
        ratio: 0.5,
        why: 'each entry contrasts a JS expression with its TJS result; the JS half is deliberately not TJS-compilable',
      },
    }

    const byDoc = new Map<string, { total: number; frag: number }>()
    for (const s of ALL) {
      const e = byDoc.get(s.doc) ?? { total: 0, frag: 0 }
      e.total++
      if (s.mode === 'fragment') e.frag++
      byDoc.set(s.doc, e)
    }

    const measured = [...byDoc.entries()]
      .filter(([, e]) => e.total >= MIN_SNIPPETS)
      .map(([doc, e]) => ({ doc, ratio: e.frag / e.total, ...e }))

    const offenders = measured
      .filter(({ doc, ratio }) => ratio > (ALLOWED[doc]?.ratio ?? MAX_RATIO))
      .map(
        ({ doc, frag, total, ratio }) =>
          `${doc}: ${frag}/${total} fragments (${(ratio * 100).toFixed(0)}%)` +
          (ALLOWED[doc]
            ? ` — over its allowance of ${(ALLOWED[doc].ratio * 100).toFixed(
                0
              )}%`
            : '')
      )
    expect(offenders).toEqual([])

    // Promote-check: an allowance that is no longer needed must be lowered or deleted, or
    // the gap between what is allowed and what is true widens in silence.
    const improved = measured
      .filter(
        ({ doc, ratio }) => ALLOWED[doc] && ratio < ALLOWED[doc].ratio - 0.05
      )
      .map(
        ({ doc, ratio }) =>
          `${doc} improved to ${(ratio * 100).toFixed(
            0
          )}% — lower or remove its ALLOWED entry`
      )
    expect(improved).toEqual([])

    // An allowance for a document that no longer qualifies is dead weight.
    const stale = Object.keys(ALLOWED).filter(
      (d) => !measured.some((m) => m.doc === d)
    )
    expect(stale).toEqual([])
  })
})
