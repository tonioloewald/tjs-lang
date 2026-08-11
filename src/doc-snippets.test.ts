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
})
