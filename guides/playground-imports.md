<!--{"section":"tjs","type":"docs","group":"docs","order":50}-->

# Playground Imports

The playground (https://tjs-platform.web.app) and the local dev server
both let you `import` external packages without a bundler or
`node_modules`. There's no setup — just write the import. This page
documents how it works and the CDN-hint syntax for power users.

## Quick reference

```javascript
// Plain bare import — JSDelivr `/+esm` by default (works for ESM-native
// and CJS packages alike; deps bundled inline)
import { tosi, elements } from 'tosijs'
import { debounce } from 'lodash-es'
import { marked } from 'marked'

// Versioned: pin a specific release (or range)
import { tosi } from 'tosijs@1.6.1'
import { tosi } from 'tosijs@^1.6'

// Subpath into a package
import { createRoot } from 'react-dom/client'
import { getAuth } from 'firebase/auth'

// Full URL — passes through unchanged. Useful for arbitrary hosts:
// your GitHub repo, a CodePen-style snippet, anything that serves ESM.
import { thing } from 'https://example.com/my-module.js'
import { x } from 'https://raw.githubusercontent.com/user/repo/main/file.js'

// CDN hints (escape hatch when default routing picks the wrong CDN)
import { useState } from 'esmsh/react@18'
import { tosi } from 'jsdelivr/tosijs'
import { preact } from 'unpkg/preact'
import { whatever } from 'github/user/repo@v1.2/dist/index.js'
```

## How it works

1. **Source rewrite at transpile time** (`demo/src/imports.ts`): bare
   specifiers like `'tosijs'` get rewritten to `'/tfs/tosijs'`. Relative
   paths (`'./foo'`), absolute paths (`'/foo'`), and full URLs
   (`'https://...'`) are left alone.
2. **Service worker intercept** (`demo/src/tfs-worker.js`): the playground
   iframe is loaded from a same-origin `/iframe/<sessionId>` URL, so the
   TFS service worker controls all its fetches. When the iframe imports
   from `/tfs/<spec>`, the SW resolves it to a CDN URL, fetches the
   module, optionally rewrites the response body, and serves it back.
3. **Browser ESM loader** does the rest — follows imports, dedupes by
   URL, evaluates modules.

## Default CDN routing

By default, `/tfs/<spec>` resolves to JSDelivr's `/+esm` endpoint:

```
import 'tosijs'
  → /tfs/tosijs
  → https://cdn.jsdelivr.net/npm/tosijs@latest/+esm
```

JSDelivr's `/+esm` returns a self-contained Rollup-bundled ESM module.
It works cleanly for ESM-native packages (tosijs, lodash-es) AND CJS
packages (most things), inlines `process` polyfills, and bundles
dependencies inline.

The bundle-inline behavior breaks one specific case: packages with peer
dependencies that need to be the SAME instance across modules. React is
the canonical example — react-dom and your code both need to use the
same React, or hooks crash (`Cannot read properties of null (reading
'useState')`). For these, the SW has a small allowlist that routes
through esm.sh instead, which dedupes by URL.

Current allowlist: `react`, `react-dom`. Easy to extend in the SW source.

## CDN hints

When you want to override the default routing, prefix the spec with a
CDN name. The first path segment is treated as the hint:

| Hint | Resolves to | Use when |
| --- | --- | --- |
| `jsdelivr/<spec>` | `https://cdn.jsdelivr.net/npm/<spec>/+esm` | Force JSDelivr (e.g. for a peer-dep package not on the allowlist) |
| `esmsh/<spec>` | `https://esm.sh/<spec>` | Force esm.sh (e.g. for a different React-like package needing peer-dep dedup) |
| `unpkg/<spec>` | `https://unpkg.com/<spec>?module` | UNPKG, returns ESM via `?module` |
| `github/<user>/<repo>[@ref]/<path>` | `https://esm.sh/gh/<user>/<repo>[@ref]/<path>` | Load directly from a GitHub repo (esm.sh handles fetching + transformation) |

The hint name occupies what would normally be the package name slot, so
named imports work normally:

```javascript
import { tosi, elements } from 'jsdelivr/tosijs@1.6.1'
import { useState } from 'esmsh/react'
```

Why `esmsh` and not `esm`: `esm` is a popular npm package (the legacy
ESM loader for Node), and we don't want to clash with `import 'esm'`.
`jsdelivr`, `unpkg`, and `github` aren't taken as bare top-level npm
packages.

## Full URLs

Anything starting with `http://` or `https://` passes through the
rewriter unchanged. Use this for one-off cases:

```javascript
// Your own deployed module
import { thing } from 'https://my.com/module.js'

// A GitHub raw URL (only works if the file is already valid ESM —
// raw GitHub doesn't transform CJS or resolve bare specifiers; for
// that use the `github/` hint, which routes through esm.sh)
import { x } from 'https://raw.githubusercontent.com/me/repo/main/dist/index.mjs'

// Any other CDN
import { y } from 'https://cdn.example.com/foo@1.0.0/+esm'
```

## What lives where

- **`demo/src/imports.ts`** — `rewriteImports()` (rewrites at transpile
  time) and `registerIframeContent()` (postMessage handshake)
- **`demo/src/tfs-worker.js`** — the service worker: serves the iframe
  HTML at `/iframe/<id>`, proxies `/tfs/<spec>` to the appropriate CDN,
  rewrites response bodies for esm.sh dedup
- **`demo/src/tjs-playground.ts`** / **`demo/src/ts-playground.ts`** —
  generate `iframeDoc`, register it with the SW, set `iframe.src`

## Future: virtual modules

The SW architecture is set up to also serve user-saved modules at
`/vmod/<path>` (or similar). This will let you "save" a snippet to a
virtual endpoint and `import` from it elsewhere — the b8rjs pattern.
Tracked in `TODO.md` under playground IDE features.

## Cache and debugging

- **Status**: GET `/tfs/__status` (in a new tab) — returns JSON with the
  SW version, the CDN routing config, the cached URLs, and the active
  iframe sessions
- **Clear**: GET `/tfs/__clear` — drops the cached responses

The SW caches CDN responses in a named `Cache` (`tfs-v4-mixed-cdn`).
Bumping `SW_VERSION` in `tfs-worker.js` automatically clears old caches
on activate.
