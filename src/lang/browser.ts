/**
 * Self-contained browser entry — the TJS/AJS transpiler with `acorn` and
 * `tosijs-schema` bundled in (no external/bare imports). Build target
 * `tjs-browser` (see `scripts/build.ts`) emits a single ESM file you can
 * `import()` from any CDN with zero import-map / config:
 *
 *   const { tjs } = await import('https://cdn.jsdelivr.net/npm/tjs-lang/dist/tjs-browser.js')
 *   const { code } = tjs("function greet(name: 'x'): '' { return 'hi' }")
 *
 * For TypeScript→TJS in the browser, use `tjs-lang/browser/from-ts` (which
 * lazy-loads the TypeScript compiler from a CDN on demand).
 */
export * from './transpiler'
