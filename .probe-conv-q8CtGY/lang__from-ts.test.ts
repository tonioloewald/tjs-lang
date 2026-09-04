/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { fromTS as fromTSToTJS } from '/Users/tonioloewald/tjs-lang/src/lang/emitters/from-ts'

import { tjs } from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { createRuntime } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

/* line 15 */
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
  source: 'input.ts:15',
}

describe('TypeScript to TJS Transpiler', () => {
  describe('fromTS with emitTJS', () => {
    it('should convert string type to empty string example', () => {
      const result = fromTS(`function greet(name: string) { return name }`, {
        emitTJS: true,
      })
      expect(result.code).toContain('name: string')
    })
    it('should convert number type to 0 example', () => {
      const result = fromTS(
        `function add(a: number, b: number) { return a + b }`,
        { emitTJS: true }
      )
      expect(result.code).toContain('a: number')
      expect(result.code).toContain('b: number')
    })
    it("keeps an optional param optional, in TypeScript's own spelling", () => {
      const result = fromTS(
        `function greet(name: string, title?: string) { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain('name: string')
      expect(result.code).toContain('title: string | undefined')

      const js = tjs(result.code, { runTests: false }).code
      const meta = new Function(`${js}; return greet.__tjs;`)()
      expect(meta.params.title.required).toBe(false)

      expect(meta.params.title.type.kind).toBe('union')
    })
    it('should convert return type to -! annotation (skip signature test)', () => {
      const result = fromTS(
        `function greet(name: string): string { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(':! string')
    })
    it('should handle array types', () => {
      const result = fromTS(
        `function sum(nums: number[]): number { return 0 }`,
        { emitTJS: true }
      )
      expect(result.code).toContain('nums: [number]')
    })
    it('should handle object literal types', () => {
      const result = fromTS(
        `function getUser(): { name: string, age: number } { return { name: '', age: 0 } }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(':! { name: string, age: number }')
    })
    it('should handle nullable types', () => {
      const result = fromTS(
        `function find(id: string): string | null { return null }`,
        { emitTJS: true }
      )
      expect(result.code).toContain(':! string | null')
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

      const fn = new Function(`${result.code}; return greet('World', true);`)
      expect(fn()).toBe('Hello, World!')

      const metaFn = new Function(`${result.code}; return greet.__tjs;`)
      const meta = metaFn()

      expect(meta.params.name.type.kind).toBe('string')
      expect(meta.params.name.required).toBe(true)
      expect(meta.params.excited.required).toBe(false)
      expect(meta.returns.type.kind).toBe('string')
    })
    it('should handle arrow functions end-to-end', () => {
      const tsSource = `
        const multiply = (a: number, b: number): number => a * b
      `
      const result = fromTS(tsSource)

      const fn = new Function(`${result.code}; return multiply(4, 5);`)
      expect(fn()).toBe(20)

      const metaFn = new Function(`${result.code}; return multiply.__tjs;`)
      const meta = metaFn()
      expect(meta.params.a.type.kind).toBe('number')
      expect(meta.params.b.type.kind).toBe('number')
    })
    it('should handle complex types end-to-end', () => {
      const tsSource = `
        function processUser(user: { name: string, age: number }): string {
          return \`\${user.name} is \${user.age} years old\`
        }
      `
      const result = fromTS(tsSource)

      const fn = new Function(
        `${result.code}; return processUser({ name: 'Alice', age: 30 });`
      )
      expect(fn()).toBe('Alice is 30 years old')
    })
  })
})

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

describe('TS→TJS round-trips (no raw-TS leak into TJS blocks)', () => {
  const { tjs } = require('./index')
  const roundTrips = (ts) => {
    const emitted = fromTS(ts, { emitTJS: true }).code
    expect(() => tjs(emitted)).not.toThrow()
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

    expect(out).toContain("path: ''")
    expect(out).toContain('touch: FunctionPredicate')
    expect(out).not.toMatch(/path: string\b/)
  })
  it('intersection type alias (typeof / index signature) degrades, single-line', () => {
    const out = roundTrips(`export type ProxyObj = Props<object> & {
      [key: string]: ProxyObj | string | null
    }`)

    expect(out).toMatch(/\/\/ TS:.*&/)
    expect(out).not.toMatch(/\n\s*\[key: string\]:/)
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

describe('type-only wrappers in parameter defaults', () => {
  const convert = (ts) => fromTS(ts, { emitTJS: true }).code
  const CASES = [
    ['as', `export function f(m = {} as any) { return m }`],
    ['double as', `export function f(m = {} as unknown as any) { return m }`],
    ['non-null assertion', `export function f(m = ({} as any)!) { return m }`],
    ['satisfies', `export function f(m = {} satisfies object) { return m }`],
    [
      'in a constructor',
      `export class C { constructor(m = {} as any) { this.m = m } }`,
    ],
  ]
  for (const [label, ts] of CASES) {
    it(`${label}: the converted TJS parses`, () => {
      const converted = convert(ts)

      expect(() => tjs(converted, { runTests: false })).not.toThrow()
    })
    it(`${label}: the drop is visible, not silent`, () => {
      expect(convert(ts)).toMatch(/TJS: dropped/)
    })
  }
  it('does not annotate a default that had no cast to drop', () => {
    expect(convert(`export function f(m = {}) { return m }`)).not.toMatch(
      /TJS: dropped/
    )
  })
})

describe('fromTS — parameter properties', () => {
  it('emits the assignments TypeScript would generate', () => {
    const code = fromTS(
      `class P { constructor(public x: number, private label: string) {} }`,
      { emitTJS: true }
    ).code
    expect(code).toContain('this.x = x')
    expect(code).toContain('this.label = label')
  })
  it('leaves a plain parameter alone', () => {
    const code = fromTS(`class P { constructor(x: number) {} }`, {
      emitTJS: true,
    }).code
    expect(code).not.toContain('this.x = x')
  })
  it('assigns AFTER super(), not before', () => {
    const code = fromTS(
      `class B { constructor(n: number) {} }
class D extends B { constructor(public x: number) { super(x) } }`,
      { emitTJS: true }
    ).code
    const sup = code.lastIndexOf('super(')
    const assign = code.indexOf('this.x = x')
    expect(assign).toBeGreaterThan(sup)
  })
  it('round-trips through TJS to a working object', () => {
    const tjsSrc = fromTS(`class P { constructor(public x: number) {} }`, {
      emitTJS: true,
    }).code.replace(/^\/\* tjs <- .*\*\/\n/, '')
    const P = new Function(
      tjs(tjsSrc, { filename: 'pp.tjs' }).code + '\nreturn P'
    )()
    expect(P(7).x).toBe(7)
  })
})

describe('an optional object param is passed through, with a hint', () => {
  const SRC = `export function pick(opts?: { a: number, b: number }): string {
       return opts === undefined ? 'ABSENT' : JSON.stringify(opts)
     }`
  const run = (tjsSource) =>
    new Function(
      tjs(tjsSource, { runTests: false }).code.replace(/^export /gm, '') +
        '\nreturn pick'
    )()
  it('is undefined when omitted, exactly as in TypeScript', () => {
    expect(run(fromTS(SRC, { emitTJS: true }).code)()).toBe('ABSENT')
  })
  it('still receives what the caller passes', () => {
    expect(run(fromTS(SRC, { emitTJS: true }).code)({ a: 1, b: 2 })).toBe(
      '{"a":1,"b":2}'
    )
  })
  it('keeps the type in a warning, and names the upgrade', () => {
    const { warnings } = fromTS(SRC, { emitTJS: true })
    const hint = (warnings ?? []).join('\n')
    expect(hint).toContain('opts?: { a: number, b: number }')
    expect(hint).toContain('docs/dictionary-defaults.md')
  })
  it('a SCALAR optional still uses `?:` (control)', () => {
    const { code } = fromTS(
      `export function f(title?: string): string { return title ?? '' }`,
      { emitTJS: true }
    )
    expect(code).toContain('title: string | undefined')
  })
})

describe('overload groups keep their export', () => {
  const OVERLOADS = `export function pick(a: string): number
export function pick(a: number, b: number): number
export function pick(a: any, b?: any): number { return b === undefined ? 1 : 2 }`
  it('the emitted TJS exports each variant', () => {
    const { code } = fromTS(OVERLOADS, { emitTJS: true })
    expect(code).toContain('export function pick(')
  })
  it('and the dispatcher is exported and callable', () => {
    const js = tjs(fromTS(OVERLOADS, { emitTJS: true }).code, {
      runTests: false,
    }).code
    expect(js).toMatch(/export function pick\(/)

    const pick = new Function(js.replace(/^export /gm, '') + '\nreturn pick')()
    expect([pick('a'), pick(1, 2)]).toEqual([1, 2])
  })
  it('an UNexported group stays private (control)', () => {
    const { code } = fromTS(
      `function hidden(a: string): number
function hidden(a: number, b: number): number
function hidden(a: any, b?: any): number { return 1 }`,
      { emitTJS: true }
    )
    expect(code).not.toContain('export function hidden(')
  })
})

describe('parameter properties and a late super()', () => {
  const LATE_SUPER = `export class Boom extends Error {
  constructor(public input: unknown) {
    let displayed
    try { displayed = JSON.stringify(input) } catch (e) { displayed = input }
    super(\`no match: \${displayed}\`)
  }
}`
  it('assigns the property after the super() call', () => {
    const { code } = fromTS(LATE_SUPER, { emitTJS: true })
    expect(code.indexOf('super(')).toBeLessThan(code.indexOf('this.input'))
  })
  it('and the class actually constructs', () => {
    const js = tjs(fromTS(LATE_SUPER, { emitTJS: true }).code, {
      runTests: false,
    }).code
    const Boom = new Function(js.replace(/^export /gm, '') + '\nreturn Boom')()
    const e = new Boom({ a: 1 })
    expect(e.input).toEqual({ a: 1 })
    expect(e.message).toContain('no match')
    expect(e instanceof Error).toBe(true)
  })
  it('a LEADING super() still works (control)', () => {
    const js = tjs(
      fromTS(
        `export class Lead extends Error {
  constructor(public code: number) { super('x'); }
}`,
        { emitTJS: true }
      ).code,
      { runTests: false }
    ).code
    const Lead = new Function(js.replace(/^export /gm, '') + '\nreturn Lead')()
    expect(new Lead(7).code).toBe(7)
  })
})

describe('`any` never reaches a value position', () => {
  it('Array<any> becomes [null], like any[] already did', () => {
    const { code } = fromTS(
      'export type F = { branch: Array<any>, path: any[], n: Array<number> }',
      { emitTJS: true }
    )
    expect(code).toContain('branch: [null]')
    expect(code).toContain('path: [null]')

    expect(code).toContain('n: [0.0]')
  })
  it('and the emitted module actually imports', () => {
    const js = tjs(
      fromTS('export type F = { branch: Array<any> }', { emitTJS: true }).code,
      { runTests: false }
    ).code
    expect(() => new Function(js.replace(/^export /gm, ''))()).not.toThrow()
  })
})

describe('class bodies keep their shape', () => {
  it('a bodyless constructor overload is erased, not emitted empty', () => {
    const { code } = fromTS(
      `export class K extends B {
  constructor(a: number)
  constructor(a: string)
  constructor(a: any) { super({ a }) }
}`,
      { emitTJS: true }
    )
    expect(code.match(/constructor\(/g) ?? []).toHaveLength(1)
    expect(code).toContain('super({ a })')
  })
  it('a generator body keeps `yield` as a keyword', () => {
    const { code } = fromTS(
      `export function* rows(): Generator<any> {
  yield {
    a: 1,
  }
}`,
      { emitTJS: true }
    )
    expect(code).not.toContain('yield;')
    expect(code).toContain('yield {')
  })
  it('and an async body keeps `await`', () => {
    const { code } = fromTS(
      `export async function go(): Promise<number> { const x = await f(); return x }`,
      { emitTJS: true }
    )
    expect(code).not.toContain('await;')
    expect(code).toContain('await f()')
  })
  it('a plain function body is untouched by the wrapper (control)', () => {
    const { code } = fromTS(
      `export function add(a: number): number { return a + 1 }`,
      {
        emitTJS: true,
      }
    )
    expect(code).toContain('return a + 1')
  })
})

describe('a value binding of any shape blocks promoting a same-named type', () => {
  const converts = (src) => {
    const out = fromTS(src, { emitTJS: true, filename: 'a.ts' }).code
    expect(() => tjs(out, { runTests: false })).not.toThrow()
    return out
  }
  it('an import is a value binding', () => {
    const out = converts(
      `import Database from 'better-sqlite3'\n` +
        `export interface Database { person: unknown }\n` +
        `export const open = () => new Database(':memory:')\n`
    )
    expect(out).not.toMatch(/\bType\s+Database\b/)
  })
  it('a destructured declaration binds every name in the pattern', () => {
    const out = converts(
      `declare const taggedEnum: any\n` +
        `export const { $match: match, EntityRegistered } = taggedEnum()\n` +
        `export interface EntityRegistered { readonly _tag: "EntityRegistered" }\n`
    )
    expect(out).not.toMatch(/\bType\s+EntityRegistered\b/)
  })
  it('the RENAMED name is the binding, not the key', () => {
    const out = converts(
      `declare const e: any\n` +
        `export const { $match: match } = e()\n` +
        `export interface match { a: number }\n`
    )
    expect(out).not.toMatch(/\bType\s+match\b/)
  })
  it('a type-only import is erased, so it does NOT block promotion', () => {
    const out = converts(
      `import type { Other } from '/Users/tonioloewald/tjs-lang/src/lang/other'\n` +
        `export interface Thing { a: number }\n` +
        `export const use = (x: Other) => x\n`
    )
    expect(out).toMatch(/\bType\s+Thing\b/)
  })
})

describe('a variadic implementation cannot be split into fixed-arity variants', () => {
  const src = `
export function zip<T1, T2>(a: T1[], b: T2[]): [T1, T2][]
export function zip<T1, T2, T3>(a: T1[], b: T2[], c: T3[]): [T1, T2, T3][]
export function zip<T>(...arrays: T[][]): T[][] {
  if (!arrays || !arrays.length) return []
  return arrays[0].map((_, i) => arrays.map((a) => a[i]))
}`
  it('falls back to the implementation, keeping every arity callable', () => {
    const tjsCode = fromTS(src, { emitTJS: true, filename: 'a.ts' }).code

    expect(tjsCode).toContain('function zip(...arrays')
    expect(tjsCode.match(/function zip\b/g)?.length).toBe(1)
    const prev = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      const zip = new Function(
        tjs(tjsCode, { runTests: false }).code.replace(/^export /gm, '') +
          '\nreturn zip'
      )()

      expect(zip()).toEqual([])
      expect(zip([1, 2], ['a', 'b'])).toEqual([
        [1, 'a'],
        [2, 'b'],
      ])
      expect(zip([1], ['a'], [true])).toEqual([[1, 'a', true]])
    } finally {
      globalThis.__tjs = prev
    }
  })
  it('says what it could not do, rather than dropping the signatures silently', () => {
    const result = fromTS(src, { emitTJS: true, filename: 'a.ts' })
    expect(result.code).toContain('rest parameters are unsupported')
    expect((result.warnings ?? []).join('\n')).toContain('rest parameters')
  })
  it('a group with NO rest parameter is treated the same way — one function', () => {
    const fixed = `
export function pick(a: string): string
export function pick(a: string, b: number): string
export function pick(a: string, b?: number): string { return b === undefined ? a : a + b }`
    const out = fromTS(fixed, { emitTJS: true, filename: 'a.ts' }).code
    expect(out.match(/function pick\b/g)?.length).toBe(1)
    expect(out).not.toContain('_pick_impl')
  })
})

describe('a class field DECLARATION with no initializer is erased', () => {
  const convert = (src) => fromTS(src, { emitTJS: true, filename: 'a.ts' }).code
  it('does not leave a bare identifier that the next member absorbs', () => {
    const out = convert(
      `export class R {\n` +
        `  readonly get: number\n` +
        `  modify(f: (a: number) => number): number { return f(1) }\n` +
        `}\n`
    )
    expect(out).not.toMatch(/^\s*get\s*$/m)
    expect(() => tjs(out, { runTests: false })).not.toThrow()
  })
  it('a declaration directly above a real getter does not double it', () => {
    const out = convert(
      `export class R {\n` +
        `  readonly get: number\n` +
        `  get changes(): number { return 1 }\n` +
        `}\n`
    )
    expect(out.match(/\bget\b/g)?.length).toBe(1)
    expect(() => tjs(out, { runTests: false })).not.toThrow()
  })
  it('a field WITH an initializer is still emitted', () => {
    const out = convert(`export class R {\n  count: number = 3\n}\n`)
    expect(out).toMatch(/count\s*=\s*3/)
  })
  it('a PRIVATE field declaration is NOT erased — it is load-bearing', () => {
    const out = convert(
      `export class R {\n` +
        `  #props: number\n` +
        `  constructor(p: number) { this.#props = p }\n` +
        `  get(): number { return this.#props }\n` +
        `}\n`
    )
    expect(out).toMatch(/#props\s*$/m)
    expect(() => tjs(out, { runTests: false })).not.toThrow()
  })
  it('erasing is chosen over emitting `name;` on purpose', () => {
    const out = convert(
      `export class R extends Base {\n` +
        `  readonly get: number\n` +
        `  constructor() { super(); this.get = 1 }\n` +
        `}\n`
    )
    expect(out).not.toMatch(/^\s*get;?\s*$/m)
    expect(out).toContain('this.get = 1')
  })
})
