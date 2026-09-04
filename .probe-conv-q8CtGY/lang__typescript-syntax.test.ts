function FunctionPredicate(n, s, b) {
  if (Array.isArray(s) && b) {
    const f = (...a) => FunctionPredicate(n, b(...a))
    f.typeParamNames = s.map((p) => (Array.isArray(p) ? p[0] : p))
    f.description = n
    f.__runtimeType = true
    return f
  }
  const spec = typeof s === 'function' ? {} : s || {}
  return {
    description: n,
    params: spec.params || {},
    returns: spec.returns,
    returnContract: spec.returnContract || 'assertReturns',
    check: (v) => typeof v === 'function',
    __runtimeType: true,
  }
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? { FunctionPredicate }
/* tjs <- input.ts */

import { describe, test, expect } from 'bun:test'

import { transpileToJS, tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { fromTS as fromTSToTJS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'

/* line 28 */
function fromTS(source, options = {}) {
  const t = fromTSToTJS(source, options)
  if (options.emitTJS) return t
  return { ...t, code: tjs(t.code, { runTests: false }).code }
}
fromTS.__tjs = {
  params: {
    source: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    options: {
      type: {
        kind: 'object',
        shape: {},
      },
      required: false,
      default: {},
    },
  },
  unsafe: true,
  source: 'input.ts:28',
}

/* line 35 */
function getFirstFunc(metadata) {
  const keys = Object.keys(metadata)
  return keys.length > 0 ? metadata[keys[0]] : undefined
}
getFirstFunc.__tjs = {
  params: {
    metadata: {
      type: {
        kind: 'object',
        shape: {},
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:35',
}

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
      expect(getFirstFunc(metadata).params.x.type.kind).toBe('integer')
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
        'integer'
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
      expect(getFirstFunc(metadata).params.nums.type.items?.kind).toBe(
        'integer'
      )
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

describe('Union Types', () => {
  test('union with | (string or integer)', () => {
    const { metadata } = transpileToJS(`
      function flexible(id: '' | 0) {
        return String(id)
      }
    `)
    expect(getFirstFunc(metadata).params.id.type.kind).toBe('union')
    expect(getFirstFunc(metadata).params.id.type.members?.length).toBe(2)
  })
  test('nullable with | null', () => {
    const { metadata } = transpileToJS(`
      function maybeString(s: '' | null) {
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
  test('union return type with | (nullable object)', () => {
    const { metadata } = transpileToJS(`
      function find(id: 0):! { name: '' } | null {
        return null
      }
    `)
    expect(getFirstFunc(metadata).returns?.kind).toBe('object')
    expect(getFirstFunc(metadata).returns?.nullable).toBe(true)
  })
})

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

describe('Return Types', () => {
  test('simple return type', () => {
    const { metadata } = transpileToJS(`
      function greet(name: ''):! '' {
        return 'Hello, ' + name
      }
    `)
    expect(getFirstFunc(metadata).returns?.kind).toBe('string')
  })
  test('object return type', () => {
    const { metadata } = transpileToJS(`
      function makeUser(name: ''):! { name: '', id: 0 } {
        return { name, id: 1 }
      }
    `)
    expect(getFirstFunc(metadata).returns?.kind).toBe('object')
    expect(getFirstFunc(metadata).returns?.shape?.name.kind).toBe('string')
  })
  test('array return type', () => {
    const { metadata } = transpileToJS(`
      function toArray(item: ''): [''] {
        return [item]
      }
    `)
    expect(getFirstFunc(metadata).returns?.kind).toBe('array')
    expect(getFirstFunc(metadata).returns?.items?.kind).toBe('string')
  })
  test('nested array return ([[x]])', () => {
    const { metadata } = transpileToJS(`
      function chunk(items: [''], size: 1): [['']] {
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

describe('Arrow Functions', () => {
  test('arrow function with TJS types', () => {
    const { code } = transpileToJS(`
      function process(items: ['']) {
        return items.map((x: '') => x.toUpperCase())
      }
    `)

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
    const { types } = fromTS(`
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

    expect(types?.process.params.user.type.shape?.id.kind).toBe('number')
    expect(types?.process.params.user.type.shape?.name.kind).toBe('string')
  })
})

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

    const paramKey = Object.keys(types.greet.params)[0]
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
    const paramKey = Object.keys(types.first.params)[0]
    expect(types?.first.params[paramKey].type.kind).toBe('array')
    expect(types?.first.params[paramKey].type.items?.kind).toBe('number')
  })
})

describe('Tuple Types', () => {
  test('tuple in TJS (currently parsed as array)', () => {
    const { metadata } = transpileToJS(`
      function swap(pair: ['', 0]) {
        return [pair[1], pair[0]]
      }
    `)

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

describe('Intersection Types', () => {
  test('intersection in fromTS flattens to object', () => {
    const { types } = fromTS(`
      function merge(obj: { x: number } & { y: number }): number {
        return obj.x + obj.y
      }
    `)

    expect(types?.merge.params.obj.type.kind).toBe('object')
    expect(types?.merge.params.obj.type.shape?.x.kind).toBe('number')
    expect(types?.merge.params.obj.type.shape?.y.kind).toBe('number')
  })
})

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

    expect(types?.makeMap.returns?.shape?.['[key]']?.kind).toBe('number')
  })
})

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

    expect(types?.fetchData.returns?.kind).toBe('any')
  })
})

describe('Class Syntax', () => {
  test('transpile requires a function (classes handled elsewhere)', () => {
    const { transpile } = require('./index')
    expect(() =>
      transpile(`
      TjsCompat
      class Greeter {
        greet() {
          return 'Hello'
        }
      }
    `)
    ).toThrow(/classes are not supported/i)
  })
})

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
    expect(getFirstFunc(metadata).params.n.type.kind).toBe('integer')
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

describe('Utility Types', () => {
  test('Pick<T, K> returns base type shape', () => {
    const { types } = fromTS(`
      function pick(obj: { a: number; b: string; c: boolean }): Pick<{ a: number; b: string; c: boolean }, 'a' | 'b'> {
        return { a: obj.a, b: obj.b }
      }
    `)

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

    expect(types?.omit.returns?.kind).toBe('object')
    expect(types?.omit.returns?.shape?.a.kind).toBe('number')
  })
  test('Required<T> returns base type shape', () => {
    const { types } = fromTS(`
      function require(obj: { a?: number; b?: string }): Required<{ a?: number; b?: string }> {
        return { a: obj.a ?? 0, b: obj.b ?? '' }
      }
    `)

    expect(types?.require.returns?.kind).toBe('object')
    expect(types?.require.returns?.shape?.a.kind).toBe('number')
    expect(types?.require.returns?.shape?.b.kind).toBe('string')
  })
})

describe('Real-World Patterns', () => {
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

    expect(types?.chunk.params.array.type.kind).toBe('array')
  })
  test('?: boolean stays optional, and invents no JS default', () => {
    const tjsCode = fromTS('function f(excited?: boolean) { return excited }', {
      emitTJS: true,
    }).code

    expect(tjsCode).toContain('excited: boolean | undefined')

    const jsResult = tjs('safety inputs\n' + tjsCode)

    expect(jsResult.code).not.toMatch(/excited = false/)
    expect(jsResult.code).not.toMatch(/excited = false \| undefined/)

    expect(jsResult.code).toContain("typeof excited !== 'boolean'")
  })
})

describe('fromTS generators', () => {
  test('preserves * on sync generator function', () => {
    const result = fromTS('function* gen(): Generator<number> { yield 1 }', {
      emitTJS: true,
    })
    expect(result.code).toContain('function* gen(')
  })
  test('preserves async function*', () => {
    const result = fromTS(
      'async function* gen(): AsyncGenerator<string> { yield "a" }',
      { emitTJS: true }
    )
    expect(result.code).toContain('async function* gen(')
  })
  test('preserves * on class generator method', () => {
    const result = fromTS(
      `class Foo {
        *items(): Generator<number> { yield 1 }
      }`,
      { emitTJS: true }
    )
    expect(result.code).toContain('*items(')
  })
  test('unwraps Generator<T> return type to T', () => {
    const result = fromTS('function* nums(): Generator<number> { yield 1 }', {
      emitTJS: true,
    })

    expect(result.code).toContain(':!')
    expect(result.code).toContain('0.0')
  })
  test('unwraps AsyncGenerator<T> return type to T', () => {
    const result = fromTS(
      "async function* words(): AsyncGenerator<string> { yield 'hi' }",
      { emitTJS: true }
    )
    expect(result.code).toContain(':!')
    expect(result.code).toMatch(/''/)
  })
  test('captures generator metadata in JS mode', () => {
    const result = fromTS('function* count(): Generator<number> { yield 1 }')
    expect(result.types?.count).toBeDefined()
    expect(result.types?.count?.returns?.kind).toBe('number')
  })
})

describe('fromTS function overloads', () => {
  test('overload signatures become polymorphic TJS functions', () => {
    const result = fromTS(
      `
      function greet(name: string): string;
      function greet(name: string, greeting: string): string;
      function greet(name: any, greeting?: any): string {
        return greeting ? greeting + ', ' + name : 'Hello, ' + name;
      }
      `,
      { emitTJS: true }
    )

    expect(result.code).not.toContain('_greet_impl')

    expect(result.code.match(/function greet\b/g)?.length).toBe(1)
    expect(result.code).toContain('TypeScript overload signatures')
  })
  test('different-type overloads at same arity', () => {
    const result = fromTS(
      `
      function process(x: string): string;
      function process(x: number): number;
      function process(x: any): any { return x; }
      `,
      { emitTJS: true }
    )

    expect(result.code.match(/function process\b/g)?.length).toBe(1)
    expect(result.code).not.toContain('_process_impl')
  })
  test('suggests the upgrade it cannot safely perform', () => {
    const result = fromTS(
      `
      function pick(x: string): string;
      function pick(x: number): number;
      function pick(x: any): any { if (typeof x === 'string') return x; return x + 1 }
      `,
      { emitTJS: true }
    )
    expect(result.code).toContain('TJS can dispatch')
    expect(result.code).toContain('judgement about intent')
    expect((result.warnings ?? []).join('\n')).toContain('overload')
  })
  test('overload metadata captured in JS mode', () => {
    const result = fromTS(`
      function foo(x: string): string;
      function foo(x: number): number;
      function foo(x: any): any { return x; }
    `)
    expect(result.types?.foo).toBeDefined()
    expect(result.types?.foo?.overloads).toBeDefined()
    expect(result.types?.foo?.overloads?.length).toBe(2)
    expect(result.types?.foo?.overloads?.[0]?.params?.x?.type?.kind).toBe(
      'string'
    )
    expect(result.types?.foo?.overloads?.[1]?.params?.x?.type?.kind).toBe(
      'number'
    )
  })
  test('non-overloaded functions are unaffected', () => {
    const result = fromTS(
      'function add(a: number, b: number): number { return a + b }',
      { emitTJS: true }
    )

    expect(result.code).not.toContain('_add_impl')
    expect(result.code).toContain('function add(')
  })
})

describe('fromTS interface merging', () => {
  test('two interfaces with same name merge members', () => {
    const result = fromTS(
      `
      interface Config {
        host: string;
        port: number;
      }
      interface Config {
        debug: boolean;
      }
      `,
      { emitTJS: true }
    )

    expect(result.code).toContain('host')
    expect(result.code).toContain('port')
    expect(result.code).toContain('debug')

    const typeCount = (result.code.match(/^Type Config/gm) || []).length
    expect(typeCount).toBe(1)
  })
  test('merged interface resolves correctly in function params', () => {
    const result = fromTS(`
      interface User { name: string; }
      interface User { age: number; }
      function greet(user: User): string {
        return user.name;
      }
    `)
    const paramType = result.types?.greet?.params?.user?.type
    expect(paramType?.kind).toBe('object')
    expect(paramType?.shape?.name?.kind).toBe('string')
    expect(paramType?.shape?.age?.kind).toBe('number')
  })
  test('later properties with same name override earlier ones', () => {
    const result = fromTS(`
      interface Data { value: string; }
      interface Data { value: number; extra: boolean; }
      function fn(d: Data): void {}
    `)
    const shape = result.types?.fn?.params?.d?.type?.shape

    expect(shape?.value?.kind).toBe('number')
    expect(shape?.extra?.kind).toBe('boolean')
  })
})

describe('TS compile-time types keep their name and their TS text', () => {
  test('a conditional type is declared and referenced, not dropped', () => {
    const result = fromTS(
      `
      type IsString<T> = T extends string ? true : false;
      function check(x: IsString<number>): void {}
      `,
      { emitTJS: true }
    )
    expect(result.code).toContain('function check(')

    expect(result.code).toContain('T extends string ? true : false')
  })
  test('a template literal type is declared and referenced, not dropped', () => {
    const result = fromTS(
      `
      type EventName = \`on\${'Click' | 'Hover'}\`;
      function handle(event: EventName): void {}
      `,
      { emitTJS: true }
    )
    expect(result.code).toContain('Type EventName')
    expect(result.code).toContain('event: EventName')
  })
  test('infer keyword → any', () => {
    const result = fromTS(
      `
      type UnpackPromise<T> = T extends Promise<infer U> ? U : T;
      function unwrap(x: UnpackPromise<Promise<string>>): void {}
      `,
      { emitTJS: true }
    )
    expect(result.code).toBeDefined()
  })
  test('keyof and indexed access (T[K]) → any', () => {
    const result = fromTS(
      `
      function getKey<T, K extends keyof T>(obj: T, key: K): T[K] {
        return obj[key];
      }
      `,
      { emitTJS: true }
    )
    expect(result.code).toBeDefined()
    expect(result.code).toContain('function getKey(')
  })
  test('type predicates (x is T) → boolean return', () => {
    const result = fromTS(`
      function isString(x: unknown): x is string {
        return typeof x === 'string';
      }
      `)

    expect(result.code).toBeDefined()
    expect(result.types?.isString).toBeDefined()
  })
  test('satisfies operator → stripped, value preserved', () => {
    const result = fromTS(
      `
      const config = {
        width: 100,
        height: 200,
      } satisfies Record<string, number>;
      `,
      { emitTJS: true }
    )
    expect(result.code).toBeDefined()
    expect(result.code).toContain('config')
  })
  test('const type parameters (<const T>) → T without const', () => {
    const result = fromTS(
      `
      function identity<const T>(x: T): T { return x; }
      `,
      { emitTJS: true }
    )
    expect(result.code).toBeDefined()
    expect(result.code).toContain('function identity(')
  })
  test('readonly arrays → mutable array at runtime', () => {
    const result = fromTS(
      `
      function first(arr: readonly string[]): string {
        return arr[0];
      }
      `,
      { emitTJS: true }
    )
    expect(result.code).toBeDefined()
    expect(result.code).toContain('function first(')
  })
  test('Exclude/Extract utility types → any', () => {
    const result = fromTS(
      `
      type NonNull = Exclude<string | null, null>;
      function fn(x: NonNull): void {}
      `,
      { emitTJS: true }
    )
    expect(result.code).toBeDefined()
  })
  test('abstract classes → regular class', () => {
    const result = fromTS(
      `
      abstract class Shape {
        abstract area(): number;
        describe(): string { return 'shape'; }
      }
      `,
      { emitTJS: true }
    )
    expect(result.code).toBeDefined()
    expect(result.code).toContain('class Shape')
  })
  test('namespace functions → emitted bare', () => {
    const result = fromTS(
      `
      namespace Utils {
        export function add(a: number, b: number): number {
          return a + b;
        }
      }
      `,
      { emitTJS: true }
    )

    expect(result.code).toBeDefined()
  })
  test('mapped types (Partial, Required) → any', () => {
    const result = fromTS(
      `
      interface User { name: string; age: number; }
      function update(user: Partial<User>): void {}
      `,
      { emitTJS: true }
    )
    expect(result.code).toBeDefined()
    expect(result.code).toContain('function update(')
  })
  test('intersection types (A & B) → merged or any', () => {
    const result = fromTS(
      `
      type Named = { name: string };
      type Aged = { age: number };
      function greet(person: Named & Aged): string {
        return person.name;
      }
      `,
      { emitTJS: true }
    )
    expect(result.code).toBeDefined()
    expect(result.code).toContain('function greet(')
  })
  test('clean functions have no degradation comment', () => {
    const result = fromTS(
      'function add(a: number, b: number): number { return a + b }',
      { emitTJS: true }
    )
    expect(result.code).not.toContain('TODO: TS types degraded')
    expect(result.code).toContain('function add(a: number, b: number)')
  })
})

describe('Constrained generics use constraint as example', () => {
  test('T extends object shape uses constraint shape', () => {
    const result = fromTS(
      `function first<T extends { id: number }>(items: T[]): T {
        return items[0]
      }`,
      { emitTJS: true }
    )

    expect(result.code).toContain('id:')
    expect(result.code).not.toContain('TODO: TS types degraded')
  })
  test('T extends primitive uses constraint type', () => {
    const result = fromTS(
      `function stringify<T extends string | number>(value: T): string {
        return String(value)
      }`,
      { emitTJS: true }
    )

    expect(result.code).not.toContain('TODO: TS types degraded')
  })
  test('generic with default uses default when no constraint', () => {
    const result = fromTS(
      `function wrap<T = string>(value: T): { wrapped: T } {
        return { wrapped: value }
      }`,
      { emitTJS: true }
    )

    expect(result.code).toContain('value:')
    expect(result.code).not.toContain('TODO: TS types degraded')
  })
  test('unconstrained generic still degrades to any', () => {
    const result = fromTS(
      `function identity<T>(value: T): T {
        return value
      }`,
      { emitTJS: true }
    )

    expect(result.code).toContain('function identity(value)')
    expect(result.code).toContain('TODO: TS types degraded')
  })
  test('constrained generic metadata uses constraint shape', () => {
    const result =
      fromTS(`function getKey<T extends { id: number; name: string }>(item: T): string {
        return item.name
      }`)

    expect(result.types).toBeDefined()
    const fn = result.types['getKey']
    expect(fn).toBeDefined()
    expect(fn.params.item.type.kind).toBe('object')
    expect(fn.params.item.type.shape).toHaveProperty('id')
    expect(fn.params.item.type.shape).toHaveProperty('name')
  })
  test('class with constrained generic uses constraint', () => {
    const result = fromTS(`class Store<T extends { id: number }> {
        private items: T[] = []
        add(item: T): void { this.items.push(item) }
        get(id: number): T | undefined { return this.items.find(i => i.id === id) }
      }`)
    expect(result.classes).toBeDefined()
    const store = result.classes['Store']
    expect(store).toBeDefined()

    const addMethod = store.methods['add']
    expect(addMethod).toBeDefined()
    expect(addMethod.params.item.type.kind).toBe('object')
    expect(addMethod.params.item.type.shape).toHaveProperty('id')
  })
})

describe('fromTS — tosijs conversion edge cases', () => {
  test('DOM type params stay annotated (not degraded to bare name)', () => {
    const result = fromTS(
      `export function touchElement(element: Element, changedPath?: string): void {
        console.log(element, changedPath)
      }`,
      { emitTJS: true }
    )
    expect(result.code).toContain('function touchElement(')

    expect(result.code).toContain('element: {}')
    expect(result.code).toBeDefined()
  })
  test('interface with optional properties produces valid object shape', () => {
    const result = fromTS(
      `interface Options {
        throttleInterval?: number
        verbose?: boolean
      }
      export function configure(options: Options): void {}`,
      { emitTJS: true }
    )
    expect(result.code).toContain('throttleInterval:')
    expect(result.code).not.toContain('throttleInterval =')
    expect(result.code).toContain('verbose:')
    expect(result.code).not.toContain('verbose =')
  })
  test('interface with mix of required and optional properties', () => {
    const result = fromTS(
      `interface Config {
        host: string
        port: number
        debug?: boolean
      }
      export function connect(config: Config): void {}`,
      { emitTJS: true }
    )

    expect(result.code).toContain('host:')
    expect(result.code).toContain('port:')
    expect(result.code).toContain('debug:')

    expect(result.code).not.toMatch(/\bdebug\s*=/)
  })
  test('this pseudo-parameter is stripped', () => {
    const result = fromTS(
      `class Foo {
        static create(this: new () => Foo, options: object = {}): Foo {
          return new this()
        }
      }`,
      { emitTJS: true }
    )

    expect(result.code).not.toMatch(/\bthis\s*,/)
    expect(result.code).toContain('options')
  })
  test('class extends with generic type args stripped', () => {
    const result = fromTS(
      `class MyComponent extends Component<MyParts> {
        value = 0
      }`,
      { emitTJS: true }
    )

    expect(result.code).toContain('extends Component')
    expect(result.code).not.toContain('Component<')
  })
  test('object literal initializer in class property preserved', () => {
    const result = fromTS(
      `class Blueprint {
        static initAttributes = { tag: 'anon-elt', src: '', property: 'default' }
      }`,
      { emitTJS: true }
    )

    expect(result.code).toContain("tag: 'anon-elt'")
    expect(result.code).toContain("src: ''")
    expect(result.code).toContain("property: 'default'")
  })
  test('value imports preserved, type-only imports stripped', () => {
    const result = fromTS(
      `
      import { foo, type Bar } from '/Users/tonioloewald/tjs-lang/src/lang/other'
      import type { TypeOnly } from '/Users/tonioloewald/tjs-lang/src/lang/types'
      export { foo }
      `,
      { emitTJS: true }
    )

    expect(result.code).toContain(
      "import { foo } from '/Users/tonioloewald/tjs-lang/src/lang/other'"
    )

    expect(result.code).not.toContain('TypeOnly')
    expect(result.code).not.toContain('Bar')

    expect(result.code).toContain('export { foo }')
  })
  test('re-export from another module preserved', () => {
    const result = fromTS(
      `export { bar, baz as qux } from '/Users/tonioloewald/tjs-lang/src/lang/other'`,
      {
        emitTJS: true,
      }
    )
    expect(result.code).toContain(
      "export { bar, baz as qux } from '/Users/tonioloewald/tjs-lang/src/lang/other'"
    )
  })
  test('default and namespace imports preserved', () => {
    const result = fromTS(
      `
      import * as ns from '/Users/tonioloewald/tjs-lang/src/lang/namespace'
      import defaultThing from '/Users/tonioloewald/tjs-lang/src/lang/default'
      `,
      { emitTJS: true }
    )
    expect(result.code).toContain(
      "import * as ns from '/Users/tonioloewald/tjs-lang/src/lang/namespace'"
    )
    expect(result.code).toContain(
      "import defaultThing from '/Users/tonioloewald/tjs-lang/src/lang/default'"
    )
  })
  test('export keyword preserved on functions', () => {
    const result = fromTS(
      `export function greet(name: string): string { return name }`,
      { emitTJS: true }
    )
    expect(result.code).toContain('export function greet(')
  })
  test('export keyword preserved on arrow functions', () => {
    const result = fromTS(
      `export const double = (x: number): number => x * 2`,
      { emitTJS: true }
    )
    expect(result.code).toContain('export')
    expect(result.code).toContain('function double(')
  })
  test('export keyword preserved on classes', () => {
    const result = fromTS(`export class Foo { constructor(x: number) {} }`, {
      emitTJS: true,
    })
    expect(result.code).toContain('export class Foo')
  })
  test('private keyword stripped without converting to #', () => {
    const result = fromTS(
      `class Foo {
        private cache: any = null
        private static instances: any[] = []

        static create(): Foo {
          const f = new Foo()
          f.cache = {}
          Foo.instances.push(f)
          return f
        }

        get cached() { return this.cache }
      }`,
      { emitTJS: true }
    )

    expect(result.code).not.toContain('private')

    expect(result.code).not.toContain('#cache')
    expect(result.code).not.toContain('#instances')
    expect(result.code).toContain('this.cache')
  })
  test('private _backing field kept as-is with getter/setter', () => {
    const result = fromTS(
      `class User {
        private _name: string = ''
        get name(): string { return this._name }
        set name(value: string) { this._name = value }
      }`,
      { emitTJS: true }
    )

    expect(result.code).not.toContain('#_name')
    expect(result.code).toContain('this._name')

    expect(result.code).toContain('get name()')
    expect(result.code).toContain('set name(')
  })
  test('private field name unchanged in object literals', () => {
    const result = fromTS(
      `class Store {
        private value: any = null
        toJSON(): object {
          return { value: this.value, type: 'store' }
        }
      }`,
      { emitTJS: true }
    )

    expect(result.code).toContain('this.value')
    expect(result.code).not.toContain('#value')
  })
  test('symbol type produces Symbol example', () => {
    const result = fromTS(`function f(x: symbol): void {}`, { emitTJS: true })
    expect(result.code).toContain("Symbol('example')")
  })
  test('bigint type produces 0n example', () => {
    const result = fromTS(`function f(x: bigint): void {}`, { emitTJS: true })
    expect(result.code).toContain('0n')
  })
  test('built-in reference types produce valid JS examples', () => {
    const cases = [
      ['RegExp', '/example/'],
      ['Date', 'new Date()'],
      ['Map<string, number>', 'new Map()'],
      ['Set<number>', 'new Set()'],
      ['WeakMap<object, number>', 'new WeakMap()'],
      ['Float32Array', 'new Float32Array(0)'],
      ['Uint8Array', 'new Uint8Array(0)'],
      ['ArrayBuffer', 'new ArrayBuffer(0)'],
      ['URL', "new URL('https://example.com')"],
      ['AbortController', 'new AbortController()'],
      ['ReadableStream', 'new ReadableStream()'],
      ['TextEncoder', 'new TextEncoder()'],
      ['Error', "new Error('example')"],
    ]
    for (const [tsType, expected] of cases) {
      const result = fromTS(`function f(x: ${tsType}): void {}`, {
        emitTJS: true,
      })
      expect(result.code).toContain(expected)
    }
  })
  test('export keyword preserved on Type declarations', () => {
    const result = fromTS(
      `export interface User { name: string; age: number }`,
      { emitTJS: true }
    )
    expect(result.code).toContain('export Type User')
  })
  test('export keyword preserved on type alias declarations', () => {
    const result = fromTS(`export type Name = string`, { emitTJS: true })
    expect(result.code).toContain('export Type Name')
  })
  test('non-exported functions have no export keyword', () => {
    const result = fromTS(`function internal(x: number): number { return x }`, {
      emitTJS: true,
    })
    expect(result.code).not.toContain('export')
  })
  test('multiple params where first degrades to any', () => {
    const result = fromTS(
      `export function bind(
        element: SomeUnknownType,
        path: string,
        options?: { bidirectional?: boolean }
      ): void {}`,
      { emitTJS: true }
    )
    expect(result.code).toContain('function bind(')
    expect(result.code).toContain('path:')
  })
})

describe('DOM Types', () => {
  test('Event param maps to opaque object', () => {
    const result = fromTS(`function handle(e: Event): void {}`, {
      emitTJS: true,
    })
    expect(result.code).toContain('e: {}')

    expect(result.code).not.toContain('TODO: TS types degraded')
  })
  test('HTMLElement param maps to opaque object', () => {
    const result = fromTS(`function render(el: HTMLElement): void {}`, {
      emitTJS: true,
    })
    expect(result.code).toContain('el: {}')
  })
  test('specific HTML element types map to opaque object', () => {
    const result = fromTS(
      `function setup(input: HTMLInputElement, form: HTMLFormElement): void {}`,
      { emitTJS: true }
    )
    expect(result.code).toContain('input: {}')
    expect(result.code).toContain('form: {}')
  })
  test('MouseEvent param maps to opaque object', () => {
    const result = fromTS(
      `function onClick(ev: MouseEvent): boolean { return true }`,
      { emitTJS: true }
    )
    expect(result.code).toContain('ev: {}')
  })
  test('Document and Node params map to opaque object', () => {
    const result = fromTS(
      `function traverse(doc: Document, node: Node): void {}`,
      { emitTJS: true }
    )
    expect(result.code).toContain('doc: {}')
    expect(result.code).toContain('node: {}')
  })
  test('DOM types as return types', () => {
    const result = fromTS(
      `function getRoot(): HTMLElement { return document.body }`,
      { emitTJS: true }
    )

    expect(result.code).toContain(':! {}')
  })
  test('DOM callback type preserves annotation', () => {
    const result = fromTS(`type ClickHandler = (ev: MouseEvent) => void`, {
      emitTJS: true,
    })
    expect(result.code).toContain('FunctionPredicate ClickHandler')
  })
  test('mixed DOM and primitive params', () => {
    const result = fromTS(
      `function bind(el: Element, attr: string, value: number): void {}`,
      { emitTJS: true }
    )
    expect(result.code).toContain('el: {}')
    expect(result.code).toContain('attr: string')
    expect(result.code).toContain('value: number')
  })
  test('DOM types in metadata mode', () => {
    const { types } = fromTS(`function handle(e: Event): void {}`)

    expect(types?.handle.params.e.type.kind).toBe('object')
  })
})

describe('Function Types (FunctionPredicate)', () => {
  test('function type alias emits FunctionPredicate', () => {
    const result = fromTS(`type Callback = (x: number, y: string) => boolean`, {
      emitTJS: true,
    })
    expect(result.code).toContain('FunctionPredicate Callback')
    expect(result.code).toContain('params: { x: 0.0')
    expect(result.code).toContain("y: ''")
    expect(result.code).toContain('returns: false')
  })
  test('void function type alias', () => {
    const result = fromTS(`type Logger = (msg: string) => void`, {
      emitTJS: true,
    })
    expect(result.code).toContain('FunctionPredicate Logger')
    expect(result.code).toContain("params: { msg: '' }")

    expect(result.code).not.toMatch(/returns:/)
  })
  test('exported function type alias preserves export', () => {
    const result = fromTS(`export type Handler = (event: Event) => boolean`, {
      emitTJS: true,
    })
    expect(result.code).toContain('export FunctionPredicate Handler')
  })
  test('inline function param emits FunctionPredicate', () => {
    const result = fromTS(
      `function process(cb: (item: string) => number): void {}`,
      { emitTJS: true }
    )
    expect(result.code).toContain("FunctionPredicate('function'")
  })
  test('no-arg function type', () => {
    const result = fromTS(`type Thunk = () => number`, { emitTJS: true })
    expect(result.code).toContain('FunctionPredicate Thunk')
    expect(result.code).toContain('returns: 0.0')
  })
  test('function type with multiple params', () => {
    const result = fromTS(
      `type Reducer = (acc: number, item: string, index: number) => number`,
      { emitTJS: true }
    )
    expect(result.code).toContain('FunctionPredicate Reducer')
    expect(result.code).toContain('acc: 0.0')
    expect(result.code).toContain("item: ''")
    expect(result.code).toContain('index: 0.0')
    expect(result.code).toContain('returns: 0.0')
  })
  test('function type transpiles through full TJS pipeline', () => {
    const tsResult = fromTS(
      `type Compare = (a: number, b: number) => boolean`,
      { emitTJS: true }
    )
    const jsResult = tjs(tsResult.code, { runTests: false })
    expect(jsResult.code).toContain('FunctionPredicate')
    expect(jsResult.code).toContain('Compare')
  })
})
