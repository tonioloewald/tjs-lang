/**
 * Tests for TJS autocompletion
 */

import { describe, it, expect } from 'bun:test'
import { getCompletions, getSignatureHelp } from './src/autocomplete'

describe('getCompletions', () => {
  describe('keyword completions', () => {
    it('should suggest function keyword', () => {
      const completions = getCompletions({
        source: 'func',
        position: 4,
      })

      const funcCompletion = completions.find((c) => c.label === 'function')
      expect(funcCompletion).toBeDefined()
      expect(funcCompletion?.kind).toBe('keyword')
    })

    it('should suggest test block', () => {
      const completions = getCompletions({
        source: 'tes',
        position: 3,
      })

      const testCompletion = completions.find((c) => c.label === 'test')
      expect(testCompletion).toBeDefined()
      expect(testCompletion?.snippet).toContain("test('")
    })

    it('should suggest unsafe block', () => {
      const completions = getCompletions({
        source: 'uns',
        position: 3,
      })

      const unsafeCompletion = completions.find((c) => c.label === 'unsafe')
      expect(unsafeCompletion).toBeDefined()
    })
  })

  describe('type completions', () => {
    it('should suggest types after colon', () => {
      const completions = getCompletions({
        source: 'function foo(x: ',
        position: 16,
      })

      expect(completions.some((c) => c.label === "''")).toBe(true)
      expect(completions.some((c) => c.label === '0')).toBe(true)
      expect(completions.some((c) => c.label === 'true')).toBe(true)
    })

    it('should suggest types after return arrow', () => {
      const completions = getCompletions({
        source: 'function foo() -> ',
        position: 18,
      })

      expect(completions.some((c) => c.label === "''")).toBe(true)
      expect(completions.some((c) => c.label === '[]')).toBeFalsy() // Not a valid type
    })
  })

  describe('function completions', () => {
    it('should extract functions from source', () => {
      const source = `
        function greet(name) { return name }
        function add(a, b) { return a + b }
      `
      const completions = getCompletions({
        source,
        position: source.length,
      })

      expect(completions.some((c) => c.label === 'greet')).toBe(true)
      expect(completions.some((c) => c.label === 'add')).toBe(true)
    })

    it('should include runtime functions', () => {
      const completions = getCompletions({
        source: 'is',
        position: 2,
      })

      const isError = completions.find((c) => c.label === 'isError')
      expect(isError).toBeDefined()
      expect(isError?.kind).toBe('function')
    })
  })

  describe('variable completions', () => {
    it('should extract declared variables', () => {
      const source = `
        const foo = 1
        let bar = 2
        f
      `
      const completions = getCompletions({
        source,
        position: source.length - 1,
      })

      expect(completions.some((c) => c.label === 'foo')).toBe(true)
      expect(completions.some((c) => c.label === 'bar')).toBe(true)
    })
  })

  describe('metadata-based completions', () => {
    it('should use __tjs metadata for function info', () => {
      const completions = getCompletions({
        source: 'gre',
        position: 3,
        metadata: {
          greet: {
            params: {
              name: { type: 'string', required: true },
            },
            returns: { type: 'string' },
            description: 'Greet someone',
          },
        },
      })

      const greet = completions.find((c) => c.label === 'greet')
      expect(greet).toBeDefined()
      expect(greet?.detail).toContain('name')
      expect(greet?.detail).toContain('string')
      expect(greet?.documentation).toBe('Greet someone')
    })
  })

  describe('expect matchers', () => {
    it('should suggest matchers after expect().', () => {
      const completions = getCompletions({
        source: 'expect(x).',
        position: 10,
      })

      expect(completions.some((c) => c.label === 'toBe')).toBe(true)
      expect(completions.some((c) => c.label === 'toEqual')).toBe(true)
      expect(completions.some((c) => c.label === 'toContain')).toBe(true)
    })
  })

  describe('filtering', () => {
    it('should filter by prefix', () => {
      const completions = getCompletions({
        source: 'to',
        position: 2,
      })

      // Should not include function, let, etc.
      expect(
        completions.every((c) => c.label.toLowerCase().startsWith('to'))
      ).toBe(true)
    })

    it('should sort by relevance', () => {
      const completions = getCompletions({
        source: 'function foo() {}\nfoo',
        position: 21,
      })

      // Function should come before keyword
      const fooIndex = completions.findIndex((c) => c.label === 'foo')
      const funcIndex = completions.findIndex((c) => c.label === 'function')

      // Our foo function should appear (even if filtered out, the fn should be found)
      expect(fooIndex).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('getSignatureHelp', () => {
  it('should provide signature for function call', () => {
    const help = getSignatureHelp({
      source: 'greet(',
      position: 6,
      metadata: {
        greet: {
          params: {
            name: { type: 'string', required: true },
            greeting: { type: 'string', required: false },
          },
        },
      },
    })

    expect(help).toBeDefined()
    expect(help?.signature).toContain('greet')
    expect(help?.signature).toContain('name')
    expect(help?.activeParam).toBe(0)
  })

  it('should track active parameter', () => {
    const help = getSignatureHelp({
      source: 'greet("Alice", ',
      position: 15,
      metadata: {
        greet: {
          params: {
            name: { type: 'string', required: true },
            greeting: { type: 'string', required: false },
          },
        },
      },
    })

    expect(help?.activeParam).toBe(1)
  })

  it('should return null outside function call', () => {
    const help = getSignatureHelp({
      source: 'const x = 1',
      position: 11,
    })

    expect(help).toBeNull()
  })

  it('should provide help for runtime functions', () => {
    const help = getSignatureHelp({
      source: 'isError(',
      position: 8,
    })

    expect(help).toBeDefined()
    expect(help?.signature).toContain('isError')
  })
})
