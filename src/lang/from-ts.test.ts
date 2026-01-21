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

      // Generic params become bare params (any is omitted in TJS)
      expect(result.code).toContain('function identity(x)')
      expect(result.code).not.toContain('x: any') // any is omitted, not explicit
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

  describe('class support - callable without new', () => {
    it('should emit Proxy wrapper for classes', () => {
      const result = fromTS(`
        class Point {
          constructor(public x: number, public y: number) {}
        }
      `)

      // Should include inline Proxy wrapper (no runtime dependency)
      expect(result.code).toContain('new Proxy')
      expect(result.code).toContain('Reflect.construct')
      expect(result.code).toContain('Point')
    })

    it('should allow instantiation without new', () => {
      const result = fromTS(`
        class Point {
          x: number
          y: number
          constructor(x: number, y: number) {
            this.x = x
            this.y = y
          }
        }
      `)

      // Execute the generated code with runtime
      const code = `
        // Mock runtime
        globalThis.__tjs = {
          wrapClass: function(cls) {
            return new Proxy(cls, {
              construct(target, args) {
                return Reflect.construct(target, args)
              },
              apply(target, _, args) {
                return Reflect.construct(target, args)
              }
            })
          }
        }
        ${result.code}
        return Point
      `
      const Point = new Function(code)()

      // Call without new
      const p1 = Point(10, 20)
      expect(p1.x).toBe(10)
      expect(p1.y).toBe(20)

      // Call with new still works
      const p2 = new Point(30, 40)
      expect(p2.x).toBe(30)
      expect(p2.y).toBe(40)
    })

    it('should extract class metadata', () => {
      const result = fromTS(`
        class Calculator {
          constructor(public initialValue: number) {}
          add(x: number): number {
            return this.initialValue + x
          }
          static create(value: number): Calculator {
            return new Calculator(value)
          }
        }
      `)

      expect(result.classes).toBeDefined()
      expect(result.classes?.Calculator).toBeDefined()
      expect(result.classes?.Calculator.constructor).toBeDefined()
      expect(result.classes?.Calculator.methods.add).toBeDefined()
      expect(result.classes?.Calculator.staticMethods.create).toBeDefined()
    })
  })
})

describe('clean TJS output', () => {
  it('should emit clean TJS for classes', () => {
    const result = fromTS(
      `
      class Foo {
        constructor(x: number) {
          this.x = x
        }
      }
    `,
      { emitTJS: true }
    )

    // TJS should be human-readable, not full of runtime calls
    expect(result.code).not.toContain('globalThis.__tjs')
    expect(result.code).not.toContain('wrapClass')
    expect(result.code).toContain('class Foo')
  })

  it('should emit clean TJS for functions with types', () => {
    const result = fromTS(
      `
      function add(a: number, b: number): number {
        return a + b
      }
    `,
      { emitTJS: true }
    )

    // Should be clean TJS with example-based types
    expect(result.code).toContain('function add')
    expect(result.code).toContain(': 0') // number becomes 0
    expect(result.code).not.toContain('globalThis')
  })

  it('should emit readable Type declarations', () => {
    const result = fromTS(
      `
      interface User {
        name: string
        age: number
      }

      function getUser(id: string): User {
        return { name: 'test', age: 0 }
      }
    `,
      { emitTJS: true }
    )

    // Type declarations should be readable TJS syntax
    expect(result.code).toContain('Type User')
    expect(result.code).not.toContain('globalThis')
  })

  it('should produce TJS that a human could maintain', () => {
    const result = fromTS(
      `
      class Counter {
        private count: number = 0

        increment(): void {
          this.count++
        }

        get value(): number {
          return this.count
        }
      }
    `,
      { emitTJS: true }
    )

    // The TJS should look like something a human would write
    expect(result.code).toContain('class Counter')
    expect(result.code).toContain('#count') // private -> #
    expect(result.code).not.toContain('globalThis')
    expect(result.code).not.toContain('__tjs?.') // no runtime optional chaining
  })
})
