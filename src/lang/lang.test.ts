import { describe, it, expect } from 'bun:test'
import {
  transpile,
  ajs,
  tjs,
  transpileToJS,
  fromTS,
  lint,
  extractTests,
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

  describe('Error handling', () => {
    it('should reject multiple functions', () => {
      expect(() =>
        transpile(`
        function a() {}
        function b() {}
      `)
      ).toThrow('Only a single function')
    })

    it('should reject classes', () => {
      expect(() =>
        transpile(`
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
      expect(result.types.name).toBe('greet')
      expect(result.types.params.name).toBeDefined()
      expect(result.types.params.name.type.kind).toBe('string')
    })

    it('should preserve return type annotation in metadata', () => {
      const result = transpileToJS(`
        function add(a: 0, b: 0) -> 0 {
          return a + b
        }
      `)
      expect(result.code).not.toContain('->')
      expect(result.types.returns).toBeDefined()
      expect(result.types.returns?.kind).toBe('number')
    })

    it('should mark parameters as required when using colon syntax', () => {
      const result = transpileToJS(`
        function test(required: 'value', optional = 'default') {
          return required
        }
      `)
      expect(result.types.params.required.required).toBe(true)
      expect(result.types.params.optional.required).toBe(false)
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
      expect(result.types.params.user.type.kind).toBe('object')
      expect(result.types.params.user.type.shape?.name.kind).toBe('string')
      expect(result.types.params.user.type.shape?.age.kind).toBe('number')
    })

    it('should handle array type annotations', () => {
      const result = transpileToJS(`
        function sum(numbers: [1, 2, 3]) {
          return numbers.reduce((a, b) => a + b, 0)
        }
      `)
      expect(result.types.params.numbers.type.kind).toBe('array')
      expect(result.types.params.numbers.type.items?.kind).toBe('number')
    })

    it('should generate __tjs metadata object', () => {
      const result = transpileToJS(`
        function greet(name: 'world') -> '' {
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
      expect(result.types.description).toBe('Greet a user by name')
      expect(result.types.params.name.description).toBe('The name to greet')
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
      expect(result.types.name).toBe('test')
    })

    it('should work as tagged template literal', () => {
      const result = tjs`
        function double(n: 0) {
          return n * 2
        }
      `
      expect(result.code).toContain('function double')
      expect(result.types.params.n.type.kind).toBe('number')
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
      expect(Object.keys(result.types.params)).toHaveLength(0)
    })

    it('should handle multiple parameters', () => {
      const result = transpileToJS(`
        function calc(a: 0, b: 0, c = 1) {
          return a + b + c
        }
      `)
      expect(result.types.params.a.required).toBe(true)
      expect(result.types.params.b.required).toBe(true)
      expect(result.types.params.c.required).toBe(false)
    })

    it('should handle boolean types', () => {
      const result = transpileToJS(`
        function toggle(enabled: true) {
          return !enabled
        }
      `)
      expect(result.types.params.enabled.type.kind).toBe('boolean')
    })

    it('should handle object return type', () => {
      // Object types are valid return types
      const result = transpileToJS(`
        function test(x: 0) -> { result: 0 } {
          return { result: x }
        }
      `)
      expect(result.types.returns).toBeDefined()
      expect(result.types.returns?.kind).toBe('object')
      expect(result.types.returns?.shape?.result.kind).toBe('number')
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

    it('should convert return type to -> annotation', () => {
      const result = fromTS(
        `function greet(name: string): string { return name }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("-> ''")
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
      expect(result.code).toContain("-> { name: '', age: 0 }")
    })

    it('should handle nullable types', () => {
      const result = fromTS(
        `function find(id: string): string | null { return null }`,
        { emitTJS: true }
      )
      expect(result.code).toContain("-> '' || null")
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

// unsafe block tests
describe('unsafe blocks', () => {
  it('should transform unsafe block to try-catch', () => {
    const result = tjs(`
      function riskyOp(x: 0) -> 0 {
        unsafe {
          if (x < 0) throw new Error('negative')
          return x * 2
        }
      }
    `)

    expect(result.code).toContain('try {')
    expect(result.code).toContain('catch (__unsafe_err)')
    expect(result.code).toContain('$error: true')
    expect(result.code).toContain("op: 'unsafe'")
    expect(result.code).not.toContain('unsafe {')
  })

  it('should execute unsafe block and return result on success', () => {
    const result = tjs(`
      function double(x: 0) -> 0 {
        unsafe {
          return x * 2
        }
      }
    `)

    const fn = new Function(`${result.code}; return double(5);`)
    expect(fn()).toBe(10)
  })

  it('should return error object on throw', () => {
    const result = tjs(`
      function mustBePositive(x: 0) -> 0 {
        unsafe {
          if (x < 0) throw new Error('must be positive')
          return x
        }
      }
    `)

    const fn = new Function(`${result.code}; return mustBePositive(-1);`)
    const error = fn()
    expect(error.$error).toBe(true)
    expect(error.op).toBe('unsafe')
    expect(error.message).toContain('must be positive')
    expect(error.cause).toBeInstanceOf(Error)
  })
})
