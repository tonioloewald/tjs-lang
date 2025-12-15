import { describe, it, expect, mock } from 'bun:test'
import { A99 } from './builder'
import { VM } from './runtime'
import { s } from 'tosijs-schema'

describe('Agent99 Integration (Mocked Pipeline)', () => {
  it('should execute a Credit Limit Check flow using Store and If/Else', async () => {
    // --- 1. Mock Capabilities ---
    const mockStore = {
      'user:123:limit': 500,
    }

    const caps = {
      store: {
        get: mock(async (key: string) => mockStore[key] ?? 0),
        set: mock(async () => {
          // noop
        }),
      },
      fetch: mock(async (_url) => ({ status: 'ok' })),
    }

    // --- 2. Build The Logic ---
    const logic = A99.take(
      s.object({
        userId: s.string,
        amount: s.number,
      })
    )
      // Get Limit
      .storeGet('user:123:limit')
      .as('limit') // Hardcoded key for MVP simplicity in builder args

      // Check Limit
      .if(
        'amount > limit',
        {
          amount: A99.args('amount'),
          limit: A99.val('limit'),
        },
        // THEN: Deny
        (b) =>
          b
            .calc('0', {})
            .as('approved') // 0 = false
            .fetch('https://api.bank.com/log-denial', { method: 'POST' }),
        // ELSE: Approve
        (b) =>
          b
            .calc('1', {})
            .as('approved') // 1 = true
            .fetch('https://api.bank.com/log-approval', { method: 'POST' })
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

    expect(resultDenied.approved).toBe(0)
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

    expect(resultApproved.approved).toBe(1)
    expect(caps.fetch).toHaveBeenCalledWith(
      'https://api.bank.com/log-approval',
      expect.anything()
    )
  })

  it('should handle capability errors gracefully', async () => {
    const logic = A99.take(s.object({}))
      .fetch('https://google.com') // Needs fetch capability
      .return(s.object({}))

    const ast = logic.toJSON()

    // Run without capabilities
    expect(VM.run(ast, {})).rejects.toThrow(
      "Capability Error: 'http.fetch' is not available in this runtime."
    )
  })
})
