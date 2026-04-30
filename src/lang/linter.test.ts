/**
 * TJS Linter Tests
 */

import { describe, it, expect } from 'bun:test'
import { lint, type LintDiagnostic } from './linter'

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

  describe('safe-assign rule (TjsSafeAssign)', () => {
    const onlySafeAssign = (result: { diagnostics: LintDiagnostic[] }) =>
      result.diagnostics.filter((d) => d.rule.startsWith('safe-assign'))

    it('flags `let x` with no initializer or annotation', () => {
      const result = lint(`function f() { let x; return x }`)
      const diags = onlySafeAssign(result)
      expect(diags.length).toBe(1)
      expect(diags[0].rule).toBe('safe-assign-let-needs-type')
      expect(diags[0].severity).toBe('warning')
      expect(diags[0].message).toContain("'let x'")
    })

    it('flags `let x = undefined` with no annotation', () => {
      const result = lint(`function f() { let x = undefined; return x }`)
      const diags = onlySafeAssign(result)
      expect(diags.length).toBe(1)
      expect(diags[0].rule).toBe('safe-assign-let-needs-type')
      expect(diags[0].message).toContain('undefined')
    })

    it('flags `let x = null` with no annotation', () => {
      const result = lint(`function f() { let x = null; return x }`)
      const diags = onlySafeAssign(result)
      expect(diags.length).toBe(1)
      expect(diags[0].rule).toBe('safe-assign-let-needs-type')
    })

    it('flags `let x = void 0` with no annotation', () => {
      const result = lint(`function f() { let x = void 0; return x }`)
      const diags = onlySafeAssign(result)
      expect(diags.length).toBe(1)
      expect(diags[0].rule).toBe('safe-assign-let-needs-type')
    })

    it('accepts `let x = 0` (inferable initializer)', () => {
      const result = lint(`function f() { let x = 0; return x }`)
      expect(onlySafeAssign(result).length).toBe(0)
    })

    it("accepts `let x: ''` (annotation, no init)", () => {
      const result = lint(`function f() { let x: ''; return x }`)
      expect(onlySafeAssign(result).length).toBe(0)
    })

    it("accepts `let x: '' = 'hi'` (annotation + init)", () => {
      const result = lint(`function f() { let x: '' = 'hi'; return x }`)
      expect(onlySafeAssign(result).length).toBe(0)
    })

    it('flags `x = undefined` reassignment to a typed let', () => {
      const result = lint(
        `function f() { let x = 'hi'; x = undefined; return x }`
      )
      const diags = onlySafeAssign(result)
      expect(diags.length).toBe(1)
      expect(diags[0].rule).toBe('safe-assign-no-nullish')
      expect(diags[0].message).toContain("'x'")
    })

    it('flags `x = null` reassignment to an annotated let', () => {
      const result = lint(`function f() { let x: 0; x = null; return x }`)
      const diags = onlySafeAssign(result)
      expect(diags.length).toBe(1)
      expect(diags[0].rule).toBe('safe-assign-no-nullish')
    })

    it('does not flag `x = "hi"` reassignment', () => {
      const result = lint(`function f() { let x = 'a'; x = 'b'; return x }`)
      expect(onlySafeAssign(result).length).toBe(0)
    })

    it('does not run rule under TjsCompat directive', () => {
      const result = lint(`
        TjsCompat
        function f() { let x; return x }
      `)
      expect(onlySafeAssign(result).length).toBe(0)
    })

    it('emits errors (not warnings) under strict option', () => {
      const result = lint(`function f() { let x; return x }`, {
        strict: true,
      })
      const diags = onlySafeAssign(result)
      expect(diags.length).toBe(1)
      expect(diags[0].severity).toBe('error')
      expect(result.valid).toBe(false)
    })

    it('safeAssign: false option disables the rule even in native TJS', () => {
      const result = lint(`function f() { let x; return x }`, {
        safeAssign: false,
      })
      expect(onlySafeAssign(result).length).toBe(0)
    })

    it('does not flag const declarations', () => {
      const result = lint(`function f() { const x = 0; return x }`)
      expect(onlySafeAssign(result).length).toBe(0)
    })
  })
})
