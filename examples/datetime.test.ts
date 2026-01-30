/**
 * Tests for the DateTime TJS class
 * Demonstrates asymmetric getter/setter types
 */
import { describe, it, expect } from 'bun:test'

// Import the TJS file (requires bun plugin preload)
import { DateTime } from './datetime.tjs'

describe('DateTime class', () => {
  describe('constructor', () => {
    it('accepts string date', () => {
      const dt = DateTime('2024-01-15')
      expect(dt.value).toBeInstanceOf(Date)
      expect(dt.value.getFullYear()).toBe(2024)
    })

    it('accepts number (epoch ms)', () => {
      const dt = DateTime(0)
      expect(dt.value).toBeInstanceOf(Date)
      expect(dt.value.getTime()).toBe(0)
    })

    it('accepts null for current time', () => {
      const before = Date.now()
      const dt = DateTime(null)
      const after = Date.now()
      expect(dt.value.getTime()).toBeGreaterThanOrEqual(before)
      expect(dt.value.getTime()).toBeLessThanOrEqual(after)
    })
  })

  describe('setter (asymmetric input type)', () => {
    it('accepts string', () => {
      const dt = DateTime(null)
      dt.value = '2023-06-01'
      expect(dt.value.getFullYear()).toBe(2023)
      expect(dt.value.getMonth()).toBe(5) // June is month 5
    })

    it('accepts null for current time', () => {
      const dt = DateTime('2020-01-01')
      const before = Date.now()
      dt.value = null
      const after = Date.now()
      expect(dt.value.getTime()).toBeGreaterThanOrEqual(before)
      expect(dt.value.getTime()).toBeLessThanOrEqual(after)
    })
  })

  describe('getter (returns Date)', () => {
    it('always returns Date object', () => {
      const dt = DateTime('2024-07-04')
      expect(dt.value).toBeInstanceOf(Date)
    })
  })

  describe('toString', () => {
    it('returns ISO string', () => {
      const dt = DateTime('2024-07-04T12:00:00Z')
      expect(dt.toString()).toContain('2024-07-04')
    })
  })

  describe('callable without new', () => {
    it('works with or without new keyword', () => {
      const dt1 = DateTime(null)
      const dt2 = new DateTime(null)
      expect(dt1).toBeInstanceOf(DateTime)
      expect(dt2).toBeInstanceOf(DateTime)
    })
  })
})
