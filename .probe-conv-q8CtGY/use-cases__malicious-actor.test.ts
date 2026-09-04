/* tjs <- input.ts */

import { describe, it, expect, mock } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { defineAtom } from '/Users/tonioloewald/tjs-lang/src/runtime'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { Eval } from '/Users/tonioloewald/tjs-lang/src/lang/eval'

import { s } from 'tosijs-schema'

describe('Use Case: Malicious Actor', () => {
  const VM = new AgentVM()
  it('should terminate infinite loops via Fuel limit', async () => {
    const infinite = Agent.take(s.object({}))
      .while('1 == 1', {}, (b) => b.varSet({ key: 'x', value: 1 }))
      .return(s.object({}))
    const ast = infinite.toJSON()

    const result = await VM.run(ast, {}, { fuel: 10 })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Out of Fuel')
  })
  it('should prevent access to prototype/constructor via ExprNode (Sandbox)', async () => {
    const exploit = Agent.take(s.object({}))
      .varSet({ key: 'obj', value: {} })

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

    const result = await VM.run(ast, {})
    expect(result.error).toBeDefined()
    expect(result.error?.message).toMatch(/Security Error/)
  })
  it('should prevent access to prototype/constructor via dot notation (Sandbox)', async () => {
    const exploit1 = Agent.take(s.object({}))
      .varSet({ key: 'obj', value: { foo: 'bar' } })
      .varSet({ key: 'leak', value: 'obj.__proto__' })
      .return(s.object({ leak: s.any }))
    const result1 = await VM.run(exploit1.toJSON(), {})
    expect(result1.error).toBeDefined()
    expect(result1.error?.message).toMatch(/Security Error.*__proto__/)

    const exploit2 = Agent.take(s.object({}))
      .varSet({ key: 'obj', value: { foo: 'bar' } })
      .varSet({ key: 'leak', value: 'obj.constructor' })
      .return(s.object({ leak: s.any }))
    const result2 = await VM.run(exploit2.toJSON(), {})
    expect(result2.error).toBeDefined()
    expect(result2.error?.message).toMatch(/Security Error.*constructor/)

    const exploit3 = Agent.take(s.object({}))
      .varSet({ key: 'obj', value: { foo: 'bar' } })
      .varSet({ key: 'leak', value: 'obj.prototype' })
      .return(s.object({ leak: s.any }))
    const result3 = await VM.run(exploit3.toJSON(), {})
    expect(result3.error).toBeDefined()
    expect(result3.error?.message).toMatch(/Security Error.*prototype/)
  })
  it('should prevent access to global process/Bun (Sandbox)', async () => {
    const exploit = Agent.take(s.object({}))
      .varSet({
        key: 'leak',
        value: { $expr: 'ident', name: 'process' },
      })
      .return(s.object({ leak: s.any }))
    const ast = exploit.toJSON()

    const result = await VM.run(ast, {})
    expect(result.result.leak).toBeUndefined()
  })
  it('should prevent path traversal in File operations (Capability Check)', async () => {
    const caps = {
      file: {
        read: mock(async (path) => {
          if (path.includes('..')) throw new Error('Access Denied')
          return 'content'
        }),
      },
    }

    const fileRead = defineAtom(
      'fileRead',
      s.object({ path: s.string }),
      s.string,
      async ({ path }, ctx) => ctx.capabilities.file.read(path)
    )
    const vm = new AgentVM({ fileRead })
    const builder = Agent.custom({ ...vm['atoms'] })
    const exploit = builder
      .step({ op: 'fileRead', path: '../../etc/passwd' })
      .as('content')
      .return(s.object({ content: s.any }))
    const result = await vm.run(exploit.toJSON(), {}, { capabilities: caps })
    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Access Denied')
  })
  it('should block SSRF attempts to localhost/private IPs (default fetch)', async () => {
    const VM = new AgentVM()

    const ssrfUrls = [
      'http://localhost:6379/',
      'http://127.0.0.1:8080/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.1/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'file:///etc/passwd',
      'http://metadata.google.internal/',
      'http://evil.internal/',
      'http://127.0.0.2/',
      'http://127.1/',
      'http://2130706433/',
      'http://0.0.0.0/',
      'http://169.254.169.253/',
      'http://[fc00::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:7f00:1]/',
      'http://[::7f00:1]/',
      'http://[::127.0.0.1]/',
    ]
    for (const url of ssrfUrls) {
      const agent = Agent.take(s.object({}))
        .httpFetch({ url })
        .as('response')
        .return(s.object({ response: s.any }))

      const result = await VM.run(agent.toJSON(), {}, {})
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/Blocked URL/)
    }
  })
  it('should allow SSRF-like URLs when custom fetch capability is provided', async () => {
    const VM = new AgentVM()

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

    expect(result.error).toBeUndefined()
    expect(customFetch).toHaveBeenCalled()
  })
  it('should reject ReDoS patterns in regexMatch', async () => {
    const VM = new AgentVM()

    const redosPatterns = [
      '(a+)+b',
      '(.*)+',
      '(.+)+',
      '([a-z]+)+',
      '(a+){2,}',
      '((a+))+$',

      '(([a-z]+))*',
      '(a|a)+',
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
  it('should cap regex pattern and input length (ReDoS length guard)', async () => {
    const VM = new AgentVM()

    const longPattern = 'a'.repeat(1001)
    const r1 = await VM.run(
      Agent.take(s.object({ input: s.string }))
        .regexMatch({ pattern: longPattern, value: 'args.input' })
        .as('m')
        .return(s.object({ m: s.boolean }))
        .toJSON(),
      { input: 'x' }
    )
    expect(r1.error?.message).toMatch(/pattern too long/)

    const r2 = await VM.run(
      Agent.take(s.object({ input: s.string }))
        .regexMatch({ pattern: '^a+$', value: 'args.input' })
        .as('m')
        .return(s.object({ m: s.boolean }))
        .toJSON(),
      { input: 'a'.repeat(100_001) }
    )
    expect(r2.error?.message).toMatch(/input too long/)
  })
  it('should allow safe regex patterns', async () => {
    const VM = new AgentVM()

    const safePatterns = [
      '^[a-z]+$',
      '\\d{3}-\\d{4}',
      '^hello.*world$',
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+',
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

  describe('scope variable-name guard', () => {
    it('rejects binding a variable named __proto__/constructor/prototype', async () => {
      for (const name of ['__proto__', 'constructor', 'prototype']) {
        const ast = Agent.take(s.object({}))
          .varSet({ key: name, value: { polluted: true } })
          .return(s.object({}))
          .toJSON()
        const result = await VM.run(ast, {})
        expect(result.error).toBeDefined()
        expect(result.error?.message).toMatch(/Security Error|forbidden/i)
      }

      expect({}.polluted).toBeUndefined()
    })
  })

  describe('methodCall allowlist', () => {
    const callExpr = (method) =>
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

  describe('capability boundary membrane', () => {
    const readAgent = () =>
      Agent.take(s.object({}))
        .storeGet({ key: 'k' })
        .as('data')
        .return(s.object({ data: s.any }))
        .toJSON()
    it('rejects a capability return carrying a function (smuggle vector)', async () => {
      const VM = new AgentVM()

      const store = {
        get: async () => ({ leak: () => globalThis.process }),
        set: async () => {},
      }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/Capability boundary/)
      expect(result.result?.data).toBeUndefined()
    })
    it('rejects a live Response from a custom fetch capability (the real consumer path)', async () => {
      const VM = new AgentVM()

      const fetchAgent = Agent.take(s.object({}))
        .httpFetch({ url: 'http://localhost:8080/api' })
        .as('res')
        .return(s.object({ res: s.any }))
        .toJSON()
      const fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => 'body',
        json: async () => ({ body: true }),
      })
      const result = await VM.run(fetchAgent, {}, { capabilities: { fetch } })
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/Capability boundary/)
    })
    it('does not INVOKE an accessor while inspecting the return', async () => {
      const VM = new AgentVM()
      let invocations = 0
      const store = {
        get: async () => ({
          ok: true,
          get payload() {
            invocations++
            return 'harmless-looking'
          },
        }),
        set: async () => {},
      }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(invocations, 'the membrane must not run a getter').toBe(0)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/Capability boundary/)
    })
    it('a throwing getter cannot take the VM down from inside the crossing', async () => {
      const VM = new AgentVM()
      const store = {
        get: async () => ({
          get boom() {
            throw new Error('detonated inside the membrane')
          },
        }),
        set: async () => {},
      }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })

      expect(result.error).toBeDefined()
      expect(result.error?.message).not.toMatch(/detonated/)
    })
    it('does not invoke an accessor on an ARRAY INDEX either', async () => {
      const VM = new AgentVM()
      let invocations = 0
      const store = {
        get: async () => {
          const arr = []
          Object.defineProperty(arr, 0, {
            enumerable: true,
            get() {
              invocations++
              return 'harmless-looking'
            },
          })
          return arr
        },
        set: async () => {},
      }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(invocations, 'the membrane must not run an index getter').toBe(0)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/Capability boundary/)
    })
    /**
     * The hostile-container corpus.
     *
     * Three branches of one walk were hardened one at a time, each after the same
     * realisation, each missing its twin. These run the whole family through the boundary
     * at once so the next branch cannot be forgotten quietly — and record the ones that
     * are DEFENDED as well as the ones that were not, because "we checked and it holds"
     * is the half that otherwise gets re-derived from scratch every review.
     */
    describe('hostile containers — every way to hide data from the walk', () => {
      const rejects = async (make, maxBytes) => {
        const VM = new AgentVM()
        const store = { get: async () => make(), set: async () => {} }
        return VM.run(
          readAgent(),
          {},
          {
            capabilities: { store },
            ...(maxBytes === undefined ? {} : { membraneMaxBytes: maxBytes }),
          }
        )
      }
      it('an ARRAY carrying a non-index getter does not run it', async () => {
        let invocations = 0
        const result = await rejects(() => {
          const arr = [1, 2, 3]
          Object.defineProperty(arr, 'meta', {
            enumerable: true,
            configurable: true,
            get() {
              invocations++
              return 'HOST-CODE-RAN'
            },
          })
          return arr
        })
        expect(invocations, 'must not run an array property getter').toBe(0)
        expect(result.error?.message).toMatch(/Capability boundary/)
      })
      it('a throwing array property getter does not leak host text', async () => {
        const result = await rejects(() => {
          const arr = [1]
          Object.defineProperty(arr, 'boom', {
            enumerable: true,
            configurable: true,
            get() {
              throw new Error('HOST SECRET /etc/passwd')
            },
          })
          return arr
        })
        expect(result.error?.message).not.toMatch(/HOST SECRET/)
        expect(result.error?.message).toMatch(/Capability boundary/)
      })
      it('an array property cannot smuggle an oversized payload past the budget', async () => {
        const result = await rejects(() => {
          const arr = [1]
          arr.big = 'x'.repeat(5 * 1024 * 1024)
          return arr
        }, 4 * 1024 * 1024)
        expect(result.error?.message).toMatch(/Capability boundary/)
      })
      for (const kind of ['Map', 'Set']) {
        it(`a ${kind} subclass with a lying iterator cannot cross`, async () => {
          const result = await rejects(() => {
            if (kind === 'Map') {
              class SneakyMap extends Map {
                *[Symbol.iterator]() {}
              }
              const m = new SneakyMap()
              for (let i = 0; i < 20_000; i++) m.set(`k${i}`, 'v'.repeat(50))
              return m
            }
            class SneakySet extends Set {
              *[Symbol.iterator]() {}
            }
            const st = new SneakySet()
            for (let i = 0; i < 20_000; i++) st.add(`v${i}`.repeat(10))
            return st
          }, 1024)
          expect(result.error?.message).toMatch(/Capability boundary/)
        })
      }
      it('an ordinary Map still crosses — the fix must not ban plain data', async () => {
        const VM = new AgentVM()
        const store = {
          get: async () => new Map([['a', 1]]),
          set: async () => {},
        }
        const result = await VM.run(
          readAgent(),
          {},
          { capabilities: { store } }
        )
        expect(result.error).toBeUndefined()
        expect(result.result?.data).toBeInstanceOf(Map)
      })
      it('an oversized PLAIN Map is still rejected on budget', async () => {
        const result = await rejects(() => {
          const m = new Map()
          for (let i = 0; i < 20_000; i++) m.set(`k${i}`, 'v'.repeat(50))
          return m
        }, 1024)
        expect(result.error?.message).toMatch(/Capability boundary/)
      })
    })
    it('rejects a raw host reference (process) returned by a capability', async () => {
      const VM = new AgentVM()
      const store = {
        get: async () => globalThis.process,
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
    it('budgets binary + collection payloads (TypedArray/ArrayBuffer/Map/Set)', async () => {
      const VM = new AgentVM()
      const payloads = [
        ['Uint8Array', new Uint8Array(50_000)],
        ['ArrayBuffer', new ArrayBuffer(50_000)],
        ['Map', new Map(Array.from({ length: 500 }, (_, i) => [i, i]))],
        ['Set', new Set(Array.from({ length: 500 }, (_, i) => i))],
        ['array of primitives', Array.from({ length: 500 }, (_, i) => i)],
      ]
      for (const [name, val] of payloads) {
        const store = { get: async () => val, set: async () => {} }
        const result = await VM.run(
          readAgent(),
          {},
          { capabilities: { store }, membraneMaxBytes: 1000 }
        )
        expect(result.error, `${name} should be rejected`).toBeDefined()
        expect(result.error?.message).toMatch(/membrane budget/)
      }
    })
    it('kind-checks Map/Set contents (a function value is rejected)', async () => {
      const VM = new AgentVM()
      const store = {
        get: async () => new Map([['leak', () => globalThis.process]]),
        set: async () => {},
      }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/Capability boundary/)
    })
    it('small binary/collection payloads pass through, cloned', async () => {
      const VM = new AgentVM()
      const store = {
        get: async () => new Map([['a', 1]]),
        set: async () => {},
      }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(result.error).toBeUndefined()
      expect([...result.result.data]).toEqual([['a', 1]])
    })
    it('terminates on a cyclic capability return (clone once, no infinite walk)', async () => {
      const VM = new AgentVM()
      const cyclic = { name: 'node' }
      cyclic.self = cyclic
      const store = { get: async () => cyclic, set: async () => {} }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(result.error).toBeUndefined()
      expect(result.result.data.name).toBe('node')
      expect(result.result.data.self).toBe(result.result.data)
    })
    it('rejects an over-deep capability return (depth limit)', async () => {
      const VM = new AgentVM()
      let deep = {}
      for (let i = 0; i < 11_000; i++) deep = { next: deep }
      const store = { get: async () => deep, set: async () => {} }
      const result = await VM.run(readAgent(), {}, { capabilities: { store } })
      expect(result.error).toBeDefined()
      expect(result.error?.message).toMatch(/depth limit/)
    })
  })
  describe('inherited names never resolve to host values (prototype-chain lookup)', () => {
    const INHERITED = [
      'constructor',
      'toString',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
      '__defineGetter__',
      '__defineSetter__',
      '__lookupGetter__',
      '__lookupSetter__',
    ]
    for (const name of INHERITED) {
      it(`\`${name}\` does not resolve to a host value`, async () => {
        const result = await Eval({ code: `return { v: ${name} }`, fuel: 400 })
        const v = result.result && result.result.v
        expect(typeof v).not.toBe('function')
        expect(typeof v).not.toBe('object')
      })
    }
    it('an inherited name cannot be CALLED with guest arguments', async () => {
      const result = await Eval({
        code: `return { v: constructor('abc') }`,
        fuel: 400,
      })
      expect(result.result?.v).not.toBe('abc')
      expect(result.error).toBeDefined()
    })
    it('the guard does not sever the SCOPE chain', async () => {
      const result = await Eval({
        code: `let outer = 7\nif (true) { outer = outer + 1 }\nreturn { outer }`,
        fuel: 400,
      })
      expect(result.result).toEqual({ outer: 8 })
    })
    it('ordinary builtins and state still resolve', async () => {
      expect(
        (await Eval({ code: 'return { v: Math.max(1, 2) }', fuel: 400 })).result
      ).toEqual({ v: 2 })
      expect(
        (await Eval({ code: "return { v: parseInt('42') }", fuel: 400 })).result
      ).toEqual({ v: 42 })
      expect(
        (await Eval({ code: 'let x = 5\nreturn { x }', fuel: 400 })).result
      ).toEqual({ x: 5 })
    })
  })
})
