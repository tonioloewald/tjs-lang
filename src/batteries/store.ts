/**
 * Store Capability Battery
 * Provides Key-Value storage and Vector Search using Orama.
 * Lazy-loaded to minimize startup impact.
 */

interface StoreCapability {
  get(key: string): Promise<any>
  set(key: string, val: any): Promise<void>
  createCollection(name: string, schema?: any): Promise<void>
  vectorAdd(collection: string, doc: any): Promise<void>
  vectorSearch(collection: string, vector: number[], k?: number, filter?: any): Promise<any[]>
}

// In-memory KV store fallback
const kvStore = new Map<string, any>()

// Orama instances cache
const collections = new Map<string, any>()

let oramaLib: any = null

async function getOrama() {
  if (oramaLib) return oramaLib
  // Dynamic import
  oramaLib = await import('@orama/orama')
  return oramaLib
}

export function getStoreCapability(): StoreCapability {
  return {
    async get(key: string) {
      return kvStore.get(key)
    },

    async set(key: string, val: any) {
      kvStore.set(key, val)
    },

    async createCollection(name: string, schema: any = {}) {
      const { create } = await getOrama()
      // Default schema if none provided, but Orama requires a schema for vector search usually
      // For generic vector store usage, we define a standard schema with an embedding field
      const defaultSchema = {
        id: 'string',
        content: 'string',
        embedding: 'vector[384]', // Default dimension for MiniLM-L6-v2
        meta: 'string', // JSON stringified metadata
        ...schema,
      }

      const db = await create({
        schema: defaultSchema,
      })
      collections.set(name, db)
    },

    async vectorAdd(collection: string, doc: any) {
      const { insert } = await getOrama()
      const db = collections.get(collection)
      if (!db)
        throw new Error(`Collection '${collection}' not found. Create it first.`)

      // We expect doc to contain the vector in 'embedding' field if schema requires it
      // or we just insert raw doc and hope schema matches.
      await insert(db, doc)
    },

    async vectorSearch(collection: string, vector: number[], k = 5, filter?: any) {
      const { search } = await getOrama()
      const db = collections.get(collection)
      if (!db)
        throw new Error(`Collection '${collection}' not found. Create it first.`)

      const results = await search(db, {
        mode: 'vector',
        vector: {
          value: vector,
          property: 'embedding',
        },
        limit: k,
        where: filter,
      })

      // Map results back to simpler format
      return results.hits.map((hit: any) => hit.document)
    },
  }
}