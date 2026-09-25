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
 * `docs/` is NOT here, deliberately, as of 2026-09-25. It used to be excluded because the
 * playground corpus never included it ("hand-written reference material rendered elsewhere").
 * The tosijs-ui doc site IS that elsewhere now: `docs/` holds the language's design writing —
 * type identity, runtime fusion, the north star — which belongs in "The TJS Language" section
 * and book. `docs/reviews/` stays out: `reviews` is still ignored by name, below.
 *
 * This exists as OUR walk rather than a config option because `SiteConfig` exposes no
 * `ignore`, even though `extractDocs` takes one (tosijs-ui#153). When that lands, this
 * collapses to `docPaths: ['.']` plus `ignore: IGNORE`.
 */
const IGNORE = new Set([
  'node_modules',
  'dist',
  'reviews',
  'third-party',
  '.git',
  '.archive',
  '.demo',
  '.site',
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
 * Markdown files, plus the specific SOURCE files whose `/*# … *\/` blocks are documentation.
 *
 * This used to pass all of `src`, and `extractDocs` duly published every file with a doc block —
 * including five TEST files (`transpiler.test.ts`, `parser.test.ts`, `docs.test.ts`,
 * `dts.test.ts`, `bootstrap.test.ts`) as pages. Named explicitly now, so publishing a source
 * file is a decision. `src/vm/runtime.ts` must stay: the old playground's AJS nav lists it by
 * filename (`demo/src/demo-nav.ts`). The two `.tjs` entries are picked up by `bin/site.ts`'s
 * own `.tjs` scan, which also reads this list.
 */
const SOURCE_DOCS = [
  'src/vm/runtime.ts',
  'src/store/index.ts',
  'src/store/interface.ts',
  'src/store/memory.ts',
  'src/store/indexeddb.ts',
  'src/rbac/index.ts',
  'src/rbac/rules.tjs',
  'src/linalg/index.tjs',
]

const DOC_FILES = [...markdownFiles(), ...SOURCE_DOCS]

export default defineSiteConfig({
  name: 'tjs-lang',
  description:
    'A typed JavaScript platform: types are examples that survive to runtime as contracts, documentation and tests.',
  baseUrl: 'https://tjs-platform.web.app',

  // `.site`: NOT their default of `docs` (hand-written documentation here — building there
  // would overwrite it) and NOT `.demo` (Firebase's `hosting.public`, still serving the old
  // playground).
  outputDir: '.site',
  // `static` until the GitHub Pages address is decided (a tosijs.net subdomain, or the
  // github.io default). The doc site goes to GitHub Pages; the OLD playground stays on Firebase
  // (`tjs-platform.web.app`, `.demo/`) until the new site fully supersedes it — decided
  // 2026-09-25. `github-pages` writes a CNAME derived from `baseUrl`, which is still the
  // Firebase address, so switching the host before `baseUrl` would claim the wrong domain.
  host: 'static',

  // Section pages live here: overview docs the sections hang from, whose `<!-- toc -->` blocks
  // the build regenerates. Their default, `src/docs`, is a strange home for doc pages.
  sectionsDir: 'guides/sections',

  // The site's OWN intermediate corpus. The default is `demo/docs.json` — the OLD playground's
  // data file, which `bin/site.ts` writes in the playground's shape — and a site build
  // overwrote it in tosijs-ui's shape (their build warns: "writes outside outputDir and will
  // OVERWRITE demo/docs.json"). Run in the main tree, that is the live playground's source.
  docsJson: '.site-docs.json',

  // OFF: this repo's `llms.txt` is hand-curated and guarded by `src/docs-index.test.ts` (it
  // must index every top-level doc and entry point). The generated one overwrote it the first
  // time the site was built.
  llmsTxt: false,

  // The four books (decided 2026-09-25). Membership is per doc — `book` in each file's metadata,
  // inherited down the `parent` chain; unset means the default book, the whole site.
  // Reading order for the BOOKS, without touching the site nav (tosijs-ui applies one manifest
  // to every volume; a name absent from a volume is ignored). The site nav puts the practical
  // TJS section first; a book reads better starting from why the language exists, so The TJS
  // Language leads — and `why-tjs` leads within it, by its own `order`.
  book: { order: ['README', 'the-tjs-language'] },

  epub: {
    title: 'tjs-lang',
    author: 'Tonio Loewald',
    volumeTitles: {
      language: 'The TJS Programming Language',
      ts: 'TypeScript: The Good, the Bad, and the Ugly',
      ajs: 'AJS and Safe Eval',
    },
  },

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
