/*#
# In-Memory Store

Simple in-memory store for testing and development.
Data is lost when the process exits.

Useful for:
- Unit tests
- Quick prototyping
- Node.js/Bun environments without IndexedDB
*/

import type {
  Store,
  Doc,
  QueryConstraints,
  WriteResult,
  WhereClause,
} from './interface'

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
 * Generate a random ID
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
 * Create an in-memory store
 */
export function createMemoryStore(): Store {
  // Map of collection -> Map of id -> data
  const collections = new Map<string, Map<string, Record<string, any>>>()

  function getCollection(name: string): Map<string, Record<string, any>> {
    if (!collections.has(name)) {
      collections.set(name, new Map())
    }
    return collections.get(name)!
  }

  return {
    async get(
      collection: string,
      id: string
    ): Promise<Record<string, any> | null> {
      const coll = getCollection(collection)
      const doc = coll.get(id)
      return doc ? { ...doc } : null
    },

    async set(
      collection: string,
      id: string,
      data: Record<string, any>,
      options?: { merge?: boolean }
    ): Promise<WriteResult> {
      const coll = getCollection(collection)

      if (options?.merge) {
        const existing = coll.get(id)
        if (existing) {
          coll.set(id, { ...existing, ...data })
        } else {
          coll.set(id, { ...data })
        }
      } else {
        coll.set(id, { ...data })
      }

      return { success: true }
    },

    async delete(collection: string, id: string): Promise<WriteResult> {
      const coll = getCollection(collection)
      coll.delete(id)
      return { success: true }
    },

    async query(
      collection: string,
      constraints?: QueryConstraints
    ): Promise<Doc[]> {
      const coll = getCollection(collection)

      let results: Doc[] = []
      for (const [id, data] of coll.entries()) {
        results.push({ id, data: { ...data } })
      }

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
          compareValues(
            a.data[constraints.orderBy!],
            b.data[constraints.orderBy!],
            direction
          )
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
    },

    async exists(collection: string, id: string): Promise<boolean> {
      const coll = getCollection(collection)
      return coll.has(id)
    },

    generateId(_collection: string): string {
      return generateRandomId()
    },

    async batch(
      operations: Array<
        | {
            type: 'set'
            collection: string
            id: string
            data: Record<string, any>
          }
        | { type: 'delete'; collection: string; id: string }
      >
    ): Promise<WriteResult> {
      // In-memory is always atomic in single-threaded JS
      for (const op of operations) {
        if (op.type === 'set') {
          await this.set(op.collection, op.id, op.data)
        } else if (op.type === 'delete') {
          await this.delete(op.collection, op.id)
        }
      }
      return { success: true }
    },

    async clear(): Promise<void> {
      collections.clear()
    },
  }
}

/**
 * Singleton instance for convenience
 */
let defaultStore: Store | null = null

export function getMemoryStore(): Store {
  if (!defaultStore) {
    defaultStore = createMemoryStore()
  }
  return defaultStore
}

/**
 * Reset the default store (for tests)
 */
export function resetMemoryStore(): void {
  defaultStore = null
}
