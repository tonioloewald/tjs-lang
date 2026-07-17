/**
 * Service-worker fetch pipeline for the import resolver — browser-only
 * (uses the Cache API and fetch), built on the pure routing in resolve.ts.
 *
 * Shared by the reusable worker (worker.ts → dist/import-resolver-worker.js)
 * AND the demo's playground worker (demo/src/tfs-worker.ts, which adds the
 * playground-specific /iframe/ protocol on top), so the cache→fetch→rewrite
 * pipeline is written exactly once.
 */

import {
  parseTfsPath,
  buildCdnUrl,
  rewriteEsmShBody,
  ESM_SH,
  type ResolverConfig,
} from './resolve'

declare const caches: any

/**
 * Handle a fetch for a path under `config.prefix`. The caller has already
 * matched the prefix; `resolverPath` is everything after it.
 *
 * Reserved paths: `__status` (cache stats as JSON), `__clear` (drop the cache).
 */
export async function handleResolverFetch(
  resolverPath: string,
  config: ResolverConfig
): Promise<Response> {
  if (resolverPath === '__status') return serveStatus(config)
  if (resolverPath === '__clear') return serveClear(config)

  const parsed = parseTfsPath(resolverPath)
  if (!parsed) {
    return new Response('invalid import-resolver path', { status: 400 })
  }

  const cache = await caches.open(config.cacheName)
  const cdnUrl = buildCdnUrl(
    parsed.name,
    parsed.version,
    parsed.subpath,
    config
  )
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
    if (cdnUrl.startsWith(ESM_SH)) {
      body = rewriteEsmShBody(body)
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
  } catch (err: any) {
    return new Response(`fetch error: ${err.message}`, { status: 502 })
  }
}

async function serveStatus(config: ResolverConfig): Promise<Response> {
  const cache = await caches.open(config.cacheName)
  const keys = await cache.keys()
  return new Response(
    JSON.stringify({
      version: config.cacheName,
      config: {
        prefix: config.prefix,
        defaultCdn: config.defaultCdn,
        esmShPackages: config.esmShPackages,
      },
      cached: keys.map((k: Request) => new URL(k.url).pathname),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function serveClear(config: ResolverConfig): Promise<Response> {
  await caches.delete(config.cacheName)
  return new Response('cache cleared', { status: 200 })
}
