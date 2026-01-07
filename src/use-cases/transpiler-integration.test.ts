import { describe, it, expect, mock } from 'bun:test'
import { AgentVM } from '../vm'
import { js, transpile, createAgent, getToolDefinitions } from '../transpiler'

describe('Transpiler Integration', () => {
  describe('End-to-end execution', () => {
    it('should transpile and execute a simple function', async () => {
      const ast = js(`
        function greet({ name }) {
          let greeting = template({ tmpl: 'Hello, {{name}}!', vars: { name } })
          return { greeting }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { name: 'World' })

      expect(result.result.greeting).toBe('Hello, World!')
    })

    it('should handle math calculations', async () => {
      const ast = js(`
        function calculate({ a, b }) {
          let sum = a + b
          let product = a * b
          return { sum, product }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { a: 5, b: 3 })

      expect(result.result.sum).toBe(8)
      expect(result.result.product).toBe(15)
    })

    it('should handle conditionals', async () => {
      const ast = js(`
        function checkAge({ age }) {
          let status = 'unknown'
          if (age >= 18) {
            status = 'adult'
          } else {
            status = 'minor'
          }
          return { status }
        }
      `)

      const vm = new AgentVM()

      const adult = await vm.run(ast, { age: 25 })
      expect(adult.result.status).toBe('adult')

      const minor = await vm.run(ast, { age: 15 })
      expect(minor.result.status).toBe('minor')
    })

    it('should handle loops', async () => {
      const ast = js(`
        function countdown({ n }) {
          let count = n
          let iterations = 0
          while (count > 0) {
            count = count - 1
            iterations = iterations + 1
          }
          return { count, iterations }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { n: 5 })

      expect(result.result.count).toBe(0)
      expect(result.result.iterations).toBe(5)
    })

    it('should handle for...of with map', async () => {
      const ast = js(`
        function processItems({ items }) {
          let results = []
          for (const item of items) {
            results = push({ list: results, item: item })
          }
          return { results }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { items: [1, 2, 3] })

      expect(result.result.results).toEqual([1, 2, 3])
    })

    it('should handle try/catch', async () => {
      const ast = js(`
        function safeFetch({ url }) {
          let data = null
          let error = null
          try {
            data = httpFetch({ url })
          } catch (e) {
            error = e
          }
          return { data, error }
        }
      `)

      const vm = new AgentVM()
      // Without a real fetch capability, this should catch the error
      const result = await vm.run(ast, { url: 'http://example.com' })

      // The result depends on whether fetch exists
      expect(result.result).toBeDefined()
    })
  })

  describe('Type signatures', () => {
    it('should extract signatures with colon shorthand', () => {
      const { signature } = transpile(`
        /**
         * Search the database
         * @param query - Search terms
         * @param limit - Max results
         */
        function search(query: 'string', limit = 10) {
          return { query }
        }
      `)

      expect(signature.name).toBe('search')
      expect(signature.description).toBe('Search the database')
      expect(signature.parameters.query.type.kind).toBe('string')
      expect(signature.parameters.query.required).toBe(true)
      expect(signature.parameters.query.description).toBe('Search terms')
      expect(signature.parameters.limit.type.kind).toBe('number')
      expect(signature.parameters.limit.required).toBe(false)
      expect(signature.parameters.limit.default).toBe(10)
      expect(signature.parameters.limit.description).toBe('Max results')
    })

    it('should handle complex type shapes', () => {
      const { signature } = transpile(`
        function processUser(
          user: { name: 'Anne', email: 'anne@example.com', age: 30 },
          options = { verbose: false, format: 'json' }
        ) {
          return { user }
        }
      `)

      expect(signature.parameters.user.type.kind).toBe('object')
      expect(signature.parameters.user.type.shape?.name.kind).toBe('string')
      expect(signature.parameters.user.type.shape?.email.kind).toBe('string')
      expect(signature.parameters.user.type.shape?.age.kind).toBe('number')
      expect(signature.parameters.user.required).toBe(true)

      expect(signature.parameters.options.type.kind).toBe('object')
      expect(signature.parameters.options.required).toBe(false)
    })
  })

  describe('createAgent helper', () => {
    it('should create callable agent with signature', async () => {
      const vm = new AgentVM()

      const greet = createAgent(
        `
        /**
         * Greet a user
         * @param name - User's name
         */
        function greet(name: 'string') {
          let message = template({ tmpl: 'Hello, {{name}}!', vars: { name } })
          return { message }
        }
      `,
        vm
      )

      // Check signature
      expect(greet.signature.name).toBe('greet')
      expect(greet.signature.description).toBe('Greet a user')
      expect(greet.signature.parameters.name.type.kind).toBe('string')

      // Execute
      const result = await greet({ name: 'Alice' })
      expect(result.message).toBe('Hello, Alice!')
    })
  })

  describe('getToolDefinitions', () => {
    it('should generate OpenAI-compatible tool definitions', () => {
      const vm = new AgentVM()

      const search = createAgent(
        `
        /**
         * Search documents
         * @param query - Search query
         * @param limit - Max results
         */
        function search(query: 'string', limit = 10) {
          return { results: [] }
        }
      `,
        vm
      )

      const summarize = createAgent(
        `
        /**
         * Summarize text
         * @param text - Text to summarize
         */
        function summarize(text: 'string') {
          return { summary: text }
        }
      `,
        vm
      )

      const tools = getToolDefinitions({ search, summarize })

      expect(tools).toHaveLength(2)

      const searchTool = tools.find((t) => t.function.name === 'search')
      expect(searchTool).toBeDefined()
      expect(searchTool?.type).toBe('function')
      expect(searchTool?.function.description).toBe('Search documents')
      expect(searchTool?.function.parameters.properties.query.type).toBe(
        'string'
      )
      expect(searchTool?.function.parameters.required).toContain('query')
      expect(searchTool?.function.parameters.required).not.toContain('limit')

      const summarizeTool = tools.find((t) => t.function.name === 'summarize')
      expect(summarizeTool).toBeDefined()
      expect(summarizeTool?.function.description).toBe('Summarize text')
    })
  })

  describe('Array methods with lambdas', () => {
    it('should execute filter with lambda', async () => {
      const ast = js(`
        function filterEvens({ items }) {
          let evens = items.filter(x => x % 2 == 0)
          return { evens }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { items: [1, 2, 3, 4, 5, 6] })

      expect(result.result.evens).toEqual([2, 4, 6])
    })

    it('should execute find with lambda', async () => {
      const ast = js(`
        function findFirst({ items, threshold }) {
          let found = items.find(x => x > threshold)
          return { found }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { items: [1, 2, 3, 4, 5], threshold: 3 })

      expect(result.result.found).toBe(4)
    })

    it('should execute reduce with lambda', async () => {
      const ast = js(`
        function sumItems({ items }) {
          let sum = items.reduce((acc, x) => acc + x, 0)
          return { sum }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { items: [1, 2, 3, 4, 5] })

      expect(result.result.sum).toBe(15)
    })

    it('should chain filter, map, and reduce', async () => {
      const ast = js(`
        function processItems({ items }) {
          let evens = items.filter(x => x % 2 == 0)
          let doubled = evens.map(x => x * 2)
          let sum = doubled.reduce((acc, x) => acc + x, 0)
          return { sum }
        }
      `)

      const vm = new AgentVM()
      // evens: [2, 4, 6], doubled: [4, 8, 12], sum: 24
      const result = await vm.run(ast, { items: [1, 2, 3, 4, 5, 6] })

      expect(result.result.sum).toBe(24)
    })

    it('should access outer scope in lambda (closure)', async () => {
      const ast = js(`
        function filterByThreshold({ items, min }) {
          let above = items.filter(x => x >= min)
          return { above }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { items: [1, 2, 3, 4, 5], min: 3 })

      expect(result.result.above).toEqual([3, 4, 5])
    })

    it('should handle object properties in lambda', async () => {
      const ast = js(`
        function findUser({ users, targetAge }) {
          let user = users.find(u => u.age == targetAge)
          return { user }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {
        users: [
          { name: 'Alice', age: 25 },
          { name: 'Bob', age: 30 },
          { name: 'Carol', age: 35 },
        ],
        targetAge: 30,
      })

      expect(result.result.user).toEqual({ name: 'Bob', age: 30 })
    })
  })

  describe('Real-world patterns', () => {
    it('should handle research agent pattern', async () => {
      // Mock LLM capability
      const mockPredict = mock(async (prompt: string) => {
        if (prompt.includes('summarize')) {
          return 'This is a summary of the topic.'
        }
        return 'Generic response'
      })

      const ast = js(`
        function research({ topic }) {
          let query = template({ tmpl: 'Research about {{topic}}', vars: { topic } })
          let response = llmPredict({ prompt: query })
          return { response }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(
        ast,
        { topic: 'AI' },
        {
          capabilities: {
            llm: { predict: mockPredict },
          },
        }
      )

      expect(result.result.response).toBeDefined()
      expect(mockPredict).toHaveBeenCalled()
    })

    it('should handle validation loop pattern', async () => {
      let attempts = 0
      const mockPredict = mock(async () => {
        attempts++
        // First attempt returns invalid, second returns valid
        return attempts === 1 ? 'invalid' : 'A'
      })

      const ast = js(`
        function validateAnswer({ question }) {
          let answer = ''
          let valid = false
          let tries = 0
          
          while (!valid && tries < 3) {
            answer = llmPredict({ prompt: question })
            tries = tries + 1
            
            if (answer == 'A' || answer == 'B' || answer == 'C' || answer == 'D') {
              valid = true
            }
          }
          
          return { answer, tries, valid }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(
        ast,
        { question: 'Pick A, B, C, or D' },
        {
          capabilities: {
            llm: { predict: mockPredict },
          },
        }
      )

      expect(result.result.valid).toBe(true)
      expect(result.result.answer).toBe('A')
      expect(result.result.tries).toBe(2)
    })
  })

  describe('Monadic error flow', () => {
    it('should skip subsequent steps when an error occurs', async () => {
      const callLog: string[] = []

      const step1 = {
        op: 'step1',
        inputSchema: undefined,
        exec: async (step: any, ctx: any) => {
          callLog.push('step1')
          ctx.state[step.result] = 'step1 done'
        },
        docs: 'Step 1',
      }

      const step2 = {
        op: 'step2',
        inputSchema: undefined,
        exec: async () => {
          callLog.push('step2')
          throw new Error('Step 2 failed')
        },
        docs: 'Step 2 - throws',
      }

      const step3 = {
        op: 'step3',
        inputSchema: undefined,
        exec: async (step: any, ctx: any) => {
          callLog.push('step3')
          ctx.state[step.result] = 'step3 done'
        },
        docs: 'Step 3 - should be skipped',
      }

      const vm = new AgentVM({ step1, step2, step3 } as any)

      const ast = js(`
        function test() {
          let a = step1({})
          let b = step2({})
          let c = step3({})
          return { a, b, c }
        }
      `)

      const result = await vm.run(ast, {})

      // step3 should NOT have been called
      expect(callLog).toEqual(['step1', 'step2'])
      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Step 2 failed')
    })

    it('should allow try/catch to recover from errors', async () => {
      const callLog: string[] = []

      const failingStep = {
        op: 'failingStep',
        inputSchema: undefined,
        exec: async () => {
          callLog.push('failingStep')
          throw new Error('This step fails')
        },
        docs: 'Failing step',
      }

      const recoveryStep = {
        op: 'recoveryStep',
        inputSchema: undefined,
        exec: async (step: any, ctx: any) => {
          callLog.push('recoveryStep')
          ctx.state[step.result] = 'recovered'
        },
        docs: 'Recovery step',
      }

      const vm = new AgentVM({ failingStep, recoveryStep } as any)

      const ast = js(`
        function test() {
          let result = 'initial'
          try {
            result = failingStep({})
          } catch (e) {
            result = recoveryStep({})
          }
          return { result }
        }
      `)

      const result = await vm.run(ast, {})

      expect(callLog).toEqual(['failingStep', 'recoveryStep'])
      expect(result.error).toBeUndefined()
      expect(result.result.result).toBe('recovered')
    })

    it('should return error as result when no return statement reached', async () => {
      const failingStep = {
        op: 'failingStep',
        inputSchema: undefined,
        exec: async () => {
          throw new Error('Immediate failure')
        },
        docs: 'Failing step',
      }

      const vm = new AgentVM({ failingStep } as any)

      const ast = js(`
        function test() {
          let x = failingStep({})
          return { x }
        }
      `)

      const result = await vm.run(ast, {})

      expect(result.error).toBeDefined()
      expect(result.error?.message).toBe('Immediate failure')
      // result should also contain the error
      expect(result.result?.$error).toBe(true)
    })
  })

  describe('const support', () => {
    it('should allow const declarations', async () => {
      const ast = js(`
        function test({ x }) {
          const doubled = x * 2
          return { doubled }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { x: 5 })

      expect(result.result.doubled).toBe(10)
    })

    it('should prevent reassignment of const variables', async () => {
      const ast = js(`
        function test({ x }) {
          const value = x
          let dummy = value + 1
          return { value }
        }
      `)

      // Manually modify the AST to attempt reassignment
      // (since the transpiler wouldn't allow this syntax)
      const vm = new AgentVM()

      // First verify normal execution works
      const result = await vm.run(ast, { x: 5 })
      expect(result.result.value).toBe(5)

      // Now create AST that tries to reassign a const
      const badAst = {
        op: 'seq',
        steps: [
          { op: 'constSet', key: 'x', value: 5 },
          { op: 'varSet', key: 'x', value: 10 }, // Should fail
          { op: 'return', schema: { x: {} } },
        ],
      }

      const badResult = await vm.run(badAst, {})
      expect(badResult.error).toBeDefined()
      expect(badResult.error?.message).toContain(
        "Cannot reassign const variable 'x'"
      )
    })

    it('should prevent redeclaring const variables', async () => {
      const vm = new AgentVM()

      const badAst = {
        op: 'seq',
        steps: [
          { op: 'constSet', key: 'x', value: 5 },
          { op: 'constSet', key: 'x', value: 10 }, // Should fail
          { op: 'return', schema: { x: {} } },
        ],
      }

      const result = await vm.run(badAst, {})
      expect(result.error).toBeDefined()
      expect(result.error?.message).toContain(
        "Cannot reassign const variable 'x'"
      )
    })

    it('should handle const with atom result', async () => {
      const ast = js(`
        function test({ items }) {
          const doubled = items.map(x => x * 2)
          return { doubled }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { items: [1, 2, 3] })

      expect(result.result.doubled).toEqual([2, 4, 6])
    })
  })

  describe('Optional chaining', () => {
    it('should return undefined for null object with ?.', async () => {
      const ast = js(`
        function test({ user }) {
          let name = user?.name
          return { name }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { user: null })

      expect(result.result.name).toBeUndefined()
    })

    it('should return property value for non-null object with ?.', async () => {
      const ast = js(`
        function test({ user }) {
          let name = user?.name
          return { name }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, { user: { name: 'Alice' } })

      expect(result.result.name).toBe('Alice')
    })

    it('should handle nested optional chaining', async () => {
      const ast = js(`
        function test({ user }) {
          let city = user?.address?.city
          return { city }
        }
      `)

      const vm = new AgentVM()

      // Full path exists
      const result1 = await vm.run(ast, {
        user: { address: { city: 'NYC' } },
      })
      expect(result1.result.city).toBe('NYC')

      // Intermediate is null
      const result2 = await vm.run(ast, { user: { address: null } })
      expect(result2.result.city).toBeUndefined()

      // Root is null
      const result3 = await vm.run(ast, { user: null })
      expect(result3.result.city).toBeUndefined()
    })

    it('should handle optional method calls', async () => {
      const ast = js(`
        function test({ str }) {
          let upper = str?.toUpperCase()
          return { upper }
        }
      `)

      const vm = new AgentVM()

      const result1 = await vm.run(ast, { str: 'hello' })
      expect(result1.result.upper).toBe('HELLO')

      const result2 = await vm.run(ast, { str: null })
      expect(result2.result.upper).toBeUndefined()
    })
  })

  describe('Set builtin', () => {
    it('should create a Set and use has/size', async () => {
      const ast = js(`
        function test() {
          let s = Set(['a', 'b', 'c'])
          let hasA = s.has('a')
          let hasZ = s.has('z')
          let size = s.size
          return { hasA, hasZ, size }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {})

      expect(result.result.hasA).toBe(true)
      expect(result.result.hasZ).toBe(false)
      expect(result.result.size).toBe(3)
    })

    it('should mutate Set with add/remove', async () => {
      const ast = js(`
        function test() {
          let s = Set(['a', 'b'])
          s.add('c')
          s.remove('a')
          let arr = s.toArray()
          return { arr }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {})

      expect(result.result.arr).toEqual(['b', 'c'])
    })

    it('should create new Sets with union/intersection/diff', async () => {
      const ast = js(`
        function test() {
          let a = Set([1, 2, 3])
          let b = Set([2, 3, 4])
          let unionArr = a.union(b).toArray()
          let interArr = a.intersection(b).toArray()
          let diffArr = a.diff(b).toArray()
          return { unionArr, interArr, diffArr }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {})

      expect(result.result.unionArr.sort()).toEqual([1, 2, 3, 4])
      expect(result.result.interArr.sort()).toEqual([2, 3])
      expect(result.result.diffArr).toEqual([1])
    })

    it('should deduplicate initial items', async () => {
      const ast = js(`
        function test() {
          let s = Set([1, 2, 2, 3, 3, 3])
          return { size: s.size, arr: s.toArray() }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {})

      expect(result.result.size).toBe(3)
      expect(result.result.arr).toEqual([1, 2, 3])
    })
  })

  describe('Date builtin', () => {
    it('should create a Date and access components', async () => {
      const ast = js(`
        function test() {
          let d = Date('2024-06-15T10:30:00Z')
          return { 
            year: d.year, 
            month: d.month, 
            day: d.day,
            hours: d.hours,
            minutes: d.minutes
          }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {})

      expect(result.result.year).toBe(2024)
      expect(result.result.month).toBe(6)
      expect(result.result.day).toBe(15)
    })

    it('should add time to Date', async () => {
      const ast = js(`
        function test() {
          let d = Date('2024-01-15T00:00:00Z')
          let later = d.add({ days: 5, hours: 3 })
          return { original: d.format('date'), later: later.format('date') }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {})

      expect(result.result.original).toBe('2024-01-15')
      expect(result.result.later).toBe('2024-01-20')
    })

    it('should calculate diff between Dates', async () => {
      const ast = js(`
        function test() {
          let a = Date('2024-01-15T00:00:00Z')
          let b = Date('2024-01-10T00:00:00Z')
          let diffDays = a.diff(b, 'days')
          return { diffDays }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {})

      expect(result.result.diffDays).toBe(5)
    })

    it('should format Dates', async () => {
      const ast = js(`
        function test() {
          let d = Date('2024-06-15T14:30:45Z')
          return { 
            iso: d.format('ISO'),
            date: d.format('date'),
            custom: d.format('YYYY-MM-DD')
          }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {})

      expect(result.result.iso).toContain('2024-06-15')
      expect(result.result.date).toBe('2024-06-15')
      expect(result.result.custom).toBe('2024-06-15')
    })

    it('should compare Dates', async () => {
      const ast = js(`
        function test() {
          let a = Date('2024-01-15')
          let b = Date('2024-01-20')
          return { 
            aBeforeB: a.isBefore(b),
            aAfterB: a.isAfter(b)
          }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {})

      expect(result.result.aBeforeB).toBe(true)
      expect(result.result.aAfterB).toBe(false)
    })

    it('should create Date() with no args for current time', async () => {
      const ast = js(`
        function test() {
          let now = Date()
          return { hasValue: now.value.length > 0, hasTimestamp: now.timestamp > 0 }
        }
      `)

      const vm = new AgentVM()
      const result = await vm.run(ast, {})

      expect(result.result.hasValue).toBe(true)
      expect(result.result.hasTimestamp).toBe(true)
    })
  })
})
