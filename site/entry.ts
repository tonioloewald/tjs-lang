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
import * as tosijs from 'tosijs'
import * as tosijsUi from 'tosijs-ui'
import { transpile, tjs } from '../src/lang/core'
import { generateDocsMarkdown } from '../src/lang/docs'
import { installRuntime } from '../src/lang/runtime'
import { AgentVM } from '../src/vm/ast'
import { stripExports } from './strip-exports'

// The FULL runtime, as the old playground installed it. Emitted code prefers an installed
// `globalThis.__tjs` over its inline stub, and the stub has no flight recorder, so the
// error-history example's `__tjs.clearErrors()` was "not a function" on the site.
installRuntime()

// The modules examples `import` (`tosijs`, `tosijs-ui`). The doc system reads them from these
// globals, which tosijs-ui's OWN iife.js sets; this bundle replaces that iife, so without this
// every `import { … } from 'tosijs'` in an example resolved to undefined (tosijs-todo: "Cannot
// destructure property 'elements' of 'tosijs'").
Object.assign(globalThis, { xinjs: tosijs, xinjsui: tosijsUi })

// THIS commit's TJS, replacing tosijs-ui's built-in `tjs` dialect (which loads the
// same-origin bundle, else a CDN's pinned tjs-lang). Two things the built-in does not do:
// strip `export` (examples written as modules ran as a function body and failed with
// "Unexpected token 'export'"), and it is the transpiler the docs describe, always.
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

// TypeScript examples: `fromTS` → TJS → JS. tosijs-ui's built-in `ts` passes `dialect: 'tjs'`
// to the second step, which OVERRIDES the `/* tjs <- … */` annotation that gives converted
// TypeScript JavaScript's semantics, so `new Calculator(…)` in a TS example was refused as
// TJS. Here the annotation decides. `fromTS` comes from the same-origin bundle this build
// ships (it lazy-loads the TypeScript compiler); the specifier is a variable so the bundler
// leaves the import to runtime.
const FROM_TS_URL = '/tjs/tjs-browser-from-ts.js'
let fromTsModule: Promise<any> | undefined
registerDialect('ts', {
  label: 'TS',
  async transform(source) {
    const { fromTS } = await (fromTsModule ??= import(FROM_TS_URL))
    const converted = (await fromTS(source, { emitTJS: true })).code
    return { code: stripExports(tjs(converted, { runTests: false }).code) }
  },
})

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
    const { ast } = transpile(source, {
      maxSourceBytes: 64 * 1024,
      atoms: vm.atoms as any,
    })
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
