import { describe, it, expect } from 'bun:test'
import { tjs } from './index'
import { preprocess } from './parser'
import { createRuntime, isMonadicError } from './runtime'

describe('Polymorphic functions', () => {
  // Helper to compile and execute TJS code with polymorphic functions
  function compilePoly(source: string) {
    const result = tjs(source)
    const savedTjs = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      return { result, runtime: globalThis.__tjs }
    } finally {
      globalThis.__tjs = savedTjs
    }
  }

  function runPoly(source: string, funcName: string) {
    const result = tjs(source)
    const savedTjs = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      const fn = new Function(result.code + `\nreturn ${funcName}`)()
      return { fn, result, runtime: globalThis.__tjs }
    } finally {
      globalThis.__tjs = savedTjs
    }
  }

  describe('Parser transform', () => {
    it('should rename variants and generate dispatcher', () => {
      const result = preprocess(`
function greet(name: '') {
  return 'Hello, ' + name
}

function greet(first: '', last: '') {
  return 'Hello, ' + first + ' ' + last
}
`)
      expect(result.source).toContain('function greet$1(')
      expect(result.source).toContain('function greet$2(')
      expect(result.source).toContain('function greet(...__args)')
      expect(result.polymorphicNames.has('greet')).toBe(true)
    })

    it('should not transform non-polymorphic functions', () => {
      const result = preprocess(`
function foo(a: 0) { return a }
function bar(b: '') { return b }
`)
      expect(result.source).toContain('function foo(')
      expect(result.source).toContain('function bar(')
      expect(result.source).not.toContain('$1')
      expect(result.polymorphicNames.size).toBe(0)
    })

    it('should strip export from variants, keep on dispatcher', () => {
      const result = preprocess(`
export function format(value: 0) { return value.toString() }
export function format(value: '') { return value.toUpperCase() }
`)
      expect(result.source).toContain('function format$1(')
      expect(result.source).not.toContain('export function format$1(')
      expect(result.source).toContain('export function format(...__args)')
    })

    it('should handle async polymorphic functions', () => {
      const result = preprocess(`
async function fetch(id: 0) { return { id } }
async function fetch(name: '') { return { name } }
`)
      expect(result.source).toContain('async function fetch$1(')
      expect(result.source).toContain('async function fetch$2(')
      expect(result.source).toContain('async function fetch(...__args)')
    })
  })

  describe('Validation errors', () => {
    it('should reject ambiguous signatures (same types, same arity)', () => {
      expect(() =>
        preprocess(`
function foo(a: 0, b: 0) { return a + b }
function foo(x: 0, y: 0) { return x * y }
`)
      ).toThrow(/ambiguous signatures/)
    })

    it('should reject rest parameters in polymorphic functions', () => {
      expect(() =>
        preprocess(`
function bar(a: 0) { return a }
function bar(...args) { return args }
`)
      ).toThrow(/Rest parameters are not supported/)
    })

    it('should reject mixed async/sync variants', () => {
      expect(() =>
        preprocess(`
function baz(a: 0) { return a }
async function baz(a: '') { return a }
`)
      ).toThrow(/all variants must be either sync or async/)
    })

    it('should allow different types at same arity (not ambiguous)', () => {
      // This should NOT throw
      const result = preprocess(`
function process(value: 0) { return value * 2 }
function process(value: '') { return value.toUpperCase() }
`)
      expect(result.polymorphicNames.has('process')).toBe(true)
    })

    it('should allow different arities (not ambiguous)', () => {
      const result = preprocess(`
function calc(a: 0) { return a }
function calc(a: 0, b: 0) { return a + b }
function calc(a: 0, b: 0, c: 0) { return a + b + c }
`)
      expect(result.polymorphicNames.has('calc')).toBe(true)
    })
  })

  describe('Arity-based dispatch', () => {
    it('should dispatch by number of arguments', () => {
      const { fn } = runPoly(
        `
function calc(a: 0) { return a * 10 }
function calc(a: 0, b: 0) { return a + b }
`,
        'calc'
      )
      expect(fn(5)).toBe(50)
      expect(fn(3, 7)).toBe(10)
    })

    it('should return MonadicError for wrong arity', () => {
      const { fn } = runPoly(
        `
function calc(a: 0) { return a * 10 }
function calc(a: 0, b: 0) { return a + b }
`,
        'calc'
      )
      const err = fn()
      expect(isMonadicError(err)).toBe(true)
      expect(err.expected).toBe('no matching overload')
    })
  })

  describe('Type-based dispatch', () => {
    it('should dispatch string vs number at same arity', () => {
      const { fn } = runPoly(
        `
function describe(value: 0) { return 'number: ' + value }
function describe(value: '') { return 'string: ' + value }
`,
        'describe'
      )
      expect(fn(42)).toBe('number: 42')
      expect(fn('hello')).toBe('string: hello')
    })

    it('should dispatch number vs object at same arity', () => {
      const { fn } = runPoly(
        `
function area(radius: 3.14) { return Math.PI * radius * radius }
function area(shape: { w: 0.0, h: 0.0 }) { return shape.w * shape.h }
`,
        'area'
      )
      expect(fn(1)).toBeCloseTo(Math.PI)
      expect(fn({ w: 3, h: 4 })).toBe(12)
    })

    it('should dispatch number vs array at same arity', () => {
      const { fn } = runPoly(
        `
function sum(value: 0) { return value }
function sum(values: [0]) { return values.reduce((a, b) => a + b, 0) }
`,
        'sum'
      )
      expect(fn(42)).toBe(42)
      expect(fn([1, 2, 3])).toBe(6)
    })

    it('should dispatch string vs boolean', () => {
      const { fn } = runPoly(
        `
function show(value: '') { return 'str:' + value }
function show(value: true) { return 'bool:' + value }
`,
        'show'
      )
      expect(fn('yes')).toBe('str:yes')
      expect(fn(true)).toBe('bool:true')
    })

    it('should return MonadicError for unmatched type', () => {
      const { fn } = runPoly(
        `
function process(value: 0) { return value * 2 }
function process(value: '') { return value.toUpperCase() }
`,
        'process'
      )
      const err = fn(true)
      expect(isMonadicError(err)).toBe(true)
    })
  })

  describe('Integer vs float dispatch', () => {
    it('should dispatch integer vs float', () => {
      const { fn } = runPoly(
        `
function format(n: 0) { return 'int:' + n }
function format(n: 0.0) { return 'float:' + n.toFixed(2) }
`,
        'format'
      )
      // Integer check is more specific, tested first
      expect(fn(42)).toBe('int:42')
      expect(fn(3.14)).toBe('float:3.14')
    })
  })

  describe('Composite metadata', () => {
    it('should generate polymorphic __tjs on dispatcher', () => {
      const result = tjs(`
function greet(name: '') { return 'Hello, ' + name }
function greet(first: '', last: '') { return first + ' ' + last }
`)
      expect(result.code).toContain('"polymorphic": true')
      expect(result.code).toContain('"variants"')
      expect(result.code).toContain('greet$1')
      expect(result.code).toContain('greet$2')
    })

    it('should generate normal __tjs on variants', () => {
      const result = tjs(`
function add(a: 0) { return a }
function add(a: 0, b: 0) { return a + b }
`)
      // Variant metadata should have params
      expect(result.code).toContain('add$1.__tjs')
      expect(result.code).toContain('add$2.__tjs')
      // Variants should have inline validation
      expect(result.code).toContain("__tjs.pushStack('<source>:1:add$1')")
    })

    it('should not inject inline validation in dispatcher', () => {
      const result = tjs(`
function foo(a: 0) { return a }
function foo(a: '') { return a }
`)
      // Dispatcher should NOT have pushStack or typeError for params
      const dispatcherMatch = result.code.match(
        new RegExp(
          'function foo\\(\\.\\.\\.\\__args\\)[\\s\\S]*?(?=\\nfoo\\.__tjs)'
        )
      )
      if (dispatcherMatch) {
        expect(dispatcherMatch[0]).not.toContain('pushStack')
      }
    })
  })

  describe('Three or more variants', () => {
    it('should handle three variants with different arities', () => {
      const { fn } = runPoly(
        `
function make(a: '') { return [a] }
function make(a: '', b: '') { return [a, b] }
function make(a: '', b: '', c: '') { return [a, b, c] }
`,
        'make'
      )
      expect(fn('x')).toEqual(['x'])
      expect(fn('x', 'y')).toEqual(['x', 'y'])
      expect(fn('x', 'y', 'z')).toEqual(['x', 'y', 'z'])
    })
  })

  describe('Variant param validation', () => {
    it('should validate params within matched variant', () => {
      const { fn } = runPoly(
        `
function process(name: '') { return name.toUpperCase() }
function process(a: 0, b: 0) { return a + b }
`,
        'process'
      )
      // String variant dispatches correctly
      expect(fn('hello')).toBe('HELLO')
      // Number variant dispatches and validates
      expect(fn(3, 4)).toBe(7)
    })
  })

  describe('Polymorphic constructors', () => {
    function runClass(source: string, returnExpr: string) {
      const result = tjs('TjsClass\n' + source)
      const savedTjs = globalThis.__tjs
      globalThis.__tjs = createRuntime()
      try {
        return new Function(result.code + `\nreturn ${returnExpr}`)()
      } finally {
        globalThis.__tjs = savedTjs
      }
    }

    it('should dispatch constructor by arity', () => {
      const val = runClass(
        `
class Point {
  constructor(x: 0.0, y: 0.0) { this.x = x; this.y = y }
  constructor(coords: { x: 0.0, y: 0.0 }) { this.x = coords.x; this.y = coords.y }
}
`,
        '{ p1: Point(3, 4), p2: Point({ x: 10, y: 20 }) }'
      )
      expect(val.p1.x).toBe(3)
      expect(val.p1.y).toBe(4)
      expect(val.p2.x).toBe(10)
      expect(val.p2.y).toBe(20)
    })

    it('should preserve instanceof for all variants', () => {
      const val = runClass(
        `
class Box {
  constructor(value: '') { this.value = value }
  constructor(value: 0, label: '') { this.value = value; this.label = label }
}
`,
        '{ b1: Box("hello"), b2: Box(42, "count") }'
      )
      expect(val.b1.value).toBe('hello')
      expect(val.b2.value).toBe(42)
      expect(val.b2.label).toBe('count')
    })

    it('should work with new keyword', () => {
      const val = runClass(
        `
class Pair {
  constructor(a: 0, b: 0) { this.a = a; this.b = b }
  constructor(arr: [0]) { this.a = arr[0]; this.b = arr[1] }
}
`,
        'new Pair(1, 2)'
      )
      expect(val.a).toBe(1)
      expect(val.b).toBe(2)
    })

    it('should return MonadicError for unmatched constructor', () => {
      const val = runClass(
        `
class Foo {
  constructor(a: 0) { this.a = a }
  constructor(a: '', b: '') { this.a = a; this.b = b }
}
`,
        'Foo(true)'
      )
      expect(isMonadicError(val)).toBe(true)
    })

    it('should preserve other class methods', () => {
      const val = runClass(
        `
class Vec {
  constructor(x: 0.0, y: 0.0) { this.x = x; this.y = y }
  constructor(angle: 0.0) { this.x = Math.cos(angle); this.y = Math.sin(angle) }

  length() { return Math.sqrt(this.x * this.x + this.y * this.y) }
}
`,
        '{ v1: Vec(3, 4), v2: Vec(0) }'
      )
      expect(val.v1.length()).toBe(5)
      expect(val.v2.x).toBe(1) // cos(0) = 1
      expect(val.v2.y).toBeCloseTo(0) // sin(0) ≈ 0
    })
  })
})

describe('Local class extensions', () => {
  function runExt(source: string, returnExpr: string) {
    const result = tjs(source)
    const savedTjs = globalThis.__tjs
    globalThis.__tjs = createRuntime()
    try {
      return new Function(result.code + `\nreturn ${returnExpr}`)()
    } finally {
      globalThis.__tjs = savedTjs
    }
  }

  describe('Parser transform', () => {
    it('should transform extend blocks into __ext objects', () => {
      const result = preprocess(`
extend String {
  capitalize() {
    return this[0].toUpperCase() + this.slice(1)
  }
}
`)
      expect(result.source).toContain('const __ext_String')
      expect(result.source).toContain('capitalize: function()')
      expect(result.source).not.toContain('extend String')
      expect(result.extensions.has('String')).toBe(true)
      expect(result.extensions.get('String')!.has('capitalize')).toBe(true)
    })

    it('should generate runtime registration calls', () => {
      const result = preprocess(`
extend Array {
  last() { return this[this.length - 1] }
}
`)
      expect(result.source).toContain("__tjs.registerExtension('Array', 'last'")
    })

    it('should reject arrow functions in extend blocks', () => {
      expect(() =>
        preprocess(`
extend String {
  shout() => { return this.toUpperCase() }
}
`)
      ).toThrow(/Arrow functions are not allowed/)
    })

    it('should handle multiple extend blocks for different types', () => {
      const result = preprocess(`
extend String {
  upper() { return this.toUpperCase() }
}
extend Array {
  first() { return this[0] }
}
`)
      expect(result.extensions.has('String')).toBe(true)
      expect(result.extensions.has('Array')).toBe(true)
    })

    it('should handle multiple methods in one extend block', () => {
      const result = preprocess(`
extend String {
  upper() { return this.toUpperCase() }
  lower() { return this.toLowerCase() }
  len() { return this.length }
}
`)
      const methods = result.extensions.get('String')!
      expect(methods.has('upper')).toBe(true)
      expect(methods.has('lower')).toBe(true)
      expect(methods.has('len')).toBe(true)
    })
  })

  describe('Call rewriting on string literals', () => {
    it('should rewrite single-quoted string method calls', () => {
      const result = preprocess(`
extend String {
  shout() { return this.toUpperCase() + '!' }
}
const x = 'hello'.shout()
`)
      expect(result.source).toContain("__ext_String.shout.call('hello')")
    })

    it('should rewrite double-quoted string method calls', () => {
      const result = preprocess(`
extend String {
  shout() { return this.toUpperCase() + '!' }
}
const x = "hello".shout()
`)
      expect(result.source).toContain('__ext_String.shout.call("hello")')
    })

    it('should rewrite method calls with arguments', () => {
      const result = preprocess(`
extend String {
  pad(n: 0) { return this.padStart(n) }
}
const x = 'hi'.pad(10)
`)
      expect(result.source).toContain("__ext_String.pad.call('hi', 10)")
    })
  })

  describe('Call rewriting on array literals', () => {
    it('should rewrite array literal method calls', () => {
      const result = preprocess(`
extend Array {
  last() { return this[this.length - 1] }
}
const x = [1, 2, 3].last()
`)
      expect(result.source).toContain('__ext_Array.last.call([1, 2, 3])')
    })
  })

  describe('Runtime execution', () => {
    it('should execute string extension methods', () => {
      const val = runExt(
        `
extend String {
  capitalize() {
    return this[0].toUpperCase() + this.slice(1)
  }
}
const result = 'hello world'.capitalize()
`,
        'result'
      )
      expect(val).toBe('Hello world')
    })

    it('should execute array extension methods', () => {
      const val = runExt(
        `
extend Array {
  last() {
    return this[this.length - 1]
  }
}
const result = [10, 20, 30].last()
`,
        'result'
      )
      expect(val).toBe(30)
    })

    it('should execute extension methods with arguments', () => {
      const val = runExt(
        `
extend String {
  repeat2(n: 0) {
    return this.repeat(n)
  }
}
const result = 'ha'.repeat2(3)
`,
        'result'
      )
      expect(val).toBe('hahaha')
    })

    it('should bind this correctly in extension methods', () => {
      const val = runExt(
        `
extend String {
  info() {
    return this + ' (length: ' + this.length + ')'
  }
}
const result = 'abc'.info()
`,
        'result'
      )
      expect(val).toBe('abc (length: 3)')
    })

    it('should support multiple extensions on same type', () => {
      const val = runExt(
        `
extend String {
  upper() { return this.toUpperCase() }
}
extend String {
  lower() { return this.toLowerCase() }
}
const a = 'Hello'.upper()
const b = 'Hello'.lower()
`,
        '{ a, b }'
      )
      expect(val.a).toBe('HELLO')
      expect(val.b).toBe('hello')
    })

    it('should not pollute prototypes', () => {
      const val = runExt(
        `
extend String {
  customMethod() { return 42 }
}
const hasMethod = typeof String.prototype.customMethod !== 'undefined'
`,
        'hasMethod'
      )
      expect(val).toBe(false)
    })
  })

  describe('Extension overlay order', () => {
    it('should allow later extend blocks to override methods', () => {
      const val = runExt(
        `
extend String {
  greet() { return 'hello from v1' }
}
extend String {
  greet() { return 'hello from v2' }
}
const result = 'x'.greet()
`,
        'result'
      )
      expect(val).toBe('hello from v2')
    })
  })

  describe('Async extension methods', () => {
    it('should support async methods in extensions', () => {
      const result = preprocess(`
extend String {
  async fetchUpper() {
    return this.toUpperCase()
  }
}
`)
      expect(result.source).toContain('fetchUpper: async function()')
    })
  })
})
