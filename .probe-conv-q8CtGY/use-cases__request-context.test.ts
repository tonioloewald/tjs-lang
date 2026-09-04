/* tjs <- input.ts */

import { describe, it, expect } from 'bun:test'

import { AgentVM, defineAtom } from '/Users/tonioloewald/tjs-lang/src/index'

import { s } from 'tosijs-schema'

describe('Request Context', () => {
  it('should pass context to atoms', async () => {
    const secureFetch = defineAtom(
      'secureFetch',
      s.object({ url: s.string }),
      s.any,
      async (input, ctx) => {
        const permissions = ctx.context?.permissions ?? []
        if (!permissions.includes('fetch:external')) {
          throw new Error('Not authorized for external fetch')
        }
        return { url: input.url, authorized: true }
      },
      { docs: 'Fetch with permission check', cost: 1 }
    )
    const vm = new AgentVM({ secureFetch })
    const ast = vm.Agent.step({
      op: 'secureFetch',
      url: 'https://example.com',
      result: 'data',
    })
      .return({ properties: { data: {} } })
      .toJSON()

    const resultUnauthorized = await vm.run(
      ast,
      {},
      {
        context: {
          user: { id: 'user-1' },
          permissions: ['read:docs'],
        },
      }
    )
    expect(resultUnauthorized.error).toBeDefined()
    expect(resultUnauthorized.error?.message).toContain('Not authorized')

    const resultAuthorized = await vm.run(
      ast,
      {},
      {
        context: {
          user: { id: 'user-1' },
          permissions: ['read:docs', 'fetch:external'],
        },
      }
    )
    expect(resultAuthorized.error).toBeUndefined()
    expect(resultAuthorized.result.data.authorized).toBe(true)
  })
  it('should make context available for authorization decisions', async () => {
    const adminOnly = defineAtom(
      'adminOnly',
      s.object({ action: s.string }),
      s.any,
      async (input, ctx) => {
        const roles = ctx.context?.user?.roles ?? []
        if (!roles.includes('admin')) {
          throw new Error('Admin access required')
        }
        return { action: input.action, executed: true }
      },
      { docs: 'Admin-only action', cost: 1 }
    )
    const vm = new AgentVM({ adminOnly })
    const ast = vm.Agent.step({
      op: 'adminOnly',
      action: 'delete-all',
      result: 'result',
    })
      .return({ properties: { result: {} } })
      .toJSON()

    const resultUser = await vm.run(
      ast,
      {},
      {
        context: {
          user: { id: 'user-1', roles: ['editor'] },
        },
      }
    )
    expect(resultUser.error).toBeDefined()
    expect(resultUser.error?.message).toContain('Admin access required')

    const resultAdmin = await vm.run(
      ast,
      {},
      {
        context: {
          user: { id: 'admin-1', roles: ['admin', 'editor'] },
        },
      }
    )
    expect(resultAdmin.error).toBeUndefined()
    expect(resultAdmin.result.result.executed).toBe(true)
  })
  it('should allow context to carry request metadata', async () => {
    let capturedTraceId
    const logAction = defineAtom(
      'logAction',
      s.object({ message: s.string }),
      s.any,
      async (input, ctx) => {
        capturedTraceId = ctx.context?.traceId
        return { logged: true, traceId: ctx.context?.traceId }
      },
      { docs: 'Log with trace ID', cost: 0.1 }
    )
    const vm = new AgentVM({ logAction })
    const ast = vm.Agent.step({
      op: 'logAction',
      message: 'test',
      result: 'log',
    })
      .return({ properties: { log: {} } })
      .toJSON()
    await vm.run(
      ast,
      {},
      {
        context: {
          traceId: 'req-abc-123',
          requestTime: Date.now(),
        },
      }
    )
    expect(capturedTraceId).toBe('req-abc-123')
  })
  it('should work with dynamic cost overrides using context', async () => {
    const vm = new AgentVM()
    const ast = vm.Agent.varSet({ key: 'x', value: 1 })
      .return({ properties: { x: {} } })
      .toJSON()

    const result = await vm.run(
      ast,
      {},
      {
        fuel: 100,
        context: {
          user: { tier: 'premium' },
        },
        costOverrides: {
          varSet: (input, ctx) => {
            return ctx.context?.user?.tier === 'premium' ? 0.01 : 1
          },
        },
      }
    )
    expect(result.error).toBeUndefined()

    expect(result.fuelUsed).toBeLessThan(0.5)
  })
})
