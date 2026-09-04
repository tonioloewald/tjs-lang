function __ub(v) {
  try {
    if (v instanceof String) return String.prototype.valueOf.call(v)
    if (v instanceof Number) return Number.prototype.valueOf.call(v)
    if (v instanceof Boolean) return Boolean.prototype.valueOf.call(v)
  } catch {
    return v
  }
  return v
}
const __ac = Object.create(null)
function __proj(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v
  let k
  try {
    k = v.constructor && v.constructor.name
  } catch {
    return v
  }
  let f = k && Object.prototype.hasOwnProperty.call(__ac, k) ? __ac[k] : null
  if (typeof f !== 'function') {
    try {
      f = v.asCompared
    } catch {
      return v
    }
  }
  if (typeof f !== 'function') return v
  let p
  try {
    p = f.call(v)
  } catch {
    return v
  }
  const t = typeof p
  return p === null ||
    p === undefined ||
    t === 'number' ||
    t === 'string' ||
    t === 'boolean'
    ? p
    : v
}
function Eq(a, b) {
  a = __ub(__proj(a))
  b = __ub(__proj(b))
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b))
    return true
  if ((a === null || a === undefined) && (b === null || b === undefined))
    return true
  return false
}
function NotEq(a, b) {
  return !Eq(a, b)
}
function TypeOf(v) {
  return v === null ? 'null' : typeof v
}
const tjsEquals = Symbol.for('tjs.equals')
function Is(a, b) {
  return __goIs(a, b, 0, null)
}
function __goIs(a, b, d, m) {
  if (a != null && typeof a === 'object' && typeof a[tjsEquals] === 'function')
    return a[tjsEquals](b)
  if (b != null && typeof b === 'object' && typeof b[tjsEquals] === 'function')
    return b[tjsEquals](a)
  if (a != null && typeof a === 'object' && typeof a.Equals === 'function')
    return a.Equals(b)
  if (b != null && typeof b === 'object' && typeof b.Equals === 'function')
    return b.Equals(a)
  a = __ub(__proj(a))
  b = __ub(__proj(b))
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b))
    return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (d >= 8) {
    if (m === null) m = new WeakMap()
    let s = m.get(a)
    if (s) {
      if (s.has(b)) return true
    } else {
      s = new WeakSet()
      m.set(a, s)
    }
    s.add(b)
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false
    for (const v of a) if (!b.has(v)) return false
    return true
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [k, v] of a)
      if (!b.has(k) || !__goIs(v, b.get(k), d + 1, m)) return false
    return true
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a instanceof RegExp && b instanceof RegExp)
    return a.toString() === b.toString()
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => __goIs(v, b[i], d + 1, m))
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a),
    kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => __goIs(a[k], b[k], d + 1, m))
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {
  Eq,
  NotEq,
  TypeOf,
  Is,
  tjsEquals,
}
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { fromTS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'

import { generateDocs } from '/Users/tonioloewald/tjs-lang/src/lang/docs'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

describe('TS → TJS conversion quality', () => {
  describe('function parameters', () => {
    it('converts required string param to colon syntax', () => {
      const ts = `function greet(name: string): string { return name }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('name: string')
      expect(code).not.toContain("name: ''")
    })
    it('converts required number param to colon syntax', () => {
      const ts = `function double(x: number): number { return x * 2 }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('x: number')
      expect(code).not.toContain('x: 0.0')
    })
    it('keeps an optional param optional', () => {
      const ts = `function greet(name?: string): string { return name || 'World' }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toContain('name: string | undefined')
    })
    it('preserves explicit default values', () => {
      const ts = `function greet(name: string = 'World'): string { return name }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain("name = 'World'")
    })
    it('converts boolean param correctly', () => {
      const ts = `function toggle(flag: boolean): boolean { return !flag }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('flag: boolean')
    })
    it('converts optional boolean param to union with undefined', () => {
      const ts = `function greet(name: string, excited?: boolean): string { return excited ? name + '!' : name }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('excited: boolean | undefined')
    })
    it('converts array param correctly', () => {
      const ts = `function sum(nums: number[]): number { return nums.reduce((a, b) => a + b, 0) }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('nums: [number]')
    })
    it('converts object param correctly', () => {
      const ts = `function getAge(user: { name: string; age: number }): number { return user.age }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('name: string')
      expect(code).toContain('age: number')
    })
    it('handles multiple params in order', () => {
      const ts = `function add(a: number, b: number): number { return a + b }`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).toMatch(/add\(a: number, b: number\)/)
    })
    it('handles mixed required and optional params', () => {
      const ts = `function fetch(url: string, timeout?: number): void { }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('url: string')
      expect(code).toContain('timeout: number | undefined')
    })
  })
  describe('return types', () => {
    it('converts string return type to -! syntax (skip signature test)', () => {
      const ts = `function getName(): string { return 'test' }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain(':! string')
    })
    it('converts number return type to -! syntax', () => {
      const ts = `function getCount(): number { return 42 }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain(':! number')
    })
    it('converts boolean return type to -! syntax', () => {
      const ts = `function isValid(): boolean { return true }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain(':! boolean')
    })
    it('converts object return type to -! syntax', () => {
      const ts = `function getUser(): { name: string; age: number } { return { name: '', age: 0 } }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain(':!')
      expect(code).toContain('name: string')
      expect(code).toContain('age: number')
    })
    it('converts array return type to -! syntax', () => {
      const ts = `function getItems(): string[] { return [] }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain(':! [string]')
    })
    it('omits void return type', () => {
      const ts = `function doSomething(): void { console.log('done') }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).not.toContain(':!')
      expect(code).not.toMatch(/\)\s*:/)
    })
    it('handles Promise return types by unwrapping', () => {
      const ts = `async function fetchData(): Promise<string> { return 'data' }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain(':! string')
      expect(code).not.toContain('Promise')
    })
  })
  describe('type aliases and interfaces', () => {
    it('converts simple interface to Type', () => {
      const ts = `interface User { name: string; age: number }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('Type User')
      expect(code).toContain("name: ''")
      expect(code).toContain('age: 0.0')
    })
    it('converts type alias to Type', () => {
      const ts = `type Point = { x: number; y: number }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('Type Point')
      expect(code).toContain('x: 0.0')
      expect(code).toContain('y: 0.0')
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
      expect(code).toContain('constructor(name: string)')
    })
    it('strips private keyword without converting to # syntax', () => {
      const ts = `
class Counter {
  private count: number = 0
  increment() { this.count++ }
}
`
      const { code } = fromTS(ts, { emitTJS: true })

      expect(code).not.toContain('private')
      expect(code).not.toContain('#count')
      expect(code).toContain('this.count')
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
      expect(code).toContain('add(a: number, b: number):! number')
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
      expect(code).toContain('static double(x: number):! number')
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
      expect(code).toContain(':! string')
    })
  })
  describe('nullable types', () => {
    it('converts T | null to T | null', () => {
      const ts = `function maybe(x: string | null): string | null { return x }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('string | null')
    })
    it('converts T | undefined to T | undefined', () => {
      const ts = `function maybe(x: number | undefined): number | undefined { return x }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('number | undefined')
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
      expect(code).toContain('x: number')
      expect(code).toContain(':! number')
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
    it('strips colon type annotations from output (required params get no default)', () => {
      const source = `function greet(name: 'World') { return name }`
      const { code } = tjs(source)

      expect(code).toContain('function greet(name)')
      expect(code).not.toContain("name: 'World'")
      expect(code).not.toContain('name = ')
    })
    it('preserves defaults for optional params (= syntax)', () => {
      const source = `function greet(name = 'World') { return name }`
      const { code } = tjs(source)
      expect(code).toContain("name = 'World'")
    })
  })
  describe('__tjs metadata', () => {
    it('includes param types in metadata', () => {
      const source = `function greet(name: 'World'): 'World' { return name }`
      const { code, types } = tjs(source)
      expect(code).toContain('__tjs')

      expect(types?.greet?.params?.name?.type?.kind).toBe('string')
    })
    it('includes return type in metadata', () => {
      const source = `function double(x: 0): 0 { return x * 2 }`
      const { code, types } = tjs(source)
      expect(code).toContain('__tjs')

      expect(types?.double?.returns?.kind).toBe('integer')
    })
    it('marks required params correctly', () => {
      const source = `function required(a: 0, b = 0) { return a + b }`
      const { types } = tjs(source)

      expect(types?.required?.params?.a?.required).toBe(true)
      expect(types?.required?.params?.b?.required).toBe(false)
    })
  })
})

describe('documentation generation quality', () => {
  describe('function signatures', () => {
    it('preserves original signature in markdown', () => {
      const source = `function greet(name: 'World'): '' { return name }`
      const { markdown } = generateDocs(source)

      expect(markdown).toContain("function greet(name: 'World'): ''")
    })
    it('preserves optional params with defaults', () => {
      const source = `function greet(name = 'World'): '' { return name }`
      const { markdown } = generateDocs(source)
      expect(markdown).toContain("name = 'World'")
    })
  })
  describe('signature as documentation', () => {
    it('shows params in signature', () => {
      const source = `function add(a: 0, b: 0): 0 { return a + b }`
      const { markdown } = generateDocs(source)
      expect(markdown).toContain('a: 0')
      expect(markdown).toContain('b: 0')
    })
    it('shows return type in signature', () => {
      const source = `function double(x: 0): 0 { return x * 2 }`
      const { markdown } = generateDocs(source)
      expect(markdown).toContain(': 0')
    })
  })
})

describe('round-trip quality', () => {
  it('TS → TJS → JS produces valid code', () => {
    const ts = `function add(a: number, b: number): number { return a + b }`

    const { code: tjsCode } = fromTS(ts, { emitTJS: true })
    expect(tjsCode).toContain('function add')

    const { code: jsCode } = tjs(tjsCode)
    expect(jsCode).toContain('function add')
    expect(jsCode).toContain('__tjs')

    const fn = new Function(jsCode + '; return add')()
    expect(fn(2, 3)).toBe(5)
  })
  it('preserves semantics through conversion', () => {
    const ts = `
function greet(name: string, excited?: boolean): string {
  return excited ? name + '!' : name
}
`
    const { code: tjsCode } = fromTS(ts, { emitTJS: true })

    const tjsCodeUnsafe = tjsCode.replace('-> ', '-! ')
    const { code: jsCode } = tjs(tjsCodeUnsafe)
    const fn = new Function(jsCode + '; return greet')()
    expect(fn('Hello', true)).toBe('Hello!')
    expect(fn('Hello', false)).toBe('Hello')
  })
})

describe('Pipeline Step 1: TS → TJS', () => {
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

      expect(code).toContain('function add(a: number, b: number):! number')
      expect(code).toContain('function multiply(a: number, b: number):! number')
      expect(code).toContain('function greet(name: string):! string')

      expect(code).not.toContain(': 0.0')
      expect(code).not.toContain(": ''")
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

      expect(code).toContain('x: number')
      expect(code).toContain('y: string')
      expect(code).not.toContain('x: 0.0')
      expect(code).not.toContain("y: ''")
    })
    it('uses union with undefined for optional params', () => {
      const ts = `function test(x?: number, y?: string): void { }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('x: number | undefined')
      expect(code).toContain('y: string | undefined')
    })
    it('uses -! syntax for return types (skip signature test)', () => {
      const ts = `function test(): number { return 42 }`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain(':! number')
      expect(code).not.toContain(': 0.0')
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
      expect(code).toContain('name: string')
      expect(code).toContain('street: string')
      expect(code).toContain('city: string')
    })
    it('handles array of objects', () => {
      const ts = `
function getNames(users: { name: string; age: number }[]): string[] {
  return users.map(u => u.name)
}
`
      const { code } = fromTS(ts, { emitTJS: true })
      expect(code).toContain('[{')
      expect(code).toContain('name: string')
      expect(code).toContain('age: number')
    })
  })
})

describe('Pipeline Step 2: TJS → JS', () => {
  describe('multiple functions in one file', () => {
    it('transpiles multiple functions correctly', () => {
      const tjsSource = `
function add(a: 0, b: 0):! 0 {
  return a + b
}

function multiply(a: 0, b: 0):! 0 {
  return a * b
}

function greet(name: ''):! '' {
  return 'Hello, ' + name
}
`
      const { code, types } = tjs(tjsSource)

      expect(code).toContain('function add')
      expect(code).toContain('function multiply')
      expect(code).toContain('function greet')

      expect(code).toContain('add.__tjs')
      expect(code).toContain('multiply.__tjs')
      expect(code).toContain('greet.__tjs')

      expect(types).toHaveProperty('add')
      expect(types).toHaveProperty('multiply')
      expect(types).toHaveProperty('greet')
    })
    it('each function has correct metadata', () => {
      const tjsSource = `
function add(a: 0, b: 0):! 0 {
  return a + b
}

function greet(name: '', excited = false):! '' {
  return excited ? name + '!' : name
}
`
      const { types } = tjs(tjsSource)

      expect(types?.add?.params?.a?.required).toBe(true)
      expect(types?.add?.params?.b?.required).toBe(true)
      expect(types?.add?.returns?.kind).toBe('integer')

      expect(types?.greet?.params?.name?.required).toBe(true)
      expect(types?.greet?.params?.excited?.required).toBe(false)
      expect(types?.greet?.returns?.kind).toBe('string')
    })
  })
  describe('output is valid JavaScript', () => {
    it('produces executable JavaScript', () => {
      const tjsSource = `
function double(x: 0):! 0 {
  return x * 2
}
`
      const { code } = tjs(tjsSource)

      const fn = new Function(code + '; return double')()
      expect(fn(21)).toBe(42)
    })
    it('includes runtime validation', () => {
      const tjsSource = `
function greet(name: ''):! '' {
  return 'Hello, ' + name
}
`
      const { code } = tjs(tjsSource)

      expect(code).toContain('typeof')

      expect(code).toContain('__tjs.typeError')

      expect(code).toContain('instanceof Error')
    })
    it('__tjs metadata is valid JSON structure', () => {
      const tjsSource = `
function test(a: 0, b: ''):! true {
  return a > 0
}
`
      const { code } = tjs(tjsSource)

      const match = code.match(/test\.__tjs\s*=\s*(\{[\s\S]*?\});?\s*$/)
      expect(match).toBeTruthy()

      const jsonStr = match[1]
      expect(() => JSON.parse(jsonStr)).not.toThrow()
    })
  })
  describe('functions with tests', () => {
    it('runs inline tests during transpilation', () => {
      const tjsSource = `
function add(a: 0, b: 0):! 0 {
  return a + b
}




`
      const { testResults } = tjs(tjsSource, { runTests: 'report' })
      expect(testResults).toBeDefined()

      expect(testResults?.filter((t) => !t.isSignatureTest).length).toBe(1)
      expect(testResults?.find((t) => !t.isSignatureTest)?.passed).toBe(true)
    })
  })
  describe('structural equality (== and !=)', () => {
    it('preserves == as-is by default (JS semantics)', () => {
      const tjsSource = `function isEqual(a: {x: 0}, b: {x: 0}):! true { return a == b }`
      const { code } = tjs(tjsSource)

      expect(code).not.toContain('Is(')
      expect(code).toContain('==')
    })
    it('transforms == to Eq()', () => {
      const tjsSource = `function isEqual(a: {x: 0}, b: {x: 0}):! true { return a == b }`
      const { code } = tjs(tjsSource)

      expect(code).toContain('Eq(')

      expect(code).toContain('Eq')
    })
    it('transforms != to NotEq()', () => {
      const tjsSource = `function notEqual(a: {x: 0}, b: {x: 0}):! true { return a != b }`
      const { code } = tjs(tjsSource)

      expect(code).toContain('NotEq(')
      expect(code).toContain('NotEq')
    })
    it('preserves === for identity comparison', () => {
      const tjsSource = `function isSame(a: {x: 0}, b: {x: 0}):! true { return a === b }`
      const { code } = tjs(tjsSource)

      expect(code).toContain('===')

      expect(code).not.toContain('Is(')
    })
    it('does NOT add Is/IsNot imports when not needed', () => {
      const tjsSource = `function add(! a: 0, b: 0):! 0 { return a + b }`
      const { code } = tjs(tjsSource)

      expect(code).not.toContain('const { Is')

      expect(code).not.toContain('__tjs.typeError')
    })
    it('adds only Eq when only == is used', () => {
      const tjsSource = `function eq(a: 0, b: 0):! true { return a == b }`
      const { code } = tjs(tjsSource)
      expect(code).toContain('Eq(')
      expect(code).toContain('Eq')
      expect(code).not.toContain('NotEq')
    })
    it('adds only NotEq when only != is used', () => {
      const tjsSource = `function neq(a: 0, b: 0):! true { return a != b }`
      const { code } = tjs(tjsSource)
      expect(code).toContain('NotEq(')
      expect(code).toContain('NotEq')
    })
    it('adds both Eq and NotEq when both == and != are used', () => {
      const tjsSource = `function test(a: 0, b: 0):! true { return a == b || a != b }`
      const { code } = tjs(tjsSource)
      expect(code).toContain('Eq(')
      expect(code).toContain('NotEq(')
    })
    it('does NOT add imports for === only even', () => {
      const tjsSource = `function strict(a: 0, b: 0):! true { return a === b }`
      const { code } = tjs(tjsSource)
      expect(code).not.toContain('const { Is')
      expect(code).toContain('===')
    })
    it('honest equality works at runtime', async () => {
      const { installRuntime } = await import(
        '/Users/tonioloewald/tjs-lang/src/lang/runtime'
      )
      installRuntime()
      const tjsSource = `function isEqual(! a: null, b: null):! true { return a == b }`
      const { code } = tjs(tjsSource)
      const isEqual = new Function(code + '; return isEqual')()

      expect(isEqual(1, 1)).toBe(true)

      expect(isEqual(1, 2)).toBe(false)

      expect(isEqual(0, '')).toBe(false)
    })
    it('typeof transform skips string/template/comment bodies (regression)', () => {
      const tjsSource = `
const label = 'typeof null is null'
const tpl = \`type marker: typeof x\`
// typeof y
const t = typeof null
`
      const { code } = tjs(tjsSource)
      expect(code).toContain("'typeof null is null'")
      expect(code).toContain('`type marker: typeof x`')
      expect(code).toContain('TypeOf(null)')
    })
    it('applies TjsEquals to test/mock bodies (regression)', () => {
      const tjsSource = `const foo = '' == false














`
      const { testResults } = tjs(tjsSource, { runTests: 'report' })
      const failures = (testResults || []).filter((r) => !r.passed)
      expect(failures).toEqual([])
    })
  })
  describe('ASI protection (unconditional since 2026-08-02)', () => {
    it('inserts semicolon before IIFE to prevent footgun', () => {
      const tjsSource = `function test():! 0 {
  const x = 1
  (() => console.log('iife'))()
  return x
}`
      const { code } = tjs(tjsSource)

      expect(code).toContain(';(() =>')
    })
    it('inserts semicolon before array literal on new line', () => {
      const tjsSource = `function test():! 0 {
  const x = 1
  [1, 2, 3].forEach(console.log)
  return x
}`
      const { code } = tjs(tjsSource)

      expect(code).toContain(';[1, 2, 3]')
    })
    it('does NOT insert semicolon when previous line has operator', () => {
      const tjsSource = `function test():! 0 {
  const result = 1 +
    (2 + 3)
  return result
}`
      const { code } = tjs(tjsSource)

      expect(code).not.toContain(';(2 + 3)')
      expect(code).toContain('1 +')
      expect(code).toContain('(2 + 3)')
    })
    it('does NOT insert semicolon after opening brace', () => {
      const tjsSource = `function test():! 0 {
  const arr = [
    (x => x + 1)
  ]
  return arr[0](1)
}`
      const { code } = tjs(tjsSource)

      expect(code).not.toContain('[;')
      expect(code).toContain('[\n')
    })
    it('does NOT insert semicolon after return keyword', () => {
      const tjsSource = `function test():! 0 {
  return (
    1 + 2
  )
}`
      const { code } = tjs(tjsSource)

      expect(code).toContain('return (')
      expect(code).not.toContain('return\n  ;(')
    })
    it('does NOT insert semicolon after comma (multi-line array)', () => {
      const tjsSource = `function test():! [] {
  return [
    1,
    (2 + 3),
    4
  ]
}`
      const { code } = tjs(tjsSource)

      expect(code).not.toContain(';(2 + 3)')
    })
    it('TjsStrict enables TjsStandard', () => {
      const tjsSource = `TjsStrict
function test():! 0 {
  const x = 1
  (() => console.log('iife'))()
  return x
}`
      const { code } = tjs(tjsSource)

      expect(code).toContain(';(() =>')
    })
    it('works correctly at runtime', () => {
      const tjsSource = `function test():! 0 {
  let result = 42
  (() => { result = result + 1 })()
  return result
}`
      const { code } = tjs(tjsSource)
      const fn = new Function(code + '; return test')()

      expect(fn()).toBe(43)
    })
    it('without TjsStandard, IIFE would be footgun (JS behavior)', () => {
      const tjsSource = `TjsCompat
function getNumber():! 0 { return 42 }
function test():! 0 {
  const x = getNumber
  (() => {})()
  return 1
}`
      const { code } = tjs(tjsSource)

      expect(code).not.toContain(';(() =>')
    })
  })
})

describe('Full Pipeline: TS → TJS → JS', () => {
  describe('complete transformations', () => {
    it('single function through full pipeline', () => {
      const ts = `
function calculate(a: number, b: number, operation: string): number {
  if (operation === 'add') return a + b
  if (operation === 'multiply') return a * b
  return 0
}
`

      const { code: tjsCode } = fromTS(ts, { emitTJS: true })
      expect(tjsCode).toContain('a: number')
      expect(tjsCode).toContain('b: number')
      expect(tjsCode).toContain('operation: string')
      expect(tjsCode).toContain(':! number')

      const { code: jsCode, types } = tjs(tjsCode)

      expect(jsCode).toContain('function calculate')
      expect(jsCode).toContain('calculate.__tjs')
      expect(types?.calculate).toBeDefined()

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

      const { code: tjsCode } = fromTS(ts, { emitTJS: true })

      expect(tjsCode).toContain('function add')
      expect(tjsCode).toContain('function subtract')
      expect(tjsCode).toContain('function multiply')

      const { code: jsCode, types } = tjs(tjsCode)

      expect(types?.add).toBeDefined()
      expect(types?.subtract).toBeDefined()
      expect(types?.multiply).toBeDefined()

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

      const { code: tjsCode } = fromTS(ts, { emitTJS: true })
      expect(tjsCode).toContain('name: string')
      expect(tjsCode).toContain('age: number')

      const { code: jsCode, types } = tjs(tjsCode)

      expect(types?.processUser?.params?.user?.type?.kind).toBe('object')
      expect(types?.processUser?.params?.user?.type?.shape?.name?.kind).toBe(
        'string'
      )
      expect(types?.processUser?.params?.user?.type?.shape?.age?.kind).toBe(
        'number'
      )

      const fn = new Function(jsCode + '; return processUser')()
      expect(fn({ name: 'Alice', age: 30 })).toBe('Alice is 30 years old')
    })
  })
  describe('runtime validation from TS types', () => {
    const { installRuntime } = require('./runtime')
    installRuntime()
    it('validates object type at runtime', () => {
      const ts = `
function greet(user: { name: string; age: number }): string {
  return 'Hello, ' + user.name
}
`
      const { code: tjsCode } = fromTS(ts, { emitTJS: true })

      const { code: jsCode } = tjs('safety inputs\n' + tjsCode)
      const greet = new Function(jsCode + '; return greet')()

      const validResult = greet({ name: 'Alice', age: 30 })
      expect(validResult).toBe('Hello, Alice')

      const invalidResult = greet('not an object')
      expect(invalidResult).toBeInstanceOf(Error)

      const missingProps = greet({ name: 'Bob' })
      expect(missingProps).toBeInstanceOf(Error)
      expect(missingProps.path).toContain('greet.user.age')
    })
    it('validates primitive types at runtime', () => {
      const ts = `
function add(a: number, b: number): number {
  return a + b
}
`
      const { code: tjsCode } = fromTS(ts, { emitTJS: true })

      const { code: jsCode } = tjs('safety inputs\n' + tjsCode)
      const add = new Function(jsCode + '; return add')()

      expect(add(2, 3)).toBe(5)

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

      expect(types?.test?.params?.optional?.type?.kind).toBe('union')
    })
  })
})

describe('Monadic error handling', () => {
  const { installRuntime, MonadicError } = require('./runtime')
  installRuntime()
  describe('error pass-through (monadic propagation)', () => {
    it('passes through Error input without processing', () => {
      const tjsSource = `
function double(x: 0):! 0 {
  return x * 2
}
`
      const { code } = tjs(tjsSource)

      const double = new Function(code + '; return double')()

      const inputError = new Error('upstream failure')
      const result = double(inputError)

      expect(result).toBe(inputError)
    })
    it('passes through error in multi-param function', () => {
      const tjsSource = `
function add(a: 0, b: 0):! 0 {
  return a + b
}
`
      const { code } = tjs(tjsSource)
      const add = new Function(code + '; return add')()
      const inputError = new Error('bad value')

      expect(add(inputError, 5)).toBe(inputError)

      expect(add(5, inputError)).toBe(inputError)
    })
    it('propagates error through function chain', () => {
      const tjsSource = `
function step1(x: 0):! 0 {
  return x * 2
}

function step2(x: 0):! 0 {
  return x + 10
}

function step3(x: 0):! 0 {
  return x / 2
}
`
      const { code } = tjs(tjsSource)
      const fns = new Function(code + '; return { step1, step2, step3 }')()

      const inputError = new Error('start with error')
      const result = fns.step3(fns.step2(fns.step1(inputError)))

      expect(result).toBe(inputError)
    })
  })
  describe('type error emission', () => {
    it('returns MonadicError on type mismatch', () => {
      const tjsSource = `
function greet(name: ''):! '' {
  return 'Hello, ' + name
}
`
      const { code } = tjs(tjsSource)
      const greet = new Function(code + '; return greet')()

      const result = greet(42)

      expect(result).toBeInstanceOf(Error)
      expect(result).toBeInstanceOf(MonadicError)

      expect(result.path).toContain('greet.name')
      expect(result.expected).toBe('string')
    })
    it('includes path for nested params', () => {
      const tjsSource = `
function process({ name: '', age: 0 }):! '' {
  return name + ' is ' + age
}
`
      const { code } = tjs(tjsSource)
      const process = new Function(code + '; return process')()

      const result = process({ name: 123, age: 30 })
      expect(result).toBeInstanceOf(MonadicError)

      expect(result.path).toContain('process.name')
    })
    it('user code cannot accidentally process error as data', () => {
      const tjsSource = `
function getData(id: 0):! { value: 0 } {
  return { value: id * 10 }
}
`
      const { code } = tjs(tjsSource)
      const getData = new Function(code + '; return getData')()
      const result = getData('not-a-number')

      expect(result).toBeInstanceOf(Error)

      expect(result.value).toBeUndefined()

      expect(result.message).toContain('Expected integer')
    })
    it('returns MonadicError when a function param receives a non-function', () => {
      const { code } = tjs(`function f(fn = (x) => x): 0 { return fn(5) }`)
      const f = new Function(code + '; return f')()

      expect(f((n) => n * 2)).toBe(10)

      for (const bad of [42, 'hello', { x: 1 }, [1, 2], true]) {
        const result = f(bad)
        expect(result).toBeInstanceOf(MonadicError)
        expect(result.expected).toBe('function')
        expect(result.path).toContain('f.fn')
      }
    })
    describe('checkFnShape — pass-time shape check for function params', () => {
      it('passes a correctly-typed TJS function through unchanged', () => {
        const { code } = tjs(`function strLength(s: ''): 0 { return s.length }
function map(arr: [''], counter = strLength): [0] { return arr.map(counter) }`)
        const fns = new Function(code + '\nreturn { strLength, map }')()
        expect(fns.map(['hello', 'hi'])).toEqual([5, 2])
      })
      it('returns ONE MonadicError when a typed callback has the wrong return shape', () => {
        const { code } = tjs(`function strLength(s: ''): 0 { return s.length }
function badFn(s: ''): true { return true }
function map(arr: [''], counter = strLength): [0] { return arr.map(counter) }`)
        const fns = new Function(code + '\nreturn { badFn, map }')()
        const r = fns.map(['hi', 'world'], fns.badFn)
        expect(r).toBeInstanceOf(MonadicError)
        expect(r.expected).toBe('integer')
        expect(r.path).toContain('map.counter(return)')
      })
      it('passes untyped arrows through unchanged (no per-call wrapping)', () => {
        const { code } = tjs(`function strLength(s: ''): 0 { return s.length }
function map(arr: [''], counter = strLength): [0] { return arr.map(counter) }`)
        const fns = new Function(code + '\nreturn { map }')()

        const r = fns.map(['hi', 'world'], (_x) => false)
        expect(Array.isArray(r)).toBe(true)
        expect(r).toEqual([false, false])
      })
      it('does not emit checkFnShape when shape is empty (all-any)', () => {
        const { code: code3 } = tjs(`function h(fn = (x) => x): 0 { return 0 }`)
        expect(code3).not.toContain('__tjs.checkFnShape')
      })
      it('emits checkFnShape when only the return type is known', () => {
        const { code } = tjs(`function k(make = () => 5): 0 { return make() }`)
        expect(code).toContain('__tjs.checkFnShape')
      })
      it('array param with embedded MonadicError propagates the first error', () => {
        const { code } = tjs(`function first(s: ['hi']): 'hi' { return s[0] }`)
        const fns = new Function(code + '\nreturn { first }')()
        const fakeError = Object.assign(new Error('preexisting'), {
          name: 'MonadicError',
          path: 'somewhere.x',
          expected: 'integer',
          actual: 'string',
        })
        const r = fns.first([fakeError, 'world'])
        expect(r).toBeInstanceOf(Error)
        expect(r.path).toBe('somewhere.x')
        expect(r.message).toBe('preexisting')
      })
      it('module-level errors do not attribute to function declaration line', () => {
        const { testResults } = tjs(
          `function f(s: ''): 0 { return s.length }\n\nconsole.log(x)`,
          { runTests: 'report' }
        )
        const sig = testResults?.find((t) => t.isSignatureTest)
        expect(sig).toBeDefined()

        expect(sig?.passed).toBe(false)
        expect(sig?.inconclusive).toBe(true)
        expect(sig?.error).toContain('could not be executed')

        expect(sig?.line).toBeUndefined()
      })
      it("user's reported case: x => false passes through cleanly", () => {
        const { code } = tjs(`function strLength(s: 'hello'): 5 {
  return s.length
}
function mapStrings(s: ['hello', 'foo'], counter = strLength): [5, 3] {
  return s.map(counter)
}`)
        const fns = new Function(code + '\nreturn { mapStrings }')()
        const r = fns.mapStrings(['hello', 'world'], (_x) => false)

        expect(r).toEqual([false, false])
        expect(r.every((v) => v instanceof Error)).toBe(false)
      })
      it("propagates a referenced function's signature (cross-ref)", () => {
        const src = `function strLength(s: ''): 0 { return s.length }
function map(arr: [''], counter = strLength): [0] { return arr.map(counter) }`
        const r = tjs(src)
        const counterType = r.types?.map?.params?.counter?.type
        expect(counterType?.kind).toBe('function')
        expect(counterType?.params).toEqual([
          { name: 's', type: { kind: 'string' } },
        ])
        expect(counterType?.returns).toEqual({ kind: 'integer' })

        expect(r.code).toContain('__tjs.checkFnShape')
      })
    })
  })
  describe('error vs valid value distinction', () => {
    it('valid values pass through normally', () => {
      const tjsSource = `
function double(x: 0):! 0 {
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
function process(data: { error: false }):! { error: false } {
  return data
}
`
      const { code } = tjs(tjsSource)
      const process = new Function(code + '; return process')()

      const errorLikeObj = { error: true, message: 'not a real error' }
      const result = process(errorLikeObj)

      expect(result).toBe(errorLikeObj)

      const realError = new Error('real error')
      const errorResult = process(realError)
      expect(errorResult).toBe(realError)
    })
  })
  describe('unsafe functions skip validation entirely', () => {
    it('unsafe function skips all validation including error pass-through', () => {
      const tjsSource = `
function fastDouble(! x: 0):! 0 {
  return x * 2
}
`
      const { code } = tjs(tjsSource)
      const fastDouble = new Function(code + '; return fastDouble')()

      const result = fastDouble('5')
      expect(result).toBe(10)

      const err = new Error('test')
      const errResult = fastDouble(err)
      expect(errResult).toBeNaN()
    })
  })
  describe('source location tracking', () => {
    it('error includes source file and line (no debug mode)', () => {
      const tjsSource = `
function greet(name: ''):! '' {
  return 'Hello, ' + name
}
`
      const { code } = tjs(tjsSource)
      const greet = new Function(code + '; return greet')()
      const err = greet(42)
      expect(err).toBeInstanceOf(MonadicError)

      expect(err.path).toContain('greet.name')

      expect(err.stack).toBeDefined()
      expect(err.stack).toContain('MonadicError')
    })
    it('includes original TS file and line in error path (full pipeline)', () => {
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

      const { code: tjsCode } = fromTS(ts, {
        emitTJS: true,
        filename: 'src/processors/data.ts',
      })

      const { code: jsCode } = tjs(
        tjsCode.replace(/(\/\* tjs <- [^*]+ \*\/)/, '$1\nsafety inputs')
      )

      const fns = new Function(
        jsCode + '; return { validate, process, transform }'
      )()

      const validateErr = fns.validate(123)
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
      const tjsSource = `/* tjs <- lib/utils.ts */
safety inputs

/* line 15 */
function helper(x: 0):! 0 {
  return x + 1
}
`
      const { code } = tjs(tjsSource)

      expect(code).toContain('"source": "lib/utils.ts:15"')

      const helper = new Function(code + '; return helper')()
      const err = helper('wrong')
      expect(err.path).toBe('lib/utils.ts:15:helper.x')
    })
    it('captures TJS call stack with callStacks enabled', () => {
      const { configure } = require('./runtime')

      configure({ callStacks: true })
      try {
        const tjsSource = `/* tjs <- src/chain.ts */
safety inputs

/* line 10 */
function outer(x: 0):! 0 {
  return middle(x * 2)
}

/* line 20 */
function middle(x: 0):! 0 {
  return inner(x + 10)
}

/* line 30 */
function inner(x: ''):! '' {
  return x.toUpperCase()
}
`
        const { code } = tjs(tjsSource)
        const fns = new Function(code + '; return { outer, middle, inner }')()

        const err = fns.outer(5)
        expect(err).toBeInstanceOf(MonadicError)
        expect(err.path).toBe('src/chain.ts:30:inner.x')

        expect(err.callStack).toBeDefined()
        expect(err.callStack).toContain('src/chain.ts:10:outer')
        expect(err.callStack).toContain('src/chain.ts:20:middle')
        expect(err.callStack).toContain('src/chain.ts:30:inner')
      } finally {
        configure({ debug: false, callStacks: false })
      }
    })
    it('does not capture call stack when debug mode is off', () => {
      const { configure } = require('./runtime')

      configure({ debug: false })
      const tjsSource = `
function test(x: 0):! 0 {
  return x * 2
}
`
      const { code } = tjs(tjsSource)
      const test = new Function(code + '; return test')()
      const err = test('wrong')
      expect(err).toBeInstanceOf(MonadicError)

      expect(err.callStack).toBeUndefined()
    })
  })
  describe('stack management', () => {
    it('stack is empty after successful calls', () => {
      const { configure, resetRuntime } = require('./runtime')
      resetRuntime()
      configure({ debug: true })
      try {
        const { code } = tjs(`
function add(a: 0, b: 0):! 0 {
  return a + b
}
`)
        const add = new Function(code + '; return add')()
        add(1, 2)
        add(3, 4)
        add(5, 6)

        expect(globalThis.__tjs.getStack()).toEqual([])
      } finally {
        resetRuntime()
      }
    })
    it('stack is clean after error propagates back up', () => {
      const { configure, resetRuntime } = require('./runtime')
      resetRuntime()
      configure({ debug: true })
      try {
        const { code } = tjs(`/* tjs <- src/app.ts */
safety inputs
/* line 1 */
function outer(x: 0):! 0 {
  return inner(x)
}
/* line 5 */
function inner(x: ''):! '' {
  return x.toUpperCase()
}
`)
        const fns = new Function(code + '; return { outer, inner }')()
        const err = fns.outer(42)
        expect(err).toBeInstanceOf(MonadicError)

        expect(globalThis.__tjs.getStack()).toEqual([])
      } finally {
        resetRuntime()
      }
    })
    it('no stale entries after mixed success and error calls', () => {
      const { configure, resetRuntime } = require('./runtime')
      resetRuntime()
      configure({ debug: true })
      try {
        const { code } = tjs(`
function greet(name: ''):! '' {
  return 'Hello, ' + name
}
`)
        const greet = new Function(code + '; return greet')()

        greet('Alice')
        greet('Bob')

        const err = greet(42)
        expect(err).toBeInstanceOf(MonadicError)

        greet('Charlie')

        expect(globalThis.__tjs.getStack()).toEqual([])
      } finally {
        resetRuntime()
      }
    })
    it('call stack reflects chain when error occurs at depth', () => {
      const { configure, resetRuntime } = require('./runtime')
      resetRuntime()
      configure({ debug: true })
      try {
        const { code } = tjs(`/* tjs <- src/pipeline.ts */
safety inputs
/* line 1 */
function a(x: 0):! 0 { return b(x) }
/* line 3 */
function b(x: 0):! 0 { return c(x) }
/* line 5 */
function c(x: 0):! 0 { return d(x) }
/* line 7 */
function d(x: ''):! '' { return x.toUpperCase() }
`)
        const fns = new Function(code + '; return { a, b, c, d }')()
        const err = fns.a(99)
        expect(err).toBeInstanceOf(MonadicError)
        expect(err.path).toBe('src/pipeline.ts:7:d.x')

        expect(err.callStack).toEqual([
          'src/pipeline.ts:1:a',
          'src/pipeline.ts:3:b',
          'src/pipeline.ts:5:c',
          'src/pipeline.ts:7:d',
        ])
      } finally {
        resetRuntime()
      }
    })
  })
  describe('input-side error propagation', () => {
    it('error from inner function caught by outer input check', () => {
      const { code } = tjs(`
function step1(x: ''):! '' {
  return x.toUpperCase()
}

function step2(x: ''):! '' {
  return x + '!'
}
`)
      const fns = new Function(code + '; return { step1, step2 }')()

      const err = fns.step2(fns.step1(42))
      expect(err).toBeInstanceOf(MonadicError)

      expect(err.path).toContain('step1.x')
    })
    it('error identity preserved through chain', () => {
      const { code } = tjs(`
function a(x: ''):! '' { return x }
function b(x: ''):! '' { return x }
function c(x: ''):! '' { return x }
`)
      const fns = new Function(code + '; return { a, b, c }')()

      const originalError = fns.a(42)
      expect(originalError).toBeInstanceOf(MonadicError)
      const throughB = fns.b(originalError)
      const throughC = fns.c(throughB)

      expect(throughB).toBe(originalError)
      expect(throughC).toBe(originalError)
    })
    it('multi-level nested call propagation', () => {
      const { code } = tjs(`
function validate(x: ''):! '' { return x }
function transform(x: ''):! '' { return x.toUpperCase() }
function format(x: ''):! '' { return x + '!' }
`)
      const fns = new Function(
        code + '; return { validate, transform, format }'
      )()

      const result = fns.format(fns.transform(fns.validate(42)))
      expect(result).toBeInstanceOf(MonadicError)
      expect(result.path).toContain('validate.x')
    })
    it('error short-circuits function body', () => {
      const { code } = tjs(`
function process(x: ''):! '' {
  globalThis.__test_body_ran = true
  return x.toUpperCase()
}
`)
      globalThis.__test_body_ran = false
      const process = new Function(code + '; return process')()

      const inputError = new MonadicError(
        'upstream',
        'upstream.x',
        'string',
        'number'
      )
      const result = process(inputError)
      expect(result).toBe(inputError)
      expect(globalThis.__test_body_ran).toBe(false)
      delete globalThis.__test_body_ran
    })
  })
  describe('return type default keys', () => {
    it('signature test passes when optional key is absent', () => {
      const result = tjs(`
function divide(a: 10, b: 2): { value: 5, error = '' } {
  return { value: a / b }
}
`)
      const sigTests = result.testResults?.filter((t) => t.isSignatureTest)
      expect(sigTests?.length).toBe(1)
      expect(sigTests?.[0].passed).toBe(true)
    })
    it('signature test passes when optional key is present', () => {
      const result = tjs(`
function divide(a: 10, b: 0): { value: 0, error = 'Division by zero' } {
  if (b === 0) return { value: 0, error: 'Division by zero' }
  return { value: a / b }
}
`)
      const sigTests = result.testResults?.filter((t) => t.isSignatureTest)
      expect(sigTests?.length).toBe(1)
      expect(sigTests?.[0].passed).toBe(true)
    })
    it('works with non-string defaults', () => {
      const result = tjs(`
function lookup(key: 'x'): { value: 'found', count = 0 } {
  return { value: 'found' }
}
`)
      const sigTests = result.testResults?.filter((t) => t.isSignatureTest)
      expect(sigTests?.length).toBe(1)
      expect(sigTests?.[0].passed).toBe(true)
    })
    it('required keys still fail when absent', () => {
      expect(() =>
        tjs(`
function broken(x: 0): { value: 0, error = '' } {
  return { error: 'oops' }
}
`)
      ).toThrow(/Expected.*got/)
    })
    it('inline tests can check default keys', () => {
      const result = tjs(`
function divide(a: 10, b: 2): { value: 5, error = '' } {
  if (b === 0) return { value: NaN, error: 'Division by zero' }
  return { value: a / b }
}










`)
      const blockTests = result.testResults?.filter((t) => !t.isSignatureTest)
      expect(blockTests?.length).toBe(2)
      expect(blockTests?.every((t) => t.passed)).toBe(true)
    })
    it('type metadata parses return type with defaults', () => {
      const result = tjs(`
function divide(a: 10, b: 2): { value: 5, error = '' } {
  return { value: a / b }
}
`)
      const divideType = result.types?.divide
      expect(divideType).toBeDefined()
      expect(divideType?.returns?.kind).toBe('object')
      expect(divideType?.returns?.shape?.value?.kind).toBe('integer')
      expect(divideType?.returns?.shape?.error?.kind).toBe('string')
    })
    it('-? runtime validation passes when optional key is absent', () => {
      const result = tjs(`
function divide(a: 10, b: 2):? { value: 5, error = '' } {
  return { value: a / b }
}
`)

      const fn = new Function(result.code + '\nreturn divide')()

      const r = fn(10, 2)
      expect(r.value).toBe(5)
      expect(r).not.toBeInstanceOf(MonadicError)
    })
    it('-? with simple return type rejects wrong type at runtime', () => {
      const result = tjs(`
function greet(name: 'World'):? 'Hello, World' {
  return 'Hello, ' + name
}
`)
      const fn = new Function(result.code + '\nreturn greet')()
      const good = fn('Bob')
      expect(good).toBe('Hello, Bob')

      const bad = fn(42)
      expect(bad).toBeInstanceOf(MonadicError)
    })
    it('__tjs metadata includes return defaults', () => {
      const result = tjs(`
function divide(a: 10, b: 2):? { value: 5, error = '' } {
  return { value: a / b }
}
`)
      expect(result.code).toContain('"defaults"')
      expect(result.code).toContain('"error"')
    })
  })
  describe('union param JS output', () => {
    it('required union param has no default in JS', () => {
      const result = tjs('function f(x: false | undefined) { return x }')
      expect(result.code).toContain('function f(x)')
      expect(result.code).not.toMatch(/x = false/)
      expect(result.code).not.toMatch(/x = false \| undefined/)
    })
    it('optional union param keeps first value as default', () => {
      const result = tjs('function f(x = false | undefined) { return x }')
      expect(result.code).toContain('x = false')
      expect(result.code).not.toMatch(/x = false \| undefined/)
    })
    it('generates union type check for required union param', () => {
      const result = tjs('function f(x: false | undefined) { return x }')
      expect(result.code).toContain("typeof x !== 'boolean'")
      expect(result.code).toContain('x !== undefined')
    })
    it('generates nullable integer check for int|null', () => {
      const result = tjs('function f(x: 0 | null) { return x }')
      expect(result.code).toContain('function f(x)')

      expect(result.code).toContain("'integer'")

      expect(result.metadata?.f?.params?.x?.type?.nullable).toBe(true)
    })
    it('preserves | in function body (bitwise OR)', () => {
      const result = tjs('function f(x: 0) { return x | 0xFF }')
      expect(result.code).toContain('x | 0xFF')
    })
    it('preserves union metadata despite stripping from JS', () => {
      const result = tjs('function f(x: false | undefined) { return x }')
      const meta = result.metadata?.f
      expect(meta).toBeDefined()
      expect(meta.params.x.type.kind).toBe('union')
    })
  })
})

describe('TS overloads → TJS → JS full pipeline', () => {
  it('dispatches by arity at runtime', () => {
    const tsSource = `
      function greet(name: string): string;
      function greet(name: string, greeting: string): string;
      function greet(name: any, greeting?: any): string {
        return greeting ? greeting + ', ' + name : 'Hello, ' + name;
      }
    `
    const tjsResult = fromTS(tsSource, { emitTJS: true })
    const jsResult = tjs(tjsResult.code)
    const savedTjs = globalThis.__tjs
    const { createRuntime } = require('./runtime')
    try {
      globalThis.__tjs = createRuntime()
      const code = jsResult.code.replace(/^const __tjs =.*\n/m, '')
      const fn = new Function('__tjs', code + '; return greet')(
        globalThis.__tjs
      )
      expect(fn('World')).toBe('Hello, World')
      expect(fn('World', 'Hi')).toBe('Hi, World')
    } finally {
      globalThis.__tjs = savedTjs
    }
  })
  it('dispatches by type at same arity', () => {
    const tsSource = `
      function process(x: string): string;
      function process(x: number): number;
      function process(x: any): any {
        if (typeof x === 'string') return x.toUpperCase();
        return x * 2;
      }
    `
    const tjsResult = fromTS(tsSource, { emitTJS: true })
    const jsResult = tjs(tjsResult.code)
    const savedTjs = globalThis.__tjs
    const { createRuntime } = require('./runtime')
    try {
      globalThis.__tjs = createRuntime()
      const code = jsResult.code.replace(/^const __tjs =.*\n/m, '')
      const fn = new Function('__tjs', code + '; return process')(
        globalThis.__tjs
      )
      expect(fn('hello')).toBe('HELLO')
      expect(fn(42)).toBe(84)
    } finally {
      globalThis.__tjs = savedTjs
    }
  })
})

describe('rest parameter metadata', () => {
  it('should capture typed rest param in metadata', () => {
    const result = tjs(`function sum(...nums: [0]): 0 { return 0 }`, {
      runTests: false,
    })
    const info = result.types.sum
    expect(info.params.nums).toBeDefined()
    expect(info.params.nums.type.kind).toBe('array')
    expect(info.params.nums.type.items?.kind).toBe('integer')
    expect(info.params.nums.required).toBe(false)
  })
  it('should capture rest param with float array type', () => {
    const result = tjs(
      `function mean(...values: [1.0, 2.0]): 0.0 { return 0 }`,
      { runTests: false }
    )
    const info = result.types.mean
    expect(info.params.values).toBeDefined()
    expect(info.params.values.type.kind).toBe('array')
    expect(info.params.values.type.items?.kind).toBe('number')
  })
  it('should capture heterogeneous rest param as union', () => {
    const result = tjs(
      `function log(...args: ['hello', 42, true]): 0 { return 0 }`,
      { runTests: false }
    )
    const info = result.types.log
    expect(info.params.args.type.kind).toBe('array')
    expect(info.params.args.type.items?.kind).toBe('union')
    expect(info.params.args.type.items?.members).toHaveLength(3)
  })
  it('should capture untyped rest param as bare array', () => {
    const result = tjs(`function collect(...args) { return args }`, {
      runTests: false,
    })
    const info = result.types.collect
    expect(info.params.args).toBeDefined()
    expect(info.params.args.type.kind).toBe('array')
  })
  describe('no `var` (abolished as a mode 2026-08-02 — now unconditional)', () => {
    it('rejects var declarations without any directive', () => {
      expect(() => tjs('var x = 1')).toThrow(/`?var`? is not allowed/)
    })
    it('`unsafe var` is the deliberate exception', () => {
      expect(() => tjs('unsafe var x = 1')).not.toThrow()
    })
    it('allows const and let', () => {
      const result = tjs('const x = 1\nlet y = 2')
      expect(result.code).toContain('const x = 1')
      expect(result.code).toContain('let y = 2')
    })
    it('is included in TjsStrict', () => {
      expect(() => tjs('TjsStrict\nvar x = 1')).toThrow(
        /`?var`? is not allowed/
      )
    })
  })
  describe('const!', () => {
    it('emits as plain const', () => {
      const result = tjs('const! x = { a: 1 }')
      expect(result.code).toContain('const x = { a: 1 }')
      expect(result.code).not.toContain('const!')
    })
    it('rejects `const!` on a primitive as redundant', () => {
      expect(() => tjs('const! x = 42')).toThrow(/redundant/)
    })
    it('allows reads on immutable bindings', () => {
      const result = tjs('const! cfg = { port: 8080 }\nconsole.log(cfg.port)')
      expect(result.code).toContain('cfg.port')
    })
    it('rejects property assignment', () => {
      expect(() => tjs('const! cfg = { x: 1 }\ncfg.x = 2')).toThrow(
        "Cannot mutate immutable binding 'cfg'"
      )
    })
    it('rejects computed property assignment', () => {
      expect(() => tjs("const! cfg = { x: 1 }\ncfg['x'] = 2")).toThrow(
        "Cannot mutate immutable binding 'cfg'"
      )
    })
    it('rejects compound assignment', () => {
      expect(() => tjs('const! cfg = { x: 1 }\ncfg.x += 1')).toThrow(
        "Cannot mutate immutable binding 'cfg'"
      )
    })
    it('rejects increment/decrement', () => {
      expect(() => tjs('const! cfg = { x: 1 }\ncfg.x++')).toThrow(
        "Cannot mutate immutable binding 'cfg'"
      )
      expect(() => tjs('const! cfg = { x: 1 }\n++cfg.x')).toThrow(
        "Cannot mutate immutable binding 'cfg'"
      )
    })
    it('rejects delete', () => {
      expect(() => tjs('const! cfg = { x: 1 }\ndelete cfg.x')).toThrow(
        "Cannot mutate immutable binding 'cfg'"
      )
    })
    it('rejects mutating array methods', () => {
      expect(() => tjs('const! arr = [1, 2]\narr.push(3)')).toThrow(
        "Cannot call mutating method on immutable binding 'arr'"
      )
      expect(() => tjs('const! arr = [1, 2]\narr.splice(0, 1)')).toThrow(
        "Cannot call mutating method on immutable binding 'arr'"
      )
    })
    it('allows non-mutating methods', () => {
      const result = tjs(
        'const! arr = [1, 2, 3]\nconst mapped = arr.map(x => x * 2)'
      )
      expect(result.code).toContain('arr.map')
    })
    it('tracks multiple const! bindings independently', () => {
      const result = tjs(
        'const! frozen = { x: 1 }\nconst mutable = { y: 2 }\nmutable.y = 3'
      )
      expect(result.code).toContain('mutable.y = 3')

      expect(() =>
        tjs('const! frozen = { x: 1 }\nconst mutable = { y: 2 }\nfrozen.x = 3')
      ).toThrow("Cannot mutate immutable binding 'frozen'")
    })
  })
})

describe('a type annotation on a CLASS METHOD parameter is not a default', () => {
  const method = (src) =>
    tjs(src, { runTests: false })
      .code.split('\n')
      .find((l) => /\bm\(/.test(l)) ?? ''
  it('strips a union annotation, so the type name is never evaluated', () => {
    const out = method(
      'class C { m(v: 0, msg: string | undefined) { return msg } }'
    )
    expect(out).toContain('m(v,msg)')
    expect(out).not.toContain('string | undefined')
  })
  it('strips a bare type-name annotation (the case that already worked)', () => {
    expect(method('class C { m(msg: string) { return msg } }')).toContain(
      'm(msg)'
    )
  })
  it('keeps a GENUINE default, which is the same AST shape', () => {
    expect(
      method('class C { m(msg = false | undefined) { return msg } }')
    ).toContain('msg = false | undefined')
  })
  it('the method is callable with the argument omitted', () => {
    const prev = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      const C = new Function(
        tjs(
          'class C { m(v: 0, msg: string | undefined) { return msg ?? "none" } }',
          {
            runTests: false,
          }
        ).code + '\nreturn C'
      )()
      expect(new C().m(1)).toBe('none')
      expect(new C().m(1, 'hi')).toBe('hi')
    } finally {
      globalThis.__tjs = prev
    }
  })
})
