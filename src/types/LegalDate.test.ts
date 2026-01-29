import { describe, it, expect } from 'bun:test'
import { LegalDate } from './LegalDate'

describe('LegalDate', () => {
  // Fixed dates for deterministic tests
  const date = '2024-06-15'
  const date2 = '2024-06-20'

  describe('isValid', () => {
    it('accepts valid YYYY-MM-DD dates', () => {
      expect(LegalDate.isValid('2024-01-15')).toBe(true)
      expect(LegalDate.isValid('2024-12-31')).toBe(true)
      expect(LegalDate.isValid('2024-02-29')).toBe(true) // Leap year
    })

    it('rejects invalid formats', () => {
      expect(LegalDate.isValid('2024-1-15')).toBe(false) // Missing zero
      expect(LegalDate.isValid('24-01-15')).toBe(false) // 2-digit year
      expect(LegalDate.isValid('2024/01/15')).toBe(false) // Wrong separator
      expect(LegalDate.isValid('2024-01-15T00:00:00Z')).toBe(false) // Has time
    })

    it('rejects invalid dates', () => {
      expect(LegalDate.isValid('2024-02-30')).toBe(false) // Feb 30 doesn't exist
      expect(LegalDate.isValid('2023-02-29')).toBe(false) // Not a leap year
      expect(LegalDate.isValid('2024-13-01')).toBe(false) // Month 13
    })

    it('rejects non-strings', () => {
      expect(LegalDate.isValid(123 as any)).toBe(false)
      expect(LegalDate.isValid(null as any)).toBe(false)
    })
  })

  describe('today', () => {
    it('returns a valid date', () => {
      const result = LegalDate.today()
      expect(LegalDate.isValid(result)).toBe(true)
    })
  })

  describe('from', () => {
    it('creates date from components with 1-based months', () => {
      // January is 1, not 0!
      const result = LegalDate.from(2024, 1, 15)
      expect(result).toBe('2024-01-15')
    })

    it('handles December correctly', () => {
      const result = LegalDate.from(2024, 12, 31)
      expect(result).toBe('2024-12-31')
    })

    it('pads single digits', () => {
      const result = LegalDate.from(2024, 6, 5)
      expect(result).toBe('2024-06-05')
    })

    it('throws on invalid date', () => {
      expect(() => LegalDate.from(2024, 2, 30)).toThrow()
      expect(() => LegalDate.from(2023, 2, 29)).toThrow() // Not leap year
    })
  })

  describe('parse', () => {
    it('parses YYYY-MM-DD', () => {
      const result = LegalDate.parse('2024-01-15')
      expect(result).toBe('2024-01-15')
    })

    it('parses other date formats', () => {
      const result = LegalDate.parse('January 15, 2024')
      expect(LegalDate.year(result)).toBe(2024)
      expect(LegalDate.month(result)).toBe(1)
      expect(LegalDate.day(result)).toBe(15)
    })

    it('throws on invalid input', () => {
      expect(() => LegalDate.parse('not a date')).toThrow()
    })
  })

  describe('tryParse', () => {
    it('returns date on success', () => {
      const result = LegalDate.tryParse('2024-01-15')
      expect(result).toBe('2024-01-15')
    })

    it('returns null on failure', () => {
      const result = LegalDate.tryParse('not a date')
      expect(result).toBeNull()
    })
  })

  describe('arithmetic', () => {
    it('addDays', () => {
      expect(LegalDate.addDays(date, 5)).toBe('2024-06-20')
      expect(LegalDate.addDays(date, -10)).toBe('2024-06-05')
    })

    it('addDays crosses month boundary', () => {
      expect(LegalDate.addDays('2024-01-31', 1)).toBe('2024-02-01')
    })

    it('addWeeks', () => {
      expect(LegalDate.addWeeks(date, 2)).toBe('2024-06-29')
    })

    it('addMonths', () => {
      expect(LegalDate.addMonths(date, 1)).toBe('2024-07-15')
      expect(LegalDate.addMonths(date, -1)).toBe('2024-05-15')
    })

    it('addMonths handles overflow', () => {
      // Jan 31 + 1 month = Feb 29 (2024 is leap year)
      expect(LegalDate.addMonths('2024-01-31', 1)).toBe('2024-02-29')

      // Jan 31 + 1 month = Feb 28 (2023 is not leap year)
      expect(LegalDate.addMonths('2023-01-31', 1)).toBe('2023-02-28')
    })

    it('addYears', () => {
      expect(LegalDate.addYears(date, 1)).toBe('2025-06-15')
      expect(LegalDate.addYears(date, -1)).toBe('2023-06-15')
    })

    it('addYears handles leap years', () => {
      // Feb 29 2024 + 1 year = Feb 28 2025
      expect(LegalDate.addYears('2024-02-29', 1)).toBe('2025-02-28')
    })
  })

  describe('diff', () => {
    it('returns positive when a is after b', () => {
      expect(LegalDate.diff(date2, date)).toBe(5)
    })

    it('returns negative when a is before b', () => {
      expect(LegalDate.diff(date, date2)).toBe(-5)
    })

    it('returns zero for same date', () => {
      expect(LegalDate.diff(date, date)).toBe(0)
    })

    it('diffMonths', () => {
      expect(LegalDate.diffMonths('2024-06-15', '2024-01-15')).toBe(5)
      expect(LegalDate.diffMonths('2024-01-15', '2024-06-15')).toBe(-5)
    })

    it('diffYears', () => {
      expect(LegalDate.diffYears('2024-06-15', '2020-06-15')).toBe(4)
    })
  })

  describe('extractors', () => {
    it('year', () => {
      expect(LegalDate.year(date)).toBe(2024)
    })

    it('month is 1-based', () => {
      expect(LegalDate.month(date)).toBe(6) // June
      expect(LegalDate.month('2024-01-15')).toBe(1) // January = 1
      expect(LegalDate.month('2024-12-15')).toBe(12) // December = 12
    })

    it('day', () => {
      expect(LegalDate.day(date)).toBe(15)
    })

    it('dayOfWeek uses ISO convention (1=Monday, 7=Sunday)', () => {
      // 2024-06-15 is a Saturday
      expect(LegalDate.dayOfWeek(date)).toBe(6)

      // 2024-06-16 is a Sunday
      expect(LegalDate.dayOfWeek('2024-06-16')).toBe(7)

      // 2024-06-17 is a Monday
      expect(LegalDate.dayOfWeek('2024-06-17')).toBe(1)
    })

    it('weekOfYear', () => {
      expect(LegalDate.weekOfYear('2024-01-01')).toBe(1)
      expect(LegalDate.weekOfYear('2024-12-31')).toBeGreaterThanOrEqual(1)
    })

    it('dayOfYear', () => {
      expect(LegalDate.dayOfYear('2024-01-01')).toBe(1)
      expect(LegalDate.dayOfYear('2024-12-31')).toBe(366) // Leap year
      expect(LegalDate.dayOfYear('2023-12-31')).toBe(365) // Non-leap year
    })

    it('quarter', () => {
      expect(LegalDate.quarter('2024-01-15')).toBe(1)
      expect(LegalDate.quarter('2024-04-15')).toBe(2)
      expect(LegalDate.quarter('2024-07-15')).toBe(3)
      expect(LegalDate.quarter('2024-10-15')).toBe(4)
    })
  })

  describe('utilities', () => {
    it('isLeapYear', () => {
      expect(LegalDate.isLeapYear(2024)).toBe(true)
      expect(LegalDate.isLeapYear(2023)).toBe(false)
      expect(LegalDate.isLeapYear(2000)).toBe(true) // Divisible by 400
      expect(LegalDate.isLeapYear(1900)).toBe(false) // Divisible by 100 but not 400
    })

    it('daysInMonth', () => {
      expect(LegalDate.daysInMonth(2024, 1)).toBe(31)
      expect(LegalDate.daysInMonth(2024, 2)).toBe(29) // Leap year
      expect(LegalDate.daysInMonth(2023, 2)).toBe(28) // Non-leap year
      expect(LegalDate.daysInMonth(2024, 4)).toBe(30)
    })

    it('daysInYear', () => {
      expect(LegalDate.daysInYear(2024)).toBe(366)
      expect(LegalDate.daysInYear(2023)).toBe(365)
    })
  })

  describe('conversion', () => {
    it('toTimestamp', () => {
      expect(LegalDate.toTimestamp(date)).toBe('2024-06-15T00:00:00.000Z')
    })

    it('toUnix and fromUnix roundtrip', () => {
      const unix = LegalDate.toUnix(date)
      expect(LegalDate.fromUnix(unix)).toBe(date)
    })
  })

  describe('comparison', () => {
    it('isBefore', () => {
      expect(LegalDate.isBefore(date, date2)).toBe(true)
      expect(LegalDate.isBefore(date2, date)).toBe(false)
      expect(LegalDate.isBefore(date, date)).toBe(false)
    })

    it('isAfter', () => {
      expect(LegalDate.isAfter(date2, date)).toBe(true)
      expect(LegalDate.isAfter(date, date2)).toBe(false)
      expect(LegalDate.isAfter(date, date)).toBe(false)
    })

    it('isEqual', () => {
      expect(LegalDate.isEqual(date, date)).toBe(true)
      expect(LegalDate.isEqual(date, date2)).toBe(false)
    })

    it('min', () => {
      expect(LegalDate.min(date, date2)).toBe(date)
      expect(LegalDate.min(date2, date)).toBe(date)
    })

    it('max', () => {
      expect(LegalDate.max(date, date2)).toBe(date2)
      expect(LegalDate.max(date2, date)).toBe(date2)
    })

    it('isBetween', () => {
      expect(LegalDate.isBetween('2024-06-17', date, date2)).toBe(true)
      expect(LegalDate.isBetween(date, date, date2)).toBe(true) // Inclusive
      expect(LegalDate.isBetween(date2, date, date2)).toBe(true) // Inclusive
      expect(LegalDate.isBetween('2024-06-10', date, date2)).toBe(false)
    })
  })

  describe('boundaries', () => {
    it('startOfMonth', () => {
      expect(LegalDate.startOfMonth(date)).toBe('2024-06-01')
    })

    it('endOfMonth', () => {
      expect(LegalDate.endOfMonth(date)).toBe('2024-06-30')
      expect(LegalDate.endOfMonth('2024-02-15')).toBe('2024-02-29') // Leap year
      expect(LegalDate.endOfMonth('2023-02-15')).toBe('2023-02-28') // Non-leap
    })

    it('startOfQuarter', () => {
      expect(LegalDate.startOfQuarter(date)).toBe('2024-04-01') // Q2
      expect(LegalDate.startOfQuarter('2024-01-15')).toBe('2024-01-01') // Q1
      expect(LegalDate.startOfQuarter('2024-10-15')).toBe('2024-10-01') // Q4
    })

    it('endOfQuarter', () => {
      expect(LegalDate.endOfQuarter(date)).toBe('2024-06-30') // Q2
      expect(LegalDate.endOfQuarter('2024-01-15')).toBe('2024-03-31') // Q1
    })

    it('startOfYear', () => {
      expect(LegalDate.startOfYear(date)).toBe('2024-01-01')
    })

    it('endOfYear', () => {
      expect(LegalDate.endOfYear(date)).toBe('2024-12-31')
    })

    it('startOfWeek (Monday)', () => {
      // 2024-06-15 is Saturday, start of week is Monday 2024-06-10
      expect(LegalDate.startOfWeek(date)).toBe('2024-06-10')

      // 2024-06-17 is Monday, start of week is itself
      expect(LegalDate.startOfWeek('2024-06-17')).toBe('2024-06-17')
    })

    it('endOfWeek (Sunday)', () => {
      // 2024-06-15 is Saturday, end of week is Sunday 2024-06-16
      expect(LegalDate.endOfWeek(date)).toBe('2024-06-16')

      // 2024-06-16 is Sunday, end of week is itself
      expect(LegalDate.endOfWeek('2024-06-16')).toBe('2024-06-16')
    })
  })

  describe('roundtrip consistency', () => {
    it('from -> extractors roundtrip', () => {
      const original = { year: 2024, month: 7, day: 20 }
      const created = LegalDate.from(
        original.year,
        original.month,
        original.day
      )

      expect(LegalDate.year(created)).toBe(original.year)
      expect(LegalDate.month(created)).toBe(original.month)
      expect(LegalDate.day(created)).toBe(original.day)
    })

    it('add and subtract cancel out', () => {
      const original = '2024-06-15'
      const added = LegalDate.addDays(original, 30)
      const subtracted = LegalDate.addDays(added, -30)
      expect(subtracted).toBe(original)
    })

    it('string comparison works correctly', () => {
      // YYYY-MM-DD format sorts lexicographically
      expect('2024-01-01' < '2024-01-02').toBe(true)
      expect('2023-12-31' < '2024-01-01').toBe(true)
    })
  })
})
