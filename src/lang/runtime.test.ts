/**
 * TJS Runtime Tests - Monadic Errors with Location Info
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import {
  isError,
  error,
  composeErrors,
  validateArgs,
  wrap,
  wrapClass,
  configure,
  getConfig,
  getStack,
  pushStack,
  popStack,
  enterUnsafe,
  exitUnsafe,
  isUnsafeMode,
  TJSError,
  SafeFunction,
  Eval,
  Type,
} from './runtime'

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
        function step1(x: number) {
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
      const fn = wrap((x: number) => x, {
        params: { x: { type: 'number', required: true } },
      })

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

      const fn = wrap((x: number) => 'not a number' as any, {
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

      const fn = wrap((x: number) => 'not a number' as any, {
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

      const fn = wrap((x: number) => 'wrong' as any, {
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

      const fn = wrap((x: number) => 'wrong' as any, {
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

describe('SafeFunction', () => {
  it('creates a typed async function', async () => {
    const add = await SafeFunction({
      inputs: { a: 0, b: 0 },
      output: 0,
      body: 'return a + b',
    })

    const result = await add(1, 2)
    expect(result).toBe(3)
  })

  it('validates input types', async () => {
    const add = await SafeFunction({
      inputs: { a: 0, b: 0 },
      output: 0,
      body: 'return a + b',
    })

    const result = await add('not a number', 2)
    expect(isError(result)).toBe(true)
    expect((result as TJSError).message).toContain('invalid input')
  })

  it('validates output type', async () => {
    const bad = await SafeFunction({
      inputs: { x: 0 },
      output: 0,
      body: 'return "not a number"',
    })

    const result = await bad(1)
    expect(isError(result)).toBe(true)
    expect((result as TJSError).message).toContain('invalid output')
  })

  it('supports async operations', async () => {
    const delayed = await SafeFunction({
      inputs: { x: 0 },
      output: 0,
      body: `
        await new Promise(r => setTimeout(r, 10))
        return x * 2
      `,
    })

    const result = await delayed(5)
    expect(result).toBe(10)
  })

  it('times out on long operations', async () => {
    const slow = await SafeFunction({
      inputs: {},
      output: 0,
      body: 'await new Promise(r => setTimeout(r, 1000)); return 1',
      timeoutMs: 50,
    })

    const result = await slow()
    expect(isError(result)).toBe(true)
    expect((result as TJSError).message).toContain('timeout')
  })

  it('injects capabilities', async () => {
    const mockFetch = async (url: string) => ({
      json: async () => ({ url, data: 'test' }),
    })

    const fetcher = await SafeFunction({
      inputs: { url: '' },
      output: { url: '', data: '' },
      body: 'return await fetch(url).then(r => r.json())',
      capabilities: { fetch: mockFetch },
    })

    const result = await fetcher('https://example.com')
    expect(result).toEqual({ url: 'https://example.com', data: 'test' })
  })

  it('works with RuntimeType inputs', async () => {
    const PositiveInt = Type(
      'positive integer',
      (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x > 0
    )

    const double = await SafeFunction({
      inputs: { n: PositiveInt },
      output: 0,
      body: 'return n * 2',
    })

    expect(await double(5)).toBe(10)
    expect(isError(await double(-1))).toBe(true)
    expect(isError(await double(1.5))).toBe(true)
  })
})

describe('Eval', () => {
  it('evaluates simple expressions', async () => {
    const result = await Eval({
      code: 'a + b',
      context: { a: 1, b: 2 },
      output: 0,
    })
    expect(result).toBe(3)
  })

  it('evaluates code with return statement', async () => {
    const result = await Eval({
      code: 'return a * b',
      context: { a: 3, b: 4 },
      output: 0,
    })
    expect(result).toBe(12)
  })

  it('validates output type', async () => {
    const result = await Eval({
      code: '"not a number"',
      context: {},
      output: 0,
    })
    expect(isError(result)).toBe(true)
    expect((result as TJSError).message).toContain('invalid output')
  })

  it('supports async operations', async () => {
    const result = await Eval({
      code: `
        await new Promise(r => setTimeout(r, 10))
        return x * 2
      `,
      context: { x: 5 },
      output: 0,
    })
    expect(result).toBe(10)
  })

  it('times out on long operations', async () => {
    const result = await Eval({
      code: 'await new Promise(r => setTimeout(r, 1000))',
      context: {},
      output: 0,
      timeoutMs: 50,
    })
    expect(isError(result)).toBe(true)
    expect((result as TJSError).message).toContain('timeout')
  })

  it('injects capabilities', async () => {
    const mockFetch = async (url: string) => ({
      json: async () => ({ fetched: url }),
    })

    const result = await Eval({
      code: 'await fetch(url).then(r => r.json())',
      context: { url: 'https://example.com' },
      output: { fetched: '' },
      capabilities: { fetch: mockFetch },
    })
    expect(result).toEqual({ fetched: 'https://example.com' })
  })

  it('handles errors gracefully', async () => {
    const result = await Eval({
      code: '(() => { throw new Error("oops") })()',
      context: {},
      output: 0,
    })
    expect(isError(result)).toBe(true)
    expect((result as TJSError).message).toContain('oops')
  })
})
