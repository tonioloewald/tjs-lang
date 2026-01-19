/**
 * TJS Linter Tests
 */

import { describe, it, expect } from 'bun:test'
import { lint } from './linter'

describe('TJS Linter', () => {
  describe('no-explicit-new rule', () => {
    it('warns about explicit new keyword', () => {
      const result = lint(`
        function createPoint() {
          return new Point(1, 2)
        }
      `)

      const newWarnings = result.diagnostics.filter(
        (d) => d.rule === 'no-explicit-new'
      )
      expect(newWarnings.length).toBe(1)
      expect(newWarnings[0].severity).toBe('warning')
      expect(newWarnings[0].message).toContain('Point')
      expect(newWarnings[0].message).toContain('Unnecessary')
    })

    it('warns about multiple new expressions', () => {
      const result = lint(`
        function createThings() {
          const a = new Foo()
          const b = new Bar()
          return [a, b]
        }
      `)

      const newWarnings = result.diagnostics.filter(
        (d) => d.rule === 'no-explicit-new'
      )
      expect(newWarnings.length).toBe(2)
    })

    it('handles member expression callees', () => {
      const result = lint(`
        function create() {
          return new some.namespace.MyClass()
        }
      `)

      const newWarnings = result.diagnostics.filter(
        (d) => d.rule === 'no-explicit-new'
      )
      expect(newWarnings.length).toBe(1)
      expect(newWarnings[0].message).toContain('MyClass')
    })

    it('can be disabled', () => {
      const result = lint(
        `
        function create() {
          return new Point()
        }
      `,
        { noExplicitNew: false }
      )

      const newWarnings = result.diagnostics.filter(
        (d) => d.rule === 'no-explicit-new'
      )
      expect(newWarnings.length).toBe(0)
    })

    it('includes location info', () => {
      const result = lint(`function f() {
  return new Point()
}`)

      const newWarnings = result.diagnostics.filter(
        (d) => d.rule === 'no-explicit-new'
      )
      expect(newWarnings.length).toBe(1)
      expect(newWarnings[0].line).toBe(2)
    })
  })

  describe('no-unused-vars rule', () => {
    it('warns about unused variables', () => {
      const result = lint(`
        function test() {
          const unused = 5
          return 42
        }
      `)

      const unusedWarnings = result.diagnostics.filter(
        (d) => d.rule === 'no-unused-vars'
      )
      expect(unusedWarnings.length).toBe(1)
      expect(unusedWarnings[0].message).toContain('unused')
    })

    it('ignores variables starting with underscore', () => {
      const result = lint(`
        function test(_ignored) {
          return 42
        }
      `)

      const unusedWarnings = result.diagnostics.filter(
        (d) => d.rule === 'no-unused-vars'
      )
      expect(unusedWarnings.length).toBe(0)
    })
  })

  describe('no-unreachable rule', () => {
    it('warns about unreachable code after return', () => {
      const result = lint(`
        function test() {
          return 42
          const x = 5
        }
      `)

      const unreachableWarnings = result.diagnostics.filter(
        (d) => d.rule === 'no-unreachable'
      )
      expect(unreachableWarnings.length).toBe(1)
    })
  })

  describe('valid property', () => {
    it('returns valid: true when no errors', () => {
      const result = lint(`
        function test(x = 0) {
          return x * 2
        }
      `)

      // Warnings don't affect validity
      expect(result.valid).toBe(true)
    })

    it('returns valid: false on parse errors', () => {
      const result = lint('function {{{')
      expect(result.valid).toBe(false)
      expect(result.diagnostics[0].rule).toBe('parse-error')
    })
  })
})
