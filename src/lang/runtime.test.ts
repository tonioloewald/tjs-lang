/**
 * TJS Runtime Tests - Monadic Errors with Location Info
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import {
  isError,
  error,
  validateArgs,
  wrap,
  configure,
  getConfig,
  getStack,
  TJSError,
} from './runtime'

describe('TJS Runtime - Monadic Errors', () => {
  beforeEach(() => {
    // Reset to non-debug mode before each test
    configure({ debug: false })
  })

  describe('error creation', () => {
    it('creates basic error with path', () => {
      const err = error('Invalid value', { path: 'greet.name' })
      expect(err.$error).toBe(true)
      expect(err.message).toBe('Invalid value')
      expect(err.path).toBe('greet.name')
    })

    it('includes source location in error', () => {
      const err = error('Type mismatch', {
        path: 'greet.name',
        loc: { start: 15, end: 29 },
      })
      expect(err.loc).toEqual({ start: 15, end: 29 })
    })

    it('does not include stack in non-debug mode', () => {
      const err = error('Error', { path: 'test' })
      expect(err.stack).toBeUndefined()
    })
  })

  describe('debug mode - call stacks', () => {
    beforeEach(() => {
      configure({ debug: true })
    })

    it('captures call stack in debug mode', () => {
      // Simulate call stack: main -> processUser -> greet
      const greet = wrap(
        function greet(name: string) {
          return `Hello, ${name}!`
        },
        {
          params: {
            name: {
              type: 'string',
              required: true,
              loc: { start: 15, end: 29 },
            },
          },
        }
      )

      const processUser = wrap(
        function processUser(name: any) {
          return greet(name)
        },
        { params: { name: { type: 'any', required: true } } }
      )

      const main = wrap(
        function main() {
          return processUser(123) // Wrong type - number instead of string
        },
        { params: {} }
      )

      const result = main()
      expect(isError(result)).toBe(true)
      const err = result as TJSError
      expect(err.path).toBe('greet.name')
      expect(err.loc).toEqual({ start: 15, end: 29 })
      expect(err.stack).toContain('main')
      expect(err.stack).toContain('processUser')
      expect(err.stack).toContain('greet.name')
    })

    it('stack shows full call chain', () => {
      const inner = wrap(
        function inner(x: number) {
          return x * 2
        },
        { params: { x: { type: 'number', required: true } } }
      )

      const middle = wrap(
        function middle(val: any) {
          return inner(val)
        },
        { params: { val: { type: 'any', required: true } } }
      )

      const outer = wrap(
        function outer() {
          return middle('not a number')
        },
        { params: {} }
      )

      const result = outer()
      expect(isError(result)).toBe(true)
      const err = result as TJSError
      expect(err.stack).toEqual(['outer', 'middle', 'inner', 'inner.x'])
    })
  })

  describe('validateArgs with location', () => {
    it('includes loc in missing param error', () => {
      const err = validateArgs(
        {},
        {
          params: {
            name: {
              type: 'string',
              required: true,
              loc: { start: 10, end: 20 },
            },
          },
        },
        'greet'
      )

      expect(err).not.toBeNull()
      expect(err!.path).toBe('greet.name')
      expect(err!.loc).toEqual({ start: 10, end: 20 })
    })

    it('includes loc in type mismatch error', () => {
      const err = validateArgs(
        { count: 'not a number' },
        {
          params: {
            count: {
              type: 'number',
              required: true,
              loc: { start: 25, end: 35 },
            },
          },
        },
        'repeat'
      )

      expect(err).not.toBeNull()
      expect(err!.path).toBe('repeat.count')
      expect(err!.loc).toEqual({ start: 25, end: 35 })
      expect(err!.expected).toBe('number')
      expect(err!.actual).toBe('string')
    })
  })

  describe('error propagation', () => {
    it('propagates errors through wrapped functions', () => {
      const step1 = wrap(
        function step1(x: number) {
          return error('Something went wrong', {
            path: 'step1',
            loc: { start: 0, end: 10 },
          })
        },
        { params: { x: { type: 'number', required: true } } }
      )

      const step2 = wrap(
        function step2(val: any) {
          // This should receive and propagate the error
          return step1(val)
        },
        { params: { val: { type: 'any', required: true } } }
      )

      const result = step2(42)
      expect(isError(result)).toBe(true)
      expect((result as TJSError).path).toBe('step1')
      expect((result as TJSError).loc).toEqual({ start: 0, end: 10 })
    })

    it('passes through error arguments without processing', () => {
      const fn = wrap(
        function fn(x: number) {
          return x * 2
        },
        { params: { x: { type: 'number', required: true } } }
      )

      const inputError = error('Upstream error', { path: 'upstream' })
      const result = fn(inputError as any)

      expect(isError(result)).toBe(true)
      expect((result as TJSError).path).toBe('upstream')
    })
  })

  describe('source location format', () => {
    it('loc contains start and end positions', () => {
      const err = error('Test', { loc: { start: 100, end: 150 } })
      expect(typeof err.loc?.start).toBe('number')
      expect(typeof err.loc?.end).toBe('number')
      expect(err.loc?.start).toBeLessThan(err.loc?.end ?? 0)
    })
  })
})
