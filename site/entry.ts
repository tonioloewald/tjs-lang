/**
 * The doc site's bundle entry (tjs.tosijs.net). It REPLACES tosijs-ui's own iife.js, so it
 * must register the doc system itself (tosijs-ui#145: omit these and every page renders
 * inert, with no error).
 *
 * It exists for one reason: to make ```ajs fences RUN, through tosijs-ui's dialect registry
 * (tosijs-ui#184, shipped in 1.16.1). tosijs-ui never depends on the VM; capabilities come
 * from this closure.
 */
import 'tosijs-ui/doc-browser'
import 'tosijs-ui/live-example'
import { registerDialect } from 'tosijs-ui/live-example'
import { transpile, tjs } from '../src/lang/core'
import { generateDocsMarkdown } from '../src/lang/docs'
import { installRuntime } from '../src/lang/runtime'
import { AgentVM } from '../src/vm/ast'
import { stripExports } from '../src/lang/strip-exports'

// The FULL runtime, as the old playground installed it. Emitted code prefers an installed
// `globalThis.__tjs` over its inline stub, and the stub has no flight recorder, so the
// error-history example's `__tjs.clearErrors()` was "not a function" on the site.
installRuntime()

// A long section title in the sidebar dropped onto its own line and left its ▶ alone on the
// row above, so the nav looked as if it had empty entries. tosijs-ui styles the summary link
// `inline-block`, and an inline-block wider than the rest of the line wraps WHOLE. `inline`
// lets the title wrap beside its arrow. Doubled class for specificity over tosijs-ui's own
// rule, whichever stylesheet loads last. Delete when tosijs-ui#219 item 3 ships.
if (typeof document !== 'undefined') {
  const navFix = document.createElement('style')
  navFix.textContent =
    '.doc-nav.doc-nav summary > .doc-link { display: inline; }'
  document.head.append(navFix)
}

// (The example context needs nothing here: since tosijs-ui 1.16.7 the doc system supplies
// `tosijs` itself, and no example imports `tosijs-ui`. This entry used to set both globals.)

// Replaces tosijs-ui's built-in `tjs` dialect for ONE reason left: stripping `export`, so
// examples written as modules run (as a function body they fail with "Unexpected token
// 'export'"). tosijs-ui will do this itself by feature-detecting `stripExports` on the
// same-origin tjs-lang bundle (tosijs-ui#210 item 5, Virta #3109); delete this then.
registerDialect('tjs', {
  label: 'TJS',
  editorMode: 'tjs',
  transform(source) {
    return {
      code: stripExports(tjs(source, { dialect: 'tjs', runTests: false }).code),
    }
  },
  docs(source) {
    return generateDocsMarkdown(
      source,
      tjs(source, { dialect: 'tjs', runTests: false }).types
    )
  },
})

// TypeScript examples use tosijs-ui's built-in `ts` dialect: since 1.16.8 it no longer passes
// `dialect: 'tjs'` after `fromTS`, which refused `new` in converted TypeScript.

/**
 * Domains the AJS examples fetch from, and nothing else. A doc page is public: an example a
 * reader edits must not be able to reach an arbitrary host from the reader's browser.
 */
const ALLOWED_FETCH_DOMAINS = [
  'api.github.com',
  'itunes.apple.com',
  'api.open-meteo.com',
]

const vm = new AgentVM()

const NEEDS_LLM =
  'This example needs an LLM, which the static site does not provide. ' +
  'Run it locally with tjs-lang and LM Studio (see the AJS guide).'

/** Fuel is fractional (expression nodes cost 0.01); two places reads as a measure, not noise. */
const roundFuel = (fuel: number) => Math.round(fuel * 100) / 100

registerDialect('ajs', {
  label: 'AJS',
  editorMode: 'ajs',
  async run(source, { options, signal, report }) {
    // A broken example is a failure (thrown); an AGENT that returns an error is a result.
    // AJS errors are values (AgentError, monadic) — `fuel-limits` exists to show one — so a
    // run that ends in an error is reported, not thrown.
    const { ast } = transpile(source, {
      maxSourceBytes: 64 * 1024,
      atoms: vm.atoms as any,
    })
    // An example that calls a model cannot finish here, and running it until it fails first on
    // something else (a vision example's relative image URL) reports a misleading error. Read
    // the AST, not the source: in serialized JSON a string literal cannot produce an
    // unescaped `"op":"llm`, so an example that merely MENTIONS an LLM call still runs.
    if (JSON.stringify(ast).includes('"op":"llm')) {
      report({ error: NEEDS_LLM })
      return undefined
    }
    const fuel = typeof options.fuel === 'number' ? options.fuel : 10_000
    const args =
      options.args && typeof options.args === 'object' ? options.args : {}
    const run = await vm.run(ast, args as Record<string, unknown>, {
      fuel,
      signal,
      context: { allowedFetchDomains: ALLOWED_FETCH_DOMAINS },
    })
    if (run.error) {
      const message = run.error.message ?? String(run.error)
      report({
        error: /Capability 'llm/.test(message)
          ? `${message} — ${NEEDS_LLM}`
          : message,
        fuelUsed: roundFuel(run.fuelUsed),
      })
      return undefined
    }
    report({ fuelUsed: roundFuel(run.fuelUsed) })
    return run.result
  },
})
