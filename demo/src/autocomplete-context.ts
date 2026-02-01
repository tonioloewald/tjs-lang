/**
 * Autocomplete Context Builder
 *
 * Provides live bindings for autocomplete by:
 * 1. Resolving imports to actual module values
 * 2. Using naming heuristics for DOM element types
 *
 * This gives Chrome-like autocomplete behavior without needing
 * to execute the user's code.
 */

// Known modules that are available for import in the playground
// These are dynamically imported when needed
const KNOWN_MODULES: Record<string, () => Promise<any>> = {
  tosijs: () => import('tosijs'),
  'tosijs-ui': () => import('tosijs-ui'),
}

// Cache for loaded modules
const moduleCache: Record<string, any> = {}

/**
 * Result of building an autocomplete context
 */
export interface AutocompleteContext {
  /** Live bindings available for introspection */
  bindings: Record<string, any>
  /** Which imports were resolved */
  resolvedImports: string[]
  /** Any errors encountered */
  errors: string[]
}

/**
 * Load a module by name (cached)
 */
async function loadModule(name: string): Promise<any> {
  if (moduleCache[name]) {
    return moduleCache[name]
  }

  const loader = KNOWN_MODULES[name]
  if (loader) {
    try {
      const mod = await loader()
      moduleCache[name] = mod
      return mod
    } catch (e) {
      console.warn(`Failed to load module ${name}:`, e)
      return null
    }
  }

  return null
}

/**
 * Parse import statements and extract what's being imported
 */
function parseImports(source: string): Array<{
  module: string
  bindings: Array<{ imported: string; local: string }>
  isNamespace: boolean
  namespaceAlias?: string
}> {
  const imports: Array<{
    module: string
    bindings: Array<{ imported: string; local: string }>
    isNamespace: boolean
    namespaceAlias?: string
  }> = []

  // Match: import { a, b, c as d } from 'module'
  const namedPattern = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
  let match
  while ((match = namedPattern.exec(source)) !== null) {
    const bindingList = match[1].split(',').map((b) => {
      const parts = b.trim().split(/\s+as\s+/)
      return {
        imported: parts[0].trim(),
        local: (parts[1] || parts[0]).trim(),
      }
    })
    imports.push({
      module: match[2],
      bindings: bindingList,
      isNamespace: false,
    })
  }

  // Match: import * as name from 'module'
  const namespacePattern = /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g
  while ((match = namespacePattern.exec(source)) !== null) {
    imports.push({
      module: match[2],
      bindings: [],
      isNamespace: true,
      namespaceAlias: match[1],
    })
  }

  // Match: import name from 'module' (default import)
  // But skip if it's part of a destructuring import
  const defaultPattern = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g
  while ((match = defaultPattern.exec(source)) !== null) {
    // Skip if this is part of a named or namespace import
    const fullMatch = match[0]
    if (fullMatch.includes('{') || fullMatch.includes('*')) continue

    imports.push({
      module: match[2],
      bindings: [{ imported: 'default', local: match[1] }],
      isNamespace: false,
    })
  }

  return imports
}

/**
 * Resolve imports to live module bindings
 */
async function resolveImportBindings(source: string): Promise<{
  bindings: Record<string, any>
  resolved: string[]
  errors: string[]
}> {
  const bindings: Record<string, any> = {}
  const resolved: string[] = []
  const errors: string[] = []

  const imports = parseImports(source)

  for (const imp of imports) {
    const mod = await loadModule(imp.module)
    if (!mod) {
      errors.push(`Could not load module: ${imp.module}`)
      continue
    }

    resolved.push(imp.module)

    if (imp.isNamespace && imp.namespaceAlias) {
      // import * as name from 'module'
      bindings[imp.namespaceAlias] = mod
    } else {
      // Named or default imports
      for (const binding of imp.bindings) {
        if (binding.imported === 'default') {
          bindings[binding.local] = mod.default ?? mod
        } else if (binding.imported in mod) {
          bindings[binding.local] = mod[binding.imported]
        } else {
          errors.push(`${binding.imported} not found in ${imp.module}`)
        }
      }
    }
  }

  return { bindings, resolved, errors }
}

/**
 * Build an autocomplete context from source code
 *
 * This resolves imports to their actual runtime values, which can
 * then be introspected for property completion.
 *
 * @param source - Full source code
 * @returns Context with live bindings for introspection
 */
export async function buildAutocompleteContext(
  source: string
): Promise<AutocompleteContext> {
  const { bindings, resolved, errors } = await resolveImportBindings(source)

  return {
    bindings,
    resolvedImports: resolved,
    errors,
  }
}

/**
 * Get the value at a path in the bindings
 * Used for property access like `foo.bar.baz`
 */
export function evaluateExpression(
  expr: string,
  bindings: Record<string, any>
): any {
  try {
    const parts = expr.split('.')
    let value = bindings[parts[0]]

    for (let i = 1; i < parts.length && value != null; i++) {
      value = value[parts[i]]
    }

    return value
  } catch {
    return undefined
  }
}
