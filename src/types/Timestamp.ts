/**
 * Timestamp - Pure functions for ISO 8601 timestamp strings
 *
 * No Date warts:
 * - Months are 1-based (January = 1)
 * - All functions are pure (string in, string out)
 * - No mutable objects
 * - UTC by default, explicit timezone for display
 */

/**
 * ISO 8601 timestamp string type
 * e.g., "2024-01-15T10:30:00.000Z"
 */
export type TimestampString = string

/**
 * Validate that a string is a valid ISO 8601 timestamp
 */
export function isValid(ts: string): ts is TimestampString {
  if (typeof ts !== 'string') return false
  const d = new Date(ts)
  return !isNaN(d.getTime()) && ts.includes('T')
}

/**
 * Get the current timestamp as ISO string
 */
export function now(): TimestampString {
  return new Date().toISOString()
}

/**
 * Create a timestamp from components
 * IMPORTANT: month is 1-based (1 = January, 12 = December)
 */
export function from(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0,
  ms: number = 0
): TimestampString {
  // Convert 1-based month to 0-based for Date
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms))
  return d.toISOString()
}

/**
 * Parse a flexible date string into ISO timestamp
 * Handles various formats and normalizes to UTC
 */
export function parse(input: string): TimestampString {
  const d = new Date(input)
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${input}`)
  }
  return d.toISOString()
}

/**
 * Try to parse a date string, returning null on failure
 */
export function tryParse(input: string): TimestampString | null {
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
 * Add milliseconds to a timestamp
 */
export function addMilliseconds(ts: TimestampString, ms: number): TimestampString {
  const d = new Date(ts)
  d.setTime(d.getTime() + ms)
  return d.toISOString()
}

/**
 * Add seconds to a timestamp
 */
export function addSeconds(ts: TimestampString, seconds: number): TimestampString {
  return addMilliseconds(ts, seconds * 1000)
}

/**
 * Add minutes to a timestamp
 */
export function addMinutes(ts: TimestampString, minutes: number): TimestampString {
  return addMilliseconds(ts, minutes * 60 * 1000)
}

/**
 * Add hours to a timestamp
 */
export function addHours(ts: TimestampString, hours: number): TimestampString {
  return addMilliseconds(ts, hours * 60 * 60 * 1000)
}

/**
 * Add days to a timestamp
 */
export function addDays(ts: TimestampString, days: number): TimestampString {
  return addMilliseconds(ts, days * 24 * 60 * 60 * 1000)
}

/**
 * Add weeks to a timestamp
 */
export function addWeeks(ts: TimestampString, weeks: number): TimestampString {
  return addDays(ts, weeks * 7)
}

/**
 * Add months to a timestamp
 * Handles month overflow correctly (e.g., Jan 31 + 1 month = Feb 28/29)
 */
export function addMonths(ts: TimestampString, months: number): TimestampString {
  const d = new Date(ts)
  const targetMonth = d.getUTCMonth() + months
  d.setUTCMonth(targetMonth)

  // Handle overflow (e.g., Jan 31 + 1 month shouldn't become Mar 3)
  // If the day changed, we overflowed - go back to last day of target month
  const expectedMonth = ((d.getUTCMonth() - months) % 12 + 12) % 12
  if (d.getUTCMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setUTCDate(0) // Last day of previous month
  }

  return d.toISOString()
}

/**
 * Add years to a timestamp
 * Handles leap years correctly (Feb 29 + 1 year = Feb 28)
 */
export function addYears(ts: TimestampString, years: number): TimestampString {
  const d = new Date(ts)
  const originalDay = d.getUTCDate()
  d.setUTCFullYear(d.getUTCFullYear() + years)

  // Handle Feb 29 -> Feb 28 in non-leap years
  if (d.getUTCDate() !== originalDay) {
    d.setUTCDate(0) // Last day of previous month
  }

  return d.toISOString()
}

// ============================================================================
// Difference
// ============================================================================

/**
 * Get the difference between two timestamps in milliseconds
 * Returns a - b (positive if a is after b)
 */
export function diff(a: TimestampString, b: TimestampString): number {
  return new Date(a).getTime() - new Date(b).getTime()
}

/**
 * Get the difference in seconds
 */
export function diffSeconds(a: TimestampString, b: TimestampString): number {
  return Math.floor(diff(a, b) / 1000)
}

/**
 * Get the difference in minutes
 */
export function diffMinutes(a: TimestampString, b: TimestampString): number {
  return Math.floor(diff(a, b) / (60 * 1000))
}

/**
 * Get the difference in hours
 */
export function diffHours(a: TimestampString, b: TimestampString): number {
  return Math.floor(diff(a, b) / (60 * 60 * 1000))
}

/**
 * Get the difference in days
 */
export function diffDays(a: TimestampString, b: TimestampString): number {
  return Math.floor(diff(a, b) / (24 * 60 * 60 * 1000))
}

// ============================================================================
// Extractors (all return 1-based month)
// ============================================================================

/**
 * Get the year component
 */
export function year(ts: TimestampString): number {
  return new Date(ts).getUTCFullYear()
}

/**
 * Get the month component (1-based: 1 = January, 12 = December)
 */
export function month(ts: TimestampString): number {
  return new Date(ts).getUTCMonth() + 1
}

/**
 * Get the day of month component (1-31)
 */
export function day(ts: TimestampString): number {
  return new Date(ts).getUTCDate()
}

/**
 * Get the hour component (0-23)
 */
export function hour(ts: TimestampString): number {
  return new Date(ts).getUTCHours()
}

/**
 * Get the minute component (0-59)
 */
export function minute(ts: TimestampString): number {
  return new Date(ts).getUTCMinutes()
}

/**
 * Get the second component (0-59)
 */
export function second(ts: TimestampString): number {
  return new Date(ts).getUTCSeconds()
}

/**
 * Get the millisecond component (0-999)
 */
export function millisecond(ts: TimestampString): number {
  return new Date(ts).getUTCMilliseconds()
}

/**
 * Get the day of week (1 = Monday, 7 = Sunday) - ISO 8601 convention
 */
export function dayOfWeek(ts: TimestampString): number {
  const d = new Date(ts).getUTCDay()
  return d === 0 ? 7 : d // Convert Sunday from 0 to 7
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format a timestamp for local display
 * Uses Intl.DateTimeFormat for timezone-aware formatting
 */
export function toLocal(
  ts: TimestampString,
  timezone?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = new Date(ts)
  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    ...options,
  }
  return new Intl.DateTimeFormat(undefined, formatOptions).format(d)
}

/**
 * Format as a readable date/time string
 */
export function format(
  ts: TimestampString,
  timezone?: string
): string {
  return toLocal(ts, timezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Format as date only (no time)
 */
export function formatDate(ts: TimestampString, timezone?: string): string {
  return toLocal(ts, timezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format as time only (no date)
 */
export function formatTime(ts: TimestampString, timezone?: string): string {
  return toLocal(ts, timezone, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Extract just the date portion as YYYY-MM-DD (LegalDate format)
 */
export function toDate(ts: TimestampString): string {
  return ts.slice(0, 10)
}

// ============================================================================
// Comparison
// ============================================================================

/**
 * Check if a is before b
 */
export function isBefore(a: TimestampString, b: TimestampString): boolean {
  return diff(a, b) < 0
}

/**
 * Check if a is after b
 */
export function isAfter(a: TimestampString, b: TimestampString): boolean {
  return diff(a, b) > 0
}

/**
 * Check if two timestamps are equal
 */
export function isEqual(a: TimestampString, b: TimestampString): boolean {
  return diff(a, b) === 0
}

/**
 * Get the earlier of two timestamps
 */
export function min(a: TimestampString, b: TimestampString): TimestampString {
  return isBefore(a, b) ? a : b
}

/**
 * Get the later of two timestamps
 */
export function max(a: TimestampString, b: TimestampString): TimestampString {
  return isAfter(a, b) ? a : b
}

// ============================================================================
// Boundaries
// ============================================================================

/**
 * Get the start of the day (00:00:00.000 UTC)
 */
export function startOfDay(ts: TimestampString): TimestampString {
  return from(year(ts), month(ts), day(ts))
}

/**
 * Get the end of the day (23:59:59.999 UTC)
 */
export function endOfDay(ts: TimestampString): TimestampString {
  return from(year(ts), month(ts), day(ts), 23, 59, 59, 999)
}

/**
 * Get the start of the month
 */
export function startOfMonth(ts: TimestampString): TimestampString {
  return from(year(ts), month(ts), 1)
}

/**
 * Get the end of the month
 */
export function endOfMonth(ts: TimestampString): TimestampString {
  const d = new Date(ts)
  d.setUTCMonth(d.getUTCMonth() + 1, 0) // Day 0 of next month = last day of this month
  d.setUTCHours(23, 59, 59, 999)
  return d.toISOString()
}

/**
 * Get the start of the year
 */
export function startOfYear(ts: TimestampString): TimestampString {
  return from(year(ts), 1, 1)
}

/**
 * Get the end of the year
 */
export function endOfYear(ts: TimestampString): TimestampString {
  return from(year(ts), 12, 31, 23, 59, 59, 999)
}

// ============================================================================
// Default export as namespace
// ============================================================================

export const Timestamp = {
  isValid,
  now,
  from,
  parse,
  tryParse,
  // Arithmetic
  addMilliseconds,
  addSeconds,
  addMinutes,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  // Difference
  diff,
  diffSeconds,
  diffMinutes,
  diffHours,
  diffDays,
  // Extractors
  year,
  month,
  day,
  hour,
  minute,
  second,
  millisecond,
  dayOfWeek,
  // Formatting
  toLocal,
  format,
  formatDate,
  formatTime,
  toDate,
  // Comparison
  isBefore,
  isAfter,
  isEqual,
  min,
  max,
  // Boundaries
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
}

export default Timestamp
