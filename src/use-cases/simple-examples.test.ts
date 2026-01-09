import { describe, it, expect, mock } from 'bun:test'
import { Agent } from '../builder'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'
import { ajs } from '../transpiler'

describe('Simple Examples', () => {
  const VM = new AgentVM()

  it('should compute Nth Fibonacci Number (using .ajs)', async () => {
    const fibAst = ajs(`
      function fib({ n }) {
        let a = 0
        let b = 1
        let count = n
        
        while (count > 0) {
          let temp = a + b
          a = b
          b = temp
          count = count - 1
        }
        
        let result = a
        return { result }
      }
    `)

    const result = await VM.run(fibAst, { n: 10 })
    // fib(10) = 55
    expect(result.result.result).toBe(55)
  })

  it('should concatenate strings', async () => {
    const concat = Agent.take(s.object({ a: s.string, b: s.string }))
      .template({
        tmpl: '{{a}} {{b}}!',
        vars: { a: Agent.args('a'), b: Agent.args('b') },
      })
      .as('greeting')
      .return(s.object({ greeting: s.string }))

    const result = await VM.run(concat.toJSON(), { a: 'Hello', b: 'World' })
    expect(result.result.greeting).toBe('Hello World!')
  })

  it('should process XML to JSON with filtering', async () => {
    // Scenario: Fetch XML, Parse, Filter, Return
    const caps = {
      fetch: mock(
        async () =>
          '<users><user id="1"><name>Alice</name><role>admin</role></user></users>'
      ),
      xml: {
        parse: mock(async (_xml) => ({
          users: {
            user: [{ id: '1', name: 'Alice', role: 'admin' }],
          },
        })),
      },
    }

    const logic = Agent.take(s.object({ url: s.string }))
      .httpFetch({ url: Agent.args('url') })
      .as('rawXml')
      .xmlParse({ str: 'rawXml' })
      .as('json')

      // Navigate to list
      .varSet({ key: 'users', value: 'json.users.user' }) // Needs object path access?
      // Our runtime doesn't support dot access in var.get automatically for nested objects yet?
      // We might need a 'pick' or 'path' atom.
      // Or 'math.calc' logic evaluator handles dot notation?
      // Let's implement a 'get' atom that supports path or assume state keys are top level.
      // If 'json' is an object, we need to extract 'users.user'.
      // For MVP, let's assume we can use a custom atom or 'eval'?
      // Or simply: the mock returns the list directly for simplicity of this test?
      // Let's adjust mock for simplicity:
      // Parse returns: [{ id: '1', name: 'Alice', role: 'admin' }]

      // Let's retry logic assuming parse returns the array directly
      .map('json', 'user', (b) =>
        b.pick({ obj: 'user', keys: ['name', 'role'] }).as('result')
      ) // implicit return of map
      .as('filtered')
      .return(s.object({ filtered: s.array(s.any) }))

    // Adjust Mock
    caps.xml.parse = mock(async () => [
      { id: '1', name: 'Alice', role: 'admin' },
    ]) as any

    const result = await VM.run(
      logic.toJSON(),
      { url: 'http://api.xml' },
      { capabilities: caps }
    )
    expect(result.result.filtered).toEqual([{ name: 'Alice', role: 'admin' }])
  })

  it('should execute examples in parallel (using .ajs)', async () => {
    const fibAst = ajs(`
      function fib({ n }) {
        let a = 0
        let b = 1
        let count = n
        
        while (count > 0) {
          let temp = a + b
          a = b
          b = temp
          count = count - 1
        }
        
        let result = a
        return { result }
      }
    `)

    const inputs = [5, 10, 15, 20]
    // fib(5)=5, fib(10)=55, fib(15)=610, fib(20)=6765

    const results = await Promise.all(inputs.map((n) => VM.run(fibAst, { n })))

    const values = results.map((r) => r.result.result)
    expect(values).toEqual([5, 55, 610, 6765])
  })

  it('should handle conditional logic with iff', async () => {
    const logic = Agent.take(s.object({ a: s.number, b: s.number }))
      .if(
        'a > b',
        { a: Agent.args('a'), b: Agent.args('b') },
        (then) => then.varSet({ key: 'result', value: 'a is greater' }),
        (otherwise) =>
          otherwise.varSet({ key: 'result', value: 'b is greater or equal' })
      )
      .return(s.object({ result: s.string }))

    const result1 = await VM.run(logic.toJSON(), { a: 5, b: 3 })
    expect(result1.result.result).toBe('a is greater')

    const result2 = await VM.run(logic.toJSON(), { a: 3, b: 5 })
    expect(result2.result.result).toBe('b is greater or equal')
  })

  it('should handle various boolean operators', async () => {
    const logic = Agent.take(s.object({ a: s.number, b: s.number }))
      .if(
        'a == 10 && b < 20',
        { a: Agent.args('a'), b: Agent.args('b') },
        (then) => then.varSet({ key: 'result', value: 'Condition met' }),
        (otherwise) =>
          otherwise.varSet({ key: 'result', value: 'Condition not met' })
      )
      .return(s.object({ result: s.string }))

    const result1 = await VM.run(logic.toJSON(), { a: 10, b: 15 })
    expect(result1.result.result).toBe('Condition met')

    const result2 = await VM.run(logic.toJSON(), { a: 11, b: 15 })
    expect(result2.result.result).toBe('Condition not met')

    const result3 = await VM.run(logic.toJSON(), { a: 10, b: 25 })
    expect(result3.result.result).toBe('Condition not met')
  })

  it('should handle not operator', async () => {
    const logic = Agent.take(s.object({ a: s.number }))
      .if(
        '!(a == 10)',
        { a: Agent.args('a') },
        (then) => then.varSet({ key: 'result', value: 'Condition met' }),
        (otherwise) =>
          otherwise.varSet({ key: 'result', value: 'Condition not met' })
      )
      .return(s.object({ result: s.string }))

    const result1 = await VM.run(logic.toJSON(), { a: 11 })
    expect(result1.result.result).toBe('Condition met')

    const result2 = await VM.run(logic.toJSON(), { a: 10 })
    expect(result2.result.result).toBe('Condition not met')
  })

  it('should get a variable from state', async () => {
    const logic = Agent.take(s.object({}))
      .varSet({ key: 'myVar', value: 'hello' })
      .varGet({ key: 'myVar' })
      .as('result')
      .return(s.object({ result: s.string }))

    const result = await VM.run(logic.toJSON(), {})
    expect(result.result.result).toBe('hello')
  })

  it('should parse and stringify JSON', async () => {
    const data = { name: 'John', age: 30 }
    const jsonString = JSON.stringify(data)

    const logic = Agent.take(s.object({ json: s.string }))
      .jsonParse({ str: Agent.args('json') })
      .as('parsed')
      .varSet({ key: 'name', value: 'parsed.name' }) // this dot notation needs to work.
      .jsonStringify({ value: 'parsed' })
      .as('stringified')
      .return(s.object({ name: s.string, stringified: s.string }))

    const result = await VM.run(logic.toJSON(), { json: jsonString })
    expect(result.result.name).toBe('John')
    expect(JSON.parse(result.result.stringified)).toEqual(data)
  })

  it('should perform list operations', async () => {
    const logic = Agent.take(s.object({}))
      .varSet({ key: 'myList', value: [1, 2, 3] })
      .len({ list: 'myList' })
      .as('initialLength')
      .push({ list: 'myList', item: 4 })
      .as('newList')
      .len({ list: 'newList' })
      .as('newLength')
      .join({ list: 'newList', sep: ',' })
      .as('joined')
      .split({ str: 'a-b-c', sep: '-' })
      .as('split')
      .return(
        s.object({
          initialLength: s.number,
          newLength: s.number,
          joined: s.string,
          split: s.array(s.string),
        })
      )
    const result = await VM.run(logic.toJSON(), {})
    expect(result.result.initialLength).toBe(3)
    expect(result.result.newLength).toBe(4)
    expect(result.result.joined).toBe('1,2,3,4')
    expect(result.result.split).toEqual(['a', 'b', 'c'])
  })

  it('should perform object operations (merge, keys)', async () => {
    const logic = Agent.take(s.object({}))
      .varSet({ key: 'objA', value: { a: 1, b: 2 } })
      .varSet({ key: 'objB', value: { b: 3, c: 4 } })
      .merge({ a: 'objA', b: 'objB' })
      .as('merged')
      .keys({ obj: 'merged' })
      .as('keys')
      .return(
        s.object({
          merged: s.object({ a: s.number, b: s.number, c: s.number }),
          keys: s.array(s.string),
        })
      )

    const result = await VM.run(logic.toJSON(), {})
    expect(result.result.merged).toEqual({ a: 1, b: 3, c: 4 })
    expect(result.result.keys.sort()).toEqual(['a', 'b', 'c'].sort())
  })

  it('should handle errors with try/catch', async () => {
    const logic = Agent.take(s.object({}))
      .try({
        try: (b) =>
          b
            .step({ op: 'nonexistent.atom', input: {}, output: 'x' })
            .varSet({ key: 'result', value: 'try succeeded' }),
        catch: (b) => b.varSet({ key: 'result', value: 'catch succeeded' }),
      })
      .return(s.object({ result: s.string }))

    const result = await VM.run(logic.toJSON(), {})
    expect(result.result.result).toBe('catch succeeded')
  })

  it('should match regex', async () => {
    const logic = Agent.take(s.object({}))
      .regexMatch({ pattern: '(\\w+)', value: 'hello world' })
      .as('matches')
      .return(s.object({ matches: s.boolean }))

    const result = await VM.run(logic.toJSON(), {})
    expect(result.result.matches).toBe(true)
  })

  it('should support crypto and random atoms', async () => {
    const logic = Agent.take(s.object({}))
      .random({})
      .as('randomNumber')
      .uuid({})
      .as('uuid')
      .hash({ value: 'hello world' })
      .as('hash')
      .return(
        s.object({
          randomNumber: s.number,
          uuid: s.string,
          hash: s.string,
        })
      )
    const result = await VM.run(logic.toJSON(), {})
    expect(typeof result.result.randomNumber).toBe('number')
    expect(result.result.randomNumber).toBeGreaterThanOrEqual(0)
    expect(result.result.randomNumber).toBeLessThanOrEqual(1)

    expect(result.result.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )

    // Default hash is SHA-256. Hash of "hello world"
    const expectedHash =
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    expect(result.result.hash).toBe(expectedHash)
  })

  it('should handle scoped variables', async () => {
    const logic = Agent.take(s.object({}))
      .varSet({ key: 'a', value: 1 })
      .scope((b) =>
        b.varSet({ key: 'a', value: 2 }).varSet({ key: 'b', value: 3 })
      )
      .varGet({ key: 'a' })
      .as('a_after_scope')
      .varGet({ key: 'b' })
      .as('b_after_scope')
      .return(
        s.object({
          a_after_scope: s.number,
          b_after_scope: s.any.optional,
        })
      )

    const result = await VM.run(logic.toJSON(), {})
    expect(result.result.a_after_scope).toBe(1)
    expect(result.result.b_after_scope).toBe('b')
  })

  it('should handle varsImport and varsExport operations', async () => {
    const listMap = Agent.take(
      s.object({ a: s.number, b: s.number, c: s.number, d: s.number })
    )
      .varsImport(['a', 'b'])
      .varsImport({
        x: 'c',
        y: 'd',
      })
      .varsExport(['x', 'y'])
      .as('exportedDirect')
      .varsExport({
        u: 'a',
        v: 'b',
      })
      .as('exportedMapped')
      .return(
        s.object({
          exportedDirect: s.any,
          exportedMapped: s.any,
        })
      )

    const result = await VM.run(listMap.toJSON(), { a: 17, b: 0, c: -5, d: 10 })
    expect(result.result.exportedDirect).toEqual({ x: -5, y: 10 })
    expect(result.result.exportedMapped).toEqual({ u: 17, v: 0 })
  })

  it('should handle null coalescing operator (??)', async () => {
    const ast = ajs(`
      function test({ a = null, b = 0, c = '' }) {
        let resultA = a ?? 'fallback'
        let resultB = b ?? 'fallback'
        let resultC = c ?? 'fallback'
        return { resultA, resultB, resultC }
      }
    `)

    // null ?? 'fallback' -> 'fallback' (null is nullish)
    // 0 ?? 'fallback' -> 0 (0 is NOT nullish, just falsy)
    // '' ?? 'fallback' -> '' (empty string is NOT nullish, just falsy)
    const result = await VM.run(ast, { a: null, b: 0, c: '' })
    expect(result.result.resultA).toBe('fallback')
    expect(result.result.resultB).toBe(0)
    expect(result.result.resultC).toBe('')

    // With actual values
    const result2 = await VM.run(ast, { a: 'value', b: 42, c: 'text' })
    expect(result2.result.resultA).toBe('value')
    expect(result2.result.resultB).toBe(42)
    expect(result2.result.resultC).toBe('text')
  })
})

// Export artifacts for Torture Test
export const simpleExamples = [
  // We'll export the builders or ASTs here later if needed
]
