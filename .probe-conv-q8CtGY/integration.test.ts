/* tjs <- input.ts */

import { describe, it, expect, mock } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { s } from 'tosijs-schema'

describe('Agent99 Integration (Mocked Pipeline)', () => {
  const VM = new AgentVM()
  it('should execute a Credit Limit Check flow using Store and If/Else', async () => {
    const mockStore = {
      'user:123:limit': 500,
    }
    const caps = {
      store: {
        get: mock(async (key) => mockStore[key] ?? 0),
        set: mock(async () => {}),
      },
      fetch: mock(async () => ({ status: 'ok' })),
    }

    const logic = Agent.take(
      s.object({
        userId: s.string,
        amount: s.number,
      })
    )

      .storeGet({ key: 'user:123:limit' })
      .as('limit')

      .if(
        'amount > limit',
        {
          amount: Agent.args('amount'),
          limit: Agent.val('limit'),
        },

        (b) =>
          b.varSet({ key: 'approved', value: 0 }).httpFetch({
            url: 'https://api.bank.com/log-denial',
            method: 'POST',
          }),

        (b) =>
          b.varSet({ key: 'approved', value: 1 }).httpFetch({
            url: 'https://api.bank.com/log-approval',
            method: 'POST',
          })
      )
      .return(s.object({ approved: s.number }))

    const ast = logic.toJSON()

    const resultDenied = await VM.run(
      ast,
      { userId: '123', amount: 600 },
      { capabilities: caps }
    )
    expect(resultDenied.result.approved).toBe(0)
    expect(caps.fetch).toHaveBeenCalledWith(
      'https://api.bank.com/log-denial',
      expect.anything()
    )

    const resultApproved = await VM.run(
      ast,
      { userId: '123', amount: 100 },
      { capabilities: caps }
    )
    expect(resultApproved.result.approved).toBe(1)
    expect(caps.fetch).toHaveBeenCalledWith(
      'https://api.bank.com/log-approval',
      expect.anything()
    )
  })
  it('should handle capability errors gracefully', async () => {
    const logic = Agent.take(s.object({}))
      .llmPredict({ prompt: 'foo' })
      .return(s.object({}))
    const ast = logic.toJSON()

    const result = await VM.run(ast, {})
    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe("Capability 'llm.predict' missing")
  })
})
