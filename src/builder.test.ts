import { describe, it, expect } from 'bun:test'
import { A99 } from './builder'
import { s } from 'tosijs-schema'

describe('Agent99 Builder', () => {
  it('should build a simple math chain', () => {
    const chain = A99.take(
      s.object({
        price: s.number,
        tax: s.number,
      })
    )
      .calc('price * (1 + tax)', {
        price: A99.args('price'),
        tax: A99.args('tax'),
      })
      .as('total')
      .return(s.object({ total: s.number }))

    const ast = chain.toJSON()

    expect(ast.op).toBe('seq')
    expect(ast.steps).toHaveLength(2) // calc + return

    const calcStep = ast.steps[0]
    expect(calcStep.op).toBe('math.calc')
    expect(calcStep.result).toBe('total')
    expect(calcStep.expr).toBe('price * (1 + tax)')
    expect(calcStep.vars).toEqual({
      price: { $kind: 'arg', path: 'price' },
      tax: { $kind: 'arg', path: 'tax' },
    })

    const returnStep = ast.steps[1]
    expect(returnStep.op).toBe('return')
    expect(returnStep.schema).toBeDefined()
    // Verify schema structure roughly (JSON schema)
    expect(returnStep.schema.type).toBe('object')
    expect(returnStep.schema.properties.total.type).toBe('number')
  })

  it('should throw error when using .as() at start of chain', () => {
    expect(() => {
      A99.take(s.object({})).as('fail')
    }).toThrow('A99 Builder Error: .as() called without a preceding operation.')
  })

  it('should generate arg references correctly', () => {
    const arg = A99.args('user.id')
    expect(arg).toEqual({ $kind: 'arg', path: 'user.id' })
  })

  it('should allow chaining multiple operations', () => {
    const chain = A99.take(s.object({ x: s.number }))
      .calc('x * 2', { x: A99.args('x') })
      .as('doubleX')
      .calc('doubleX + 10', { doubleX: A99.args('doubleX') })
      .as('result')
      .return(s.object({ result: s.number }))

    const ast = chain.toJSON()
    expect(ast.steps).toHaveLength(3) // calc, calc, return
    expect(ast.steps[0].result).toBe('doubleX')
    expect(ast.steps[1].result).toBe('result')
  })
})
