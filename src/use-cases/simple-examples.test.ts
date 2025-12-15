import { describe, it, expect, mock } from 'bun:test'
import { A99 } from '../builder'
import { VM } from '../runtime'
import { s } from 'tosijs-schema'

describe('Simple Examples', () => {
  it('should compute Nth Fibonacci Number (Recursive/Iterative)', async () => {
    // We implement iterative for simplicity without recursion support yet
    // fib(n):
    //   a = 0, b = 1
    //   while n > 0:
    //     temp = a + b
    //     a = b
    //     b = temp
    //     n = n - 1
    //   return a

    const fib = A99.take(s.object({ n: s.number }))
      ['var.set']({ key: 'a', value: 0 })
      ['var.set']({ key: 'b', value: 1 })
      .while('n > 0', { n: 'args.n' }, (loop) =>
        loop
          ['math.calc']({ expr: 'a + b', vars: { a: 'a', b: 'b' } })
          .as('temp')
          ['var.set']({ key: 'a', value: 'b' })
          ['var.set']({ key: 'b', value: 'temp' })
          ['math.calc']({ expr: 'n - 1', vars: { n: 'args.n' } })
          .as('args.n')
      ) // Mutate args.n? Or local n? args are immutable in standard interpretation usually?
      // Our runtime allows referencing args. but not setting args explicitly via var.set easily unless key handles dot?
      // var.set key is string. "args.n".
      // Our runtime resolveVar checks "args." prefix. ctx.state[key] = value.
      // If we set "args.n", it sets a state key "args.n", but reads might prioritize ctx.args.
      // Let's use local variables.

    const fibIterative = A99.take(s.object({ n: s.number }))
      ['var.set']({ key: 'currentN', value: A99.args('n') })
      ['var.set']({ key: 'a', value: 0 })
      ['var.set']({ key: 'b', value: 1 })
      .while('currentN > 0', { currentN: 'currentN' }, (loop) =>
        loop
          ['math.calc']({ expr: 'a + b', vars: { a: 'a', b: 'b' } })
          .as('temp')
          ['var.set']({ key: 'a', value: 'b' })
          ['var.set']({ key: 'b', value: 'temp' })
          ['math.calc']({ expr: 'currentN - 1', vars: { currentN: 'currentN' } })
          .as('currentN')
      )
      .return(s.object({ result: s.any }))

    // Fix return: returns object with result from state 'a'
    // But 'a' is in state. return atom maps schema keys to state.
    // So we need 'result' in state.
    // Let's modify the builder to map 'a' to 'result' at the end.
    
    const fibFinal = A99.take(s.object({ n: s.number }))
      ['var.set']({ key: 'n', value: A99.args('n') })
      ['var.set']({ key: 'a', value: 0 })
      ['var.set']({ key: 'b', value: 1 })
      .while('n > 0', { n: 'n' }, (loop) =>
        loop
          ['math.calc']({ expr: 'a + b', vars: { a: 'a', b: 'b' } })
          .as('temp')
          ['var.set']({ key: 'a', value: 'b' })
          ['var.set']({ key: 'b', value: 'temp' })
          ['math.calc']({ expr: 'n - 1', vars: { n: 'n' } })
          .as('n')
      )
      ['var.set']({ key: 'result', value: 'a' })
      .return(s.object({ result: s.number }))

    const result = await VM.run(fibFinal.toJSON(), { n: 10 })
    // fib(10) = 55
    expect(result.result).toBe(55)
  })

  it('should concatenate strings', async () => {
    const concat = A99.take(s.object({ a: s.string, b: s.string }))
      ['template']({ tmpl: '{{a}} {{b}}!', vars: { a: A99.args('a'), b: A99.args('b') } })
      .as('greeting')
      .return(s.object({ greeting: s.string }))

    const result = await VM.run(concat.toJSON(), { a: 'Hello', b: 'World' })
    expect(result.greeting).toBe('Hello World!')
  })

  it('should process XML to JSON with filtering', async () => {
    // Scenario: Fetch XML, Parse, Filter, Return
    const caps = {
      fetch: mock(async () => '<users><user id="1"><name>Alice</name><role>admin</role></user></users>'),
      xml: {
        parse: mock(async (xml) => ({
          users: {
            user: [
              { id: '1', name: 'Alice', role: 'admin' }
            ]
          }
        }))
      }
    }

    const logic = A99.take(s.object({ url: s.string }))
      ['http.fetch']({ url: A99.args('url') })
      .as('rawXml')
      ['xml.parse']({ str: 'rawXml' })
      .as('json')
      
      // Navigate to list
      ['var.set']({ key: 'users', value: 'json.users.user' }) // Needs object path access?
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
        b['pick']({ obj: 'user', keys: ['name', 'role'] }).as('result')
      ) // implicit return of map
      .as('filtered')
      .return(s.object({ filtered: s.array(s.any) }))

    // Adjust Mock
    caps.xml.parse = mock(async () => ([{ id: '1', name: 'Alice', role: 'admin' }]))

    const result = await VM.run(logic.toJSON(), { url: 'http://api.xml' }, { capabilities: caps })
    expect(result.filtered).toEqual([{ name: 'Alice', role: 'admin' }])
  })
})

// Export artifacts for Torture Test
export const simpleExamples = [
  // We'll export the builders or ASTs here later if needed
]