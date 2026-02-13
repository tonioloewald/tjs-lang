import { describe, it, expect } from 'bun:test'
import { fromTS } from './index'

describe('TypeScript to TJS Transpiler', () => {
  describe('fromTS with emitTJS', () => {
    it('should convert string type to empty string example', () => {
      const result = fromTS(`function greet(name: string) { return name }`, {
        emitTJS: true,
      })
      expect(result.code).toContain("name: ''")
    })

    it('should convert number type to 0 example', () => {
      const result = fromTS(
        `function add(a: number, b: number) { return a + b }`,
        { emitTJS: true }
      )
      expect(result.code).toContain('a: 0')
      expect(result.code).toContain('b: 0')
    })

    it('should convert optional params to = syntax', () => {
      const result = fromTS(
        `function greet(name: string, title?: string) { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("name: ''")
      expect(result.code).toContain("title = ''")
    })

    it('should convert return type to -! annotation (skip signature test)', () => {
      const result = fromTS(
        `function greet(name: string): string { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("-! ''") // -! skips signature test for TS-transpiled code
    })

    it('should handle array types', () => {
      const result = fromTS(
        `function sum(nums: number[]): number { return 0 }`,
        { emitTJS: true }
      )
      expect(result.code).toContain('nums: [0.0]')
    })

    it('should handle object literal types', () => {
      const result = fromTS(
        `function getUser(): { name: string, age: number } { return { name: '', age: 0 } }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("-! { name: '', age: 0.0 }") // -! for TS-transpiled
    })

    it('should handle nullable types', () => {
      const result = fromTS(
        `function find(id: string): string | null { return null }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("-! '' || null") // -! for TS-transpiled
    })

    it('should preserve default values', () => {
      const result = fromTS(
        `function greet(name: string = 'world') { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("name = 'world'")
    })
  })

  describe('fromTS with JS output', () => {
    it('should strip types and add __tjs metadata', () => {
      const result = fromTS(
        `function greet(name: string): string { return name }`
      )
      expect(result.code).toContain('function greet(name)')
      expect(result.code).toContain('greet.__tjs')
      expect(result.types?.greet).toBeDefined()
      expect(result.types?.greet.params.name.type.kind).toBe('string')
      expect(result.types?.greet.params.name.required).toBe(true)
    })

    it('should mark optional params as not required', () => {
      const result = fromTS(`function test(a: string, b?: number) { return a }`)
      expect(result.types?.test.params.a.required).toBe(true)
      expect(result.types?.test.params.b.required).toBe(false)
    })

    it('should capture return type in metadata', () => {
      const result = fromTS(
        `function add(a: number, b: number): number { return a + b }`
      )
      expect(result.types?.add.returns?.kind).toBe('number')
    })

    it('should handle multiple functions', () => {
      const result = fromTS(`
        function foo(x: string) { return x }
        function bar(y: number) { return y }
      `)
      expect(result.types?.foo).toBeDefined()
      expect(result.types?.bar).toBeDefined()
      expect(result.code).toContain('foo.__tjs')
      expect(result.code).toContain('bar.__tjs')
    })

    it('should handle arrow functions', () => {
      const result = fromTS(
        `const greet = (name: string): string => \`Hello, \${name}!\``
      )
      expect(result.types?.greet).toBeDefined()
      expect(result.types?.greet.params.name.type.kind).toBe('string')
      expect(result.types?.greet.returns?.kind).toBe('string')
    })

    it('should handle const function expressions', () => {
      const result = fromTS(
        `const add = function(a: number, b: number): number { return a + b }`
      )
      expect(result.types?.add).toBeDefined()
      expect(result.types?.add.params.a.type.kind).toBe('number')
      expect(result.types?.add.params.b.type.kind).toBe('number')
    })
  })

  describe('End-to-end execution', () => {
    it('should produce executable JS from TypeScript', () => {
      const tsSource = `
        function add(a: number, b: number): number {
          return a + b
        }
      `
      const result = fromTS(tsSource)

      // Execute the generated JS
      const fn = new Function(`${result.code}; return add(2, 3);`)
      expect(fn()).toBe(5)
    })

    it('should produce executable JS with correct metadata', () => {
      const tsSource = `
        function greet(name: string, excited?: boolean): string {
          return excited ? \`Hello, \${name}!\` : \`Hello, \${name}\`
        }
      `
      const result = fromTS(tsSource)

      // Execute and check result
      const fn = new Function(`${result.code}; return greet('World', true);`)
      expect(fn()).toBe('Hello, World!')

      // Also verify metadata is attached
      const metaFn = new Function(`${result.code}; return greet.__tjs;`)
      const meta = metaFn()
      expect(meta.params.name.type).toBe('string')
      expect(meta.params.name.required).toBe(true)
      expect(meta.params.excited.required).toBe(false)
      expect(meta.returns.type).toBe('string')
    })

    it('should handle arrow functions end-to-end', () => {
      const tsSource = `
        const multiply = (a: number, b: number): number => a * b
      `
      const result = fromTS(tsSource)

      // Execute
      const fn = new Function(`${result.code}; return multiply(4, 5);`)
      expect(fn()).toBe(20)

      // Check metadata
      const metaFn = new Function(`${result.code}; return multiply.__tjs;`)
      const meta = metaFn()
      expect(meta.params.a.type).toBe('number')
      expect(meta.params.b.type).toBe('number')
    })

    it('should handle complex types end-to-end', () => {
      const tsSource = `
        function processUser(user: { name: string, age: number }): string {
          return \`\${user.name} is \${user.age} years old\`
        }
      `
      const result = fromTS(tsSource)

      // Execute
      const fn = new Function(
        `${result.code}; return processUser({ name: 'Alice', age: 30 });`
      )
      expect(fn()).toBe('Alice is 30 years old')
    })
  })
})
// Schema callable tests
