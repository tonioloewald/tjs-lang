/**
 * Playground Import Resolver
 *
 * Resolves and fetches external modules for the TJS playground.
 * Uses cdn.jsdelivr.net for npm packages.
 *
 * Features:
 * - Detects import statements in code
 * - Fetches modules from jsdelivr with pinned versions
 * - Caches fetched modules in memory
 * - Returns import map for browser
 */

// CDN base URL - jsdelivr serves npm packages with proper ESM support
const CDN_BASE = 'https://cdn.jsdelivr.net/npm'

// In-memory cache for fetched module URLs
const moduleCache = new Map<string, string>()

// Common packages with pinned versions and ESM paths
// Packages with proper "exports" or "module" fields in package.json
// may work without explicit paths, but it's safer to specify them
interface PinnedPackage {
  version: string
  path?: string
  cdn?: string
  // Transitive deps to include in the import map when this package is imported
  deps?: string[]
}

const PINNED_PACKAGES: Record<string, PinnedPackage> = {
  // tjs-lang itself (used by demos like Universal Endpoint)
  'tjs-lang': {
    version: '0.5.4',
    cdn: 'https://cdn.jsdelivr.net/npm/tjs-lang@0.5.4/dist/index.js',
  },

  // tosijs ecosystem
  tosijs: { version: '1.2.0', path: '/dist/module.js' },
  'tosijs-ui': {
    version: '1.2.0',
    path: '/dist/index.js',
    deps: ['tosijs', 'marked'],
  },

  // Utilities - lodash-es is native ESM
  'lodash-es': { version: '4.17.21' },
  'date-fns': { version: '3.6.0' }, // v3+ is native ESM

  // Validation
  zod: { version: '3.23.8', path: '/lib/index.mjs' },

  // Markdown
  marked: { version: '9.1.6', path: '/lib/marked.esm.js' },

  // UI frameworks - these have proper ESM exports
  preact: { version: '10.19.0', path: '/dist/preact.module.js' },
  'preact/hooks': { version: '10.19.0', path: '/hooks/dist/hooks.module.js' },

  // React - use cdn.jsdelivr.net with +esm for proper ESM conversion
  react: {
    version: '18.2.0',
    cdn: 'https://cdn.jsdelivr.net/npm/react@18.2.0/+esm',
  },
  'react-dom': {
    version: '18.2.0',
    cdn: 'https://cdn.jsdelivr.net/npm/react-dom@18.2.0/+esm',
    deps: ['react'],
  },
  'react-dom/client': {
    version: '18.2.0',
    cdn: 'https://cdn.jsdelivr.net/npm/react-dom@18.2.0/client/+esm',
    deps: ['react', 'react-dom'],
  },
}

/**
 * Expand a list of specifiers to include transitive deps from PINNED_PACKAGES.
 * Walks the deps graph to collect all needed packages.
 */
function expandWithDeps(specifiers: string[]): string[] {
  const all = new Set(specifiers)
  const queue = [...specifiers]
  while (queue.length > 0) {
    const spec = queue.pop()!
    const { name } = parseSpecifier(spec)
    const pinned = PINNED_PACKAGES[spec] || PINNED_PACKAGES[name]
    if (pinned?.deps) {
      for (const dep of pinned.deps) {
        if (!all.has(dep)) {
          all.add(dep)
          queue.push(dep)
        }
      }
    }
  }
  return [...all]
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

  // Check for exact specifier match first (e.g., 'react-dom/client')
  const exactPinned = PINNED_PACKAGES[specifier]
  if (exactPinned?.cdn) {
    return exactPinned.cdn
  }

  // Check for pinned package config
  const pinned = PINNED_PACKAGES[name]

  if (pinned) {
    // If package has custom CDN URL, use it
    if (pinned.cdn) {
      return subpath ? `${pinned.cdn}${subpath}` : pinned.cdn
    }
    // If subpath provided in specifier, use that; otherwise use pinned path
    const path = subpath || pinned.path || ''
    return `${CDN_BASE}/${name}@${pinned.version}${path}`
  }

  // For unknown packages, try jsdelivr's default resolution
  return `${CDN_BASE}/${name}${subpath}`
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

  for (const specifier of expandWithDeps(specifiers)) {
    imports[specifier] = getCDNUrl(specifier)
  }

  return { imports }
}

// Cache for package.json data
const packageJsonCache = new Map<string, any>()

/**
 * Fetch and cache package.json for a package
 */
async function getPackageJson(name: string, version?: string): Promise<any> {
  const cacheKey = version ? `${name}@${version}` : name

  if (packageJsonCache.has(cacheKey)) {
    return packageJsonCache.get(cacheKey)
  }

  const url = `${CDN_BASE}/${cacheKey}/package.json`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Package not found: ${cacheKey}`)
  }

  const pkg = await response.json()
  packageJsonCache.set(cacheKey, pkg)
  return pkg
}

/**
 * Resolve the ESM entry point from package.json
 * Checks exports, module, and main fields in order of preference
 */
function resolveEntryPoint(pkg: any): string | null {
  // Check exports field first (modern packages)
  if (pkg.exports) {
    // Handle string exports
    if (typeof pkg.exports === 'string') {
      return pkg.exports
    }

    // Handle exports object - look for ESM entry
    const exp = pkg.exports['.'] ?? pkg.exports
    if (typeof exp === 'string') {
      return exp
    }
    if (exp?.import) {
      return typeof exp.import === 'string' ? exp.import : exp.import?.default
    }
    if (exp?.module) {
      return exp.module
    }
    if (exp?.default) {
      return typeof exp.default === 'string' ? exp.default : null
    }
  }

  // Check module field (ES modules)
  if (pkg.module) {
    return pkg.module
  }

  // Check main field (may be CJS, but worth trying)
  if (pkg.main) {
    return pkg.main
  }

  return null
}

/**
 * Fetch and cache a module, returning its resolved URL
 * Uses package.json to find the correct ESM entry point
 */
export async function resolveModule(specifier: string): Promise<string> {
  // Check cache first
  if (moduleCache.has(specifier)) {
    return moduleCache.get(specifier)!
  }

  // Check for exact specifier match first (e.g., 'react-dom/client')
  const exactPinned = PINNED_PACKAGES[specifier]
  if (exactPinned?.cdn) {
    moduleCache.set(specifier, exactPinned.cdn)
    return exactPinned.cdn
  }

  const { name, subpath } = parseSpecifier(specifier)
  const pinned = PINNED_PACKAGES[name]
  const version = pinned?.version

  // If package has custom CDN URL, use it
  if (pinned?.cdn) {
    const url = subpath ? `${pinned.cdn}${subpath}` : pinned.cdn
    moduleCache.set(specifier, url)
    return url
  }

  // If there's a subpath in the specifier, use it directly
  if (subpath) {
    const url = `${CDN_BASE}/${name}${version ? `@${version}` : ''}${subpath}`
    moduleCache.set(specifier, url)
    return url
  }

  // If we have a pinned path, use it directly (skip package.json lookup)
  if (pinned?.path) {
    const url = `${CDN_BASE}/${name}@${version}${pinned.path}`
    moduleCache.set(specifier, url)
    return url
  }

  // Fetch package.json and resolve the entry point
  const pkg = await getPackageJson(name, version)
  const entryPoint = resolveEntryPoint(pkg)

  if (!entryPoint) {
    throw new Error(`No ESM entry point found in package.json for ${name}`)
  }

  // Normalize path (ensure it starts with /)
  const path = entryPoint.startsWith('./')
    ? entryPoint.slice(1)
    : entryPoint.startsWith('/')
    ? entryPoint
    : `/${entryPoint}`

  const url = `${CDN_BASE}/${name}${version ? `@${version}` : ''}${path}`
  moduleCache.set(specifier, url)
  return url
}

/**
 * Resolve all imports in source code and return import map
 * Checks local module store first, then falls back to CDN
 */
export async function resolveImports(source: string): Promise<{
  importMap: { imports: Record<string, string> }
  errors: string[]
  localModules: string[]
}> {
  const specifiers = expandWithDeps(extractImports(source))
  const errors: string[] = []
  const imports: Record<string, string> = {}
  const localModules: string[] = []

  // Lazy import to avoid circular deps
  const { resolveLocalImports } = await import('./module-store')

  // First, resolve local modules
  try {
    const localImports = await resolveLocalImports(specifiers)
    Object.assign(imports, localImports)
    localModules.push(...Object.keys(localImports))
  } catch (error: any) {
    errors.push(error.message)
  }

  // Then resolve remaining from CDN
  const remaining = specifiers.filter((s) => !localModules.includes(s))

  await Promise.all(
    remaining.map(async (specifier) => {
      try {
        imports[specifier] = await resolveModule(specifier)
      } catch (error: any) {
        errors.push(error.message)
      }
    })
  )

  return { importMap: { imports }, errors, localModules }
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
