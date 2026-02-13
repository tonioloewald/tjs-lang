import { describe, it, expect } from 'bun:test'
import { transpileToJS, tjs } from './index'

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
      expect(result.types.add.returns?.kind).toBe('integer')
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
        'integer'
      )
    })

    it('should handle array type annotations', () => {
      const result = transpileToJS(`
        function sum(numbers: [1, 2, 3]) {
          return numbers.reduce((a, b) => a + b, 0)
        }
      `)
      expect(result.types.sum.params.numbers.type.kind).toBe('array')
      expect(result.types.sum.params.numbers.type.items?.kind).toBe('integer')
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

    it('should always include source location in metadata', () => {
      const result = transpileToJS(
        `function greet(name: 'world') {
          return name
        }`,
        { filename: 'test.tjs' }
      )
      // Source location is always included (file:line format)
      expect(result.code).toContain('"source": "test.tjs:1"')
    })

    it('should use filename from tjs annotation if present', () => {
      const result = transpileToJS(
        `/* tjs <- src/original.ts */
function greet(name: 'world') {
          return name
        }`,
        { filename: 'fallback.tjs' }
      )
      // Should use the annotated filename, not the fallback
      expect(result.code).toContain('"source": "src/original.ts:')
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
      expect(result.types.double.params.n.type.kind).toBe('integer')
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
      expect(result.types.test.returns?.shape?.result.kind).toBe('integer')
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

    it('should handle (!) with arrow functions', () => {
      const result = transpileToJS(`
        const add = (! a: 0, b: 0) => a + b
      `)
      expect(result.code).toContain('(/* unsafe */ a = 0,b = 0) => a + b')
      expect(result.code).not.toContain('!')
    })

    it('should preserve type metadata for unsafe functions', () => {
      const result = transpileToJS(`
        function compute(! x: 0, y: 'str') -> 0 {
          return x
        }
      `)
      expect(result.types.compute.params.x.type.kind).toBe('integer')
      expect(result.types.compute.params.y.type.kind).toBe('string')
      expect(result.types.compute.returns?.kind).toBe('integer')
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

  describe('ES Module support (import/export)', () => {
    it('should preserve import statements', () => {
      const result = transpileToJS(`
        import { add } from './math.tjs'
        function main() {
          return add(1, 2)
        }
      `)
      expect(result.code).toContain("import { add } from './math.tjs'")
      expect(result.code).toContain('main.__tjs')
    })

    it('should preserve multiple imports', () => {
      const result = transpileToJS(`
        import { add, subtract } from './math.tjs'
        import { format } from 'date-fns'
        function main() {
          return add(1, 2)
        }
      `)
      expect(result.code).toContain(
        "import { add, subtract } from './math.tjs'"
      )
      expect(result.code).toContain("import { format } from 'date-fns'")
    })

    it('should handle export function with __tjs metadata', () => {
      const result = transpileToJS(
        `
        export function add(a: 1.0, b: 2.0) -> 3.0 {
          return a + b
        }
      `,
        { runTests: false }
      )
      expect(result.code).toContain('export function add')
      expect(result.code).toContain('add.__tjs')
      expect(result.types.add).toBeDefined()
      expect(result.types.add.params.a.type.kind).toBe('number')
      expect(result.types.add.returns?.kind).toBe('number')
    })

    it('should handle export default function with __tjs metadata', () => {
      const result = transpileToJS(
        `
        export default function greet(name: 'World') -> '' {
          return 'Hello, ' + name
        }
      `,
        { runTests: false }
      )
      expect(result.code).toContain('export default function greet')
      expect(result.code).toContain('greet.__tjs')
      expect(result.types.greet).toBeDefined()
    })

    it('should handle mixed imports, exports, and regular functions', () => {
      const result = transpileToJS(
        `
        import { helper } from './utils.tjs'

        function internal(x: 0) -> 0 {
          return x * 2
        }

        export function api(y: 0) -> 0 {
          return internal(helper(y))
        }
      `,
        { runTests: false }
      )
      expect(result.code).toContain("import { helper } from './utils.tjs'")
      expect(result.code).toContain('internal.__tjs')
      expect(result.code).toContain('api.__tjs')
      expect(result.code).toContain('export function api')
    })

    it('should preserve import * as syntax', () => {
      const result = transpileToJS(`
        import * as math from './math.tjs'
        function main() {
          return math.add(1, 2)
        }
      `)
      expect(result.code).toContain("import * as math from './math.tjs'")
    })

    it('should preserve default import syntax', () => {
      const result = transpileToJS(`
        import Calculator from './calc.tjs'
        function main() {
          return new Calculator()
        }
      `)
      expect(result.code).toContain("import Calculator from './calc.tjs'")
    })

    it('should generate inline validation for exported functions', () => {
      const result = transpileToJS(
        `
        export function add(a: 0, b: 0) -> 0 {
          return a + b
        }
      `,
        { runTests: false }
      )
      // Should have inline validation (integer check for integer examples)
      expect(result.code).toContain('Number.isInteger(a)')
      expect(result.code).toContain('__tjs.typeError')
    })

    it('should not run signature tests for functions in comments', () => {
      const result = transpileToJS(
        `
/*#
# Example

\`\`\`javascript
export function add(a: 0, b: 0) -> 0 {
  return a + b
}
\`\`\`
*/

function realFunction(x: 5) -> 10 {
  return x * 2
}
      `,
        { runTests: 'report' }
      )
      // Should only have 1 signature test (realFunction), not 2
      const sigTests =
        result.testResults?.filter((t) => t.isSignatureTest) || []
      expect(sigTests.length).toBe(1)
      expect(sigTests[0].description).toContain('realFunction')
    })

    it('should use resolvedImports for test execution', () => {
      // Simulate a dependency module that provides an 'add' function
      const mathModuleCode = `
function add(a = 0, b = 0) {
  return a + b
}
add.__tjs = { params: { a: { type: { kind: 'number' } }, b: { type: { kind: 'number' } } } }
`
      // Main module imports and uses 'add'
      const mainSource = `
import { add } from 'mymath'

function doubleAdd(x: 5) -> 20 {
  return add(x, x) * 2
}
`
      // Without resolvedImports, test would fail because 'add' is not defined
      // With resolvedImports, the dependency code is injected
      const result = transpileToJS(mainSource, {
        runTests: 'report',
        resolvedImports: { mymath: mathModuleCode },
      })

      // Test should pass because 'add' was resolved
      expect(result.testResults).toBeDefined()
      expect(result.testResults!.length).toBe(1)
      expect(result.testResults![0].passed).toBe(true)
      expect(result.testResults![0].description).toContain('doubleAdd')
    })

    it('should handle test blocks with resolvedImports', () => {
      const mathModuleCode = `
function multiply(a = 0, b = 0) {
  return a * b
}
multiply.__tjs = { params: { a: { type: { kind: 'number' } }, b: { type: { kind: 'number' } } } }
`
      const mainSource = `
import { multiply } from 'mymath'

function square(x: 0) -> 0 {
  return multiply(x, x)
}

test('square uses multiply') {
  expect(square(4)).toBe(16)
}
`
      const result = transpileToJS(mainSource, {
        runTests: 'report',
        resolvedImports: { mymath: mathModuleCode },
      })

      // Both signature test and explicit test should pass
      expect(result.testResults).toBeDefined()
      expect(result.testResults!.length).toBe(2)
      expect(result.testResults!.every((t) => t.passed)).toBe(true)
    })
  })
})
