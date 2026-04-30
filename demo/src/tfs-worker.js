/**
 * TFS — TJS File System Service Worker
 *
 * Acts as a tiny in-browser server for the playground iframe:
 *
 *   /iframe/<sessionId>   → playground HTML registered via postMessage
 *   /tfs/<spec>           → CDN module via esm.sh
 *
 * The iframe is loaded from a same-origin /iframe/<id> URL (instead of
 * a blob: URL) so the SW controls it. Every fetch from inside the iframe
 * — module imports, future virtual-module reads, future fetch() mocks —
 * goes through this SW.
 *
 * Why esm.sh: dedupes packages with peer dependencies (like react +
 * react-dom) by URL. JSDelivr's `/+esm` bundles deps inline, which
 * gives react-dom its own copy of React → useState crashes.
 *
 * URL format for /tfs/:
 *   /tfs/tosijs                  → esm.sh/tosijs
 *   /tfs/tosijs@1.6.1            → esm.sh/tosijs@1.6.1
 *   /tfs/lodash-es/debounce      → esm.sh/lodash-es/debounce
 *   /tfs/@scope/pkg@1.0.0        → esm.sh/@scope/pkg@1.0.0
 *   /tfs/__status                → cache stats
 *   /tfs/__clear                 → drop the cache
 */

const SW_VERSION = 'tfs-v3-iframe-host'
const CACHE_NAME = SW_VERSION
const CDN_BASE = 'https://esm.sh'

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
      cdn: CDN_BASE,
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
  // esm.sh: omit version means latest; include version inline (`react@18`).
  const versionPart = version ? `@${version}` : ''
  const cdnUrl = `${CDN_BASE}/${name}${versionPart}${subpath}`
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
    // Loaded from the playground origin, those would resolve back to us
    // instead of esm.sh. Rewrite to absolute esm.sh URLs so the browser
    // fetches them directly (bypassing this SW) AND dedupes cross-package
    // peer-dep references like react ↔ react-dom.
    body = body.replace(
      /((?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?)(['"])(\/[^'"]+)\2/g,
      (_match, prefix, quote, path) => `${prefix}${quote}${CDN_BASE}${path}${quote}`
    )

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
