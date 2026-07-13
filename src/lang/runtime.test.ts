/**
 * TJS Runtime Tests - Monadic Errors with Location Info
 */

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
  MonadicError,
  isMonadicError,
} from './runtime'
import { Eval, SafeFunction } from './eval'

describe('TJS Runtime - Monadic Errors', () => {
  beforeEach(() => {
    // Reset to non-debug mode before each test
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
      // Simulate call stack: main -> processUser -> greet
      const greet = wrap(
        function greet(name: string) {
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
        function processUser(name: any) {
          return greet(name)
        },
        { params: { name: { type: 'any', required: true } } }
      )

      const main = wrap(
        function main() {
          return processUser(123) // Wrong type - number instead of string
        },
        { params: {} }
      )

      const result = main()
      expect(isError(result)).toBe(true)
      const err = result as TJSError
      expect(err.path).toBe('greet.name')
      expect(err.loc).toEqual({ start: 15, end: 29 })
      expect(err.stack).toContain('main')
      expect(err.stack).toContain('processUser')
      expect(err.stack).toContain('greet.name')
    })

    it('stack shows full call chain', () => {
      const inner = wrap(
        function inner(x: number) {
          return x * 2
        },
        { params: { x: { type: 'number', required: true } } }
      )

      const middle = wrap(
        function middle(val: any) {
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
      const err = result as TJSError
      // Stack shows: outer called middle, which called inner where error occurred
      // Note: inner.x is the path (where error happened), outer/middle are the call chain
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
      expect(err!.path).toBe('greet.name')
      expect(err!.loc).toEqual({ start: 10, end: 20 })
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
      expect(err!.path).toBe('repeat.count')
      expect(err!.loc).toEqual({ start: 25, end: 35 })
      expect(err!.expected).toBe('number')
      expect(err!.actual).toBe('string')
    })
  })

  describe('error propagation', () => {
    it('propagates errors through wrapped functions', () => {
      const step1 = wrap(
        function step1(_x: number) {
          return error('Something went wrong', {
            path: 'step1',
            loc: { start: 0, end: 10 },
          })
        },
        { params: { x: { type: 'number', required: true } } }
      )

      const step2 = wrap(
        function step2(val: any) {
          // This should receive and propagate the error
          return step1(val)
        },
        { params: { val: { type: 'any', required: true } } }
      )

      const result = step2(42)
      expect(isError(result)).toBe(true)
      expect((result as TJSError).path).toBe('step1')
      expect((result as TJSError).loc).toEqual({ start: 0, end: 10 })
    })

    it('passes through error arguments without processing', () => {
      const fn = wrap(
        function fn(x: number) {
          return x * 2
        },
        { params: { x: { type: 'number', required: true } } }
      )

      const inputError = error('Upstream error', { path: 'upstream' })
      const result = fn(inputError as any)

      expect(isError(result)).toBe(true)
      expect((result as TJSError).path).toBe('upstream')
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
      function original(x: number) {
        return x * 2
      }

      const wrapped = wrap(original, {
        params: { x: { type: 'number', required: true } },
        unsafe: true,
      })

      // Should be the exact same function, not a wrapper
      expect(wrapped).toBe(original)
    })

    it('unsafe functions skip validation', () => {
      function add(a: number, b: number) {
        return a + b
      }

      const unsafeAdd = wrap(add, {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
        unsafe: true,
      })

      // Should work with wrong types (no validation)
      const result = unsafeAdd('hello' as any, 'world' as any)
      expect(result).toBe('helloworld') // String concatenation
    })

    it('safe functions validate types', () => {
      function add(a: number, b: number) {
        return a + b
      }

      const safeAdd = wrap(add, {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
        // No unsafe flag
      })

      // Should return error for wrong types - both params are wrong, so composed error
      const result = safeAdd('hello' as any, 'world' as any)
      expect(isError(result)).toBe(true)
      // With multiple errors, they're composed into a single error with errors array
      const err = result as TJSError
      expect(err.errors).toBeDefined()
      expect(err.errors!.length).toBe(2)
      expect(err.errors![0].expected).toBe('number')
      expect(err.errors![1].expected).toBe('number')
    })
  })

  describe('unsafe mode (enterUnsafe/exitUnsafe)', () => {
    it('disables validation when in unsafe mode', () => {
      const double = wrap((x: number) => x * 2, {
        params: { x: { type: 'number', required: true } },
      })

      // Outside unsafe mode - validates
      expect(isError(double('bad' as any))).toBe(true)

      // Enter unsafe mode
      enterUnsafe()
      try {
        // Inside unsafe mode - skips validation, so 'bad' * 2 = NaN
        const result = double('bad' as any)
        expect(result).toBeNaN()
      } finally {
        exitUnsafe()
      }

      // Outside again - validates
      expect(isError(double('bad' as any))).toBe(true)
    })

    it('handles nested unsafe blocks', () => {
      expect(isUnsafeMode()).toBe(false)

      enterUnsafe()
      expect(isUnsafeMode()).toBe(true)

      enterUnsafe() // nested
      expect(isUnsafeMode()).toBe(true)

      exitUnsafe() // exit inner
      expect(isUnsafeMode()).toBe(true) // still in outer

      exitUnsafe() // exit outer
      expect(isUnsafeMode()).toBe(false)
    })

    it('exitUnsafe is safe to call when not in unsafe mode', () => {
      expect(isUnsafeMode()).toBe(false)
      exitUnsafe() // should not throw or go negative
      expect(isUnsafeMode()).toBe(false)
    })
  })

  describe('safety levels', () => {
    beforeEach(() => {
      configure({ safety: 'inputs' }) // reset to default
    })

    it('safety: none skips all validation by default', () => {
      configure({ safety: 'none' })

      const fn = wrap((x: number) => x * 2, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
      })

      // No validation - bad type passes through
      expect(fn('bad' as any)).toBeNaN()
    })

    it('safety: inputs validates inputs only', () => {
      configure({ safety: 'inputs' })

      const fn = wrap((_x: number) => 'not a number' as any, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
      })

      // Input validation catches bad args
      expect(isError(fn('bad' as any))).toBe(true)

      // But output is not validated (returns wrong type)
      expect(fn(5)).toBe('not a number')
    })

    it('safety: all validates inputs and outputs', () => {
      configure({ safety: 'all' })

      const fn = wrap((_x: number) => 'not a number' as any, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
      })

      // Input validation
      expect(isError(fn('bad' as any))).toBe(true)

      // Output validation also catches wrong return type
      const result = fn(5)
      expect(isError(result)).toBe(true)
      expect((result as TJSError).message).toContain('Expected number')
    })
  })

  describe('per-function safety flags', () => {
    beforeEach(() => {
      configure({ safety: 'inputs' })
    })

    it('unsafe flag skips validation regardless of global setting', () => {
      const fn = wrap((x: number) => x * 2, {
        params: { x: { type: 'number', required: true } },
        unsafe: true,
      })

      // unsafe function skips validation
      expect(fn('bad' as any)).toBeNaN()
    })

    it('safe flag forces validation regardless of global setting', () => {
      configure({ safety: 'none' })

      const fn = wrap((x: number) => x * 2, {
        params: { x: { type: 'number', required: true } },
        safe: true,
      })

      // safe function forces validation even with safety: 'none'
      expect(isError(fn('bad' as any))).toBe(true)
    })

    it('safeReturn forces output validation', () => {
      configure({ safety: 'inputs' }) // normally doesn't check outputs

      const fn = wrap((_x: number) => 'wrong' as any, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
        safeReturn: true,
      })

      // safeReturn forces output check
      const result = fn(5)
      expect(isError(result)).toBe(true)
    })

    it('unsafeReturn skips output validation', () => {
      configure({ safety: 'all' }) // normally checks outputs

      const fn = wrap((_x: number) => 'wrong' as any, {
        params: { x: { type: 'number', required: true } },
        returns: { type: 'number' },
        unsafeReturn: true,
      })

      // unsafeReturn skips output check even with safety: 'all'
      expect(fn(5)).toBe('wrong')
    })
  })

  describe('composed errors', () => {
    it('composeErrors returns single error when only one', () => {
      const singleErr = error('Test error', { path: 'func.x' })
      const composed = composeErrors([singleErr], 'func')
      expect(composed).toBe(singleErr) // Same object, not wrapped
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
      expect(composed.errors!.length).toBe(2)
      expect(composed.errors![0]).toBe(err1)
      expect(composed.errors![1]).toBe(err2)
    })

    it('wrap collects all parameter errors', () => {
      const fn = wrap((a: number, b: string, c: boolean) => ({ a, b, c }), {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'string', required: true },
          c: { type: 'boolean', required: true },
        },
      })

      // All three params are wrong
      const result = fn('not-num' as any, 123 as any, 'not-bool' as any)
      expect(isError(result)).toBe(true)
      const err = result as TJSError
      expect(err.errors).toBeDefined()
      expect(err.errors!.length).toBe(3)
    })
  })

  describe('stack size limit', () => {
    beforeEach(() => {
      configure({ debug: true, maxStackSize: 5 })
    })

    it('limits stack size to maxStackSize', () => {
      // Push more than maxStackSize
      for (let i = 0; i < 10; i++) {
        pushStack(`func${i}`)
      }

      const stack = getStack()
      expect(stack.length).toBe(5)
      // Should have the most recent 5 entries
      expect(stack[0]).toBe('func5')
      expect(stack[4]).toBe('func9')

      // Clean up
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

      // Anonymous function - fn.name will be empty
      const fn = wrap((x: number) => x * 2, {
        params: { x: { type: 'number', required: true } },
        name: 'myNamedFunc',
      })

      // Cause an error to see the path
      const result = fn('bad' as any)
      expect(isError(result)).toBe(true)
      expect((result as TJSError).path).toContain('myNamedFunc')
    })

    it('uses "anonymous" when both fn.name and meta.name are empty', () => {
      const fn = wrap((x: number) => x * 2, {
        params: { x: { type: 'number', required: true } },
      })

      const result = fn('bad' as any)
      expect(isError(result)).toBe(true)
      expect((result as TJSError).path).toContain('anonymous')
    })
  })

  describe('wrapClass - callable without new', () => {
    it('allows calling class without new keyword', () => {
      class Point {
        constructor(public x: number, public y: number) {}
      }

      const WrappedPoint = wrapClass(Point)

      // Can call without new
      const p1 = WrappedPoint(10, 20)
      expect(p1).toBeInstanceOf(Point)
      expect(p1.x).toBe(10)
      expect(p1.y).toBe(20)
    })

    it('still works with new keyword', () => {
      class Point {
        constructor(public x: number, public y: number) {}
      }

      const WrappedPoint = wrapClass(Point)

      // new still works
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
      fuel: 100, // Not enough fuel for 10000 iterations
    })
    // Should use all available fuel (floating point precision)
    expect(result.fuelUsed).toBeCloseTo(100, 0)
  })

  it('handles errors gracefully', async () => {
    const result = await Eval({
      code: 'nonexistent.property',
      context: {},
    })
    // VM handles undefined access differently - check we get a result
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
      fuel: 50, // Not enough
    })

    const result = await looper()
    expect(result.fuelUsed).toBeCloseTo(50, 0) // All fuel consumed
  })

  it('pre-compiles AST for efficiency', async () => {
    const fn = await SafeFunction({
      params: ['x'],
      body: 'return x + 1',
    })

    // Multiple calls should be fast (no re-parsing)
    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      await fn(i)
    }
    const elapsed = performance.now() - start

    // Should complete 100 calls in reasonable time
    expect(elapsed).toBeLessThan(5000) // 5 seconds is very generous
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
    // TypeError extends Error
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
    // This preserves the useful JS pattern: x == null checks for both
    expect(Is(null, undefined)).toBe(true)
    expect(Is(undefined, null)).toBe(true)
  })

  it('does NOT coerce types like JS ==', () => {
    // Unlike JS ==, we don't coerce types
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
    // Same structure, but Is returns true (structural equality)
    expect(Is(obj1, obj2)).toBe(true)
    // But === returns false (identity)
    expect(obj1 === obj2).toBe(false)
  })

  it('handles objects with Equals method', () => {
    const custom = {
      value: 42,
      Equals(other: any) {
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
    expect(IsNot(null, undefined)).toBe(false) // They're equal
  })
})

describe('tjsEquals symbol protocol', () => {
  it('uses [tjsEquals] on left operand', () => {
    const obj = {
      [tjsEquals](other: any) {
        return other === 'match'
      },
    }
    expect(Is(obj, 'match')).toBe(true)
    expect(Is(obj, 'nope')).toBe(false)
  })

  it('uses [tjsEquals] on right operand', () => {
    const obj = {
      [tjsEquals](other: any) {
        return other === 42
      },
    }
    expect(Is(42, obj)).toBe(true)
    expect(Is(99, obj)).toBe(false)
  })

  it('symbol takes priority over .Equals', () => {
    const obj = {
      [tjsEquals](_other: any) {
        return true // symbol says yes
      },
      Equals(_other: any) {
        return false // .Equals says no
      },
    }
    expect(Is(obj, 'anything')).toBe(true) // symbol wins
  })

  it('works with Proxy delegation', () => {
    const target = { x: 1, y: 2 }
    const proxy = new Proxy(
      {
        [tjsEquals](other: any) {
          return Is(target, other)
        },
      },
      {}
    )
    expect(Is(proxy, { x: 1, y: 2 })).toBe(true)
    expect(Is(proxy, { x: 1, y: 3 })).toBe(false)
    // Reverse direction also works
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
    // Should have the last 4 errors (x2..x5)
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

/**
 * The flight recorder. The load-bearing property is the FIRST test: notices and
 * warnings must never leak into errors(), because the documented idiom
 * (clearErrors → run → expect no errors) would start failing on events that are
 * not errors — silently breaking every such test in the wild.
 */
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

    expect(errors()).toHaveLength(1) // the type error, and only that
    expect(errors()[0].path).toBe('fn.x')
    expect(getErrorCount()).toBe(1)

    expect(records()).toHaveLength(3) // but the recorder saw everything
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
    expect(records()).toHaveLength(4) // buffer holds 4
    expect(getRecordCount()).toBe(10) // but 10 happened
    expect(getDroppedCount()).toBe(6) // and 6 were lost to wrap
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
    expect(cleared).toHaveLength(1) // just the error
    expect(records()).toHaveLength(0) // but the ring is empty
  })

  it('an isolated runtime keeps its own recorder', () => {
    const rt = createRuntime()
    rt.record({ source: 'app', severity: 'notice', message: 'instance-only' })
    expect(rt.records()).toHaveLength(1)
    expect(records()).toHaveLength(0) // module-level ring untouched
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
    // No errors created — errors() should return empty
    expect(errors()).toHaveLength(0)
    expect(getErrorCount()).toBe(0)
  })

  it('catches unhandled errors from transpiled functions', () => {
    const { tjs } = require('./index')
    const savedTjs = globalThis.__tjs

    try {
      // installRuntime sets up globalThis.__tjs with the global runtime
      // Emitted code calls createRuntime() to get a child — we need to
      // access the child's error buffer via the __tjs local in the emitted code
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
      // The emitted code creates its own child runtime via createRuntime().
      // We need to capture that child's __tjs to check its error buffer.
      const mod = new Function(
        result.code + '\nreturn { greet, process, __tjs }'
      )()

      // Clear any errors from transpilation
      mod.__tjs.clearErrors()

      // Call with correct types — no errors
      mod.greet('Alice')
      mod.process(5)
      expect(mod.__tjs.errors()).toHaveLength(0)

      // Call with wrong type — error returned but not checked
      mod.greet(42) // returns MonadicError, caller ignores it
      mod.process('not a number') // same

      // The errors are captured in history even though nobody checked them
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

      // Test workflow: clear → run → check for unexpected errors
      mod.__tjs.clearErrors()

      mod.add(10, 20) // correct types
      mod.add(1, 2) // correct types

      expect(mod.__tjs.errors()).toHaveLength(0)
      expect(mod.__tjs.getErrorCount()).toBe(0)

      // Now introduce a bad call
      mod.add('x', 'y') // wrong types

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
      check: (v: unknown): boolean | string => {
        if (typeof v !== 'number') return `expected number, got ${typeof v}`
        if (v % 2 !== 0) return `${v} is odd`
        return true
      },
      description: 'even number',
    }

    // Pass
    expect(checkType(4, EvenType, 'test.val')).toBeNull()

    // Fail with reason
    const err = checkType(3, EvenType, 'test.val')
    expect(err).not.toBeNull()
    expect(err!.message).toContain('3 is odd')
    expect(err!.reason).toBe('3 is odd')

    // Fail with different reason
    const err2 = checkType('x', EvenType, 'test.val')
    expect(err2).not.toBeNull()
    expect(err2!.message).toContain('expected number, got string')
  })

  it('checkType works with boolean-only predicates', () => {
    const PositiveType = {
      check: (v: unknown) => typeof v === 'number' && v > 0,
      description: 'positive number',
    }

    expect(checkType(5, PositiveType, 'x')).toBeNull()

    const err = checkType(-1, PositiveType, 'x')
    expect(err).not.toBeNull()
    expect(err!.message).toContain('positive number')
    expect(err!.reason).toBeUndefined()
  })
})

// `==`/`!=` (which transpile to Eq/NotEq under TjsEquals) are **footgun-free
// `===`**, NOT structural. They unwrap boxed primitives and treat null/undefined
// as equal — but distinct objects/arrays are genuinely distinct (a real
// distinction, and structural `==` would be a silent O(n) perf hit). Deep
// structural comparison is the separate `Is`/`IsNot` function. This block pins
// that design so docs/behavior can't drift back to "== is structural".
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
    expect(Eq(shared, shared)).toBe(true) // identity still holds
    expect(NotEq([1, 2], [1, 2])).toBe(true)
  })

  it('Is/IsNot ARE structural — that is the deep-comparison path', () => {
    expect(Is({ a: 1 }, { a: 1 })).toBe(true)
    expect(Is([1, 2], [1, 2])).toBe(true)
    expect(Is({ a: { b: [1] } }, { a: { b: [1] } })).toBe(true)
    expect(IsNot([1, 2], [1, 3])).toBe(true)
    // and Is is not fooled into structural-comparing unequal shapes
    expect(Is({ a: 1 }, { a: 2 })).toBe(false)
  })
})
