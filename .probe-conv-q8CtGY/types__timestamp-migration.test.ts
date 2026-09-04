/* tjs <- input.ts */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import {
  Timestamp,
  TimestampISO,
  isValidTimestamp,
  isValidISOTimestamp,
  __resetTimestampWarning,
} from '/Users/tonioloewald/tjs-lang/src/types/Type'

const ISO = '2024-01-15T10:30:00.000Z'

let warnings

let originalWarn

beforeEach(() => {
  __resetTimestampWarning()
  warnings = []
  originalWarn = console.warn
  console.warn = (...args) => {
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
