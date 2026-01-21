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

// Helper to get the first function's metadata from the Record
function getFirstFunc(metadata: Record<string, any>) {
  const keys = Object.keys(metadata)
  return keys.length > 0 ? metadata[keys[0]] : undefined
}

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
      expect(getFirstFunc(metadata).params.name.type.kind).toBe('string')
    })

    test('number parameter', () => {
      const { metadata } = transpileToJS(`
        function calc(x: 0) {
          return x * 2
        }
      `)
      expect(getFirstFunc(metadata).params.x.type.kind).toBe('number')
    })

    test('boolean parameter', () => {
      const { metadata } = transpileToJS(`
        function check(flag: true) {
          return !flag
        }
      `)
      expect(getFirstFunc(metadata).params.flag.type.kind).toBe('boolean')
    })

    test('null literal', () => {
      const { metadata } = transpileToJS(`
        function nullable(x: null) {
          return x
        }
      `)
      expect(getFirstFunc(metadata).params.x.type.kind).toBe('null')
    })
  })

  describe('Object types', () => {
    test('simple object shape', () => {
      const { metadata } = transpileToJS(`
        function process(user: { name: '', age: 0 }) {
          return user.name
        }
      `)
      expect(getFirstFunc(metadata).params.user.type.kind).toBe('object')
      expect(getFirstFunc(metadata).params.user.type.shape?.name.kind).toBe(
        'string'
      )
      expect(getFirstFunc(metadata).params.user.type.shape?.age.kind).toBe(
        'number'
      )
    })

    test('nested object shape', () => {
      const { metadata } = transpileToJS(`
        function deep(data: { user: { profile: { name: '' } } }) {
          return data.user.profile.name
        }
      `)
      expect(getFirstFunc(metadata).params.data.type.kind).toBe('object')
      expect(getFirstFunc(metadata).params.data.type.shape?.user.kind).toBe(
        'object'
      )
    })
  })

  describe('Array types', () => {
    test('simple array', () => {
      const { metadata } = transpileToJS(`
        function sum(nums: [0]) {
          return nums.reduce((a, b) => a + b, 0)
        }
      `)
      expect(getFirstFunc(metadata).params.nums.type.kind).toBe('array')
      expect(getFirstFunc(metadata).params.nums.type.items?.kind).toBe('number')
    })

    test('array of objects', () => {
      const { metadata } = transpileToJS(`
        function process(users: [{ name: '', age: 0 }]) {
          return users.map(u => u.name)
        }
      `)
      expect(getFirstFunc(metadata).params.users.type.kind).toBe('array')
      expect(getFirstFunc(metadata).params.users.type.items?.kind).toBe(
        'object'
      )
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
    expect(getFirstFunc(metadata).params.id.type.kind).toBe('union')
    expect(getFirstFunc(metadata).params.id.type.members?.length).toBe(2)
  })

  test('nullable with || null', () => {
    const { metadata } = transpileToJS(`
      function maybeString(s: '' || null) {
        return s ?? 'default'
      }
    `)
    expect(getFirstFunc(metadata).params.s.type.nullable).toBe(true)
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
      function find(id: 0) -! { name: '' } || null {
        return null
      }
    `)
    expect(getFirstFunc(metadata).returns?.kind).toBe('object')
    expect(getFirstFunc(metadata).returns?.nullable).toBe(true)
  })

  // TODO: Union return types like `{ obj } | null` not yet supported in parser
  test.skip('union return type with | (TS style)', () => {
    const { metadata } = transpileToJS(`
      function find(id: 0) -! { name: '' } | null {
        return null
      }
    `)
    expect(getFirstFunc(metadata).returns?.kind).toBe('object')
    expect(getFirstFunc(metadata).returns?.nullable).toBe(true)
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
    expect(getFirstFunc(metadata).params.name.required).toBe(false)
    expect(getFirstFunc(metadata).params.name.default).toBe('World')
  })

  test('required with colon, optional with equals', () => {
    const { metadata } = transpileToJS(`
      function paginate(items: [''], page = 1, limit = 10) {
        return items.slice((page - 1) * limit, page * limit)
      }
    `)
    expect(getFirstFunc(metadata).params.items.required).toBe(true)
    expect(getFirstFunc(metadata).params.page.required).toBe(false)
    expect(getFirstFunc(metadata).params.limit.required).toBe(false)
  })

  test('optional with ? syntax (TS style) in TJS', () => {
    const { metadata } = transpileToJS(`
      function greet(name?: '') {
        return 'Hello, ' + (name ?? 'World')
      }
    `)
    expect(getFirstFunc(metadata).params.name.required).toBe(false)
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
    expect(getFirstFunc(metadata).params.host.required).toBe(true)
    expect(getFirstFunc(metadata).params.port.required).toBe(false)
    expect(getFirstFunc(metadata).params.timeout.required).toBe(false)
  })
})

// =============================================================================
// RETURN TYPES
// =============================================================================

describe('Return Types', () => {
  test('simple return type', () => {
    // Use -! to skip signature test (testing metadata, not return value match)
    const { metadata } = transpileToJS(`
      function greet(name: '') -! '' {
        return 'Hello, ' + name
      }
    `)
    expect(getFirstFunc(metadata).returns?.kind).toBe('string')
  })

  test('object return type', () => {
    // Use -! to skip signature test (testing metadata, not return value match)
    const { metadata } = transpileToJS(`
      function makeUser(name: '') -! { name: '', id: 0 } {
        return { name, id: 1 }
      }
    `)
    expect(getFirstFunc(metadata).returns?.kind).toBe('object')
    expect(getFirstFunc(metadata).returns?.shape?.name.kind).toBe('string')
  })

  test('array return type', () => {
    const { metadata } = transpileToJS(`
      function toArray(item: '') -> [''] {
        return [item]
      }
    `)
    expect(getFirstFunc(metadata).returns?.kind).toBe('array')
    expect(getFirstFunc(metadata).returns?.items?.kind).toBe('string')
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
    expect(getFirstFunc(metadata).returns?.kind).toBe('array')
    expect(getFirstFunc(metadata).returns?.items?.kind).toBe('array')
    expect(getFirstFunc(metadata).returns?.items?.items?.kind).toBe('string')
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
  test('type alias resolves to object shape', () => {
    const { types } = fromTS(`
      type User = { name: string; age: number }

      function greet(user: User): string {
        return 'Hello, ' + user.name
      }
    `)
    expect(types?.greet.params.user.type.kind).toBe('object')
    expect(types?.greet.params.user.type.shape?.name.kind).toBe('string')
    expect(types?.greet.params.user.type.shape?.age.kind).toBe('number')
  })

  test('interface resolves to object shape', () => {
    const { types } = fromTS(`
      interface Config {
        host: string
        port: number
      }

      function connect(config: Config): void {
        console.log(config.host + ':' + config.port)
      }
    `)
    expect(types?.connect.params.config.type.kind).toBe('object')
    expect(types?.connect.params.config.type.shape?.host.kind).toBe('string')
    expect(types?.connect.params.config.type.shape?.port.kind).toBe('number')
  })

  test('interface extends merges base properties', () => {
    const { types } = fromTS(`
      interface Base { id: number }
      interface User extends Base { name: string }

      function process(user: User): number {
        return user.id
      }
    `)
    expect(types?.process.params.user.type.kind).toBe('object')
    // Should have both base and derived properties
    expect(types?.process.params.user.type.shape?.id.kind).toBe('number')
    expect(types?.process.params.user.type.shape?.name.kind).toBe('string')
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

  test('object destructuring with inline type', () => {
    const { types } = fromTS(`
      function greet({ name, age }: { name: string; age: number }): string {
        return 'Hello, ' + name
      }
    `)
    expect(types?.greet).toBeDefined()
    // The param name is the destructuring pattern text
    const paramKey = Object.keys(types!.greet.params)[0]
    expect(types?.greet.params[paramKey].type.kind).toBe('object')
    expect(types?.greet.params[paramKey].type.shape?.name.kind).toBe('string')
    expect(types?.greet.params[paramKey].type.shape?.age.kind).toBe('number')
  })

  test('array destructuring with type', () => {
    const { types } = fromTS(`
      function first([head, ...tail]: number[]): number {
        return head
      }
    `)
    expect(types?.first).toBeDefined()
    const paramKey = Object.keys(types!.first.params)[0]
    expect(types?.first.params[paramKey].type.kind).toBe('array')
    expect(types?.first.params[paramKey].type.items?.kind).toBe('number')
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
    expect(getFirstFunc(metadata).params.pair.type.kind).toBe('array')
  })

  test('tuple in fromTS', () => {
    const { types } = fromTS(`
      function swap(pair: [string, number]): [number, string] {
        return [pair[1], pair[0]]
      }
    `)
    expect(types?.swap.params.pair.type.kind).toBe('tuple')
    expect(types?.swap.params.pair.type.elements?.[0].kind).toBe('string')
    expect(types?.swap.params.pair.type.elements?.[1].kind).toBe('number')
    // Return type is also a tuple
    expect(types?.swap.returns?.kind).toBe('tuple')
    expect(types?.swap.returns?.elements?.[0].kind).toBe('number')
    expect(types?.swap.returns?.elements?.[1].kind).toBe('string')
  })

  test('named tuple', () => {
    const { types } = fromTS(`
      function process(point: [x: number, y: number]): number {
        return point[0] + point[1]
      }
    `)
    expect(types?.process.params.point.type.kind).toBe('tuple')
    expect(types?.process.params.point.type.elements?.length).toBe(2)
    expect(types?.process.params.point.type.elements?.[0].kind).toBe('number')
    expect(types?.process.params.point.type.elements?.[1].kind).toBe('number')
  })
})

// =============================================================================
// INTERSECTION TYPES
// =============================================================================

describe('Intersection Types', () => {
  // Note: TJS doesn't need native intersection syntax - just write the merged object directly
  // e.g., { x: 0, y: 0 } instead of { x: 0 } & { y: 0 }
  // Intersection is a TS artifact that TJS doesn't need to replicate

  test('intersection in fromTS flattens to object', () => {
    const { types } = fromTS(`
      function merge(obj: { x: number } & { y: number }): number {
        return obj.x + obj.y
      }
    `)
    // Intersection is flattened to object with merged properties
    expect(types?.merge.params.obj.type.kind).toBe('object')
    expect(types?.merge.params.obj.type.shape?.x.kind).toBe('number')
    expect(types?.merge.params.obj.type.shape?.y.kind).toBe('number')
  })
})

// =============================================================================
// CONDITIONAL TYPES
// =============================================================================

// Conditional types (T extends X ? Y : Z) are best-effort - they resolve to 'any'
// TJS predicate types are the preferred pattern for conditional validation

// =============================================================================
// MAPPED TYPES
// =============================================================================

describe('Mapped Types', () => {
  test('Partial<T> resolves inner type', () => {
    const { types } = fromTS(`
      function update(base: { a: number; b: string }, patch: Partial<{ a: number; b: string }>): { a: number; b: string } {
        return { ...base, ...patch }
      }
    `)
    expect(types?.update.params.patch.type.kind).toBe('object')
    expect(types?.update.params.patch.type.shape?.a.kind).toBe('number')
    expect(types?.update.params.patch.type.shape?.b.kind).toBe('string')
  })

  test('Record<K, V> becomes object with value type', () => {
    const { types } = fromTS(`
      function makeMap(keys: string[], value: number): Record<string, number> {
        const result: Record<string, number> = {}
        for (const key of keys) {
          result[key] = value
        }
        return result
      }
    `)
    expect(types?.makeMap.returns?.kind).toBe('object')
    // Record uses [key] as placeholder for dynamic keys
    expect(types?.makeMap.returns?.shape?.['[key]']?.kind).toBe('number')
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

// Function overloads: fromTS extracts the implementation signature only
// Overload declarations are TS compile-time hints, not runtime metadata

// =============================================================================
// CLASS SYNTAX (for completeness - we reject classes)
// =============================================================================

describe('Class Syntax', () => {
  test('transpile requires a function (classes handled elsewhere)', () => {
    // transpile() is for function-to-AST conversion
    // Classes are handled by preprocess() for wrapping and fromTS() for metadata
    const { transpile } = require('./index')
    expect(() =>
      transpile(`
      class Greeter {
        greet() {
          return 'Hello'
        }
      }
    `)
    ).toThrow(/function declaration/i)
  })

  // ✅ Class metadata extraction implemented in fromTS (extractClassMetadata)
  // See from-ts.test.ts for class metadata tests
  // Future: Component base class, Elements proxy (see PLAN.md Section 18)
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
    expect(getFirstFunc(metadata).params.mode.type.kind).toBe('string')
  })

  test('numeric literal', () => {
    const { metadata } = transpileToJS(`
      function setCount(n: 42) {
        return n
      }
    `)
    expect(getFirstFunc(metadata).params.n.type.kind).toBe('number')
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
  test('Pick<T, K> returns base type shape', () => {
    const { types } = fromTS(`
      function pick(obj: { a: number; b: string; c: boolean }): Pick<{ a: number; b: string; c: boolean }, 'a' | 'b'> {
        return { a: obj.a, b: obj.b }
      }
    `)
    // Pick returns the full base type (filtering is compile-time)
    expect(types?.pick.returns?.kind).toBe('object')
    expect(types?.pick.returns?.shape?.a.kind).toBe('number')
  })

  test('Omit<T, K> returns base type shape', () => {
    const { types } = fromTS(`
      function omit(obj: { a: number; b: string; c: boolean }): Omit<{ a: number; b: string; c: boolean }, 'c'> {
        const { c, ...rest } = obj
        return rest
      }
    `)
    // Omit returns the full base type (filtering is compile-time)
    expect(types?.omit.returns?.kind).toBe('object')
    expect(types?.omit.returns?.shape?.a.kind).toBe('number')
  })

  test('Required<T> returns base type shape', () => {
    const { types } = fromTS(`
      function require(obj: { a?: number; b?: string }): Required<{ a?: number; b?: string }> {
        return { a: obj.a ?? 0, b: obj.b ?? '' }
      }
    `)
    // Required returns the base type shape
    expect(types?.require.returns?.kind).toBe('object')
    expect(types?.require.returns?.shape?.a.kind).toBe('number')
    expect(types?.require.returns?.shape?.b.kind).toBe('string')
  })
})

// =============================================================================
// OUT OF SCOPE (for now)
// =============================================================================
// The following TS features are not yet supported:
// - namespace: Legacy pattern, use ES modules instead
// - module augmentation: Very advanced, niche use case
// - decorators: Complex, experimental (TC39 stage 3)
// Note: class syntax support is planned (Component base class, etc.)

// =============================================================================
// REAL-WORLD LIBRARY TESTS
// =============================================================================

describe('Real-World Patterns', () => {
  // Maximum effort: complex generic patterns like Zod schema builders
  // and lodash-style utilities work at best-effort level.
  // Generic type params become 'any', but the code transpiles correctly.

  test('generic utility function transpiles', () => {
    const { code, types } = fromTS(`
      function chunk<T>(array: T[], size: number): T[][] {
        const result: T[][] = []
        for (let i = 0; i < array.length; i += size) {
          result.push(array.slice(i, i + size))
        }
        return result
      }
    `)
    expect(code).toContain('function chunk')
    expect(types?.chunk).toBeDefined()
    // Generic T becomes any, but structure is preserved
    expect(types?.chunk.params.array.type.kind).toBe('array')
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
