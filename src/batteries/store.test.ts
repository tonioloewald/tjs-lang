import { describe, it, expect, beforeAll } from 'vitest'
import { getStoreCapability, cosineSimilarity } from './store'

describe('Vector Store', () => {
  const store = getStoreCapability()

  beforeAll(async () => {
    await store.createCollection('test')
    await store.vectorAdd('test', { id: 'A', embedding: [1, 1, 1, 1] })
    await store.vectorAdd('test', { id: 'B', embedding: [-1, -1, -1, -1] })
    await store.vectorAdd('test', { id: 'C', embedding: [1, -1, 1, -1] })
  })

  it('should create a collection', async () => {
    // This is implicitly tested by beforeAll, but we can be explicit
    await store.createCollection('new_collection')
    // A bit of a hack to check if the collection exists, as there's no listCollections method
    await expect(
      store.vectorAdd('new_collection', { id: 'D', embedding: [0] })
    ).resolves.toBeUndefined()
  })

  it('should throw an error when searching a non-existent collection', async () => {
    await expect(store.vectorSearch('non_existent', [1, 2, 3])).rejects.toThrow(
      "Collection 'non_existent' not found. Create it first."
    )
  })

  it('should find the most similar vector', async () => {
    const results = await store.vectorSearch('test', [2, 2, 2, 2], 1)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('A')
  })

  it('should find the most dissimilar vector', async () => {
    const results = await store.vectorSearch('test', [1, 1, 1, 1], 3)
    expect(results).toHaveLength(3)
    expect(results[2].id).toBe('B')
  })

  it('should find orthogonal vectors in the middle', async () => {
    const results = await store.vectorSearch('test', [1, 1, 1, 1], 3)
    expect(results).toHaveLength(3)
    expect(results[1].id).toBe('C') // A is first, B is last, C is in the middle
  })

  it('should throw error if doc has no embedding', async () => {
    await expect(store.vectorAdd('test', { id: 'D' })).rejects.toThrow(
      "Document must have an 'embedding' property that is an array of numbers."
    )
  })
})

describe('cosineSimilarity calculation', () => {
  it('should return 1 for identical vectors', () => {
    const vec = [1, 2, 3]
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1)
  })

  it('should return -1 for opposite vectors', () => {
    const vecA = [1, 2, 3]
    const vecB = [-1, -2, -3]
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1)
  })

  it('should return 0 for orthogonal vectors', () => {
    const vecA = [1, 0]
    const vecB = [0, 1]
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0)
  })

  it('should throw an error for vectors of different lengths', () => {
    const vecA = [1, 2]
    const vecB = [1, 2, 3]
    expect(() => cosineSimilarity(vecA, vecB)).toThrow(
      'Vectors must have the same length for cosine similarity.'
    )
  })

  it('should return 0 for zero vectors', () => {
    const vecA = [0, 0, 0]
    const vecB = [1, 2, 3]
    expect(cosineSimilarity(vecA, vecB)).toBe(0)
  })
})

describe.skipIf(process.env.SKIP_BENCHMARKS)(
  'Vector Search Benchmark (10k x 500dim)',
  () => {
    const store = getStoreCapability()
    const VECTOR_DIMENSION = 500
    const NUM_VECTORS = 10000
    const COLLECTION_NAME = 'benchmark'

    beforeAll(async () => {
      await store.createCollection(COLLECTION_NAME)
      const vectors = Array.from({ length: NUM_VECTORS }, () =>
        Array.from({ length: VECTOR_DIMENSION }, () => Math.random() * 2 - 1)
      )

      for (let i = 0; i < NUM_VECTORS; i++) {
        await store.vectorAdd(COLLECTION_NAME, {
          id: `vec_${i}`,
          embedding: vectors[i],
        })
      }
    }, 30000) // Increase timeout for setup

    it('should perform a vector search reasonably fast', async () => {
      const queryVector = Array.from(
        { length: VECTOR_DIMENSION },
        () => Math.random() * 2 - 1
      )

      const startTime = Date.now()
      await store.vectorSearch(COLLECTION_NAME, queryVector, 5)
      const endTime = Date.now()

      const duration = endTime - startTime
      console.log(
        `\nVector search benchmark with ${NUM_VECTORS} vectors took ${duration} ms.`
      )

      // This is a baseline to catch major performance regressions.
      // It might need adjustment based on the machine running the test.
      expect(duration).toBeLessThan(2000) // e.g., less than 2 seconds
    })
  }
)

describe.skipIf(process.env.SKIP_BENCHMARKS)(
  'Vector Search Benchmark (10k x 1000dim)',
  () => {
    const store = getStoreCapability()
    const VECTOR_DIMENSION = 1000
    const NUM_VECTORS = 10000
    const COLLECTION_NAME = 'benchmark_10k_1000'

    beforeAll(async () => {
      await store.createCollection(COLLECTION_NAME)
      const vectors = Array.from({ length: NUM_VECTORS }, () =>
        Array.from({ length: VECTOR_DIMENSION }, () => Math.random() * 2 - 1)
      )

      for (let i = 0; i < NUM_VECTORS; i++) {
        await store.vectorAdd(COLLECTION_NAME, {
          id: `vec_${i}`,
          embedding: vectors[i],
        })
      }
    }, 30000)

    it('should perform a vector search reasonably fast', async () => {
      const queryVector = Array.from(
        { length: VECTOR_DIMENSION },
        () => Math.random() * 2 - 1
      )

      const startTime = Date.now()
      await store.vectorSearch(COLLECTION_NAME, queryVector, 5)
      const endTime = Date.now()

      const duration = endTime - startTime
      console.log(
        `\n[Benchmark 10k x 1000dim] Vector search took ${duration} ms.`
      )

      expect(duration).toBeLessThan(4000)
    })
  }
)

describe.skipIf(process.env.SKIP_BENCHMARKS)(
  'Vector Search Benchmark (100k x 500dim)',
  () => {
    const store = getStoreCapability()
    const VECTOR_DIMENSION = 500
    const NUM_VECTORS = 100000
    const COLLECTION_NAME = 'benchmark_100k_500'

    beforeAll(async () => {
      await store.createCollection(COLLECTION_NAME)
      const vectors = Array.from({ length: NUM_VECTORS }, () =>
        Array.from({ length: VECTOR_DIMENSION }, () => Math.random() * 2 - 1)
      )

      for (let i = 0; i < NUM_VECTORS; i++) {
        await store.vectorAdd(COLLECTION_NAME, {
          id: `vec_${i}`,
          embedding: vectors[i],
        })
      }
    }, 60000) // Increase timeout for setup

    it('should perform a vector search reasonably fast', async () => {
      const queryVector = Array.from(
        { length: VECTOR_DIMENSION },
        () => Math.random() * 2 - 1
      )

      const startTime = Date.now()
      await store.vectorSearch(COLLECTION_NAME, queryVector, 5)
      const endTime = Date.now()

      const duration = endTime - startTime
      console.log(
        `\n[Benchmark 100k x 500dim] Vector search took ${duration} ms.`
      )

      expect(duration).toBeLessThan(20000)
    })
  }
)
