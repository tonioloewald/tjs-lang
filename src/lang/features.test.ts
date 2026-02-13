import { describe, it, expect } from 'bun:test'
import {
  tjs,
  extractTests,
  testUtils,
  isError,
  error,
  typeOf,
  validateArgs,
  wrap,
  lint,
  transpileToJS,
} from './index'
import { preprocess } from './parser'
import { createRuntime, isMonadicError } from './runtime'
import { Schema } from './schema'

describe('Schema callable', () => {
  describe('Schema(value) inference', () => {
    it('should infer string schema', () => {
      const schema = Schema('hello')
      expect(schema.schema.type).toBe('string')
      expect(schema.validate('world')).toBe(true)
      expect(schema.validate(42)).toBe(false)
    })

    it('should infer number schema (integer)', () => {
      const schema = Schema(42)
      expect(schema.schema.type).toBe('integer')
      expect(schema.validate(100)).toBe(true)
      expect(schema.validate('hello')).toBe(false)
    })

    it('should infer number schema (float)', () => {
      const schema = Schema(3.14)
      expect(schema.schema.type).toBe('number')
      expect(schema.validate(2.71)).toBe(true)
    })

    it('should infer boolean schema', () => {
      const schema = Schema(true)
      expect(schema.schema.type).toBe('boolean')
      expect(schema.validate(false)).toBe(true)
      expect(schema.validate('true')).toBe(false)
    })

    it('should infer null schema', () => {
      const schema = Schema(null)
      expect(schema.schema.type).toBe('null')
      expect(schema.validate(null)).toBe(true)
      expect(schema.validate(undefined)).toBe(false)
    })

    it('should infer undefined schema', () => {
      const schema = Schema(undefined)
      expect(schema.schema.type).toBe('null')
      expect(schema.schema['x-tjs-undefined']).toBe(true)
      expect(schema.validate(undefined)).toBe(true)
      expect(schema.validate(null)).toBe(false)
    })

    it('should infer array schema', () => {
      const schema = Schema([1, 2, 3])
      expect(schema.schema.type).toBe('array')
      expect(schema.schema.items.type).toBe('integer')
      expect(schema.validate([4, 5, 6])).toBe(true)
    })

    it('should infer object schema', () => {
      const schema = Schema({ name: 'Anne', age: 30 })
      expect(schema.schema.type).toBe('object')
      expect(schema.schema.properties.name.type).toBe('string')
      expect(schema.schema.properties.age.type).toBe('integer')
      expect(schema.validate({ name: 'Bob', age: 25 })).toBe(true)
    })
  })

  describe('Schema.type() - fixed typeof', () => {
    it('should return "null" for null', () => {
      expect(Schema.type(null)).toBe('null')
    })

    it('should return "undefined" for undefined', () => {
      expect(Schema.type(undefined)).toBe('undefined')
    })

    it('should return "array" for arrays', () => {
      expect(Schema.type([])).toBe('array')
      expect(Schema.type([1, 2, 3])).toBe('array')
    })

    it('should return "object" for objects', () => {
      expect(Schema.type({})).toBe('object')
      expect(Schema.type({ a: 1 })).toBe('object')
    })

    it('should return primitive types correctly', () => {
      expect(Schema.type('hello')).toBe('string')
      expect(Schema.type(42)).toBe('number')
      expect(Schema.type(true)).toBe('boolean')
    })
  })

  describe('Schema.* methods from tosijs-schema', () => {
    it('should have Schema.string', () => {
      expect(Schema.string.schema.type).toBe('string')
    })

    it('should have Schema.number', () => {
      expect(Schema.number.schema.type).toBe('number')
    })

    it('should have Schema.null', () => {
      expect(Schema.null.schema.type).toBe('null')
      expect(Schema.null.validate(null)).toBe(true)
    })

    it('should have Schema.undefined', () => {
      expect(Schema.undefined.validate(undefined)).toBe(true)
      expect(Schema.undefined.validate(null)).toBe(false)
    })

    it('should have Schema.object()', () => {
      const schema = Schema.object({
        name: Schema.string,
        age: Schema.number.optional,
      })
      expect(schema.validate({ name: 'Anne' })).toBe(true)
      expect(schema.validate({ name: 'Anne', age: 30 })).toBe(true)
      expect(schema.validate({})).toBe(false) // missing required name
    })

    it('should have Schema.array()', () => {
      const schema = Schema.array(Schema.string)
      expect(schema.validate(['a', 'b', 'c'])).toBe(true)
      expect(schema.validate([1, 2, 3])).toBe(false)
    })
  })
})

// Inline tests extraction
describe('Inline Tests', () => {
  it('should extract test blocks from source', () => {
    const result = extractTests(`
      function add(a, b) { return a + b }

      test('adds numbers') {
        assert(add(2, 3) === 5)
      }
    `)
    expect(result.tests.length).toBe(1)
    expect(result.tests[0].description).toBe('adds numbers')
    expect(result.tests[0].body).toContain('assert')
  })

  it('should remove tests from output code', () => {
    const result = extractTests(`
      function add(a, b) { return a + b }

      test('adds numbers') {
        assert(add(2, 3) === 5)
      }
    `)
    expect(result.code).toContain('function add')
    expect(result.code).not.toContain('test(')
  })

  it('should extract multiple tests', () => {
    const result = extractTests(`
      function math(a, b) { return a + b }

      test('adds') {
        assert(math(1, 2) === 3)
      }

      test('handles zero') {
        assert(math(0, 5) === 5)
      }
    `)
    expect(result.tests.length).toBe(2)
    expect(result.tests[0].description).toBe('adds')
    expect(result.tests[1].description).toBe('handles zero')
  })

  it('should extract mock blocks', () => {
    const result = extractTests(`
      function process(x) { return x }

      mock {
        const testData = [1, 2, 3]
      }

      test('uses mock') {
        assert(testData.length === 3)
      }
    `)
    expect(result.mocks.length).toBe(1)
    expect(result.mocks[0].body).toContain('testData')
  })

  it('should generate test runner code', () => {
    const result = extractTests(`
      function add(a, b) { return a + b }

      test('works') {
        assert(add(1, 1) === 2)
      }
    `)
    expect(result.testRunner).toContain('__results')
    expect(result.testRunner).toContain('passed')
    expect(result.testRunner).toContain('works')
  })

  it('should execute tests via concatenation', async () => {
    const result = extractTests(`
      function add(a, b) { return a + b }

      test('adds correctly') {
        assert(add(2, 3) === 5)
      }
    `)
    // Concatenate code + assert + testRunner (returns a Promise)
    const assertFn = `function assert(c, m) { if (!c) throw new Error(m || 'fail') }`
    const fullCode = `${result.code}\n${assertFn}\nreturn ${result.testRunner}`

    const fn = new Function(fullCode)
    const summary = await fn()
    expect(summary.passed).toBe(1)
    expect(summary.failed).toBe(0)
  })

  it('should handle async tests', async () => {
    const result = extractTests(`
      async function fetchData() {
        await Promise.resolve()
        return 42
      }

      test('async works') {
        const val = await fetchData()
        assert(val === 42)
      }
    `)
    const assertFn = `function assert(c, m) { if (!c) throw new Error(m || 'fail') }`
    const fullCode = `${result.code}\n${assertFn}\nreturn ${result.testRunner}`

    const fn = new Function(fullCode)
    const summary = await fn()
    expect(summary.passed).toBe(1)
    expect(summary.failed).toBe(0)
  })

  it('should support expect().toBe() API', async () => {
    const result = extractTests(`
      function add(a, b) { return a + b }

      test('expect API works') {
        expect(add(2, 3)).toBe(5)
        expect({ a: 1 }).toEqual({ a: 1 })
        expect([1, 2, 3]).toContain(2)
      }
    `)
    const fullCode = `${result.code}\n${testUtils}\nreturn ${result.testRunner}`

    const fn = new Function(fullCode)
    const summary = await fn()
    expect(summary.passed).toBe(1)
    expect(summary.failed).toBe(0)
  })

  it('should give meaningful error messages', async () => {
    // NOTE: This test creates a failing inner test to verify error messages work correctly
    const result = extractTests(`
      function getValue() { return 42 }

      test('inner test expected to fail') {
        expect(getValue()).toBe(99)
      }
    `)
    const fullCode = `${result.code}\n${testUtils}\nreturn ${result.testRunner}`

    const fn = new Function(fullCode)
    const summary = await fn()
    // The inner test should fail (42 !== 99), and we verify the error message format
    expect(summary.failed).toBe(1)
    expect(summary.results[0].error).toContain('Expected 99')
    expect(summary.results[0].error).toContain('got 42')
  })

  it('should support canonical TJS test syntax without parentheses', () => {
    const result = extractTests(`
      function double(x) { return x * 2 }

      test 'doubles numbers' {
        expect(double(5)).toBe(10)
      }
    `)
    expect(result.tests.length).toBe(1)
    expect(result.tests[0].description).toBe('doubles numbers')
  })

  it('should support anonymous test blocks', () => {
    const result = extractTests(`
      function add(a, b) { return a + b }

      test {
        expect(add(1, 2)).toBe(3)
      }

      test {
        expect(add(0, 0)).toBe(0)
      }
    `)
    expect(result.tests.length).toBe(2)
    expect(result.tests[0].description).toBe('test 1')
    expect(result.tests[1].description).toBe('test 2')
  })

  it('should extract tests from anywhere in source (tests are "sucked" to bottom)', () => {
    const result = extractTests(`
      test 'early test' {
        expect(add(1, 1)).toBe(2)
      }

      function add(a, b) { return a + b }

      test 'late test' {
        expect(add(2, 2)).toBe(4)
      }
    `)
    // Both tests extracted
    expect(result.tests.length).toBe(2)
    expect(result.tests[0].description).toBe('early test')
    expect(result.tests[1].description).toBe('late test')
    // Clean code has function but no tests
    expect(result.code).toContain('function add')
    expect(result.code).not.toContain('test')
  })

  it('should extract embedded tests from block comments (TS compatibility)', () => {
    // This syntax survives TypeScript compilation - tests live in comments
    const result = extractTests(`
      function add(a: number, b: number): number {
        return a + b
      }

      /*test 'adds two numbers' {
        expect(add(2, 3)).toBe(5)
      }*/

      /*test 'handles negatives' {
        expect(add(-1, 1)).toBe(0)
      }*/
    `)
    expect(result.tests.length).toBe(2)
    expect(result.tests[0].description).toBe('adds two numbers')
    expect(result.tests[0].body).toContain('expect(add(2, 3)).toBe(5)')
    expect(result.tests[1].description).toBe('handles negatives')
  })

  it('should extract anonymous embedded tests', () => {
    const result = extractTests(`
      function double(x: number): number { return x * 2 }

      /*test {
        expect(double(5)).toBe(10)
      }*/
    `)
    expect(result.tests.length).toBe(1)
    expect(result.tests[0].description).toBe('embedded test 1')
  })

  it('should combine embedded and regular tests', () => {
    const result = extractTests(`
      function add(a, b) { return a + b }

      /*test 'embedded test' {
        expect(add(1, 1)).toBe(2)
      }*/

      test 'regular test' {
        expect(add(2, 2)).toBe(4)
      }
    `)
    expect(result.tests.length).toBe(2)
    expect(result.tests[0].description).toBe('embedded test')
    expect(result.tests[1].description).toBe('regular test')
  })
})

// Runtime monadic type checking tests
describe('TJS Runtime', () => {
  describe('isError', () => {
    it('should identify TJS errors', () => {
      expect(isError({ $error: true, message: 'test' })).toBe(true)
      expect(isError({ message: 'not an error' })).toBe(false)
      expect(isError(null)).toBe(false)
      expect(isError(undefined)).toBe(false)
      expect(isError('string')).toBe(false)
    })
  })

  describe('typeOf', () => {
    it('should handle null correctly (unlike typeof)', () => {
      expect(typeOf(null)).toBe('null')
    })

    it('should identify arrays (unlike typeof)', () => {
      expect(typeOf([])).toBe('array')
      expect(typeOf([1, 2, 3])).toBe('array')
    })

    it('should handle other types', () => {
      expect(typeOf(undefined)).toBe('undefined')
      expect(typeOf('hello')).toBe('string')
      expect(typeOf(42)).toBe('number')
      expect(typeOf(true)).toBe('boolean')
      expect(typeOf({})).toBe('object')
    })
  })

  describe('validateArgs', () => {
    it('should pass valid args', () => {
      const meta = {
        params: {
          name: { type: 'string', required: true },
          age: { type: 'number', required: false },
        },
      }
      const result = validateArgs({ name: 'Alice', age: 30 }, meta)
      expect(result).toBe(null)
    })

    it('should error on missing required param', () => {
      const meta = {
        params: {
          name: { type: 'string', required: true },
        },
      }
      const result = validateArgs({}, meta)
      expect(isError(result)).toBe(true)
      expect(result?.message).toContain('Missing required')
    })

    it('should error on wrong type', () => {
      const meta = {
        params: {
          count: { type: 'number', required: true },
        },
      }
      const result = validateArgs({ count: 'not a number' }, meta)
      expect(isError(result)).toBe(true)
      expect(result?.message).toContain('Expected number')
    })

    it('should propagate error inputs', () => {
      const meta = {
        params: {
          value: { type: 'number', required: true },
        },
      }
      const inputError = error('upstream failure')
      const result = validateArgs({ value: inputError }, meta)
      expect(result).toBe(inputError) // Same error passed through
    })
  })

  describe('wrap', () => {
    it('should wrap function with validation', () => {
      const add = (a: number, b: number) => a + b
      const meta = {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
        returns: { type: 'number' },
      }
      const wrappedAdd = wrap(add, meta)

      // Valid call works
      expect(wrappedAdd(2, 3)).toBe(5)
    })

    it('should return error for invalid args', () => {
      const add = (a: number, b: number) => a + b
      const meta = {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
      }
      const wrappedAdd = wrap(add, meta)

      const result = wrappedAdd('not a number' as any, 3)
      expect(isError(result)).toBe(true)
    })

    it('should propagate error inputs without calling function', () => {
      let called = false
      const fn = (x: number) => {
        called = true
        return x * 2
      }
      const meta = {
        params: { x: { type: 'number', required: true } },
      }
      const wrapped = wrap(fn, meta)

      const inputError = error('upstream error')
      const result = wrapped(inputError as any)

      expect(isError(result)).toBe(true)
      expect(called).toBe(false) // Function was NOT called
      expect(result).toBe(inputError) // Same error passed through
    })

    it('should convert thrown errors to TJS errors', () => {
      const fn = () => {
        throw new Error('kaboom')
      }
      const meta = { params: {} }
      const wrapped = wrap(fn, meta)

      const result = wrapped()
      expect(isError(result)).toBe(true)
      expect(result.message).toBe('kaboom')
    })
  })

  describe('error propagation chain', () => {
    it('should propagate errors through call chain', () => {
      const step1 = wrap(
        (x: number) => (x < 0 ? error('negative input') : x * 2),
        { params: { x: { type: 'number', required: true } } }
      )

      const step2 = wrap((y: number) => y + 10, {
        params: { y: { type: 'number', required: true } },
      })

      // Valid chain
      expect(step2(step1(5))).toBe(20)

      // Error in step1 propagates through step2
      const result = step2(step1(-1) as any)
      expect(isError(result)).toBe(true)
      expect(result.message).toBe('negative input')
    })
  })
})

// Linter tests
describe('Linter', () => {
  it('should detect unused variables', () => {
    const result = lint(`
      function test(x: 0) {
        const unused = 5
        return x
      }
    `)
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0].rule).toBe('no-unused-vars')
    expect(result.diagnostics[0].message).toContain('unused')
  })

  it('should not warn for used variables', () => {
    const result = lint(`
      function test(x: 0) {
        const y = x + 1
        return y
      }
    `)
    const unusedWarnings = result.diagnostics.filter(
      (d) => d.rule === 'no-unused-vars'
    )
    expect(unusedWarnings.length).toBe(0)
  })

  it('should detect unreachable code', () => {
    const result = lint(`
      function test(x: 0) {
        return x
        const dead = 5
      }
    `)
    const unreachable = result.diagnostics.filter(
      (d) => d.rule === 'no-unreachable'
    )
    expect(unreachable.length).toBeGreaterThan(0)
  })

  it('should ignore variables prefixed with _', () => {
    const result = lint(`
      function test(_unused: 0, x: 0) {
        return x
      }
    `)
    const unusedWarnings = result.diagnostics.filter(
      (d) => d.rule === 'no-unused-vars'
    )
    expect(unusedWarnings.length).toBe(0)
  })

  it('should report parse errors', () => {
    const result = lint(`function broken( {`)
    expect(result.valid).toBe(false)
    expect(result.diagnostics[0].rule).toBe('parse-error')
  })
})

// NOTE: unsafe {} blocks have been removed - they provided no performance benefit
// because the wrapper decision is made at transpile time. Use (!) on functions instead.
// See ideas parking lot for potential future approaches.

// safety syntax tests
describe('module-level safety directive', () => {
  it('should parse safety none', () => {
    const { preprocess } = require('./parser')
    const result = preprocess(`safety none

function greet(name: 'World') {
  return 'Hello, ' + name
}`)

    expect(result.moduleSafety).toBe('none')
    expect(result.source).not.toContain('safety none')
    expect(result.source).toContain('function greet')
  })

  it('should parse safety inputs', () => {
    const { preprocess } = require('./parser')
    const result = preprocess(`safety inputs

function greet(name: 'World') {
  return 'Hello, ' + name
}`)

    expect(result.moduleSafety).toBe('inputs')
  })

  it('should parse safety all', () => {
    const { preprocess } = require('./parser')
    const result = preprocess(`safety all

function greet(name: 'World') {
  return 'Hello, ' + name
}`)

    expect(result.moduleSafety).toBe('all')
  })

  it('should allow comments before safety directive', () => {
    const { preprocess } = require('./parser')
    const result = preprocess(`// Module configuration
/* Multi-line
   comment */
safety none

function greet(name: 'World') {
  return 'Hello, ' + name
}`)

    expect(result.moduleSafety).toBe('none')
  })

  it('should not match safety in wrong position', () => {
    const { preprocess } = require('./parser')
    const result = preprocess(`function greet(name: 'World') {
  const safety = 'none'  // This is just a variable
  return 'Hello, ' + name
}`)

    expect(result.moduleSafety).toBeUndefined()
  })

  it('safety none should skip validation code in output', () => {
    // With safety (default) - should have validation
    const safe = tjs(`function add(a: 0, b: 0) -> 0 { return a + b }`)
    expect(safe.code).toContain('__tjs.typeError')
    expect(safe.code).toContain('__tjs.pushStack')
    expect(safe.code).toContain("typeof a !== 'number'")

    // Without safety - should NOT have validation
    const unsafe = tjs(`safety none
function add(a: 0, b: 0) -> 0 { return a + b }`)
    expect(unsafe.code).not.toContain('__tjs.typeError')
    expect(unsafe.code).not.toContain('__tjs.pushStack')
    expect(unsafe.code).not.toContain("typeof a !== 'number'")
    // Should still have metadata
    expect(unsafe.code).toContain('add.__tjs')
    expect(unsafe.code).toContain('"unsafe": true')
  })

  it('safety none should work with multiple functions', () => {
    const result = tjs(`safety none
function add(a: 0, b: 0) -> 0 { return a + b }
function multiply(a: 0, b: 0) -> 0 { return a * b }`)

    // No validation for either function
    expect(result.code).not.toContain('__tjs.typeError')
    expect(result.code).not.toContain('__tjs.pushStack')
    // Both have metadata
    expect(result.code).toContain('add.__tjs')
    expect(result.code).toContain('multiply.__tjs')
  })
})

describe('unsafe function marker (!)', () => {
  it('(!) should skip validation for that function only', () => {
    const result = tjs(`
function safeAdd(a: 0, b: 0) -> 0 { return a + b }
function unsafeAdd(! a: 0, b: 0) -> 0 { return a + b }
`)
    // Safe function has validation
    expect(result.code).toContain('__tjs.pushStack')
    expect(result.code).toContain('__tjs.typeError')

    // Check the unsafe function body doesn't have validation
    // The unsafeAdd function should just be: function unsafeAdd(a = 0,b = 0) { return a + b }
    const unsafeMatch = result.code.match(
      /function unsafeAdd\([^)]+\)\s*\{([^}]+)\}/
    )
    expect(unsafeMatch).toBeTruthy()
    const unsafeBody = unsafeMatch![1]
    expect(unsafeBody).not.toContain('__tjs.typeError')
    expect(unsafeBody).not.toContain('__tjs.pushStack')

    // Metadata marks it as unsafe
    expect(result.code).toContain('unsafeAdd.__tjs')
  })

  it('(!) function metadata should have unsafe: true', () => {
    const result = tjs(`function fast(! x: 0) -> 0 { return x * 2 }`)
    expect(result.code).toContain('"unsafe": true')
  })
})

describe('safe vs unsafe comparison', () => {
  it('safe function should have validation, unsafe should not', () => {
    // Safe function (default)
    const safe = tjs(`function double(x: 0) -> 0 { return x * 2 }`)
    expect(safe.code).toContain("typeof x !== 'number'")
    expect(safe.code).toContain('__tjs.typeError')

    // Unsafe via (!) marker
    const unsafeMarker = tjs(`function double(! x: 0) -> 0 { return x * 2 }`)
    expect(unsafeMarker.code).not.toContain("typeof x !== 'number'")
    expect(unsafeMarker.code).not.toContain('__tjs.typeError')

    // Unsafe via safety none
    const unsafeModule = tjs(`safety none
function double(x: 0) -> 0 { return x * 2 }`)
    expect(unsafeModule.code).not.toContain("typeof x !== 'number'")
    expect(unsafeModule.code).not.toContain('__tjs.typeError')
  })

  it('both (!) and safety none should produce equivalent unsafe output', () => {
    const viaMarker = tjs(`function add(! a: 0, b: 0) -> 0 { return a + b }`)
    const viaDirective = tjs(`safety none
function add(a: 0, b: 0) -> 0 { return a + b }`)

    // Both should lack validation
    expect(viaMarker.code).not.toContain('__tjs.pushStack')
    expect(viaDirective.code).not.toContain('__tjs.pushStack')

    // Both should have unsafe metadata
    expect(viaMarker.code).toContain('"unsafe": true')
    expect(viaDirective.code).toContain('"unsafe": true')
  })
})

describe('safe function syntax (?)', () => {
  it('should parse (?) function marker', () => {
    const result = tjs(`
      function validated(? x: 0) -> 0 {
        return x * 2
      }
    `)

    expect(result.code).toContain('validated.__tjs')
    expect(result.code).toContain('"safe": true')
  })

  it('should work with arrow functions', () => {
    // Note: arrow function safe marker is converted to a comment for now
    const { preprocess } = require('./parser')
    const processed = preprocess('const fn = (? x) => x * 2')
    expect(processed.source).toContain('/* safe */')
  })
})

describe('try-without-catch (monadic errors)', () => {
  it('should transform try without catch to return monadic error', () => {
    const { preprocess } = require('./parser')
    const result = preprocess(`
function parse(s: '') {
  try {
    return JSON.parse(s)
  }
}
`)
    // Should add a catch block that returns monadic error
    expect(result.source).toContain('catch (__try_err)')
    expect(result.source).toContain('$error: true')
    expect(result.source).toContain('__try_err?.message')
  })

  it('should NOT transform try with existing catch', () => {
    const { preprocess } = require('./parser')
    const result = preprocess(`
function parse(s: '') {
  try {
    return JSON.parse(s)
  } catch (e) {
    return null
  }
}
`)
    // Should keep original catch, not add __try_err
    expect(result.source).toContain('catch (e)')
    expect(result.source).not.toContain('__try_err')
  })

  it('should NOT transform try with finally', () => {
    const { preprocess } = require('./parser')
    const result = preprocess(`
function cleanup(s: '') {
  try {
    return JSON.parse(s)
  } finally {
    console.log('done')
  }
}
`)
    // Should keep original finally, not add __try_err
    expect(result.source).toContain('finally')
    expect(result.source).not.toContain('__try_err')
  })

  it('should work in transpiled TJS code', () => {
    // Use runTests: false because the signature example '' returns monadic error
    const result = tjs(
      `
function safeParse(s: '') {
  try {
    return JSON.parse(s)
  }
}
`,
      { runTests: false }
    )
    // The transpiled code should have the monadic error catch
    expect(result.code).toContain('catch (__try_err)')
    expect(result.code).toContain('$error: true')
  })

  it('monadic error should have proper structure', () => {
    const { preprocess } = require('./parser')
    const result = preprocess(`
function test() {
  try { throw new Error('oops') }
}
`)
    // Check error structure
    expect(result.source).toContain("op: 'try'")
    expect(result.source).toContain('cause: __try_err')
    // Should capture call stack for debugging
    expect(result.source).toContain('stack: globalThis.__tjs?.getStack?.()')
  })
})

describe('return type safety arrows', () => {
  it('should parse -> as normal return type', () => {
    const result = tjs(`
      function add(a: 0, b: 0) -> 0 {
        return a + b
      }
    `)

    expect(result.code).toContain('"returns"')
    expect(result.code).not.toContain('"safeReturn"')
    expect(result.code).not.toContain('"unsafeReturn"')
  })

  it('should parse -? as safe return (force output validation)', () => {
    const result = tjs(`
      function add(a: 0, b: 0) -? 0 {
        return a + b
      }
    `)

    expect(result.code).toContain('"returns"')
    expect(result.code).toContain('"safeReturn": true')
  })

  it('should parse -! as unsafe return (skip output validation)', () => {
    const result = tjs(`
      function add(a: 0, b: 0) -! 0 {
        return a + b
      }
    `)

    expect(result.code).toContain('"returns"')
    expect(result.code).toContain('"unsafeReturn": true')
  })

  it('should combine (?) with -? for fully safe function', () => {
    const result = tjs(`
      function critical(? x: 0) -? 0 {
        return x * 2
      }
    `)

    expect(result.code).toContain('"safe": true')
    expect(result.code).toContain('"safeReturn": true')
  })

  it('should combine (!) with -! for fully unsafe function', () => {
    const result = tjs(`
      function fast(! x: 0) -! 0 {
        return x * 2
      }
    `)

    expect(result.code).toContain('"unsafe": true')
    expect(result.code).toContain('"unsafeReturn": true')
  })
})

describe('signature tests (transpile-time)', () => {
  // Return type grammar:
  // ->  'example' = transpile-time test only (default)
  // -?  'example' = transpile-time test + runtime output validation
  // -!  'example' = skip test entirely

  it('-> should run signature test at transpile time', () => {
    const result = tjs(`
      function double(x: 5) -> 10 {
        return x * 2
      }
    `)
    expect(result.testResults).toHaveLength(1)
    expect(result.testResults![0].passed).toBe(true)
    expect(result.testResults![0].isSignatureTest).toBe(true)
  })

  it('-> should fail if return type is wrong', () => {
    // Signature test checks TYPE, not value
    // double(5) returns 10 (number), but pattern expects string
    expect(() =>
      tjs(`
        function double(x: 5) -> "" {
          return x * 2
        }
      `)
    ).toThrow(/Expected string/)
  })

  it('-? should run signature test at transpile time', () => {
    const result = tjs(`
      function double(x: 5) -? 10 {
        return x * 2
      }
    `)
    expect(result.testResults).toHaveLength(1)
    expect(result.testResults![0].passed).toBe(true)
  })

  it('-? should pass if return type matches (type pattern, not value)', () => {
    // 999 is a number pattern, double(5) returns 10 which is a number - passes
    const result = tjs(`
      function double(x: 5) -? 0 {
        return x * 2
      }
    `)
    expect(result.testResults![0].passed).toBe(true)
  })

  it('-? should fail if return type mismatches', () => {
    expect(() =>
      tjs(`
        function getString(x: 5) -? "" {
          return x * 2
        }
      `)
    ).toThrow(/Expected string/)
  })

  it('-! should skip signature test entirely', () => {
    // This would fail if tested, but -! skips the test
    const result = tjs(`
      function double(x: 5) -! 999 {
        return x * 2
      }
    `)
    expect(result.testResults).toHaveLength(0)
  })

  it('-> with object return should test structure', () => {
    const result = tjs(`
      function getPoint(x: 3, y: 4) -> { x: 3, y: 4 } {
        return { x, y }
      }
    `)
    expect(result.testResults![0].passed).toBe(true)
  })

  it('-> with object return should pass when types match (not values)', () => {
    // {x: 0, y: 0} is a type pattern for {x: number, y: number}
    // getPoint(3, 4) returns {x: 3, y: 4} which matches the pattern
    const result = tjs(`
      function getPoint(x: 3, y: 4) -> { x: 0, y: 0 } {
        return { x, y }
      }
    `)
    expect(result.testResults![0].passed).toBe(true)
  })

  it('-> with object return should fail on type mismatch', () => {
    expect(() =>
      tjs(`
        function getPoint(x: 3, y: 4) -> { x: "", y: "" } {
          return { x, y }
        }
      `)
    ).toThrow(/Expected string/)
  })

  it('should skip signature tests for async functions', () => {
    const result = tjs(
      `
      async function fetchData(id: 'test-1') -> { name: '', id: '' } {
        return { name: 'Test', id }
      }
    `,
      { runTests: 'report' }
    )
    // Async signature test should be skipped (passed = true, not errored)
    expect(result.testResults).toHaveLength(1)
    expect(result.testResults![0].passed).toBe(true)
    expect(result.testResults![0].description).toContain('fetchData')
  })

  it('should handle top-level await in module code during tests', () => {
    const result = tjs(
      `
      function double(x: 5) -> 10 {
        return x * 2
      }

      async function fetchThing(id: '') -> '' {
        return id
      }

      await fetchThing('test')
    `,
      { runTests: 'report' }
    )
    // double's signature test should pass, fetchThing's should be skipped
    expect(result.testResults).toHaveLength(2)
    const doubleTest = result.testResults!.find((t: any) =>
      t.description.includes('double')
    )
    expect(doubleTest?.passed).toBe(true)
  })

  it('should skip tests gracefully when imports are unresolved (module-level)', () => {
    const result = tjs(
      `
      import { Schema } from 'tosijs-schema'

      const UserSchema = Schema({ name: '', age: 0 })

      function validateUser(data: { name: '', age: 0 }) -> { valid: true, errors: [''] } {
        return { valid: true, errors: [] }
      }
    `,
      { runTests: 'report' }
    )
    // Should have a signature test result that's skipped (passed), not failed
    expect(result.testResults).toBeDefined()
    const sigTest = result.testResults!.find((t: any) =>
      t.description.includes('validateUser')
    )
    expect(sigTest).toBeDefined()
    expect(sigTest?.passed).toBe(true)
    expect(sigTest?.error).toBeUndefined()
  })

  it('should skip tests gracefully when imports are unresolved (function-level)', () => {
    const result = tjs(
      `
      import { parseISO, format } from 'date-fns'

      function formatDate(date: '2024-01-15', pattern: 'yyyy-MM-dd') -> '' {
        const parsed = parseISO(date)
        return format(parsed, pattern)
      }
    `,
      { runTests: 'report' }
    )
    expect(result.testResults).toBeDefined()
    const sigTest = result.testResults!.find((t: any) =>
      t.description.includes('formatDate')
    )
    expect(sigTest).toBeDefined()
    expect(sigTest?.passed).toBe(true)
    expect(sigTest?.error).toBeUndefined()
  })

  it('should test sync functions alongside async functions', () => {
    const result = tjs(
      `
      function add(a: 2, b: 3) -> 5 {
        return a + b
      }

      async function fetchSum(a: 0, b: 0) -> 0 {
        return a + b
      }
    `,
      { runTests: 'report' }
    )
    // add should have a real test, fetchSum should be skipped
    expect(result.testResults).toHaveLength(2)
    const addTest = result.testResults!.find((t: any) =>
      t.description.includes('add')
    )
    expect(addTest?.passed).toBe(true)
  })
})

describe('inline validation', () => {
  it('should generate inline validation for single-arg object types', () => {
    const result = tjs(`
function process(input: { x: 0, y: 0, name: 'test' }) {
  return input.x + input.y
}`)

    // Should have inline validation (no wrapper)
    expect(result.code).not.toContain('_original_process')
    expect(result.code).toContain("typeof input !== 'object'")
    // Should have __tjs metadata
    expect(result.code).toContain('process.__tjs')
  })

  it('should generate inline validation for multi-arg functions', () => {
    const result = tjs(`
function add(x: 0, y: 0) {
  return x + y
}`)

    // Should have inline validation (no wrapper)
    expect(result.code).not.toContain('_original_add')
    expect(result.code).toContain("typeof x !== 'number'")
    expect(result.code).toContain("typeof y !== 'number'")
    // And should have metadata
    expect(result.code).toContain('add.__tjs')
  })

  it('should not generate inline wrapper for unsafe functions', () => {
    const result = tjs(`
function fast(! input: { x: 0 }) {
  return input.x
}`)

    // Should NOT have inline wrapper (marked unsafe)
    expect(result.code).not.toContain('_original_fast')
  })

  it('should validate correctly at runtime', () => {
    // Install runtime for MonadicError
    const { installRuntime } = require('./runtime')
    installRuntime()

    const result = tjs(`
function process(input: { x: 0, y: 0 }) {
  return input.x + input.y
}`)

    const fn = new Function(`${result.code}; return process`)()

    // Valid input
    expect(fn({ x: 1, y: 2 })).toBe(3)

    // Null input should fail (inline validation checks typeof object)
    const nullInput = fn(null)
    expect(nullInput).toBeInstanceOf(Error)

    // Non-object should fail
    const nonObject = fn('not an object')
    expect(nonObject).toBeInstanceOf(Error)

    // Array should fail (arrays are objects but not valid here)
    const arrayInput = fn([1, 2])
    expect(arrayInput).toBeInstanceOf(Error)
  })
})

describe('WASM blocks', () => {
  it('should parse simple wasm block', () => {
    const result = preprocess(`
function double(arr: []) {
  wasm {
    for (let i = 0; i < arr.length; i++) {
      arr[i] *= 2
    }
    return arr
  }
}`)

    // Should have extracted the WASM block
    expect(result.wasmBlocks.length).toBe(1)
    expect(result.wasmBlocks[0].id).toBe('__tjs_wasm_0')
    expect(result.wasmBlocks[0].body).toContain('arr[i] *= 2')
    // arr should be auto-captured
    expect(result.wasmBlocks[0].captures).toContain('arr')
  })

  it('should parse wasm block with explicit fallback', () => {
    const result = preprocess(`
function transform(data: []) {
  return wasm {
    return data
  } fallback {
    return data.slice()
  }
}`)

    expect(result.wasmBlocks[0].body).toContain('return data')
    expect(result.wasmBlocks[0].fallback).toContain('data.slice()')
  })

  it('should generate runtime dispatch code', () => {
    const result = preprocess(`
function transform(data: []) {
  return wasm {
    return data
  }
}`)

    // Should replace wasm block with dispatch
    expect(result.source).toContain('globalThis.__tjs_wasm_0')
    expect(result.source).not.toContain('wasm {')
  })

  it('should auto-capture variables from scope', () => {
    const result = preprocess(`
function compute(x: 0, y: 0) {
  const multiplier = 2
  return wasm {
    return x * y * multiplier
  }
}`)

    // x, y, multiplier should be captured
    expect(result.wasmBlocks[0].captures).toContain('x')
    expect(result.wasmBlocks[0].captures).toContain('y')
    expect(result.wasmBlocks[0].captures).toContain('multiplier')
    // Dispatch should pass captures
    expect(result.source).toContain('__tjs_wasm_0(multiplier, x, y)')
  })

  it('should not capture locally declared variables', () => {
    const result = preprocess(`
function loop(arr: []) {
  wasm {
    let sum = 0
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i]
    }
    return sum
  }
}`)

    // arr is captured, but sum and i are declared locally
    expect(result.wasmBlocks[0].captures).toContain('arr')
    expect(result.wasmBlocks[0].captures).not.toContain('sum')
    expect(result.wasmBlocks[0].captures).not.toContain('i')
  })

  it('should handle multiple wasm blocks', () => {
    const result = preprocess(`
function process(a: [], b: []) {
  const x = wasm {
    return a
  }

  const y = wasm {
    return b
  }

  return [x, y]
}`)

    expect(result.wasmBlocks.length).toBe(2)
    expect(result.wasmBlocks[0].id).toBe('__tjs_wasm_0')
    expect(result.wasmBlocks[1].id).toBe('__tjs_wasm_1')
    expect(result.source).toContain('globalThis.__tjs_wasm_0')
    expect(result.source).toContain('globalThis.__tjs_wasm_1')
  })

  it('should compile WASM at transpile time and embed in output', async () => {
    const { installRuntime } = require('./runtime')
    installRuntime()

    const result = tjs(`
function double(x: 0, y: 0) {
  return wasm {
    return x * y + x
  }
}`)

    // WASM should be compiled at transpile time
    expect(result.wasmCompiled).toBeDefined()
    expect(result.wasmCompiled?.length).toBe(1)
    expect(result.wasmCompiled?.[0].success).toBe(true)
    expect(result.wasmCompiled?.[0].byteLength).toBeGreaterThan(0)

    // Output should contain base64-encoded WASM
    expect(result.code).toContain('__wasmBlocks')
    expect(result.code).toContain('b64:')

    // Execute with async function to allow WASM instantiation
    const fn = new Function(
      'return (async () => {' + result.code + '; return double(3, 4); })()'
    )
    expect(await fn()).toBe(15) // 3 * 4 + 3 = 15
  })

  it('should use WASM compute function when instantiated', async () => {
    const { installRuntime } = require('./runtime')
    installRuntime()

    const result = tjs(`
function compute(a: 0, b: 0) {
  return wasm {
    return a + b
  }
}`)

    // Execute async to allow WASM instantiation
    const fn = new Function(
      'return (async () => {' + result.code + '; return compute(3, 4); })()'
    )
    // Should use the actual WASM version
    expect(await fn()).toBe(7) // 3 + 4 = 7
  })

  it('should use explicit fallback when WASM compilation fails', () => {
    // Test with code that can't compile to WASM (array.map)
    const result = tjs(`
function transform(arr: []) {
  return wasm {
    return arr.map(x => x * 2)
  } fallback {
    return arr.map(x => x * 2)
  }
}`)

    // WASM compilation should fail (array.map not supported)
    expect(result.wasmCompiled?.[0].success).toBe(false)

    // But code should still work using fallback
    const { installRuntime } = require('./runtime')
    installRuntime()
    const fn = new Function(`${result.code}; return transform([1, 2, 3]);`)
    expect(fn()).toEqual([2, 4, 6])
  })

  it('should not capture words from comments', () => {
    const result = preprocess(`
function updateStars(xs: Float32Array, zs: Float32Array) {
  wasm {
    // Reset stars that pass camera
    for (let i = 0; i < 10; i++) {
      zs[i] -= 1.0
    }
  } fallback {
    for (let i = 0; i < 10; i++) {
      zs[i] -= 1
    }
  }
}`)

    // Should NOT capture "Reset", "stars", "that", "pass", "camera" from comment
    expect(result.wasmBlocks[0].captures).not.toContain('Reset')
    expect(result.wasmBlocks[0].captures).not.toContain('stars')
    expect(result.wasmBlocks[0].captures).not.toContain('camera')
    // Should capture actual variables
    expect(result.wasmBlocks[0].captures).toContain('zs: Float32Array')
  })

  it('should handle typed array captures from function parameters', () => {
    const result = preprocess(`
function move(xs: Float32Array, ys: Float32Array, len: 0, speed: 0.0) {
  wasm {
    for (let i = 0; i < len; i++) {
      xs[i] += speed
    }
  } fallback {
    for (let i = 0; i < len; i++) {
      xs[i] += speed
    }
  }
}`)

    // Should include type annotations for typed arrays
    expect(result.wasmBlocks[0].captures).toContain('xs: Float32Array')
    // Numeric example types (0, 0.0) are captured as bare names - WASM compiler infers f64
    expect(result.wasmBlocks[0].captures).toContain('len')
    expect(result.wasmBlocks[0].captures).toContain('speed')
  })
})

describe('SyntaxError formatting', () => {
  it('formatWithContext shows error with source context', () => {
    try {
      transpileToJS(`function foo() {
  const x = 1
  return x +
}`)
      expect.unreachable('Should have thrown')
    } catch (e: any) {
      expect(e.name).toBe('SyntaxError')
      expect(typeof e.formatWithContext).toBe('function')

      const formatted = e.formatWithContext(1)
      expect(formatted).toContain('return x +')
      expect(formatted).toContain('^')
      expect(formatted).toContain('>') // error line marker
    }
  })

  it('formatWithContext handles single-line errors', () => {
    try {
      transpileToJS(`function foo() { return + }`)
      expect.unreachable('Should have thrown')
    } catch (e: any) {
      const formatted = e.formatWithContext(0)
      expect(formatted).toContain('function foo')
      expect(formatted).toContain('^')
    }
  })
})
