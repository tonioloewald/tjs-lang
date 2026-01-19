/**
 * Comprehensive TypeScript Syntax Test Suite
 *
 * This test file systematically covers all TypeScript syntax features,
 * documenting what's supported vs. what needs implementation.
 *
 * Strategy:
 * - Use tjs() for TJS syntax (our shorthand)
 * - Use fromTS() for full TypeScript syntax
 * - Test both transpileToJS() for JS output and tjs() for AST output
 *
 * Goal: Eventually transpile Zod, lodash-es, and other complex libraries.
 */

import { describe, test, expect, it } from 'bun:test'
import { tjs, transpileToJS, fromTS } from './index'

// =============================================================================
// BASIC TYPES - These should all work
// =============================================================================

describe('Basic Types', () => {
  describe('Primitive types', () => {
    test('string parameter', () => {
      const { metadata } = transpileToJS(`
        function greet(name: '') {
          return name
        }
      `)
      expect(metadata.params.name.type.kind).toBe('string')
    })

    test('number parameter', () => {
      const { metadata } = transpileToJS(`
        function calc(x: 0) {
          return x * 2
        }
      `)
      expect(metadata.params.x.type.kind).toBe('number')
    })

    test('boolean parameter', () => {
      const { metadata } = transpileToJS(`
        function check(flag: true) {
          return !flag
        }
      `)
      expect(metadata.params.flag.type.kind).toBe('boolean')
    })

    test('null literal', () => {
      const { metadata } = transpileToJS(`
        function nullable(x: null) {
          return x
        }
      `)
      expect(metadata.params.x.type.kind).toBe('null')
    })
  })

  describe('Object types', () => {
    test('simple object shape', () => {
      const { metadata } = transpileToJS(`
        function process(user: { name: '', age: 0 }) {
          return user.name
        }
      `)
      expect(metadata.params.user.type.kind).toBe('object')
      expect(metadata.params.user.type.shape?.name.kind).toBe('string')
      expect(metadata.params.user.type.shape?.age.kind).toBe('number')
    })

    test('nested object shape', () => {
      const { metadata } = transpileToJS(`
        function deep(data: { user: { profile: { name: '' } } }) {
          return data.user.profile.name
        }
      `)
      expect(metadata.params.data.type.kind).toBe('object')
      expect(metadata.params.data.type.shape?.user.kind).toBe('object')
    })
  })

  describe('Array types', () => {
    test('simple array', () => {
      const { metadata } = transpileToJS(`
        function sum(nums: [0]) {
          return nums.reduce((a, b) => a + b, 0)
        }
      `)
      expect(metadata.params.nums.type.kind).toBe('array')
      expect(metadata.params.nums.type.items?.kind).toBe('number')
    })

    test('array of objects', () => {
      const { metadata } = transpileToJS(`
        function process(users: [{ name: '', age: 0 }]) {
          return users.map(u => u.name)
        }
      `)
      expect(metadata.params.users.type.kind).toBe('array')
      expect(metadata.params.users.type.items?.kind).toBe('object')
    })
  })
})

// =============================================================================
// UNION TYPES
// =============================================================================

describe('Union Types', () => {
  test('union with || (TJS style)', () => {
    const { metadata } = transpileToJS(`
      function flexible(id: '' || 0) {
        return String(id)
      }
    `)
    expect(metadata.params.id.type.kind).toBe('union')
    expect(metadata.params.id.type.members?.length).toBe(2)
  })

  test('nullable with || null', () => {
    const { metadata } = transpileToJS(`
      function maybeString(s: '' || null) {
        return s ?? 'default'
      }
    `)
    expect(metadata.params.s.type.nullable).toBe(true)
  })

  test('union with | (TS style) in fromTS', () => {
    const { types } = fromTS(`
      function flexible(id: string | number): string {
        return String(id)
      }
    `)
    expect(types?.flexible.params.id.type.kind).toBe('union')
  })

  test('union return type with || (TJS style)', () => {
    const { metadata } = transpileToJS(`
      function find(id: 0) -> { name: '' } || null {
        return null
      }
    `)
    expect(metadata.returns?.kind).toBe('object')
    expect(metadata.returns?.nullable).toBe(true)
  })

  test('union return type with | (TS style)', () => {
    const { metadata } = transpileToJS(`
      function find(id: 0) -> { name: '' } | null {
        return null
      }
    `)
    expect(metadata.returns?.kind).toBe('object')
    expect(metadata.returns?.nullable).toBe(true)
  })
})

// =============================================================================
// OPTIONAL PARAMETERS
// =============================================================================

describe('Optional Parameters', () => {
  test('optional with default value (= syntax)', () => {
    const { metadata } = transpileToJS(`
      function greet(name = 'World') {
        return 'Hello, ' + name
      }
    `)
    expect(metadata.params.name.required).toBe(false)
    expect(metadata.params.name.default).toBe('World')
  })

  test('required with colon, optional with equals', () => {
    const { metadata } = transpileToJS(`
      function paginate(items: [''], page = 1, limit = 10) {
        return items.slice((page - 1) * limit, page * limit)
      }
    `)
    expect(metadata.params.items.required).toBe(true)
    expect(metadata.params.page.required).toBe(false)
    expect(metadata.params.limit.required).toBe(false)
  })

  test('optional with ? syntax (TS style) in TJS', () => {
    const { metadata } = transpileToJS(`
      function greet(name?: '') {
        return 'Hello, ' + (name ?? 'World')
      }
    `)
    expect(metadata.params.name.required).toBe(false)
  })

  test('optional with ? syntax in fromTS', () => {
    const { types } = fromTS(`
      function greet(name?: string): string {
        return 'Hello, ' + (name ?? 'World')
      }
    `)
    expect(types?.greet.params.name.required).toBe(false)
  })

  test('mixed required and optional with ? syntax', () => {
    const { metadata } = transpileToJS(`
      function config(host: '', port?: 3000, timeout?: 5000) {
        return { host, port, timeout }
      }
    `)
    expect(metadata.params.host.required).toBe(true)
    expect(metadata.params.port.required).toBe(false)
    expect(metadata.params.timeout.required).toBe(false)
  })
})

// =============================================================================
// RETURN TYPES
// =============================================================================

describe('Return Types', () => {
  test('simple return type', () => {
    const { metadata } = transpileToJS(`
      function greet(name: '') -> '' {
        return 'Hello, ' + name
      }
    `)
    expect(metadata.returns?.kind).toBe('string')
  })

  test('object return type', () => {
    const { metadata } = transpileToJS(`
      function makeUser(name: '') -> { name: '', id: 0 } {
        return { name, id: 1 }
      }
    `)
    expect(metadata.returns?.kind).toBe('object')
    expect(metadata.returns?.shape?.name.kind).toBe('string')
  })

  test('array return type', () => {
    const { metadata } = transpileToJS(`
      function toArray(item: '') -> [''] {
        return [item]
      }
    `)
    expect(metadata.returns?.kind).toBe('array')
    expect(metadata.returns?.items?.kind).toBe('string')
  })

  test('nested array return ([[x]])', () => {
    const { metadata } = transpileToJS(`
      function chunk(items: [''], size: 1) -> [['']] {
        const result = []
        for (let i = 0; i < items.length; i += size) {
          result.push(items.slice(i, i + size))
        }
        return result
      }
    `)
    expect(metadata.returns?.kind).toBe('array')
    expect(metadata.returns?.items?.kind).toBe('array')
    expect(metadata.returns?.items?.items?.kind).toBe('string')
  })
})

// =============================================================================
// ARROW FUNCTIONS
// =============================================================================

describe('Arrow Functions', () => {
  test('arrow function with TJS types', () => {
    // Arrow functions now support TJS type syntax
    const { code } = transpileToJS(`
      function process(items: ['']) {
        return items.map((x: '') => x.toUpperCase())
      }
    `)
    // The arrow param should be transformed
    expect(code).toContain('(x = ')
    expect(code).toContain(') =>')
  })

  test('arrow function in callback with object type', () => {
    const { code } = transpileToJS(`
      function filter(items: [{ id: 0 }]) {
        return items.filter((item: { id: 0 }) => item.id > 0)
      }
    `)
    expect(code).toContain('(item = ')
  })

  test('arrow functions work in fromTS', () => {
    const { code, types } = fromTS(`
      const add = (a: number, b: number): number => a + b
    `)
    expect(types?.add).toBeDefined()
    expect(types?.add.params.a.type.kind).toBe('number')
  })

  test('arrow function expression body in fromTS', () => {
    const { types } = fromTS(`
      const double = (x: number): number => x * 2
    `)
    expect(types?.double.returns?.kind).toBe('number')
  })

  test('chained arrow functions', () => {
    const { code } = transpileToJS(`
      function transform(nums: [0]) {
        return nums.map((x: 0) => x * 2).filter((y: 0) => y > 5)
      }
    `)
    expect(code).toContain('(x = 0)')
    expect(code).toContain('(y = 0)')
  })
})

// =============================================================================
// GENERICS
// =============================================================================

describe('Generics', () => {
  test('simple generic <T>', () => {
    const { types } = fromTS(`
      function identity<T>(value: T): T {
        return value
      }
    `)
    expect(types?.identity.typeParams?.T).toBeDefined()
  })

  test('generic with constraint <T extends X>', () => {
    const { types } = fromTS(`
      function first<T extends { id: number }>(items: T[]): T | undefined {
        return items[0]
      }
    `)
    expect(types?.first.typeParams?.T.constraint).toBeDefined()
  })

  test('generic with default <T = X>', () => {
    const { types } = fromTS(`
      function wrap<T = string>(value: T): { value: T } {
        return { value }
      }
    `)
    expect(types?.wrap.typeParams?.T.default).toBeDefined()
  })

  test('multiple type parameters', () => {
    const { types } = fromTS(`
      function map<T, U>(items: T[], fn: (item: T) => U): U[] {
        return items.map(fn)
      }
    `)
    expect(types?.map.typeParams?.T).toBeDefined()
    expect(types?.map.typeParams?.U).toBeDefined()
  })
})

// =============================================================================
// TYPE ALIASES AND INTERFACES
// =============================================================================

describe('Type Aliases and Interfaces', () => {
  test.todo('type alias - NOT YET SUPPORTED', () => {
    const { code } = fromTS(`
      type User = { name: string; age: number }

      function greet(user: User): string {
        return 'Hello, ' + user.name
      }
    `)
    expect(code).toContain('function greet')
  })

  test.todo('interface - NOT YET SUPPORTED', () => {
    const { code } = fromTS(`
      interface Config {
        host: string
        port: number
      }

      function connect(config: Config): void {
        console.log(config.host + ':' + config.port)
      }
    `)
    expect(code).toContain('function connect')
  })

  test.todo('interface extends - NOT YET SUPPORTED', () => {
    const { code } = fromTS(`
      interface Base { id: number }
      interface User extends Base { name: string }

      function process(user: User): number {
        return user.id
      }
    `)
    expect(code).toContain('function process')
  })
})

// =============================================================================
// REST PARAMETERS
// =============================================================================

describe('Rest Parameters', () => {
  test('rest params (...args)', () => {
    const { types } = fromTS(`
      function sum(...nums: number[]): number {
        return nums.reduce((a, b) => a + b, 0)
      }
    `)
    expect(types?.sum.params.nums.type.kind).toBe('array')
  })

  test('rest params with other params', () => {
    const { types } = fromTS(`
      function log(prefix: string, ...messages: string[]): void {
        console.log(prefix, ...messages)
      }
    `)
    expect(types?.log.params.prefix.required).toBe(true)
  })
})

// =============================================================================
// DESTRUCTURED PARAMETERS
// =============================================================================

describe('Destructured Parameters', () => {
  test('object destructuring without types (TJS)', () => {
    const { code } = transpileToJS(`
      function greet({ name, age }) {
        return 'Hello, ' + name
      }
    `)
    expect(code).toContain('function greet')
  })

  test.todo('object destructuring with inline type - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      function greet({ name, age }: { name: string; age: number }): string {
        return 'Hello, ' + name
      }
    `)
    expect(types?.greet).toBeDefined()
  })

  test.todo('array destructuring with type - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      function first([head, ...tail]: number[]): number {
        return head
      }
    `)
    expect(types?.first).toBeDefined()
  })
})

// =============================================================================
// TUPLE TYPES
// =============================================================================

describe('Tuple Types', () => {
  test('tuple in TJS (currently parsed as array)', () => {
    const { metadata } = transpileToJS(`
      function swap(pair: ['', 0]) {
        return [pair[1], pair[0]]
      }
    `)
    // Currently tuples are parsed as arrays - could distinguish later
    expect(metadata.params.pair.type.kind).toBe('array')
  })

  test.todo('tuple in fromTS - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      function swap(pair: [string, number]): [number, string] {
        return [pair[1], pair[0]]
      }
    `)
    expect(types?.swap.params.pair.type.kind).toBe('array')
  })

  test.todo('named tuple - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      function process(point: [x: number, y: number]): number {
        return point[0] + point[1]
      }
    `)
    expect(types?.process).toBeDefined()
  })
})

// =============================================================================
// INTERSECTION TYPES
// =============================================================================

describe('Intersection Types', () => {
  test.todo('intersection with & in TJS - NOT YET SUPPORTED', () => {
    // Intersection types need parser support
    const { metadata } = transpileToJS(`
      function merge(a: { x: 0 } & { y: 0 }) {
        return a.x + a.y
      }
    `)
    expect(metadata.params.a.type.kind).toBe('object')
  })

  test('intersection in fromTS', () => {
    const { types } = fromTS(`
      function merge(obj: { x: number } & { y: number }): number {
        return obj.x + obj.y
      }
    `)
    // Intersection should be flattened to object
    expect(types?.merge.params.obj.type.kind).toBe('any') // may need improvement
  })
})

// =============================================================================
// CONDITIONAL TYPES
// =============================================================================

describe('Conditional Types', () => {
  test.todo('simple conditional type - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      type IsString<T> = T extends string ? true : false

      function check<T>(value: T): IsString<T> {
        return (typeof value === 'string') as any
      }
    `)
    expect(types?.check).toBeDefined()
  })
})

// =============================================================================
// MAPPED TYPES
// =============================================================================

describe('Mapped Types', () => {
  test.todo('Partial<T> usage - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      function update(base: { a: number; b: string }, patch: Partial<{ a: number; b: string }>): { a: number; b: string } {
        return { ...base, ...patch }
      }
    `)
    expect(types?.update).toBeDefined()
  })

  test.todo('Record<K, V> usage - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      function makeMap(keys: string[], value: number): Record<string, number> {
        const result: Record<string, number> = {}
        for (const key of keys) {
          result[key] = value
        }
        return result
      }
    `)
    expect(types?.makeMap).toBeDefined()
  })
})

// =============================================================================
// ASYNC/AWAIT
// =============================================================================

describe('Async Functions', () => {
  test('async function in TJS', () => {
    const { code } = transpileToJS(`
      async function fetchData(url: '') {
        const response = await fetch(url)
        return response
      }
    `)
    expect(code).toContain('async function')
  })

  test('async in fromTS', () => {
    const { code, types } = fromTS(`
      async function fetchData(url: string): Promise<Response> {
        const response = await fetch(url)
        return response
      }
    `)
    expect(code).toContain('async function')
    // Promise should be unwrapped
    expect(types?.fetchData.returns?.kind).toBe('any') // Response becomes any
  })
})

// =============================================================================
// FUNCTION OVERLOADS
// =============================================================================

describe('Function Overloads', () => {
  test.todo('function overloads - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      function process(input: string): string
      function process(input: number): number
      function process(input: string | number): string | number {
        return typeof input === 'string' ? input.toUpperCase() : input * 2
      }
    `)
    expect(types?.process).toBeDefined()
  })
})

// =============================================================================
// CLASS SYNTAX (for completeness - we reject classes)
// =============================================================================

describe('Class Syntax', () => {
  test('classes are rejected in transpile', () => {
    // tjs() returns "No function found" but transpile() gives better error
    const { transpile } = require('./index')
    expect(() =>
      transpile(`
      class Greeter {
        greet() {
          return 'Hello'
        }
      }
    `)
    ).toThrow(/class/i)
  })

  test.todo('class methods should be extractable via fromTS', () => {
    // We might want to extract static methods or convert class to functions
    const { types } = fromTS(`
      class Calculator {
        static add(a: number, b: number): number {
          return a + b
        }
      }
    `)
    expect(types).toBeDefined()
  })
})

// =============================================================================
// ENUMS
// =============================================================================

describe('Enums', () => {
  test('numeric enum emits TJS Enum', () => {
    const { code } = fromTS(
      `
      enum Status { Pending, Active, Done }
    `,
      { emitTJS: true }
    )
    expect(code).toContain("Enum Status 'Status'")
    expect(code).toContain('Pending')
    expect(code).toContain('Active')
    expect(code).toContain('Done')
  })

  test('string enum emits TJS Enum with values', () => {
    const { code } = fromTS(
      `
      enum Color { Red = 'red', Green = 'green', Blue = 'blue' }
    `,
      { emitTJS: true }
    )
    expect(code).toContain("Enum Color 'Color'")
    expect(code).toContain("Red = 'red'")
    expect(code).toContain("Green = 'green'")
    expect(code).toContain("Blue = 'blue'")
  })
})

// =============================================================================
// TYPE ASSERTIONS
// =============================================================================

describe('Type Assertions', () => {
  test('as syntax strips assertion', () => {
    const { code } = fromTS(`
      function cast(value: unknown): string {
        return value as string
      }
    `)
    expect(code).toContain('value')
    expect(code).not.toContain('as string')
  })

  test('angle bracket syntax strips assertion', () => {
    const { code } = fromTS(`
      function cast(value: unknown): string {
        return <string>value
      }
    `)
    expect(code).toContain('value')
    expect(code).not.toContain('<string>')
  })
})

// =============================================================================
// LITERAL TYPES
// =============================================================================

describe('Literal Types', () => {
  test('string literal in TJS', () => {
    const { metadata } = transpileToJS(`
      function setMode(mode: 'fast') {
        return mode
      }
    `)
    expect(metadata.params.mode.type.kind).toBe('string')
  })

  test('numeric literal', () => {
    const { metadata } = transpileToJS(`
      function setCount(n: 42) {
        return n
      }
    `)
    expect(metadata.params.n.type.kind).toBe('number')
  })

  test('literal union type alias emits TJS Union', () => {
    const { code } = fromTS(
      `
      type Direction = 'up' | 'down' | 'left' | 'right'
    `,
      { emitTJS: true }
    )
    expect(code).toContain("Union Direction 'Direction'")
    expect(code).toContain("'up'")
    expect(code).toContain("'down'")
    expect(code).toContain("'left'")
    expect(code).toContain("'right'")
  })

  test('literal union in function parameter', () => {
    const { types } = fromTS(`
      function setDirection(dir: 'up' | 'down' | 'left' | 'right'): void {
        console.log(dir)
      }
    `)
    expect(types?.setDirection.params.dir.type.kind).toBe('union')
  })
})

// =============================================================================
// READONLY AND CONST
// =============================================================================

describe('Readonly Modifiers', () => {
  test('readonly property is stripped but shape preserved', () => {
    const { types } = fromTS(`
      function process(obj: { readonly id: number }): number {
        return obj.id
      }
    `)
    expect(types?.process).toBeDefined()
    expect(types?.process.params.obj.type.shape?.id.kind).toBe('number')
  })

  test('as const is stripped', () => {
    const { code } = fromTS(`
      function getConfig() {
        return { host: 'localhost', port: 3000 } as const
      }
    `)
    expect(code).toContain('localhost')
    expect(code).not.toContain('as const')
  })
})

// =============================================================================
// UTILITY TYPES
// =============================================================================

describe('Utility Types', () => {
  test.todo('Pick<T, K> - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      function pick(obj: { a: number; b: string; c: boolean }): Pick<{ a: number; b: string; c: boolean }, 'a' | 'b'> {
        return { a: obj.a, b: obj.b }
      }
    `)
    expect(types?.pick).toBeDefined()
  })

  test.todo('Omit<T, K> - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      function omit(obj: { a: number; b: string; c: boolean }): Omit<{ a: number; b: string; c: boolean }, 'c'> {
        const { c, ...rest } = obj
        return rest
      }
    `)
    expect(types?.omit).toBeDefined()
  })

  test.todo('Required<T> - NOT YET SUPPORTED', () => {
    const { types } = fromTS(`
      function require(obj: { a?: number; b?: string }): Required<{ a?: number; b?: string }> {
        return { a: obj.a ?? 0, b: obj.b ?? '' }
      }
    `)
    expect(types?.require).toBeDefined()
  })
})

// =============================================================================
// NAMESPACE AND MODULE SYNTAX
// =============================================================================

describe('Namespace and Module', () => {
  test.todo('namespace - NOT YET SUPPORTED', () => {
    const { code } = fromTS(`
      namespace Utils {
        export function greet(name: string): string {
          return 'Hello, ' + name
        }
      }
    `)
    expect(code).toBeDefined()
  })

  test.todo('module augmentation - NOT YET SUPPORTED', () => {
    // This is advanced and probably low priority
  })
})

// =============================================================================
// DECORATORS (experimental)
// =============================================================================

describe('Decorators', () => {
  test.todo('class decorator - NOT YET SUPPORTED (and probably never)', () => {
    // Decorators are very complex and likely out of scope
  })
})

// =============================================================================
// JSX TYPES
// =============================================================================

describe('JSX Types', () => {
  test.todo('JSX element - NOT YET SUPPORTED', () => {
    // JSX support would require significant work
  })
})

// =============================================================================
// REAL-WORLD LIBRARY TESTS
// =============================================================================

describe('Real-World Patterns', () => {
  test.todo('Zod-style schema builder', () => {
    // This is the holy grail - being able to transpile Zod
    const { code } = fromTS(`
      function createSchema<T>(): {
        string: () => { parse: (input: unknown) => string }
        number: () => { parse: (input: unknown) => number }
      } {
        return {
          string: () => ({ parse: (input: unknown) => String(input) }),
          number: () => ({ parse: (input: unknown) => Number(input) }),
        }
      }
    `)
    expect(code).toBeDefined()
  })

  test.todo('lodash-style utility functions', () => {
    const { code } = fromTS(`
      function chunk<T>(array: T[], size: number): T[][] {
        const result: T[][] = []
        for (let i = 0; i < array.length; i += size) {
          result.push(array.slice(i, i + size))
        }
        return result
      }

      function groupBy<T, K extends string | number>(
        array: T[],
        keyFn: (item: T) => K
      ): Record<K, T[]> {
        const result = {} as Record<K, T[]>
        for (const item of array) {
          const key = keyFn(item)
          if (!result[key]) result[key] = []
          result[key].push(item)
        }
        return result
      }
    `)
    expect(code).toBeDefined()
  })
})

// =============================================================================
// SUMMARY: Features to implement (in priority order)
// =============================================================================
/*
HIGH PRIORITY (breaks common patterns):
1. Arrow functions with types (const x = (a: T) => ...)
2. Union return types (-> T | null)
3. Optional params with ? (x?: T)
4. Nested array returns ([['']])

MEDIUM PRIORITY (needed for library support):
5. Generics (<T>, <T extends X>, <T = X>)
6. Type aliases (type Foo = ...)
7. Interfaces (interface Foo { ... })
8. Rest params (...args: T[])
9. Destructured params with types ({ x, y }: Point)

LOW PRIORITY (advanced patterns):
10. Conditional types
11. Mapped types (Partial, Required, Pick, Omit)
12. Function overloads
13. Enums
14. Type assertions (as T, <T>)
15. Readonly modifiers
16. Namespaces

OUT OF SCOPE (probably):
- Classes (by design)
- Decorators
- JSX
- Module augmentation
*/
