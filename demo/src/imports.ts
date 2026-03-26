/**
 * Playground Import Resolver — TFS Edition
 *
 * Resolves bare import specifiers to /tfs/ URLs.
 * The TFS service worker handles CDN resolution and caching.
 *
 * Flow:
 *   import { x } from 'tosijs@1.3.11'
 *   → import map: { "tosijs@1.3.11": "/tfs/tosijs@1.3.11" }
 *   → service worker intercepts /tfs/tosijs@1.3.11
 *   → fetches from jsdelivr CDN, caches, returns ESM
 */

/**
 * Extract bare import specifiers from source code.
 * Skips relative (./) and absolute (/) paths.
 */
export function extractImports(source: string): string[] {
  const imports: string[] = []

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

  return [...new Set(imports)]
}

/**
 * Generate an import map that routes bare specifiers to /tfs/ URLs.
 * The TFS service worker handles actual resolution and caching.
 */
export function generateImportMap(specifiers: string[]): {
  imports: Record<string, string>
} {
  const imports: Record<string, string> = {}

  for (const specifier of specifiers) {
    // Already a /tfs/ URL or relative path — skip
    if (specifier.startsWith('/') || specifier.startsWith('.')) continue
    imports[specifier] = `/tfs/${specifier}`
  }

  return { imports }
}

/**
 * Resolve all imports in source code — returns import map for iframe.
 * Local modules (from module store) are resolved first, remainder go to /tfs/.
 */
export async function resolveImports(source: string): Promise<{
  importMap: { imports: Record<string, string> }
  errors: string[]
  localModules: string[]
}> {
  const specifiers = extractImports(source)
  const errors: string[] = []
  const imports: Record<string, string> = {}
  const localModules: string[] = []

  // Lazy import to avoid circular deps
  const { resolveLocalImports } = await import('./module-store')

  // First, resolve local modules (saved in playground)
  try {
    const localImports = await resolveLocalImports(specifiers)
    Object.assign(imports, localImports)
    localModules.push(...Object.keys(localImports))
  } catch (error: any) {
    errors.push(error.message)
  }

  // Route remaining to TFS service worker
  const remaining = specifiers.filter((s) => !localModules.includes(s))
  for (const specifier of remaining) {
    imports[specifier] = `/tfs/${specifier}`
  }

  return { importMap: { imports }, errors, localModules }
}

/**
 * Register the TFS service worker.
 * Call this early in app startup.
 */
export async function registerTFS(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported — TFS unavailable')
    return false
  }

  try {
    const reg = await navigator.serviceWorker.register('/tfs-worker.js', {
      scope: '/',
    })
    console.log('TFS service worker registered (scope:', reg.scope + ')')

    // If no controller yet (first load), wait for it
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () =>
          resolve()
        )
      })
    }

    return true
  } catch (error) {
    console.error('TFS registration failed:', error)
    return false
  }
}
