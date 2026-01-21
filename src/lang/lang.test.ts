import { describe, it, expect } from 'bun:test'
import {
  transpile,
  ajs,
  tjs,
  transpileToJS,
  fromTS,
  lint,
  extractTests,
  testUtils,
  isError,
  error,
  typeOf,
  validateArgs,
  wrap,
} from './index'
import { preprocess } from './parser'
import { Schema } from './schema'

describe('Transpiler', () => {
  describe('Parser preprocessing', () => {
    it('should transform colon shorthand to default syntax and track required params', () => {
      const result = preprocess(`function foo(x: 'string') { }`)
      expect(result.source).toContain(`x = 'string'`)
      expect(result.requiredParams.has('x')).toBe(true)
    })

    it('should extract return type annotation', () => {
      const result = preprocess(
        `function foo(x: 'string') -> { result: 'string' } { }`
      )
      expect(result.returnType).toBe(`{ result: 'string' }`)
      expect(result.source).not.toContain('->')
    })

    it('should handle multiple parameters', () => {
      const result = preprocess(`function foo(a: 'string', b: 0, c = 10) { }`)
      expect(result.source).toContain(`a = 'string'`)
      expect(result.source).toContain(`b = 0`)
      expect(result.source).toContain(`c = 10`)
      expect(result.requiredParams.has('a')).toBe(true)
      expect(result.requiredParams.has('b')).toBe(true)
      expect(result.requiredParams.has('c')).toBe(false)
    })

    it('should reject duplicate parameter names', () => {
      expect(() => preprocess(`function foo(a: 'string', a: 0) { }`)).toThrow(
        "Duplicate parameter name 'a'"
      )
    })

    it('should reject required params after optional params', () => {
      expect(() => preprocess(`function foo(a = 10, b: 'string') { }`)).toThrow(
        "Required parameter 'b' cannot follow optional parameter"
      )
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
      // Example-only blocks emit: Type(desc, undefined, example)
      expect(result.source).toContain(`const User = Type('a user', undefined,`)
      expect(result.source).toContain(`{ name: '', age: 0 }`)
    })

    it('should transform Type with description before block (new syntax)', () => {
      const result = preprocess(`Type User 'a user' {
  example: { name: '', age: 0 }
}`)
      // Example-only blocks emit: Type(desc, undefined, example)
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

    // New = default syntax tests
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

    // Test block syntax tests
    it('should extract and strip test blocks', () => {
      const result = preprocess(`
const x = 1
test { if (x !== 1) throw new Error('x should be 1') }
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
test 'x equals 1' { if (x !== 1) throw new Error('failed') }
`)
      expect(result.tests.length).toBe(1)
      expect(result.tests[0].description).toBe('x equals 1')
    })

    it('should report test errors', () => {
      const result = preprocess(`
test 'always fails' { throw new Error('intentional') }
`)
      expect(result.tests.length).toBe(1)
      expect(result.testErrors.length).toBe(1)
      expect(result.testErrors[0]).toContain('always fails')
      expect(result.testErrors[0]).toContain('intentional')
    })

    it('should skip tests with dangerouslySkipTests', () => {
      const result = preprocess(
        `test 'would fail' { throw new Error('nope') }`,
        { dangerouslySkipTests: true }
      )
      expect(result.tests.length).toBe(1)
      expect(result.testErrors.length).toBe(0) // No errors because skipped
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
      expect(signature.parameters.count.type.kind).toBe('number')
      expect(signature.parameters.count.required).toBe(true)
    })

    it('should handle optional parameters with defaults', () => {
      const { signature } = transpile(`
        function test(limit = 10) {
          return { limit }
        }
      `)
      expect(signature.parameters.limit.type.kind).toBe('number')
      expect(signature.parameters.limit.required).toBe(false)
      expect(signature.parameters.limit.default).toBe(10)
    })

    it('should handle nullable types with colon syntax', () => {
      const { signature } = transpile(`
        function test(filter: 'default' || null) {
          return { filter }
        }
      `)
      expect(signature.parameters.filter.type.kind).toBe('string')
      expect(signature.parameters.filter.type.nullable).toBe(true)
    })

    it('should handle union types with colon syntax', () => {
      const { signature } = transpile(`
        function test(id: 'abc123' || 42) {
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
      expect(signature.parameters.user.type.shape?.age.kind).toBe('number')
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
      expect(signature.parameters.count.type.kind).toBe('number')
      expect(signature.parameters.count.required).toBe(true)
      expect(signature.parameters.limit.type.kind).toBe('number')
      expect(signature.parameters.limit.required).toBe(false)
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
      // steps[0] is varsImport for parameters, steps[1] is the varSet
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
      // steps[0] is varsImport for parameters
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
      // steps[0] is varsImport for parameters
      expect(ast.steps[1].op).toBe('if')
      // Condition is now an ExprNode
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
      // steps[0] is varsImport for parameters
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
      // steps[0] is varsImport for parameters
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
      // steps[0] is varsImport for parameters
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
        function greet(name: 'World') -> '' {
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
        function test(x: 0) -> 0 {
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
        function test(x: 0) -> 0 {
          return x
        }
      `)
      // Should not have extra leading spaces
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
        function test(x: 0) -> 0 {
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
        function test(x: 0) -> 0 {
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

        function test(x: 0) -> 0 {
          return x
        }
      `)
      // No doc comment should be attached since there's code between
      expect(signature.description).toBeUndefined()
    })
  })

  describe('Error handling', () => {
    it('should reject multiple functions', () => {
      expect(() =>
        transpile(`
        function a() {}
        function b() {}
      `)
      ).toThrow('Only a single function')
    })

    it('should require a function when only a class is provided', () => {
      // transpile() is for function-to-AST conversion
      // Classes are handled by preprocess() and fromTS()
      expect(() =>
        transpile(`
        class Foo {}
      `)
      ).toThrow('Source must contain a function declaration')
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
      } catch (e: any) {
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
      // steps[0] is varsImport for parameters
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
      // steps[0] is varsImport for parameters
      expect(ast.steps[1].op).toBe('map')
    })

    it('should transform arr.push() to push atom', () => {
      const { ast } = transpile(`
        function test({ items }) {
          let updated = items.push(5)
          return { updated }
        }
      `)
      // steps[0] is varsImport for parameters
      expect(ast.steps[1].op).toBe('push')
    })

    it('should transform str.split() to split atom', () => {
      const { ast } = transpile(`
        function test({ str }) {
          let parts = str.split(',')
          return { parts }
        }
      `)
      // steps[0] is varsImport for parameters
      expect(ast.steps[1].op).toBe('split')
    })

    it('should transform arr.join() to join atom', () => {
      const { ast } = transpile(`
        function test({ parts }) {
          let str = parts.join(',')
          return { str }
        }
      `)
      // steps[0] is varsImport for parameters
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
      // steps[0] is varsImport, steps[1] is varSet
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
      // Inner member access
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
      // Regular member access uses string path optimization, not ExprNode
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
      // Step 0: varsImport, Step 1: if (default handling), Step 2: varSet with ??
      const varSetStep = ast.steps[2]
      expect(varSetStep.op).toBe('varSet')
      expect(varSetStep.value.$expr).toBe('logical')
      expect(varSetStep.value.op).toBe('??')
    })
  })
})

describe('TJS Emitter', () => {
  describe('transpileToJS', () => {
    it('should transpile a simple function to JavaScript', () => {
      const result = transpileToJS(`
        function greet(name: 'world') {
          return \`Hello, \${name}!\`
        }
      `)
      expect(result.code).toContain('function greet')
      expect(result.code).toContain('greet.__tjs')
      expect(result.types.greet.name).toBe('greet')
      expect(result.types.greet.params.name).toBeDefined()
      expect(result.types.greet.params.name.type.kind).toBe('string')
    })

    it('should preserve return type annotation in metadata', () => {
      const result = transpileToJS(`
        function add(a: 0, b: 0) -> 0 {
          return a + b
        }
      `)
      expect(result.code).not.toContain('->')
      expect(result.types.add.returns).toBeDefined()
      expect(result.types.add.returns?.kind).toBe('number')
    })

    it('should mark parameters as required when using colon syntax', () => {
      const result = transpileToJS(`
        function test(required: 'value', optional = 'default') {
          return required
        }
      `)
      expect(result.types.test.params.required.required).toBe(true)
      expect(result.types.test.params.optional.required).toBe(false)
    })

    it('should convert colon syntax to default values in output', () => {
      const result = transpileToJS(`
        function greet(name: 'world') {
          return name
        }
      `)
      expect(result.code).toContain("name = 'world'")
      expect(result.code).not.toContain("name: 'world'")
    })

    it('should handle object type annotations', () => {
      const result = transpileToJS(`
        function process(user: { name: 'Anne', age: 25 }) {
          return user.name
        }
      `)
      expect(result.types.process.params.user.type.kind).toBe('object')
      expect(result.types.process.params.user.type.shape?.name.kind).toBe(
        'string'
      )
      expect(result.types.process.params.user.type.shape?.age.kind).toBe(
        'number'
      )
    })

    it('should handle array type annotations', () => {
      const result = transpileToJS(`
        function sum(numbers: [1, 2, 3]) {
          return numbers.reduce((a, b) => a + b, 0)
        }
      `)
      expect(result.types.sum.params.numbers.type.kind).toBe('array')
      expect(result.types.sum.params.numbers.type.items?.kind).toBe('number')
    })

    it('should generate __tjs metadata object', () => {
      const result = transpileToJS(`
        function greet(name: 'world') -> 'Hello, world!' {
          return \`Hello, \${name}!\`
        }
      `)
      expect(result.code).toContain('greet.__tjs = {')
      expect(result.code).toContain('"params"')
      expect(result.code).toContain('"name"')
      expect(result.code).toContain('"returns"')
    })

    it('should extract JSDoc descriptions', () => {
      const result = transpileToJS(`
        /**
         * Greet a user by name
         * @param name - The name to greet
         */
        function greet(name: 'world') {
          return \`Hello, \${name}!\`
        }
      `)
      expect(result.types.greet.description).toBe('Greet a user by name')
      expect(result.types.greet.params.name.description).toBe(
        'The name to greet'
      )
    })

    it('should include source location in debug mode', () => {
      const result = transpileToJS(
        `function greet(name: 'world') {
          return name
        }`,
        { filename: 'test.tjs', debug: true }
      )
      expect(result.code).toContain('"source": "test.tjs:1:0"')
    })

    it('should not include source location without debug mode', () => {
      const result = transpileToJS(
        `function greet(name: 'world') {
          return name
        }`,
        { filename: 'test.tjs', debug: false }
      )
      expect(result.code).not.toContain('"source"')
    })
  })

  describe('tjs() convenience function', () => {
    it('should return transpiled result', () => {
      const result = tjs(`
        function test(x: 0) {
          return x * 2
        }
      `)
      expect(result.code).toContain('function test')
      expect(result.types.test.name).toBe('test')
    })

    it('should work as tagged template literal', () => {
      const result = tjs`
        function double(n: 0) {
          return n * 2
        }
      `
      expect(result.code).toContain('function double')
      expect(result.types.double.params.n.type.kind).toBe('number')
    })

    it('should handle interpolation in tagged template', () => {
      const funcName = 'myFunc'
      const result = tjs`
        function ${funcName}(x: 0) {
          return x
        }
      `
      expect(result.code).toContain('function myFunc')
    })
  })

  describe('Edge cases', () => {
    it('should handle function with no parameters', () => {
      const result = transpileToJS(`
        function noArgs() {
          return 42
        }
      `)
      expect(result.code).toContain('function noArgs()')
      expect(Object.keys(result.types.noArgs.params)).toHaveLength(0)
    })

    it('should handle multiple parameters', () => {
      const result = transpileToJS(`
        function calc(a: 0, b: 0, c = 1) {
          return a + b + c
        }
      `)
      expect(result.types.calc.params.a.required).toBe(true)
      expect(result.types.calc.params.b.required).toBe(true)
      expect(result.types.calc.params.c.required).toBe(false)
    })

    it('should handle boolean types', () => {
      const result = transpileToJS(`
        function toggle(enabled: true) {
          return !enabled
        }
      `)
      expect(result.types.toggle.params.enabled.type.kind).toBe('boolean')
    })

    it('should handle object return type', () => {
      // Object types are valid return types
      const result = transpileToJS(`
        function test(x: 0) -> { result: 0 } {
          return { result: x }
        }
      `)
      expect(result.types.test.returns).toBeDefined()
      expect(result.types.test.returns?.kind).toBe('object')
      expect(result.types.test.returns?.shape?.result.kind).toBe('number')
    })
  })

  describe('Unsafe functions with (!) syntax', () => {
    it('should mark function as unsafe when using (!) syntax', () => {
      const result = transpileToJS(`
        function fastAdd(! a: 0, b: 0) -> 0 {
          return a + b
        }
      `)
      expect(result.code).toContain('"unsafe": true')
    })

    it('should NOT mark function as unsafe without (!) syntax', () => {
      const result = transpileToJS(`
        function safeAdd(a: 0, b: 0) -> 0 {
          return a + b
        }
      `)
      expect(result.code).not.toContain('"unsafe"')
    })

    it('should strip (!) from output code', () => {
      const result = transpileToJS(`
        function test(! x: 0) {
          return x
        }
      `)
      expect(result.code).toContain('function test(x = 0)')
      expect(result.code).not.toContain('!')
    })

    it('should handle (!) with empty params', () => {
      const result = transpileToJS(`
        function noArgs(!) {
          return 42
        }
      `)
      expect(result.code).toContain('function noArgs()')
      expect(result.code).toContain('"unsafe": true')
    })

    it('should preserve type metadata for unsafe functions', () => {
      const result = transpileToJS(`
        function compute(! x: 0, y: 'str') -> 0 {
          return x
        }
      `)
      expect(result.types.compute.params.x.type.kind).toBe('number')
      expect(result.types.compute.params.y.type.kind).toBe('string')
      expect(result.types.compute.returns?.kind).toBe('number')
    })

    // === NEW TESTS: Multi-function and no-function support ===

    it('should handle files with no functions', () => {
      const result = transpileToJS(
        `
        const foo = 2 + 2

        test 'basic math' {
          expect(foo).toBe(4)
        }
      `,
        { runTests: 'report' }
      )

      expect(result.code).toContain('const foo = 2 + 2')
      expect(result.testResults?.[0].passed).toBe(true)
    })

    it('should handle multiple functions', () => {
      const result = transpileToJS(`
        function add(a: 0, b: 0) -> 0 { return a + b }
        function mul(a: 0, b: 0) -> 0 { return a * b }
      `)

      expect(result.code).toContain('add.__tjs')
      expect(result.code).toContain('mul.__tjs')
      // Both functions should have type info
      expect(result.types.add).toBeDefined()
      expect(result.types.mul).toBeDefined()
    })

    it('should insert __tjs immediately after each function', () => {
      const result = transpileToJS(`
        function greet(name: 'World') -> 'Hello, World' { return 'Hello, ' + name }
        console.log(greet.__tjs)
      `)

      // __tjs assignment should appear BEFORE the console.log
      const tjsPos = result.code.indexOf('greet.__tjs = {')
      const consolePos = result.code.indexOf('console.log(greet.__tjs)')
      expect(tjsPos).toBeGreaterThan(-1)
      expect(consolePos).toBeGreaterThan(-1)
      expect(tjsPos).toBeLessThan(consolePos)
    })

    it('should compile validation inline (no wrapper)', () => {
      const result = transpileToJS(`
        function greet(name: 'World') -> 'Hello, World' { return 'Hello, ' + name }
      `)

      // Should NOT have wrapper pattern
      expect(result.code).not.toContain('_original_greet')
      expect(result.code).not.toContain('greet = function')

      // Should have inline validation at start of function body
      expect(result.code).toContain("if (typeof name !== 'string')")
      // Should use __tjs.typeError() for proper monadic errors
      expect(result.code).toContain('__tjs.typeError')
    })

    it('should handle mixed functions and statements', () => {
      const result = transpileToJS(`
        const VERSION = '1.0'

        function greet(name: 'World') -> 'Hello, World' { return 'Hello, ' + name }

        console.log(greet.__tjs)

        function add(a: 1, b: 2) -> 3 { return a + b }

        console.log(add.__tjs)
      `)

      // Both should work - metadata assigned before usage
      const greetTjs = result.code.indexOf('greet.__tjs = {')
      const greetLog = result.code.indexOf('console.log(greet.__tjs)')
      expect(greetTjs).toBeLessThan(greetLog)

      const addTjs = result.code.indexOf('add.__tjs = {')
      const addLog = result.code.indexOf('console.log(add.__tjs)')
      expect(addTjs).toBeLessThan(addLog)
    })
  })
})

describe('TypeScript to TJS Transpiler', () => {
  describe('fromTS with emitTJS', () => {
    it('should convert string type to empty string example', () => {
      const result = fromTS(`function greet(name: string) { return name }`, {
        emitTJS: true,
      })
      expect(result.code).toContain("name: ''")
    })

    it('should convert number type to 0 example', () => {
      const result = fromTS(
        `function add(a: number, b: number) { return a + b }`,
        { emitTJS: true }
      )
      expect(result.code).toContain('a: 0')
      expect(result.code).toContain('b: 0')
    })

    it('should convert optional params to = syntax', () => {
      const result = fromTS(
        `function greet(name: string, title?: string) { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("name: ''")
      expect(result.code).toContain("title = ''")
    })

    it('should convert return type to -! annotation (skip signature test)', () => {
      const result = fromTS(
        `function greet(name: string): string { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("-! ''") // -! skips signature test for TS-transpiled code
    })

    it('should handle array types', () => {
      const result = fromTS(
        `function sum(nums: number[]): number { return 0 }`,
        { emitTJS: true }
      )
      expect(result.code).toContain('nums: [0]')
    })

    it('should handle object literal types', () => {
      const result = fromTS(
        `function getUser(): { name: string, age: number } { return { name: '', age: 0 } }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("-! { name: '', age: 0 }") // -! for TS-transpiled
    })

    it('should handle nullable types', () => {
      const result = fromTS(
        `function find(id: string): string | null { return null }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("-! '' || null") // -! for TS-transpiled
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

      // Execute the generated JS
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

      // Execute and check result
      const fn = new Function(`${result.code}; return greet('World', true);`)
      expect(fn()).toBe('Hello, World!')

      // Also verify metadata is attached
      const metaFn = new Function(`${result.code}; return greet.__tjs;`)
      const meta = metaFn()
      expect(meta.params.name.type).toBe('string')
      expect(meta.params.name.required).toBe(true)
      expect(meta.params.excited.required).toBe(false)
      expect(meta.returns.type).toBe('string')
    })

    it('should handle arrow functions end-to-end', () => {
      const tsSource = `
        const multiply = (a: number, b: number): number => a * b
      `
      const result = fromTS(tsSource)

      // Execute
      const fn = new Function(`${result.code}; return multiply(4, 5);`)
      expect(fn()).toBe(20)

      // Check metadata
      const metaFn = new Function(`${result.code}; return multiply.__tjs;`)
      const meta = metaFn()
      expect(meta.params.a.type).toBe('number')
      expect(meta.params.b.type).toBe('number')
    })

    it('should handle complex types end-to-end', () => {
      const tsSource = `
        function processUser(user: { name: string, age: number }): string {
          return \`\${user.name} is \${user.age} years old\`
        }
      `
      const result = fromTS(tsSource)

      // Execute
      const fn = new Function(
        `${result.code}; return processUser({ name: 'Alice', age: 30 });`
      )
      expect(fn()).toBe('Alice is 30 years old')
    })
  })
})
// Schema callable tests
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
    // NOTE: This test INTENTIONALLY creates a failing inner test to verify error messages
    const result = extractTests(`
      function getValue() { return 42 }

      test('INTENTIONAL FAIL - testing error messages') {
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

  it('-> should fail if signature example is wrong', () => {
    expect(() =>
      tjs(`
        function double(x: 5) -> 999 {
          return x * 2
        }
      `)
    ).toThrow(/signature example is inconsistent/)
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

  it('-? should fail if signature example is wrong', () => {
    expect(() =>
      tjs(`
        function double(x: 5) -? 999 {
          return x * 2
        }
      `)
    ).toThrow(/signature example is inconsistent/)
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

  it('-> with object return should fail on mismatch', () => {
    expect(() =>
      tjs(`
        function getPoint(x: 3, y: 4) -> { x: 0, y: 0 } {
          return { x, y }
        }
      `)
    ).toThrow(/signature example is inconsistent/)
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

  it('should execute fallback when WASM not available', () => {
    const result = tjs(`
function double(x: 0, y: 0) {
  return wasm {
    return x * y + x
  }
}`)

    // Execute with fallback (no WASM registered)
    const fn = new Function(`${result.code}; return double(3, 4);`)
    expect(fn()).toBe(15) // 3 * 4 + 3 = 15
  })

  it('should use WASM when available', () => {
    const result = tjs(`
function compute(a: 0, b: 0) {
  return wasm {
    return a + b
  }
}`)

    // Register a mock WASM implementation
    const code = `
      globalThis.__tjs_wasm_0 = (a, b) => a * b * 100;
      ${result.code}
      const result = compute(3, 4);
      delete globalThis.__tjs_wasm_0;
      return result;
    `
    const fn = new Function(code)
    // Should use the "WASM" version (our mock)
    expect(fn()).toBe(1200) // 3 * 4 * 100
  })

  it('should use explicit fallback when provided', () => {
    const result = tjs(`
function transform(arr: []) {
  return wasm {
    return arr
  } fallback {
    return arr.map(x => x * 2)
  }
}`)

    // Fallback should use the explicit fallback code
    const fn = new Function(`${result.code}; return transform([1, 2, 3]);`)
    expect(fn()).toEqual([2, 4, 6])
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
