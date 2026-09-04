/* tjs <- input.ts */

import { describe, it, expect, mock } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { defineAtom } from '/Users/tonioloewald/tjs-lang/src/runtime'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { s } from 'tosijs-schema'

describe('Use Case: Orchestrator', () => {
  it('should orchestrate tasks with retry logic and error recovery', async () => {
    const attempts = { item_0: 0, item_1: 0, item_2: 0 }
    const caps = {
      fetch: mock(async (url) => {
        const item = url
        attempts[item] = (attempts[item] || 0) + 1
        if (item === 'item_0') return { status: 'ok', id: 0 }
        if (item === 'item_1') {
          if (attempts[item] === 1) throw new Error('Network Error')
          return { status: 'ok', id: 1 }
        }
        if (item === 'item_2') throw new Error('Persistent Error')
        return { status: 'unknown' }
      }),
    }

    const sleepAtom = defineAtom(
      'sleep',
      s.object({ ms: s.number }),
      undefined,
      async () => {},
      { docs: 'Sleep', timeoutMs: 100 }
    )

    const vm = new AgentVM({ sleep: sleepAtom })

    const logic = Agent.custom({ ...vm['atoms'] })
      .varSet({ key: 'results', value: [] })
      .varSet({ key: 'items', value: Agent.args('items') })

      .map('items', 'currentItem', (loop) =>
        loop
          .varSet({ key: 'attempts', value: 0 })
          .varSet({ key: 'success', value: false })
          .varSet({ key: 'result', value: null })

          .while(
            '!success && attempts < 3',
            { success: 'success', attempts: 'attempts' },
            (retry) =>
              retry.try({
                try: (t) =>
                  t
                    .httpFetch({ url: 'currentItem' })
                    .as('fetchRes')
                    .varSet({ key: 'result', value: 'fetchRes' })
                    .varSet({ key: 'success', value: true }),
                catch: (c) =>
                  c

                    .varSet({
                      key: 'attempts',
                      value: {
                        $expr: 'binary',
                        op: '+',
                        left: { $expr: 'ident', name: 'attempts' },
                        right: { $expr: 'literal', value: 1 },
                      },
                    })

                    .step({ op: 'sleep', ms: 100 }),
              })
          )

          .if('!success', { success: 'success' }, (b) =>
            b.varSet({
              key: 'result',
              value: { error: 'Failed after retries' },
            })
          )
      )
      .as('results')
      .return(s.object({ results: s.array(s.any) }))

    const result = await vm.run(
      logic.toJSON(),
      { items: ['item_0', 'item_1', 'item_2'] },
      { capabilities: caps, fuel: 5000 }
    )

    expect(result.result.results).toHaveLength(3)

    expect(result.result.results[0]).toEqual({ status: 'ok', id: 0 })
    expect(attempts.item_0).toBe(1)

    expect(result.result.results[1]).toEqual({ status: 'ok', id: 1 })
    expect(attempts.item_1).toBe(2)

    expect(result.result.results[2]).toEqual({ error: 'Failed after retries' })
    expect(attempts.item_2).toBe(3)
  })
})
