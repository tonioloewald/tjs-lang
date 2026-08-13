/**
 * The `Timestamp` meaning flip says something when it bites.
 *
 * In 0.13.0 `Timestamp` and `isValidTimestamp` changed MEANING while keeping their names:
 * ISO 8601 string → epoch milliseconds. Both changes WIDEN the parameter type
 * (`(v: string)` became `(v: unknown)`, and `RuntimeType<T>.check(value: unknown)` never
 * references `T`), so `tsc --strict` reports ZERO diagnostics on the old usage. It simply
 * returns `false` where 0.12.0 returned `true`.
 *
 * No error, no type error, no recorder entry — and it breaks against 0.12.0, not merely
 * against the beta. A silent inversion is the worst shape a breaking change can take,
 * because the consumer's tests go red somewhere unrelated and the cause is invisible.
 *
 * A valid ISO string arriving at the epoch-milliseconds check is unambiguous evidence of
 * the old contract, so it is worth saying so — once per process, following the
 * `configure()` precedent: warn, record, never break the program.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  Timestamp,
  TimestampISO,
  isValidTimestamp,
  isValidISOTimestamp,
  __resetTimestampWarning,
} from './Type'

const ISO = '2024-01-15T10:30:00.000Z'

let warnings: string[]
let originalWarn: typeof console.warn

beforeEach(() => {
  __resetTimestampWarning()
  warnings = []
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(' '))
  }
})

afterEach(() => {
  console.warn = originalWarn
})

describe('the new meaning', () => {
  it('accepts epoch milliseconds', () => {
    expect(isValidTimestamp(Date.parse(ISO))).toBe(true)
    expect(Timestamp.check(1705314600000)).toBe(true)
  })

  it('rejects an ISO string', () => {
    expect(isValidTimestamp(ISO)).toBe(false)
  })

  it('the string form still exists under its own name', () => {
    expect(isValidISOTimestamp(ISO)).toBe(true)
    expect(TimestampISO.check(ISO)).toBe(true)
  })
})

describe('the old usage is not silent', () => {
  it('warns when a valid ISO string is passed', () => {
    isValidTimestamp(ISO)
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toContain('epoch MILLISECONDS')
    // The warning must name the replacement, not just the problem — a diagnostic that
    // does not carry the fix measurably fails to get acted on (ASSUMPTIONS.md A1).
    expect(warnings[0]).toContain('isValidISOTimestamp')
  })

  it('warns through `Timestamp.check` too', () => {
    Timestamp.check(ISO)
    expect(warnings.length).toBe(1)
  })

  it('warns ONCE per process, not per call', () => {
    for (let i = 0; i < 5; i++) isValidTimestamp(ISO)
    expect(warnings.length).toBe(1)
  })

  it('does not warn for an ordinary invalid value', () => {
    // The warning is evidence of the OLD CONTRACT specifically. Firing on every rejection
    // would make it noise, and noise gets filtered out.
    isValidTimestamp('not a timestamp')
    isValidTimestamp(null)
    isValidTimestamp({})
    isValidTimestamp(NaN)
    expect(warnings).toEqual([])
  })

  it('does not warn on the happy path', () => {
    isValidTimestamp(Date.parse(ISO))
    expect(warnings).toEqual([])
  })

  it('returns false regardless — the warning does not change behaviour', () => {
    expect(isValidTimestamp(ISO)).toBe(false)
    expect(isValidTimestamp(ISO)).toBe(false)
  })
})
