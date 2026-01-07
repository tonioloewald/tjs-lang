import { describe, it, expect, mock } from 'bun:test'
import { A99 } from './builder'
import { AgentVM } from './vm'
import { s } from 'tosijs-schema'

describe('Agent99 Integration (Mocked Pipeline)', () => {
  const VM = new AgentVM()

  it('should execute a Credit Limit Check flow using Store and If/Else', async () => {
    // --- 1. Mock Capabilities ---
    const mockStore: Record<string, number> = {
      'user:123:limit': 500,
    }

    const caps = {
      store: {
        get: mock(async (key: string) => mockStore[key] ?? 0),
        set: mock(async () => {
          // noop
        }),
      },
      fetch: mock(async () => ({ status: 'ok' })),
    }

    // --- 2. Build The Logic ---
    const logic = A99.take(
      s.object({
        userId: s.string,
        amount: s.number,
      })
    )
      // Get Limit
      .storeGet({ key: 'user:123:limit' })
      .as('limit') // Hardcoded key for MVP simplicity in builder args

      // Check Limit
      .if(
        'amount > limit',
        {
          amount: A99.args('amount'),
          limit: A99.val('limit'),
        },
        // THEN: Deny
        (b: any) =>
          b
            .varSet({ key: 'approved', value: 0 }) // 0 = false
            .httpFetch({
              url: 'https://api.bank.com/log-denial',
              method: 'POST',
            }),
        // ELSE: Approve
        (b: any) =>
          b
            .varSet({ key: 'approved', value: 1 }) // 1 = true
            .httpFetch({
              url: 'https://api.bank.com/log-approval',
              method: 'POST',
            })
      )
      .return(s.object({ approved: s.number }))

    // --- 3. Serialize ---
    const ast = logic.toJSON()

    // --- 4. Run (Case: Denied) ---
    // Amount 600 > Limit 500
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

    // --- 5. Run (Case: Approved) ---
    // Amount 100 < Limit 500
    // Reset mocks for clean state if needed, but here simple checking calls is enough
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
    const logic = A99.take(s.object({}))
      .llmPredict({ prompt: 'foo' }) // Needs llm capability (fetch has a default now)
      .return(s.object({}))

    const ast = logic.toJSON()

    // Run without capabilities
    expect(VM.run(ast, {})).rejects.toThrow("Capability 'llm.predict' missing")
  })
})
