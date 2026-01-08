import { describe, it, expect, mock } from 'bun:test'
import { Agent } from '../builder'
import { defineAtom } from '../runtime'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'

describe('Use Case: Orchestrator', () => {
  it('should orchestrate tasks with retry logic and error recovery', async () => {
    // 1. Mock Flaky Service
    // Request "item_0": Success
    // Request "item_1": Fails once, then Success
    // Request "item_2": Fails always
    const attempts = { item_0: 0, item_1: 0, item_2: 0 }

    const caps = {
      fetch: mock(async (url) => {
        const item = url as keyof typeof attempts
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

    // 2. Custom Sleep Atom (for waiting between retries)
    // We mock it to be instant but logically present
    const sleepAtom = defineAtom(
      'sleep',
      s.object({ ms: s.number }),
      undefined,
      async () => {
        // noop
      }, // Instant
      { docs: 'Sleep', timeoutMs: 100 }
    )

    // 3. Create VM
    // Ensure atom key matches op code for resolution
    const vm = new AgentVM({ sleep: sleepAtom })

    // 4. Build Orchestrator Logic
    // Input: { items: string[] }
    // Output: { results: any[] }

    const logic = Agent.custom({ ...vm['atoms'] })
      .varSet({ key: 'results', value: [] })
      .varSet({ key: 'items', value: Agent.args('items') })

      // Iterate over items
      .map(
        'items',
        'currentItem',
        (loop) =>
          loop
            .varSet({ key: 'attempts', value: 0 })
            .varSet({ key: 'success', value: false })
            .varSet({ key: 'result', value: null })

            // Retry Loop (max 3 attempts)
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
                      // Increment attempts using ExprNode
                      .varSet({
                        key: 'attempts',
                        value: {
                          $expr: 'binary',
                          op: '+',
                          left: { $expr: 'ident', name: 'attempts' },
                          right: { $expr: 'literal', value: 1 },
                        },
                      })
                      // Wait before retry
                      .step({ op: 'sleep', ms: 100 }),
                })
            )

            // Check if failed after retries
            .if('!success', { success: 'success' }, (b) =>
              b.varSet({
                key: 'result',
                value: { error: 'Failed after retries' },
              })
            )

        // Return result for map to collect?
        // Map collects 'result' variable from scope implicitly? No, map implementation pushes `scopedCtx.state['result']`.
        // We set 'result' variable above.
      )
      .as('results')
      .return(s.object({ results: s.array(s.any) }))

    // 5. Execute
    const result = await vm.run(
      logic.toJSON(),
      { items: ['item_0', 'item_1', 'item_2'] },
      { capabilities: caps, fuel: 5000 }
    )

    // 6. Verify
    expect(result.result.results).toHaveLength(3)

    // Item 0: Success immediately
    expect(result.result.results[0]).toEqual({ status: 'ok', id: 0 })
    expect(attempts.item_0).toBe(1)

    // Item 1: Success after retry
    expect(result.result.results[1]).toEqual({ status: 'ok', id: 1 })
    expect(attempts.item_1).toBe(2)

    // Item 2: Failed
    expect(result.result.results[2]).toEqual({ error: 'Failed after retries' })
    expect(attempts.item_2).toBe(3)
  })
})
