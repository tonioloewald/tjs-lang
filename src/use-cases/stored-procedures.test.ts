/**
 * Stored Procedures Test Suite
 *
 * Tests for the procedure store functionality:
 * - Store AST, get token
 * - Call by token via vm.run()
 * - Call by token via agentRun
 * - Sub-agent receives and calls token
 * - Expiry handling
 * - Cleanup functions
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { AgentVM, ajs } from '../index'
import {
  procedureStore,
  PROCEDURE_TOKEN_PREFIX,
  DEFAULT_PROCEDURE_TTL,
} from '../vm/runtime'

describe('Stored Procedures', () => {
  let vm: AgentVM<{}>

  beforeEach(() => {
    vm = new AgentVM()
    // Clear the procedure store before each test
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
      expect(entry!.expiresAt - entry!.createdAt).toBe(5000)
    })

    it('rejects ASTs that are too large', async () => {
      // Create a large AST by nesting
      const largeAst = {
        op: 'seq',
        steps: Array(1000).fill({ op: 'varSet', key: 'x', value: 'a'.repeat(200) }),
      }

      const storeAgent = ajs`
        function storeSmall({ ast, maxSize }) {
          let token = storeProcedure({ ast, maxSize })
          return { token }
        }
      `

      const { result, error } = await vm.run(storeAgent, {
        ast: largeAst,
        maxSize: 1000, // 1KB limit
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

      // Store the procedure
      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `

      const { result: storeResult } = await vm.run(storeAgent, { ast: subAgent })
      const token = storeResult.token

      // Call via token
      const { result } = await vm.run(token, { x: 6, y: 7 })

      expect(result).toEqual({ product: 42 })
    })

    it('rejects non-token strings', async () => {
      await expect(vm.run('not-a-token', {})).rejects.toThrow(
        "expected AST or procedure token"
      )
    })

    it('rejects expired tokens', async () => {
      const subAgent = ajs`
        function noop({}) {
          return {}
        }
      `

      // Store with very short TTL
      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast, ttl: 1 })
          return { token }
        }
      `

      const { result: storeResult } = await vm.run(storeAgent, { ast: subAgent })
      const token = storeResult.token

      // Wait for expiry
      await new Promise((r) => setTimeout(r, 50))

      // Should fail
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

      // Store the procedure
      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `

      const { result: storeResult } = await vm.run(storeAgent, { ast: subAgent })
      const token = storeResult.token

      // Call from another agent
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

      // Store the worker
      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast })
          return { token }
        }
      `

      const { result: storeResult } = await vm.run(storeAgent, { ast: workerAgent })
      const workerToken = storeResult.token

      // Orchestrator that receives a token and calls it
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

      const { result } = await vm.run(releaseAgent, { token: 'proc_nonexistent' })

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

      // Store with very short TTL
      const storeAgent = ajs`
        function store({ ast }) {
          let token = storeProcedure({ ast, ttl: 1 })
          return { token }
        }
      `

      // Store a few
      await vm.run(storeAgent, { ast: subAgent })
      await vm.run(storeAgent, { ast: subAgent })
      await vm.run(storeAgent, { ast: subAgent })

      expect(procedureStore.size).toBe(3)

      // Wait for expiry
      await new Promise((r) => setTimeout(r, 50))

      // Clear
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

      // Store with long TTL
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

      // Dispatch table pattern
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

      expect(result.results).toEqual([13, 30, 7]) // 10+3, 10*3, 10-3
    })
  })
})
