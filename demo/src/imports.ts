/**
 * Playground Import Resolver
 *
 * Rewrites bare import specifiers to absolute JSDelivr CDN URLs with the
 * `/+esm` suffix (which returns a self-contained Rollup-bundled ESM module
 * with CJS-to-ESM transformation, dependencies inlined, and process
 * polyfilled).
 *
 * Flow:
 *   import { x } from 'tosijs@1.3.11'
 *   → import { x } from 'https://cdn.jsdelivr.net/npm/tosijs@1.3.11/+esm'
 *
 * Why direct URLs and not /tfs/ + service worker:
 *   The playground iframe uses a sandboxed blob: URL. Service workers do
 *   not reliably intercept fetches from sandboxed blob iframes (Chrome
 *   quirk — tracked across multiple bug reports). Direct CDN URLs work in
 *   every iframe context. The browser's HTTP cache provides equivalent
 *   caching for repeated loads.
 *
 * The TFS service worker (demo/src/tfs-worker.js) remains in place for
 * non-iframe contexts (e.g. direct navigation to /tfs/...).
 */

const CDN_BASE = 'https://cdn.jsdelivr.net/npm'

/**
 * Convert a bare specifier (`react`, `react-dom/client`, `@scope/pkg@1.0`)
 * to an absolute JSDelivr `/+esm` URL.
 */
function bareToCdnUrl(spec: string): string {
  let parsed: { name: string; version: string; subpath: string } | null = null

  if (spec.startsWith('@')) {
    // Scoped: @scope/pkg, @scope/pkg@version, @scope/pkg/subpath, etc.
    const m = spec.match(/^(@[^/]+\/[^/@]+)(?:@([^/]+))?(\/.*)?$/)
    if (m) parsed = { name: m[1], version: m[2] || 'latest', subpath: m[3] || '' }
  } else {
    const m = spec.match(/^([^/@]+)(?:@([^/]+))?(\/.*)?$/)
    if (m) parsed = { name: m[1], version: m[2] || 'latest', subpath: m[3] || '' }
  }

  if (!parsed) return spec // invalid — leave as-is

  return `${CDN_BASE}/${parsed.name}@${parsed.version}${parsed.subpath}/+esm`
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
