<!--{"section": "tjs", "type": "example", "group": "unbundled", "order": 5, "parent": "tjs-unbundled.md"}-->

# CDN Hints (overriding the default)

By default the playground resolves bare imports through JSDelivr's `/+esm`
bundles. When you need a specific CDN — to test an unreleased build, work
around a transform issue, or load a module straight from GitHub — prefix
the spec with a CDN hint.

```tjs:inline
TjsCompat
/#
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
#/

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

// Render into the example's own box: the doc site gives an example a `preview` element (its
// page IS the doc page); the old playground ran each example in a page of its own.
const stage = typeof preview === 'undefined' ? document.body : preview
stage.append(
  div(
    h1({ bindText: state.count }),
    button({ onClick: state.inc }, '+1')
  )
)

// date-fns (loaded via JSDelivr hint) used directly
console.log('Today:', format(new Date(), 'yyyy-MM-dd'))
```

<!-- TODO review -->
## What to notice

- **The hint is part of the import string, and nothing else changes.** `import { format }
  from 'jsdelivr/date-fns@3.0.0'` is still an ordinary ES import. The playground rewrites the
  specifier to a same-origin path, and its service worker maps the first path segment
  (`jsdelivr/`, `esmsh/`, `unpkg/`, `github/`) to a CDN, fetches the module and caches it.
  The browser's own module loader does the rest.
- **Versions go where npm puts them.** `date-fns@3.0.0` pins a release; `tosijs@^1.6` takes a
  range. Without a version you get the latest, which is convenient for a sketch and a hazard
  for anything you mean to keep.
- **Full URLs are left alone.** If you already know where the module lives, write the URL;
  no hint is needed or applied.

<!-- TODO review -->
## When to reach for a hint

The default (JSDelivr's `/+esm` bundles) works for most packages, ESM or CommonJS. Use a hint
when it does not:

| symptom | try |
|---------|-----|
| a library with peer dependencies loads its own copy of them (React itself is already routed to esm.sh; a React-like package is not) | `esmsh/<spec>`, so peers are shared rather than bundled inline |
| an unreleased fix that only exists on a branch | `github/<user>/<repo>@<ref>/<path>` |
| a package JSDelivr transforms badly | `unpkg/<spec>` or `esmsh/<spec>` |

Pin a version whenever you use a hint. The point of a hint is to control exactly what loads,
and an unpinned spec gives that control back to whatever was published last.

<!-- TODO review -->
## Limits

- **This is the playground's resolver, not a language feature.** TJS itself does not know
  about CDNs: the rewrite is done by the playground and the local dev server
  (`bun run dev`). In your own pages, `tjs-lang/import-resolver` provides the same
  bundler-free bare imports, with the worker copied to your site root. A bundler or a
  `node_modules` install resolves imports its own way and ignores these prefixes.
- **Everything is fetched at run time.** A CDN outage, a rate limit or a removed version
  breaks the page. For production, pin versions, or vendor the modules you depend on.
- **This example needs a browser and the network**, so it is not run by the command-line
  harness. The full routing rules are in [Playground Imports](/playground-imports/).
