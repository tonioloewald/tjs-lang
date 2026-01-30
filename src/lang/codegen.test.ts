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
    it('converts string return type to -! syntax (skip signature test)', () => {
      const ts = `function getName(): string { return 'test' }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("-! ''")
    })

    it('converts number return type to -! syntax', () => {
      const ts = `function getCount(): number { return 42 }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('-! 0')
    })

    it('converts boolean return type to -! syntax', () => {
      const ts = `function isValid(): boolean { return true }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('-! true')
    })

    it('converts object return type to -! syntax', () => {
      const ts = `function getUser(): { name: string; age: number } { return { name: '', age: 0 } }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('-!')
      expect(code).toContain("name: ''")
      expect(code).toContain('age: 0')
    })

    it('converts array return type to -! syntax', () => {
      const ts = `function getItems(): string[] { return [] }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("-! ['']")
    })

    it('omits void return type', () => {
      const ts = `function doSomething(): void { console.log('done') }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).not.toContain('-!')
      expect(code).not.toContain('->')
    })

    it('handles Promise return types by unwrapping', () => {
      const ts = `async function fetchData(): Promise<string> { return 'data' }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("-! ''")
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

      expect(code).toContain('add(a: 0, b: 0) -! 0')
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

      expect(code).toContain('static double(x: 0) -! 0')
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
      expect(code).toContain("-! ''")
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
      expect(code).toContain('-! 0')
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
      // types is now keyed by function name
      expect(types?.greet?.params?.name?.type?.kind).toBe('string')
    })

    it('includes return type in metadata', () => {
      const source = `function double(x: 0) -> 0 { return x * 2 }`
      const { code, types } = tjs(source)

      expect(code).toContain('__tjs')
      // types is now keyed by function name
      expect(types?.double?.returns?.kind).toBe('number')
    })

    it('marks required params correctly', () => {
      const source = `function required(a: 0, b = 0) { return a + b }`
      const { types } = tjs(source)

      // types is now keyed by function name
      expect(types?.required?.params?.a?.required).toBe(true)
      expect(types?.required?.params?.b?.required).toBe(false)
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

// =============================================================================
// COMPREHENSIVE PIPELINE TESTS
// These tests verify each step of the transpiler pipeline independently
// =============================================================================

describe('Pipeline Step 1: TS → TJS', () => {
  // ==========================================================================
  // SANITY CHECKS - These MUST pass. If they fail, the transpiler is broken.
  // ==========================================================================
  describe('sanity checks', () => {
    it('console.log works', () => {
      const ts = `console.log('hello world')`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain("console.log('hello world')")
    })

    it('single function works', () => {
      const ts = `function add(a: number, b: number): number { return a + b }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('function add')
      expect(code).toContain('return a + b')
    })

    it('const declaration works', () => {
      const ts = `const x = 42`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('const x = 42')
    })

    it('let declaration works', () => {
      const ts = `let y = 'hello'`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain("let y = 'hello'")
    })

    it('function + console.log works', () => {
      const ts = `
function greet(name: string): string { return 'Hi ' + name }
console.log(greet('World'))
`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('function greet')
      expect(code).toContain("console.log(greet('World'))")
    })

    it('multiple statements all preserved', () => {
      const ts = `
const PI = 3.14159
function circle(r: number): number { return PI * r * r }
const area = circle(10)
console.log(area)
`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('const PI = 3.14159')
      expect(code).toContain('function circle')
      expect(code).toContain('const area = circle(10)')
      expect(code).toContain('console.log(area)')
    })
  })

  describe('multiple functions in one file', () => {
    it('transpiles multiple functions correctly', () => {
      const ts = `
function add(a: number, b: number): number {
  return a + b
}

function multiply(a: number, b: number): number {
  return a * b
}

function greet(name: string): string {
  return 'Hello, ' + name
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      // All functions should be present (TS transpiler uses -! to skip signature tests)
      expect(code).toContain('function add(a: 0, b: 0) -! 0')
      expect(code).toContain('function multiply(a: 0, b: 0) -! 0')
      expect(code).toContain("function greet(name: '') -! ''")

      // Should be valid TJS (no TypeScript syntax remaining)
      expect(code).not.toContain(': number')
      expect(code).not.toContain(': string')
    })

    it('preserves function order', () => {
      const ts = `
function first(): void { }
function second(): void { }
function third(): void { }
`
      const { code } = fromTS(ts, { emitTJS: true })

      const firstIdx = code.indexOf('function first')
      const secondIdx = code.indexOf('function second')
      const thirdIdx = code.indexOf('function third')

      expect(firstIdx).toBeLessThan(secondIdx)
      expect(secondIdx).toBeLessThan(thirdIdx)
    })

    it('preserves non-function statements between functions', () => {
      const ts = `
function first(): number { return 1 }
const MULTIPLIER = 10
function second(): number { return first() * MULTIPLIER }
console.log(second())
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('function first')
      expect(code).toContain('const MULTIPLIER = 10')
      expect(code).toContain('function second')
      expect(code).toContain('console.log(second())')

      // Order matters
      const firstIdx = code.indexOf('function first')
      const multIdx = code.indexOf('const MULTIPLIER')
      const secondIdx = code.indexOf('function second')
      const logIdx = code.indexOf('console.log')

      expect(firstIdx).toBeLessThan(multIdx)
      expect(multIdx).toBeLessThan(secondIdx)
      expect(secondIdx).toBeLessThan(logIdx)
    })
  })

  describe('output is valid TJS syntax', () => {
    it('uses colon syntax for required params', () => {
      const ts = `function test(x: number, y: string): void { }`
      const { code } = fromTS(ts, { emitTJS: true })

      // TJS uses example values, not type names
      expect(code).toContain('x: 0')
      expect(code).toContain("y: ''")
      expect(code).not.toContain('x: number')
      expect(code).not.toContain('y: string')
    })

    it('uses equals syntax for optional params', () => {
      const ts = `function test(x?: number, y?: string): void { }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('x = 0')
      expect(code).toContain("y = ''")
    })

    it('uses -! syntax for return types (skip signature test)', () => {
      const ts = `function test(): number { return 42 }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('-! 0')
      expect(code).not.toContain(': number')
    })

    it('no TypeScript syntax remains in output', () => {
      const ts = `
interface User { name: string; age: number }
type Status = 'active' | 'inactive'
function process(user: User, status: Status): boolean {
  return status === 'active'
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      // No TS-specific syntax
      expect(code).not.toMatch(/:\s*string\b/)
      expect(code).not.toMatch(/:\s*number\b/)
      expect(code).not.toMatch(/:\s*boolean\b/)
      expect(code).not.toContain('interface ')
    })
  })

  describe('complex TypeScript patterns', () => {
    it('handles nested object types', () => {
      const ts = `
function getAddress(user: { name: string; address: { street: string; city: string } }): string {
  return user.address.city
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain("name: ''")
      expect(code).toContain("street: ''")
      expect(code).toContain("city: ''")
    })

    it('handles array of objects', () => {
      const ts = `
function getNames(users: { name: string; age: number }[]): string[] {
  return users.map(u => u.name)
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('[{')
      expect(code).toContain("name: ''")
      expect(code).toContain('age: 0')
    })
  })
})

describe('Pipeline Step 2: TJS → JS', () => {
  describe('multiple functions in one file', () => {
    it('transpiles multiple functions correctly', () => {
      // Use -! to skip signature tests (we're testing transpilation, not return values)
      const tjsSource = `
function add(a: 0, b: 0) -! 0 {
  return a + b
}

function multiply(a: 0, b: 0) -! 0 {
  return a * b
}

function greet(name: '') -! '' {
  return 'Hello, ' + name
}
`
      const { code, types } = tjs(tjsSource)

      // All functions should be present in output
      expect(code).toContain('function add')
      expect(code).toContain('function multiply')
      expect(code).toContain('function greet')

      // All functions should have __tjs metadata
      expect(code).toContain('add.__tjs')
      expect(code).toContain('multiply.__tjs')
      expect(code).toContain('greet.__tjs')

      // Types object should have all functions
      expect(types).toHaveProperty('add')
      expect(types).toHaveProperty('multiply')
      expect(types).toHaveProperty('greet')
    })

    it('each function has correct metadata', () => {
      // Use -! to skip signature tests
      const tjsSource = `
function add(a: 0, b: 0) -! 0 {
  return a + b
}

function greet(name: '', excited = false) -! '' {
  return excited ? name + '!' : name
}
`
      const { types } = tjs(tjsSource)

      // add function
      expect(types?.add?.params?.a?.required).toBe(true)
      expect(types?.add?.params?.b?.required).toBe(true)
      expect(types?.add?.returns?.kind).toBe('number')

      // greet function
      expect(types?.greet?.params?.name?.required).toBe(true)
      expect(types?.greet?.params?.excited?.required).toBe(false)
      expect(types?.greet?.returns?.kind).toBe('string')
    })
  })

  describe('output is valid JavaScript', () => {
    it('produces executable JavaScript', () => {
      // Use -! to skip signature test
      const tjsSource = `
function double(x: 0) -! 0 {
  return x * 2
}
`
      const { code } = tjs(tjsSource)

      // Should be valid JS we can execute
      const fn = new Function(code + '; return double')()
      expect(fn(21)).toBe(42)
    })

    it('includes runtime validation', () => {
      // Use -! to skip signature test
      const tjsSource = `
function greet(name: '') -! '' {
  return 'Hello, ' + name
}
`
      const { code } = tjs(tjsSource)

      // Should have type checking in the function body
      expect(code).toContain('typeof')
      // Should use __tjs.typeError() for proper monadic errors
      expect(code).toContain('__tjs.typeError')
      // Should check for error pass-through
      expect(code).toContain('instanceof Error')
    })

    it('__tjs metadata is valid JSON structure', () => {
      // Use -! to skip signature test
      const tjsSource = `
function test(a: 0, b: '') -! true {
  return a > 0
}
`
      const { code } = tjs(tjsSource)

      // Extract the __tjs assignment
      const match = code.match(/test\.__tjs\s*=\s*(\{[\s\S]*?\});?\s*$/)
      expect(match).toBeTruthy()

      // Should be parseable as JSON (when we remove trailing semicolon)
      const jsonStr = match![1]
      expect(() => JSON.parse(jsonStr)).not.toThrow()
    })
  })

  describe('functions with tests', () => {
    it('runs inline tests during transpilation', () => {
      // Use -! to skip signature test - we only want to count explicit tests
      const tjsSource = `
function add(a: 0, b: 0) -! 0 {
  return a + b
}

test 'add works' {
  expect(add(2, 3)).toBe(5)
}
`
      const { testResults } = tjs(tjsSource, { runTests: 'report' })

      expect(testResults).toBeDefined()
      // Should have 1 explicit test (signature test is skipped with -!)
      expect(testResults?.filter((t) => !t.isSignatureTest).length).toBe(1)
      expect(testResults?.find((t) => !t.isSignatureTest)?.passed).toBe(true)
    })
  })

  describe('structural equality (== and !=)', () => {
    // NOTE: As of the mode inversion, JS semantics are the default.
    // TjsEquals directive enables structural equality transformation.

    it('preserves == as-is by default (JS semantics)', () => {
      const tjsSource = `function isEqual(a: {x: 0}, b: {x: 0}) -! true { return a == b }`
      const { code } = tjs(tjsSource)

      // Without TjsEquals, == is NOT transformed
      expect(code).not.toContain('Is(')
      expect(code).toContain('==')
    })

    it('transforms == to Is() with TjsEquals directive', () => {
      const tjsSource = `TjsEquals
function isEqual(a: {x: 0}, b: {x: 0}) -! true { return a == b }`
      const { code } = tjs(tjsSource)

      // Should transform == to Is()
      expect(code).toContain('Is(')
      // Should add Is import at top
      expect(code).toContain('const { Is }')
    })

    it('transforms != to IsNot() with TjsEquals directive', () => {
      const tjsSource = `TjsEquals
function notEqual(a: {x: 0}, b: {x: 0}) -! true { return a != b }`
      const { code } = tjs(tjsSource)

      // Should transform != to IsNot()
      expect(code).toContain('IsNot(')
      // Should add IsNot import at top
      expect(code).toContain('IsNot')
    })

    it('preserves === for identity comparison', () => {
      const tjsSource = `TjsEquals
function isSame(a: {x: 0}, b: {x: 0}) -! true { return a === b }`
      const { code } = tjs(tjsSource)

      // Should preserve === unchanged
      expect(code).toContain('===')
      // Should NOT transform to Is()
      expect(code).not.toContain('Is(')
    })

    it('does NOT add Is/IsNot imports when not needed', () => {
      // Use unsafe (!) to skip all validation, then no __tjs needed
      const tjsSource = `function add(! a: 0, b: 0) -! 0 { return a + b }`
      const { code } = tjs(tjsSource)

      // No equality ops and fully unsafe = no __tjs reference
      expect(code).not.toContain('const { Is')
      // Note: __tjs IS now needed for typeError() in safe functions
      // But this function is fully unsafe so no validation code is added
      expect(code).not.toContain('__tjs.typeError')
    })

    it('adds only Is when only == is used with TjsEquals', () => {
      const tjsSource = `TjsEquals
function eq(a: 0, b: 0) -! true { return a == b }`
      const { code } = tjs(tjsSource)

      expect(code).toContain('Is(')
      expect(code).toContain('const { Is }')
      expect(code).not.toContain('IsNot')
    })

    it('adds only IsNot when only != is used with TjsEquals', () => {
      const tjsSource = `TjsEquals
function neq(a: 0, b: 0) -! true { return a != b }`
      const { code } = tjs(tjsSource)

      expect(code).toContain('IsNot(')
      expect(code).toContain('const { IsNot }')
      expect(code).not.toMatch(/\bIs\b[^N]/) // Is but not IsNot
    })

    it('adds both Is and IsNot when both == and != are used with TjsEquals', () => {
      const tjsSource = `TjsEquals
function test(a: 0, b: 0) -! true { return a == b || a != b }`
      const { code } = tjs(tjsSource)

      expect(code).toContain('Is(')
      expect(code).toContain('IsNot(')
      expect(code).toContain('const { Is, IsNot }')
    })

    it('does NOT add imports for === only even with TjsEquals', () => {
      const tjsSource = `TjsEquals
function strict(a: 0, b: 0) -! true { return a === b }`
      const { code } = tjs(tjsSource)

      expect(code).not.toContain('const { Is')
      expect(code).toContain('===')
    })

    it('structural equality works at runtime with TjsEquals', async () => {
      const { installRuntime } = await import('./runtime')
      installRuntime()

      const tjsSource = `TjsEquals
function isEqual(a: {x: 0}, b: {x: 0}) -! true { return a == b }`
      const { code } = tjs(tjsSource)

      const isEqual = new Function(code + '; return isEqual')()

      // Structural equality: same structure = true
      expect(isEqual({ x: 1 }, { x: 1 })).toBe(true)
      // Different values = false
      expect(isEqual({ x: 1 }, { x: 2 })).toBe(false)
    })
  })

  describe('TjsStandard (ASI protection)', () => {
    it('inserts semicolon before IIFE to prevent footgun', () => {
      const tjsSource = `TjsStandard
function test() -! 0 {
  const x = 1
  (() => console.log('iife'))()
  return x
}`
      const { code } = tjs(tjsSource)

      // Should insert semicolon before the IIFE
      expect(code).toContain(';(() =>')
    })

    it('inserts semicolon before array literal on new line', () => {
      const tjsSource = `TjsStandard
function test() -! 0 {
  const x = 1
  [1, 2, 3].forEach(console.log)
  return x
}`
      const { code } = tjs(tjsSource)

      // Should insert semicolon before the array
      expect(code).toContain(';[1, 2, 3]')
    })

    it('does NOT insert semicolon when previous line has operator', () => {
      const tjsSource = `TjsStandard
function test() -! 0 {
  const result = 1 +
    (2 + 3)
  return result
}`
      const { code } = tjs(tjsSource)

      // Should NOT add semicolon - the + continues to next line
      expect(code).not.toContain(';(2 + 3)')
      expect(code).toContain('1 +')
      expect(code).toContain('(2 + 3)')
    })

    it('does NOT insert semicolon after opening brace', () => {
      // Test that we don't add ; after [ or {
      const tjsSource = `TjsStandard
function test() -! 0 {
  const arr = [
    (x => x + 1)
  ]
  return arr[0](1)
}`
      const { code } = tjs(tjsSource)

      // Should NOT add semicolon after [
      expect(code).not.toContain('[;')
      expect(code).toContain('[\n')
    })

    it('does NOT insert semicolon after return keyword', () => {
      const tjsSource = `TjsStandard
function test() -! 0 {
  return (
    1 + 2
  )
}`
      const { code } = tjs(tjsSource)

      // Should NOT add semicolon after return
      expect(code).toContain('return (')
      expect(code).not.toContain('return\n  ;(')
    })

    it('does NOT insert semicolon after comma (multi-line array)', () => {
      const tjsSource = `TjsStandard
function test() -! [] {
  return [
    1,
    (2 + 3),
    4
  ]
}`
      const { code } = tjs(tjsSource)

      // Should NOT add semicolon after comma
      expect(code).not.toContain(';(2 + 3)')
    })

    it('TjsStrict enables TjsStandard', () => {
      const tjsSource = `TjsStrict
function test() -! 0 {
  const x = 1
  (() => console.log('iife'))()
  return x
}`
      const { code } = tjs(tjsSource)

      // TjsStrict should enable TjsStandard
      expect(code).toContain(';(() =>')
    })

    it('works correctly at runtime', () => {
      const tjsSource = `TjsStandard
function test() -! 0 {
  let result = 42
  (() => { result = result + 1 })()
  return result
}`
      const { code } = tjs(tjsSource)
      const fn = new Function(code + '; return test')()

      // Should work: IIFE runs separately, doesn't try to call result
      expect(fn()).toBe(43)
    })

    it('without TjsStandard, IIFE would be footgun (JS behavior)', () => {
      // This demonstrates the footgun that TjsStandard prevents
      // Without the directive, the code passes through unchanged
      const tjsSource = `
function getNumber() -! 0 { return 42 }
function test() -! 0 {
  const x = getNumber
  (() => {})()
  return 1
}`
      const { code } = tjs(tjsSource)

      // Without TjsStandard, no semicolon is inserted
      // This means x(...) would be called with IIFE as argument
      expect(code).not.toContain(';(() =>')
    })
  })
})

describe('Full Pipeline: TS → TJS → JS', () => {
  describe('complete transformations', () => {
    it('single function through full pipeline', () => {
      // Step 1: TypeScript source
      const ts = `
function calculate(a: number, b: number, operation: string): number {
  if (operation === 'add') return a + b
  if (operation === 'multiply') return a * b
  return 0
}
`
      // Step 2: TS → TJS
      const { code: tjsCode } = fromTS(ts, { emitTJS: true })
      expect(tjsCode).toContain('a: 0')
      expect(tjsCode).toContain('b: 0')
      expect(tjsCode).toContain("operation: ''")
      expect(tjsCode).toContain('-! 0') // TS transpiler uses -! to skip signature tests

      // Step 3: TJS → JS (already has -! from TS transpiler)
      const { code: jsCode, types } = tjs(tjsCode)

      // Verify JS output
      expect(jsCode).toContain('function calculate')
      expect(jsCode).toContain('calculate.__tjs')
      expect(types?.calculate).toBeDefined()

      // Step 4: Execute
      const fn = new Function(jsCode + '; return calculate')()
      expect(fn(5, 3, 'add')).toBe(8)
      expect(fn(5, 3, 'multiply')).toBe(15)
    })

    it('multiple functions through full pipeline', () => {
      const ts = `
function add(a: number, b: number): number {
  return a + b
}

function subtract(a: number, b: number): number {
  return a - b
}

function multiply(a: number, b: number): number {
  return a * b
}
`
      // TS → TJS
      const { code: tjsCode } = fromTS(ts, { emitTJS: true })

      // Verify TJS has all functions
      expect(tjsCode).toContain('function add')
      expect(tjsCode).toContain('function subtract')
      expect(tjsCode).toContain('function multiply')

      // TJS → JS (already has -! from TS transpiler)
      const { code: jsCode, types } = tjs(tjsCode)

      // Verify all functions in JS
      expect(types?.add).toBeDefined()
      expect(types?.subtract).toBeDefined()
      expect(types?.multiply).toBeDefined()

      // Execute all functions
      const result = new Function(
        jsCode + '; return { add, subtract, multiply }'
      )()
      expect(result.add(10, 5)).toBe(15)
      expect(result.subtract(10, 5)).toBe(5)
      expect(result.multiply(10, 5)).toBe(50)
    })

    it('complex types through full pipeline', () => {
      const ts = `
function processUser(user: { name: string; age: number }): string {
  return user.name + ' is ' + user.age + ' years old'
}
`
      // TS → TJS
      const { code: tjsCode } = fromTS(ts, { emitTJS: true })
      expect(tjsCode).toContain("name: ''")
      expect(tjsCode).toContain('age: 0')

      // TJS → JS (already has -! from TS transpiler)
      const { code: jsCode, types } = tjs(tjsCode)

      // Verify metadata captures object shape
      expect(types?.processUser?.params?.user?.type?.kind).toBe('object')
      expect(types?.processUser?.params?.user?.type?.shape?.name?.kind).toBe(
        'string'
      )
      expect(types?.processUser?.params?.user?.type?.shape?.age?.kind).toBe(
        'number'
      )

      // Execute
      const fn = new Function(jsCode + '; return processUser')()
      expect(fn({ name: 'Alice', age: 30 })).toBe('Alice is 30 years old')
    })
  })

  describe('runtime validation from TS types', () => {
    // Install runtime for MonadicError
    const { installRuntime } = require('./runtime')
    installRuntime()

    it('validates object type at runtime', () => {
      const ts = `
function greet(user: { name: string; age: number }): string {
  return 'Hello, ' + user.name
}
`
      const { code: tjsCode } = fromTS(ts, { emitTJS: true })
      // Already has -! from TS transpiler
      const { code: jsCode } = tjs(tjsCode)

      const greet = new Function(jsCode + '; return greet')()

      // Valid input works
      const validResult = greet({ name: 'Alice', age: 30 })
      expect(validResult).toBe('Hello, Alice')

      // Non-object input returns MonadicError (extends Error)
      const invalidResult = greet('not an object')
      expect(invalidResult).toBeInstanceOf(Error)

      // Note: Current validation checks type (object vs primitive),
      // not deep property validation. Missing properties pass type check.
      const missingProps = greet({ name: 'Bob' })
      expect(missingProps).toBe('Hello, Bob') // This works (no deep validation)
    })

    it('validates primitive types at runtime', () => {
      const ts = `
function add(a: number, b: number): number {
  return a + b
}
`
      const { code: tjsCode } = fromTS(ts, { emitTJS: true })
      // Already has -! from TS transpiler
      const { code: jsCode } = tjs(tjsCode)

      const add = new Function(jsCode + '; return add')()

      // Valid input works
      expect(add(2, 3)).toBe(5)

      // Invalid input returns MonadicError (extends Error)
      const invalidResult = add('two', 3)
      expect(invalidResult).toBeInstanceOf(Error)
    })
  })

  describe('metadata correctness through pipeline', () => {
    it('preserves param types through TS → TJS → JS', () => {
      const ts = `
function test(
  str: string,
  num: number,
  bool: boolean,
  arr: string[],
  obj: { x: number }
): void { }
`
      const { code: tjsCode } = fromTS(ts, { emitTJS: true })
      const { types } = tjs(tjsCode)

      expect(types?.test?.params?.str?.type?.kind).toBe('string')
      expect(types?.test?.params?.num?.type?.kind).toBe('number')
      expect(types?.test?.params?.bool?.type?.kind).toBe('boolean')
      expect(types?.test?.params?.arr?.type?.kind).toBe('array')
      expect(types?.test?.params?.obj?.type?.kind).toBe('object')
    })

    it('preserves required vs optional through pipeline', () => {
      const ts = `
function test(required: string, optional?: number): void { }
`
      const { code: tjsCode } = fromTS(ts, { emitTJS: true })
      const { types } = tjs(tjsCode)

      expect(types?.test?.params?.required?.required).toBe(true)
      expect(types?.test?.params?.optional?.required).toBe(false)
    })
  })
})

/**
 * Monadic Error Handling Tests
 *
 * Critical tests for proper error propagation through function chains.
 * The monadic pattern ensures:
 * 1. Errors pass through without being processed (no work done)
 * 2. Type errors return real Error objects, not plain objects
 * 3. User code can't accidentally swallow errors as data
 */
describe('Monadic error handling', () => {
  // Install runtime globally for tests
  const { installRuntime, MonadicError } = require('./runtime')
  installRuntime() // Sets globalThis.__tjs

  describe('error pass-through (monadic propagation)', () => {
    it('passes through Error input without processing', () => {
      const tjsSource = `
function double(x: 0) -! 0 {
  return x * 2
}
`
      const { code } = tjs(tjsSource)
      // Runtime is already installed globally, code references globalThis.__tjs
      const double = new Function(code + '; return double')()

      // Pass an error as input
      const inputError = new Error('upstream failure')
      const result = double(inputError)

      // Should return the same error, not process it
      expect(result).toBe(inputError)
    })

    it('passes through error in multi-param function', () => {
      const tjsSource = `
function add(a: 0, b: 0) -! 0 {
  return a + b
}
`
      const { code } = tjs(tjsSource)
      const add = new Function(code + '; return add')()

      const inputError = new Error('bad value')

      // Error in first param
      expect(add(inputError, 5)).toBe(inputError)

      // Error in second param
      expect(add(5, inputError)).toBe(inputError)
    })

    it('propagates error through function chain', () => {
      const tjsSource = `
function step1(x: 0) -! 0 {
  return x * 2
}

function step2(x: 0) -! 0 {
  return x + 10
}

function step3(x: 0) -! 0 {
  return x / 2
}
`
      const { code } = tjs(tjsSource)
      const fns = new Function(code + '; return { step1, step2, step3 }')()

      // Chain: step3(step2(step1(error)))
      const inputError = new Error('start with error')
      const result = fns.step3(fns.step2(fns.step1(inputError)))

      // Same error flows through all three functions
      expect(result).toBe(inputError)
    })
  })

  describe('type error emission', () => {
    it('returns MonadicError on type mismatch', () => {
      const tjsSource = `
function greet(name: '') -! '' {
  return 'Hello, ' + name
}
`
      const { code } = tjs(tjsSource)
      const greet = new Function(code + '; return greet')()

      // Pass wrong type
      const result = greet(42)

      // Should be a MonadicError (extends Error)
      expect(result).toBeInstanceOf(Error)
      expect(result).toBeInstanceOf(MonadicError)
      // Path now includes source location: "<source>:line:func.param"
      expect(result.path).toContain('greet.name')
      expect(result.expected).toBe('string')
    })

    it('includes path for nested params', () => {
      const tjsSource = `
function process({ name: '', age: 0 }) -! '' {
  return name + ' is ' + age
}
`
      const { code } = tjs(tjsSource)
      const process = new Function(code + '; return process')()

      // Pass wrong type for name
      const result = process({ name: 123, age: 30 })

      expect(result).toBeInstanceOf(MonadicError)
      // Path includes source location
      expect(result.path).toContain('process.name')
    })

    it('user code cannot accidentally process error as data', () => {
      const tjsSource = `
function getData(id: 0) -! { value: 0 } {
  return { value: id * 10 }
}
`
      const { code } = tjs(tjsSource)
      const getData = new Function(code + '; return getData')()

      const result = getData('not-a-number')

      // Error is an Error, not a plain object
      expect(result).toBeInstanceOf(Error)

      // Trying to access .value won't work like it would with plain object
      // This prevents accidental error swallowing
      expect(result.value).toBeUndefined()

      // But error properties are accessible
      expect(result.message).toContain('Expected number')
    })
  })

  describe('error vs valid value distinction', () => {
    it('valid values pass through normally', () => {
      const tjsSource = `
function double(x: 0) -! 0 {
  return x * 2
}
`
      const { code } = tjs(tjsSource)
      const double = new Function(code + '; return double')()

      expect(double(5)).toBe(10)
      expect(double(0)).toBe(0)
      expect(double(-3)).toBe(-6)
    })

    it('distinguishes Error from error-like objects', () => {
      const tjsSource = `
function process(data: { error: false }) -! { error: false } {
  return data
}
`
      const { code } = tjs(tjsSource)
      const process = new Function(code + '; return process')()

      // An object with an 'error' property should NOT be treated as an Error
      // Only actual Error instances trigger pass-through
      const errorLikeObj = { error: true, message: 'not a real error' }
      const result = process(errorLikeObj)

      // It's processed (not passed through) - returns the same object
      // because it's not an Error instance
      expect(result).toBe(errorLikeObj)

      // But a real Error WOULD be passed through
      const realError = new Error('real error')
      const errorResult = process(realError)
      expect(errorResult).toBe(realError)
    })
  })

  describe('unsafe functions skip validation entirely', () => {
    it('unsafe function skips all validation including error pass-through', () => {
      const tjsSource = `
function fastDouble(! x: 0) -! 0 {
  return x * 2
}
`
      const { code } = tjs(tjsSource)
      const fastDouble = new Function(code + '; return fastDouble')()

      // Unsafe function has no validation code at all
      // JS coerces '5' to 5 for multiplication
      const result = fastDouble('5')
      expect(result).toBe(10) // '5' * 2 = 10 (JS coercion)

      // Also doesn't check for error pass-through
      const err = new Error('test')
      const errResult = fastDouble(err)
      expect(errResult).toBeNaN() // Error * 2 = NaN
    })
  })

  describe('source location tracking', () => {
    it('error includes source file and line (no debug mode)', () => {
      const tjsSource = `
function greet(name: '') -! '' {
  return 'Hello, ' + name
}
`
      const { code } = tjs(tjsSource)
      const greet = new Function(code + '; return greet')()

      const err = greet(42)
      expect(err).toBeInstanceOf(MonadicError)
      // Path includes source location
      expect(err.path).toContain('greet.name')
      // Has the standard Error stack trace (from V8/JSC)
      expect(err.stack).toBeDefined()
      expect(err.stack).toContain('MonadicError')
    })

    it('includes original TS file and line in error path (full pipeline)', () => {
      // Simulate a multi-function TS file
      const ts = `
function validate(input: string): boolean {
  return input.length > 0
}

function process(data: number): number {
  return data * 2
}

function transform(value: string): string {
  return value.toUpperCase()
}
`
      // TS → TJS with filename
      const { code: tjsCode } = fromTS(ts, {
        emitTJS: true,
        filename: 'src/processors/data.ts',
      })

      // TJS → JS
      const { code: jsCode } = tjs(tjsCode)

      // Execute and trigger errors
      const fns = new Function(
        jsCode + '; return { validate, process, transform }'
      )()

      // Each function should report its correct source line
      const validateErr = fns.validate(123) // wrong type
      expect(validateErr).toBeInstanceOf(MonadicError)
      expect(validateErr.path).toContain('src/processors/data.ts:2')
      expect(validateErr.path).toContain('validate.input')

      const processErr = fns.process('not a number')
      expect(processErr).toBeInstanceOf(MonadicError)
      expect(processErr.path).toContain('src/processors/data.ts:6')
      expect(processErr.path).toContain('process.data')

      const transformErr = fns.transform(42)
      expect(transformErr).toBeInstanceOf(MonadicError)
      expect(transformErr.path).toContain('src/processors/data.ts:10')
      expect(transformErr.path).toContain('transform.value')
    })

    it('preserves line annotations through TJS intermediate', () => {
      // TJS with explicit line annotations (as if from TS transpilation)
      const tjsSource = `/* tjs <- lib/utils.ts */

/* line 15 */
function helper(x: 0) -! 0 {
  return x + 1
}
`
      const { code } = tjs(tjsSource)

      // Metadata should reference the original file and line
      expect(code).toContain('"source": "lib/utils.ts:15"')

      // Error paths should include the source
      const helper = new Function(code + '; return helper')()
      const err = helper('wrong')
      expect(err.path).toBe('lib/utils.ts:15:helper.x')
    })

    it('captures TJS call stack in debug mode', () => {
      const { configure } = require('./runtime')

      // Enable debug mode
      configure({ debug: true })

      try {
        const tjsSource = `/* tjs <- src/chain.ts */

/* line 10 */
function outer(x: 0) -! 0 {
  return middle(x * 2)
}

/* line 20 */
function middle(x: 0) -! 0 {
  return inner(x + 10)
}

/* line 30 */
function inner(x: '') -! '' {
  return x.toUpperCase()
}
`
        const { code } = tjs(tjsSource)
        const fns = new Function(code + '; return { outer, middle, inner }')()

        // outer(5) -> middle(10) -> inner(20) fails (20 is not a string)
        const err = fns.outer(5)

        expect(err).toBeInstanceOf(MonadicError)
        expect(err.path).toBe('src/chain.ts:30:inner.x')

        // Call stack should show the chain with source locations
        expect(err.callStack).toBeDefined()
        expect(err.callStack).toContain('src/chain.ts:10:outer')
        expect(err.callStack).toContain('src/chain.ts:20:middle')
        expect(err.callStack).toContain('src/chain.ts:30:inner')
      } finally {
        // Reset debug mode
        configure({ debug: false })
      }
    })

    it('does not capture call stack when debug mode is off', () => {
      const { configure } = require('./runtime')

      // Ensure debug mode is off
      configure({ debug: false })

      const tjsSource = `
function test(x: 0) -! 0 {
  return x * 2
}
`
      const { code } = tjs(tjsSource)
      const test = new Function(code + '; return test')()

      const err = test('wrong')
      expect(err).toBeInstanceOf(MonadicError)
      // No call stack when debug is off
      expect(err.callStack).toBeUndefined()
    })
  })
})
