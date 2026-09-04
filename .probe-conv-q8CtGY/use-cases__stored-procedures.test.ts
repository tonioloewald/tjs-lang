/* tjs <- input.ts */

import { describe, it, expect, beforeEach } from 'bun:test'

import {
  AgentVM,
  ajs,
  defineAtom,
} from '/Users/tonioloewald/tjs-lang/src/index'

import { s } from 'tosijs-schema'

import {
  procedureStore,
  PROCEDURE_TOKEN_PREFIX,
} from '/Users/tonioloewald/tjs-lang/src/vm/runtime'

describe('Stored Procedures', () => {
  let vm
  beforeEach(() => {
    vm = new AgentVM()

    procedureStore.clear()
  })
  describe('storeProcedure', () => {
    it('stores an AST and returns a token', async () => {
      const subAgent = ajs`
        function add({ a, b }) {
          return { sum: a + b }
        }
      `
      const storeAgent = ajs`
        function storeIt({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `
      const { result } = await vm.run(storeAgent, { ast: subAgent })
      expect(result.token).toBeDefined()
      expect(result.token.startsWith(PROCEDURE_TOKEN_PREFIX)).toBe(true)
      expect(procedureStore.has(result.token)).toBe(true)
    })
    it('respects custom TTL', async () => {
      const subAgent = ajs`
        function noop({}) {
          return {}
        }
      `
      const storeAgent = ajs`
        function storeWithTtl({ ast, ttl }) {
          let token = storeProcedure({ ast, ttl })
          return { token }
        }
      `
      const { result } = await vm.run(storeAgent, { ast: subAgent, ttl: 5000 })
      const entry = procedureStore.get(result.token)
      expect(entry).toBeDefined()
      expect(entry.expiresAt - entry.createdAt).toBe(5000)
    })
    it('rejects ASTs that are too large', async () => {
      const largeAst = {
        op: 'seq',
        steps: Array(1000).fill({
          op: 'varSet',
          key: 'x',
          value: 'a'.repeat(200),
        }),
      }
      const storeAgent = ajs`
        function storeSmall({ ast, maxSize }) {
          let token = storeProcedure({ ast, maxSize })
          return { token }
        }
      `
      const { error } = await vm.run(storeAgent, {
        ast: largeAst,
        maxSize: 1000,
      })
      expect(error).toBeDefined()
      expect(error?.message).toContain('too large')
    })
    it('rejects invalid AST (no op property)', async () => {
      const storeAgent = ajs`
        function storeInvalid({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `
      const { error } = await vm.run(storeAgent, { ast: { notAnAst: true } })
      expect(error).toBeDefined()
      expect(error?.message).toContain('Invalid AST')
    })
  })
  describe('vm.run() with token', () => {
    it('executes a stored procedure by token', async () => {
      const subAgent = ajs`
        function multiply({ x, y }) {
          return { product: x * y }
        }
      `

      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `
      const { result: storeResult } = await vm.run(storeAgent, {
        ast: subAgent,
      })
      const token = storeResult.token

      const { result } = await vm.run(token, { x: 6, y: 7 })
      expect(result).toEqual({ product: 42 })
    })
    it('rejects invalid AJS source', async () => {
      await expect(vm.run('not-valid-ajs', {})).rejects.toThrow(
        'AJS transpilation failed'
      )
    })
    it('rejects expired tokens', async () => {
      const subAgent = ajs`
        function noop({}) {
          return {}
        }
      `

      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast, ttl: 1 })
          return { token }
        }
      `
      const { result: storeResult } = await vm.run(storeAgent, {
        ast: subAgent,
      })
      const token = storeResult.token

      await new Promise((r) => setTimeout(r, 50))

      await expect(vm.run(token, {})).rejects.toThrow('expired')
    })
    it('rejects non-existent tokens', async () => {
      await expect(vm.run('proc_nonexistent', {})).rejects.toThrow('not found')
    })
  })
  describe('agentRun with token', () => {
    it('calls a stored procedure from within an agent', async () => {
      const subAgent = ajs`
        function greet({ name }) {
          return { greeting: 'Hello, ' + name + '!' }
        }
      `

      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `
      const { result: storeResult } = await vm.run(storeAgent, {
        ast: subAgent,
      })
      const token = storeResult.token

      const callerAgent = ajs`
        function callIt({ token, name }) {
          let result = agentRun({ agentId: token, input: { name } })
          return { greeting: result.greeting }
        }
      `
      const { result } = await vm.run(callerAgent, { token, name: 'World' })
      expect(result.greeting).toBe('Hello, World!')
    })
    it('passes a token to a sub-agent which calls it', async () => {
      const workerAgent = ajs`
        function worker({ value }) {
          return { doubled: value * 2 }
        }
      `

      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `
      const { result: storeResult } = await vm.run(storeAgent, {
        ast: workerAgent,
      })
      const workerToken = storeResult.token

      const orchestratorAgent = ajs`
        function orchestrate({ workerToken, values }) {
          let results = []
          for (let v of values) {
            let r = agentRun({ agentId: workerToken, input: { value: v } })
            results.push(r.doubled)
          }
          return { results }
        }
      `
      const { result } = await vm.run(orchestratorAgent, {
        workerToken,
        values: [1, 2, 3, 4, 5],
      })
      expect(result).toEqual({ results: [2, 4, 6, 8, 10] })
    })
    it('can pass AST directly to agentRun', async () => {
      const subAgent = ajs`
        function square({ n }) {
          return { squared: n * n }
        }
      `
      const callerAgent = ajs`
        function callDirect({ ast, n }) {
          let result = agentRun({ agentId: ast, input: { n } })
          return { squared: result.squared }
        }
      `
      const { result } = await vm.run(callerAgent, { ast: subAgent, n: 5 })
      expect(result.squared).toBe(25)
    })
  })
  describe('releaseProcedure', () => {
    it('removes a stored procedure', async () => {
      const subAgent = ajs`
        function noop({}) {
          return {}
        }
      `
      const storeAndRelease = ajs`
        function test({ ast }) {
          let token = storeProcedure({ ast })
          let released = releaseProcedure({ token })
          return { token, released }
        }
      `
      const { result } = await vm.run(storeAndRelease, { ast: subAgent })
      expect(result.released).toBe(true)
      expect(procedureStore.has(result.token)).toBe(false)
    })
    it('returns false for non-existent tokens', async () => {
      const releaseAgent = ajs`
        function release({ token }) {
          let released = releaseProcedure({ token })
          return { released }
        }
      `
      const { result } = await vm.run(releaseAgent, {
        token: 'proc_nonexistent',
      })
      expect(result.released).toBe(false)
    })
  })
  describe('clearExpiredProcedures', () => {
    it('clears expired procedures', async () => {
      const subAgent = ajs`
        function noop({}) {
          return {}
        }
      `

      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast, ttl: 1 })
          return { token }
        }
      `

      await vm.run(storeAgent, { ast: subAgent })
      await vm.run(storeAgent, { ast: subAgent })
      await vm.run(storeAgent, { ast: subAgent })
      expect(procedureStore.size).toBe(3)

      await new Promise((r) => setTimeout(r, 50))

      const clearAgent = ajs`
        function clear({}) {
          let cleared = clearExpiredProcedures({})
          return { cleared }
        }
      `
      const { result } = await vm.run(clearAgent, {})
      expect(result.cleared).toBe(3)
      expect(procedureStore.size).toBe(0)
    })
    it('does not clear non-expired procedures', async () => {
      const subAgent = ajs`
        function noop({}) {
          return {}
        }
      `

      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast, ttl: 60000 })
          return { token }
        }
      `
      await vm.run(storeAgent, { ast: subAgent })
      await vm.run(storeAgent, { ast: subAgent })
      expect(procedureStore.size).toBe(2)
      const clearAgent = ajs`
        function clear({}) {
          let cleared = clearExpiredProcedures({})
          return { cleared }
        }
      `
      const { result } = await vm.run(clearAgent, {})
      expect(result.cleared).toBe(0)
      expect(procedureStore.size).toBe(2)
    })
  })
  describe('token as function pointer', () => {
    it('can store and retrieve multiple procedures', async () => {
      const addAgent = ajs`
        function add({ a, b }) {
          return { result: a + b }
        }
      `
      const multiplyAgent = ajs`
        function multiply({ a, b }) {
          return { result: a * b }
        }
      `
      const subtractAgent = ajs`
        function subtract({ a, b }) {
          return { result: a - b }
        }
      `
      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `
      const { result: r1 } = await vm.run(storeAgent, { ast: addAgent })
      const { result: r2 } = await vm.run(storeAgent, { ast: multiplyAgent })
      const { result: r3 } = await vm.run(storeAgent, { ast: subtractAgent })

      const dispatchAgent = ajs`
        function dispatch({ ops, a, b }) {
          let results = []
          for (let token of ops) {
            let r = agentRun({ agentId: token, input: { a, b } })
            results.push(r.result)
          }
          return { results }
        }
      `
      const { result } = await vm.run(dispatchAgent, {
        ops: [r1.token, r2.token, r3.token],
        a: 10,
        b: 3,
      })
      expect(result.results).toEqual([13, 30, 7])
    })
  })
  describe('security: caller context isolation', () => {
    const secureAction = defineAtom(
      'secureAction',
      s.object({ action: s.string }),
      s.object({ action: s.string, authorized: s.boolean, user: s.string }),
      async (input, ctx) => {
        const permissions = ctx.context?.permissions ?? []
        const user = ctx.context?.user ?? 'anonymous'
        if (!permissions.includes('admin')) {
          throw new Error('Admin permission required')
        }
        return { action: input.action, authorized: true, user }
      },
      { docs: 'Action requiring admin permission', cost: 1 }
    )
    it('stored procedure uses caller context, not storer context', async () => {
      const vm = new AgentVM({ secureAction })
      procedureStore.clear()

      const secureAgent = ajs`
        function doSecure({ action }) {
          let result = secureAction({ action })
          return result
        }
      `

      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `

      const { result: storeResult } = await vm.run(
        storeAgent,
        { ast: secureAgent },
        {
          context: {
            user: 'admin-user',
            permissions: ['admin', 'read', 'write'],
          },
        }
      )
      const token = storeResult.token

      const { error: unprivError } = await vm.run(
        token,
        { action: 'delete-everything' },
        {
          context: {
            user: 'regular-user',
            permissions: ['read'],
          },
        }
      )
      expect(unprivError).toBeDefined()
      expect(unprivError?.message).toContain('Admin permission required')

      const { result, error } = await vm.run(
        token,
        { action: 'delete-everything' },
        {
          context: {
            user: 'another-admin',
            permissions: ['admin', 'read'],
          },
        }
      )
      expect(error).toBeUndefined()
      expect(result.authorized).toBe(true)
      expect(result.user).toBe('another-admin')
    })
    it('agentRun with token uses caller context', async () => {
      const vm = new AgentVM({ secureAction })
      procedureStore.clear()

      const secureAgent = ajs`
        function doSecure({ action }) {
          let result = secureAction({ action })
          return result
        }
      `

      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `
      const { result: storeResult } = await vm.run(storeAgent, {
        ast: secureAgent,
      })
      const token = storeResult.token

      const orchestrator = ajs`
        function orchestrate({ token, action }) {
          let result = agentRun({ agentId: token, input: { action } })
          return result
        }
      `

      const { error: unprivError } = await vm.run(
        orchestrator,
        { token, action: 'nuke-it' },
        {
          context: {
            user: 'unprivileged',
            permissions: ['read'],
          },
        }
      )
      expect(unprivError).toBeDefined()
      expect(unprivError?.message).toContain('Admin permission required')

      const { result, error } = await vm.run(
        orchestrator,
        { token, action: 'nuke-it' },
        {
          context: {
            user: 'super-admin',
            permissions: ['admin'],
          },
        }
      )
      expect(error).toBeUndefined()
      expect(result.authorized).toBe(true)
      expect(result.user).toBe('super-admin')
    })
    it('capability restrictions apply at call time, not store time', async () => {
      let fetchCallCount = 0
      const vm = new AgentVM()
      procedureStore.clear()

      const fetchAgent = ajs`
        function doFetch({ url }) {
          let data = httpFetch({ url })
          return { data }
        }
      `

      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `
      const { result: storeResult } = await vm.run(
        storeAgent,
        { ast: fetchAgent },
        {
          capabilities: {
            fetch: async (_url) => {
              fetchCallCount++
              return 'allowed-data'
            },
          },
        }
      )
      const token = storeResult.token

      const { error } = await vm.run(
        token,
        { url: 'https://evil.com' },
        {
          capabilities: {
            fetch: async () => {
              throw new Error('Fetch not allowed')
            },
          },
        }
      )
      expect(error).toBeDefined()
      expect(error?.message).toContain('Fetch not allowed')
      expect(fetchCallCount).toBe(0)
    })
  })
})
