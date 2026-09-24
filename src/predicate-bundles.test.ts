/**
 * `Predicate` is ONE class across the PUBLISHED bundles — checked against `dist/`, in real Node.
 *
 * ## Why this file exists, and why it is not a source-level test
 *
 * The 0.14.0 review's B2: `Predicate` was not exported from any entry point, so the CHANGELOG's
 * own `Age instanceof Predicate` example could not be written by a consumer. The guard that
 * should have caught it (`src/lang/predicate-callable.test.ts`) imports `Predicate` from
 * `'../types/Type'` — the internal path — and so could see the brand precisely because it
 * bypassed the published surface.
 *
 * The entangled half made a source test insufficient. Every bundle carries its own copy of
 * `predicate-brand.ts`, so before the fix six bundles declared six `Predicate` classes and
 * `css.isColor instanceof main.Predicate` would have been FALSE for any consumer importing
 * the brand from one bundle and the predicate from another. The fix is a shape-versioned global
 * slot (`docs/runtime-fusion.md`, *code fuses, data unions*). Its correctness is a property of
 * the BUILT artifacts — whether esbuild inlined each copy so that every one claims the slot — so
 * it can only be checked against them. In the source tree there is one module and the question
 * never arises.
 *
 * The export and the slot shipped in the B2 commit; this test did not, which is how the review
 * report still carried B2 with no resolution afterward. Adding it is what closes B2.
 *
 * ## Real `node`, both load orders
 *
 * Bun resolves the `bun` export condition to SOURCE, so an in-process import here would test
 * the source tree again. Each case spawns `node` against `dist/` directly. Load order matters
 * because the slot is first-writer-wins: which bundle defines the class depends on import
 * order, so both orders are asserted, not one.
 */
import { describe, it, expect } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const DIST = join(import.meta.dir, '..', 'dist')
const built =
  existsSync(join(DIST, 'index.js')) && existsSync(join(DIST, 'tjs-css.js'))
const hasNode = spawnSync('node', ['--version']).status === 0

/** Run an ES-module snippet in a fresh `node`, returning its JSON result. */
function inNode(body: string): any {
  const src = `const D = ${JSON.stringify(DIST + '/')};\n${body}`
  const r = spawnSync('node', ['--input-type=module', '-e', src], {
    encoding: 'utf8',
  })
  if (r.status !== 0) throw new Error(r.stderr || `node exited ${r.status}`)
  return JSON.parse(r.stdout.trim().split('\n').pop()!)
}

describe('Predicate across the published bundles', () => {
  it('CI built dist/ before running this', () => {
    // Same reasoning as bundle-size.test.ts: a guard that skips reports the same green as
    // one that passes, so in CI a missing dist/ is a failure, by name.
    if (!process.env.CI) return
    expect(built ? 'built' : 'dist/ missing in CI').toBe('built')
  })

  for (const order of [
    ['index.js', 'tjs-css.js'],
    ['tjs-css.js', 'index.js'],
  ]) {
    it.skipIf(!built || !hasNode)(
      `one class, loading ${order[0]} first`,
      () => {
        const r = inNode(`
          const a = await import(D + ${JSON.stringify(order[0])})
          const b = await import(D + ${JSON.stringify(order[1])})
          const main = ${JSON.stringify(order[0])} === 'index.js' ? a : b
          const css = main === a ? b : a
          console.log(JSON.stringify({
            mainExports: typeof main.Predicate,
            cssExports: typeof css.Predicate,
            same: main.Predicate === css.Predicate,
            isColorViaMain: css.isColor instanceof main.Predicate,
            typeViaCss: main.Type('Age', 0) instanceof css.Predicate,
          }))
        `)
        expect(r).toEqual({
          mainExports: 'function',
          cssExports: 'function',
          same: true,
          isColorViaMain: true,
          typeViaCss: true,
        })
      }
    )
  }

  it.skipIf(!built || !hasNode)(
    'a predicate compiled by the LANG bundle carries the same brand',
    () => {
      // `tjs-lang.js` does not export `Predicate`, but it BRANDS — `compilePredicate` calls
      // `brandPredicate` from its own inlined copy. Unexported is not the same as unaffected:
      // if that copy did not claim the slot, its predicates would fail `instanceof` against
      // the class every consumer can actually import.
      const r = inNode(`
        const main = await import(D + 'index.js')
        const lang = await import(D + 'tjs-lang.js')
        const c = lang.compilePredicate('function isRed(v) { return v === "red" }', ['isRed'])
        console.log(JSON.stringify({
          branded: c.isRed instanceof main.Predicate,
          decides: [c.isRed('red'), c.isRed('blue')],
        }))
      `)
      expect(r).toEqual({ branded: true, decides: [true, false] })
    }
  )
})
