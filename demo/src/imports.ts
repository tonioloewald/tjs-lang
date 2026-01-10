/**
 * Playground Import Resolver
 *
 * Resolves and fetches external modules for the TJS playground.
 * Uses esm.sh CDN for npm packages.
 *
 * Features:
 * - Detects import statements in code
 * - Fetches modules from esm.sh
 * - Caches fetched modules in memory
 * - Returns import map for browser
 */

// CDN base URL - esm.sh provides ESM builds of npm packages
const CDN_BASE = 'https://esm.sh'

// In-memory cache for fetched module URLs
const moduleCache = new Map<string, string>()

// Common packages that should use specific versions
const PINNED_VERSIONS: Record<string, string> = {
  lodash: '4.17.21',
  'lodash-es': '4.17.21',
  'date-fns': '3.0.0',
  zod: '3.22.0',
  preact: '10.19.0',
  react: '18.2.0',
  'react-dom': '18.2.0',
}

/**
 * Extract import specifiers from source code
 */
export function extractImports(source: string): string[] {
  const imports: string[] = []

  // Match: import ... from 'package'
  // Match: import ... from "package"
  // Match: import 'package'
  // Match: export ... from 'package'
  const importRegex =
    /(?:import|export)\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g

  let match
  while ((match = importRegex.exec(source)) !== null) {
    const specifier = match[1]
    // Only resolve bare specifiers (not relative or absolute paths)
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      imports.push(specifier)
    }
  }

  return [...new Set(imports)] // Dedupe
}

/**
 * Parse a package specifier into name and subpath
 *
 * Examples:
 *   'lodash' -> { name: 'lodash', subpath: '' }
 *   'lodash/debounce' -> { name: 'lodash', subpath: '/debounce' }
 *   '@scope/pkg' -> { name: '@scope/pkg', subpath: '' }
 *   '@scope/pkg/util' -> { name: '@scope/pkg', subpath: '/util' }
 */
function parseSpecifier(specifier: string): { name: string; subpath: string } {
  if (specifier.startsWith('@')) {
    // Scoped package: @scope/name or @scope/name/path
    const parts = specifier.split('/')
    const name = `${parts[0]}/${parts[1]}`
    const subpath = parts.slice(2).join('/')
    return { name, subpath: subpath ? `/${subpath}` : '' }
  } else {
    // Regular package: name or name/path
    const slashIndex = specifier.indexOf('/')
    if (slashIndex === -1) {
      return { name: specifier, subpath: '' }
    }
    return {
      name: specifier.slice(0, slashIndex),
      subpath: specifier.slice(slashIndex),
    }
  }
}

/**
 * Get CDN URL for a package specifier
 */
export function getCDNUrl(specifier: string): string {
  const { name, subpath } = parseSpecifier(specifier)

  // Check for pinned version
  const version = PINNED_VERSIONS[name]
  const versionSuffix = version ? `@${version}` : ''

  return `${CDN_BASE}/${name}${versionSuffix}${subpath}`
}

/**
 * Generate an import map for the browser
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap
 */
export function generateImportMap(specifiers: string[]): {
  imports: Record<string, string>
} {
  const imports: Record<string, string> = {}

  for (const specifier of specifiers) {
    imports[specifier] = getCDNUrl(specifier)
  }

  return { imports }
}

/**
 * Fetch and cache a module, returning its resolved URL
 */
export async function resolveModule(specifier: string): Promise<string> {
  // Check cache first
  if (moduleCache.has(specifier)) {
    return moduleCache.get(specifier)!
  }

  const url = getCDNUrl(specifier)

  // Verify the module exists by making a HEAD request
  try {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) {
      throw new Error(`Module not found: ${specifier} (${response.status})`)
    }

    // Cache the resolved URL
    moduleCache.set(specifier, url)
    return url
  } catch (error: any) {
    throw new Error(`Failed to resolve module '${specifier}': ${error.message}`)
  }
}

/**
 * Resolve all imports in source code and return import map
 */
export async function resolveImports(source: string): Promise<{
  importMap: { imports: Record<string, string> }
  errors: string[]
}> {
  const specifiers = extractImports(source)
  const errors: string[] = []
  const imports: Record<string, string> = {}

  await Promise.all(
    specifiers.map(async (specifier) => {
      try {
        imports[specifier] = await resolveModule(specifier)
      } catch (error: any) {
        errors.push(error.message)
      }
    })
  )

  return { importMap: { imports }, errors }
}

/**
 * Generate HTML script tag with import map
 */
export function generateImportMapScript(importMap: {
  imports: Record<string, string>
}): string {
  return `<script type="importmap">
${JSON.stringify(importMap, null, 2)}
</script>`
}

/**
 * Transform source code to use module script
 */
export function wrapAsModule(code: string): string {
  return `<script type="module">
${code}
</script>`
}

/**
 * Clear the in-memory module cache
 */
export function clearModuleCache(): void {
  moduleCache.clear()
}

/**
 * Get in-memory cache statistics
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: moduleCache.size,
    entries: [...moduleCache.keys()],
  }
}

// Service Worker integration for persistent caching

let swRegistration: ServiceWorkerRegistration | null = null

/**
 * Register the module cache service worker
 */
export async function registerServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported')
    return false
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/module-sw.js', {
      scope: '/',
    })
    console.log('Module cache SW registered')
    return true
  } catch (error) {
    console.error('SW registration failed:', error)
    return false
  }
}

/**
 * Send message to service worker and wait for response
 */
function sendSWMessage<T>(type: string, payload?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker.controller) {
      reject(new Error('No active service worker'))
      return
    }

    const channel = new MessageChannel()
    channel.port1.onmessage = (event) => resolve(event.data)

    navigator.serviceWorker.controller.postMessage({ type, payload }, [
      channel.port2,
    ])

    // Timeout after 5 seconds
    setTimeout(() => reject(new Error('SW message timeout')), 5000)
  })
}

/**
 * Clear the service worker cache
 */
export async function clearSWCache(): Promise<boolean> {
  try {
    const result = await sendSWMessage<{ success: boolean }>('CLEAR_CACHE')
    return result.success
  } catch {
    return false
  }
}

/**
 * Get service worker cache statistics
 */
export async function getSWCacheStats(): Promise<{
  size: number
  entries: string[]
} | null> {
  try {
    return await sendSWMessage('GET_CACHE_STATS')
  } catch {
    return null
  }
}

/**
 * Prefetch modules into service worker cache
 */
export async function prefetchModules(
  specifiers: string[]
): Promise<{ success: number; failed: number }> {
  const urls = specifiers.map(getCDNUrl)
  try {
    return await sendSWMessage('PREFETCH', { urls })
  } catch {
    return { success: 0, failed: specifiers.length }
  }
}
