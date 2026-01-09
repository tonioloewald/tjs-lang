/**
 * Test utilities for Agent99
 *
 * Common mock factories and helpers for testing agents.
 */

import { mock } from 'bun:test'
import type { Capabilities } from './runtime'

/**
 * Retry a test function up to maxAttempts times.
 * Passes if it succeeds at least minSuccesses times out of maxAttempts.
 * This accounts for LLM variability in code generation.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    maxAttempts = 3,
    minSuccesses = 1,
  }: { maxAttempts?: number; minSuccesses?: number } = {}
): Promise<T> {
  let successes = 0
  let lastError: Error | undefined
  let lastResult: T | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      lastResult = await fn()
      successes++
      if (successes >= minSuccesses) {
        return lastResult
      }
    } catch (e) {
      lastError = e as Error
      console.log(
        `Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`
      )
    }
  }

  if (successes >= minSuccesses) {
    return lastResult!
  }

  throw new Error(
    `Test failed: only ${successes}/${maxAttempts} attempts succeeded (needed ${minSuccesses}). Last error: ${lastError?.message}`
  )
}

/**
 * Creates a mock in-memory store capability
 * @param initialData - Optional initial data keyed by string
 * @param options.getOverride - Optional function to override get behavior
 */
export function createMockStore(
  initialData: Record<string, any> = {},
  options: { getOverride?: (key: string) => any } = {}
) {
  const db = new Map(Object.entries(initialData))
  return {
    get: mock(async (key: string) =>
      options.getOverride ? options.getOverride(key) : db.get(key)
    ),
    set: mock(async (key: string, value: any) => {
      db.set(key, value)
    }),
    query: mock(async (_query: any) => Array.from(db.values())),
    // Expose the underlying map for test assertions
    _db: db,
  }
}

/**
 * Creates a mock fetch capability that returns the provided response
 */
export function createMockFetch(response: any = { ok: true }) {
  return mock(async (_url: string, _init?: any) => response)
}

/**
 * Creates a mock fetch capability with URL-based responses
 */
export function createMockFetchWithRoutes(
  routes: Record<string, any>,
  fallback: any | ((url: string) => any) = { error: 'Not found' }
) {
  return mock(async (url: string, _init?: any) => {
    for (const [pattern, response] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return typeof response === 'function' ? response(url) : response
      }
    }
    return typeof fallback === 'function' ? fallback(url) : fallback
  })
}

/**
 * Creates a mock LLM capability
 */
export function createMockLLM(response: string | ((prompt: string) => string)) {
  return {
    predict: mock(async (prompt: string, _options?: any) => {
      return typeof response === 'function' ? response(prompt) : response
    }),
    embed: mock(async (_text: string) => {
      // Return a simple mock embedding vector
      return Array(384).fill(0.1)
    }),
  }
}

/**
 * Creates a mock vector capability for RAG testing
 */
export function createMockVector() {
  return {
    embed: mock(async (_text: string) => Array(384).fill(0.1)),
  }
}

/**
 * Creates a mock XML parser capability
 */
export function createMockXML(parseResult: any = {}) {
  return {
    parse: mock(async (_xml: string) => parseResult),
  }
}

/**
 * Combines multiple capability mocks into a Capabilities object
 */
export function createCapabilities(
  overrides: Partial<Capabilities> = {}
): Capabilities {
  return {
    store: createMockStore(),
    fetch: createMockFetch(),
    ...overrides,
  }
}

/**
 * Creates capabilities with a mock store that has vector search
 */
export function createMockVectorStore(
  documents: Array<{ id: string; content: string; vector?: number[] }> = []
) {
  const db = new Map(documents.map((d) => [d.id, d]))
  return {
    get: mock(async (key: string) => db.get(key)),
    set: mock(async (key: string, value: any) => {
      db.set(key, value)
    }),
    vectorSearch: mock(
      async (_collection: string, _vector: number[], k = 5) => {
        // Return top k documents (in real impl would use cosine similarity)
        return Array.from(db.values()).slice(0, k)
      }
    ),
    vectorAdd: mock(async (_collection: string, doc: any) => {
      db.set(doc.id, doc)
    }),
    createCollection: mock(async () => undefined),
    _db: db,
  }
}
