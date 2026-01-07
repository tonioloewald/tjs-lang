import { describe, it, expect, mock } from 'bun:test'
import { A99 } from '../builder'
import { defineAtom } from '../runtime'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'

describe('Use Case: Malicious Actor', () => {
  const VM = new AgentVM()

  it('should terminate infinite loops via Fuel limit', async () => {
    // Malicious Agent: Infinite Loop
    const infinite = A99.take(s.object({}))
      .while('1 == 1', {}, (b) => b.varSet({ key: 'x', value: 1 }))
      .return(s.object({}))

    const ast = infinite.toJSON()

    // 1. Run with limited fuel -> Should throw
    await expect(VM.run(ast, {}, { fuel: 10 })).rejects.toThrow('Out of Fuel')

    // 2. Run with enough fuel (simulated) -> Should fail eventually or return if limited loops
    // In this case condition is always true, so it loops forever.
    // Even with 1000000 fuel, it will exhaust it.
  })

  it('should prevent access to prototype/constructor (Sandbox)', async () => {
    // Malicious Agent: Try to access constructor of an object via ExprNode
    // {}.constructor -> Function -> ...
    const exploit = A99.take(s.object({}))
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

    // It should evaluate to undefined or throw, or return the function if unsafe?
    // Safe sandbox should block access to __proto__, constructor, prototype.

    await expect(VM.run(ast, {})).rejects.toThrow(/Security Error/)
  })

  it('should prevent access to global process/Bun (Sandbox)', async () => {
    // Attempt to access global variable 'process' via evaluation
    // Since our evaluator only resolves from state/args...
    // The only way to access globals is if 'state' has them or prototype chain leaks.

    const exploit = A99.take(s.object({}))
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

    const builder = A99.custom({ ...vm['atoms'] })
    const exploit = builder
      .step({ op: 'fileRead', path: '../../etc/passwd' }) // Use step or typed if we updated types
      .as('content')
      .return(s.object({ content: s.any }))

    await expect(
      vm.run(exploit.toJSON(), {}, { capabilities: caps })
    ).rejects.toThrow('Access Denied')
  })
})
