function __match(v, ex) {
  if (ex === null) return v === null
  if (ex === undefined) return true
  if (
    ex &&
    typeof ex === 'object' &&
    ex.__runtimeType &&
    typeof ex.check === 'function'
  )
    return ex.check(v) === true
  const t = typeof ex
  if (t === 'number')
    return (
      typeof v === 'number' &&
      (Number.isInteger(ex) ? Number.isInteger(v) : true)
    )
  if (t === 'string' || t === 'boolean') return typeof v === t
  if (Array.isArray(ex)) {
    if (!Array.isArray(v)) return false
    return ex.length ? v.every((x) => __match(x, ex[0])) : true
  }
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const ks = Object.keys(ex)
    return ks.every((k) => k in v && __match(v[k], ex[k]))
  }
  return v === ex
}
function Type(d, p, e) {
  const t = { description: d, __runtimeType: true }
  if (typeof p === 'function') {
    t.check = p
    t.default = e ?? null
  } else {
    const ex = e ?? p
    t.default = ex
    t.__ex = ex
    t.check = (v) => __match(v, ex)
  }
  return t
}
function Generic(tp, pred, d) {
  const c = (a) => {
    if (a === null || a === undefined) return () => true
    if (a.__runtimeType && typeof a.check === 'function')
      return (v) => a.check(v) === true
    if (typeof a === 'function') return (v) => a(v) === true
    return (v) => __match(v, a)
  }
  const f = (...args) => {
    const ck = args.map(c)
    const t = {
      description: d || 'generic',
      __runtimeType: true,
      check: (v) => pred(v, ...ck),
    }
    return t
  }
  f.__runtimeType = true
  f.description = d
  return f
}
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
function Enum(d, m) {
  const mm = typeof m === 'object' && m ? m : {}
  const vals = Object.values(mm)
  const names = {}
  for (const k of Object.keys(mm)) names[mm[k]] = k
  return {
    description: d,
    check: (v) => vals.includes(v),
    values: vals,
    members: mm,
    names,
    keys: Object.keys(mm),
    __runtimeType: true,
  }
}
function Union(d, ...v) {
  const vals = v.flat()
  return {
    description: d,
    check: (x) => vals.includes(x),
    values: vals,
    __runtimeType: true,
  }
}
const __tjs = globalThis.__tjs?.createRuntime?.() ?? {
  Type,
  Generic,
  FunctionPredicate,
  Enum,
  Union,
}
/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import {
  transpile,
  ajs,
  tjs,
} from '/Users/tonioloewald/tjs-lang/src/lang/index'

import { preprocess, parse } from '/Users/tonioloewald/tjs-lang/src/lang/parser'

import {
  createRuntime,
  isMonadicError,
} from '/Users/tonioloewald/tjs-lang/src/lang/runtime'

describe('Transpiler', () => {
  describe('Parser preprocessing', () => {
    it('should transform colon shorthand to default syntax and track required params', () => {
      const result = preprocess(`function foo(x: 'string') { }`)
      expect(result.source).toContain(`x = 'string'`)

      expect(result.requiredParams.has('x')).toBe(true)
      expect(result.requiredValueOffsets.size).toBe(1)
    })
    it('should extract return type annotation', () => {
      const result = preprocess(
        `function foo(x: 'string'): { result: 'string' } { }`
      )
      expect(result.returnType).toBe(`{ result: 'string' }`)
      expect(result.source).not.toContain('->')
    })
    it('should extract colon-style return type annotation', () => {
      const result = preprocess(
        `function foo(x: 'string'): { result: 'string' } { }`
      )
      expect(result.returnType).toBe(`{ result: 'string' }`)
      expect(result.source).not.toContain('): ')
    })
    it('should extract colon-style return type with safety markers', () => {
      const safe = preprocess(`function foo(x: 0):? 0 { }`)
      expect(safe.returnType).toBe('0')
      expect(safe.returnSafety).toBe('safe')
      const unsafe = preprocess(`function foo(x: 0):! 0 { }`)
      expect(unsafe.returnType).toBe('0')
      expect(unsafe.returnSafety).toBe('unsafe')
    })
    it('should handle multiple parameters', () => {
      const result = preprocess(`function foo(a: 'string', b: 0, c = 10) { }`)
      expect(result.source).toContain(`a = 'string'`)
      expect(result.source).toContain(`b = 0`)
      expect(result.source).toContain(`c = 10`)
      expect(result.requiredParams.has('a')).toBe(true)
      expect(result.requiredParams.has('b')).toBe(true)

      expect(result.requiredParams.has('c')).toBe(false)
      expect(result.requiredValueOffsets.size).toBe(2)
    })
    it('should reject duplicate parameter names', () => {
      expect(() => preprocess(`function foo(a: 'string', a: 0) { }`)).toThrow(
        "Duplicate parameter name 'a'"
      )
    })
    it('should strip type annotation from rest params', () => {
      const result = preprocess(`function sum(...nums: [0]) { }`)
      expect(result.source).toContain('...nums)')
      expect(result.source).not.toContain('...nums =')
    })
    it('should handle rest param with array type example', () => {
      const result = preprocess(
        `function mean(...values: [1.0, 2.0, 3.0]): 2.0 { return 0 }`
      )
      expect(result.source).toContain('...values)')
      expect(result.source).not.toContain('[1.0')
    })
    it('should allow required params after optional params', () => {
      const result = preprocess(`function foo(a = 10, b: 'string') { }`)
      expect(result.source).toContain("b = 'string'")
    })
    it('should transform Type declaration with simple example', () => {
      const result = preprocess(`Type Name 'Alice'`)
      expect(result.source).toBe(`const Name = Type('Name', 'Alice')`)
    })
    it('should transform Type declaration with block (old syntax)', () => {
      const result = preprocess(`Type User {
  description: 'a user'
  example: { name: '', age: 0 }
}`)

      expect(result.source).toContain(`const User = Type('a user', undefined,`)
      expect(result.source).toContain(`{ name: '', age: 0 }`)
    })
    it('should transform Type with description before block (new syntax)', () => {
      const result = preprocess(`Type User 'a user' {
  example: { name: '', age: 0 }
}`)

      expect(result.source).toContain(`const User = Type('a user', undefined,`)
      expect(result.source).toContain(`{ name: '', age: 0 }`)
    })
    it('should transform Type with predicate and example (old syntax)', () => {
      const result = preprocess(`Type EvenNum {
  description: 'even number'
  example: 2
  predicate(x) { return x % 2 === 0 }
}`)
      expect(result.source).toContain(`const EvenNum = Type('even number'`)
      expect(result.source).toContain(`__tjs?.validate`)
      expect(result.source).toContain(`x % 2 === 0`)
    })
    it('should transform Type with description before block and predicate (new syntax)', () => {
      const result = preprocess(`Type EvenNum 'even number' {
  example: 2
  predicate(x) { return x % 2 === 0 }
}`)
      expect(result.source).toContain(`const EvenNum = Type('even number'`)
      expect(result.source).toContain(`__tjs?.validate`)
      expect(result.source).toContain(`x % 2 === 0`)
    })

    it('should transform Type with = default (string)', () => {
      const result = preprocess(`Type Name = 'Alice'`)
      expect(result.source).toBe(`const Name = Type('Name', 'Alice')`)
    })
    it('should transform Type with = default (number)', () => {
      const result = preprocess(`Type Count = 0`)
      expect(result.source).toBe(`const Count = Type('Count', 0)`)
    })
    it('should transform Type with = default (positive number)', () => {
      const result = preprocess(`Type Age = +18`)
      expect(result.source).toBe(`const Age = Type('Age', +18)`)
    })
    it('should transform Type with description and = default', () => {
      const result = preprocess(`Type Name 'a person name' = 'Alice'`)
      expect(result.source).toBe(`const Name = Type('a person name', 'Alice')`)
    })
    it('should transform Type with = default and block with example', () => {
      const result = preprocess(`Type PositiveAge = +1 {
  example: 30
}`)
      expect(result.source).toContain(`const PositiveAge = Type('PositiveAge'`)
      expect(result.source).toContain(`, 30`)
      expect(result.source).toContain(`, +1)`)
    })
    it('should transform Type with = default (object)', () => {
      const result = preprocess(
        `Type Config = { host: 'localhost', port: 8080 }`
      )
      expect(result.source).toContain(`const Config = Type('Config'`)
      expect(result.source).toContain(`host: 'localhost'`)
      expect(result.source).toContain(`port: 8080`)
    })

    it('should extract and strip test blocks', () => {
      const result = preprocess(`
const x = 1

const y = 2
`)
      expect(result.source).not.toContain('test')
      expect(result.source).toContain('const x = 1')
      expect(result.source).toContain('const y = 2')
      expect(result.tests.length).toBe(1)
      expect(result.tests[0].body).toContain('x !== 1')
    })
    it('should extract test blocks with description', () => {
      const result = preprocess(`

`)
      expect(result.tests.length).toBe(1)
      expect(result.tests[0].description).toBe('x equals 1')
    })
    it('should report test errors', () => {
      const result = preprocess(`

`)
      expect(result.tests.length).toBe(1)
      expect(result.testErrors.length).toBe(1)
      expect(result.testErrors[0]).toContain('always fails')
      expect(result.testErrors[0]).toContain('intentional')
    })
    it('should skip tests with dangerouslySkipTests', () => {
      const result = preprocess(``, { dangerouslySkipTests: true })
      expect(result.tests.length).toBe(1)
      expect(result.testErrors.length).toBe(0)
    })
    it('should transform Generic declaration', () => {
      const result = preprocess(`Generic Pair<T, U> {
  description: 'a pair'
  predicate(x, T, U) { return T(x[0]) && U(x[1]) }
}`)
      expect(result.source).toContain(`const Pair = Generic(['T', 'U']`)
      expect(result.source).toContain(`checkT(x[0]) && checkU(x[1])`)
    })
    it('should transform Generic with default type param', () => {
      const result = preprocess(`Generic Box<T, U = ''> {
  description: 'box'
  predicate(x, T, U) { return true }
}`)
      expect(result.source).toContain(`['T', ['U', '']]`)
    })
    it('should transform bare uppercase assignment to const', () => {
      const result = preprocess(`Foo = Type('test', 123)`)
      expect(result.source).toContain(`const Foo = Type('test', 123)`)
    })
    it('should transform Union declaration with block', () => {
      const result = preprocess(`Union Direction 'cardinal direction' {
  'up' | 'down' | 'left' | 'right'
}`)
      expect(result.source).toBe(
        `const Direction = Union('cardinal direction', ['up', 'down', 'left', 'right'])`
      )
    })
    it('should transform Union declaration inline', () => {
      const result = preprocess(
        `Union Status 'task status' 'pending' | 'active' | 'done'`
      )
      expect(result.source).toBe(
        `const Status = Union('task status', ['pending', 'active', 'done'])`
      )
    })
    it('should transform Union with mixed types', () => {
      const result = preprocess(`Union Mixed 'mixed values' {
  'string' | 42 | true | null
}`)
      expect(result.source).toBe(
        `const Mixed = Union('mixed values', ['string', 42, true, null])`
      )
    })
    it('should transform Enum with auto-incrementing numbers', () => {
      const result = preprocess(`Enum Status 'task status' {
  Pending
  Active
  Done
}`)
      expect(result.source).toBe(
        `const Status = Enum('task status', { Pending: 0, Active: 1, Done: 2 })`
      )
    })
    it('should transform Enum with string values', () => {
      const result = preprocess(`Enum Color 'CSS color' {
  Red = 'red'
  Green = 'green'
  Blue = 'blue'
}`)
      expect(result.source).toBe(
        `const Color = Enum('CSS color', { Red: 'red', Green: 'green', Blue: 'blue' })`
      )
    })
    it('should transform Enum with explicit numeric values', () => {
      const result = preprocess(`Enum HttpStatus 'HTTP status code' {
  OK = 200
  Created = 201
  BadRequest = 400
  NotFound = 404
}`)
      expect(result.source).toBe(
        `const HttpStatus = Enum('HTTP status code', { OK: 200, Created: 201, BadRequest: 400, NotFound: 404 })`
      )
    })
    it('should transform Enum with mixed auto and explicit values', () => {
      const result = preprocess(`Enum Mixed 'mixed enum' {
  Zero = 0
  One
  Ten = 10
  Eleven
}`)
      expect(result.source).toBe(
        `const Mixed = Enum('mixed enum', { Zero: 0, One: 1, Ten: 10, Eleven: 11 })`
      )
    })
  })
  describe('Type inference', () => {
    it('should infer string type from literal with colon syntax', () => {
      const { signature } = transpile(`
        function test(name: 'Anne Example') {
          return { name }
        }
      `)
      expect(signature.parameters.name.type.kind).toBe('string')
      expect(signature.parameters.name.required).toBe(true)
    })
    it('should infer number type from literal with colon syntax', () => {
      const { signature } = transpile(`
        function test(count: 42) {
          return { count }
        }
      `)
      expect(signature.parameters.count.type.kind).toBe('integer')
      expect(signature.parameters.count.required).toBe(true)
    })
    it('should handle optional parameters with defaults', () => {
      const { signature } = transpile(`
        function test(limit = 10) {
          return { limit }
        }
      `)
      expect(signature.parameters.limit.type.kind).toBe('integer')
      expect(signature.parameters.limit.required).toBe(false)
      expect(signature.parameters.limit.default).toBe(10)
    })
    it('should handle nullable types with | syntax', () => {
      const { signature } = transpile(`
        function test(filter: 'default' | null) {
          return { filter }
        }
      `)
      expect(signature.parameters.filter.type.kind).toBe('string')
      expect(signature.parameters.filter.type.nullable).toBe(true)
    })
    it('should handle union types with | syntax', () => {
      const { signature } = transpile(`
        function test(id: 'abc123' | 42) {
          return { id }
        }
      `)
      expect(signature.parameters.id.type.kind).toBe('union')
      expect(signature.parameters.id.type.members).toHaveLength(2)
    })
    it('should handle object shape types with colon syntax', () => {
      const { signature } = transpile(`
        function test(user: { name: 'Anne', age: 25 }) {
          return { user }
        }
      `)
      expect(signature.parameters.user.type.kind).toBe('object')
      expect(signature.parameters.user.type.shape?.name.kind).toBe('string')
      expect(signature.parameters.user.type.shape?.age.kind).toBe('integer')
    })
    it('should handle array types with colon syntax', () => {
      const { signature } = transpile(`
        function test(tags: ['technology', 'science']) {
          return { tags }
        }
      `)
      expect(signature.parameters.tags.type.kind).toBe('array')
      expect(signature.parameters.tags.type.items?.kind).toBe('string')
    })
    it('should distinguish required (colon) from optional (equals)', () => {
      const { signature } = transpile(`
        function test(name: 'Anne Example', count: 0, limit = 10) {
          return { name, count }
        }
      `)
      expect(signature.parameters.name.type.kind).toBe('string')
      expect(signature.parameters.name.required).toBe(true)
      expect(signature.parameters.count.type.kind).toBe('integer')
      expect(signature.parameters.count.required).toBe(true)
      expect(signature.parameters.limit.type.kind).toBe('integer')
      expect(signature.parameters.limit.required).toBe(false)
    })
  })
  describe('Numeric type narrowing', () => {
    it('should infer integer from whole number literal', () => {
      const { signature } = transpile(`
        function test(count: 42) { return { count } }
      `)
      expect(signature.parameters.count.type.kind).toBe('integer')
    })
    it('should infer float (number) from decimal literal', () => {
      const { signature } = transpile(`
        function test(rate: 3.14) { return { rate } }
      `)
      expect(signature.parameters.rate.type.kind).toBe('number')
    })
    it('should infer float from 0.0', () => {
      const { signature } = transpile(`
        function test(value: 0.0) { return { value } }
      `)
      expect(signature.parameters.value.type.kind).toBe('number')
    })
    it('should infer non-negative-integer from +N syntax', () => {
      const { signature } = transpile(`
        function test(age: +20) { return { age } }
      `)
      expect(signature.parameters.age.type.kind).toBe('non-negative-integer')
    })
    it('should infer non-negative-integer from +0', () => {
      const { signature } = transpile(`
        function test(index: +0) { return { index } }
      `)
      expect(signature.parameters.index.type.kind).toBe('non-negative-integer')
    })
    it('should infer integer from negative literal', () => {
      const { signature } = transpile(`
        function test(offset: -5) { return { offset } }
      `)
      expect(signature.parameters.offset.type.kind).toBe('integer')
    })
    it('should infer number from negative decimal', () => {
      const { signature } = transpile(`
        function test(temp: -3.5) { return { temp } }
      `)
      expect(signature.parameters.temp.type.kind).toBe('number')
    })
    it('should generate correct runtime validation for integer', () => {
      const result = tjs(`function test(n: 1): 1 { return n }`)

      expect(result.code).toContain('Number.isInteger')
    })
    it('should generate correct runtime validation for non-negative-integer', () => {
      const result = tjs(`function test(n: +1): 1 { return n }`)

      expect(result.code).toContain('Number.isInteger')
      expect(result.code).toContain('< 0')
    })
    it('should validate integer at runtime', () => {
      const result = tjs(`function check(n: 1): 1 { return n }`)
      const savedTjs = globalThis.__tjs
      globalThis.__tjs = createRuntime()
      try {
        const fn = new Function(result.code + '\nreturn check')()

        expect(fn(42)).toBe(42)

        const bad = fn(3.14)
        expect(isMonadicError(bad)).toBe(true)
      } finally {
        globalThis.__tjs = savedTjs
      }
    })
    it('should validate non-negative-integer at runtime', () => {
      const result = tjs(`function check(n: +1): 1 { return n }`)
      const savedTjs = globalThis.__tjs
      globalThis.__tjs = createRuntime()
      try {
        const fn = new Function(result.code + '\nreturn check')()

        expect(fn(0)).toBe(0)
        expect(fn(42)).toBe(42)

        const negResult = fn(-1)
        expect(isMonadicError(negResult)).toBe(true)

        const floatResult = fn(3.14)
        expect(isMonadicError(floatResult)).toBe(true)
      } finally {
        globalThis.__tjs = savedTjs
      }
    })
    it('should validate float (number) accepts all numbers at runtime', () => {
      const result = tjs(`function check(n: 0.0): 0.0 { return n }`)
      const savedTjs = globalThis.__tjs
      globalThis.__tjs = createRuntime()
      try {
        const fn = new Function(result.code + '\nreturn check')()

        expect(fn(42)).toBe(42)
        expect(fn(3.14)).toBe(3.14)
        expect(fn(-5)).toBe(-5)
        expect(fn(0)).toBe(0)
      } finally {
        globalThis.__tjs = savedTjs
      }
    })
    it('should handle numeric types in object shapes', () => {
      const { signature } = transpile(`
        function test(point: { x: 0.0, y: 0.0, index: 0 }) { return point }
      `)
      expect(signature.parameters.point.type.shape?.x.kind).toBe('number')
      expect(signature.parameters.point.type.shape?.y.kind).toBe('number')
      expect(signature.parameters.point.type.shape?.index.kind).toBe('integer')
    })
    it('should handle numeric types in array items', () => {
      const { signature } = transpile(`
        function test(counts: [0]) { return counts }
      `)
      expect(signature.parameters.counts.type.items?.kind).toBe('integer')
      const { signature: sig2 } = transpile(`
        function test(values: [0.0]) { return values }
      `)
      expect(sig2.parameters.values.type.items?.kind).toBe('number')
    })
  })
  describe('Basic transpilation', () => {
    it('should transpile a simple function', () => {
      const { ast } = transpile(`
        function greet({ name }) {
          return { name }
        }
      `)
      expect(ast.op).toBe('seq')
      expect(ast.steps).toBeInstanceOf(Array)
    })
    it('should handle variable declarations', () => {
      const { ast } = transpile(`
        function test({ input }) {
          let x = 5
          return { x }
        }
      `)

      expect(ast.steps[0].op).toBe('varsImport')
      expect(ast.steps[1].op).toBe('varSet')
      expect(ast.steps[1].key).toBe('x')
      expect(ast.steps[1].value).toBe(5)
    })
    it('should handle const declarations', () => {
      const { ast } = transpile(`
        function test({ input }) {
          const x = 5
          return { x }
        }
      `)
      expect(ast.steps[0].op).toBe('varsImport')
      expect(ast.steps[1].op).toBe('constSet')
      expect(ast.steps[1].key).toBe('x')
      expect(ast.steps[1].value).toBe(5)
    })
    it('should handle const with atom calls', () => {
      const { ast } = transpile(`
        function test({ query }) {
          const results = search({ query })
          return { results }
        }
      `)
      expect(ast.steps[1].op).toBe('search')
      expect(ast.steps[1].result).toBe('results')
      expect(ast.steps[1].resultConst).toBe(true)
    })
    it('should handle function calls as atom invocations', () => {
      const { ast } = transpile(`
        function test({ query }) {
          let results = search({ query: query })
          return { results }
        }
      `)

      expect(ast.steps[1].op).toBe('search')
      expect(ast.steps[1].result).toBe('results')
    })
    it('should handle if statements', () => {
      const { ast } = transpile(`
        function test({ x }) {
          if (x > 5) {
            let y = 10
          }
          return { x }
        }
      `)

      expect(ast.steps[1].op).toBe('if')

      expect(ast.steps[1].condition.$expr).toBe('binary')
      expect(ast.steps[1].condition.op).toBe('>')
    })
    it('should handle while loops', () => {
      const { ast } = transpile(`
        function test({ n }) {
          while (n > 0) {
            let x = n
          }
          return { n }
        }
      `)

      expect(ast.steps[1].op).toBe('while')
    })
    it('should handle for...of as map', () => {
      const { ast } = transpile(`
        function test({ items }) {
          for (const item of items) {
            let x = item
          }
          return { items }
        }
      `)

      expect(ast.steps[1].op).toBe('map')
      expect(ast.steps[1].as).toBe('item')
    })
    it('should handle try/catch', () => {
      const { ast } = transpile(`
        function test({ url }) {
          try {
            let data = httpFetch({ url })
          } catch (e) {
            let error = e
          }
          return { url }
        }
      `)

      expect(ast.steps[1].op).toBe('try')
      expect(ast.steps[1].try).toBeInstanceOf(Array)
      expect(ast.steps[1].catch).toBeInstanceOf(Array)
    })
  })
  describe('js() convenience function', () => {
    it('should return just the AST', () => {
      const ast = ajs(`
        function test({ x }) {
          return { x }
        }
      `)
      expect(ast.op).toBe('seq')
    })
  })
  describe('ajs template tag', () => {
    it('should transpile tagged template', () => {
      const ast = ajs`
        function test({ x }) {
          return { x }
        }
      `
      expect(ast.op).toBe('seq')
    })
    it('should handle interpolation', () => {
      const varName = 'result'
      const ast = ajs`
        function test({ x }) {
          return { ${varName}: x }
        }
      `
      expect(ast.op).toBe('seq')
    })
  })
  describe('JSDoc extraction', () => {
    it('should extract function description', () => {
      const { signature } = transpile(`
        /**
         * Search the knowledge base
         */
        function search({ query }) {
          return { query }
        }
      `)
      expect(signature.description).toBe('Search the knowledge base')
    })
    it('should extract parameter descriptions', () => {
      const { signature } = transpile(`
        /**
         * Search function
         * @param query - The search query
         * @param limit - Maximum results
         */
        function search(query: 'string', limit = 10) {
          return { query }
        }
      `)
      expect(signature.parameters.query.description).toBe('The search query')
      expect(signature.parameters.limit.description).toBe('Maximum results')
    })
  })
  describe('TJS doc comments (/*#)', () => {
    it('should extract markdown doc comment', () => {
      const { signature } = transpile(`
        /*#
        The classic greeting function.

        This demonstrates TJS doc comments.
        */
        function greet(name: 'World'): '' {
          return 'Hello, ' + name + '!'
        }
      `)
      expect(signature.description).toContain('The classic greeting function')
      expect(signature.description).toContain(
        'This demonstrates TJS doc comments'
      )
    })
    it('should preserve markdown formatting', () => {
      const { signature } = transpile(`
        /*#
        # Heading

        - List item 1
        - List item 2

        \`code example\`
        */
        function test(x: 0): 0 {
          return x
        }
      `)
      expect(signature.description).toContain('# Heading')
      expect(signature.description).toContain('- List item 1')
      expect(signature.description).toContain('`code example`')
    })
    it('should dedent common leading whitespace', () => {
      const { signature } = transpile(`
        /*#
          Indented content here.
          More indented content.
        */
        function test(x: 0): 0 {
          return x
        }
      `)

      expect(signature.description).toBe(
        'Indented content here.\nMore indented content.'
      )
    })
    it('should prefer /*# over /** when both present', () => {
      const { signature } = transpile(`
        /**
         * JSDoc description
         */
        /*#
        TJS doc description
        */
        function test(x: 0): 0 {
          return x
        }
      `)
      expect(signature.description).toBe('TJS doc description')
    })
    it('should only use the immediately preceding /*# block, not earlier ones', () => {
      const { signature } = transpile(`
        /*#
        # File-level documentation

        This is a header comment that should NOT be attached to the function.
        */

        // Some other code or comments here

        /*#
        Function-specific documentation.
        */
        function test(x: 0): 0 {
          return x
        }
      `)
      expect(signature.description).toBe('Function-specific documentation.')
      expect(signature.description).not.toContain('File-level')
    })
    it('should not attach distant /*# block when nothing immediately precedes function', () => {
      const { signature } = transpile(`
        /*#
        # File-level documentation

        This should NOT be attached to the function below.
        */

        const someVar = 123

        function test(x: 0): 0 {
          return x
        }
      `)

      expect(signature.description).toBeUndefined()
    })
  })
  describe('Error handling', () => {
    it('accepts multiple functions as local helpers (last is the entry)', () => {
      const { ast } = transpile(`
        function helper(x: 0): 0 { return x }
        function main(n: 0): 0 {
          const r = helper(n)
          return r
        }
      `)

      expect(ast.helpers?.helper).toBeDefined()
    })
    it('should require a function when only a class is provided', () => {
      expect(() =>
        transpile(`
        TjsCompat
        class Foo {}
      `)
      ).toThrow('Classes are not supported')
    })
    it('should reject imports', () => {
      expect(() =>
        transpile(`
        import { x } from 'y'
        function test() {}
      `)
      ).toThrow('Imports are not supported')
    })
    it('should provide syntax errors with locations', () => {
      try {
        transpile(`function test( { }`)
        expect.unreachable('Should have thrown')
      } catch (e) {
        expect(e.name).toBe('SyntaxError')
        expect(e.line).toBeDefined()
      }
    })
    it('should reject switch statements', () => {
      expect(() =>
        transpile(`
        function test({ x = 0 }) {
          switch(x) {
            case 1: return { result: 'one' }
            default: return { result: 'other' }
          }
        }
      `)
      ).toThrow(/Unsupported statement type: SwitchStatement/)
    })
    it('should reject throw statements', () => {
      expect(() =>
        transpile(`
        function test({ x = 0 }) {
          throw new Error('fail')
        }
      `)
      ).toThrow(/'throw' is not supported/)
    })
    it('should reject traditional for loops', () => {
      expect(() =>
        transpile(`
        function test({ n = 0 }) {
          for (let i = 0; i < n; i++) {}
          return { result: n }
        }
      `)
      ).toThrow(/Unsupported statement type: ForStatement/)
    })
    it('should reject exports', () => {
      expect(() =>
        transpile(`
        export function test() {}
      `)
      ).toThrow('Exports are not supported')
    })
  })
  describe('Template literals', () => {
    it('should transform template literals to template atom', () => {
      const { ast } = transpile(`
        function greet({ name }) {
          let msg = \`Hello \${name}!\`
          return { msg }
        }
      `)

      expect(ast.steps[1].op).toBe('template')
      expect(ast.steps[1].tmpl).toContain('Hello')
      expect(ast.steps[1].tmpl).toContain('{{')
    })
  })
  describe('Method calls', () => {
    it('should transform arr.map() to map atom', () => {
      const { ast } = transpile(`
        function test({ items }) {
          let doubled = items.map(x => x)
          return { doubled }
        }
      `)

      expect(ast.steps[1].op).toBe('map')
    })
    it('should transform arr.push() to push atom', () => {
      const { ast } = transpile(`
        function test({ items }) {
          let updated = items.push(5)
          return { updated }
        }
      `)

      expect(ast.steps[1].op).toBe('push')
    })
    it('should transform str.split() to split atom', () => {
      const { ast } = transpile(`
        function test({ str }) {
          let parts = str.split(',')
          return { parts }
        }
      `)

      expect(ast.steps[1].op).toBe('split')
    })
    it('should transform arr.join() to join atom', () => {
      const { ast } = transpile(`
        function test({ parts }) {
          let str = parts.join(',')
          return { str }
        }
      `)

      expect(ast.steps[1].op).toBe('join')
    })
    it('should transform arr.filter() to filter atom', () => {
      const { ast } = transpile(`
        function test({ items }) {
          let evens = items.filter(x => x % 2 == 0)
          return { evens }
        }
      `)
      expect(ast.steps[1].op).toBe('filter')
      expect(ast.steps[1].as).toBe('x')
      expect(ast.steps[1].condition.$expr).toBe('binary')
    })
    it('should transform arr.find() to find atom', () => {
      const { ast } = transpile(`
        function test({ items }) {
          let found = items.find(x => x > 5)
          return { found }
        }
      `)
      expect(ast.steps[1].op).toBe('find')
      expect(ast.steps[1].as).toBe('x')
      expect(ast.steps[1].condition.$expr).toBe('binary')
    })
    it('should transform arr.reduce() to reduce atom', () => {
      const { ast } = transpile(`
        function test({ items }) {
          let sum = items.reduce((acc, x) => acc + x, 0)
          return { sum }
        }
      `)
      expect(ast.steps[1].op).toBe('reduce')
      expect(ast.steps[1].as).toBe('x')
      expect(ast.steps[1].accumulator).toBe('acc')
      expect(ast.steps[1].initial).toBe(0)
    })
  })
  describe('Optional chaining', () => {
    it('should transform obj?.prop to member with optional flag', () => {
      const { ast } = transpile(`
        function test({ user }) {
          let name = user?.name
          return { name }
        }
      `)

      expect(ast.steps[1].op).toBe('varSet')
      expect(ast.steps[1].value.$expr).toBe('member')
      expect(ast.steps[1].value.optional).toBe(true)
      expect(ast.steps[1].value.property).toBe('name')
    })
    it('should transform obj?.nested?.prop to nested optional members', () => {
      const { ast } = transpile(`
        function test({ user }) {
          let city = user?.address?.city
          return { city }
        }
      `)
      expect(ast.steps[1].op).toBe('varSet')
      const outer = ast.steps[1].value
      expect(outer.$expr).toBe('member')
      expect(outer.optional).toBe(true)
      expect(outer.property).toBe('city')

      expect(outer.object.$expr).toBe('member')
      expect(outer.object.optional).toBe(true)
      expect(outer.object.property).toBe('address')
    })
    it('should transform obj?.method() to methodCall with optional flag', () => {
      const { ast } = transpile(`
        function test({ str }) {
          let upper = str?.toUpperCase()
          return { upper }
        }
      `)
      expect(ast.steps[1].op).toBe('varSet')
      expect(ast.steps[1].value.$expr).toBe('methodCall')
      expect(ast.steps[1].value.optional).toBe(true)
      expect(ast.steps[1].value.method).toBe('toUpperCase')
    })
    it('should use string path optimization for regular member access', () => {
      const { ast } = transpile(`
        function test({ user }) {
          let name = user.name
          return { name }
        }
      `)

      expect(ast.steps[1].value).toBe('user.name')
    })
  })
  describe('Null coalescing operator (??)', () => {
    it('should transpile nullish coalescing to logical ExprNode', () => {
      const { ast } = transpile(`
        function test({ value = null }) {
          let result = value ?? 'default'
          return { result }
        }
      `)

      const varSetStep = ast.steps[2]
      expect(varSetStep.op).toBe('varSet')
      expect(varSetStep.value.$expr).toBe('logical')
      expect(varSetStep.value.op).toBe('??')
    })
  })
  describe('stray `=>` on function declarations', () => {
    it('errors clearly on `function f(...): T => { body }`', () => {
      expect(() =>
        tjs(`function f(s: '', n = 0): 0 => {
  return s.length + n
}`)
      ).toThrow(/Unexpected '=>' after function declaration/)
    })
    it('errors with column pointing at the `=>` (not earlier in the line)', () => {
      let caught
      try {
        tjs(`function f(): 0 => { return 0 }`)
      } catch (e) {
        caught = e
      }
      expect(caught).toBeDefined()

      expect(caught.column).toBe(16)
    })
    it('does not error on regular function declarations', () => {
      expect(() =>
        tjs(`function f(s: ''): 0 { return s.length }`)
      ).not.toThrow()
    })
    it('does not error on real arrow function expressions', () => {
      expect(() => tjs(`const f = (s = '') => s.length`)).not.toThrow()
    })
  })
  describe('let type annotations (TjsSafeAssign)', () => {
    it("strips `: <example>` from `let x: ''` and records annotation", () => {
      const r = parse(`let x: ''`)
      expect(r.letAnnotations.get('x')).toBe("''")
    })
    it('strips `: <example>` from `let x: 0 = 5` and keeps the initializer', () => {
      const r = parse(`let x: 0 = 5`)
      expect(r.letAnnotations.get('x')).toBe('0')
      const decl = r.ast.body[0]
      expect(decl.type).toBe('VariableDeclaration')
      expect(decl.declarations[0].init).not.toBeNull()
    })
    it('handles object-literal example with nested braces', () => {
      const r = parse(
        `function f() { let result: { ok: false }; return result }`
      )
      expect(r.letAnnotations.get('result')).toBe('{ ok: false }')
    })
    it('does not strip `:` inside string literals', () => {
      const r = parse(`let s = 'a:b:c'`)
      expect(r.letAnnotations.size).toBe(0)
    })
    it('TjsSafeAssign mode is on by default in native TJS', () => {
      const r = parse(`let x = 0`)
      expect(r.tjsModes.tjsSafeAssign).toBe(true)
    })
    it('TjsCompat directive disables TjsSafeAssign', () => {
      const r = parse(`TjsCompat\nlet x = 0`)
      expect(r.tjsModes.tjsSafeAssign).toBe(false)
    })
  })
})

describe('the converter emits TJS the parser can read', () => {
  const run = (src, name) =>
    new Function(tjs(src, { runTests: false }).code + `\nreturn ${name}`)()
  describe('generators', () => {
    it('parses an annotated generator, and it still yields', () => {
      const g = run('function* g(n: 0):! 0 { yield n; yield n + 1 }', 'g')
      expect([...g(5)]).toEqual([5, 6])
    })
    it('a plain JS generator still parses (control)', () => {
      expect([...run('function* g(n) { yield n }', 'g')(1)]).toEqual([1])
    })
  })
  describe('destructured parameters', () => {
    it('parses a TS-style pattern with an inline type', () => {
      const f = run(
        'function f({ a, b }: { a: 0, b: 0 }):! 0 { return a + b }',
        'f'
      )
      expect(f({ a: 2, b: 3 })).toBe(5)
    })
    it('parses an array pattern with an inline type', () => {
      const f = run('function f([x, y]: [0, 0]):! 0 { return x + y }', 'f')
      expect(f([4, 5])).toBe(9)
    })
    it('keeps the TJS example form working (control)', () => {
      const f = run('function f({ a: 0, b = 2 }):! 0 { return a + b }', 'f')
      expect(f({ a: 1 })).toBe(3)
    })
    it('a real default after a pattern is still a default (control)', () => {
      const f = run(
        'function f({ a, b } = { a: 1, b: 2 }):! 0 { return a + b }',
        'f'
      )
      expect(f()).toBe(3)
    })
  })
})

describe('a block member is read at the top level only', () => {
  const NESTED = `FunctionPredicate Cb {
  params: { cte: FunctionPredicate('f', { params: { n: null }, returns: null }) }
  returns: null
}`
  it('a nested params/returns does not capture the outer member', () => {
    expect(() => tjs(NESTED, { runTests: false })).not.toThrow()
  })
  it('the outer returns is the one that lands', () => {
    const { code } = tjs(NESTED, { runTests: false })
    expect(code).toContain('returns: null }')
    expect(code).not.toContain('} })')
  })
  it('a plain block still works (control)', () => {
    expect(() =>
      tjs('FunctionPredicate P {\n  params: { x: 0 }\n  returns: 0\n}', {
        runTests: false,
      })
    ).not.toThrow()
  })
})

describe("a call's arguments are not an arrow's parameters", () => {
  const run = (src) => {
    const r = preprocess(src)
    return typeof r === 'string' ? r : r.source
  }
  it('keeps the ternary alternate when the consequent ends in a call', () => {
    const out = run('const m = k\n  ? (x, i) => f(a)\n  : (x) => x;')
    expect(out).toContain(': (x)')

    expect(out).not.toMatch(/^\s*=>/m)
  })
  it('still transforms a real arrow', () => {
    expect(run('const f = (a) => a')).toContain('(a) =>')
  })
  it('an async arrow is still a parameter list', () => {
    expect(run('const f = async (a) => a')).toContain('(a) =>')
  })
  it('an arrow passed as a call argument still works', () => {
    expect(run('xs.map((x) => x)')).toContain('(x) =>')
  })
})

describe('a destructured parameter is not optional by itself', () => {
  const call = (src, args) => {
    const f = new Function(tjs(src, { runTests: false }).code + '\nreturn f')()
    return f(...args)
  }
  it('throws when omitted, as JavaScript does', () => {
    expect(() =>
      call('function f({ a = 1, b = 2 }) { return { a, b } }', [])
    ).toThrow(/destructure/)
  })
  it('fills members from a partial payload', () => {
    expect(
      call('function f({ a = 1, b = 2 }) { return { a, b } }', [{ a: 9 }])
    ).toEqual({
      a: 9,
      b: 2,
    })
  })
  it('`= {}` on the pattern makes it omittable (the JS spelling)', () => {
    expect(
      call('function f({ a = 1, b = 2 } = {}) { return { a, b } }', [])
    ).toEqual({ a: 1, b: 2 })
  })
})

describe('an annotated arrow after a keyword', () => {
  const shapes = [
    ['return', 'function f() {\n  return (x: 0) => x\n}'],
    ['return with a return type', 'function f() {\n  return (x: 0): 0 => x\n}'],
    ['export default', 'export default (x: 0) => x'],
    ['throw', 'function f() { throw (x: 0) => x }'],
    ['curried', 'const f = (a: 0) => { return (b: 0) => a + b }'],
    [
      'else',
      'function f(c) { if (c) { return 1 } else { return (x: 0) => x } }',
    ],
  ]
  for (const [label, src] of shapes) {
    it(`after \`${label}\`, the parameters are still transformed`, () => {
      expect(() => tjs(src, { runTests: false })).not.toThrow()

      expect(preprocess(src, { filename: 'a.tjs' }).source).toMatch(/[xab] = 0/)
    })
  }

  const stillCalls = [
    ['a call argument', 'run((x: 0) => x)'],
    [
      'a ternary alternative',
      'const o = { w: k ? ((r) => f(r)) : (r) => g(r) }',
    ],
    ['a plain arrow', 'const f = (x: 0) => x'],
  ]
  for (const [label, src] of stillCalls) {
    it(`${label} still behaves`, () => {
      expect(() => tjs(src, { runTests: false })).not.toThrow()
    })
  }
})
