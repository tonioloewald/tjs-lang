/**
 * Store Capability Battery
 * Provides Key-Value storage and lightweight in-memory Vector Search.
 */

interface StoreCapability {
  get(key: string): Promise<any>
  set(key: string, val: any): Promise<void>
  createCollection(
    name: string,
    schema?: any,
    dimension?: number
  ): Promise<void>
  vectorAdd(collection: string, doc: any): Promise<void>
  vectorSearch(collection: string, vector: number[], k?: number): Promise<any[]>
}

// In-memory KV store fallback
const kvStore = new Map<string, any>()
// In-memory Vector store fallback
const collections = new Map<string, any[]>()

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length for cosine similarity.')
  }
  let dotProduct = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    magA += vecA[i] * vecA[i]
    magB += vecB[i] * vecB[i]
  }
  magA = Math.sqrt(magA)
  magB = Math.sqrt(magB)
  if (magA === 0 || magB === 0) {
    return 0
  }
  return dotProduct / (magA * magB)
}

export function getStoreCapability(): StoreCapability {
  return {
    async get(key: string) {
      return kvStore.get(key)
    },

    async set(key: string, val: any) {
      kvStore.set(key, val)
    },

    async createCollection(name: string, _schema?: any, _dimension?: number) {
      if (collections.has(name)) {
        console.warn(`Collection '${name}' already exists. Overwriting.`)
      }
      collections.set(name, [])
    },

    async vectorAdd(collection: string, doc: any) {
      const db = collections.get(collection)
      if (!db)
        throw new Error(
          `Collection '${collection}' not found. Create it first.`
        )
      if (!doc.embedding || !Array.isArray(doc.embedding)) {
        throw new Error(
          "Document must have an 'embedding' property that is an array of numbers."
        )
      }
      db.push(doc)
    },

    async vectorSearch(collection: string, vector: number[], k = 5) {
      const db = collections.get(collection)
      if (!db)
        throw new Error(
          `Collection '${collection}' not found. Create it first.`
        )

      const scoredDocs = db.map((doc) => ({
        doc,
        score: cosineSimilarity(vector, doc.embedding),
      }))

      scoredDocs.sort((a, b) => b.score - a.score)

      return scoredDocs.slice(0, k).map((item) => item.doc)
    },
  }
}
