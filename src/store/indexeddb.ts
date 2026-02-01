/*#
# IndexedDB Store

Browser-compatible store implementation using IndexedDB.
Useful for:
- Local development without Firebase
- Testing in browser environment
- Offline-first applications
- PWAs with local persistence
*/

import type { Store, Doc, QueryConstraints, WriteResult, WhereClause } from './interface'

const DB_NAME = 'tjs-store'
const DB_VERSION = 1

/**
 * Open the IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      // We'll create object stores dynamically as collections are accessed
      // For now, just ensure the database exists
      if (!db.objectStoreNames.contains('_meta')) {
        db.createObjectStore('_meta', { keyPath: 'id' })
      }
    }
  })
}

/**
 * Ensure a collection (object store) exists
 */
async function ensureCollection(db: IDBDatabase, collection: string): Promise<void> {
  if (db.objectStoreNames.contains(collection)) {
    return
  }

  // Need to upgrade the database to add new object store
  db.close()

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, db.version + 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      request.result.close()
      resolve()
    }

    request.onupgradeneeded = (event) => {
      const upgradedDb = (event.target as IDBOpenDBRequest).result
      if (!upgradedDb.objectStoreNames.contains(collection)) {
        upgradedDb.createObjectStore(collection, { keyPath: '_id' })
      }
    }
  })
}

/**
 * Evaluate a where clause against a document
 */
function matchesWhere(doc: Record<string, any>, clause: WhereClause): boolean {
  const value = doc[clause.field]

  switch (clause.op) {
    case '==':
      return value === clause.value
    case '!=':
      return value !== clause.value
    case '<':
      return value < clause.value
    case '<=':
      return value <= clause.value
    case '>':
      return value > clause.value
    case '>=':
      return value >= clause.value
    case 'in':
      return Array.isArray(clause.value) && clause.value.includes(value)
    case 'not-in':
      return Array.isArray(clause.value) && !clause.value.includes(value)
    case 'array-contains':
      return Array.isArray(value) && value.includes(clause.value)
    default:
      return false
  }
}

/**
 * Compare values for sorting
 */
function compareValues(a: any, b: any, direction: 'asc' | 'desc'): number {
  if (a === b) return 0
  if (a === null || a === undefined) return direction === 'asc' ? -1 : 1
  if (b === null || b === undefined) return direction === 'asc' ? 1 : -1

  const result = a < b ? -1 : 1
  return direction === 'asc' ? result : -result
}

/**
 * Generate a random ID (similar to Firestore auto-IDs)
 */
function generateRandomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 20; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

/**
 * Create an IndexedDB-backed store
 */
export function createIndexedDBStore(): Store {
  let dbPromise: Promise<IDBDatabase> | null = null

  async function getDB(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = openDB()
    }
    return dbPromise
  }

  async function withCollection<T>(
    collection: string,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    let db = await getDB()

    // Ensure collection exists
    if (!db.objectStoreNames.contains(collection)) {
      await ensureCollection(db, collection)
      dbPromise = null // Reset so we get fresh connection
      db = await getDB()
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(collection, mode)
      const store = tx.objectStore(collection)
      const request = fn(store)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  return {
    async get(collection: string, id: string): Promise<Record<string, any> | null> {
      try {
        const result = await withCollection(collection, 'readonly', (store) =>
          store.get(id)
        )
        if (!result) return null
        // Remove internal _id field
        const { _id, ...data } = result
        return data
      } catch {
        return null
      }
    },

    async set(
      collection: string,
      id: string,
      data: Record<string, any>,
      options?: { merge?: boolean }
    ): Promise<WriteResult> {
      try {
        let finalData = { ...data, _id: id }

        if (options?.merge) {
          const existing = await this.get(collection, id)
          if (existing) {
            finalData = { ...existing, ...data, _id: id }
          }
        }

        await withCollection(collection, 'readwrite', (store) =>
          store.put(finalData)
        )

        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    },

    async delete(collection: string, id: string): Promise<WriteResult> {
      try {
        await withCollection(collection, 'readwrite', (store) =>
          store.delete(id)
        )
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    },

    async query(
      collection: string,
      constraints?: QueryConstraints
    ): Promise<Doc[]> {
      try {
        const db = await getDB()

        if (!db.objectStoreNames.contains(collection)) {
          return []
        }

        // Get all documents
        const allDocs = await withCollection(collection, 'readonly', (store) =>
          store.getAll()
        )

        let results: Doc[] = allDocs.map((doc: any) => {
          const { _id, ...data } = doc
          return { id: _id, data }
        })

        // Apply where clauses
        if (constraints?.where) {
          for (const clause of constraints.where) {
            results = results.filter((doc) => matchesWhere(doc.data, clause))
          }
        }

        // Apply ordering
        if (constraints?.orderBy) {
          const direction = constraints.orderDirection || 'asc'
          results.sort((a, b) =>
            compareValues(a.data[constraints.orderBy!], b.data[constraints.orderBy!], direction)
          )
        }

        // Apply offset
        if (constraints?.offset) {
          results = results.slice(constraints.offset)
        }

        // Apply limit
        if (constraints?.limit) {
          results = results.slice(0, constraints.limit)
        }

        return results
      } catch {
        return []
      }
    },

    async exists(collection: string, id: string): Promise<boolean> {
      const doc = await this.get(collection, id)
      return doc !== null
    },

    generateId(_collection: string): string {
      return generateRandomId()
    },

    async batch(
      operations: Array<
        | { type: 'set'; collection: string; id: string; data: Record<string, any> }
        | { type: 'delete'; collection: string; id: string }
      >
    ): Promise<WriteResult> {
      // IndexedDB doesn't have true cross-store transactions,
      // so we do our best with individual operations
      try {
        for (const op of operations) {
          if (op.type === 'set') {
            await this.set(op.collection, op.id, op.data)
          } else if (op.type === 'delete') {
            await this.delete(op.collection, op.id)
          }
        }
        return { success: true }
      } catch (error) {
        return { success: false, error: String(error) }
      }
    },

    async clear(): Promise<void> {
      const db = await getDB()
      db.close()
      dbPromise = null

      return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    },
  }
}

/**
 * Singleton instance for convenience
 */
let defaultStore: Store | null = null

export function getIndexedDBStore(): Store {
  if (!defaultStore) {
    defaultStore = createIndexedDBStore()
  }
  return defaultStore
}
