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

    it('should convert optional params to union with undefined', () => {
      const result = fromTS(
        `function greet(name: string, title?: string) { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("name: ''")
      expect(result.code).toContain("title: '' | undefined")
    })

    it('should convert return type to -! annotation (skip signature test)', () => {
      const result = fromTS(
        `function greet(name: string): string { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(":! ''") // :! skips signature test for TS-transpiled code
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
      expect(result.code).toContain(":! { name: '', age: 0.0 }") // :! for TS-transpiled
    })

    it('should handle nullable types', () => {
      const result = fromTS(
        `function find(id: string): string | null { return null }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(":! '' | null") // :! for TS-transpiled
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
// =============================================================================
// @tjs annotations
// =============================================================================

describe('@tjs annotations', () => {
  describe('@tjs-skip', () => {
    it('should skip interface with @tjs-skip', () => {
      const result = fromTS(
        `/* @tjs-skip */\nexport interface Internal { x: string }`,
        { emitTJS: true }
      )
      expect(result.code).not.toContain('Type Internal')
    })

    it('should skip type alias with @tjs-skip', () => {
      const result = fromTS(
        `/* @tjs-skip */\nexport type Complex<T> = T extends Array<infer U> ? U : T`,
        { emitTJS: true }
      )
      expect(result.code).not.toContain('Complex')
    })

    it('should only skip annotated declaration', () => {
      const result = fromTS(
        `/* @tjs-skip */\ninterface Hidden { x: string }\ninterface Visible { y: number }`,
        { emitTJS: true }
      )
      expect(result.code).not.toContain('Hidden')
      expect(result.code).toContain('Type Visible')
    })
  })

  describe('@tjs example', () => {
    it('should use custom example on interface', () => {
      const result = fromTS(
        `/* @tjs example: { name: 'Alice', age: 30 } */\nexport interface User { name: string; age: number }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("example: { name: 'Alice', age: 30 }")
    })

    it('should override auto-generated example', () => {
      const result = fromTS(
        `/* @tjs example: { id: 42, label: 'test' } */\nexport interface Item { id: number; label: string; meta?: any }`,
        { emitTJS: true }
      )
      // Should use the annotation, not the auto-generated one
      expect(result.code).toContain("{ id: 42, label: 'test' }")
      expect(result.code).not.toContain('meta:')
    })
  })

  describe('@tjs predicate', () => {
    it('should use custom predicate on interface', () => {
      const result = fromTS(
        `/* @tjs predicate(x) { return typeof x.name === 'string' && x.age >= 0 } */\nexport interface User { name: string; age: number }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(
        "predicate(x) { return typeof x.name === 'string' && x.age >= 0 }"
      )
    })

    it('should use custom predicate on generic interface', () => {
      const result = fromTS(
        `/* @tjs predicate(x, T) { return typeof x === 'object' && x !== null && 'value' in x && T(x.value) } */\nexport interface Box<T> { value: T; label: string }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(
        "predicate(x, T) { return typeof x === 'object' && x !== null && 'value' in x && T(x.value) }"
      )
    })

    it('should use custom predicate on generic type alias', () => {
      const result = fromTS(
        `/* @tjs predicate(x, T) { return Array.isArray(x) && x.every(T) } */\nexport type TypedArray<T> = Array<T> & { __brand: 'typed' }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(
        'predicate(x, T) { return Array.isArray(x) && x.every(T) }'
      )
    })
  })

  describe('@tjs declaration', () => {
    it('should include declaration block on generic interface', () => {
      const result = fromTS(
        `/* @tjs declaration { value: T; path: string; observe(cb: (path: string) => void): void } */\nexport interface BoxedProxy<T> { value: T; path: string }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(
        'declaration { value: T; path: string; observe(cb: (path: string) => void): void }'
      )
    })
  })

  describe('combined annotations', () => {
    it('should support example + predicate together', () => {
      const result = fromTS(
        `/* @tjs example: { name: 'Alice', age: 30 } */\n/* @tjs predicate(x) { return typeof x.name === 'string' } */\nexport interface User { name: string; age: number }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("example: { name: 'Alice', age: 30 }")
      expect(result.code).toContain(
        "predicate(x) { return typeof x.name === 'string' }"
      )
    })

    it('should support predicate + declaration on generic', () => {
      const result = fromTS(
        `/* @tjs predicate(x, T) { return typeof x === 'object' && T(x.value) } */\n/* @tjs declaration { value: T; unwrap(): T } */\nexport interface Box<T> { value: T }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(
        "predicate(x, T) { return typeof x === 'object' && T(x.value) }"
      )
      expect(result.code).toContain('declaration { value: T; unwrap(): T }')
    })
  })
})

// Regression: TS→TJS must never emit TJS that won't re-parse. These real-world
// shapes (from tosijs) used to leak raw TS into Type/Generic blocks — generic
// interfaces emitted raw member types in `declaration {}`, and intersections /
// complex types emitted MULTI-LINE `// TS:` comments whose lines 2+ leaked as
// raw TS. fromTS now converts members via typeToExample and collapses
// un-representable bodies to a single-line comment (graceful degradation).
describe('TS→TJS round-trips (no raw-TS leak into TJS blocks)', () => {
  const { tjs } = require('./index') as { tjs: (s: string) => { code: string } }
  const roundTrips = (ts: string) => {
    const emitted = fromTS(ts, { emitTJS: true }).code
    expect(() => tjs(emitted)).not.toThrow() // emitted TJS must re-parse
    return emitted
  }

  it('generic interface with complex members (arrow, generic arrow, call-sig)', () => {
    const out = roundTrips(`export interface Acc<T = any> {
      value: T
      path: string
      touch: () => void
      bind: <E extends Element = Element>(el: E, b: any) => void
      find: { (selector: (item: any) => any, value: any): any }
    }`)
    // members converted to examples, not raw TS
    expect(out).toContain("path: ''")
    expect(out).toContain('touch: FunctionPredicate')
    expect(out).not.toMatch(/path: string\b/) // no raw type leak
  })

  it('intersection type alias (typeof / index signature) degrades, single-line', () => {
    const out = roundTrips(`export type ProxyObj = Props<object> & {
      [key: string]: ProxyObj | string | null
    }`)
    // un-representable → comment-only Type, collapsed to one line (no leak)
    expect(out).toMatch(/\/\/ TS:.*&/)
    expect(out).not.toMatch(/\n\s*\[key: string\]:/) // the body didn't leak raw
  })

  it('generic type alias with object body + arrow member', () => {
    roundTrips(`export type Wrap<T> = { value: T; build: (x: T) => T }`)
  })

  it('plain type alias with arrow + union return still works', () => {
    roundTrips(
      `export type AnyFunction = (...args: any[]) => any | Promise<any>`
    )
  })
})
