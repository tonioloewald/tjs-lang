/**
 * Tests for the Timestamp TJS class
 * Demonstrates asymmetric getter/setter types
 */
import { describe, it, expect } from 'bun:test'

// Import the TJS file (requires bun plugin preload)
import { Timestamp } from './timestamp.tjs'

describe('Timestamp class', () => {
  describe('constructor', () => {
    it('accepts string date', () => {
      const ts = Timestamp('2024-01-15')
      expect(ts.value).toBeInstanceOf(Date)
      expect(ts.value.getFullYear()).toBe(2024)
    })

    it('accepts number (epoch ms)', () => {
      const ts = Timestamp(0)
      expect(ts.value).toBeInstanceOf(Date)
      expect(ts.value.getTime()).toBe(0)
    })

    it('accepts null for current time', () => {
      const before = Date.now()
      const ts = Timestamp(null)
      const after = Date.now()
      expect(ts.value.getTime()).toBeGreaterThanOrEqual(before)
      expect(ts.value.getTime()).toBeLessThanOrEqual(after)
    })
  })

  describe('setter (asymmetric input type)', () => {
    it('accepts string', () => {
      const ts = Timestamp(null)
      ts.value = '2023-06-01'
      expect(ts.value.getFullYear()).toBe(2023)
      expect(ts.value.getMonth()).toBe(5) // June is month 5
    })

    it('accepts null for current time', () => {
      const ts = Timestamp('2020-01-01')
      const before = Date.now()
      ts.value = null
      const after = Date.now()
      expect(ts.value.getTime()).toBeGreaterThanOrEqual(before)
      expect(ts.value.getTime()).toBeLessThanOrEqual(after)
    })
  })

  describe('getter (returns Date)', () => {
    it('always returns Date object', () => {
      const ts = Timestamp('2024-07-04')
      expect(ts.value).toBeInstanceOf(Date)
    })
  })

  describe('toString', () => {
    it('returns ISO string', () => {
      const ts = Timestamp('2024-07-04T12:00:00Z')
      expect(ts.toString()).toContain('2024-07-04')
    })
  })

  describe('callable without new', () => {
    it('works with or without new keyword', () => {
      const ts1 = Timestamp(null)
      const ts2 = new Timestamp(null)
      expect(ts1).toBeInstanceOf(Timestamp)
      expect(ts2).toBeInstanceOf(Timestamp)
    })
  })
})
