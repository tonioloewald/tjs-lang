import { describe, it, expect } from 'bun:test'
import { Timestamp } from './Timestamp'

describe('Timestamp', () => {
  // Fixed timestamp for deterministic tests
  const ts = '2024-06-15T14:30:45.123Z'
  const ts2 = '2024-06-20T10:00:00.000Z'

  describe('isValid', () => {
    it('accepts valid ISO timestamps', () => {
      expect(Timestamp.isValid('2024-01-15T10:30:00.000Z')).toBe(true)
      expect(Timestamp.isValid('2024-12-31T23:59:59.999Z')).toBe(true)
      expect(Timestamp.isValid(ts)).toBe(true)
    })

    it('rejects invalid strings', () => {
      expect(Timestamp.isValid('not a date')).toBe(false)
      expect(Timestamp.isValid('2024-01-15')).toBe(false) // No T
      expect(Timestamp.isValid('')).toBe(false)
    })

    it('rejects non-strings', () => {
      expect(Timestamp.isValid(123 as any)).toBe(false)
      expect(Timestamp.isValid(null as any)).toBe(false)
    })
  })

  describe('now', () => {
    it('returns a valid ISO timestamp', () => {
      const result = Timestamp.now()
      expect(Timestamp.isValid(result)).toBe(true)
    })

    it('returns current time (roughly)', () => {
      const before = Date.now()
      const result = Timestamp.now()
      const after = Date.now()
      const resultMs = new Date(result).getTime()
      expect(resultMs).toBeGreaterThanOrEqual(before)
      expect(resultMs).toBeLessThanOrEqual(after)
    })
  })

  describe('from', () => {
    it('creates timestamp from components with 1-based months', () => {
      // January is 1, not 0!
      const result = Timestamp.from(2024, 1, 15, 10, 30, 45, 123)
      expect(result).toBe('2024-01-15T10:30:45.123Z')
    })

    it('handles December correctly', () => {
      const result = Timestamp.from(2024, 12, 31, 23, 59, 59, 999)
      expect(result).toBe('2024-12-31T23:59:59.999Z')
    })

    it('defaults time components to zero', () => {
      const result = Timestamp.from(2024, 6, 15)
      expect(result).toBe('2024-06-15T00:00:00.000Z')
    })

    it('handles partial time components', () => {
      const result = Timestamp.from(2024, 6, 15, 14)
      expect(result).toBe('2024-06-15T14:00:00.000Z')

      const result2 = Timestamp.from(2024, 6, 15, 14, 30)
      expect(result2).toBe('2024-06-15T14:30:00.000Z')
    })
  })

  describe('parse', () => {
    it('parses ISO strings', () => {
      const result = Timestamp.parse('2024-01-15T10:30:00Z')
      expect(Timestamp.isValid(result)).toBe(true)
    })

    it('parses various date formats', () => {
      // These depend on the JS engine but should generally work
      const result1 = Timestamp.parse('2024-01-15')
      expect(Timestamp.year(result1)).toBe(2024)
      expect(Timestamp.month(result1)).toBe(1)
      expect(Timestamp.day(result1)).toBe(15)
    })

    it('throws on invalid input', () => {
      expect(() => Timestamp.parse('not a date')).toThrow()
    })
  })

  describe('tryParse', () => {
    it('returns timestamp on success', () => {
      const result = Timestamp.tryParse('2024-01-15T10:30:00Z')
      expect(result).not.toBeNull()
      expect(Timestamp.isValid(result!)).toBe(true)
    })

    it('returns null on failure', () => {
      const result = Timestamp.tryParse('not a date')
      expect(result).toBeNull()
    })
  })

  describe('arithmetic', () => {
    it('addMilliseconds', () => {
      const result = Timestamp.addMilliseconds(ts, 100)
      expect(Timestamp.millisecond(result)).toBe(223)
    })

    it('addSeconds', () => {
      const result = Timestamp.addSeconds(ts, 30)
      expect(Timestamp.second(result)).toBe(15) // 45 + 30 = 75 -> 15 (overflow)
      expect(Timestamp.minute(result)).toBe(31) // Minute incremented
    })

    it('addMinutes', () => {
      const result = Timestamp.addMinutes(ts, 45)
      expect(Timestamp.minute(result)).toBe(15) // 30 + 45 = 75 -> 15
      expect(Timestamp.hour(result)).toBe(15) // Hour incremented
    })

    it('addHours', () => {
      const result = Timestamp.addHours(ts, 12)
      expect(Timestamp.hour(result)).toBe(2) // 14 + 12 = 26 -> 2
      expect(Timestamp.day(result)).toBe(16) // Day incremented
    })

    it('addDays', () => {
      const result = Timestamp.addDays(ts, 20)
      expect(Timestamp.day(result)).toBe(5) // 15 + 20 = 35 -> 5 July
      expect(Timestamp.month(result)).toBe(7)
    })

    it('addWeeks', () => {
      const result = Timestamp.addWeeks(ts, 2)
      expect(Timestamp.day(result)).toBe(29)
    })

    it('addMonths handles overflow', () => {
      // Jan 31 + 1 month should be Feb 28/29, not Mar 2/3
      const jan31 = Timestamp.from(2024, 1, 31)
      const result = Timestamp.addMonths(jan31, 1)
      expect(Timestamp.month(result)).toBe(2)
      expect(Timestamp.day(result)).toBeLessThanOrEqual(29)
    })

    it('addYears handles leap years', () => {
      // Feb 29 2024 + 1 year should be Feb 28 2025
      const feb29 = Timestamp.from(2024, 2, 29)
      const result = Timestamp.addYears(feb29, 1)
      expect(Timestamp.year(result)).toBe(2025)
      expect(Timestamp.month(result)).toBe(2)
      expect(Timestamp.day(result)).toBe(28)
    })

    it('handles negative values', () => {
      const result = Timestamp.addDays(ts, -10)
      expect(Timestamp.day(result)).toBe(5)
      expect(Timestamp.month(result)).toBe(6)
    })
  })

  describe('diff', () => {
    it('returns positive when a is after b', () => {
      expect(Timestamp.diff(ts2, ts)).toBeGreaterThan(0)
    })

    it('returns negative when a is before b', () => {
      expect(Timestamp.diff(ts, ts2)).toBeLessThan(0)
    })

    it('returns zero for same timestamp', () => {
      expect(Timestamp.diff(ts, ts)).toBe(0)
    })

    it('diffDays calculates correctly', () => {
      const a = Timestamp.from(2024, 1, 15)
      const b = Timestamp.from(2024, 1, 10)
      expect(Timestamp.diffDays(a, b)).toBe(5)
    })

    it('diffHours calculates correctly', () => {
      const a = Timestamp.from(2024, 1, 15, 14)
      const b = Timestamp.from(2024, 1, 15, 10)
      expect(Timestamp.diffHours(a, b)).toBe(4)
    })
  })

  describe('extractors', () => {
    it('year', () => {
      expect(Timestamp.year(ts)).toBe(2024)
    })

    it('month is 1-based', () => {
      expect(Timestamp.month(ts)).toBe(6) // June
      expect(Timestamp.month(Timestamp.from(2024, 1, 1))).toBe(1) // January = 1
      expect(Timestamp.month(Timestamp.from(2024, 12, 1))).toBe(12) // December = 12
    })

    it('day', () => {
      expect(Timestamp.day(ts)).toBe(15)
    })

    it('hour', () => {
      expect(Timestamp.hour(ts)).toBe(14)
    })

    it('minute', () => {
      expect(Timestamp.minute(ts)).toBe(30)
    })

    it('second', () => {
      expect(Timestamp.second(ts)).toBe(45)
    })

    it('millisecond', () => {
      expect(Timestamp.millisecond(ts)).toBe(123)
    })

    it('dayOfWeek uses ISO convention (1=Monday, 7=Sunday)', () => {
      // 2024-06-15 is a Saturday
      expect(Timestamp.dayOfWeek(ts)).toBe(6)

      // 2024-06-16 is a Sunday
      const sunday = Timestamp.from(2024, 6, 16)
      expect(Timestamp.dayOfWeek(sunday)).toBe(7)

      // 2024-06-17 is a Monday
      const monday = Timestamp.from(2024, 6, 17)
      expect(Timestamp.dayOfWeek(monday)).toBe(1)
    })
  })

  describe('formatting', () => {
    it('toDate extracts YYYY-MM-DD', () => {
      expect(Timestamp.toDate(ts)).toBe('2024-06-15')
    })

    it('toLocal returns localized string', () => {
      const result = Timestamp.toLocal(ts, 'UTC')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('format returns readable string', () => {
      const result = Timestamp.format(ts, 'UTC')
      expect(result).toContain('2024')
    })
  })

  describe('comparison', () => {
    it('isBefore', () => {
      expect(Timestamp.isBefore(ts, ts2)).toBe(true)
      expect(Timestamp.isBefore(ts2, ts)).toBe(false)
      expect(Timestamp.isBefore(ts, ts)).toBe(false)
    })

    it('isAfter', () => {
      expect(Timestamp.isAfter(ts2, ts)).toBe(true)
      expect(Timestamp.isAfter(ts, ts2)).toBe(false)
      expect(Timestamp.isAfter(ts, ts)).toBe(false)
    })

    it('isEqual', () => {
      expect(Timestamp.isEqual(ts, ts)).toBe(true)
      expect(Timestamp.isEqual(ts, ts2)).toBe(false)
    })

    it('min', () => {
      expect(Timestamp.min(ts, ts2)).toBe(ts)
      expect(Timestamp.min(ts2, ts)).toBe(ts)
    })

    it('max', () => {
      expect(Timestamp.max(ts, ts2)).toBe(ts2)
      expect(Timestamp.max(ts2, ts)).toBe(ts2)
    })
  })

  describe('boundaries', () => {
    it('startOfDay', () => {
      const result = Timestamp.startOfDay(ts)
      expect(result).toBe('2024-06-15T00:00:00.000Z')
    })

    it('endOfDay', () => {
      const result = Timestamp.endOfDay(ts)
      expect(result).toBe('2024-06-15T23:59:59.999Z')
    })

    it('startOfMonth', () => {
      const result = Timestamp.startOfMonth(ts)
      expect(result).toBe('2024-06-01T00:00:00.000Z')
    })

    it('endOfMonth', () => {
      const result = Timestamp.endOfMonth(ts)
      expect(Timestamp.day(result)).toBe(30) // June has 30 days
      expect(Timestamp.hour(result)).toBe(23)
      expect(Timestamp.minute(result)).toBe(59)
    })

    it('endOfMonth handles different month lengths', () => {
      const jan = Timestamp.from(2024, 1, 15)
      expect(Timestamp.day(Timestamp.endOfMonth(jan))).toBe(31)

      const feb = Timestamp.from(2024, 2, 15) // 2024 is leap year
      expect(Timestamp.day(Timestamp.endOfMonth(feb))).toBe(29)

      const feb2023 = Timestamp.from(2023, 2, 15) // 2023 is not leap year
      expect(Timestamp.day(Timestamp.endOfMonth(feb2023))).toBe(28)
    })

    it('startOfYear', () => {
      const result = Timestamp.startOfYear(ts)
      expect(result).toBe('2024-01-01T00:00:00.000Z')
    })

    it('endOfYear', () => {
      const result = Timestamp.endOfYear(ts)
      expect(result).toBe('2024-12-31T23:59:59.999Z')
    })
  })

  describe('roundtrip consistency', () => {
    it('from -> extractors roundtrip', () => {
      const original = { year: 2024, month: 7, day: 20, hour: 15, minute: 45, second: 30, ms: 500 }
      const created = Timestamp.from(
        original.year,
        original.month,
        original.day,
        original.hour,
        original.minute,
        original.second,
        original.ms
      )

      expect(Timestamp.year(created)).toBe(original.year)
      expect(Timestamp.month(created)).toBe(original.month)
      expect(Timestamp.day(created)).toBe(original.day)
      expect(Timestamp.hour(created)).toBe(original.hour)
      expect(Timestamp.minute(created)).toBe(original.minute)
      expect(Timestamp.second(created)).toBe(original.second)
      expect(Timestamp.millisecond(created)).toBe(original.ms)
    })

    it('add and subtract cancel out', () => {
      const original = Timestamp.from(2024, 6, 15, 12, 0, 0)
      const added = Timestamp.addDays(original, 30)
      const subtracted = Timestamp.addDays(added, -30)
      expect(subtracted).toBe(original)
    })
  })
})
