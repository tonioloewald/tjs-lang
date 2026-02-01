/*#
# Store Interface

Abstract storage interface that can be backed by Firestore, IndexedDB,
Postgres, filesystem, or any other storage backend.

This enables:
1. Testing RBAC logic without Firebase
2. Running locally with IndexedDB
3. Self-hosted deployments with Postgres/SQLite
4. "Directory full of crap" development mode
*/

/**
 * Where clause for queries
 */
export interface WhereClause {
  field: string
  op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains'
  value: any
}

/**
 * Query constraints
 */
export interface QueryConstraints {
  where?: WhereClause[]
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

/**
 * Document with ID
 */
export interface Doc<T = Record<string, any>> {
  id: string
  data: T
}

/**
 * Result of a write operation
 */
export interface WriteResult {
  success: boolean
  error?: string
}

/**
 * Abstract store interface
 *
 * All methods are async to support both sync (IndexedDB) and
 * async (Firestore, Postgres) backends.
 */
export interface Store {
  /**
   * Get a document by ID
   * Returns null if not found
   */
  get(collection: string, id: string): Promise<Record<string, any> | null>

  /**
   * Set a document (create or update)
   * If merge is true, only updates provided fields
   */
  set(
    collection: string,
    id: string,
    data: Record<string, any>,
    options?: { merge?: boolean }
  ): Promise<WriteResult>

  /**
   * Delete a document
   */
  delete(collection: string, id: string): Promise<WriteResult>

  /**
   * Query documents in a collection
   */
  query(
    collection: string,
    constraints?: QueryConstraints
  ): Promise<Doc[]>

  /**
   * Check if a document exists
   */
  exists(collection: string, id: string): Promise<boolean>

  /**
   * Generate a unique ID for a new document
   */
  generateId(collection: string): string

  /**
   * Batch write operations (atomic)
   * Optional - not all backends support transactions
   */
  batch?(
    operations: Array<
      | { type: 'set'; collection: string; id: string; data: Record<string, any> }
      | { type: 'delete'; collection: string; id: string }
    >
  ): Promise<WriteResult>

  /**
   * Clear all data (for testing)
   */
  clear?(): Promise<void>
}

/**
 * Factory function type for creating stores
 */
export type StoreFactory = () => Store | Promise<Store>
