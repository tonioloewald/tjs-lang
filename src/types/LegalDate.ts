/**
 * LegalDate - Pure functions for YYYY-MM-DD date strings
 *
 * A "legal date" is a calendar date without time - the kind you see on
 * contracts, birth certificates, and legal documents. It represents a
 * civil date, not a point in time.
 *
 * No Date warts:
 * - Months are 1-based (January = 1)
 * - All functions are pure (string in, string out)
 * - No mutable objects
 * - No timezone confusion (it's just a date)
 */

import { Timestamp } from './Timestamp'

/**
 * Legal date string type: YYYY-MM-DD
 * e.g., "2024-01-15"
 */
export type LegalDateString = string

/**
 * Validate that a string is a valid YYYY-MM-DD date
 */
export function isValid(date: string): date is LegalDateString {
  if (typeof date !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false

  // Parse components
  const y = parseInt(date.slice(0, 4), 10)
  const m = parseInt(date.slice(5, 7), 10)
  const d = parseInt(date.slice(8, 10), 10)

  // Validate ranges
  if (m < 1 || m > 12) return false
  if (d < 1) return false

  // Check day against actual days in month
  const daysInM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const maxDay =
    m === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)
      ? 29
      : daysInM[m - 1]

  return d <= maxDay
}

/**
 * Get today's date as YYYY-MM-DD (in UTC)
 */
export function today(): LegalDateString {
  return Timestamp.toDate(Timestamp.now())
}

/**
 * Get today's date in a specific timezone
 */
export function todayIn(timezone: string): LegalDateString {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(now)
}

/**
 * Create a date from components
 * IMPORTANT: month is 1-based (1 = January, 12 = December)
 */
export function from(
  year: number,
  month: number,
  day: number
): LegalDateString {
  const y = String(year).padStart(4, '0')
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  const result = `${y}-${m}-${d}`

  // Validate it's a real date
  if (!isValid(result)) {
    throw new Error(`Invalid date: ${year}-${month}-${day}`)
  }

  return result
}

/**
 * Parse a flexible date string into YYYY-MM-DD format
 */
export function parse(input: string): LegalDateString {
  // If already in correct format, validate and return
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    if (!isValid(input)) {
      throw new Error(`Invalid date: ${input}`)
    }
    return input
  }

  // Otherwise, try to parse it
  const d = new Date(input)
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${input}`)
  }

  // Extract date components in UTC
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()

  return from(year, month, day)
}

/**
 * Try to parse a date string, returning null on failure
 */
export function tryParse(input: string): LegalDateString | null {
  try {
    return parse(input)
  } catch {
    return null
  }
}

// ============================================================================
// Arithmetic
// ============================================================================

/**
 * Add days to a date
 */
export function addDays(date: LegalDateString, days: number): LegalDateString {
  const ts = toTimestamp(date)
  return Timestamp.toDate(Timestamp.addDays(ts, days))
}

/**
 * Add weeks to a date
 */
export function addWeeks(
  date: LegalDateString,
  weeks: number
): LegalDateString {
  return addDays(date, weeks * 7)
}

/**
 * Add months to a date
 * Handles month overflow correctly (e.g., Jan 31 + 1 month = Feb 28/29)
 */
export function addMonths(
  date: LegalDateString,
  months: number
): LegalDateString {
  const y = year(date)
  const m = month(date)
  const d = day(date)

  // Calculate target month
  const totalMonths = y * 12 + (m - 1) + months
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonth = (totalMonths % 12) + 1

  // Get last day of target month
  const lastDay = daysInMonth(targetYear, targetMonth)
  const targetDay = Math.min(d, lastDay)

  return from(targetYear, targetMonth, targetDay)
}

/**
 * Add years to a date
 * Handles leap years correctly (Feb 29 + 1 year = Feb 28)
 */
export function addYears(
  date: LegalDateString,
  years: number
): LegalDateString {
  const y = year(date)
  const m = month(date)
  const d = day(date)

  const targetYear = y + years
  const lastDay = daysInMonth(targetYear, m)
  const targetDay = Math.min(d, lastDay)

  return from(targetYear, m, targetDay)
}

// ============================================================================
// Difference
// ============================================================================

/**
 * Get the difference between two dates in days
 * Returns a - b (positive if a is after b)
 */
export function diff(a: LegalDateString, b: LegalDateString): number {
  const msPerDay = 24 * 60 * 60 * 1000
  const aMs = new Date(a + 'T00:00:00Z').getTime()
  const bMs = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((aMs - bMs) / msPerDay)
}

/**
 * Get the difference in complete months
 */
export function diffMonths(a: LegalDateString, b: LegalDateString): number {
  const aYear = year(a)
  const aMonth = month(a)
  const bYear = year(b)
  const bMonth = month(b)

  return (aYear - bYear) * 12 + (aMonth - bMonth)
}

/**
 * Get the difference in complete years
 */
export function diffYears(a: LegalDateString, b: LegalDateString): number {
  return year(a) - year(b)
}

// ============================================================================
// Extractors (all return 1-based month)
// ============================================================================

/**
 * Get the year component
 */
export function year(date: LegalDateString): number {
  return parseInt(date.slice(0, 4), 10)
}

/**
 * Get the month component (1-based: 1 = January, 12 = December)
 */
export function month(date: LegalDateString): number {
  return parseInt(date.slice(5, 7), 10)
}

/**
 * Get the day of month component (1-31)
 */
export function day(date: LegalDateString): number {
  return parseInt(date.slice(8, 10), 10)
}

/**
 * Get the day of week (1 = Monday, 7 = Sunday) - ISO 8601 convention
 */
export function dayOfWeek(date: LegalDateString): number {
  const d = new Date(date + 'T00:00:00Z').getUTCDay()
  return d === 0 ? 7 : d // Convert Sunday from 0 to 7
}

/**
 * Get the ISO week number (1-53)
 */
export function weekOfYear(date: LegalDateString): number {
  const d = new Date(date + 'T00:00:00Z')
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Get the day of year (1-366)
 */
export function dayOfYear(date: LegalDateString): number {
  const start = from(year(date), 1, 1)
  return diff(date, start) + 1
}

/**
 * Get the quarter (1-4)
 */
export function quarter(date: LegalDateString): number {
  return Math.ceil(month(date) / 3)
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if a year is a leap year
 */
export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/**
 * Get the number of days in a month
 * Month is 1-based (1 = January)
 */
export function daysInMonth(y: number, m: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (m === 2 && isLeapYear(y)) return 29
  return days[m - 1]
}

/**
 * Get the number of days in a year
 */
export function daysInYear(y: number): number {
  return isLeapYear(y) ? 366 : 365
}

// ============================================================================
// Conversion
// ============================================================================

/**
 * Convert to ISO timestamp (midnight UTC)
 */
export function toTimestamp(date: LegalDateString): string {
  return date + 'T00:00:00.000Z'
}

/**
 * Convert to Unix timestamp (seconds since epoch, midnight UTC)
 */
export function toUnix(date: LegalDateString): number {
  return Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000)
}

/**
 * Create from Unix timestamp (seconds since epoch)
 */
export function fromUnix(unix: number): LegalDateString {
  const d = new Date(unix * 1000)
  return from(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format a date for display
 */
export function format(
  date: LegalDateString,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = new Date(date + 'T00:00:00Z')
  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'UTC',
    ...options,
  }
  return new Intl.DateTimeFormat(undefined, formatOptions).format(d)
}

/**
 * Format as a readable date string
 */
export function formatLong(date: LegalDateString): string {
  return format(date, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Format as a short date string
 */
export function formatShort(date: LegalDateString): string {
  return format(date, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ============================================================================
// Comparison
// ============================================================================

/**
 * Check if a is before b
 */
export function isBefore(a: LegalDateString, b: LegalDateString): boolean {
  return a < b
}

/**
 * Check if a is after b
 */
export function isAfter(a: LegalDateString, b: LegalDateString): boolean {
  return a > b
}

/**
 * Check if two dates are equal
 */
export function isEqual(a: LegalDateString, b: LegalDateString): boolean {
  return a === b
}

/**
 * Get the earlier of two dates
 */
export function min(a: LegalDateString, b: LegalDateString): LegalDateString {
  return a < b ? a : b
}

/**
 * Get the later of two dates
 */
export function max(a: LegalDateString, b: LegalDateString): LegalDateString {
  return a > b ? a : b
}

/**
 * Check if a date is between two other dates (inclusive)
 */
export function isBetween(
  date: LegalDateString,
  start: LegalDateString,
  end: LegalDateString
): boolean {
  return date >= start && date <= end
}

// ============================================================================
// Boundaries
// ============================================================================

/**
 * Get the first day of the month
 */
export function startOfMonth(date: LegalDateString): LegalDateString {
  return from(year(date), month(date), 1)
}

/**
 * Get the last day of the month
 */
export function endOfMonth(date: LegalDateString): LegalDateString {
  const y = year(date)
  const m = month(date)
  return from(y, m, daysInMonth(y, m))
}

/**
 * Get the first day of the quarter
 */
export function startOfQuarter(date: LegalDateString): LegalDateString {
  const q = quarter(date)
  const m = (q - 1) * 3 + 1
  return from(year(date), m, 1)
}

/**
 * Get the last day of the quarter
 */
export function endOfQuarter(date: LegalDateString): LegalDateString {
  const q = quarter(date)
  const m = q * 3
  return from(year(date), m, daysInMonth(year(date), m))
}

/**
 * Get the first day of the year
 */
export function startOfYear(date: LegalDateString): LegalDateString {
  return from(year(date), 1, 1)
}

/**
 * Get the last day of the year
 */
export function endOfYear(date: LegalDateString): LegalDateString {
  return from(year(date), 12, 31)
}

/**
 * Get the first day of the week (Monday)
 */
export function startOfWeek(date: LegalDateString): LegalDateString {
  const dow = dayOfWeek(date)
  return addDays(date, -(dow - 1))
}

/**
 * Get the last day of the week (Sunday)
 */
export function endOfWeek(date: LegalDateString): LegalDateString {
  const dow = dayOfWeek(date)
  return addDays(date, 7 - dow)
}

// ============================================================================
// Default export as namespace
// ============================================================================

export const LegalDate = {
  isValid,
  today,
  todayIn,
  from,
  parse,
  tryParse,
  // Arithmetic
  addDays,
  addWeeks,
  addMonths,
  addYears,
  // Difference
  diff,
  diffMonths,
  diffYears,
  // Extractors
  year,
  month,
  day,
  dayOfWeek,
  weekOfYear,
  dayOfYear,
  quarter,
  // Utilities
  isLeapYear,
  daysInMonth,
  daysInYear,
  // Conversion
  toTimestamp,
  toUnix,
  fromUnix,
  // Formatting
  format,
  formatLong,
  formatShort,
  // Comparison
  isBefore,
  isAfter,
  isEqual,
  min,
  max,
  isBetween,
  // Boundaries
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  startOfWeek,
  endOfWeek,
}

export default LegalDate
