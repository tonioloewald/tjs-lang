<!--{"section": "tjs", "type": "docs", "group": "docs", "order": 8, "parent": "tjs.md"}-->
<!-- TODO review -->

# Import Resolver

`tjs-lang/import-resolver` lets code running in a browser write
`import { debounce } from 'lodash-es'` with no bundler and no
`node_modules`. You rewrite the bare specifier to a path on your own
origin, and a service worker you host fetches the package from a CDN,
caches it, and serves it back.

It is meant for doc sites, playgrounds and live examples: places that
run code someone typed. It executes whatever the CDN returns, so do not
install it on an origin where running unvetted npm code is unacceptable.

## Setup

There are two pieces: a service worker script, and a client module.

**1. Copy the worker to your site root.** It ships as a plain file,
`node_modules/tjs-lang/dist/import-resolver-worker.js` (package export
`tjs-lang/import-resolver/worker`). A service worker must be served from
the origin it controls, so it cannot load from a CDN; copy it next to
your `index.html`, the way you would a favicon.

```bash
cp node_modules/tjs-lang/dist/import-resolver-worker.js public/
```

**2. Register it early in startup, then rewrite code before you run it.**

```javascript
import {
  registerImportResolver,
  rewriteImports,
} from 'tjs-lang/import-resolver'

// Resolves true once the worker controls this page.
const ready = await registerImportResolver({
  prefix: '/lib/',
  workerUrl: '/import-resolver-worker.js',
  scope: '/',
})

if (ready) {
  const source = `
    import { debounce } from 'lodash-es'
    export const save = debounce(() => console.log('saved'), 200)
  `
  // import { debounce } from '/lib/lodash-es'
  const runnable = rewriteImports(source, '/lib/')
  const url = URL.createObjectURL(
    new Blob([runnable], { type: 'text/javascript' })
  )
  const { save } = await import(url)
  save()
}
```

The browser now requests `/lib/lodash-es`; the worker intercepts that
request and answers it with
`https://cdn.jsdelivr.net/npm/lodash-es@latest/+esm`.

### What `registerImportResolver` does

It registers the worker and returns a promise of a boolean.

On the very first visit no service worker controls the page yet, so
nothing would be intercepted. By default the function reloads the page
and returns `false`; after the reload it returns `true`. It also returns
`false` (and logs) when the browser has no service workers or the
registration throws.

| Option                 | Default                        | Meaning                                                                                        |
| ---------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `prefix`               | `'/tfs/'`                      | The same-origin path bare imports are rewritten to, and that the worker intercepts.            |
| `workerUrl`            | `'/import-resolver-worker.js'` | Where you serve the worker file.                                                               |
| `scope`                | `'/'`                          | The service-worker scope. The page doing the importing must be inside it.                      |
| `reloadOnFirstInstall` | `true`                         | Reload on first install so the worker takes control. Pass `false` to handle first load yourself. |
| `defaultCdn`           | `'jsdelivr'`                   | `'jsdelivr'` or `'esmsh'`. Any other value falls back to jsDelivr.                             |
| `esmShPackages`        | `['react', 'react-dom']`       | Packages always routed to esm.sh (see below). `[]` for none.                                   |
| `cacheName`            | `'tfs-v4'`                     | Name of the Cache API cache. Change it to start from an empty cache.                           |

The last four are the resolver config. They reach the worker as a query
string on the registered script URL, for example
`/import-resolver-worker.js?prefix=%2Flib%2F&cdn=jsdelivr&esmsh=react%2Creact-dom&cache=tfs-v4`.
The browser keeps that URL across worker restarts, and the client and the
worker read the same config, so they cannot disagree about the prefix.
Pass the same `prefix` to `rewriteImports` that you passed here.

Serving the worker from a subdirectory while using `scope: '/'` also
needs a `Service-Worker-Allowed: /` response header on the worker file.
From the site root nothing extra is needed.

## How a specifier is routed

The worker takes the path after the prefix, splits it into package name,
version and subpath, and picks a CDN URL:

| You write                                | Worker fetches                                           | Why                                      |
| ---------------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| `'tosijs'`                               | `https://cdn.jsdelivr.net/npm/tosijs@latest/+esm`        | Default CDN; no version means `@latest`  |
| `'tosijs@1.6.1/utils'`                   | `https://cdn.jsdelivr.net/npm/tosijs@1.6.1/utils/+esm`   | Version and subpath are kept             |
| `'@scope/pkg@1/sub'`                     | `https://cdn.jsdelivr.net/npm/@scope/pkg@1/sub/+esm`     | Scoped packages work the same way        |
| `'react@18'`                             | `https://esm.sh/react@18`                                | On the esm.sh allowlist                  |
| `'react-dom/client'`                     | `https://esm.sh/react-dom/client`                        | On the allowlist; no version is added    |
| `'jsdelivr/tosijs@1.6.1'`                | `https://cdn.jsdelivr.net/npm/tosijs@1.6.1/+esm`         | `jsdelivr/` hint                         |
| `'esmsh/preact@10'`                      | `https://esm.sh/preact@10`                               | `esmsh/` hint                            |
| `'unpkg/preact'`                         | `https://unpkg.com/preact?module`                        | `unpkg/` hint                            |
| `'github/user/repo@v1.2/dist/index.js'`  | `https://esm.sh/gh/user/repo@v1.2/dist/index.js`         | `github/` hint, via esm.sh               |
| `'https://example.com/mod.js'`           | not intercepted                                          | Full URLs are left alone                 |
| `'./util.js'`, `'/shared/util.js'`       | not intercepted                                          | Relative and absolute paths are left alone |

**The default CDN** is jsDelivr's `/+esm` endpoint, which returns one
self-contained ES module per package with its dependencies bundled in.
That works for ESM and CommonJS packages alike. With
`defaultCdn: 'esmsh'` the default becomes `https://esm.sh/<name>[@version]<subpath>`.

**The esm.sh allowlist** exists because bundling dependencies in breaks
packages that must be a single shared instance. If `react-dom` carries
its own copy of React, hooks fail with
`Cannot read properties of null (reading 'useState')`. esm.sh imports
shared dependencies by URL instead, so every module gets the same
React. Packages in `esmShPackages` always go to esm.sh, whatever
`defaultCdn` says.

**CDN hints** override routing for one import. The first path segment
names the CDN and the rest is passed to it unchanged, version included.
The hint is spelled `esmsh`, not `esm`, because `esm` is a real npm
package. A hint with nothing after it is just a package name:
`import 'jsdelivr'` fetches the npm package called `jsdelivr`.

**Full URLs** (`http://` or `https://`) are not rewritten, so the browser
fetches them directly and the worker never sees them. That suits a module
that is already valid ESM on some host. A raw GitHub file does not
qualify if it is CommonJS or has bare imports of its own; use the
`github/` hint for those.

**Modules a CDN module imports** are fixed up too. CDN bundles import
their own dependencies by root-relative path (`"/npm/acorn@8.18.0/+esm"`,
`"/react@18/..."`). Served from your origin those would point at your
server, so the worker rewrites them to absolute URLs on the CDN the
module came from before caching it. The rewrite skips paths that only
appear inside strings or comments.

## Rewriting source yourself

`rewriteImports(source, prefix)` returns `source` with each bare
specifier in a static `import` or `export ... from` replaced by
`<prefix><specifier>`. The prefix defaults to `'/tfs/'`.

```javascript
import { rewriteImports } from 'tjs-lang/import-resolver'

rewriteImports(
  `import { tosi } from 'tosijs'
import './local.js'
export * from 'lodash-es'`,
  '/lib/'
)
// import { tosi } from '/lib/tosijs'
// import './local.js'
// export * from '/lib/lodash-es'
```

`extractImports(source)` returns the distinct bare specifiers it would
touch, which is handy for preloading. (It differs in one way: it does not
skip `http://` and `https://` specifiers.)

The routing functions are exported as well, so a server or a test can
compute the same URL the worker would:

```javascript
import { parseTfsPath, buildCdnUrl } from 'tjs-lang/import-resolver'

const { name, version, subpath } = parseTfsPath('tosijs@1.6.1/utils')
buildCdnUrl(name, version, subpath)
// https://cdn.jsdelivr.net/npm/tosijs@1.6.1/utils/+esm
```

`buildCdnUrl` takes an optional fourth argument, a full config, and uses
`DEFAULT_CONFIG` otherwise. Also exported: `serializeConfig` and
`parseConfig` (the query-string codec), `DEFAULT_CONFIG`, `JSDELIVR`,
`ESM_SH`, `CDN_HINTS`, `rewriteCdnBody` and `rewriteEsmShBody` (the
response-body rewrite described above), and `handleResolverFetch`, the
worker's request handler, for building your own worker on the same
pipeline.

## Caching and debugging

The worker stores each module in a Cache API cache named by `cacheName`,
keyed by the CDN URL. A cached module is served without touching the
network, and nothing expires. In particular an unversioned import is
pinned to whatever `@latest` was on first fetch, until you clear the
cache. Pin versions when that matters.

Two reserved paths under the prefix help (shown with `prefix: '/lib/'`;
open them in a tab on your site):

- `/lib/__status` returns JSON: the cache name, the config, and the path
  of every cached URL.
- `/lib/__clear` deletes the cache.

Every module response carries `X-TFS-Cache: hit` or `miss`, and
`X-TFS-Source` with the CDN URL it came from, so the Network panel shows
where a module was resolved. A specifier the worker cannot parse gets a
400, a CDN error a 404 (`package not found: <url>`), and a network
failure a 502.

Changing `cacheName` changes the worker URL, so the browser installs it
again. On activation the worker deletes only earlier versions of its own
cache: the same name with an older trailing number (`tfs-v3` when the
current one is `tfs-v4`). Your site's other Cache API data is left alone.
A `cacheName` with no trailing number has no earlier versions to delete.

## Limits

- **What is rewritten.** `rewriteImports` finds specifiers after `from`,
  after a side-effect `import`, and inside a dynamic `import('…')`, minified
  or not, whatever the import clause contains. Text inside a string or a
  comment is never rewritten. Specifiers that are relative, absolute or
  carry a scheme (`https:`, `data:`, `node:` …) are left as they are.
- **No Node built-ins.** `import fs from 'node:fs'` is left alone, and a
  browser cannot load it: there is no shim.
- **Query strings are dropped.** The worker routes on the request path,
  so `'esmsh/react?dev'` loses `?dev`.
- **The page must be controlled.** Until the worker controls the page,
  requests to the prefix go to your server and most likely 404. That is
  why first install reloads by default.
- **Packages must exist on the CDN as browser ESM.** jsDelivr's `/+esm`
  covers most of npm; packages that depend on Node APIs still fail at run
  time.

The tjs playground runs its own worker (`demo/src/tfs-worker.ts`) built on
the same pipeline, with an extra `/iframe/` protocol for its sandboxed
preview. That protocol is not part of this export, and the playground is
being retired onto this doc site.
