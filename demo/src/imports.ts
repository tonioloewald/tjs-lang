/**
 * Playground Import Resolver — TFS Edition
 *
 * Rewrites bare import specifiers to /tfs/ URLs.
 * The TFS service worker handles CDN resolution and caching.
 *
 * Flow:
 *   import { x } from 'tosijs@1.3.11'
 *   → rewritten to: import { x } from '/tfs/tosijs@1.3.11'
 *   → service worker intercepts /tfs/tosijs@1.3.11
 *   → fetches from jsdelivr CDN, caches, returns ESM
 *
 * No import maps needed.
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
 * Rewrite bare import specifiers to /tfs/ URLs.
 * Skips relative (./) and absolute (/) paths.
 *
 * Before: import { tosi } from 'tosijs'
 * After:  import { tosi } from '/tfs/tosijs'
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
