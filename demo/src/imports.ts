/**
 * Playground Import Resolver
 *
 * Rewrites bare import specifiers to /tfs/<spec> URLs. The TFS service
 * worker (demo/src/tfs-worker.js) intercepts those, proxies to esm.sh,
 * and rewrites esm.sh's relative paths to absolute esm.sh URLs.
 *
 * Flow:
 *   import { x } from 'tosijs'
 *   → import { x } from '/tfs/tosijs'
 *   → SW intercepts, fetches https://esm.sh/tosijs
 *   → SW rewrites response to use absolute esm.sh URLs for sub-modules
 *   → browser fetches sub-modules directly from esm.sh (cross-origin,
 *     bypasses this SW), enabling peer-dep dedup
 *
 * The /tfs/ indirection — instead of writing esm.sh URLs directly into
 * user code — exists so the SW can:
 *   - cache responses across page loads
 *   - intercept future virtual-module paths (/vmod/...) for IDE features
 *   - swap the CDN backend without changing emitted code
 *
 * For this to work, the playground iframe must be SAME-ORIGIN with the
 * page (so the SW controls it). See tjs-playground.ts: the iframe loads
 * from /iframe/<sessionId>, which the SW serves from a postMessage-fed
 * in-memory store. blob: URLs do NOT work — Chrome SWs don't intercept
 * fetches from sandboxed blob iframes.
 */

/**
 * Extract bare import specifiers from source code.
 * Used by the test runner to resolve local modules.
 */
export function extractImports(source: string): string[] {
  const imports: string[] = []
  const importRegex =
    /(?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g

  let match
  while ((match = importRegex.exec(source)) !== null) {
    const specifier = match[1]
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      imports.push(specifier)
    }
  }
  return [...new Set(imports)]
}

/**
 * Rewrite bare import specifiers to /tfs/<spec> URLs.
 * Skips relative (./), absolute (/), and already-absolute http(s):// paths.
 *
 * Before: import { tosi } from 'tosijs'
 * After:  import { tosi } from '/tfs/tosijs'
 */
export function rewriteImports(source: string): string {
  return source.replace(
    /((?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?)(['"])([^'"]+)\2/g,
    (match, prefix, quote, specifier) => {
      if (
        specifier.startsWith('.') ||
        specifier.startsWith('/') ||
        specifier.startsWith('http://') ||
        specifier.startsWith('https://')
      ) {
        return match
      }
      return `${prefix}${quote}/tfs/${specifier}${quote}`
    }
  )
}

/**
 * Register the TFS service worker.
 * Call this early in app startup.
 * Auto-reloads on first install so the worker is active immediately.
 */
export async function registerTFS(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported — TFS unavailable')
    return false
  }

  try {
    await navigator.serviceWorker.register('/tfs-worker.js', { scope: '/' })

    // First load — no controller yet. Reload so the worker can intercept.
    if (!navigator.serviceWorker.controller) {
      window.location.reload()
      return false
    }

    return true
  } catch (error) {
    console.error('TFS registration failed:', error)
    return false
  }
}

/**
 * Register an iframe's HTML with the SW under a session ID, then resolve
 * once the SW confirms registration. The caller can then set the iframe's
 * src to `/iframe/<sessionId>` and the SW will serve the registered HTML.
 *
 * Resolves to false if the SW isn't active (caller should fall back to
 * blob: URL — the iframe will work but won't have SW interception).
 */
export async function registerIframeContent(
  sessionId: string,
  html: string
): Promise<boolean> {
  const sw = navigator.serviceWorker?.controller
  if (!sw) return false

  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel()
    let settled = false
    const settle = (ok: boolean) => {
      if (settled) return
      settled = true
      channel.port1.close()
      resolve(ok)
    }
    channel.port1.onmessage = (e) => {
      settle(e.data?.type === 'iframe-registered')
    }
    // Safety: if the SW never replies, don't hang the playground forever
    setTimeout(() => settle(false), 500)
    sw.postMessage(
      { type: 'register-iframe', sessionId, html },
      [channel.port2]
    )
  })
}
