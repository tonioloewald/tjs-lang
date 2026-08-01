/**
 * Timestamp — pure functions over epoch milliseconds.
 *
 * A `Timestamp` is a **number**: milliseconds since the Unix epoch, UTC. That choice makes
 * the arithmetic disappear — `diff` is `a - b`, `isBefore` is `a < b`, `min`/`max` are
 * `Math.min`/`Math.max`, and sorting is the default comparator. The previous ISO-string
 * representation had to parse and re-format on every single operation.
 *
 * It also makes `Timestamp.now()` a genuine drop-in for `Date.now()`, which matters: the
 * compiler used to tell people to swap one for the other while they returned different
 * types, so following our own advice silently broke arithmetic.
 *
 * The cost is ergonomic — a raw number is not readable in a log or a JSON dump — and it is
 * paid deliberately, in `iso()` and the `format*` helpers, rather than by making every
 * operation parse and reformat.
 *
 * No Date warts:
 * - Months are 1-based (January = 1)
 * - All functions are pure (number in, number out)
 * - No mutable objects
 * - UTC by default, explicit timezone for display
 */

/**
 * A point in time: milliseconds since the Unix epoch, UTC.
 * Directly comparable, subtractable and sortable.
 */
export type Timestamp = number

/**
 * ISO 8601 timestamp string, e.g. "2024-01-15T10:30:00.000Z".
 * A *rendering* of a Timestamp, not the representation.
 */
export type TimestampString = string

/** Is this a usable Timestamp? */
export function isValid(ts: unknown): ts is Timestamp {
  return typeof ts === 'number' && Number.isFinite(ts)
}

/** Is this string a valid ISO 8601 timestamp? */
export function isValidISO(ts: string): ts is TimestampString {
  if (typeof ts !== 'string') return false
  const t = Date.parse(ts)
  return !Number.isNaN(t) && ts.includes('T')
}

/** The current timestamp. A drop-in for `Date.now()`. */
export function now(): Timestamp {
  return Date.now()
}

/** Render a timestamp as an ISO 8601 string — the readable form. */
export function iso(ts: Timestamp): TimestampString {
  return new Date(ts).toISOString()
}

/**
 * Create a timestamp from components.
 * IMPORTANT: month is 1-based (1 = January, 12 = December)
 */
export function from(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0
): Timestamp {
  // Convert 1-based month to 0-based for Date
  return Date.UTC(year, month - 1, day, hour, minute, second, ms)
}

/** Parse a flexible date string into a timestamp. Throws on invalid input. */
export function parse(input: string): Timestamp {
  const t = Date.parse(input)
  if (Number.isNaN(t)) {
    throw new Error(`Invalid date string: ${input}`)
  }
  return t
}

/** Try to parse a date string, returning null on failure. */
export function tryParse(input: string): Timestamp | null {
  const t = Date.parse(input)
  return Number.isNaN(t) ? null : t
}

// ============================================================================
// Arithmetic — now just addition
// ============================================================================

export function addMilliseconds(ts: Timestamp, ms: number): Timestamp {
  return ts + ms
}

export function addSeconds(ts: Timestamp, seconds: number): Timestamp {
  return ts + seconds * 1000
}

export function addMinutes(ts: Timestamp, minutes: number): Timestamp {
  return ts + minutes * 60_000
}

export function addHours(ts: Timestamp, hours: number): Timestamp {
  return ts + hours * 3_600_000
}

export function addDays(ts: Timestamp, days: number): Timestamp {
  return ts + days * 86_400_000
}

export function addWeeks(ts: Timestamp, weeks: number): Timestamp {
  return ts + weeks * 604_800_000
}

/**
 * Add months, handling overflow correctly (Jan 31 + 1 month = Feb 28/29).
 * Calendar arithmetic is not uniform, so this one still needs a Date internally.
 */
export function addMonths(ts: Timestamp, months: number): Timestamp {
  const d = new Date(ts)
  const targetMonth = d.getUTCMonth() + months
  d.setUTCMonth(targetMonth)

  // If the day changed we overflowed — step back to the last day of the target month.
  if (d.getUTCMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setUTCDate(0)
  }
  return d.getTime()
}

/** Add years, handling leap years correctly (Feb 29 + 1 year = Feb 28). */
export function addYears(ts: Timestamp, years: number): Timestamp {
  const d = new Date(ts)
  const originalDay = d.getUTCDate()
  d.setUTCFullYear(d.getUTCFullYear() + years)

  if (d.getUTCDate() !== originalDay) {
    d.setUTCDate(0)
  }
  return d.getTime()
}

// ============================================================================
// Difference — now just subtraction
// ============================================================================

/** a - b, in milliseconds (positive if a is after b). */
export function diff(a: Timestamp, b: Timestamp): number {
  return a - b
}

export function diffSeconds(a: Timestamp, b: Timestamp): number {
  return Math.floor((a - b) / 1000)
}

export function diffMinutes(a: Timestamp, b: Timestamp): number {
  return Math.floor((a - b) / 60_000)
}

export function diffHours(a: Timestamp, b: Timestamp): number {
  return Math.floor((a - b) / 3_600_000)
}

export function diffDays(a: Timestamp, b: Timestamp): number {
  return Math.floor((a - b) / 86_400_000)
}

// ============================================================================
// Extractors (month is 1-based)
// ============================================================================

export function year(ts: Timestamp): number {
  return new Date(ts).getUTCFullYear()
}

/** 1-based: 1 = January, 12 = December */
export function month(ts: Timestamp): number {
  return new Date(ts).getUTCMonth() + 1
}

export function day(ts: Timestamp): number {
  return new Date(ts).getUTCDate()
}

export function hour(ts: Timestamp): number {
  return new Date(ts).getUTCHours()
}

export function minute(ts: Timestamp): number {
  return new Date(ts).getUTCMinutes()
}

export function second(ts: Timestamp): number {
  return new Date(ts).getUTCSeconds()
}

export function millisecond(ts: Timestamp): number {
  return new Date(ts).getUTCMilliseconds()
}

/** ISO 8601 convention: 1 = Monday, 7 = Sunday */
export function dayOfWeek(ts: Timestamp): number {
  const d = new Date(ts).getUTCDay()
  return d === 0 ? 7 : d
}

// ============================================================================
// Formatting — where the readability is paid back
// ============================================================================

export function toLocal(
  ts: Timestamp,
  timezone?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    ...options,
  }
  return new Intl.DateTimeFormat(undefined, formatOptions).format(new Date(ts))
}

export function format(ts: Timestamp, timezone?: string): string {
  return toLocal(ts, timezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatDate(ts: Timestamp, timezone?: string): string {
  return toLocal(ts, timezone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatTime(ts: Timestamp, timezone?: string): string {
  return toLocal(ts, timezone, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Just the date portion as YYYY-MM-DD (LegalDate format). */
export function toDate(ts: Timestamp): string {
  return iso(ts).slice(0, 10)
}

// ============================================================================
// Comparison — now just operators
// ============================================================================

export function isBefore(a: Timestamp, b: Timestamp): boolean {
  return a < b
}

export function isAfter(a: Timestamp, b: Timestamp): boolean {
  return a > b
}

export function isEqual(a: Timestamp, b: Timestamp): boolean {
  return a === b
}

export function min(a: Timestamp, b: Timestamp): Timestamp {
  return Math.min(a, b)
}

export function max(a: Timestamp, b: Timestamp): Timestamp {
  return Math.max(a, b)
}

// ============================================================================
// Boundaries
// ============================================================================

/** Start of the day (00:00:00.000 UTC) */
export function startOfDay(ts: Timestamp): Timestamp {
  return from(year(ts), month(ts), day(ts))
}

/** End of the day (23:59:59.999 UTC) */
export function endOfDay(ts: Timestamp): Timestamp {
  return from(year(ts), month(ts), day(ts), 23, 59, 59, 999)
}

export function startOfMonth(ts: Timestamp): Timestamp {
  return from(year(ts), month(ts), 1)
}

export function endOfMonth(ts: Timestamp): Timestamp {
  const d = new Date(ts)
  d.setUTCMonth(d.getUTCMonth() + 1, 0) // Day 0 of next month = last day of this month
  d.setUTCHours(23, 59, 59, 999)
  return d.getTime()
}

export function startOfYear(ts: Timestamp): Timestamp {
  return from(year(ts), 1, 1)
}

export function endOfYear(ts: Timestamp): Timestamp {
  return from(year(ts), 12, 31, 23, 59, 59, 999)
}

// ============================================================================
// Default export as namespace
// ============================================================================

export const Timestamp = {
  isValid,
  isValidISO,
  now,
  iso,
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
