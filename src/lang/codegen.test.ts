/**
 * TJS Code Generation Quality Tests
 *
 * Tests that generated code (from TS→TJS conversion, docs, etc.) is correct and idiomatic.
 * Focuses on output quality rather than just "doesn't crash".
 */

import { describe, it, expect } from 'bun:test'
import { fromTS } from './emitters/from-ts'
import { generateDocs } from './docs'
import { tjs } from './index'

describe('TS → TJS conversion quality', () => {
  describe('function parameters', () => {
    it('converts required string param to colon syntax', () => {
      const ts = `function greet(name: string): string { return name }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("name: ''")
      expect(code).not.toContain('name: string')
    })

    it('converts required number param to colon syntax', () => {
      const ts = `function double(x: number): number { return x * 2 }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('x: 0')
      expect(code).not.toContain('x: number')
    })

    it('converts optional param to equals syntax', () => {
      const ts = `function greet(name?: string): string { return name || 'World' }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("name = ''")
      expect(code).not.toContain('name?')
    })

    it('preserves explicit default values', () => {
      const ts = `function greet(name: string = 'World'): string { return name }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("name = 'World'")
    })

    it('converts boolean param correctly', () => {
      const ts = `function toggle(flag: boolean): boolean { return !flag }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('flag: true')
    })

    it('converts array param correctly', () => {
      const ts = `function sum(nums: number[]): number { return nums.reduce((a, b) => a + b, 0) }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('nums: [0]')
    })

    it('converts object param correctly', () => {
      const ts = `function getAge(user: { name: string; age: number }): number { return user.age }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("name: ''")
      expect(code).toContain('age: 0')
    })

    it('handles multiple params in order', () => {
      const ts = `function add(a: number, b: number): number { return a + b }`
      const { code } = fromTS(ts, { emitTJS: true })

      // Should have both params with colon syntax
      expect(code).toMatch(/add\(a: 0, b: 0\)/)
    })

    it('handles mixed required and optional params', () => {
      const ts = `function fetch(url: string, timeout?: number): void { }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("url: ''")
      expect(code).toContain('timeout = 0')
    })
  })

  describe('return types', () => {
    it('converts string return type to arrow syntax', () => {
      const ts = `function getName(): string { return 'test' }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("-> ''")
    })

    it('converts number return type to arrow syntax', () => {
      const ts = `function getCount(): number { return 42 }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('-> 0')
    })

    it('converts boolean return type to arrow syntax', () => {
      const ts = `function isValid(): boolean { return true }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('-> true')
    })

    it('converts object return type to arrow syntax', () => {
      const ts = `function getUser(): { name: string; age: number } { return { name: '', age: 0 } }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('->')
      expect(code).toContain("name: ''")
      expect(code).toContain('age: 0')
    })

    it('converts array return type to arrow syntax', () => {
      const ts = `function getItems(): string[] { return [] }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("-> ['']")
    })

    it('omits void return type', () => {
      const ts = `function doSomething(): void { console.log('done') }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).not.toContain('->')
    })

    it('handles Promise return types by unwrapping', () => {
      const ts = `async function fetchData(): Promise<string> { return 'data' }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("-> ''")
      expect(code).not.toContain('Promise')
    })
  })

  describe('type aliases and interfaces', () => {
    it('converts simple interface to Type', () => {
      const ts = `interface User { name: string; age: number }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('Type User')
      expect(code).toContain("name: ''")
      expect(code).toContain('age: 0')
    })

    it('converts type alias to Type', () => {
      const ts = `type Point = { x: number; y: number }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('Type Point')
      expect(code).toContain('x: 0')
      expect(code).toContain('y: 0')
    })

    it('converts string literal union to Union', () => {
      const ts = `type Direction = 'up' | 'down' | 'left' | 'right'`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('Union Direction')
      expect(code).toContain("'up'")
      expect(code).toContain("'down'")
      expect(code).toContain("'left'")
      expect(code).toContain("'right'")
    })

    it('converts enum to Enum', () => {
      const ts = `enum Status { Pending, Active, Done }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('Enum Status')
      expect(code).toContain('Pending')
      expect(code).toContain('Active')
      expect(code).toContain('Done')
    })

    it('converts string enum with values', () => {
      const ts = `enum Color { Red = 'red', Green = 'green', Blue = 'blue' }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('Enum Color')
      expect(code).toContain("Red = 'red'")
      expect(code).toContain("Green = 'green'")
      expect(code).toContain("Blue = 'blue'")
    })
  })

  describe('classes', () => {
    it('converts class with constructor', () => {
      const ts = `
class User {
  name: string
  constructor(name: string) {
    this.name = name
  }
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('class User')
      expect(code).toContain("constructor(name: '')")
    })

    it('converts private fields to # syntax', () => {
      const ts = `
class Counter {
  private count: number = 0
  increment() { this.count++ }
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('#count')
      expect(code).toContain('this.#count')
      expect(code).not.toContain('private')
    })

    it('converts method return types', () => {
      const ts = `
class Calculator {
  add(a: number, b: number): number {
    return a + b
  }
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('add(a: 0, b: 0) -> 0')
    })

    it('converts getters and setters', () => {
      const ts = `
class Box {
  private _value: number = 0
  get value(): number { return this._value }
  set value(v: number) { this._value = v }
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('get value()')
      expect(code).toContain('set value(')
    })

    it('preserves extends clause', () => {
      const ts = `
class Animal {
  name: string = ''
}
class Dog extends Animal {
  bark() { return 'woof' }
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('class Dog extends Animal')
    })

    it('converts static methods', () => {
      const ts = `
class MathUtils {
  static double(x: number): number {
    return x * 2
  }
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('static double(x: 0) -> 0')
    })

    it('converts async methods', () => {
      const ts = `
class Api {
  async fetch(url: string): Promise<string> {
    return ''
  }
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('async fetch')
      expect(code).toContain("-> ''")
    })
  })

  describe('nullable types', () => {
    it('converts T | null to T || null', () => {
      const ts = `function maybe(x: string | null): string | null { return x }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("'' || null")
    })

    it('converts T | undefined to T || undefined', () => {
      const ts = `function maybe(x: number | undefined): number | undefined { return x }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('0 || undefined')
    })
  })

  describe('function body preservation', () => {
    it('strips type assertions from body', () => {
      const ts = `function cast(x: any): string { return x as string }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('return x')
      expect(code).not.toContain('as string')
    })

    it('strips angle bracket assertions from body', () => {
      const ts = `function cast(x: any): string { return <string>x }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('return x')
      // The angle bracket syntax gets stripped
    })

    it('preserves async/await', () => {
      const ts = `async function delay(ms: number): Promise<void> { await new Promise(r => setTimeout(r, ms)) }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('async function')
      expect(code).toContain('await')
    })
  })

  describe('arrow functions', () => {
    it('converts const arrow function to function declaration', () => {
      const ts = `const double = (x: number): number => x * 2`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('function double')
      expect(code).toContain('x: 0')
      expect(code).toContain('-> 0')
    })

    it('converts arrow function with block body', () => {
      const ts = `const add = (a: number, b: number): number => { return a + b }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('function add')
      expect(code).toContain('return a + b')
    })
  })

  describe('warnings', () => {
    it('warns about generic type parameters', () => {
      const ts = `function identity<T>(x: T): T { return x }`
      const { warnings } = fromTS(ts, { emitTJS: true })

      expect(warnings).toBeDefined()
      expect(warnings?.some((w) => w.includes('Generic type parameter'))).toBe(
        true
      )
    })

    it('warns about unknown types', () => {
      const ts = `function use(x: SomeUnknownType): void { }`
      const { warnings } = fromTS(ts, { emitTJS: true })

      expect(warnings).toBeDefined()
      expect(warnings?.some((w) => w.includes('Unknown type'))).toBe(true)
    })
  })
})

describe('TJS → JS transpilation quality', () => {
  describe('colon syntax transformation', () => {
    it('transforms colon params to defaults in output', () => {
      const source = `function greet(name: 'World') { return name }`
      const { code } = tjs(source)

      expect(code).toContain('name = ')
      expect(code).not.toContain("name: 'World'")
    })
  })

  describe('__tjs metadata', () => {
    it('includes param types in metadata', () => {
      const source = `function greet(name: 'World') -> 'World' { return name }`
      const { code, types } = tjs(source)

      expect(code).toContain('__tjs')
      expect(types?.params?.name?.type?.kind).toBe('string')
    })

    it('includes return type in metadata', () => {
      const source = `function double(x: 0) -> 0 { return x * 2 }`
      const { code, types } = tjs(source)

      expect(code).toContain('__tjs')
      expect(types?.returns?.kind).toBe('number')
    })

    it('marks required params correctly', () => {
      const source = `function required(a: 0, b = 0) { return a + b }`
      const { types } = tjs(source)

      expect(types?.params?.a?.required).toBe(true)
      expect(types?.params?.b?.required).toBe(false)
    })
  })
})

describe('documentation generation quality', () => {
  describe('function signatures', () => {
    it('preserves original signature in markdown', () => {
      const source = `function greet(name: 'World') -> '' { return name }`
      const { markdown } = generateDocs(source)

      // Signature is preserved as-is - the types ARE the docs
      expect(markdown).toContain("function greet(name: 'World') -> ''")
    })

    it('preserves optional params with defaults', () => {
      const source = `function greet(name = 'World') -> '' { return name }`
      const { markdown } = generateDocs(source)

      expect(markdown).toContain("name = 'World'")
    })
  })

  describe('signature as documentation', () => {
    it('shows params in signature', () => {
      const source = `function add(a: 0, b: 0) -> 0 { return a + b }`
      const { markdown } = generateDocs(source)

      expect(markdown).toContain('a: 0')
      expect(markdown).toContain('b: 0')
    })

    it('shows return type in signature', () => {
      const source = `function double(x: 0) -> 0 { return x * 2 }`
      const { markdown } = generateDocs(source)

      expect(markdown).toContain('-> 0')
    })
  })
})

describe('round-trip quality', () => {
  it('TS → TJS → JS produces valid code', () => {
    const ts = `function add(a: number, b: number): number { return a + b }`

    // TS → TJS
    const { code: tjsCode } = fromTS(ts, { emitTJS: true })
    expect(tjsCode).toContain('function add')

    // TJS → JS
    const { code: jsCode } = tjs(tjsCode)
    expect(jsCode).toContain('function add')
    expect(jsCode).toContain('__tjs')

    // Should be evaluable
    const fn = new Function(jsCode + '; return add')()
    expect(fn(2, 3)).toBe(5)
  })

  it('preserves semantics through conversion', () => {
    // Use -! to skip signature test since we're testing round-trip semantics,
    // not that the return example matches (TS->TJS can't infer actual return values)
    const ts = `
function greet(name: string, excited?: boolean): string {
  return excited ? name + '!' : name
}
`
    const { code: tjsCode } = fromTS(ts, { emitTJS: true })
    // Replace -> with -! to skip signature validation for this test
    const tjsCodeUnsafe = tjsCode.replace('-> ', '-! ')
    const { code: jsCode } = tjs(tjsCodeUnsafe)

    const fn = new Function(jsCode + '; return greet')()
    expect(fn('Hello', true)).toBe('Hello!')
    expect(fn('Hello', false)).toBe('Hello')
  })
})
