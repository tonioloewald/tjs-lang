import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defineSiteConfig } from 'tosijs-ui/site'

/**
 * Directories the doc corpus must never sweep in.
 *
 * Carried over verbatim from `bin/docs.js`, comment and all, because the list is load-bearing
 * and one entry records an incident: review reports name adopters, carry "Verdict: BLOCK" and
 * describe vulnerabilities with reproduction steps, and two of them were once committed into
 * `demo/docs.json` — and thence into the PUBLISHED playground bundle. The live site never
 * served them only because no hosting deploy happened in between.
 *
 * `docs` is here for a second reason worth stating: the playground corpus has never included
 * it. `docs/` is hand-written reference material rendered elsewhere, not playground examples.
 *
 * This exists as OUR walk rather than a config option because `SiteConfig` exposes no
 * `ignore`, even though `extractDocs` takes one (tosijs-ui#153). When that lands, this
 * collapses to `docPaths: ['.']` plus `ignore: IGNORE`.
 */
const IGNORE = new Set([
  'node_modules',
  'dist',
  'docs',
  'reviews',
  'third-party',
  '.git',
  '.archive',
  '.demo',
  '.b1-scratch',
  'editors',
  'demo',
  'bin',
  'functions',
])

/** Every markdown file the corpus should contain, walked the way `bin/docs.js` walks it. */
function markdownFiles(dir = '.', out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name) || name.startsWith('.')) continue
    const full = dir === '.' ? name : join(dir, name)
    if (statSync(full).isDirectory()) markdownFiles(full, out)
    else if (name.endsWith('.md')) out.push(full)
  }
  return out
}

/**
 * Markdown files, plus `src` so inline `/*# … *\/` doc-comment blocks are picked up.
 *
 * `bin/docs.js` walked source files for those too — eleven of them are in the corpus today
 * (`src/vm/runtime.ts`, the store implementations, several test files). Passing the directory
 * lets `extractDocs` do its own scan rather than us re-implementing the comment parser.
 */
const DOC_FILES = [...markdownFiles(), 'src']

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
  docPaths: DOC_FILES,

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
