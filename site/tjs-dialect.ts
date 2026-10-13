/**
 * The doc site's `tjs` live-example dialect (registered by `site/entry.ts`).
 *
 * It replaces tosijs-ui's built-in `tjs` dialect for ONE reason left: stripping `export`, so
 * examples written as modules run (as a function body they fail with "Unexpected token
 * 'export'"). tosijs-ui will do this itself by feature-detecting `stripExports` on the
 * same-origin tjs-lang bundle (tosijs-ui#210 item 5, Virta #3109); delete this then.
 *
 * It must return `testRunner` as well as `code`. tosijs-ui runs an example's inline tests
 * with the runner the transform returns, built from the test bodies AFTER tjs-lang gave them
 * TJS semantics; without one it falls back to the RAW bodies, so `'42' == 42` in a test was
 * JavaScript's `true`. Returning only `code` silently undid tosijs-ui's #210 item 1 fix on
 * this site, and it surfaced only once 1.16.11 began running inline-view tests in the page.
 */
import { tjs } from '../src/lang/core'
import { generateDocsMarkdown } from '../src/lang/docs'
import { stripExports } from '../src/lang/strip-exports'

export const tjsDialect = {
  label: 'TJS',
  editorMode: 'tjs',
  transform(source: string): { code: string; testRunner?: string } {
    const r = tjs(source, { dialect: 'tjs', runTests: false })
    return { code: stripExports(r.code), testRunner: r.testRunner }
  },
  docs(source: string): string {
    return generateDocsMarkdown(
      source,
      tjs(source, { dialect: 'tjs', runTests: false }).types
    )
  },
}
