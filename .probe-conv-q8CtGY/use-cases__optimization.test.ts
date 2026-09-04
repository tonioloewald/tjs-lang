/* tjs <- input.ts */

import { describe, it, expect, mock } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { s } from 'tosijs-schema'

/* line 7 */
function exprMinus(varName, offset) {
  return {
    $expr: 'binary',
    op: '-',
    left: { $expr: 'ident', name: varName },
    right: { $expr: 'literal', value: offset },
  }
}
exprMinus.__tjs = {
  params: {
    varName: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    offset: {
      type: {
        kind: 'number',
      },
      required: true,
      default: null,
    },
  },
  unsafe: true,
  source: 'input.ts:7',
}

/* line 15 */
function exprAddMembers(obj1, prop1, obj2, prop2) {
  return {
    $expr: 'binary',
    op: '+',
    left: {
      $expr: 'member',
      object: { $expr: 'ident', name: obj1 },
      property: prop1,
    },
    right: {
      $expr: 'member',
      object: { $expr: 'ident', name: obj2 },
      property: prop2,
    },
  }
}
exprAddMembers.__tjs = {
  params: {
    obj1: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    prop1: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    obj2: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    prop2: {
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

describe('Use Case: Optimization', () => {
  it('should memoize expensive operations within a run', async () => {
    let calls = 0

    const expensiveAtom = {
      op: 'expensive',
      inputSchema: s.any,
      create: (input) => ({ op: 'expensive', ...input }),
      exec: async (step, ctx) => {
        calls++
        ctx.state[step.result] = 'done'
      },
    }
    const customVM = new AgentVM({ expensive: expensiveAtom })
    const builder = customVM.Agent
    const logic = builder
      .memoize((b) => b.step({ op: 'expensive' }).as('res1'), 'myKey')
      .memoize((b) => b.step({ op: 'expensive' }).as('res2'), 'myKey')
      .return(s.object({}))
    await customVM.run(logic.toJSON(), {})

    expect(calls).toBe(1)
  })
  it('should cache operations across runs using store capability', async () => {
    const caps = {
      store: {
        get: mock(async (key) => {
          if (key === 'cache:persistentKey')
            return { val: 'cachedValue', _exp: Date.now() + 10000 }
          return null
        }),
        set: mock(async () => {}),
      },
    }
    const vm = new AgentVM()
    const logic = Agent.take(s.object({}))
      .cache(
        (b) => b.varSet({ key: 'res', value: 'computed' }).as('res'),
        'persistentKey'
      )
      .as('result')
      .return(s.object({ result: s.string }))
    const result = await vm.run(logic.toJSON(), {}, { capabilities: caps })
    expect(result.result.result).toBe('cachedValue')

    expect(caps.store.set).not.toHaveBeenCalled()
  })
  it('should compute and store if cache miss', async () => {
    const caps = {
      store: {
        get: mock(async () => null),
        set: mock(async () => {}),
      },
    }
    const vm = new AgentVM()
    const logic = Agent.take(s.object({}))
      .cache(
        (b) =>
          b
            .varSet({ key: 'res', value: 'computed' })
            .varSet({ key: 'result', value: 'computed' })
            .as('res'),
        'missKey'
      )
      .as('result')
      .return(s.object({ result: s.string }))
    const result = await vm.run(logic.toJSON(), {}, { capabilities: caps })
    expect(result.result.result).toBe('computed')
    expect(caps.store.set).toHaveBeenCalled()
  })
  it('should optimize recursive fibonacci with caching', async () => {
    const store = new Map()
    const caps = {
      store: {
        get: mock(async (key) => store.get(key)),
        set: mock(async (key, val) => {
          store.set(key, val)
        }),
      },
      agent: {
        run: async (id, input) => {
          if (id === 'fib') {
            const res = await vm.run(fibLogic.toJSON(), input, {
              capabilities: caps,
              fuel: 50000,
            })
            return res.result
          }
          throw new Error('Unknown agent')
        },
      },
    }
    const vm = new AgentVM()
    const fibLogic = Agent.take(s.object({ n: s.number }))
      .varSet({ key: 'n', value: Agent.args('n') })
      .if(
        'n < 2',
        { n: 'n' },
        (b) => b.varSet({ key: 'result', value: 'n' }),
        (b) =>
          b
            .cache(
              (c) =>
                c
                  .varSet({ key: 'n1', value: exprMinus('n', 1) })
                  .agentRun({ agentId: 'fib', input: { n: 'n1' } })
                  .as('r1')
                  .varSet({ key: 'n2', value: exprMinus('n', 2) })
                  .agentRun({ agentId: 'fib', input: { n: 'n2' } })
                  .as('r2')
                  .varSet({
                    key: 'result',
                    value: exprAddMembers('r1', 'result', 'r2', 'result'),
                  }),
              'fib_{{n}}'
            )
            .as('result')
      )
      .return(s.object({ result: s.number }))

    const fibWithKey = Agent.take(s.object({ n: s.number }))
      .varSet({ key: 'n', value: Agent.args('n') })
      .if(
        'n < 2',
        { n: 'n' },
        (b) => b.varSet({ key: 'result', value: 'n' }),
        (b) =>
          b
            .template({ tmpl: 'fib_{{n}}', vars: { n: 'n' } })
            .as('cacheKey')
            .cache(
              (c) =>
                c
                  .varSet({ key: 'n1', value: exprMinus('n', 1) })
                  .agentRun({ agentId: 'fib', input: { n: 'n1' } })
                  .as('r1')
                  .varSet({ key: 'n2', value: exprMinus('n', 2) })
                  .agentRun({ agentId: 'fib', input: { n: 'n2' } })
                  .as('r2')
                  .varSet({
                    key: 'result',
                    value: exprAddMembers('r1', 'result', 'r2', 'result'),
                  }),
              'cacheKey'
            )
            .as('result')
      )
      .return(s.object({ result: s.number }))

    caps.agent.run = async (id, input) => {
      if (id === 'fib') {
        const res = await vm.run(fibWithKey.toJSON(), input, {
          capabilities: caps,
          fuel: 50000,
        })
        return res.result
      }
      throw new Error('Unknown agent')
    }

    const run1 = await vm.run(
      fibWithKey.toJSON(),
      { n: 5 },
      { capabilities: caps }
    )
    expect(run1.result.result).toBe(5)
    const fuel1 = run1.fuelUsed

    const run2 = await vm.run(
      fibWithKey.toJSON(),
      { n: 5 },
      { capabilities: caps }
    )
    expect(run2.result.result).toBe(5)
    const fuel2 = run2.fuelUsed
    console.log(`Fib(5) fuel: ${fuel1} vs ${fuel2}`)
    expect(fuel2).toBeLessThan(fuel1)

    const runBig = await vm.run(
      fibWithKey.toJSON(),
      { n: 20 },
      { capabilities: caps, fuel: 100000 }
    )

    expect(runBig.result.result).toBe(6765)
  })
  it('should memoize without a key', async () => {
    let calls = 0
    const expensiveAtom = {
      op: 'expensive',
      inputSchema: s.any,
      create: (input) => ({ op: 'expensive', ...input }),
      exec: async (step, ctx) => {
        calls++
        ctx.state[step.result] = 'done'
      },
    }
    const customVM = new AgentVM({ expensive: expensiveAtom })
    const builder = customVM.Agent
    const logic = builder
      .memoize((b) => b.step({ op: 'expensive' }).as('res1'))
      .memoize((b) => b.step({ op: 'expensive' }).as('res2'))
      .return(s.object({}))
    await customVM.run(logic.toJSON(), {})
    expect(calls).toBe(1)
  })
  it('should cache without a key', async () => {
    const store = new Map()
    const caps = {
      store: {
        get: mock(async (key) => store.get(key)),
        set: mock(async (key, value) => store.set(key, value)),
      },
    }
    const vm = new AgentVM()
    const logic = Agent.take(s.object({}))
      .cache((b) =>
        b
          .varSet({ key: 'res', value: 'computed' })
          .varSet({ key: 'result', value: 'computed' })
          .as('res')
      )
      .as('result')
      .return(s.object({ result: s.string }))
    await vm.run(logic.toJSON(), {}, { capabilities: caps })
    await vm.run(logic.toJSON(), {}, { capabilities: caps })
    expect(caps.store.set).toHaveBeenCalledTimes(1)
  })
})
