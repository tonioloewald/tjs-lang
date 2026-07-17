/**
 * The reusable import-resolver service worker.
 *
 * Bundled (esbuild, IIFE — classic workers reject import/export) to
 * `dist/import-resolver-worker.js` and exported as the raw asset
 * `tjs-lang/import-resolver/worker`. A service worker is ORIGIN-SCOPED, so a
 * consumer must serve this file from their own origin (copy it into their
 * public root — like a favicon) and register it with
 * `registerImportResolver()` from `tjs-lang/import-resolver`. Served from a
 * subdirectory, broadening scope needs the `Service-Worker-Allowed: /`
 * response header.
 *
 * Configuration arrives as a query string on the registered script URL
 * (see resolve.ts's config codec) — available before the first intercepted
 * fetch and durable across worker restarts.
 *
 * This worker contains ONLY the generic import resolver. tjs-lang's own
 * playground worker (demo/src/tfs-worker.ts) composes the same core and adds
 * the playground-specific /iframe/ protocol on top.
 */

import { parseConfig } from './resolve'
import { handleResolverFetch } from './worker-core'

declare const self: any
declare const caches: any

const config = parseConfig(new URL(self.location.href).searchParams)

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous config/versions
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

self.addEventListener('fetch', (event: any) => {
  const url = new URL(event.request.url)
  if (!url.pathname.startsWith(config.prefix)) return
  const resolverPath = url.pathname.slice(config.prefix.length)
  if (!resolverPath) return
  event.respondWith(handleResolverFetch(resolverPath, config))
})
