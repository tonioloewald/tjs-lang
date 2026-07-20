import { describe, it, expect, mock } from 'bun:test'
import { Agent } from '../builder'
import { defineAtom } from '../runtime'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'

describe('Use Case: Malicious Actor', () => {
  const VM = new AgentVM()

  it('should terminate infinite loops via Fuel limit', async () => {
    // Malicious Agent: Infinite Loop
    const infinite = Agent.take(s.object({}))
      .while('1 == 1', {}, (b) => b.varSet({ key: 'x', value: 1 }))
      .return(s.object({}))

    const ast = infinite.toJSON()

    // 1. Run with limited fuel -> Should return error monadically
    const result = await VM.run(ast, {}, { fuel: 10 })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Out of Fuel')

    // 2. Run with enough fuel (simulated): Should fail eventually or return if limited loops
    // In this case condition is always true, so it loops forever.
    // Even with 1000000 fuel, it will exhaust it.
  })

  it('should prevent access to prototype/constructor via ExprNode (Sandbox)', async () => {
    // Malicious Agent: Try to access constructor of an object via ExprNode
    // {}.constructor -> Function -> ...
    const exploit = Agent.take(s.object({}))
      .varSet({ key: 'obj', value: {} })
      // Try to access obj.constructor via ExprNode
      .varSet({
        key: 'leak',
        value: {
          $expr: 'member',
          object: { $expr: 'ident', name: 'obj' },
          property: 'constructor',
        },
      })
      .return(s.object({ leak: s.any }))

    const ast = exploit.toJSON()

    // Safe sandbox should block access to __proto__, constructor, prototype.
    const result = await VM.run(ast, {})
    expect(result.error).toBeDefined()
    expect(result.error?.message).toMatch(/Security Error/)
  })

  it('should prevent access to prototype/constructor via dot notation (Sandbox)', async () => {
    // Malicious Agent: Try to access __proto__ via string dot notation in resolveValue
    const exploit1 = Agent.take(s.object({}))
      .varSet({ key: 'obj', value: { foo: 'bar' } })
      .varSet({ key: 'leak', value: 'obj.__proto__' })
      .return(s.object({ leak: s.any }))

    const result1 = await VM.run(exploit1.toJSON(), {})
    expect(result1.error).toBeDefined()
    expect(result1.error?.message).toMatch(/Security Error.*__proto__/)

    // Try constructor
    const exploit2 = Agent.take(s.object({}))
      .varSet({ key: 'obj', value: { foo: 'bar' } })
      .varSet({ key: 'leak', value: 'obj.constructor' })
      .return(s.object({ leak: s.any }))

    const result2 = await VM.run(exploit2.toJSON(), {})
    expect(result2.error).toBeDefined()
    expect(result2.error?.message).toMatch(/Security Error.*constructor/)

    // Try prototype
    const exploit3 = Agent.take(s.object({}))
      .varSet({ key: 'obj', value: { foo: 'bar' } })
      .varSet({ key: 'leak', value: 'obj.prototype' })
      .return(s.object({ leak: s.any }))

    const result3 = await VM.run(exploit3.toJSON(), {})
    expect(result3.error).toBeDefined()
    expect(result3.error?.message).toMatch(/Security Error.*prototype/)
  })

  it('should prevent access to global process/Bun (Sandbox)', async () => {
    // Attempt to access global variable 'process' via evaluation
    // Since our evaluator only resolves from state/args...
    // The only way to access globals is if 'state' has them or prototype chain leaks.

    const exploit = Agent.take(s.object({}))
      .varSet({
        key: 'leak',
        value: { $expr: 'ident', name: 'process' },
      })
      .return(s.object({ leak: s.any }))

    const ast = exploit.toJSON()

    // 'process' should be undefined since it's not in state or args
    const result = await VM.run(ast, {})
    expect(result.result.leak).toBeUndefined()
  })

  it('should prevent path traversal in File operations (Capability Check)', async () => {
    // If we had a File atom, we'd test "../../../etc/passwd".
    // Since we don't have core File atoms yet, we simulate a capability request.
    // We assume capabilities are the security boundary.

    const caps = {
      file: {
        read: mock(async (path) => {
          if (path.includes('..')) throw new Error('Access Denied')
          return 'content'
        }),
      },
    }

    // We need a custom atom or mock atom for file read
    // Let's assume a generic 'file.read' atom exists or we define one for test

    const fileRead = defineAtom(
      'fileRead',
      s.object({ path: s.string }),
      s.string,
      async ({ path }, ctx) => ctx.capabilities.file.read(path)
    )

    const vm = new AgentVM({ fileRead })

    const builder = Agent.custom({ ...vm['atoms'] })
    const exploit = builder
      .step({ op: 'fileRead', path: '../../etc/passwd' }) // Use step or typed if we updated types
      .as('content')
      .return(s.object({ content: s.any }))

    const result = await vm.run(exploit.toJSON(), {}, { capabilities: caps })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Access Denied')
  })

  it('should block SSRF attempts to localhost/private IPs (default fetch)', async () => {
    const VM = new AgentVM()

    // Test various SSRF attack vectors
    const ssrfUrls = [
      'http://localhost:6379/', // Redis
      'http://127.0.0.1:8080/', // Loopback
      'http://169.254.169.254/latest/meta-data/', // AWS metadata
      'http://10.0.0.1/', // Private class A
      'http://192.168.1.1/', // Private class C
      'http://172.16.0.1/', // Private class B
      'file:///etc/passwd', // File protocol
      'http://metadata.google.internal/', // GCP metadata
      'http://evil.internal/', // Internal suffix
    ]

    for (const url of ssrfUrls) {
      const agent = Agent.take(s.object({}))
        .httpFetch({ url })
        .as('response')
        .return(s.object({ response: s.any }))

      // No custom fetch capability = uses default with SSRF protection
      const result = await VM.run(agent.toJSON(), {}, {})
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/Blocked URL/)
    }
  })

  it('should allow SSRF-like URLs when custom fetch capability is provided', async () => {
    const VM = new AgentVM()

    // Custom fetch that allows localhost (user's responsibility)
    const customFetch = mock(async () => ({ ok: true }))

    const agent = Agent.take(s.object({}))
      .httpFetch({ url: 'http://localhost:8080/api' })
      .as('response')
      .return(s.object({ response: s.any }))

    const result = await VM.run(
      agent.toJSON(),
      {},
      { capabilities: { fetch: customFetch } }
    )

    // Should succeed because custom capability bypasses SSRF check
    expect(result.error).toBeUndefined()
    expect(customFetch).toHaveBeenCalled()
  })

  it('should reject ReDoS patterns in regexMatch', async () => {
    const VM = new AgentVM()

    // Classic ReDoS patterns
    const redosPatterns = [
      '(a+)+b', // Nested quantifiers
      '(.*)+', // Dot-star with quantifier
      '(.+)+', // Dot-plus with quantifier
      '([a-z]+)+', // Character class with nested quantifiers
    ]

    for (const pattern of redosPatterns) {
      const agent = Agent.take(s.object({ input: s.string }))
        .regexMatch({ pattern, value: 'args.input' })
        .as('matched')
        .return(s.object({ matched: s.boolean }))

      const result = await VM.run(agent.toJSON(), {
        input: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa!',
      })

      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/Suspicious regex pattern rejected/)
    }
  })

  it('should allow safe regex patterns', async () => {
    const VM = new AgentVM()

    // Safe patterns that should work
    const safePatterns = [
      '^[a-z]+$', // Simple character class
      '\\d{3}-\\d{4}', // Phone number pattern
      '^hello.*world$', // Simple wildcards
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', // Email-like (simplified)
    ]

    for (const pattern of safePatterns) {
      const agent = Agent.take(s.object({ input: s.string }))
        .regexMatch({ pattern, value: 'args.input' })
        .as('matched')
        .return(s.object({ matched: s.boolean }))

      const result = await VM.run(agent.toJSON(), { input: 'hello world' })

      expect(result.error).toBeUndefined()
      expect(typeof result.result.matched).toBe('boolean')
    }
  })

  // methodCall is allowlisted to standard built-in methods (SAFE_METHOD_NAMES).
  // call/apply/bind live only on Function.prototype and are absent from the
  // allowlist, so a leaked function reference could not be re-invoked with a
  // chosen `this` — defense in depth behind the membrane.
  describe('methodCall allowlist', () => {
    const callExpr = (method: string) =>
      Agent.take(s.object({}))
        .varSet({ key: 'obj', value: 'hello' })
        .varSet({
          key: 'leak',
          value: {
            $expr: 'methodCall',
            object: { $expr: 'ident', name: 'obj' },
            method,
            arguments: [],
          },
        })
        .return(s.object({ leak: s.any }))
        .toJSON()

    it('rejects Function.prototype escape hatches (call/apply/bind)', async () => {
      for (const method of ['call', 'apply', 'bind', 'constructor']) {
        const result = await VM.run(callExpr(method), {})
        expect(result.error).toBeDefined()
        expect(result.error?.message).toMatch(
          /Security Error|not callable|forbidden/i
        )
      }
    })

    it('allows standard string methods', async () => {
      const result = await VM.run(callExpr('toUpperCase'), {})
      expect(result.error).toBeUndefined()
      expect(result.result.leak).toBe('HELLO')
    })
  })

  // The capability boundary is the VM's one seam to the host realm. Every value
  // a capability returns is deep-copied through a structured-clone membrane
  // before it enters guest state: pure data crosses (with fresh identity),
  // functions / host references are rejected, and oversized payloads are
  // rejected BEFORE the copy allocates. See membraneValue in runtime.ts.
  describe('capability boundary membrane', () => {
    const readAgent = () =>
      Agent.take(s.object({}))
        .storeGet({ key: 'k' })
        .as('data')
        .return(s.object({ data: s.any }))
        .toJSON()

    it('rejects a capability return carrying a function (smuggle vector)', async () => {
      const VM = new AgentVM()
      // A hostile store hands back a live object with a callable member. Without
      // the membrane the guest could `methodCall` .leak() to reach the host
      // realm (methodCall does fn.apply on any own function property).
      const store = {
        get: async () => ({ leak: () => (globalThis as any).process }),
        set: async () => {},
      }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/Capability boundary/)
      expect(result.result?.data).toBeUndefined()
    })

    it('rejects a raw host reference (process) returned by a capability', async () => {
      const VM = new AgentVM()
      const store = {
        get: async () => (globalThis as any).process,
        set: async () => {},
      }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/Capability boundary/)
    })

    it('clones clean data through; the guest copy is not the host object', async () => {
      const VM = new AgentVM()
      const shared = { a: 1, nested: { b: [2, 3] } }
      const store = { get: async () => shared, set: async () => {} }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(result.error).toBeUndefined()
      expect(result.result.data).toEqual(shared)
      // Fresh identity: the guest cannot mutate an object the host still holds.
      expect(result.result.data).not.toBe(shared)
      expect(result.result.data.nested).not.toBe(shared.nested)
    })

    it('passes primitive returns through unchanged', async () => {
      const VM = new AgentVM()
      const store = { get: async () => 'plain-string', set: async () => {} }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(result.error).toBeUndefined()
      expect(result.result.data).toBe('plain-string')
    })

    it('rejects a capability return that exceeds the byte budget (OOM guard)', async () => {
      const VM = new AgentVM()
      const store = {
        get: async () => ({ blob: 'x'.repeat(4000) }),
        set: async () => {},
      }
      const result = await VM.run(
        readAgent(),
        {},
        {
          capabilities: { store },
          membraneMaxBytes: 1000,
        }
      )
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/membrane budget/)
    })
  })
})
