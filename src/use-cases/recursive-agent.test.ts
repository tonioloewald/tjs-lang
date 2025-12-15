import { describe, it, expect, mock } from 'bun:test'
import { A99 } from '../builder'
import { VM, AgentVM } from '../runtime'
import { s } from 'tosijs-schema'

describe('Use Case: Recursive Agent', () => {
  it('should implement a recursive factorial agent', async () => {
    // Defines a factorial agent that calls itself recursively using 'agent.run'
    // Factorial(n):
    // if n <= 1 return 1
    // else return n * Factorial(n - 1)

    const factorial = A99.take(s.object({ n: s.number }))
      .varSet({ key: 'n', value: A99.args('n') })
      .if(
        'n <= 1',
        { n: 'n' },
        (b) => b.varSet({ key: 'result', value: 1 }).return(s.object({ result: s.number })),
        (b) =>
          b
            .mathCalc({ expr: 'n - 1', vars: { n: 'n' } })
            .as('nMinus1')
            .agentRun({ agentId: 'factorial', input: { n: 'nMinus1' } })
            .as('subResult')
            // subResult is { result: ... }
            // Extract result property from subResult
            // 'math.calc' can access properties via JSEP!
            // 'n * subResult.result'
            .mathCalc({
              expr: 'n * subResult.result',
              vars: { n: 'n', subResult: 'subResult' },
            })
            .as('result')
            .return(s.object({ result: s.number }))
      )

    // To run this, we need a VM that can handle 'agent.run' by invoking a new VM instance with the same logic.
    // The default 'agent.run' atom uses `ctx.capabilities.agent.run`.
    // We can mock this capability to recurse.

    const caps = {
      agent: {
        run: async (agentId: string, input: any) => {
          if (agentId === 'factorial') {
            // Recurse!
            // We need to use a NEW VM instance or reuse?
            // Reuse logic.
            // Note: In real system, this might be a network call or separate process.
            // Here we just recursively call VM.run
            const res = await VM.run(
              factorial.toJSON(),
              input,
              {
                capabilities: caps, // Pass capabilities down
                fuel: 100, // Reset fuel for sub-agent or share?
                // If we want to test global fuel limit, we should share a fuel counter ref?
                // Current VM takes `fuel: number` (by value).
                // So infinite recursion is possible if depth < stack limit.
              }
            )
            return res.result
          }
          throw new Error(`Unknown agent ${agentId}`)
        },
      },
    }

    const result = await VM.run(
      factorial.toJSON(),
      { n: 5 },
      { capabilities: caps, fuel: 1000 }
    )

    // 5! = 120
    expect(result.result.result).toBe(120)
  })

  it('should enforce fuel limits across recursion if shared (Simulated)', async () => {
    // If we want to limit TOTAL fuel, we need a shared mutable fuel container.
    // The current VM architecture passes `fuel` as a number property in context.
    // So fuel is local to the VM run call.
    // To test shared limits, we'd need to modify the capability to decrement a shared counter
    // or the VM to support external fuel reference.
    // For this test, we accept that standard recursion resets fuel per stack frame unless managed by orchestrator.
    // But we can simulate "out of fuel" by passing low fuel to recursive call.

    const factorial = A99.take(s.object({ n: s.number }))
      .varSet({ key: 'n', value: A99.args('n') })
      .if(
        'n <= 1',
        { n: 'n' },
        (b) => b.varSet({ key: 'result', value: 1 }).return(s.object({})),
        (b) =>
          b
            .mathCalc({ expr: 'n - 1', vars: { n: 'n' } })
            .as('nMinus1')
            .agentRun({ agentId: 'factorial', input: { n: 'nMinus1' } })
            .as('subResult')
      )

    let depth = 0
    const caps = {
      agent: {
        run: async (agentId: string, input: any) => {
          depth++
          // Decrease fuel dramatically
          return VM.run(factorial.toJSON(), input, {
            capabilities: caps,
            fuel: 2, // Very low fuel for children
          })
        },
      },
    }

    // Run deep recursion
    // n=10. Depth will be 10.
    // Each step costs ~5 fuel.
    // If child gets only 2 fuel, it should fail immediately.
    expect(
      VM.run(factorial.toJSON(), { n: 10 }, { capabilities: caps })
    ).rejects.toThrow('Out of Fuel')
  })

  it('should handle concurrent recursive agents', async () => {
    // 5! = 120, 6! = 720
    const inputs = [5, 6, 5, 6]
    const factorial = A99.take(s.object({ n: s.number }))
      .varSet({ key: 'n', value: A99.args('n') })
      .if(
        'n <= 1',
        { n: 'n' },
        (b) => b.varSet({ key: 'result', value: 1 }).return(s.object({ result: s.number })),
        (b) =>
          b
            .mathCalc({ expr: 'n - 1', vars: { n: 'n' } })
            .as('nMinus1')
            .agentRun({ agentId: 'factorial', input: { n: 'nMinus1' } })
            .as('subResult')
            .mathCalc({
              expr: 'n * subResult.result',
              vars: { n: 'n', subResult: 'subResult' },
            })
            .as('result')
            .return(s.object({ result: s.number }))
      )

    const ast = factorial.toJSON()

    // We need a caps factory or ensure caps are concurrency-safe
    // Since our simple mock logic is stateless (except recursion which creates new VM), it should be fine.
    const caps = {
      agent: {
        run: async (agentId: string, input: any) => {
          if (agentId === 'factorial') {
            const res = await VM.run(ast, input, {
              capabilities: caps,
              fuel: 1000,
            })
            return res.result
          }
          throw new Error(`Unknown agent ${agentId}`)
        },
      },
    }

    const results = await Promise.all(
      inputs.map((n) =>
        VM.run(ast, { n }, { capabilities: caps, fuel: 1000 })
      )
    )

    const values = results.map((r) => r.result.result)
    expect(values).toEqual([120, 720, 120, 720])
  })
})