import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { tjs } from '../src/lang'
import { transpile } from '../src/lang'

/**
 * `demo/docs.json` is a COMMITTED build artifact, and it has already shipped stale once:
 * it taught all nine abolished mode directives in the live playground for days after the
 * source markdown was rewritten. Nothing failed in the meantime, because nothing checked.
 *
 * Two different failures are possible and both have happened:
 *
 *   1. the artifact is stale relative to its sources (the 2026-08-02 case), and
 *   2. the artifact is FRESH but its sources are wrong — two AJS examples shipped
 *      truncated mid-expression because the fence parser was not fence-length aware, so
 *      `bun run docs` faithfully regenerated broken content.
 *
 * (2) is the harder one, because the freshness check passes. So this file checks the
 * property that actually matters to a user: **every example in the shipped bundle
 * compiles.** A truncated, stale or malformed example fails that regardless of which way
 * it got there.
 */
describe('every shipped playground example is usable', () => {
  const docs = JSON.parse(
    readFileSync(join(import.meta.dir, 'docs.json'), 'utf-8')
  )
  const entries: any[] = Array.isArray(docs) ? docs : Object.values(docs).flat()
  const examples = entries.filter((e: any) => e?.type === 'example' && e?.code)

  it('finds examples at all (guards a vacuous pass)', () => {
    expect(examples.length).toBeGreaterThan(20)
  })

  // Deliberately NOT filtered to section === 'tjs'. `demo/src/examples.test.ts` does that,
  // which is exactly why the two broken examples were both on the AJS side.
  for (const ex of examples) {
    const label = `${ex.section ?? '?'}/${ex.title ?? ex.slug}`
    it(`${label} compiles`, () => {
      // A truncated example fails with "Unterminated regular expression" — the symptom
      // both shipped ones had, in the live playground and in the npm package.
      if (ex.section === 'ajs') {
        expect(() => transpile(ex.code, { vmTarget: true })).not.toThrow()
      } else {
        expect(() => tjs(ex.code, { runTests: false })).not.toThrow()
      }
    })
  }
})
