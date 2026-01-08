import { describe, it, expect } from 'bun:test'
import { Agent } from './builder'
import { s } from 'tosijs-schema'
import { ajs } from './transpiler'
import { AgentVM } from './vm'

describe('Agent99 Builder', () => {
  it('should build a simple varSet chain', () => {
    const chain = Agent.take(s.object({ price: s.number, tax: s.number }))
      .varsImport(['price', 'tax'])
      .varSet({ key: 'total', value: 100 })
      .return(s.object({ total: s.number }))

    const ast = chain.toJSON()

    expect(ast.op).toBe('seq')
    expect(ast.steps).toHaveLength(3) // varsImport, varSet, return

    const returnStep = ast.steps[2]
    expect(returnStep.op).toBe('return')
    expect(returnStep.schema).toBeDefined()
  })

  it('should throw error when using .as() at start of chain', () => {
    expect(() => {
      Agent.take(s.object({})).as('fail')
    }).toThrow('No step to capture')
  })

  it('should generate arg references correctly', () => {
    const arg = Agent.args('user.id')
    expect(arg).toEqual({ $kind: 'arg', path: 'user.id' })
  })

  it('should allow chaining multiple operations', () => {
    const chain = Agent.take(s.object({ x: s.number }))
      .varsImport(['x'])
      .varSet({ key: 'doubleX', value: 20 })
      .varSet({ key: 'result', value: 30 })
      .return(s.object({ result: s.number }))

    const ast = chain.toJSON()
    expect(ast.steps).toHaveLength(4) // varsImport, varSet, varSet, return
  })

  it('should support template atom', async () => {
    const chain = Agent.take(s.object({ name: s.string }))
      .varsImport(['name'])
      .template({ tmpl: 'Hello, {{name}}!', vars: { name: 'name' } })
      .as('greeting')
      .return(s.object({ greeting: s.string }))

    const vm = new AgentVM()
    const result = await vm.run(chain.toJSON(), { name: 'World' })
    expect(result.result.greeting).toBe('Hello, World!')
  })

  it('should support if/else with conditions', () => {
    const chain = Agent.take(s.object({ x: s.number }))
      .varsImport(['x'])
      .if(
        'x > 5',
        { x: 'x' },
        (b) => b.varSet({ key: 'result', value: 'big' }),
        (b) => b.varSet({ key: 'result', value: 'small' })
      )
      .return(s.object({ result: s.string }))

    const ast = chain.toJSON()
    expect(ast.steps).toHaveLength(3) // varsImport, if, return
    expect(ast.steps[1].op).toBe('if')
    expect(ast.steps[1].condition).toBeDefined()
    expect(ast.steps[1].condition.$expr).toBe('binary')
  })
})

describe('JS Transpiler for Math', () => {
  it('should handle arithmetic expressions', async () => {
    const ast = ajs(`
      function calc({ a, b }) {
        let sum = a + b
        return { sum }
      }
    `)

    const vm = new AgentVM()
    const result = await vm.run(ast, { a: 5, b: 3 })
    expect(result.result.sum).toBe(8)
  })

  it('should handle complex math expressions', async () => {
    const ast = ajs(`
      function calc({ a, b, c }) {
        let result = (a + b) * c / 2
        return { result }
      }
    `)

    const vm = new AgentVM()
    const result = await vm.run(ast, { a: 10, b: 20, c: 3 })
    expect(result.result.result).toBe(45)
  })

  it('should handle multiplication', async () => {
    const ast = ajs(`
      function calc({ price, tax }) {
        let total = price * (1 + tax)
        return { total }
      }
    `)

    const vm = new AgentVM()
    const result = await vm.run(ast, { price: 100, tax: 0.1 })
    expect(result.result.total).toBeCloseTo(110)
  })
})
