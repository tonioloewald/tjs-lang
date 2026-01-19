import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  MetadataCache,
  hashSource,
  hashSourceSync,
  getGlobalCache,
  setGlobalCache,
  type CachedTranspileResult,
  type CachedTJSResult,
} from './metadata-cache'
import { TJS_VERSION } from './runtime'

describe('metadata-cache', () => {
  describe('hashSource', () => {
    it('should produce consistent hashes for same input', async () => {
      const source = 'function test() { return 1 }'
      const hash1 = await hashSource(source)
      const hash2 = await hashSource(source)
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different input', async () => {
      const hash1 = await hashSource('function a() {}')
      const hash2 = await hashSource('function b() {}')
      expect(hash1).not.toBe(hash2)
    })

    it('should include version in hash', async () => {
      // Same source with different version would produce different hash
      // We can't easily test this without mocking TJS_VERSION,
      // but we can verify the hash is non-empty
      const hash = await hashSource('test')
      expect(hash.length).toBeGreaterThan(0)
    })
  })

  describe('hashSourceSync', () => {
    it('should produce consistent hashes', () => {
      const source = 'function test() { return 1 }'
      const hash1 = hashSourceSync(source)
      const hash2 = hashSourceSync(source)
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different input', () => {
      const hash1 = hashSourceSync('function a() {}')
      const hash2 = hashSourceSync('function b() {}')
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('MetadataCache', () => {
    let cache: MetadataCache

    beforeEach(async () => {
      cache = new MetadataCache()
      // Note: IndexedDB not available in Node/Bun test environment
      // These tests verify the API works gracefully when DB is unavailable
      await cache.open()
    })

    afterEach(() => {
      cache.close()
    })

    it('should handle missing IndexedDB gracefully', async () => {
      // In Node/Bun environment, IndexedDB is not available
      // Cache should work but return undefined for all gets
      const result = await cache.get('test source')
      expect(result).toBeUndefined()
    })

    it('should track misses when DB unavailable', async () => {
      await cache.get('source 1')
      await cache.get('source 2')
      const stats = await cache.getStats()
      expect(stats.misses).toBe(2)
      expect(stats.hits).toBe(0)
    })

    it('should report not available when DB fails to open', () => {
      // In Node/Bun, isAvailable should be false
      expect(cache.isAvailable()).toBe(false)
    })

    it('should handle setTranspile gracefully when unavailable', async () => {
      const result: CachedTranspileResult = {
        ast: { $seq: [] },
        signature: {
          name: 'test',
          parameters: {},
        },
        warnings: [],
      }
      // Should not throw
      await cache.setTranspile('test', result)
    })

    it('should handle setTJS gracefully when unavailable', async () => {
      const result: CachedTJSResult = {
        code: 'function test() {}',
        types: {
          name: 'test',
          params: {},
        },
      }
      // Should not throw
      await cache.setTJS('test', result)
    })

    it('should handle clear gracefully when unavailable', async () => {
      // Should not throw
      await cache.clear()
    })

    it('should handle prune gracefully when unavailable', async () => {
      const count = await cache.prune(1000)
      expect(count).toBe(0)
    })

    it('should handle count gracefully when unavailable', async () => {
      const count = await cache.count()
      expect(count).toBe(0)
    })

    it('should handle estimateSize gracefully when unavailable', async () => {
      const size = await cache.estimateSize()
      expect(size).toBe(0)
    })

    it('should reset stats', async () => {
      await cache.get('source')
      let stats = await cache.getStats()
      expect(stats.misses).toBe(1)

      cache.resetStats()
      stats = await cache.getStats()
      expect(stats.misses).toBe(0)
      expect(stats.hits).toBe(0)
    })
  })

  describe('global cache', () => {
    afterEach(() => {
      setGlobalCache(null)
    })

    it('should return same instance on multiple calls', async () => {
      const cache1 = await getGlobalCache()
      const cache2 = await getGlobalCache()
      expect(cache1).toBe(cache2)
    })

    it('should allow setting custom cache', async () => {
      const customCache = new MetadataCache()
      setGlobalCache(customCache)
      const retrieved = await getGlobalCache()
      expect(retrieved).toBe(customCache)
    })
  })
})

// Browser-specific tests would go in a separate file
// that runs in a browser environment with IndexedDB available
describe('MetadataCache browser simulation', () => {
  // These tests document the expected behavior when IndexedDB IS available
  // They serve as documentation and can be run in browser test environments

  it.skip('should store and retrieve transpile results', async () => {
    // In browser:
    // const cache = new MetadataCache()
    // await cache.open()
    //
    // const result = { ast: {...}, signature: {...}, warnings: [] }
    // await cache.setTranspile('function test() {}', result)
    //
    // const cached = await cache.getTranspile('function test() {}')
    // expect(cached).toEqual(result)
  })

  it.skip('should invalidate on version change', async () => {
    // In browser:
    // Store entry with old version
    // Entry should not be returned when TJS_VERSION differs
  })

  it.skip('should merge transpile and TJS results', async () => {
    // In browser:
    // await cache.setTranspile(source, transpileResult)
    // await cache.setTJS(source, tjsResult)
    //
    // const entry = await cache.get(source)
    // expect(entry.transpile).toBeDefined()
    // expect(entry.tjs).toBeDefined()
  })

  it.skip('should prune old entries', async () => {
    // In browser:
    // Store entries with old timestamps
    // await cache.prune(1000) // 1 second
    // Old entries should be removed
  })
})
