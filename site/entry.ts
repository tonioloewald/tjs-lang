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
import { transpile } from '../src/lang/core'
import { AgentVM } from '../src/vm/ast'

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

/** Fuel is fractional (expression nodes cost 0.01); two places reads as a measure, not noise. */
const roundFuel = (fuel: number) => Math.round(fuel * 100) / 100

registerDialect('ajs', {
  label: 'AJS',
  editorMode: 'ajs',
  async run(source, { options, signal, report }) {
    // A broken example is a failure (thrown); an AGENT that returns an error is a result.
    // AJS errors are values (AgentError, monadic) — `fuel-limits` exists to show one — so a
    // run that ends in an error is reported, not thrown.
    const { ast } = transpile(source, { maxSourceBytes: 64 * 1024 })
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
          ? `${message} — this example needs an LLM, which the static site does not provide. ` +
            `Run it locally with tjs-lang and LM Studio (see the AJS guide).`
          : message,
        fuelUsed: roundFuel(run.fuelUsed),
      })
      return undefined
    }
    report({ fuelUsed: roundFuel(run.fuelUsed) })
    return run.result
  },
})
