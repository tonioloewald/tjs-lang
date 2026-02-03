/**
 * IndexedDB-based cache for module metadata
 *
 * Caches transpilation results (AST, signatures, type info) to avoid
 * re-parsing unchanged source code. Particularly useful for:
 * - Playground editors (instant feedback on unchanged code)
 * - Autocomplete metadata retrieval
 * - Development workflows with rapid iteration
 *
 * @example
 * ```typescript
 * const cache = new MetadataCache()
 * await cache.open()
 *
 * // Check cache before transpiling
 * const cached = await cache.get(source)
 * if (cached) {
 *   return cached  // Skip transpilation
 * }
 *
 * // Transpile and cache
 * const result = transpile(source)
 * await cache.set(source, result)
 * ```
 */

import type { SeqNode } from '../builder'
import type { FunctionSignature, TranspileWarning } from './types'
import type { TJSTypeInfo } from './emitters/js'
import { TJS_VERSION } from './runtime'

// ============================================================================
// Types
// ============================================================================

/** Cached entry for AsyncJS transpilation (ajs/transpile) */
export interface CachedTranspileResult {
  ast: SeqNode
  signature: FunctionSignature
  warnings: TranspileWarning[]
}

/** Cached entry for TJS transpilation (tjs/transpileToJS) */
export interface CachedTJSResult {
  code: string
  types: Record<string, TJSTypeInfo>
  testRunner?: string
  testCount?: number
  warnings?: string[]
}

/** Full cache entry stored in IndexedDB */
export interface CacheEntry {
  /** SHA-256 hash of source + version */
  hash: string
  /** TJS version used during transpilation */
  version: string
  /** Timestamp when cached */
  timestamp: number
  /** AsyncJS transpilation result */
  transpile?: CachedTranspileResult
  /** TJS transpilation result */
  tjs?: CachedTJSResult
}

/** Cache statistics */
export interface CacheStats {
  /** Number of entries in cache */
  entries: number
  /** Total bytes used (approximate) */
  bytes: number
  /** Cache hit count this session */
  hits: number
  /** Cache miss count this session */
  misses: number
  /** Hit rate (hits / (hits + misses)) */
  hitRate: number
}

// ============================================================================
// Hash utilities
// ============================================================================

/**
 * Compute SHA-256 hash of source code + version
 * Falls back to simple hash if crypto.subtle unavailable
 */
export async function hashSource(source: string): Promise<string> {
  const input = `${TJS_VERSION}:${source}`

  // Try crypto.subtle (available in browsers and Node 15+)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  // Fallback: simple djb2 hash (good enough for cache keys)
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

/**
 * Synchronous hash for environments without async support
 * Uses djb2 algorithm
 */
export function hashSourceSync(source: string): string {
  const input = `${TJS_VERSION}:${source}`
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

// ============================================================================
// MetadataCache class
// ============================================================================

const DB_NAME = 'tjs-metadata-cache'
const DB_VERSION = 1
const STORE_NAME = 'modules'

/**
 * IndexedDB-based metadata cache
 *
 * Thread-safe and persistent across browser sessions.
 * Automatically handles versioning - entries from old TJS versions
 * are ignored (stale data won't cause issues).
 */
export class MetadataCache {
  private db: IDBDatabase | null = null
  private stats = { hits: 0, misses: 0 }
  private pendingOpen: Promise<void> | null = null

  /**
   * Open the cache database
   * Safe to call multiple times - will reuse existing connection
   */
  async open(): Promise<void> {
    if (this.db) return

    // Prevent multiple simultaneous opens
    if (this.pendingOpen) {
      return this.pendingOpen
    }

    this.pendingOpen = this._open()
    await this.pendingOpen
    this.pendingOpen = null
  }

  private async _open(): Promise<void> {
    return new Promise((resolve, _reject) => {
      if (typeof indexedDB === 'undefined') {
        // IndexedDB not available (Node.js without polyfill, etc.)
        resolve()
        return
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        // Don't fail hard - cache is optional
        console.warn('MetadataCache: Failed to open IndexedDB', request.error)
        resolve()
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create modules store with hash as key
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'hash' })
          store.createIndex('timestamp', 'timestamp')
          store.createIndex('version', 'version')
        }
      }
    })
  }

  /**
   * Get cached entry by source code
   * Returns undefined if not cached or version mismatch
   */
  async get(source: string): Promise<CacheEntry | undefined> {
    if (!this.db) {
      this.stats.misses++
      return undefined
    }

    const hash = await hashSource(source)

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(hash)

      request.onerror = () => {
        this.stats.misses++
        resolve(undefined)
      }

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined

        // Validate version
        if (entry && entry.version !== TJS_VERSION) {
          this.stats.misses++
          resolve(undefined)
          return
        }

        if (entry) {
          this.stats.hits++
        } else {
          this.stats.misses++
        }
        resolve(entry)
      }
    })
  }

  /**
   * Get cached transpile result (AsyncJS -> AST)
   */
  async getTranspile(
    source: string
  ): Promise<CachedTranspileResult | undefined> {
    const entry = await this.get(source)
    return entry?.transpile
  }

  /**
   * Get cached TJS result (TJS -> JS)
   */
  async getTJS(source: string): Promise<CachedTJSResult | undefined> {
    const entry = await this.get(source)
    return entry?.tjs
  }

  /**
   * Store transpile result
   */
  async setTranspile(
    source: string,
    result: CachedTranspileResult
  ): Promise<void> {
    await this._set(source, { transpile: result })
  }

  /**
   * Store TJS result
   */
  async setTJS(source: string, result: CachedTJSResult): Promise<void> {
    await this._set(source, { tjs: result })
  }

  /**
   * Store or update cache entry
   */
  private async _set(
    source: string,
    data: { transpile?: CachedTranspileResult; tjs?: CachedTJSResult }
  ): Promise<void> {
    if (!this.db) return

    const hash = await hashSource(source)

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      // Get existing entry to merge
      const getRequest = store.get(hash)

      getRequest.onsuccess = () => {
        const existing = getRequest.result as CacheEntry | undefined

        const entry: CacheEntry = {
          hash,
          version: TJS_VERSION,
          timestamp: Date.now(),
          transpile: data.transpile ?? existing?.transpile,
          tjs: data.tjs ?? existing?.tjs,
        }

        const putRequest = store.put(entry)
        putRequest.onerror = () => reject(putRequest.error)
        putRequest.onsuccess = () => resolve()
      }

      getRequest.onerror = () => reject(getRequest.error)
    })
  }

  /**
   * Delete a specific entry
   */
  async delete(source: string): Promise<void> {
    if (!this.db) return

    const hash = await hashSource(source)

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(hash)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Clear all cached entries
   */
  async clear(): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.stats = { hits: 0, misses: 0 }
        resolve()
      }
    })
  }

  /**
   * Remove entries older than maxAge milliseconds
   * Returns count of entries removed
   */
  async prune(maxAge: number): Promise<number> {
    if (!this.db) return 0

    const cutoff = Date.now() - maxAge

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const index = store.index('timestamp')
      const range = IDBKeyRange.upperBound(cutoff)

      let count = 0
      const request = index.openCursor(range)

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          cursor.delete()
          count++
          cursor.continue()
        } else {
          resolve(count)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Remove entries from old TJS versions
   * Returns count of entries removed
   */
  async pruneOldVersions(): Promise<number> {
    if (!this.db) return 0

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      let count = 0
      const request = store.openCursor()

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          const entry = cursor.value as CacheEntry
          if (entry.version !== TJS_VERSION) {
            cursor.delete()
            count++
          }
          cursor.continue()
        } else {
          resolve(count)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const entries = await this.count()
    const bytes = await this.estimateSize()

    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? this.stats.hits / total : 0

    return {
      entries,
      bytes,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
    }
  }

  /**
   * Count entries in cache
   */
  async count(): Promise<number> {
    if (!this.db) return 0

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.count()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  /**
   * Estimate storage size in bytes
   */
  async estimateSize(): Promise<number> {
    if (!this.db) return 0

    // Use Storage API if available
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate()
        return estimate.usage ?? 0
      } catch {
        // Fall through to manual estimation
      }
    }

    // Manual estimation by iterating entries
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)

      let totalSize = 0
      const request = store.openCursor()

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          // Rough estimate: JSON string length * 2 (UTF-16)
          totalSize += JSON.stringify(cursor.value).length * 2
          cursor.continue()
        } else {
          resolve(totalSize)
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * Check if cache is available (IndexedDB accessible)
   */
  isAvailable(): boolean {
    return this.db !== null
  }

  /**
   * Reset session statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 }
  }
}

// ============================================================================
// Global cache instance
// ============================================================================

let globalCache: MetadataCache | null = null

/**
 * Get or create the global cache instance
 * Automatically opens the database on first call
 */
export async function getGlobalCache(): Promise<MetadataCache> {
  if (!globalCache) {
    globalCache = new MetadataCache()
    await globalCache.open()
  }
  return globalCache
}

/**
 * Set a custom global cache instance (for testing)
 */
export function setGlobalCache(cache: MetadataCache | null): void {
  globalCache = cache
}
