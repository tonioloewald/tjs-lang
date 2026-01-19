/**
 * Tests for TypeScript to TJS transpilation
 *
 * Focus on generics handling - preserving type parameter info
 * as schema constraints for runtime validation.
 */

import { describe, it, expect } from 'bun:test'
import { fromTS } from './emitters/from-ts'

describe('fromTS', () => {
  describe('basic types', () => {
    it('should convert primitive types to examples', () => {
      const result = fromTS(`
        function add(a: number, b: number): number {
          return a + b
        }
      `)

      expect(result.types?.add).toBeDefined()
      expect(result.types?.add.params.a.type.kind).toBe('number')
      expect(result.types?.add.params.b.type.kind).toBe('number')
      expect(result.types?.add.returns?.kind).toBe('number')
    })

    it('should handle optional parameters', () => {
      const result = fromTS(`
        function greet(name: string, greeting?: string): string {
          return greeting ? \`\${greeting}, \${name}!\` : \`Hello, \${name}!\`
        }
      `)

      expect(result.types?.greet.params.name.required).toBe(true)
      expect(result.types?.greet.params.greeting.required).toBe(false)
    })

    it('should handle array types', () => {
      const result = fromTS(`
        function sum(numbers: number[]): number {
          return numbers.reduce((a, b) => a + b, 0)
        }
      `)

      expect(result.types?.sum.params.numbers.type.kind).toBe('array')
      expect(result.types?.sum.params.numbers.type.items?.kind).toBe('number')
    })
  })

  describe('generics - simple', () => {
    it('should handle simple generic function', () => {
      const result = fromTS(`
        function identity<T>(x: T): T {
          return x
        }
      `)

      expect(result.types?.identity).toBeDefined()
      expect(result.types?.identity.params.x.type.kind).toBe('any')
      expect(result.types?.identity.returns?.kind).toBe('any')
      expect(result.types?.identity.typeParams).toBeDefined()
      expect(result.types?.identity.typeParams?.T).toBeDefined()
    })

    it('should handle multiple type parameters', () => {
      const result = fromTS(`
        function pair<A, B>(a: A, b: B): [A, B] {
          return [a, b]
        }
      `)

      expect(result.types?.pair.typeParams?.A).toBeDefined()
      expect(result.types?.pair.typeParams?.B).toBeDefined()
    })
  })

  describe('generics - with constraints', () => {
    it('should preserve constraint as schema', () => {
      const result = fromTS(`
        function process<T extends { id: number }>(item: T): number {
          return item.id
        }
      `)

      expect(result.types?.process.typeParams?.T).toBeDefined()
      expect(result.types?.process.typeParams?.T.constraint).toBeDefined()
      // Constraint should be converted to example-based schema
      expect(result.types?.process.typeParams?.T.constraint).toContain('id')
    })

    it('should handle array constraint', () => {
      const result = fromTS(`
        function first<T extends any[]>(arr: T): T[0] {
          return arr[0]
        }
      `)

      expect(result.types?.first.typeParams?.T).toBeDefined()
      // any[] constraint
      expect(result.types?.first.typeParams?.T.constraint).toBeDefined()
    })

    it('should handle string constraint', () => {
      const result = fromTS(`
        function stringify<T extends string | number>(value: T): string {
          return String(value)
        }
      `)

      expect(result.types?.stringify.typeParams?.T).toBeDefined()
      expect(result.types?.stringify.typeParams?.T.constraint).toBeDefined()
    })
  })

  describe('generics - with defaults', () => {
    it('should preserve default type as schema', () => {
      const result = fromTS(`
        function createBox<T = string>(value: T): { value: T } {
          return { value }
        }
      `)

      expect(result.types?.createBox.typeParams?.T).toBeDefined()
      expect(result.types?.createBox.typeParams?.T.default).toBe("''")
    })

    it('should handle object default', () => {
      const result = fromTS(`
        function wrap<T = { name: string }>(data: T): { wrapped: T } {
          return { wrapped: data }
        }
      `)

      expect(result.types?.wrap.typeParams?.T).toBeDefined()
      expect(result.types?.wrap.typeParams?.T.default).toContain('name')
    })
  })

  describe('generics - TJS output', () => {
    it('should emit TJS without type for generic params (any is omitted)', () => {
      const result = fromTS(
        `
        function identity<T>(x: T): T {
          return x
        }
      `,
        { emitTJS: true }
      )

      // Generic params become untyped (any is omitted)
      expect(result.code).toContain('function identity(x)')
      expect(result.code).not.toContain('-> any')
    })

    it('should emit warnings for generics', () => {
      const result = fromTS(
        `
        function identity<T>(x: T): T {
          return x
        }
      `,
        { emitTJS: true }
      )

      expect(result.warnings).toBeDefined()
      expect(result.warnings?.some((w) => w.includes('T'))).toBe(true)
      expect(result.warnings?.some((w) => w.includes('any'))).toBe(true)
    })
  })

  describe('generics - JS output with metadata', () => {
    it('should include typeParams in __tjs metadata', () => {
      const result = fromTS(`
        function process<T extends { foo: number }>(x: T): T {
          return x
        }
      `)

      // Check that the generated code includes typeParams
      expect(result.code).toContain('typeParams')
      expect(result.code).toContain('"T"')
    })

    it('should generate valid executable JS', () => {
      const result = fromTS(`
        function identity<T>(x: T): T {
          return x
        }
      `)

      // Execute the generated code
      const fn = new Function(`${result.code}; return identity;`)()

      expect(fn('hello')).toBe('hello')
      expect(fn(42)).toBe(42)
      expect(fn.__tjs).toBeDefined()
      expect(fn.__tjs.typeParams?.T).toBeDefined()
    })
  })

  describe('real-world patterns', () => {
    it('should handle React-style component props', () => {
      const result = fromTS(`
        function withLoading<P extends { loading?: boolean }>(
          props: P
        ): P & { isLoading: boolean } {
          return { ...props, isLoading: props.loading ?? false }
        }
      `)

      expect(result.types?.withLoading.typeParams?.P).toBeDefined()
      expect(result.types?.withLoading.typeParams?.P.constraint).toBeDefined()
    })

    it('should handle Promise unwrapping', () => {
      const result = fromTS(`
        async function fetchData<T>(url: string): Promise<T> {
          const res = await fetch(url)
          return res.json()
        }
      `)

      expect(result.types?.fetchData.typeParams?.T).toBeDefined()
      // Return type should unwrap Promise
      expect(result.types?.fetchData.returns?.kind).toBe('any')
    })

    it('should handle array methods pattern', () => {
      const result = fromTS(`
        function map<T, U>(arr: T[], fn: (x: T) => U): U[] {
          return arr.map(fn)
        }
      `)

      expect(result.types?.map.typeParams?.T).toBeDefined()
      expect(result.types?.map.typeParams?.U).toBeDefined()
      expect(result.types?.map.params.arr.type.kind).toBe('array')
    })
  })
})
