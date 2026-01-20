/**
 * Unified Module Store for Playground Examples
 *
 * Stores user-created modules (both AJS and TJS) in IndexedDB.
 * Modules can be imported by name from other modules.
 *
 * @example
 * ```typescript
 * const store = await ModuleStore.open()
 *
 * // Save a TJS module
 * await store.save({
 *   name: 'utils',
 *   type: 'tjs',
 *   code: 'export function add(a: 0, b: 0) { return a + b }',
 *   description: 'Math utilities'
 * })
 *
 * // Import it from another module
 * // import { add } from 'utils'
 *
 * // Get transpiled code for import resolution
 * const compiled = await store.getCompiled('utils')
 * ```
 */

import {
  transpileToJS,
  extractTests,
  testUtils,
  type TJSTranspileResult,
} from '../../src/lang'

// ============================================================================
// Validation Result
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: string[]
  testResults?: TestResult[]
}

export interface ValidationError {
  type: 'transpile' | 'test' | 'syntax'
  message: string
  line?: number
  column?: number
}

export interface TestResult {
  name: string
  passed: boolean
  error?: string
}

// ============================================================================
// Types
// ============================================================================

export type ModuleType = 'tjs' | 'ajs'

export interface StoredModule {
  /** Unique module name (used for imports) */
  name: string
  /** Module type */
  type: ModuleType
  /** Source code */
  code: string
  /** Optional description */
  description?: string
  /** When created */
  created: number
  /** When last modified */
  modified: number
  /** Version number (increments on save) */
  version: number
  /** Cached transpilation result (for TJS) */
  compiled?: {
    code: string
    version: number
  }
}

export interface ModuleStoreStats {
  total: number
  tjs: number
  ajs: number
  bytes: number
}

// ============================================================================
// IndexedDB Setup
// ============================================================================

const DB_NAME = 'tjs-modules'
const DB_VERSION = 1
const STORE_NAME = 'modules'

// ============================================================================
// ModuleStore Class
// ============================================================================

export class ModuleStore {
  private db: IDBDatabase | null = null
  private static instance: ModuleStore | null = null

  private constructor() {}

  /**
   * Get singleton instance
   */
  static async open(): Promise<ModuleStore> {
    if (ModuleStore.instance?.db) {
      return ModuleStore.instance
    }

    const store = new ModuleStore()
    await store._open()
    ModuleStore.instance = store
    return store
  }

  private async _open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'name' })
          store.createIndex('type', 'type')
          store.createIndex('modified', 'modified')
        }
      }
    })
  }

  /**
   * Validate a module before saving
   * Checks transpilation and runs inline tests
   */
  async validate(code: string, type: ModuleType): Promise<ValidationResult> {
    const errors: ValidationError[] = []
    const warnings: string[] = []
    let testResults: TestResult[] | undefined

    if (type === 'tjs') {
      // Step 1: Try to transpile
      let transpileResult: TJSTranspileResult
      try {
        transpileResult = transpileToJS(code)
        if (transpileResult.warnings) {
          warnings.push(...transpileResult.warnings)
        }
      } catch (e: any) {
        errors.push({
          type: 'transpile',
          message: e.message,
          line: e.line,
          column: e.column,
        })
        return { valid: false, errors, warnings }
      }

      // Step 2: Extract and run tests
      const testExtraction = extractTests(code)
      if (testExtraction.tests.length > 0) {
        try {
          testResults = await this.runTests(
            transpileResult.code,
            testExtraction.testRunner
          )

          // Check for failed tests
          const failed = testResults.filter((t) => !t.passed)
          if (failed.length > 0) {
            for (const f of failed) {
              errors.push({
                type: 'test',
                message: `Test "${f.name}" failed: ${f.error}`,
              })
            }
          }
        } catch (e: any) {
          errors.push({
            type: 'test',
            message: `Test execution error: ${e.message}`,
          })
        }
      }
    }

    // AJS validation could be added here (parse with ajs())

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      testResults,
    }
  }

  /**
   * Run tests in an isolated context
   */
  private async runTests(
    moduleCode: string,
    testRunnerCode: string
  ): Promise<TestResult[]> {
    // Create isolated execution context
    const fullCode = `
      ${testUtils}
      ${moduleCode}
      ${testRunnerCode}
    `

    try {
      // Run in async function to handle await in tests
      const runTests = new Function(`
        return (async () => {
          ${fullCode}
        })()
      `)

      const result = await runTests()

      if (result?.results) {
        return result.results.map((r: any) => ({
          name: r.description,
          passed: r.passed,
          error: r.error,
        }))
      }

      return []
    } catch (e: any) {
      throw new Error(`Test execution failed: ${e.message}`)
    }
  }

  /**
   * Save a module (create or update)
   * Validates the module first - fails if transpilation or tests fail
   */
  async save(
    module: Omit<StoredModule, 'created' | 'modified' | 'version' | 'compiled'>,
    options: { skipValidation?: boolean } = {}
  ): Promise<StoredModule> {
    if (!this.db) throw new Error('Store not open')

    // Validate first (unless skipped)
    if (!options.skipValidation) {
      const validation = await this.validate(module.code, module.type)
      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) => e.message).join('\n')
        throw new Error(`Module validation failed:\n${errorMessages}`)
      }
    }

    // Check for existing
    const existing = await this.get(module.name)

    const now = Date.now()
    const entry: StoredModule = {
      ...module,
      created: existing?.created ?? now,
      modified: now,
      version: (existing?.version ?? 0) + 1,
    }

    // Pre-compile TJS modules (we know it succeeds because validation passed)
    if (module.type === 'tjs') {
      try {
        const result = transpileToJS(module.code)
        entry.compiled = {
          code: result.code,
          version: entry.version,
        }
      } catch (e) {
        // Should not happen if validation passed, but handle anyway
        console.warn(`Compilation warning for ${module.name}:`, e)
      }
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(entry)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(entry)
    })
  }

  /**
   * Save without validation (use with caution)
   */
  async saveUnsafe(
    module: Omit<StoredModule, 'created' | 'modified' | 'version' | 'compiled'>
  ): Promise<StoredModule> {
    return this.save(module, { skipValidation: true })
  }

  /**
   * Get a module by name
   */
  async get(name: string): Promise<StoredModule | undefined> {
    if (!this.db) throw new Error('Store not open')

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(name)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  /**
   * Get compiled code for a TJS module (for import resolution)
   */
  async getCompiled(name: string): Promise<string | undefined> {
    const module = await this.get(name)
    if (!module) return undefined

    if (module.type === 'ajs') {
      // AJS modules export their transpiled AST
      return `export default ${JSON.stringify(module.code)}`
    }

    // Return cached compiled code, or compile on demand
    if (module.compiled?.version === module.version) {
      return module.compiled.code
    }

    // Recompile if needed
    try {
      const result = transpileToJS(module.code)
      // Update cache
      await this.save(module)
      return result.code
    } catch (e: any) {
      throw new Error(`Failed to compile module '${name}': ${e.message}`)
    }
  }

  /**
   * Delete a module
   */
  async delete(name: string): Promise<void> {
    if (!this.db) throw new Error('Store not open')

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(name)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * List all modules
   */
  async list(type?: ModuleType): Promise<StoredModule[]> {
    if (!this.db) throw new Error('Store not open')

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)

      let request: IDBRequest
      if (type) {
        const index = store.index('type')
        request = index.getAll(type)
      } else {
        request = store.getAll()
      }

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const modules = request.result as StoredModule[]
        // Sort by modified desc
        modules.sort((a, b) => b.modified - a.modified)
        resolve(modules)
      }
    })
  }

  /**
   * Check if a module exists
   */
  async exists(name: string): Promise<boolean> {
    const module = await this.get(name)
    return module !== undefined
  }

  /**
   * Rename a module
   */
  async rename(
    oldName: string,
    newName: string
  ): Promise<StoredModule | undefined> {
    const module = await this.get(oldName)
    if (!module) return undefined

    // Check new name isn't taken
    if (await this.exists(newName)) {
      throw new Error(`Module '${newName}' already exists`)
    }

    // Delete old, create new
    await this.delete(oldName)
    return this.save({ ...module, name: newName })
  }

  /**
   * Get store statistics
   */
  async getStats(): Promise<ModuleStoreStats> {
    const modules = await this.list()

    let bytes = 0
    let tjs = 0
    let ajs = 0

    for (const m of modules) {
      bytes += m.code.length * 2 // UTF-16
      if (m.compiled) bytes += m.compiled.code.length * 2
      if (m.type === 'tjs') tjs++
      else ajs++
    }

    return { total: modules.length, tjs, ajs, bytes }
  }

  /**
   * Clear all modules
   */
  async clear(): Promise<void> {
    if (!this.db) throw new Error('Store not open')

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.clear()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Export all modules as JSON
   */
  async export(): Promise<string> {
    const modules = await this.list()
    return JSON.stringify(modules, null, 2)
  }

  /**
   * Import modules from JSON
   */
  async import(json: string, overwrite = false): Promise<number> {
    const modules = JSON.parse(json) as StoredModule[]
    let imported = 0

    for (const m of modules) {
      if (!overwrite && (await this.exists(m.name))) {
        continue
      }
      await this.save({
        name: m.name,
        type: m.type,
        code: m.code,
        description: m.description,
      })
      imported++
    }

    return imported
  }

  /**
   * Get module names for import resolution
   */
  async getModuleNames(): Promise<string[]> {
    const modules = await this.list()
    return modules.map((m) => m.name)
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      ModuleStore.instance = null
    }
  }
}

// ============================================================================
// Import Resolution
// ============================================================================

/**
 * Check if an import specifier refers to a local module
 */
export async function isLocalModule(specifier: string): Promise<boolean> {
  // Local modules are bare specifiers that exist in the store
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.includes('://')
  ) {
    return false
  }

  const store = await ModuleStore.open()
  return store.exists(specifier)
}

/**
 * Resolve local module imports in source code
 * Returns a blob URL that can be used in import map
 */
export async function resolveLocalModule(name: string): Promise<string> {
  const store = await ModuleStore.open()
  const code = await store.getCompiled(name)

  if (!code) {
    throw new Error(`Local module '${name}' not found`)
  }

  // Create a blob URL for the compiled code
  const blob = new Blob([code], { type: 'application/javascript' })
  return URL.createObjectURL(blob)
}

/**
 * Build import map entries for all local modules referenced in source
 */
export async function resolveLocalImports(
  specifiers: string[]
): Promise<Record<string, string>> {
  const imports: Record<string, string> = {}
  const store = await ModuleStore.open()
  const localNames = await store.getModuleNames()

  for (const spec of specifiers) {
    if (localNames.includes(spec)) {
      imports[spec] = await resolveLocalModule(spec)
    }
  }

  return imports
}

// ============================================================================
// Migration from localStorage
// ============================================================================

/**
 * Migrate existing localStorage examples to IndexedDB
 */
export async function migrateFromLocalStorage(): Promise<number> {
  const store = await ModuleStore.open()
  let migrated = 0

  // Migrate AJS examples
  const ajsKey = 'agent-playground-examples'
  const ajsStored = localStorage.getItem(ajsKey)
  if (ajsStored) {
    try {
      const examples = JSON.parse(ajsStored) as Array<{
        name: string
        code: string
        description?: string
      }>
      for (const ex of examples) {
        if (!(await store.exists(ex.name))) {
          await store.save({
            name: ex.name,
            type: 'ajs',
            code: ex.code,
            description: ex.description,
          })
          migrated++
        }
      }
      // Don't delete localStorage yet - keep as backup
      // localStorage.removeItem(ajsKey)
    } catch (e) {
      console.warn('Failed to migrate AJS examples:', e)
    }
  }

  // TJS playground didn't have localStorage persistence, so nothing to migrate

  return migrated
}
