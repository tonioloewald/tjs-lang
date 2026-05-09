/**
 * Transpile-time module loader.
 *
 * Until now the transpiler has preserved import statements verbatim — runtime
 * resolvers (the bun plugin, the playground service worker, the browser ESM
 * loader) handle them on demand. That's the right default for regular JS
 * interop, but Phase 3 of the wasm-library plan needs *static* visibility into
 * imported sources: given `import { dot } from 'tjs-lang/linalg'`, we have to
 * read linalg's source at transpile time so cross-file `wasm function`
 * declarations can be composed into the consumer's wasm module.
 *
 * This loader is the foundation for that work. It's also useful as a building
 * block for any future cross-file static analysis (type flow, dead code, etc.)
 * — hence the name "module loader" rather than "wasm import resolver."
 *
 * Usage:
 *   const loader = new ModuleLoader({ baseDir: '/path/to/project' })
 *   const mod = loader.load('./math.tjs', '/path/to/project/app.tjs')
 *   if (mod) { console.log(mod.exports) }
 *
 * Resolution rules (in order):
 *   - URL specifiers (http://, https://, data:):   not loadable, returns null
 *   - Relative paths (./foo, ../bar):               resolved against importer's dir
 *   - Absolute paths (/foo/bar):                    used as-is
 *   - Bare specifiers (foo, foo/bar):               walk up importer looking for
 *                                                   node_modules/<spec>; also
 *                                                   try bareSpecifierRoots
 *
 * For each candidate, we try extensions in order: `.tjs`, `.ts`, `.js`.
 * (Index files: `<dir>/index.<ext>`.)
 *
 * The loader does NOT mutate transpiler behavior. It's an additive capability;
 * Phase 3 (cross-file wasm composition) is the first caller.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve as pathResolve, sep } from 'node:path'
import { parse as parseTjs } from './parser'

const SUPPORTED_EXTENSIONS = ['.tjs', '.ts', '.js']

/** Pluggable filesystem hook. Default uses node:fs. */
export interface FileSystem {
  /** Return source text for an absolute path, or null if it doesn't exist. */
  readFile(path: string): string | null
  /** Return true if the path exists and is a file. */
  exists(path: string): boolean
}

const defaultFileSystem: FileSystem = {
  readFile(path) {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  },
  exists(path) {
    try {
      return existsSync(path)
    } catch {
      return false
    }
  },
}

export interface ModuleLoaderOptions {
  /** Filesystem hook (default: node:fs based) */
  fs?: FileSystem
  /** Where to resolve bare specifiers from when no importer is given. */
  baseDir?: string
  /**
   * Extra roots tried for bare specifiers BEFORE the standard node_modules
   * walk. Useful for monorepos or tests that want to point at a virtual
   * package directory. Each root is treated as if it were a `node_modules/`.
   */
  bareSpecifierRoots?: string[]
  /** Cache size cap. 0 disables caching. (default 256) */
  cacheLimit?: number
}

/** A single import / re-export specifier extracted from the AST */
export interface ImportEntry {
  /** Original module specifier (e.g. './math.tjs', 'tjs-lang/linalg') */
  specifier: string
  /** Local name in the importing module */
  local: string
  /** Imported name in the source module ('default' for default imports) */
  imported: string
  /** True if this came from `import * as X` */
  namespace: boolean
}

/** A top-level export from a module */
export interface ExportEntry {
  /** Exported name (or 'default' for default exports) */
  name: string
  /** Kind of declaration being exported */
  kind: 'function' | 'class' | 'variable' | 're-export' | 'unknown'
  /** For re-exports, the source specifier */
  fromSpecifier?: string
}

export interface LoadedModule {
  /** Resolved absolute path */
  path: string
  /** Original source text */
  source: string
  /** AST + tjs preprocessing output (lazy — only computed once per module) */
  parseResult: ReturnType<typeof parseTjs>
  /** Imports declared by this module */
  imports: ImportEntry[]
  /** Top-level exports */
  exports: ExportEntry[]
}

export class ModuleLoader {
  private cache = new Map<string, LoadedModule>()
  private fs: FileSystem
  private baseDir: string
  private bareSpecifierRoots: string[]
  private cacheLimit: number

  constructor(options: ModuleLoaderOptions = {}) {
    this.fs = options.fs ?? defaultFileSystem
    this.baseDir = options.baseDir ?? process.cwd()
    this.bareSpecifierRoots = options.bareSpecifierRoots ?? []
    this.cacheLimit = options.cacheLimit ?? 256
  }

  /**
   * Resolve a specifier to an absolute path. Returns null when the specifier
   * is not loadable as a local TJS/TS/JS file (URLs, missing files, unknown
   * bare specifiers all return null — the caller falls back to verbatim
   * import preservation).
   */
  resolve(specifier: string, importerPath?: string): string | null {
    // Reject URL-style and data: specifiers — runtime resolvers handle these
    if (
      specifier.startsWith('http://') ||
      specifier.startsWith('https://') ||
      specifier.startsWith('data:') ||
      specifier.startsWith('file://')
    ) {
      return null
    }

    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return this.tryExtensions(
        pathResolve(
          importerPath ? dirname(importerPath) : this.baseDir,
          specifier
        )
      )
    }

    if (isAbsolute(specifier)) {
      return this.tryExtensions(specifier)
    }

    return this.resolveBare(specifier, importerPath)
  }

  /**
   * Load a module by specifier. Returns null if not resolvable (caller treats
   * this as "leave the import statement alone").
   *
   * Repeated calls with the same specifier+importer combination hit the cache.
   */
  load(specifier: string, importerPath?: string): LoadedModule | null {
    const path = this.resolve(specifier, importerPath)
    if (!path) return null

    const cached = this.cache.get(path)
    if (cached) return cached

    const source = this.fs.readFile(path)
    if (source === null) return null

    let parseResult: ReturnType<typeof parseTjs>
    try {
      parseResult = parseTjs(source, { filename: path })
    } catch {
      // Parse failure: don't cache, don't claim to have loaded it.
      // Caller falls back to verbatim import preservation.
      return null
    }

    const imports = collectImports(parseResult.ast)
    const exports = collectExports(parseResult.ast)

    const loaded: LoadedModule = {
      path,
      source,
      parseResult,
      imports,
      exports,
    }

    if (this.cacheLimit > 0) {
      // Naive eviction: drop the first inserted entry when over the limit.
      // Modules are small and the cache is short-lived per transpile session.
      if (this.cache.size >= this.cacheLimit) {
        const firstKey = this.cache.keys().next().value
        if (firstKey !== undefined) this.cache.delete(firstKey)
      }
      this.cache.set(path, loaded)
    }

    return loaded
  }

  /** Drop all cached modules. */
  clearCache(): void {
    this.cache.clear()
  }

  /** Try each supported extension; return the first existing path or null. */
  private tryExtensions(basePath: string): string | null {
    // If the path already has one of our extensions, try it directly first.
    if (SUPPORTED_EXTENSIONS.some((ext) => basePath.endsWith(ext))) {
      return this.fs.exists(basePath) ? basePath : null
    }
    for (const ext of SUPPORTED_EXTENSIONS) {
      const withExt = basePath + ext
      if (this.fs.exists(withExt)) return withExt
    }
    // Try as directory (look for index.<ext>)
    for (const ext of SUPPORTED_EXTENSIONS) {
      const indexPath = pathResolve(basePath, 'index' + ext)
      if (this.fs.exists(indexPath)) return indexPath
    }
    return null
  }

  /**
   * Resolve a bare specifier (e.g. `tjs-lang/linalg`, `lodash`) by walking
   * up the importer's directory tree looking for `node_modules/<spec>`.
   * Also checks each configured `bareSpecifierRoots` entry first.
   */
  private resolveBare(specifier: string, importerPath?: string): string | null {
    // Try configured roots first (test fixtures, monorepo packages, etc.)
    for (const root of this.bareSpecifierRoots) {
      const candidate = this.tryExtensions(pathResolve(root, specifier))
      if (candidate) return candidate
    }

    // Walk up from the importer (or baseDir) looking for node_modules
    let dir = importerPath ? dirname(importerPath) : this.baseDir
    // Ensure absolute to avoid an infinite loop on relative inputs
    dir = pathResolve(dir)
    while (true) {
      const nodeModulesCandidate = this.tryExtensions(
        pathResolve(dir, 'node_modules', specifier)
      )
      if (nodeModulesCandidate) return nodeModulesCandidate

      // Also try resolving via package.json's "main" or "exports" — for now,
      // we're conservative: the standard tjs library layout uses a
      // `src/index.tjs` entry point, which tryExtensions will find via the
      // "directory with index.<ext>" branch above. Full package.json
      // exports-field resolution can come later if needed.

      const parent = dirname(dir)
      if (parent === dir) break // hit filesystem root
      dir = parent
    }

    return null
  }
}

// ============================================================================
// AST inspection helpers
// ============================================================================

/**
 * Extract import declarations from a Program AST.
 * Acorn types: `ImportDeclaration` with `specifiers` (array of
 * ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier).
 */
function collectImports(ast: any): ImportEntry[] {
  const imports: ImportEntry[] = []
  if (!ast || !Array.isArray(ast.body)) return imports

  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration') continue
    const specifier = node.source?.value
    if (typeof specifier !== 'string') continue

    for (const spec of node.specifiers ?? []) {
      const local = spec.local?.name
      if (typeof local !== 'string') continue

      switch (spec.type) {
        case 'ImportSpecifier':
          imports.push({
            specifier,
            local,
            imported: spec.imported?.name ?? local,
            namespace: false,
          })
          break
        case 'ImportDefaultSpecifier':
          imports.push({
            specifier,
            local,
            imported: 'default',
            namespace: false,
          })
          break
        case 'ImportNamespaceSpecifier':
          imports.push({
            specifier,
            local,
            imported: '*',
            namespace: true,
          })
          break
      }
    }
  }

  return imports
}

/**
 * Extract top-level exports from a Program AST.
 *
 * Covers:
 *   - `export function foo() {}`
 *   - `export class Foo {}`
 *   - `export const x = ...`, `export let`, `export var`
 *   - `export { a, b as c }`
 *   - `export { a } from './other'`
 *   - `export * from './other'`
 *   - `export default ...`
 *
 * Does NOT yet recognize `wasm function` — Phase 1 will introduce that
 * declaration kind and a follow-up will surface it here as kind: 'wasm-function'.
 */
function collectExports(ast: any): ExportEntry[] {
  const exports: ExportEntry[] = []
  if (!ast || !Array.isArray(ast.body)) return exports

  for (const node of ast.body) {
    if (node.type === 'ExportNamedDeclaration') {
      // export function foo() {} | export class Foo {} | export const x = ...
      if (node.declaration) {
        const decl = node.declaration
        if (decl.type === 'FunctionDeclaration' && decl.id?.name) {
          exports.push({ name: decl.id.name, kind: 'function' })
        } else if (decl.type === 'ClassDeclaration' && decl.id?.name) {
          exports.push({ name: decl.id.name, kind: 'class' })
        } else if (decl.type === 'VariableDeclaration') {
          for (const v of decl.declarations) {
            if (v.id?.type === 'Identifier' && v.id.name) {
              exports.push({ name: v.id.name, kind: 'variable' })
            }
          }
        }
      }
      // export { a, b as c } [from './other']
      if (Array.isArray(node.specifiers)) {
        for (const spec of node.specifiers) {
          const exportedName = spec.exported?.name
          if (typeof exportedName !== 'string') continue
          exports.push({
            name: exportedName,
            kind: node.source ? 're-export' : 'unknown',
            fromSpecifier: node.source?.value,
          })
        }
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration
      const kind: ExportEntry['kind'] =
        decl?.type === 'FunctionDeclaration' ||
        decl?.type === 'FunctionExpression' ||
        decl?.type === 'ArrowFunctionExpression'
          ? 'function'
          : decl?.type === 'ClassDeclaration' ||
              decl?.type === 'ClassExpression'
            ? 'class'
            : 'unknown'
      exports.push({ name: 'default', kind })
    } else if (node.type === 'ExportAllDeclaration') {
      // export * from './other'
      const fromSpecifier = node.source?.value
      if (typeof fromSpecifier === 'string') {
        exports.push({
          name: '*',
          kind: 're-export',
          fromSpecifier,
        })
      }
    }
  }

  return exports
}

/**
 * Helper for tests / advanced use: build a FileSystem from a plain
 * `Map<string, string>`. Keys must be absolute paths.
 */
export function inMemoryFileSystem(
  files: Map<string, string> | Record<string, string>
): FileSystem {
  const map =
    files instanceof Map ? files : new Map(Object.entries(files))
  // Normalize separators so path.resolve()'s output matches map keys
  const normalize = (p: string) => p.split('/').join(sep)
  const lookup = (p: string) => map.get(p) ?? map.get(normalize(p)) ?? null
  return {
    readFile: (p) => lookup(p),
    exists: (p) => lookup(p) !== null,
  }
}
