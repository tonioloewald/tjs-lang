/**
 * Site configuration for `tosijs-ui/site` (Phase B1).
 *
 * Replaces the bespoke `bin/dev.ts` / `bin/docs.js` / `scripts/build-demo.ts` trio. Library
 * bundling stays ours (`scripts/build.ts`) — that is B4, decided: the published bundles are a
 * different artifact from the doc site and `tosijs` splits them the same way.
 */
import { readdirSync } from 'node:fs'
import { defineSiteConfig } from 'tosijs-ui/site'

/**
 * `docs/` MINUS `docs/reviews/`, enumerated rather than globbed.
 *
 * Listing `'docs'` wholesale publishes the pre-release review reports as public pages — 13 of
 * them, including ones whose verdict is BLOCK and which name an adopter. `package.json`'s
 * `files` already excludes them from the npm tarball (`!docs/reviews`); the site had no
 * equivalent, and `SiteConfig` exposes no `ignore` even though `extractDocs` itself takes one
 * (asked upstream).
 *
 * Enumerated with a reason attached so nobody "simplifies" this back to `'docs'`: the failure
 * is silent, and the thing it leaks is exactly what you would least want indexed.
 */
const DOC_FILES = readdirSync('docs')
  .filter((f) => f.endsWith('.md'))
  .map((f) => `docs/${f}`)

export default defineSiteConfig({
  name: 'tjs-lang',
  description:
    'A typed JavaScript platform: types are examples that survive to runtime as contracts, documentation and tests.',
  baseUrl: 'https://tjs-platform.web.app',

  // `.demo`, NOT their default of `docs`.
  //
  // `firebase.json` serves `hosting.public: ".demo"`, and `docs/` in this repo is real
  // hand-written documentation rather than build output — pointing the site there would
  // overwrite it. Nothing upstream compares `outputDir` against an existing `firebase.json`
  // (tosijs-ui#134), so this is the manual check that issue is about.
  outputDir: '.demo',
  host: 'firebase',

  // The markdown corpus. Mirrors what `bin/docs.js` walks today.
  docPaths: [
    'README.md',
    'guides',
    ...DOC_FILES,
    'CLAUDE-TJS-SYNTAX.md',
    'DOCS-TJS.md',
    'DOCS-AJS.md',
    'DOCS-WASM.md',
    'TJS-FOR-JS.md',
    'TJS-FOR-TS.md',
    'PRINCIPLES.md',
    'CHANGELOG.md',
  ],

  // OFF for now, and this is a decision to revisit rather than a shrug.
  //
  // It requires every `js`/`ts`/`tjs` fence to be EXECUTABLE — wrapped in `new
  // AsyncFunction` — and 51 of our blocks are deliberately illustrative: elisions (`…`),
  // module-level `export`, and TJS syntax in `js`-tagged fences. Fourteen of them are in
  // `docs/tjs-vs-typescript.md`, which is GENERATED and whose every row is already executed
  // against `tsc --strict` AND TJS by `src/lang/differences.test.ts` — so the checker reports
  // the most rigorously verified file we have as broken.
  //
  // We are not going without coverage: `src/doc-snippets.test.ts` checks documented snippets
  // transpile, and `differences.test.ts` executes the comparison table. Turning this on would
  // still be an upgrade (it EXECUTES rather than transpiles), and the work is retagging the
  // illustrative blocks — tracked in TODO.md, not abandoned.
  checkExamples: false,
})
