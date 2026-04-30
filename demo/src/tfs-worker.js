/**
 * TFS — TJS File System Service Worker
 *
 * Intercepts /tfs/ requests and resolves them to CDN modules.
 * Handles caching, version resolution, and ESM serving.
 *
 * URL format: /tfs/package@version/subpath
 *   /tfs/tosijs@1.3.11          → jsdelivr CDN
 *   /tfs/tosijs@latest           → jsdelivr CDN (latest)
 *   /tfs/lodash-es@4.17.21      → jsdelivr CDN
 *   /tfs/@scope/pkg@1.0.0       → jsdelivr CDN (scoped)
 *
 * If no version specified, defaults to @latest.
 */

const CACHE_NAME = 'tfs-v1'
const CDN_BASE = 'https://cdn.jsdelivr.net/npm'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

/**
 * Parse a TFS path into package name, version, and subpath.
 *
 * Examples:
 *   tosijs@1.3.11         → { name: 'tosijs', version: '1.3.11', subpath: '' }
 *   tosijs                → { name: 'tosijs', version: 'latest', subpath: '' }
 *   tosijs@1.3.11/utils   → { name: 'tosijs', version: '1.3.11', subpath: '/utils' }
 *   @scope/pkg@1.0.0      → { name: '@scope/pkg', version: '1.0.0', subpath: '' }
 *   @scope/pkg@1.0.0/sub  → { name: '@scope/pkg', version: '1.0.0', subpath: '/sub' }
 */
function parseTfsPath(path) {
  // Scoped packages: @scope/name@version/subpath
  if (path.startsWith('@')) {
    const match = path.match(/^(@[^/]+\/[^/@]+)(?:@([^/]+))?(\/.*)?$/)
    if (match) {
      return {
        name: match[1],
        version: match[2] || 'latest',
        subpath: match[3] || '',
      }
    }
  }

  // Regular packages: name@version/subpath
  const match = path.match(/^([^/@]+)(?:@([^/]+))?(\/.*)?$/)
  if (match) {
    return {
      name: match[1],
      version: match[2] || 'latest',
      subpath: match[3] || '',
    }
  }

  return null
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Only intercept /tfs/ requests
  if (!url.pathname.startsWith('/tfs/')) return

  const tfsPath = url.pathname.slice(5) // strip '/tfs/'
  if (!tfsPath) return

  // Special: /tfs/__status
  if (tfsPath === '__status') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const keys = await cache.keys()
        return new Response(
          JSON.stringify({
            version: CACHE_NAME,
            cached: keys.map((k) => new URL(k.url).pathname),
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      })
    )
    return
  }

  // Special: /tfs/__clear
  if (tfsPath === '__clear') {
    event.respondWith(
      caches
        .delete(CACHE_NAME)
        .then(() => new Response('cache cleared', { status: 200 }))
    )
    return
  }

  const parsed = parseTfsPath(tfsPath)
  if (!parsed) {
    event.respondWith(new Response('invalid tfs path', { status: 400 }))
    return
  }

  event.respondWith(serveTfsRequest(parsed, event.request))
})

async function serveTfsRequest({ name, version, subpath }, request) {
  const cache = await caches.open(CACHE_NAME)

  // Use JSDelivr's `/+esm` suffix: returns a self-contained ESM bundle
  // with CJS-to-ESM transformation, dependencies inlined, and process
  // polyfilled. Works for both ESM-native packages (tosijs, lodash-es)
  // and CJS packages (react, react-dom). Skip the resolveEntryPoint step
  // — JSDelivr handles entry resolution for `/+esm` URLs directly.
  const cdnUrl = `${CDN_BASE}/${name}@${version}${subpath}/+esm`
  const cacheKey = new Request(cdnUrl)

  // Check cache
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

  // Fetch from CDN
  try {
    const response = await fetch(cdnUrl)
    if (!response.ok) {
      return new Response(`package not found: ${cdnUrl}`, { status: 404 })
    }

    let body = await response.text()
    const origin = new URL(request.url).origin
    const pkgBase = `${CDN_BASE}/${name}@${version}`

    // Rewrite imports in fetched module:
    // - Bare specifiers → /tfs/ URLs (transitive deps, single copy)
    // - Relative imports → absolute CDN URLs (sibling files within package)
    body = body.replace(
      /((?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?)(['"])([^'"]+)\2/g,
      (match, prefix, quote, spec) => {
        if (spec.startsWith('http://') || spec.startsWith('https://'))
          return match
        if (spec.startsWith('./') || spec.startsWith('../')) {
          const dir = subpath.replace(/\/[^/]*$/, '')
          // Add .js extension if missing (CDN requires it)
          const specWithExt = /\.\w+$/.test(spec) ? spec : `${spec}.js`
          const resolved = new URL(specWithExt, `${pkgBase}${dir}/`).href
          return `${prefix}${quote}${resolved}${quote}`
        }
        if (spec.startsWith('/')) return match
        // Bare specifier → route through /tfs/ for dedup
        return `${prefix}${quote}${origin}/tfs/${spec}${quote}`
      }
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
