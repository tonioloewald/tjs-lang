/**
 * Module Cache Service Worker
 *
 * Caches fetched ESM modules from CDN for offline/fast access.
 * Uses Cache API for persistence across page loads.
 */

const CACHE_NAME = 'tjs-modules-v1'
const CDN_HOSTS = ['esm.sh', 'cdn.skypack.dev', 'unpkg.com', 'cdn.jsdelivr.net']

// Install - open cache
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => {
      console.log('[SW] Module cache initialized')
    })
  )
  // Activate immediately
  ;(self as any).skipWaiting()
})

// Activate - clean old caches
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(
            (name) => name.startsWith('tjs-modules-') && name !== CACHE_NAME
          )
          .map((name) => caches.delete(name))
      )
    })
  )
  // Take control of all pages immediately
  ;(self as any).clients.claim()
})

// Fetch - intercept CDN requests
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)

  // Only cache CDN module requests
  if (!CDN_HOSTS.some((host) => url.hostname.includes(host))) {
    return
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Check cache first
      const cached = await cache.match(event.request)
      if (cached) {
        console.log('[SW] Cache hit:', url.pathname)
        return cached
      }

      // Fetch from network
      console.log('[SW] Fetching:', url.href)
      try {
        const response = await fetch(event.request)

        // Only cache successful responses
        if (response.ok) {
          // Clone response since it can only be consumed once
          cache.put(event.request, response.clone())
        }

        return response
      } catch (error) {
        console.error('[SW] Fetch failed:', url.href, error)
        throw error
      }
    })
  )
})

// Message handler for cache management
self.addEventListener('message', (event: MessageEvent) => {
  const { type, payload } = event.data || {}

  switch (type) {
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        caches.open(CACHE_NAME)
        event.ports[0]?.postMessage({ success: true })
      })
      break

    case 'GET_CACHE_STATS':
      caches.open(CACHE_NAME).then(async (cache) => {
        const keys = await cache.keys()
        event.ports[0]?.postMessage({
          size: keys.length,
          entries: keys.map((req) => req.url),
        })
      })
      break

    case 'PREFETCH':
      // Prefetch a list of modules
      if (Array.isArray(payload?.urls)) {
        caches.open(CACHE_NAME).then(async (cache) => {
          const results = await Promise.allSettled(
            payload.urls.map(async (url: string) => {
              const cached = await cache.match(url)
              if (!cached) {
                const response = await fetch(url)
                if (response.ok) {
                  await cache.put(url, response)
                }
              }
            })
          )
          event.ports[0]?.postMessage({
            success: results.filter((r) => r.status === 'fulfilled').length,
            failed: results.filter((r) => r.status === 'rejected').length,
          })
        })
      }
      break
  }
})

// TypeScript declarations for service worker globals
declare const self: ServiceWorkerGlobalScope
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<any>): void
}
interface FetchEvent extends Event {
  request: Request
  respondWith(response: Promise<Response> | Response): void
}
