/* tjs <- input.ts */

import { describe, it, expect, mock } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { s } from 'tosijs-schema'

/* line 7 */
function exprAdd(a, b) {
  return {
    $expr: 'binary',
    op: '+',
    left: { $expr: 'ident', name: a },
    right: { $expr: 'ident', name: b },
  }
}
exprAdd.__tjs = {
  params: {
    a: {
      type: {
        kind: 'string',
      },
      required: true,
      default: null,
    },
    b: {
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
  source: 'input.ts:15',
}

/* line 23 */
function exprIncrement(varName) {
  return {
    $expr: 'binary',
    op: '+',
    left: { $expr: 'ident', name: varName },
    right: { $expr: 'literal', value: 1 },
  }
}
exprIncrement.__tjs = {
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
  source: 'input.ts:23',
}

/* line 32 */
function createFib() {
  return Agent.take(s.object({ n: s.number }))
    .varSet({ key: 'n', value: Agent.args('n') })
    .varSet({ key: 'a', value: 0 })
    .varSet({ key: 'b', value: 1 })
    .while('n > 0', { n: 'n' }, (loop) =>
      loop
        .varSet({ key: 'temp', value: exprAdd('a', 'b') })
        .varSet({ key: 'a', value: 'b' })
        .varSet({ key: 'b', value: 'temp' })
        .varSet({ key: 'n', value: exprMinus1('n') })
    )
    .varSet({ key: 'result', value: 'a' })
    .return(s.object({ result: s.number }))
}
createFib.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:32',
}

/* line 47 */
function createOrchestrator() {
  return Agent.take(s.object({ items: s.array(s.string) }))
    .varSet({ key: 'results', value: [] })
    .map('args.items', 'item', (b) =>
      b
        .varSet({ key: 'attempts', value: 0 })
        .varSet({ key: 'success', value: false })
        .while(
          '!success && attempts < 3',
          { success: 'success', attempts: 'attempts' },
          (loop) =>
            loop.try({
              try: (tBuilder) =>
                tBuilder
                  .httpFetch({ url: 'item' })
                  .as('res')
                  .varSet({ key: 'result', value: 'res' })
                  .varSet({ key: 'success', value: true }),
              catch: (c) =>
                c.varSet({ key: 'attempts', value: exprIncrement('attempts') }),
            })
        )
    )
    .as('results')
    .return(s.object({ results: s.array(s.any) }))
}
createOrchestrator.__tjs = {
  params: {},
  unsafe: true,
  source: 'input.ts:47',
}

describe('Torture Test', () => {
  it('should run diverse workload in parallel without cross-contamination', async () => {
    const caps = {
      fetch: mock(async (url) => ({ status: 'ok', url })),
    }
    const vm = new AgentVM()

    const count = 100
    const workload = Array.from({ length: count }, (_, i) => {
      const type = i % 2 === 0 ? 'fib' : 'orch'
      if (type === 'fib') {
        return {
          id: i,
          type,
          ast: createFib().toJSON(),
          input: { n: 10 + (i % 5) },
          expected: (n) => {
            let a = 0,
              b = 1
            while (n-- > 0) {
              const t = a + b
              a = b
              b = t
            }
            return a
          },
        }
      } else {
        return {
          id: i,
          type,
          ast: createOrchestrator().toJSON(),
          input: { items: [`req_${i}_a`, `req_${i}_b`] },
          expected: (input) =>
            input.items.map((url) => ({ status: 'ok', url })),
        }
      }
    })

    const startTime = performance.now()
    const results = await Promise.all(
      workload.map(async (task) => {
        try {
          const res = await vm.run(task.ast, task.input, {
            capabilities: caps,
            fuel: 10000,
          })
          return { id: task.id, success: true, data: res.result, task }
        } catch (e) {
          return { id: task.id, success: false, error: e.message, task }
        }
      })
    )
    const duration = performance.now() - startTime

    console.log(`Torture Test: Ran ${count} agents in ${duration.toFixed(2)}ms`)
    results.forEach((res) => {
      if (!res.success) {
        console.error(`Task ${res.id} failed:`, res.error)
      }
      expect(res.success).toBe(true)
      if (res.task.type === 'fib') {
        const expected = res.task.expected(res.task.input.n)
        expect(res.data.result).toBe(expected)
      } else {
        const expected = res.task.expected(res.task.input)
        expect(res.data.results).toEqual(expected)
      }
    })
  })
})
