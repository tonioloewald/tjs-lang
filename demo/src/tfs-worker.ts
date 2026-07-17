/**
 * TFS — the tjs playground's service worker.
 *
 * Composes the reusable import resolver (src/import-resolver/worker-core —
 * the same pipeline consumers get from `tjs-lang/import-resolver/worker`)
 * with the PLAYGROUND-SPECIFIC /iframe/ protocol:
 *
 *   /tfs/<spec>           → CDN module via the shared resolver core
 *   /iframe/<sessionId>   → playground HTML registered via postMessage
 *
 * The /iframe/ protocol is deliberately NOT part of the exported resolver —
 * it exists so the playground iframe is same-origin (a SW can't intercept
 * fetches from sandboxed blob: iframes), which is a playground concern, not
 * an import-resolution one.
 *
 * Bundled to .demo/tfs-worker.js (esbuild IIFE — classic workers reject
 * import/export) by scripts/build-demo.ts and bin/dev.ts. This replaced the
 * standalone demo/src/tfs-worker.js, which was one of three diverged copies
 * of the routing logic (#20).
 */

import { parseConfig } from '../../src/import-resolver/resolve'
import { handleResolverFetch } from '../../src/import-resolver/worker-core'

declare const self: any
declare const caches: any

const config = parseConfig(new URL(self.location.href).searchParams)

// In-memory store of iframe HTML by session ID. Populated via postMessage
// from the playground when running code; consumed when the iframe fetches
// /iframe/<sessionId>. Lost on SW restart, which is fine — the playground
// re-registers each run.
const iframeContents = new Map<string, string>()

self.addEventListener('install', () => {
  console.log(`[TFS] installing (cache: ${config.cacheName})`)
  self.skipWaiting()
})

self.addEventListener('activate', (event: any) => {
  console.log(`[TFS] activating (cache: ${config.cacheName})`)
  event.waitUntil(
    (async () => {
      // Drop caches from previous SW versions
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k: string) => k !== config.cacheName)
          .map((k: string) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

// Receive iframe HTML registrations from the playground.
// Replies on event.ports[0] (if provided) so the playground can await
// the registration before setting iframe.src.
self.addEventListener('message', (event: any) => {
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

self.addEventListener('fetch', (event: any) => {
  const url = new URL(event.request.url)

  // /iframe/<sessionId> — serve the registered HTML (playground-specific)
  if (url.pathname.startsWith('/iframe/')) {
    const sessionId = url.pathname.slice('/iframe/'.length)
    event.respondWith(serveIframeRequest(sessionId))
    return
  }

  // <prefix><spec> — the shared import resolver
  if (url.pathname.startsWith(config.prefix)) {
    const resolverPath = url.pathname.slice(config.prefix.length)
    if (!resolverPath) return
    event.respondWith(handleResolverFetch(resolverPath, config))
    return
  }

  // Anything else: let it pass through to the network
})

function serveIframeRequest(sessionId: string): Response {
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
