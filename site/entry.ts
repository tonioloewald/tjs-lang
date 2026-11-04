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
// <tosi-lottie>: the home page's logo animation (by @anicoremotion, credited in the README).
// The root `tosijs-ui` import does not register it, and this bundle replaces tosijs-ui's own,
// so without this the page showed only the fallback image, with no error.
import 'tosijs-ui/bodymovin-player'
import { registerDialect } from 'tosijs-ui/live-example'
import { transpile } from '../src/lang/core'
import { installRuntime } from '../src/lang/runtime'
import { AgentVM } from '../src/vm/ast'

/**
 * Keep a <tosi-lottie>'s child image as its PLACEHOLDER until the animation has drawn.
 *
 * The element renders into a shadow root with no slot, so registering it hides the child
 * `<img>` at once and the logo area stays blank until lottie downloads from its CDN. The image
 * is shown as the element's background until the animation's SVG arrives. (The child `<img>`
 * stays in the markup for GitHub, where nothing registers the element. Filed upstream: the
 * element should slot its children until loaded; see UPSTREAM.md, board #3817.)
 */
function keepPlaceholder(el: Element): void {
  const host = el as HTMLElement
  const img = host.querySelector(':scope > img') as HTMLImageElement | null
  if (!img || host.dataset.placeholder) return
  host.dataset.placeholder = 'shown'
  host.style.background = `url("${img.src}") center / contain no-repeat`
  const clear = () => {
    host.style.background = ''
    host.dataset.placeholder = 'replaced'
  }
  let frames = 0
  const watch = () => {
    const root = host.shadowRoot
    if (root?.querySelector('svg')) return clear()
    if (root) {
      new MutationObserver((_, observer) => {
        if (!root.querySelector('svg')) return
        observer.disconnect()
        clear()
      }).observe(root, { childList: true, subtree: true })
      return
    }
    // Not upgraded yet (or a closed root): look again, but never forever.
    if (++frames < 600) requestAnimationFrame(watch)
    else clear()
  }
  watch()
}
const placeholders = () =>
  document.querySelectorAll('tosi-lottie').forEach(keepPlaceholder)
placeholders()
// The doc browser renders pages client-side, so a logo can arrive after load. Batched to a
// frame: live examples mutate the DOM constantly.
let scanQueued = false
new MutationObserver(() => {
  if (scanQueued) return
  scanQueued = true
  requestAnimationFrame(() => {
    scanQueued = false
    placeholders()
  })
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
})

// The FULL runtime, as the old playground installed it. Emitted code prefers an installed
// `globalThis.__tjs` over its inline stub, and the stub has no flight recorder, so the
// error-history example's `__tjs.clearErrors()` was "not a function" on the site.
installRuntime()

// (The example context needs nothing here: since tosijs-ui 1.16.7 the doc system supplies
// `tosijs` itself, and no example imports `tosijs-ui`. This entry used to set both globals.)

// No site `tjs` dialect any more: tosijs-ui 1.16.16 strips `export` with tjs-lang's own
// `stripExports`, evaluates console lines with `prelude`/`body`, and uses `testRunner`, all
// feature-detected on the same-origin copy of this repo's browser bundle (Virta #3119). Ours
// existed only for `export`, and by 1.16.11 it was undoing tosijs-ui's test semantics.

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
