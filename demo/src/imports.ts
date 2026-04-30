/**
 * Playground Import Resolver
 *
 * Rewrites bare import specifiers to absolute esm.sh URLs.
 *
 * Flow:
 *   import { x } from 'tosijs'
 *   → import { x } from 'https://esm.sh/tosijs'
 *
 * Why esm.sh and not jsdelivr `/+esm`:
 *   Both serve ESM, but jsdelivr's `/+esm` bundles each module's
 *   dependencies inline. That breaks React, which has a peer-dep
 *   relationship between `react` and `react-dom`: each gets its own
 *   bundled copy of React, the dispatcher isn't shared, and `useState`
 *   crashes with "Cannot read properties of null".
 *
 *   esm.sh dedupes by URL — `react-dom/client` references react via the
 *   same `/react@VERSION/...` path the user's `import 'react'` resolves
 *   to, so the browser loads ONE instance.
 *
 * Why direct URLs and not /tfs/ + service worker:
 *   The playground iframe is sandboxed and loaded from a blob: URL.
 *   Service workers do not reliably intercept fetches from sandboxed
 *   blob iframes (Chrome quirk). Direct CDN URLs work everywhere.
 *
 * The TFS service worker (demo/src/tfs-worker.js) remains in place for
 * direct /tfs/ navigation only — it's not on the iframe code path.
 */

const CDN_BASE = 'https://esm.sh'

/**
 * Convert a bare specifier (`react`, `react-dom/client`, `@scope/pkg@1.0`)
 * to an absolute esm.sh URL. esm.sh accepts the spec as-is — it parses
 * scope/version/subpath internally.
 */
function bareToCdnUrl(spec: string): string {
  return `${CDN_BASE}/${spec}`
}

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
 * Rewrite bare import specifiers to absolute JSDelivr `/+esm` URLs.
 * Skips relative (./), absolute (/), and already-absolute http(s):// paths.
 *
 * Before: import { tosi } from 'tosijs'
 * After:  import { tosi } from 'https://cdn.jsdelivr.net/npm/tosijs@latest/+esm'
 */
export function rewriteImports(source: string): string {
  return source.replace(
    /((?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?)(['"])([^'"]+)\2/g,
    (match, prefix, quote, specifier) => {
      // Skip relative and absolute paths — only rewrite bare specifiers
      if (
        specifier.startsWith('.') ||
        specifier.startsWith('/') ||
        specifier.startsWith('http://') ||
        specifier.startsWith('https://')
      ) {
        return match
      }
      return `${prefix}${quote}${bareToCdnUrl(specifier)}${quote}`
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
