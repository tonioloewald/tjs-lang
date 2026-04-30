/**
 * TFS — TJS File System Service Worker
 *
 * Acts as a tiny in-browser server for the playground iframe:
 *
 *   /iframe/<sessionId>   → playground HTML registered via postMessage
 *   /tfs/<spec>           → CDN module (JSDelivr by default, esm.sh for
 *                           packages that need peer-dep dedup like React)
 *
 * The iframe is loaded from a same-origin /iframe/<id> URL (instead of
 * a blob: URL) so the SW controls it. Every fetch from inside the iframe
 * — module imports, future virtual-module reads, future fetch() mocks —
 * goes through this SW.
 *
 * URL format for /tfs/:
 *   /tfs/tosijs                  → JSDelivr `/+esm`
 *   /tfs/lodash-es/debounce      → JSDelivr `/+esm`
 *   /tfs/react                   → esm.sh (peer-dep dedup with react-dom)
 *   /tfs/react-dom/client        → esm.sh
 *   /tfs/@scope/pkg@1.0.0        → JSDelivr `/+esm`
 *   /tfs/__status                → cache stats
 *   /tfs/__clear                 → drop the cache
 */

const SW_VERSION = 'tfs-v4-mixed-cdn'
const CACHE_NAME = SW_VERSION

// Default CDN. JSDelivr's `/+esm` returns a self-contained Rollup-bundled
// ESM module — works cleanly for ESM-native packages (tosijs, lodash-es)
// AND CJS packages (most things). Bundles dependencies inline.
const JSDELIVR = 'https://cdn.jsdelivr.net/npm'

// esm.sh override for packages with tricky peer-dependency requirements.
// React + react-dom can't both bundle React inline (the dispatcher state
// is module-scoped — two copies → useState() crashes with null). esm.sh
// builds these with `external: react` so the user's `import 'react'`
// and react-dom's internal react reference resolve to the SAME URL.
//
// Caveat: esm.sh wraps SOME ESM-native packages as CJS-with-default-only,
// breaking named imports. Tested: tosijs is broken, lodash-es is broken.
// Only use it where the peer-dep dedup matters more than named imports.
const ESM_SH = 'https://esm.sh'
const ESM_SH_PACKAGES = new Set(['react', 'react-dom'])

// Explicit per-import CDN hints (first path segment in the spec).
// Lets users force a specific CDN when default routing picks the wrong one.
//
//   import x from 'jsdelivr/tosijs@1.6'        → JSDelivr
//   import x from 'esmsh/react@18'             → esm.sh
//   import x from 'unpkg/preact'               → UNPKG
//   import x from 'github/user/repo@main/file' → esm.sh's /gh/ route
//
// Hint name `esm` would conflict with the popular `esm` npm package, so we
// use `esmsh`. `jsdelivr`, `unpkg`, `github` are not taken as bare top-level
// npm packages.
const CDN_HINTS = {
  jsdelivr: (rest) => `${JSDELIVR}/${rest}/+esm`,
  esmsh: (rest) => `${ESM_SH}/${rest}`,
  unpkg: (rest) => `https://unpkg.com/${rest}?module`,
  github: (rest) => `${ESM_SH}/gh/${rest}`,
}

// In-memory store of iframe HTML by session ID. Populated via postMessage
// from the playground when running code; consumed when the iframe fetches
// /iframe/<sessionId>. Lost on SW restart, which is fine — the playground
// re-registers each run.
const iframeContents = new Map()

self.addEventListener('install', () => {
  console.log(`[TFS] installing ${SW_VERSION}`)
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log(`[TFS] activating ${SW_VERSION}`)
  event.waitUntil(
    (async () => {
      // Drop caches from previous SW versions
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
      await clients.claim()
    })()
  )
})

// Receive iframe HTML registrations from the playground.
// Replies on event.ports[0] (if provided) so the playground can await
// the registration before setting iframe.src.
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return

  if (data.type === 'register-iframe') {
    iframeContents.set(data.sessionId, data.html)
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: 'iframe-registered' })
    }
  } else if (data.type === 'unregister-iframe') {
    iframeContents.delete(data.sessionId)
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // /iframe/<sessionId> — serve the registered HTML
  if (url.pathname.startsWith('/iframe/')) {
    const sessionId = url.pathname.slice('/iframe/'.length)
    event.respondWith(serveIframeRequest(sessionId))
    return
  }

  // /tfs/<spec> — proxy to esm.sh
  if (url.pathname.startsWith('/tfs/')) {
    const tfsPath = url.pathname.slice(5)
    if (!tfsPath) return

    if (tfsPath === '__status') {
      event.respondWith(serveStatus())
      return
    }
    if (tfsPath === '__clear') {
      event.respondWith(serveClear())
      return
    }

    const parsed = parseTfsPath(tfsPath)
    if (!parsed) {
      event.respondWith(new Response('invalid tfs path', { status: 400 }))
      return
    }
    event.respondWith(serveTfsRequest(parsed))
    return
  }

  // Anything else: let it pass through to the network
})

function serveIframeRequest(sessionId) {
  const html = iframeContents.get(sessionId)
  if (!html) {
    return new Response(
      `iframe content not found for session ${sessionId} — playground may not have registered yet`,
      { status: 404, headers: { 'Content-Type': 'text/plain' } }
    )
  }
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
      // No-cache: each playground run registers fresh content
      'Cache-Control': 'no-store',
    },
  })
}

async function serveStatus() {
  const cache = await caches.open(CACHE_NAME)
  const keys = await cache.keys()
  return new Response(
    JSON.stringify({
      version: CACHE_NAME,
      cdn: { default: JSDELIVR, esmSh: [...ESM_SH_PACKAGES] },
      cached: keys.map((k) => new URL(k.url).pathname),
      iframeSessions: [...iframeContents.keys()],
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function serveClear() {
  await caches.delete(CACHE_NAME)
  return new Response('cache cleared', { status: 200 })
}

/**
 * Build the CDN URL for a parsed TFS path. JSDelivr `/+esm` by default;
 * esm.sh for packages in ESM_SH_PACKAGES.
 *
 *   react           → https://esm.sh/react
 *   react-dom/client → https://esm.sh/react-dom/client
 *   tosijs          → https://cdn.jsdelivr.net/npm/tosijs@latest/+esm
 *   tosijs@1.6.1    → https://cdn.jsdelivr.net/npm/tosijs@1.6.1/+esm
 *   lodash-es/get   → https://cdn.jsdelivr.net/npm/lodash-es@latest/get/+esm
 */
function buildCdnUrl(name, version, subpath) {
  // Explicit hint: `<cdn>/<rest>` where <cdn> is a known CDN name
  if (CDN_HINTS[name] && subpath) {
    // subpath starts with `/` — strip it. The version slot is unused for
    // hinted specifiers since the inner spec carries its own version.
    return CDN_HINTS[name](subpath.slice(1))
  }
  // Allowlist override (peer-dep packages must use esm.sh)
  if (ESM_SH_PACKAGES.has(name)) {
    const versionPart = version ? `@${version}` : ''
    return `${ESM_SH}/${name}${versionPart}${subpath}`
  }
  // Default: JSDelivr `/+esm`
  const versionPart = version ? `@${version}` : '@latest'
  return `${JSDELIVR}/${name}${versionPart}${subpath}/+esm`
}

/**
 * Parse a TFS path into package name, version, and subpath.
 *
 *   tosijs@1.3.11         → { name: 'tosijs', version: '1.3.11', subpath: '' }
 *   tosijs                → { name: 'tosijs', version: '', subpath: '' }
 *   tosijs@1.3.11/utils   → { name: 'tosijs', version: '1.3.11', subpath: '/utils' }
 *   @scope/pkg@1.0.0      → { name: '@scope/pkg', version: '1.0.0', subpath: '' }
 *   @scope/pkg@1.0.0/sub  → { name: '@scope/pkg', version: '1.0.0', subpath: '/sub' }
 */
function parseTfsPath(path) {
  if (path.startsWith('@')) {
    const m = path.match(/^(@[^/]+\/[^/@]+)(?:@([^/]+))?(\/.*)?$/)
    if (m) return { name: m[1], version: m[2] || '', subpath: m[3] || '' }
  }
  const m = path.match(/^([^/@]+)(?:@([^/]+))?(\/.*)?$/)
  if (m) return { name: m[1], version: m[2] || '', subpath: m[3] || '' }
  return null
}

async function serveTfsRequest({ name, version, subpath }) {
  const cache = await caches.open(CACHE_NAME)
  const cdnUrl = buildCdnUrl(name, version, subpath)
  const cacheKey = new Request(cdnUrl)

  const cached = await cache.match(cacheKey)
  if (cached) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/javascript',
        'X-TFS-Cache': 'hit',
        'X-TFS-Source': cdnUrl,
      },
    })
  }

  try {
    const response = await fetch(cdnUrl)
    if (!response.ok) {
      return new Response(`package not found: ${cdnUrl}`, { status: 404 })
    }

    let body = await response.text()

    // esm.sh's response uses esm.sh-relative paths (`/react@VERSION/...`).
    // Loaded from the playground origin those would resolve back to us
    // instead of esm.sh. Rewrite to absolute esm.sh URLs so the browser
    // fetches them directly AND dedupes cross-package peer-dep references
    // (react ↔ react-dom). JSDelivr `/+esm` responses are self-contained
    // and don't have any `/...` paths, so this is a no-op for them.
    if (cdnUrl.startsWith(ESM_SH)) {
      body = body.replace(
        /((?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?)(['"])(\/[^'"]+)\2/g,
        (_match, prefix, quote, path) =>
          `${prefix}${quote}${ESM_SH}${path}${quote}`
      )
    }

    await cache.put(
      cacheKey,
      new Response(body, { headers: { 'Content-Type': 'text/javascript' } })
    )

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/javascript',
        'X-TFS-Cache': 'miss',
        'X-TFS-Source': cdnUrl,
      },
    })
  } catch (err) {
    return new Response(`fetch error: ${err.message}`, { status: 502 })
  }
}
