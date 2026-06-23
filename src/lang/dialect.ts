/**
 * Dialect resolution for file-based tooling.
 *
 * The subset invariant (see PRINCIPLES.md) says plain JavaScript must transpile
 * through TJS without changing meaning, while native `.tjs` gets the full
 * footgun-removal feature set. The unit of opt-in is the *dialect* — and for a
 * file, the dialect is its extension. This is the one canonical mapping that
 * CLIs, bundler plugins, module loaders, and doc systems should all share so
 * `.js` is never silently "improved" into different semantics.
 */

/** Source dialect understood by `tjs(src, { dialect })`. */
export type Dialect = 'js' | 'tjs'

/** How a file should be transpiled, based on its extension. */
export type SourceKind = 'js' | 'ts' | 'tjs'

const JS_EXT = /\.[mc]?js$/i // .js .mjs .cjs
const TS_EXT = /\.[mc]?ts$/i // .ts .mts .cts  (excludes .d.ts — handled below)
const TJS_EXT = /\.tjs$/i

/**
 * Classify a file by extension into the source kind that determines its
 * transpile path:
 *  - `'tjs'` → native TJS: `tjs(src)` (all modes ON — the better language)
 *  - `'js'`  → plain JS:   `tjs(src, { dialect: 'js' })` (semantics preserved)
 *  - `'ts'`  → TypeScript: route through `fromTS` (TS → TJS → JS)
 *
 * Unknown extensions default to `'tjs'` (the native language). `.d.ts` is
 * treated as TypeScript.
 */
export function sourceKindForFilename(filename: string): SourceKind {
  if (TJS_EXT.test(filename)) return 'tjs'
  if (JS_EXT.test(filename)) return 'js'
  if (TS_EXT.test(filename)) return 'ts'
  return 'tjs'
}

/**
 * Map a filename to the `dialect` option for `tjs()`. `.js`/`.mjs`/`.cjs` ⇒
 * `'js'` (plain JavaScript, semantics preserved); everything else ⇒ `'tjs'`
 * (native TJS).
 *
 * NOTE: TypeScript files are NOT a `tjs()` dialect — transpile them with
 * `fromTS` first. Use {@link sourceKindForFilename} when you need to tell
 * `.ts` apart from `.js`/`.tjs`.
 */
export function dialectForFilename(filename: string): Dialect {
  return sourceKindForFilename(filename) === 'js' ? 'js' : 'tjs'
}
