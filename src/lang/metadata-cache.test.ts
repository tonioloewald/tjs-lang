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

/**
 * The four tests that used to live here were `it.skip` with EMPTY BODIES — every line a
 * comment describing what a browser test would do. They were not skipped tests; they were
 * prose wearing a test's clothes, and they read as coverage in every summary while
 * asserting nothing. Four of the eight permanently-skipped tests in the whole repo.
 *
 * Two things replace them.
 *
 * FIRST, the part that does not need IndexedDB at all. Version invalidation — the property
 * that matters most this release, since 50b670d changed version comparison — is not
 * implemented by comparing versions at read time. It is implemented by BAKING the version
 * into the cache key, so an entry written by a different version is simply never looked
 * up. That is a pure function of `TJS_VERSION + source`, and it is tested below, headless.
 *
 * SECOND, the honest record of what is NOT covered: storage, retrieval, merge and prune
 * all need a real IndexedDB. happy-dom does not provide one (checked: `indexedDB` is
 * undefined under it) and `fake-indexeddb` is not a dependency. Adding one for this is a
 * decision worth making deliberately rather than smuggling in — so the gap is stated here
 * and in TODO.md instead of being papered over with skipped placeholders.
 */
describe('cache keys are version-scoped (headless — no IndexedDB needed)', () => {
  it('the same source always produces the same key', async () => {
    expect(await hashSource('function f() {}')).toBe(
      await hashSource('function f() {}')
    )
    expect(hashSourceSync('function f() {}')).toBe(
      hashSourceSync('function f() {}')
    )
  })

  it('different sources produce different keys', async () => {
    expect(await hashSource('function f() {}')).not.toBe(
      await hashSource('function g() {}')
    )
  })

  it('the key incorporates the TJS version — this IS the invalidation', async () => {
    // Not a behavioural assertion but a STRUCTURAL one, because the version is a module
    // constant and cannot be varied at run time. What can be proven is that the key
    // depends on it: recompute the documented input by hand and check it agrees.
    const source = 'function f() {}'
    const encoder = new TextEncoder()
    const expected = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          encoder.encode(`${TJS_VERSION}:${source}`)
        )
      )
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    expect(await hashSource(source)).toBe(expected)

    // And that a DIFFERENT version would yield a different key — which is what makes an
    // entry from an older TJS unreachable rather than merely stale.
    const otherVersion = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          encoder.encode(`0.0.0-not-this-version:${source}`)
        )
      )
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    expect(await hashSource(source)).not.toBe(otherVersion)
  })

  it('the sync fallback is version-scoped too', () => {
    // Used where async is unavailable; a fallback that ignored the version would resurrect
    // stale entries exactly where the code is least able to cope with them.
    const source = 'function f() {}'
    let hash = 5381
    const input = `${TJS_VERSION}:${source}`
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
    }
    expect(hashSourceSync(source)).toBe(hash.toString(16))
  })
})
