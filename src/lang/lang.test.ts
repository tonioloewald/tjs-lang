import { describe, it, expect } from 'bun:test'
import { transpile, ajs, tjs, transpileToJS, fromTS } from './index'
import { preprocess } from './parser'

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
  })
})
