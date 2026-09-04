/* tjs <- input.ts */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import {
  MetadataCache,
  hashSource,
  hashSourceSync,
  getGlobalCache,
  setGlobalCache,
} from '/Users/tonioloewald/tjs-lang/src/lang/metadata-cache'

import { TJS_VERSION } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

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
    let cache
    beforeEach(async () => {
      cache = new MetadataCache()

      await cache.open()
    })
    afterEach(() => {
      cache.close()
    })
    it('should handle missing IndexedDB gracefully', async () => {
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
      expect(cache.isAvailable()).toBe(false)
    })
    it('should handle setTranspile gracefully when unavailable', async () => {
      const result = {
        ast: { $seq: [] },
        signature: {
          name: 'test',
          parameters: {},
        },
        warnings: [],
      }

      await cache.setTranspile('test', result)
    })
    it('should handle setTJS gracefully when unavailable', async () => {
      const result = {
        code: 'function test() {}',
        types: {
          name: 'test',
          params: {},
        },
      }

      await cache.setTJS('test', result)
    })
    it('should handle clear gracefully when unavailable', async () => {
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
    const source = 'function f() {}'
    let hash = 5381
    const input = `${TJS_VERSION}:${source}`
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
    }
    expect(hashSourceSync(source)).toBe(hash.toString(16))
  })
})
