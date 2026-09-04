/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { s } from 'tosijs-schema'

/* line 7 */
function exprMinus1(varName) {
  return {
    $expr: 'binary',
    op: '-',
    left: { $expr: 'ident', name: varName },
    right: { $expr: 'literal', value: 1 },
  }
}
exprMinus1.__tjs = {
  params: {
    varName: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:7',
}

/* line 15 */
function exprMultiplyMember(var1, obj, prop) {
  return {
    $expr: 'binary',
    op: '*',
    left: { $expr: 'ident', name: var1 },
    right: {
      $expr: 'member',
      object: { $expr: 'ident', name: obj },
      property: prop,
    },
  }
}
exprMultiplyMember.__tjs = {
  params: {
    var1: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    obj: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    prop: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:15',
}

describe('Use Case: Recursive Agent', () => {
  const VM = new AgentVM()
  it('should implement a recursive factorial agent', async () => {
    const factorial = Agent.take(s.object({ n: s.number }))
      .varSet({ key: 'n', value: Agent.args('n') })
      .if(
        'n <= 1',
        { n: 'n' },
        (b) =>
          b
            .varSet({ key: 'result', value: 1 })
            .return(s.object({ result: s.number })),
        (b) =>
          b
            .varSet({ key: 'nMinus1', value: exprMinus1('n') })
            .agentRun({ agentId: 'factorial', input: { n: 'nMinus1' } })
            .as('subResult')

            .varSet({
              key: 'result',
              value: exprMultiplyMember('n', 'subResult', 'result'),
            })
            .return(s.object({ result: s.number }))
      )

    const caps = {
      agent: {
        run: async (agentId, input) => {
          if (agentId === 'factorial') {
            const res = await VM.run(factorial.toJSON(), input, {
              capabilities: caps,
              fuel: 100,
            })
            return res.result
          }
          throw new Error(`Unknown agent ${agentId}`)
        },
      },
    }
    const result = await VM.run(
      factorial.toJSON(),
      { n: 5 },
      { capabilities: caps, fuel: 1000 }
    )

    expect(result.result.result).toBe(120)
  })
  it('should enforce fuel limits across recursion if shared (Simulated)', async () => {
    const factorial = Agent.take(s.object({ n: s.number }))
      .varSet({ key: 'n', value: Agent.args('n') })
      .if(
        'n <= 1',
        { n: 'n' },
        (b) => b.varSet({ key: 'result', value: 1 }).return(s.object({})),
        (b) =>
          b
            .varSet({ key: 'nMinus1', value: exprMinus1('n') })
            .agentRun({ agentId: 'factorial', input: { n: 'nMinus1' } })
            .as('subResult')
      )
    const caps = {
      agent: {
        run: async (agentId, input) => {
          return VM.run(factorial.toJSON(), input, {
            capabilities: caps,
            fuel: 0.5,
          })
        },
      },
    }

    const result = await VM.run(
      factorial.toJSON(),
      { n: 10 },
      { capabilities: caps }
    )
    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Out of Fuel')
  })
  it('should handle concurrent recursive agents', async () => {
    const inputs = [5, 6, 5, 6]
    const factorial = Agent.take(s.object({ n: s.number }))
      .varSet({ key: 'n', value: Agent.args('n') })
      .if(
        'n <= 1',
        { n: 'n' },
        (b) =>
          b
            .varSet({ key: 'result', value: 1 })
            .return(s.object({ result: s.number })),
        (b) =>
          b
            .varSet({ key: 'nMinus1', value: exprMinus1('n') })
            .agentRun({ agentId: 'factorial', input: { n: 'nMinus1' } })
            .as('subResult')
            .varSet({
              key: 'result',
              value: exprMultiplyMember('n', 'subResult', 'result'),
            })
            .return(s.object({ result: s.number }))
      )
    const ast = factorial.toJSON()

    const caps = {
      agent: {
        run: async (agentId, input) => {
          if (agentId === 'factorial') {
            const res = await VM.run(ast, input, {
              capabilities: caps,
              fuel: 1000,
            })
            return res.result
          }
          throw new Error(`Unknown agent ${agentId}`)
        },
      },
    }
    const results = await Promise.all(
      inputs.map((n) => VM.run(ast, { n }, { capabilities: caps, fuel: 1000 }))
    )
    const values = results.map((r) => r.result.result)
    expect(values).toEqual([120, 720, 120, 720])
  })
})
