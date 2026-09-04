/* tjs <- input.ts */

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
} from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { preprocess } from '/Users/tonioloewald/tjs-lang/src/lang/parser'

import { isMonadicError } from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

import { Schema } from '/Users/tonioloewald/tjs-lang/src/lang/schema'

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
      expect(schema.validate({})).toBe(false)
    })
    it('should have Schema.array()', () => {
      const schema = Schema.array(Schema.string)
      expect(schema.validate(['a', 'b', 'c'])).toBe(true)
      expect(schema.validate([1, 2, 3])).toBe(false)
    })
  })
})

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
  it('should extract test descriptions containing other quote types', () => {
    const result = extractTests(`
      


      


      test \`backticks with "double" and 'single'\` {
        assert(true)
      }
    `)
    expect(result.tests.length).toBe(3)
    expect(result.tests[0].description).toBe('typeof null is "null"')
    expect(result.tests[1].description).toBe("single 'apostrophe' inside")
    expect(result.tests[2].description).toBe(
      `backticks with "double" and 'single'`
    )
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
    const result = extractTests(`
      function getValue() { return 42 }

      test('inner test expected to fail') {
        expect(getValue()).toBe(99)
      }
    `)
    const fullCode = `${result.code}\n${testUtils}\nreturn ${result.testRunner}`
    const fn = new Function(fullCode)
    const summary = await fn()

    expect(summary.failed).toBe(1)
    expect(summary.results[0].error).toContain('Expected 99')
    expect(summary.results[0].error).toContain('got 42')
  })
  it('should support canonical TJS test syntax without parentheses', () => {
    const result = extractTests(`
      function double(x) { return x * 2 }

      


    `)
    expect(result.tests.length).toBe(1)
    expect(result.tests[0].description).toBe('doubles numbers')
  })
  it('should support anonymous test blocks', () => {
    const result = extractTests(`
      function add(a, b) { return a + b }

      



      


    `)
    expect(result.tests.length).toBe(2)
    expect(result.tests[0].description).toBe('test 1')
    expect(result.tests[1].description).toBe('test 2')
  })
  it('should extract tests from anywhere in source (tests are "sucked" to bottom)', () => {
    const result = extractTests(`
      



      function add(a, b) { return a + b }

      


    `)

    expect(result.tests.length).toBe(2)
    expect(result.tests[0].description).toBe('early test')
    expect(result.tests[1].description).toBe('late test')

    expect(result.code).toContain('function add')
    expect(result.code).not.toContain('test')
  })
  it('should extract embedded tests from block comments (TS compatibility)', () => {
    const result = extractTests(`
      function add(a: number, b: number): number {
        return a + b
      }

      /*

*/

      /*

*/
    `)
    expect(result.tests.length).toBe(2)
    expect(result.tests[0].description).toBe('adds two numbers')
    expect(result.tests[0].body).toContain('expect(add(2, 3)).toBe(5)')
    expect(result.tests[1].description).toBe('handles negatives')
  })
  it('should extract anonymous embedded tests', () => {
    const result = extractTests(`
      function double(x: number): number { return x * 2 }

      /*

*/
    `)
    expect(result.tests.length).toBe(1)
    expect(result.tests[0].description).toBe('embedded test 1')
  })
  it('should combine embedded and regular tests', () => {
    const result = extractTests(`
      function add(a, b) { return a + b }

      /*

*/

      


    `)
    expect(result.tests.length).toBe(2)
    expect(result.tests[0].description).toBe('embedded test')
    expect(result.tests[1].description).toBe('regular test')
  })
})

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
      expect(result).toBe(inputError)
    })
  })
  describe('wrap', () => {
    it('should wrap function with validation', () => {
      const add = (a, b) => a + b
      const meta = {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
        returns: { type: 'number' },
      }
      const wrappedAdd = wrap(add, meta)

      expect(wrappedAdd(2, 3)).toBe(5)
    })
    it('should return error for invalid args', () => {
      const add = (a, b) => a + b
      const meta = {
        params: {
          a: { type: 'number', required: true },
          b: { type: 'number', required: true },
        },
      }
      const wrappedAdd = wrap(add, meta)
      const result = wrappedAdd('not a number', 3)
      expect(isError(result)).toBe(true)
    })
    it('should propagate error inputs without calling function', () => {
      let called = false
      const fn = (x) => {
        called = true
        return x * 2
      }
      const meta = {
        params: { x: { type: 'number', required: true } },
      }
      const wrapped = wrap(fn, meta)
      const inputError = error('upstream error')
      const result = wrapped(inputError)
      expect(isError(result)).toBe(true)
      expect(called).toBe(false)
      expect(result).toBe(inputError)
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
      const step1 = wrap((x) => (x < 0 ? error('negative input') : x * 2), {
        params: { x: { type: 'number', required: true } },
      })
      const step2 = wrap((y) => y + 10, {
        params: { y: { type: 'number', required: true } },
      })

      expect(step2(step1(5))).toBe(20)

      const result = step2(step1(-1))
      expect(isError(result)).toBe(true)
      expect(result.message).toBe('negative input')
    })
  })
})

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
    const safe = tjs(`function add(a: 0, b: 0): 0 { return a + b }`)
    expect(safe.code).toContain('__tjs.typeError')
    expect(safe.code).toContain('__tjs.pushStack')
    expect(safe.code).toContain("typeof a !== 'number'")

    const unsafe = tjs(`safety none
function add(a: 0, b: 0): 0 { return a + b }`)
    expect(unsafe.code).not.toContain('__tjs.typeError')
    expect(unsafe.code).not.toContain('__tjs.pushStack')
    expect(unsafe.code).not.toContain("typeof a !== 'number'")

    expect(unsafe.code).toContain('add.__tjs')
    expect(unsafe.code).toContain('"unsafe": true')
  })
  it('safety none should work with multiple functions', () => {
    const result = tjs(`safety none
function add(a: 0, b: 0): 0 { return a + b }
function multiply(a: 0, b: 0): 0 { return a * b }`)

    expect(result.code).not.toContain('__tjs.typeError')
    expect(result.code).not.toContain('__tjs.pushStack')

    expect(result.code).toContain('add.__tjs')
    expect(result.code).toContain('multiply.__tjs')
  })
})

describe('unsafe function marker (!)', () => {
  it('(!) should skip validation for that function only', () => {
    const result = tjs(`
function safeAdd(a: 0, b: 0): 0 { return a + b }
function unsafeAdd(! a: 0, b: 0): 0 { return a + b }
`)

    expect(result.code).toContain('__tjs.pushStack')
    expect(result.code).toContain('__tjs.typeError')

    const unsafeMatch = result.code.match(
      /function unsafeAdd\([^)]+\)\s*\{([^}]+)\}/
    )
    expect(unsafeMatch).toBeTruthy()
    const unsafeBody = unsafeMatch[1]
    expect(unsafeBody).not.toContain('__tjs.typeError')
    expect(unsafeBody).not.toContain('__tjs.pushStack')

    expect(result.code).toContain('unsafeAdd.__tjs')
  })
  it('(!) function metadata should have unsafe: true', () => {
    const result = tjs(`function fast(! x: 0): 0 { return x * 2 }`)
    expect(result.code).toContain('"unsafe": true')
  })
})

describe('safe vs unsafe comparison', () => {
  it('safe function should have validation, unsafe should not', () => {
    const safe = tjs(`function double(x: 0): 0 { return x * 2 }`)
    expect(safe.code).toContain("typeof x !== 'number'")
    expect(safe.code).toContain('__tjs.typeError')

    const unsafeMarker = tjs(`function double(! x: 0): 0 { return x * 2 }`)
    expect(unsafeMarker.code).not.toContain("typeof x !== 'number'")
    expect(unsafeMarker.code).not.toContain('__tjs.typeError')

    const unsafeModule = tjs(`safety none
function double(x: 0): 0 { return x * 2 }`)
    expect(unsafeModule.code).not.toContain("typeof x !== 'number'")
    expect(unsafeModule.code).not.toContain('__tjs.typeError')
  })
  it('both (!) and safety none should produce equivalent unsafe output', () => {
    const viaMarker = tjs(`function add(! a: 0, b: 0): 0 { return a + b }`)
    const viaDirective = tjs(`safety none
function add(a: 0, b: 0): 0 { return a + b }`)

    expect(viaMarker.code).not.toContain('__tjs.pushStack')
    expect(viaDirective.code).not.toContain('__tjs.pushStack')

    expect(viaMarker.code).toContain('"unsafe": true')
    expect(viaDirective.code).toContain('"unsafe": true')
  })
})

describe('safe function syntax (?)', () => {
  it('should parse (?) function marker', () => {
    const result = tjs(`
      function validated(? x: 0): 0 {
        return x * 2
      }
    `)
    expect(result.code).toContain('validated.__tjs')
    expect(result.code).toContain('"safe": true')
  })
  it('should work with arrow functions', () => {
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

    expect(result.source).toContain('catch (__try_err)')
    expect(result.source).toContain('MonadicError')
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

    expect(result.source).toContain('finally')
    expect(result.source).not.toContain('__try_err')
  })
  it('should work in transpiled TJS code', () => {
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

    expect(result.code).toContain('catch (__try_err)')
    expect(result.code).toContain('MonadicError')
  })
  it('monadic error should have proper structure', () => {
    const { preprocess } = require('./parser')
    const result = preprocess(`
function test() {
  try { throw new Error('oops') }
}
`)

    expect(result.source).toContain('MonadicError')
    expect(result.source).toContain('__try_err?.message')
    expect(result.source).toContain('return new')
  })
})

describe('return type safety arrows', () => {
  it('should parse -> as normal return type', () => {
    const result = tjs(`
      function add(a: 0, b: 0): 0 {
        return a + b
      }
    `)
    expect(result.code).toContain('"returns"')
    expect(result.code).not.toContain('"safeReturn"')
    expect(result.code).not.toContain('"unsafeReturn"')
  })
  it('should parse -? as safe return (force output validation)', () => {
    const result = tjs(`
      function add(a: 0, b: 0):? 0 {
        return a + b
      }
    `)
    expect(result.code).toContain('"returns"')
    expect(result.code).toContain('"safeReturn": true')
  })
  it('should parse -! as unsafe return (skip output validation)', () => {
    const result = tjs(`
      function add(a: 0, b: 0):! 0 {
        return a + b
      }
    `)
    expect(result.code).toContain('"returns"')
    expect(result.code).toContain('"unsafeReturn": true')
  })
  it('should combine (?) with -? for fully safe function', () => {
    const result = tjs(`
      function critical(? x: 0):? 0 {
        return x * 2
      }
    `)
    expect(result.code).toContain('"safe": true')
    expect(result.code).toContain('"safeReturn": true')
  })
  it('should combine (!) with -! for fully unsafe function', () => {
    const result = tjs(`
      function fast(! x: 0):! 0 {
        return x * 2
      }
    `)
    expect(result.code).toContain('"unsafe": true')
    expect(result.code).toContain('"unsafeReturn": true')
  })
})

describe('signature tests (transpile-time)', () => {
  it('-> should run signature test at transpile time', () => {
    const result = tjs(`
      function double(x: 5): 10 {
        return x * 2
      }
    `)
    expect(result.testResults).toHaveLength(1)
    expect(result.testResults[0].passed).toBe(true)
    expect(result.testResults[0].isSignatureTest).toBe(true)
  })
  it('-> should fail if return value is wrong', () => {
    expect(() =>
      tjs(`
        function double(x: 5): "" {
          return x * 2
        }
      `)
    ).toThrow(/Expected.*got/)
  })
  it('-? should run signature test at transpile time', () => {
    const result = tjs(`
      function double(x: 5):? 10 {
        return x * 2
      }
    `)
    expect(result.testResults).toHaveLength(1)
    expect(result.testResults[0].passed).toBe(true)
  })
  it('-? should pass when example is consistent', () => {
    const result = tjs(`
      function double(x: 5):? 10 {
        return x * 2
      }
    `)
    expect(result.testResults[0].passed).toBe(true)
  })
  it('-? should fail if return value mismatches', () => {
    expect(() =>
      tjs(`
        function getString(x: 5):? "" {
          return x * 2
        }
      `)
    ).toThrow(/Expected.*got/)
  })
  it('-! should skip signature test entirely', () => {
    const result = tjs(`
      function double(x: 5):! 999 {
        return x * 2
      }
    `)
    expect(result.testResults).toHaveLength(0)
  })
  it('-> with object return should test structure', () => {
    const result = tjs(`
      function getPoint(x: 3, y: 4): { x: 3, y: 4 } {
        return { x, y }
      }
    `)
    expect(result.testResults[0].passed).toBe(true)
  })
  it('-> with object return should pass when example is consistent', () => {
    const result = tjs(`
      function getPoint(x: 3, y: 4): { x: 3, y: 4 } {
        return { x, y }
      }
    `)
    expect(result.testResults[0].passed).toBe(true)
  })
  it('-> with object return should fail on value mismatch', () => {
    expect(() =>
      tjs(`
        function getPoint(x: 3, y: 4): { x: "", y: "" } {
          return { x, y }
        }
      `)
    ).toThrow(/Expected.*got/)
  })
  it('should skip signature tests for async functions', () => {
    const result = tjs(
      `
      async function fetchData(id: 'test-1'): { name: '', id: '' } {
        return { name: 'Test', id }
      }
    `,
      { runTests: 'report' }
    )

    expect(result.testResults).toHaveLength(1)
    expect(result.testResults[0].passed).toBe(true)
    expect(result.testResults[0].description).toContain('fetchData')
  })
  it('should handle top-level await in module code during tests', () => {
    const result = tjs(
      `
      function double(x: 5): 10 {
        return x * 2
      }

      async function fetchThing(id: ''): '' {
        return id
      }

      await fetchThing('test')
    `,
      { runTests: 'report' }
    )

    expect(result.testResults).toHaveLength(2)
    const doubleTest = result.testResults.find((t) =>
      t.description.includes('double')
    )
    expect(doubleTest?.passed).toBe(true)
  })
  it('should skip tests gracefully when imports are unresolved (module-level)', () => {
    const result = tjs(
      `
      import { Schema } from 'tosijs-schema'

      const UserSchema = Schema({ name: '', age: 0 })

      function validateUser(data: { name: '', age: 0 }): { valid: true, errors: [''] } {
        return { valid: true, errors: [] }
      }
    `,
      { runTests: 'report' }
    )

    expect(result.testResults).toBeDefined()
    const sigTest = result.testResults.find((t) =>
      t.description.includes('validateUser')
    )
    expect(sigTest).toBeDefined()
    expect(sigTest?.passed).toBe(false)
    expect(sigTest?.inconclusive).toBe(true)
  })
  it('should skip tests gracefully when imports are unresolved (function-level)', () => {
    const result = tjs(
      `
      import { parseISO, format } from 'date-fns'

      function formatDate(date: '2024-01-15', pattern: 'yyyy-MM-dd'): '' {
        const parsed = parseISO(date)
        return format(parsed, pattern)
      }
    `,
      { runTests: 'report' }
    )
    expect(result.testResults).toBeDefined()
    const sigTest = result.testResults.find((t) =>
      t.description.includes('formatDate')
    )
    expect(sigTest).toBeDefined()
    expect(sigTest?.passed).toBe(false)
    expect(sigTest?.inconclusive).toBe(true)
  })
  it('should test sync functions alongside async functions', () => {
    const result = tjs(
      `
      function add(a: 2, b: 3): 5 {
        return a + b
      }

      async function fetchSum(a: 0, b: 0): 0 {
        return a + b
      }
    `,
      { runTests: 'report' }
    )

    expect(result.testResults).toHaveLength(2)
    const addTest = result.testResults.find((t) =>
      t.description.includes('add')
    )
    expect(addTest?.passed).toBe(true)
  })
  it('should run signature tests for class methods using first constructor', () => {
    const result = tjs(
      `
      class Point {
        constructor(x: 0.0, y: 0.0) {
          this.x = x
          this.y = y
        }

        distanceTo(other: { x: 3.0, y: 4.0 }): 5.0 {
          const dx = this.x - other.x
          const dy = this.y - other.y
          return Math.sqrt(dx * dx + dy * dy)
        }
      }
    `,
      { runTests: 'report' }
    )
    expect(result.testResults).toBeDefined()
    const sigTest = result.testResults.find((t) =>
      t.description.includes('Point.distanceTo')
    )
    expect(sigTest).toBeDefined()
    expect(sigTest?.passed).toBe(true)
    expect(sigTest?.isSignatureTest).toBe(true)
  })
  it('should fail class method signature test when return value is wrong', () => {
    expect(() =>
      tjs(`
        class Adder {
          constructor(base: 10) {
            this.base = base
          }

          add(x: 5): 100 {
            return this.base + x
          }
        }
      `)
    ).toThrow(/Expected.*got/)
  })
  it('should run signature tests for methods on classes with multiple constructors', () => {
    const result = tjs(
      `

      class Point {
        constructor(x: 0.0, y: 0.0) {
          this.x = x
          this.y = y
        }

        constructor(coords: { x: 0.0, y: 0.0 }) {
          this.x = coords.x
          this.y = coords.y
        }

        distanceTo(other: { x: 3.0, y: 4.0 }): 5.0 {
          const dx = this.x - other.x
          const dy = this.y - other.y
          return Math.sqrt(dx * dx + dy * dy)
        }
      }
    `,
      { runTests: 'report' }
    )
    expect(result.testResults).toBeDefined()
    const sigTest = result.testResults.find((t) =>
      t.description.includes('Point.distanceTo')
    )
    expect(sigTest).toBeDefined()
    expect(sigTest?.passed).toBe(true)
  })
})

describe('signature test canaries — exact value matching', () => {
  it('CANARY: -> catches wrong primitive return value', () => {
    expect(() =>
      tjs(`
        function add(a: 2, b: 3): 0 {
          return a + b
        }
      `)
    ).toThrow(/Expected.*got/)
  })
  it('CANARY: -> catches wrong string return value', () => {
    expect(() =>
      tjs(
        "function greet(name: 'World'): '' {\n  return 'Hello, ' + name + '!'\n}"
      )
    ).toThrow(/Expected.*got/)
  })
  it('CANARY: -> catches wrong object property values', () => {
    expect(() =>
      tjs(`
        function getPoint(x: 3, y: 4): { x: 0, y: 0 } {
          return { x, y }
        }
      `)
    ).toThrow(/Expected.*got/)
  })
  it('CANARY: -? also catches wrong return value', () => {
    expect(() =>
      tjs(`
        function double(x: 5):? 0 {
          return x * 2
        }
      `)
    ).toThrow(/Expected.*got/)
  })
  it('CANARY: -! does NOT run signature test (wrong value is OK)', () => {
    const result = tjs(`
      function double(x: 5):! 999 {
        return x * 2
      }
    `)
    expect(result.testResults).toHaveLength(0)
  })
  it('CANARY: -> passes with correct exact values', () => {
    const result = tjs(`
      function add(a: 2, b: 3): 5 {
        return a + b
      }
    `)
    expect(result.testResults).toHaveLength(1)
    expect(result.testResults[0].passed).toBe(true)
  })
  it('CANARY: -> passes with correct string value', () => {
    const result = tjs(
      "function greet(name: 'World'): 'Hello, World!' {\n  return 'Hello, ' + name + '!'\n}"
    )
    expect(result.testResults).toHaveLength(1)
    expect(result.testResults[0].passed).toBe(true)
  })
  it('CANARY: -> passes with correct object values', () => {
    const result = tjs(`
      function getPoint(x: 3, y: 4): { x: 3, y: 4 } {
        return { x, y }
      }
    `)
    expect(result.testResults).toHaveLength(1)
    expect(result.testResults[0].passed).toBe(true)
  })
  it('CANARY: -? runtime validation checks type only (not value)', () => {
    const result = tjs('function double(x: 5):? 10 { return x * 2 }', {
      runTests: false,
    })
    const savedTjs = globalThis.__tjs
    const { createRuntime } = require('./runtime')
    globalThis.__tjs = createRuntime()
    try {
      const fn = new Function(result.code + '\nreturn double')()

      expect(fn(3)).toBe(6)
      expect(fn(5)).toBe(10)
    } finally {
      globalThis.__tjs = savedTjs
    }
  })
})

describe('inline validation', () => {
  it('should generate inline validation for single-arg object types', () => {
    const result = tjs(`
function process(input: { x: 0, y: 0, name: 'test' }) {
  return input.x + input.y
}`)

    expect(result.code).not.toContain('_original_process')
    expect(result.code).toContain("typeof input !== 'object'")

    expect(result.code).toContain('process.__tjs')
  })
  it('should generate inline validation for multi-arg functions', () => {
    const result = tjs(`
function add(x: 0, y: 0) {
  return x + y
}`)

    expect(result.code).not.toContain('_original_add')
    expect(result.code).toContain("typeof x !== 'number'")
    expect(result.code).toContain("typeof y !== 'number'")

    expect(result.code).toContain('add.__tjs')
  })
  it('should not generate inline wrapper for unsafe functions', () => {
    const result = tjs(`
function fast(! input: { x: 0 }) {
  return input.x
}`)

    expect(result.code).not.toContain('_original_fast')
  })
  it('should validate correctly at runtime', () => {
    const { installRuntime } = require('./runtime')
    installRuntime()
    const result = tjs(`
function process(input: { x: 0, y: 0 }) {
  return input.x + input.y
}`)
    const fn = new Function(`${result.code}; return process`)()

    expect(fn({ x: 1, y: 2 })).toBe(3)

    const nullInput = fn(null)
    expect(nullInput).toBeInstanceOf(Error)

    const nonObject = fn('not an object')
    expect(nonObject).toBeInstanceOf(Error)

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

    expect(result.wasmBlocks.length).toBe(1)

    expect(result.wasmBlocks[0].id).toMatch(/^__tjs_wasm_[a-z0-9]+_0$/)
    expect(result.wasmBlocks[0].body).toContain('arr[i] *= 2')

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

    expect(result.source).toContain(`globalThis.${result.wasmBlocks[0].id}`)
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

    expect(result.wasmBlocks[0].captures).toContain('x')
    expect(result.wasmBlocks[0].captures).toContain('y')
    expect(result.wasmBlocks[0].captures).toContain('multiplier')

    expect(result.source).toContain(
      `${result.wasmBlocks[0].id}(multiplier, x, y)`
    )
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

    expect(result.wasmBlocks[0].id).toMatch(/^__tjs_wasm_[a-z0-9]+_0$/)
    expect(result.wasmBlocks[1].id).toMatch(/^__tjs_wasm_[a-z0-9]+_1$/)
    const tag = (id) => id.split('_').slice(0, -1).join('_')
    expect(tag(result.wasmBlocks[1].id)).toBe(tag(result.wasmBlocks[0].id))
    expect(result.source).toContain(`globalThis.${result.wasmBlocks[0].id}`)
    expect(result.source).toContain(`globalThis.${result.wasmBlocks[1].id}`)
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

    expect(result.wasmCompiled).toBeDefined()
    expect(result.wasmCompiled?.length).toBe(1)
    expect(result.wasmCompiled?.[0].success).toBe(true)
    expect(result.wasmCompiled?.[0].byteLength).toBeGreaterThan(0)

    expect(result.code).toContain('__wasmExports')
    expect(result.code).toContain('__wasmModuleB64')

    const fn = new Function(
      'return (async () => {' + result.code + '; return double(3, 4); })()'
    )
    expect(await fn()).toBe(15)
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

    const fn = new Function(
      'return (async () => {' + result.code + '; return compute(3, 4); })()'
    )

    expect(await fn()).toBe(7)
  })
  it('should use explicit fallback when WASM compilation fails', () => {
    const result = tjs(`
function transform(arr: []) {
  return wasm {
    return arr.map(x => x * 2)
  } fallback {
    return arr.map(x => x * 2)
  }
}`)

    expect(result.wasmCompiled?.[0].success).toBe(false)

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

    expect(result.wasmBlocks[0].captures).not.toContain('Reset')
    expect(result.wasmBlocks[0].captures).not.toContain('stars')
    expect(result.wasmBlocks[0].captures).not.toContain('camera')

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

    expect(result.wasmBlocks[0].captures).toContain('xs: Float32Array')

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
    } catch (e) {
      expect(e.name).toBe('SyntaxError')
      expect(typeof e.formatWithContext).toBe('function')
      const formatted = e.formatWithContext(1)
      expect(formatted).toContain('return x +')
      expect(formatted).toContain('^')
      expect(formatted).toContain('>')
    }
  })
  it('formatWithContext handles single-line errors', () => {
    try {
      transpileToJS(`function foo() { return + }`)
      expect.unreachable('Should have thrown')
    } catch (e) {
      const formatted = e.formatWithContext(0)
      expect(formatted).toContain('function foo')
      expect(formatted).toContain('^')
    }
  })
})

describe('bang access (!.)', () => {
  function runBang(source) {
    const result = tjs(source, { runTests: false })
    const fn = new Function(result.code + '\nreturn test')()
    return fn()
  }
  it('should access property on non-null object', () => {
    expect(
      runBang(`
      function test() {
        const x = { foo: 42 }
        return x!.foo
      }
    `)
    ).toBe(42)
  })
  it('should return MonadicError on null', () => {
    const result = runBang(`
      function test() {
        const x = null
        return x!.foo
      }
    `)
    expect(isMonadicError(result)).toBe(true)
  })
  it('should return MonadicError on undefined', () => {
    const result = runBang(`
      function test() {
        let x
        return x!.foo
      }
    `)
    expect(isMonadicError(result)).toBe(true)
  })
  it('should propagate MonadicError through chains', () => {
    const result = runBang(`
      function test() {
        const x = null
        return x!.foo!.bar
      }
    `)
    expect(isMonadicError(result)).toBe(true)
  })
  it('should handle member chains before !.', () => {
    expect(
      runBang(`
      function test() {
        const x = { y: { foo: 99 } }
        return x.y!.foo
      }
    `)
    ).toBe(99)
  })
  it('should handle function call before !.', () => {
    expect(
      runBang(`
      function getObj() { return { val: 7 } }
      function test() {
        return getObj()!.val
      }
    `)
    ).toBe(7)
  })
  it('should return MonadicError when function returns null', () => {
    const result = runBang(`
      function getNull() { return null }
      function test() {
        return getNull()!.val
      }
    `)
    expect(isMonadicError(result)).toBe(true)
  })
  it('should handle bracket access before !.', () => {
    expect(
      runBang(`
      function test() {
        const arr = [{ name: 'first' }]
        return arr[0]!.name
      }
    `)
    ).toBe('first')
  })
  it('should not transform !. inside strings', () => {
    const result = tjs(
      `
      function test() { return "x!.foo" }
    `,
      { runTests: false }
    )
    expect(result.code).toContain('"x!.foo"')
    expect(result.code).not.toContain('__tjs.bang')
  })
  it('should not transform !. inside comments', () => {
    const result = tjs(
      `
      // x!.foo should not be transformed
      function test() { return 1 }
    `,
      { runTests: false }
    )
    expect(result.code).not.toContain('__tjs.bang')
  })
  it('should work alongside ?. optional chaining', () => {
    expect(
      runBang(`
      function test() {
        const x = { y: { z: 5 } }
        return x?.y!.z
      }
    `)
    ).toBe(5)
  })
  it('emitted standalone JS includes bang inline stub', () => {
    const result = tjs(
      `
      function test() { const x = {}; return x!.foo }
    `,
      { runTests: false }
    )
    expect(result.code).toContain('function bang(')
  })
})
