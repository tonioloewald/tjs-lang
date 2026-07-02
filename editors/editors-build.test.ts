/**
 * Anti-drift guard for the published `tjs-lang/editors/*` entry points.
 *
 * The `editors/{codemirror,monaco,ace}/*.js` files are what npm consumers import
 * (the `./editors/*` subpaths). They are BUILD ARTIFACTS bundled from the
 * adjacent `.ts` by `scripts/build-editors.ts` — but they're committed (so a
 * fresh `npm publish` ships them without a build). This test re-bundles each
 * entry in memory and asserts the committed `.js` is byte-identical, so editing
 * a `.ts` without running `bun run build:editors` fails CI instead of silently
 * shipping months-old code (the exact rot this whole build step fixes).
 *
 * If this fails: run `bun run build:editors` and commit the regenerated `.js`.
 */
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { editorTargets, bundleEditor, ROOT } from '../scripts/build-editors'

describe('editors/* published .js are in sync with their .ts sources', () => {
  for (const target of editorTargets) {
    it(`${target.name}: committed ${target.outfile} matches a fresh build`, () => {
      const committed = readFileSync(join(ROOT, target.outfile), 'utf8')
      const fresh = bundleEditor(target, { write: false })
      // Byte-equality — esbuild is pinned, so a diff means the .ts changed
      // without the .js being rebuilt (or a config drift between the two).
      expect(committed).toBe(fresh)
    })
  }
})
