<!--{"section":"tjs","type":"example","group":"unbundled","order":5}-->

# CDN Hints (overriding the default)

By default the playground resolves bare imports through JSDelivr's `/+esm`
bundles. When you need a specific CDN — to test an unreleased build, work
around a transform issue, or load a module straight from GitHub — prefix
the spec with a CDN hint.

```tjs
TjsCompat
/*#
## Per-import CDN hints

The first path segment of the import spec selects the CDN:

| Hint | Resolves to |
|------|-------------|
| `jsdelivr/<spec>` | JSDelivr `/+esm` (the default) |
| `esmsh/<spec>` | esm.sh (peer-dep dedup, e.g. React) |
| `unpkg/<spec>` | UNPKG with `?module` |
| `github/<user>/<repo>/<path>` | esm.sh's `/gh/` route |

No hint = default routing (JSDelivr, with esm.sh allowlist for React).

For full URLs (your own host, raw.githubusercontent.com, etc.) just
write the URL — it's left untouched.
*/

// Default routing: JSDelivr
import { tosi, elements } from 'tosijs'

// Force a specific CDN
import { html, render } from 'unpkg/lit'
import _ from 'jsdelivr/lodash-es'

// Pin a version
import { format } from 'jsdelivr/date-fns@3.0.0'

// Load straight from a GitHub repo (esm.sh handles fetching/transform)
// Format: github/<user>/<repo>[@ref]/<path>
// (Comment out — the example repo is illustrative)
// import { thing } from 'github/preactjs/preact@10.22.0/dist/preact.module.js'

// Or, for the truly DIY case, paste the full URL
// import { x } from 'https://my.com/dist/index.js'

const { div, h1, button } = elements

const state = tosi({
  count: 0,
  inc() { state.count++ },
})

document.body.append(
  div(
    h1({ bindText: state.count }),
    button({ onClick: state.inc }, '+1')
  )
)

// date-fns (loaded via JSDelivr hint) used directly
console.log('Today:', format(new Date(), 'yyyy-MM-dd'))
```
