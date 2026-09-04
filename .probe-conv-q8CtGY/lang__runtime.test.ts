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
function IsNot(a, b) {
  return !Is(a, b)
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {
  Eq,
  NotEq,
  Is,
  tjsEquals,
  IsNot,
}
const __tjsToBool = __tjs.toBool
__tjs.toBool = function (v) {
  return __tjsToBool(__proj(v))
}
/* tjs <- input.ts */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import {
  isError,
  error,
  composeErrors,
  validateArgs,
  wrap,
  wrapClass,
  configure,
  getStack,
  pushStack,
  popStack,
  errors,
  clearErrors,
  getErrorCount,
  createRuntime,
  TJS_VERSION,
  record,
  records,
  clearRecords,
  getRecordCount,
  getDroppedCount,
  resetRuntime,
  enterUnsafe,
  exitUnsafe,
  isUnsafeMode,
  TJSError,
  typeError,
  typeOf,
  isNativeType,
  Is,
  IsNot,
  Eq,
  NotEq,
  tjsEquals,
  checkType,
  isMonadicError,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

import { Eval, SafeFunction } from '/Users/tonioloewald/tjs-lang/src/lang/eval'

describe('TJS Runtime - Monadic Errors', () => {
  beforeEach(() => {
    configure({ debug: false })
  })
  describe('error creation', () => {
    it('creates basic error with path', () => {
      const err = error('Invalid value', { path: 'greet.name' })
      expect(err.$error).toBe(true)
      expect(err.message).toBe('Invalid value')
      expect(err.path).toBe('greet.name')
    })
    it('includes source location in error', () => {
      const err = error('Type mismatch', {
        path: 'greet.name',
        loc: { start: 15, end: 29 },
      })
      expect(err.loc).toEqual({ start: 15, end: 29 })
    })
    it('does not include stack in non-debug mode', () => {
      const err = error('Error', { path: 'test' })
      expect(err.stack).toBeUndefined()
    })
  })
  describe('debug mode - call stacks', () => {
    beforeEach(() => {
      configure({ debug: true })
    })
    afterEach(() => {
      resetRuntime()
    })
    it('captures call stack in debug mode', () => {
      const greet = wrap(
        function greet(name) {
          return `Hello, ${name}!`
        },
        {
          params: {
            name: {
              type: 'string',
              required: true,
              loc: { start: 15, end: 29 },
            },
          },
        }
      )
      const processUser = wrap(
        function processUser(name) {
          return greet(name)
        },
        { params: { name: { type: 'any', required: true } } }
      )
      const main = wrap(
        function main() {
          return processUser(123)
        },
        { params: {} }
      )
      const result = main()
      expect(isError(result)).toBe(true)
      const err = result
      expect(err.path).toBe('greet.name')
      expect(err.loc).toEqual({ start: 15, end: 29 })
      expect(err.stack).toContain('main')
      expect(err.stack).toContain('processUser')
      expect(err.stack).toContain('greet.name')
    })
    it('stack shows full call chain', () => {
      const inner = wrap(
        function inner(x) {
          return x * 2
        },
        { params: { x: { type: 'number', required: true } } }
      )
      const middle = wrap(
        function middle(val) {
          return inner(val)
        },
        { params: { val: { type: 'any', required: true } } }
      )
      const outer = wrap(
        function outer() {
          return middle('not a number')
        },
        { params: {} }
      )
      const result = outer()
      expect(isError(result)).toBe(true)
      const err = result

      expect(err.stack).toEqual(['outer', 'middle', 'inner.x'])
      expect(err.path).toBe('inner.x')
    })
  })
  describe('validateArgs with location', () => {
    it('includes loc in missing param error', () => {
      const err = validateArgs(
        {},
        {
          params: {
            name: {
              type: 'string',
              required: true,
              loc: { start: 10, end: 20 },
            },
          },
        },
        'greet'
      )
      expect(err).not.toBeNull()
      expect(err.path).toBe('greet.name')
      expect(err.loc).toEqual({ start: 10, end: 20 })
    })
    it('includes loc in type mismatch error', () => {
      const err = validateArgs(
        { count: 'not a number' },
        {
          params: {
            count: {
              type: 'number',
              required: true,
              loc: { start: 25, end: 35 },
            },
          },
        },
        'repeat'
      )
      expect(err).not.toBeNull()
      expect(err.path).toBe('repeat.count')
      expect(err.loc).toEqual({ start: 25, end: 35 })
      expect(err.expected).toBe('number')
      expect(err.actual).toBe('string')
    })
  })
  describe('error propagation', () => {
    it('propagates errors through wrapped functions', () => {
      const step1 = wrap(
        function step1(_x) {
          return error('Something went wrong', {
            path: 'step1',
            loc: { start: 0, end: 10 },
          })
        },
        { params: { x: { type: 'number', required: true } } }
      )
      const step2 = wrap(
        function step2(val) {
          return step1(val)
        },
        { params: { val: { type: 'any', required: true } } }
      )
      const result = step2(42)
      expect(isError(result)).toBe(true)
      expect(result.path).toBe('step1')
      expect(result.loc).toEqual({ start: 0, end: 10 })
    })
    it('passes through error arguments without processing', () => {
      const fn = wrap(
        function fn(x) {
          return x * 2
        },
        { params: { x: { type: 'number', required: true } } }
      )
      const inputError = error('Upstream error', { path: 'upstream' })
      const result = fn(inputError)
      expect(isError(result)).toBe(true)
      expect(result.path).toBe('upstream')
    })
  })
  describe('source location format', () => {
    it('loc contains start and end positions', () => {
      const err = error('Test', { loc: { start: 100, end: 150 } })
      expect(typeof err.loc?.start).toBe('number')
      expect(typeof err.loc?.end).toBe('number')
      expect(err.loc?.start).toBeLessThan(err.loc?.end ?? 0)
    })
  })
  describe('unsafe functions', () => {
    it('wrap() returns original function when meta.unsafe is true', () => {
      function original(x) {
        return x * 2
      }
      const wrapped = wrap(original, {
        params: { x: { type: 'number', required: true } },
        unsafe: true,
      })

      expect(wrapped).toBe(original)
    })
    it('unsafe functions skip validation', () => {
      function add(a, b) {
        return a + b
      }
      const unsafeAdd = wrap(add, {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
        unsafe: true,
      })

      const result = unsafeAdd('hello', 'world')
      expect(result).toBe('helloworld')
    })
    it('safe functions validate types', () => {
      function add(a, b) {
        return a + b
      }
      const safeAdd = wrap(add, {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
      })

      const result = safeAdd('hello', 'world')
      expect(isError(result)).toBe(true)

      const err = result
      expect(err.errors).toBeDefined()
      expect(err.errors.length).toBe(2)
      expect(err.errors[0].expected).toBe('number')
      expect(err.errors[1].expected).toBe('number')
    })
  })
  describe('unsafe mode (enterUnsafe/exitUnsafe)', () => {
    it('disables validation when in unsafe mode', () => {
      const double = wrap((x) => x * 2, {
        params: { x: { type: 'number', required: true } },
      })

      expect(isError(double('bad'))).toBe(true)

      enterUnsafe()
      try {
        const result = double('bad')
        expect(result).toBeNaN()
      } finally {
        exitUnsafe()
      }

      expect(isError(double('bad'))).toBe(true)
    })
    it('handles nested unsafe blocks', () => {
      expect(isUnsafeMode()).toBe(false)
      enterUnsafe()
      expect(isUnsafeMode()).toBe(true)
      enterUnsafe()
      expect(isUnsafeMode()).toBe(true)
      exitUnsafe()
      expect(isUnsafeMode()).toBe(true)
      exitUnsafe()
      expect(isUnsafeMode()).toBe(false)
    })
    it('exitUnsafe is safe to call when not in unsafe mode', () => {
      expect(isUnsafeMode()).toBe(false)
      exitUnsafe()
      expect(isUnsafeMode()).toBe(false)
    })
  })
  describe('safety levels', () => {
    beforeEach(() => {
      configure({ safety: 'inputs' })
    })
    it('safety: none skips all validation by default', () => {
      configure({ safety: 'none' })
      const fn = wrap((x) => x * 2, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
      })

      expect(fn('bad')).toBeNaN()
    })
    it('safety: inputs validates inputs only', () => {
      configure({ safety: 'inputs' })
      const fn = wrap((_x) => 'not a number', {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
      })

      expect(isError(fn('bad'))).toBe(true)

      expect(fn(5)).toBe('not a number')
    })
    it('safety: all validates inputs and outputs', () => {
      configure({ safety: 'all' })
      const fn = wrap((_x) => 'not a number', {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
      })

      expect(isError(fn('bad'))).toBe(true)

      const result = fn(5)
      expect(isError(result)).toBe(true)
      expect(result.message).toContain('Expected number')
    })
  })
  describe('per-function safety flags', () => {
    beforeEach(() => {
      configure({ safety: 'inputs' })
    })
    it('unsafe flag skips validation regardless of global setting', () => {
      const fn = wrap((x) => x * 2, {
        params: { x: { type: 'number', required: true } },
        unsafe: true,
      })

      expect(fn('bad')).toBeNaN()
    })
    it('safe flag forces validation regardless of global setting', () => {
      configure({ safety: 'none' })
      const fn = wrap((x) => x * 2, {
        params: { x: { type: 'number', required: true } },
        safe: true,
      })

      expect(isError(fn('bad'))).toBe(true)
    })
    it('safeReturn forces output validation', () => {
      configure({ safety: 'inputs' })
      const fn = wrap((_x) => 'wrong', {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
        safeReturn: true,
      })

      const result = fn(5)
      expect(isError(result)).toBe(true)
    })
    it('unsafeReturn skips output validation', () => {
      configure({ safety: 'all' })
      const fn = wrap((_x) => 'wrong', {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
        unsafeReturn: true,
      })

      expect(fn(5)).toBe('wrong')
    })
  })
  describe('composed errors', () => {
    it('composeErrors returns single error when only one', () => {
      const singleErr = error('Test error', { path: 'func.x' })
      const composed = composeErrors([singleErr], 'func')
      expect(composed).toBe(singleErr)
    })
    it('composeErrors combines multiple errors', () => {
      const err1 = error('Error 1', { path: 'func.a', expected: 'number' })
      const err2 = error('Error 2', { path: 'func.b', expected: 'string' })
      const composed = composeErrors([err1, err2], 'testFunc')
      expect(isError(composed)).toBe(true)
      expect(composed.message).toContain('Multiple parameter errors')
      expect(composed.message).toContain('testFunc')
      expect(composed.message).toContain('a, b')
      expect(composed.errors).toBeDefined()
      expect(composed.errors.length).toBe(2)
      expect(composed.errors[0]).toBe(err1)
      expect(composed.errors[1]).toBe(err2)
    })
    it('wrap collects all parameter errors', () => {
      const fn = wrap((a, b, c) => ({ a, b, c }), {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'string', required: true },
          c: { type: 'boolean', required: true },
        },
      })

      const result = fn('not-num', 123, 'not-bool')
      expect(isError(result)).toBe(true)
      const err = result
      expect(err.errors).toBeDefined()
      expect(err.errors.length).toBe(3)
    })
  })
  describe('stack size limit', () => {
    beforeEach(() => {
      configure({ debug: true, maxStackSize: 5 })
    })
    it('limits stack size to maxStackSize', () => {
      for (let i = 0; i < 10; i++) {
        pushStack(`func${i}`)
      }
      const stack = getStack()
      expect(stack.length).toBe(5)

      expect(stack[0]).toBe('func5')
      expect(stack[4]).toBe('func9')

      for (let i = 0; i < 5; i++) {
        popStack()
      }
    })
    it('does not push empty names to stack', () => {
      pushStack('')
      pushStack('valid')
      pushStack('')
      const stack = getStack()
      expect(stack.length).toBe(1)
      expect(stack[0]).toBe('valid')
      popStack()
    })
  })
  describe('meta.name fallback for anonymous functions', () => {
    it('uses meta.name when fn.name is empty', () => {
      configure({ debug: true })

      const fn = wrap((x) => x * 2, {
        params: { x: { type: 'number', required: true } },
        name: 'myNamedFunc',
      })

      const result = fn('bad')
      expect(isError(result)).toBe(true)
      expect(result.path).toContain('myNamedFunc')
    })
    it('uses "anonymous" when both fn.name and meta.name are empty', () => {
      const fn = wrap((x) => x * 2, {
        params: { x: { type: 'number', required: true } },
      })
      const result = fn('bad')
      expect(isError(result)).toBe(true)
      expect(result.path).toContain('anonymous')
    })
  })
  describe('wrapClass - callable without new', () => {
    it('allows calling class without new keyword', () => {
      class Point {
        x
        y
        constructor(x, y) {
          this.x = x
          this.y = y
        }
      }
      const WrappedPoint = wrapClass(Point)

      const p1 = WrappedPoint(10, 20)
      expect(p1).toBeInstanceOf(Point)
      expect(p1.x).toBe(10)
      expect(p1.y).toBe(20)
    })
    it('still works with new keyword', () => {
      class Point {
        x
        y
        constructor(x, y) {
          this.x = x
          this.y = y
        }
      }
      const WrappedPoint = wrapClass(Point)

      const p2 = new WrappedPoint(30, 40)
      expect(p2).toBeInstanceOf(Point)
      expect(p2.x).toBe(30)
      expect(p2.y).toBe(40)
    })
    it('preserves class name', () => {
      class MyCustomClass {}
      const Wrapped = wrapClass(MyCustomClass)
      expect(Wrapped.name).toBe('MyCustomClass')
    })
    it('preserves static properties', () => {
      class Counter {
        static count = 0
        static increment() {
          Counter.count++
        }
      }
      const WrappedCounter = wrapClass(Counter)
      expect(WrappedCounter.count).toBe(0)
      WrappedCounter.increment()
      expect(WrappedCounter.count).toBe(1)
    })
    it('preserves prototype chain', () => {
      class Animal {
        speak() {
          return 'generic sound'
        }
      }
      const WrappedAnimal = wrapClass(Animal)
      const a = WrappedAnimal()
      expect(a.speak()).toBe('generic sound')
      expect(a).toBeInstanceOf(Animal)
    })
    it('works with inheritance', () => {
      class Animal {
        speak() {
          return 'generic'
        }
      }
      class Dog extends Animal {
        speak() {
          return 'woof'
        }
      }
      const WrappedDog = wrapClass(Dog)
      const d = WrappedDog()
      expect(d.speak()).toBe('woof')
      expect(d).toBeInstanceOf(Dog)
      expect(d).toBeInstanceOf(Animal)
    })
  })
})

describe('Eval (VM-backed)', () => {
  it('evaluates simple expressions', async () => {
    const result = await Eval({
      code: 'a + b',
      context: { a: 1, b: 2 },
    })
    expect(result.result).toBe(3)
  })
  it('evaluates code with return statement', async () => {
    const result = await Eval({
      code: 'return a * b',
      context: { a: 3, b: 4 },
    })
    expect(result.result).toBe(12)
  })
  it('returns fuel used', async () => {
    const result = await Eval({
      code: 'a + b',
      context: { a: 1, b: 2 },
      fuel: 100,
    })
    expect(result.fuelUsed).toBeGreaterThan(0)
    expect(result.fuelUsed).toBeLessThan(100)
  })
  it('uses all fuel on expensive operations', async () => {
    const result = await Eval({
      code: `
        let sum = 0
        let i = 0
        while (i < 10000) {
          sum = sum + i
          i = i + 1
        }
        return sum
      `,
      context: {},
      fuel: 100,
    })

    expect(result.fuelUsed).toBeCloseTo(100, 0)
  })
  it('handles errors gracefully', async () => {
    const result = await Eval({
      code: 'nonexistent.property',
      context: {},
    })

    expect(result).toBeDefined()
  })
})

describe('SafeFunction (VM-backed)', () => {
  it('creates a reusable function', async () => {
    const add = await SafeFunction({
      params: ['a', 'b'],
      body: 'return a + b',
    })
    const result = await add(1, 2)
    expect(result.result).toBe(3)
  })
  it('can be called multiple times', async () => {
    const double = await SafeFunction({
      params: ['x'],
      body: 'return x * 2',
    })
    expect((await double(5)).result).toBe(10)
    expect((await double(10)).result).toBe(20)
    expect((await double(-3)).result).toBe(-6)
  })
  it('respects fuel limits', async () => {
    const looper = await SafeFunction({
      params: [],
      body: `
        let i = 0
        while (i < 10000) {
          i = i + 1
        }
        return i
      `,
      fuel: 50,
    })
    const result = await looper()
    expect(result.fuelUsed).toBeCloseTo(50, 0)
  })
  it('pre-compiles AST for efficiency', async () => {
    const fn = await SafeFunction({
      params: ['x'],
      body: 'return x + 1',
    })

    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      await fn(i)
    }
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(5000)
  })
})

describe('typeOf - enhanced typeof', () => {
  it('returns "null" for null', () => {
    expect(typeOf(null)).toBe('null')
  })
  it('returns "undefined" for undefined', () => {
    expect(typeOf(undefined)).toBe('undefined')
  })
  it('returns "array" for arrays', () => {
    expect(typeOf([])).toBe('array')
    expect(typeOf([1, 2, 3])).toBe('array')
  })
  it('returns primitive types', () => {
    expect(typeOf('hello')).toBe('string')
    expect(typeOf(42)).toBe('number')
    expect(typeOf(true)).toBe('boolean')
    expect(typeOf(Symbol('test'))).toBe('symbol')
    expect(typeOf(() => {})).toBe('function')
  })
  it('returns "object" for plain objects', () => {
    expect(typeOf({})).toBe('object')
    expect(typeOf({ a: 1 })).toBe('object')
  })
  it('returns constructor name for class instances', () => {
    class MyClass {}
    expect(typeOf(new MyClass())).toBe('MyClass')
  })
  it('returns constructor name for built-in types', () => {
    expect(typeOf(new Map())).toBe('Map')
    expect(typeOf(new Set())).toBe('Set')
    expect(typeOf(new Date())).toBe('Date')
    expect(typeOf(/regex/)).toBe('RegExp')
    expect(typeOf(new Error('test'))).toBe('Error')
  })
})

describe('isNativeType - pragmatic native type checking', () => {
  it('checks constructor name directly', () => {
    expect(isNativeType(new Map(), 'Map')).toBe(true)
    expect(isNativeType(new Set(), 'Set')).toBe(true)
    expect(isNativeType(new Date(), 'Date')).toBe(true)
    expect(isNativeType(new Error('test'), 'Error')).toBe(true)
  })
  it('checks prototype chain', () => {
    expect(isNativeType(new TypeError('test'), 'Error')).toBe(true)
    expect(isNativeType(new TypeError('test'), 'TypeError')).toBe(true)
  })
  it('returns false for non-matching types', () => {
    expect(isNativeType(new Map(), 'Set')).toBe(false)
    expect(isNativeType({}, 'Map')).toBe(false)
    expect(isNativeType('string', 'String')).toBe(false)
  })
  it('returns false for null/undefined', () => {
    expect(isNativeType(null, 'Object')).toBe(false)
    expect(isNativeType(undefined, 'Object')).toBe(false)
  })
  it('returns false for primitives', () => {
    expect(isNativeType(42, 'Number')).toBe(false)
    expect(isNativeType('hello', 'String')).toBe(false)
    expect(isNativeType(true, 'Boolean')).toBe(false)
  })
  it('works with custom classes', () => {
    class MyWidget {}
    class MyButton extends MyWidget {}
    const button = new MyButton()
    expect(isNativeType(button, 'MyButton')).toBe(true)
    expect(isNativeType(button, 'MyWidget')).toBe(true)
    expect(isNativeType(button, 'Object')).toBe(true)
  })
})

describe('Is - structural equality', () => {
  it('returns true for identical primitives', () => {
    expect(Is(1, 1)).toBe(true)
    expect(Is('hello', 'hello')).toBe(true)
    expect(Is(true, true)).toBe(true)
    expect(Is(null, null)).toBe(true)
    expect(Is(undefined, undefined)).toBe(true)
  })
  it('returns false for different primitives', () => {
    expect(Is(1, 2)).toBe(false)
    expect(Is('a', 'b')).toBe(false)
    expect(Is(true, false)).toBe(false)
  })
  it('treats null and undefined as equal (nullish equality)', () => {
    expect(Is(null, undefined)).toBe(true)
    expect(Is(undefined, null)).toBe(true)
  })
  it('does NOT coerce types like JS ==', () => {
    expect(Is('1', 1)).toBe(false)
    expect(Is(0, false)).toBe(false)
    expect(Is('', false)).toBe(false)
    expect(Is([], '')).toBe(false)
  })
  it('compares arrays structurally', () => {
    expect(Is([1, 2, 3], [1, 2, 3])).toBe(true)
    expect(Is([1, 2], [1, 2, 3])).toBe(false)
    expect(Is([1, 2, 3], [1, 2])).toBe(false)
    expect(Is([1, [2, 3]], [1, [2, 3]])).toBe(true)
  })
  it('compares objects structurally', () => {
    expect(Is({ a: 1 }, { a: 1 })).toBe(true)
    expect(Is({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
    expect(Is({ a: 1 }, { a: 2 })).toBe(false)
    expect(Is({ a: 1 }, { b: 1 })).toBe(false)
    expect(Is({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true)
  })
  it('returns false for different reference types', () => {
    const obj1 = { a: 1 }
    const obj2 = { a: 1 }

    expect(Is(obj1, obj2)).toBe(true)

    expect(obj1 === obj2).toBe(false)
  })
  it('handles objects with Equals method', () => {
    const custom = {
      value: 42,
      Equals(other) {
        return other?.value === this.value
      },
    }
    expect(Is(custom, { value: 42 })).toBe(true)
    expect(Is(custom, { value: 99 })).toBe(false)
  })
})

describe('IsNot - structural inequality', () => {
  it('is the negation of Is', () => {
    expect(IsNot(1, 1)).toBe(false)
    expect(IsNot(1, 2)).toBe(true)
    expect(IsNot({ a: 1 }, { a: 1 })).toBe(false)
    expect(IsNot({ a: 1 }, { a: 2 })).toBe(true)
    expect(IsNot(null, undefined)).toBe(false)
  })
})

describe('tjsEquals symbol protocol', () => {
  it('uses [tjsEquals] on left operand', () => {
    const obj = {
      [tjsEquals](other) {
        return other === 'match'
      },
    }
    expect(Is(obj, 'match')).toBe(true)
    expect(Is(obj, 'nope')).toBe(false)
  })
  it('uses [tjsEquals] on right operand', () => {
    const obj = {
      [tjsEquals](other) {
        return other === 42
      },
    }
    expect(Is(42, obj)).toBe(true)
    expect(Is(99, obj)).toBe(false)
  })
  it('symbol takes priority over .Equals', () => {
    const obj = {
      [tjsEquals](_other) {
        return true
      },
      Equals(_other) {
        return false
      },
    }
    expect(Is(obj, 'anything')).toBe(true)
  })
  it('works with Proxy delegation', () => {
    const target = { x: 1, y: 2 }
    const proxy = new Proxy(
      {
        [tjsEquals](other) {
          return Is(target, other)
        },
      },
      {}
    )
    expect(Is(proxy, { x: 1, y: 2 })).toBe(true)
    expect(Is(proxy, { x: 1, y: 3 })).toBe(false)

    expect(Is({ x: 1, y: 2 }, proxy)).toBe(true)
  })
  it('is a global symbol accessible via Symbol.for', () => {
    expect(tjsEquals).toBe(Symbol.for('tjs.equals'))
  })
})

describe('Error history ring buffer', () => {
  beforeEach(() => {
    resetRuntime()
  })
  afterEach(() => {
    resetRuntime()
  })
  it('tracks errors by default', () => {
    const err = typeError('fn.x', 'string', 42)
    const recent = errors()
    expect(recent).toHaveLength(1)
    expect(recent[0]).toBe(err)
  })
  it('tracks multiple errors', () => {
    typeError('fn.a', 'string', 1)
    typeError('fn.b', 'number', 'x')
    typeError('fn.c', 'boolean', null)
    const recent = errors()
    expect(recent).toHaveLength(3)
    expect(recent[0].path).toBe('fn.a')
    expect(recent[2].path).toBe('fn.c')
  })
  it('ring buffer wraps at maxErrors', () => {
    configure({ maxErrors: 4 })
    for (let i = 0; i < 6; i++) {
      typeError(`fn.x${i}`, 'string', i)
    }
    const recent = errors()
    expect(recent).toHaveLength(4)

    expect(recent[0].path).toBe('fn.x2')
    expect(recent[3].path).toBe('fn.x5')
  })
  it('getErrorCount tracks total even after buffer wraps', () => {
    configure({ maxErrors: 4 })
    for (let i = 0; i < 10; i++) {
      typeError('fn.x', 'string', i)
    }
    expect(getErrorCount()).toBe(10)
    expect(errors()).toHaveLength(4)
  })
})

describe('flight recorder', () => {
  beforeEach(() => {
    resetRuntime()
    clearRecords()
  })
  afterEach(() => resetRuntime())
  it('keeps notices and warnings OUT of errors()', () => {
    typeError('fn.x', 'string', 42)
    record({ source: 'wasm', severity: 'notice', message: 'fell back to JS' })
    record({ source: 'wasm', severity: 'warning', message: 'copied buffer' })
    expect(errors()).toHaveLength(1)
    expect(errors()[0].path).toBe('fn.x')
    expect(getErrorCount()).toBe(1)
    expect(records()).toHaveLength(3)
    expect(getRecordCount()).toBe(3)
  })
  it('records type errors as records too, tagged source: type', () => {
    typeError('fn.x', 'string', 42)
    const [entry] = records()
    expect(entry.source).toBe('type')
    expect(entry.severity).toBe('error')
    expect(entry.error?.path).toBe('fn.x')
  })
  it('filters by source and severity', () => {
    record({ source: 'wasm', severity: 'notice', message: 'a' })
    record({ source: 'vm', severity: 'warning', message: 'b' })
    record({ source: 'vm', severity: 'notice', message: 'c' })
    expect(records({ source: 'vm' }).map((r) => r.message)).toEqual(['b', 'c'])
    expect(records({ severity: 'notice' }).map((r) => r.message)).toEqual([
      'a',
      'c',
    ])
    expect(
      records({ source: 'vm', severity: 'notice' }).map((r) => r.message)
    ).toEqual(['c'])
  })
  it('carries a structured payload', () => {
    record({
      source: 'wasm',
      severity: 'notice',
      message: 'block did not compile',
      data: { block: '__tjs_wasm_0', reason: 'WhileStatement' },
    })
    expect(records()[0].data).toEqual({
      block: '__tjs_wasm_0',
      reason: 'WhileStatement',
    })
  })
  it('makes ring-wrap loss legible instead of silent', () => {
    configure({ maxErrors: 4 })
    for (let i = 0; i < 10; i++) {
      record({ source: 'app', severity: 'notice', message: `n${i}` })
    }
    expect(records()).toHaveLength(4)
    expect(getRecordCount()).toBe(10)
    expect(getDroppedCount()).toBe(6)
    expect(records().map((r) => r.message)).toEqual(['n6', 'n7', 'n8', 'n9'])
  })
  it('is zero-cost when trackErrors is off', () => {
    configure({ trackErrors: false })
    record({ source: 'app', severity: 'notice', message: 'ignored' })
    typeError('fn.x', 'string', 42)
    expect(records()).toHaveLength(0)
    expect(errors()).toHaveLength(0)
    expect(getRecordCount()).toBe(0)
  })
  it('recording never changes behavior — typeError still returns its error', () => {
    const err = typeError('fn.x', 'string', 42)
    expect(isMonadicError(err)).toBe(true)
    expect(err.path).toBe('fn.x')
  })
  it('clearRecords empties the whole ring and returns it', () => {
    typeError('fn.x', 'string', 42)
    record({ source: 'wasm', severity: 'notice', message: 'a' })
    const cleared = clearRecords()
    expect(cleared).toHaveLength(2)
    expect(records()).toHaveLength(0)
    expect(getRecordCount()).toBe(0)
    expect(errors()).toHaveLength(0)
  })
  it('clearErrors clears the whole ring but returns only errors (back-compat)', () => {
    typeError('fn.x', 'string', 42)
    record({ source: 'wasm', severity: 'notice', message: 'a' })
    const cleared = clearErrors()
    expect(cleared).toHaveLength(1)
    expect(records()).toHaveLength(0)
  })
  it('an isolated runtime keeps its own ring, and mirrors nowhere with no global', () => {
    const g = globalThis
    const saved = g.__tjs
    delete g.__tjs
    try {
      const rt = createRuntime()
      rt.record({ source: 'app', severity: 'notice', message: 'instance-only' })
      expect(rt.records()).toHaveLength(1)
      expect(records()).toHaveLength(0)
    } finally {
      g.__tjs = saved
    }
  })
  describe('mirroring to the installed global runtime', () => {
    const g = globalThis
    let saved
    beforeEach(() => {
      saved = g.__tjs
    })
    afterEach(() => {
      g.__tjs = saved
    })
    it('mirrors instance records into the global black box', () => {
      g.__tjs = { record, records, version: TJS_VERSION }
      const modA = createRuntime()
      const modB = createRuntime()
      modA.record({ source: 'wasm', severity: 'notice', message: 'from A' })
      modB.record({ source: 'vm', severity: 'warning', message: 'from B' })

      expect(modA.records()).toHaveLength(1)
      expect(modB.records()).toHaveLength(1)

      expect(records().map((r) => r.message)).toEqual(['from A', 'from B'])
    })
    it('does not recurse when the global IS an instance', () => {
      const rt = createRuntime()
      g.__tjs = rt
      expect(() =>
        rt.record({ source: 'app', severity: 'notice', message: 'x' })
      ).not.toThrow()
      expect(rt.records()).toHaveLength(1)
    })
    it('survives a global runtime whose record() throws', () => {
      g.__tjs = {
        record() {
          throw new Error('boom')
        },
      }
      const rt = createRuntime()
      expect(() =>
        rt.record({ source: 'app', severity: 'notice', message: 'x' })
      ).not.toThrow()
      expect(rt.records()).toHaveLength(1)
    })
  })
  it('clearErrors returns cleared errors and resets', () => {
    typeError('fn.a', 'string', 1)
    typeError('fn.b', 'number', 'x')
    const cleared = clearErrors()
    expect(cleared).toHaveLength(2)
    expect(cleared[0].path).toBe('fn.a')
    expect(errors()).toHaveLength(0)
    expect(getErrorCount()).toBe(0)
  })
  it('can be disabled with configure', () => {
    configure({ trackErrors: false })
    typeError('fn.x', 'string', 42)
    expect(errors()).toHaveLength(0)
    expect(getErrorCount()).toBe(0)
  })
  it('resetRuntime clears error history', () => {
    typeError('fn.x', 'string', 42)
    expect(errors()).toHaveLength(1)
    resetRuntime()
    expect(errors()).toHaveLength(0)
    expect(getErrorCount()).toBe(0)
  })
  it('zero cost on happy path', () => {
    expect(errors()).toHaveLength(0)
    expect(getErrorCount()).toBe(0)
  })
  it('catches unhandled errors from transpiled functions', () => {
    const { tjs } = require('./index')
    const savedTjs = globalThis.__tjs
    try {
      const runtime = require('./runtime').createRuntime()
      globalThis.__tjs = runtime
      const result = tjs(`
function greet(name: 'World'): 'Hello, World' {
  return 'Hello, ' + name
}

function process(x: 0): 0 {
  return x * 2
}
`)

      const mod = new Function(
        result.code + '\nreturn { greet, process, __tjs }'
      )()

      mod.__tjs.clearErrors()

      mod.greet('Alice')
      mod.process(5)
      expect(mod.__tjs.errors()).toHaveLength(0)

      mod.greet(42)
      mod.process('not a number')

      const recent = mod.__tjs.errors()
      expect(recent).toHaveLength(2)
      expect(recent[0].path).toContain('greet.name')
      expect(recent[0].expected).toBe('string')
      expect(recent[1].path).toContain('process.x')
      expect(recent[1].expected).toBe('integer')
    } finally {
      globalThis.__tjs = savedTjs
    }
  })
  it('supports the test workflow: clear, run, check', () => {
    const { tjs } = require('./index')
    const savedTjs = globalThis.__tjs
    try {
      const runtime = require('./runtime').createRuntime()
      globalThis.__tjs = runtime
      const result = tjs(`
function add(a: 1, b: 2): 3 {
  return a + b
}
`)
      const mod = new Function(result.code + '\nreturn { add, __tjs }')()

      mod.__tjs.clearErrors()
      mod.add(10, 20)
      mod.add(1, 2)
      expect(mod.__tjs.errors()).toHaveLength(0)
      expect(mod.__tjs.getErrorCount()).toBe(0)

      mod.add('x', 'y')
      expect(mod.__tjs.errors()).toHaveLength(1)
      expect(mod.__tjs.getErrorCount()).toBe(1)
    } finally {
      globalThis.__tjs = savedTjs
    }
  })
})

describe('predicate reason strings', () => {
  it('typeError includes reason in message and field', () => {
    const err = typeError('foo.bar', 'even number', 3, 'value is odd')
    expect(err.message).toContain('value is odd')
    expect(err.message).toContain('foo.bar')
    expect(err.reason).toBe('value is odd')
    expect(isMonadicError(err)).toBe(true)
  })
  it('typeError without reason works as before', () => {
    const err = typeError('foo.bar', 'string', 42)
    expect(err.message).toContain('got number')
    expect(err.reason).toBeUndefined()
  })
  it('checkType captures reason from predicate', () => {
    const EvenType = {
      check: (v) => {
        if (typeof v !== 'number') return `expected number, got ${typeof v}`
        if (v % 2 !== 0) return `${v} is odd`
        return true
      },
      description: 'even number',
    }

    expect(checkType(4, EvenType, 'test.val')).toBeNull()

    const err = checkType(3, EvenType, 'test.val')
    expect(err).not.toBeNull()
    expect(err.message).toContain('3 is odd')
    expect(err.reason).toBe('3 is odd')

    const err2 = checkType('x', EvenType, 'test.val')
    expect(err2).not.toBeNull()
    expect(err2.message).toContain('expected number, got string')
  })
  it('checkType works with boolean-only predicates', () => {
    const PositiveType = {
      check: (v) => typeof v === 'number' && v > 0,
      description: 'positive number',
    }
    expect(checkType(5, PositiveType, 'x')).toBeNull()
    const err = checkType(-1, PositiveType, 'x')
    expect(err).not.toBeNull()
    expect(err.message).toContain('positive number')
    expect(err.reason).toBeUndefined()
  })
})

describe('equality semantics — == (Eq) is footgun-free, NOT structural', () => {
  it('fixes the boxed-primitive footgun (unlike ===)', () => {
    expect(Eq(new Boolean(false), false)).toBe(true)
    expect(Eq(new Number(5), 5)).toBe(true)
    expect(Eq(new String('x'), 'x')).toBe(true)
  })
  it('does NOT coerce across types (unlike JS ==)', () => {
    expect(Eq('5', 5)).toBe(false)
    expect(Eq('', false)).toBe(false)
    expect(Eq(0, false)).toBe(false)
    expect(Eq(1, true)).toBe(false)
    expect(Eq(null, 0)).toBe(false)
  })
  it('treats null and undefined as equal; NaN as equal to itself', () => {
    expect(Eq(null, undefined)).toBe(true)
    expect(Eq(NaN, NaN)).toBe(true)
  })
  it('is NOT structural — distinct objects/arrays are distinct', () => {
    expect(Eq({ a: 1 }, { a: 1 })).toBe(false)
    expect(Eq([1, 2], [1, 2])).toBe(false)
    const shared = { a: 1 }
    expect(Eq(shared, shared)).toBe(true)
    expect(NotEq([1, 2], [1, 2])).toBe(true)
  })
  it('Is/IsNot ARE structural — that is the deep-comparison path', () => {
    expect(Is({ a: 1 }, { a: 1 })).toBe(true)
    expect(Is([1, 2], [1, 2])).toBe(true)
    expect(Is({ a: { b: [1] } }, { a: { b: [1] } })).toBe(true)
    expect(IsNot([1, 2], [1, 3])).toBe(true)

    expect(Is({ a: 1 }, { a: 2 })).toBe(false)
  })
})
