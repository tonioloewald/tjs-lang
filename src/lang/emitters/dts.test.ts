import { describe, it, expect } from 'bun:test'
import { typeDescriptorToTS, generateDTS } from './dts'
import type { TypeDescriptor } from '../types'
import { transpileToJS } from './js'

describe('typeDescriptorToTS', () => {
  it('should convert primitive kinds', () => {
    expect(typeDescriptorToTS({ kind: 'string' })).toBe('string')
    expect(typeDescriptorToTS({ kind: 'number' })).toBe('number')
    expect(typeDescriptorToTS({ kind: 'boolean' })).toBe('boolean')
    expect(typeDescriptorToTS({ kind: 'null' })).toBe('null')
    expect(typeDescriptorToTS({ kind: 'undefined' })).toBe('undefined')
    expect(typeDescriptorToTS({ kind: 'any' })).toBe('any')
  })

  it('should map integer and non-negative-integer to number', () => {
    expect(typeDescriptorToTS({ kind: 'integer' })).toBe('number')
    expect(typeDescriptorToTS({ kind: 'non-negative-integer' })).toBe('number')
  })

  it('should handle nullable types', () => {
    expect(typeDescriptorToTS({ kind: 'string', nullable: true })).toBe(
      'string | null'
    )
    expect(typeDescriptorToTS({ kind: 'integer', nullable: true })).toBe(
      'number | null'
    )
  })

  it('should handle arrays', () => {
    expect(
      typeDescriptorToTS({ kind: 'array', items: { kind: 'string' } })
    ).toBe('string[]')
    expect(
      typeDescriptorToTS({ kind: 'array', items: { kind: 'number' } })
    ).toBe('number[]')
    expect(typeDescriptorToTS({ kind: 'array' })).toBe('any[]')
  })

  it('should wrap union items in parens for arrays', () => {
    const td: TypeDescriptor = {
      kind: 'array',
      items: {
        kind: 'union',
        members: [{ kind: 'string' }, { kind: 'number' }],
      },
    }
    expect(typeDescriptorToTS(td)).toBe('(string | number)[]')
  })

  it('should handle object shapes', () => {
    const td: TypeDescriptor = {
      kind: 'object',
      shape: {
        name: { kind: 'string' },
        age: { kind: 'integer' },
      },
    }
    expect(typeDescriptorToTS(td)).toBe('{ name: string; age: number }')
  })

  it('should handle empty objects', () => {
    expect(typeDescriptorToTS({ kind: 'object' })).toBe('Record<string, any>')
    expect(typeDescriptorToTS({ kind: 'object', shape: {} })).toBe(
      'Record<string, any>'
    )
  })

  it('should handle unions', () => {
    const td: TypeDescriptor = {
      kind: 'union',
      members: [{ kind: 'string' }, { kind: 'integer' }],
    }
    expect(typeDescriptorToTS(td)).toBe('string | number')
  })

  it('should handle nested object in array', () => {
    const td: TypeDescriptor = {
      kind: 'array',
      items: {
        kind: 'object',
        shape: {
          id: { kind: 'integer' },
          label: { kind: 'string' },
        },
      },
    }
    expect(typeDescriptorToTS(td)).toBe('{ id: number; label: string }[]')
  })

  it('should handle nullable object', () => {
    const td: TypeDescriptor = {
      kind: 'object',
      nullable: true,
      shape: { x: { kind: 'number' } },
    }
    expect(typeDescriptorToTS(td)).toBe('{ x: number } | null')
  })
})

describe('generateDTS', () => {
  it('should generate declarations for exported functions', () => {
    const source = `
export function greet(name: 'Alice') -> '' {
  return \`Hello, \${name}!\`
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export declare function greet(')
    expect(dts).toContain('name: string')
    expect(dts).toContain('): string;')
  })

  it('should handle optional parameters', () => {
    const source = `
export function greet(name = 'world') -> '' {
  return \`Hello, \${name}!\`
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('name?: string')
  })

  it('should handle multiple parameters and return types', () => {
    const source = `
export function add(a: 0, b: 0) -> 0 {
  return a + b
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('a: number')
    expect(dts).toContain('b: number')
    expect(dts).toContain('): number;')
  })

  it('should skip non-exported functions when exports exist', () => {
    const source = `
function helper(x: '') -> '' {
  return x.toUpperCase()
}

export function greet(name: 'Alice') -> '' {
  return helper(name)
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export declare function greet(')
    expect(dts).not.toContain('helper')
  })

  it('should treat all functions as exported when no exports exist', () => {
    const source = `
function add(a: 0, b: 0) -> 0 {
  return a + b
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('declare function add(')
  })

  it('should handle object parameter shapes', () => {
    const source = `
export function createUser(user: { name: '', age: 0 }) -> { id: 0, name: '' } {
  return { id: 1, name: user.name }
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('user: { name: string; age: number }')
    expect(dts).toContain('): { id: number; name: string };')
  })

  it('should handle nullable parameters', () => {
    const source = `
export function find(id: 0 | null) -> '' {
  return id ? 'found' : 'not found'
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('id: number | null')
  })

  it('should skip polymorphic variant functions', () => {
    const source = `
export function area(radius: 3.14) {
  return Math.PI * radius * radius
}
export function area(w: 0.0, h: 0.0) {
  return w * h
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    const areaCount = (dts.match(/function area/g) || []).length
    expect(areaCount).toBe(1)
    expect(dts).not.toContain('area$')
  })

  it('should include JSDoc from TDoc comments', () => {
    const source = `
/*# Greet a person by name */
function greet(name: 'Alice') -> '' {
  return \`Hello, \${name}!\`
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('/** Greet a person by name */')
  })

  it('should wrap in module declaration when moduleName is given', () => {
    const source = `
export function add(a: 0, b: 0) -> 0 {
  return a + b
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source, { moduleName: 'my-lib' })

    expect(dts).toContain("declare module 'my-lib'")
    expect(dts).toContain('  export declare function add(')
    expect(dts).toContain('}')
  })

  it('should handle array return types', () => {
    const source = `
export function getNames(count: 0) -> [''] {
  return Array(count).fill('test')
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('): string[];')
  })
})

describe('generateDTS — classes', () => {
  it('should emit exported class as callable function returning any', () => {
    const source = `
export class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    // Callable form (matches TJS wrapClass behavior)
    expect(dts).toContain(
      'export declare function Point(x: number, y: number): any;'
    )
    // Also class form for `new` usage
    expect(dts).toContain('export declare class Point {')
    expect(dts).toContain('constructor(x: number, y: number);')
  })

  it('should emit class with methods', () => {
    const source = `
export class Vec {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }

  add(other: { x: 0.0, y: 0.0 }) {
    return { x: this.x + other.x, y: this.y + other.y }
  }
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('add(other: Record<string, any>): any;')
  })

  it('should handle class exported via export { Name }', () => {
    const source = `
class DateTime {
  constructor(initial: '' | 0 | null) {
    this.value = initial
  }
}

export { DateTime }
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export declare function DateTime(')
    expect(dts).toContain('initial: string | number | null')
  })

  it('should not emit non-exported class when exports exist', () => {
    const source = `
class Internal {
  constructor(x: 0) {
    this.x = x
  }
}

export function make(n: 0) {
  return new Internal(n)
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).not.toContain('Internal')
    expect(dts).toContain('export declare function make(')
  })
})

describe('generateDTS — class method extraction', () => {
  it('should not treat control flow as methods', () => {
    const source = `
export class Counter {
  constructor(initial: 0) {
    this.count = initial
  }

  increment() {
    if (this.count < 100) {
      this.count++
    }
    for (let i = 0; i < 1; i++) {
      this.count += i
    }
    while (false) {
      break
    }
  }

  reset() {
    this.count = 0
  }
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    // Real methods should be present
    expect(dts).toContain('increment(')
    expect(dts).toContain('reset(')
    // Control flow should NOT be treated as methods
    expect(dts).not.toContain('if(')
    expect(dts).not.toContain('for(')
    expect(dts).not.toContain('while(')
  })
})

describe('generateDTS — Type declarations', () => {
  it('should emit Type as type guard object', () => {
    const source = `
export Type Name = 'World'

export function greet(name: Name) -> '' {
  return \`Hello, \${name}!\`
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export declare const Name:')
    expect(dts).toContain('check(value: any): boolean')
    expect(dts).toContain('default: string')
  })

  it('should emit Type with simple value example', () => {
    const source = `
export Type Count = 0
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('default: number')
  })
})

describe('generateDTS — Generic declarations', () => {
  it('should emit Generic without declaration as factory function', () => {
    const source = `
export Generic Box<T> {
  description: 'a boxed value'
  predicate(obj, T) { return typeof obj === 'object' && T(obj.value) }
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export declare function Box(')
    expect(dts).toContain('...args: any[]')
    expect(dts).toContain('check(value: any): boolean')
  })

  it('should emit Generic with declaration block as interface', () => {
    const source = `
export Generic BoxedProxy<T> {
  description: 'typed state proxy'
  predicate(x, T) { return typeof x === 'object' && 'value' in x && T(x.value) }
  declaration {
    value: T
    path: string
    observe(cb: (path: string) => void): void
    touch(): void
  }
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export interface BoxedProxy<T>')
    expect(dts).toContain('value: T')
    expect(dts).toContain('path: string')
    expect(dts).toContain('observe(cb: (path: string) => void): void')
    expect(dts).toContain('touch(): void')
    // Should NOT contain the factory stub
    expect(dts).not.toContain('...args: any[]')
  })

  it('should handle declaration block with complex TS types', () => {
    const source = `
export Generic Result<T, E> {
  predicate(x, T, E) { return true }
  declaration {
    value: T | undefined
    error: E | undefined
    isOk(): this is { value: T; error: undefined }
    map<U>(fn: (value: T) => U): Result<U, E>
  }
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export interface Result<T, E>')
    expect(dts).toContain('value: T | undefined')
    expect(dts).toContain('error: E | undefined')
    expect(dts).toContain('map<U>(fn: (value: T) => U): Result<U, E>')
  })

  it('should not include declaration content in runtime output', () => {
    const source = `
export Generic Box<T> {
  description: 'a box'
  predicate(obj, T) { return true }
  declaration {
    value: T
    unwrap(): T
  }
}
`
    const result = transpileToJS(source, { runTests: false })

    // Runtime code should not contain the declaration block content
    expect(result.code).not.toContain('unwrap(): T')
    expect(result.code).not.toContain('declaration')
  })
})

describe('generateDTS — FunctionPredicate declarations', () => {
  it('should emit FunctionPredicate as TS function type', () => {
    const source = `
export FunctionPredicate Callback {
  params: { x: 0, y: '' }
  returns: false
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain(
      'export type Callback = (x: number, y: string) => boolean;'
    )
  })

  it('should emit FunctionPredicate with no params as zero-arg function', () => {
    const source = `
export FunctionPredicate Thunk {
  returns: 0
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export type Thunk = () => number;')
  })

  it('should emit FunctionPredicate with no return as void', () => {
    const source = `
export FunctionPredicate SideEffect {
  params: { msg: '' }
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export type SideEffect = (msg: string) => void;')
  })

  it('should not emit non-exported FunctionPredicate when exports exist', () => {
    const source = `
FunctionPredicate Internal {
  params: { x: 0 }
}

export function use(fn: Internal) {
  return fn(1)
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).not.toContain('type Internal')
    expect(dts).toContain('export declare function use(')
  })
})

describe('generateDTS — generic FunctionPredicate', () => {
  it('should emit generic FunctionPredicate with type params', () => {
    const source = `
export FunctionPredicate Creator<T> {
  params: { name: '' }
  returns: T
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export type Creator<T> = (name: string) => T;')
  })

  it('should emit generic FunctionPredicate with default type param', () => {
    const source = `
export FunctionPredicate Factory<T = {}> {
  params: { x: 0 }
  returns: T
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export type Factory<T = {}>')
    expect(dts).toContain('=> T;')
  })

  it('should emit generic FunctionPredicate with type param in params', () => {
    const source = `
export FunctionPredicate Mapper<T, U> {
  params: { input: T }
  returns: U
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    expect(dts).toContain('export type Mapper<T, U> = (input: T) => U;')
  })
})

describe('generateDTS — mixed declarations', () => {
  it('should handle file with functions, classes, types, and generics', () => {
    const source = `
export Type Name = 'World'

export Generic Box<T> {
  description: 'a boxed value'
  predicate(obj, T) { return true }
}

export class Point {
  constructor(x: 0.0, y: 0.0) {
    this.x = x
    this.y = y
  }
}

export function greet(name: '') -> '' {
  return \`Hello, \${name}!\`
}
`
    const result = transpileToJS(source, { runTests: false })
    const dts = generateDTS(result, source)

    // All four kinds present
    expect(dts).toContain('export declare function greet(')
    expect(dts).toContain('export declare function Point(')
    expect(dts).toContain('export declare const Name:')
    expect(dts).toContain('export declare function Box(')
  })
})
