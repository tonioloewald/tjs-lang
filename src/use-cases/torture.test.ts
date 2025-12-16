import { describe, it, expect, mock } from 'bun:test'
import { A99 } from '../builder'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'

// --- Generators ---

const createFib = () =>
  A99.take(s.object({ n: s.number }))
    .varSet({ key: 'n', value: A99.args('n') })
    .varSet({ key: 'a', value: 0 })
    .varSet({ key: 'b', value: 1 })
    .while('n > 0', { n: 'n' }, (loop) =>
      loop
        .mathCalc({ expr: 'a + b', vars: { a: 'a', b: 'b' } })
        .as('temp')
        .varSet({ key: 'a', value: 'b' })
        .varSet({ key: 'b', value: 'temp' })
        .mathCalc({ expr: 'n - 1', vars: { n: 'n' } })
        .as('n')
    )
    .varSet({ key: 'result', value: 'a' })
    .return(s.object({ result: s.number }))

const createOrchestrator = () =>
  A99.take(s.object({ items: s.array(s.string) }))
    .varSet({ key: 'results', value: [] })
    .map('args.items', 'item', (b) =>
      b
        .varSet({ key: 'attempts', value: 0 })
        .varSet({ key: 'success', value: false })
        .while(
          '!success && attempts < 3',
          { success: 'success', attempts: 'attempts' },
          (loop) =>
            loop.try({
              try: (tBuilder) =>
                tBuilder
                  .httpFetch({ url: 'item' })
                  .as('res')
                  .varSet({ key: 'result', value: 'res' })
                  .varSet({ key: 'success', value: true }),
              catch: (c) =>
                c
                  .mathCalc({
                    expr: 'attempts + 1',
                    vars: { attempts: 'attempts' },
                  })
                  .as('attempts'),
            })
        )
    )
    .as('results')
    .return(s.object({ results: s.array(s.any) }))

// --- Test Suite ---

describe('Torture Test', () => {
  it('should run diverse workload in parallel without cross-contamination', async () => {
    // 1. Setup Environment
    const caps = {
      fetch: mock(async (url) => ({ status: 'ok', url })),
    }
    const vm = new AgentVM() // Default VM

    // 2. Generate Workload
    const count = 100
    const workload = Array.from({ length: count }, (_, i) => {
      const type = i % 2 === 0 ? 'fib' : 'orch'
      if (type === 'fib') {
        return {
          id: i,
          type,
          ast: createFib().toJSON(),
          input: { n: 10 + (i % 5) }, // Variable input
          expected: (n: number) => {
            // Fib helper
            let a = 0,
              b = 1
            while (n-- > 0) {
              const t = a + b
              a = b
              b = t
            }
            return a
          },
        }
      } else {
        return {
          id: i,
          type,
          ast: createOrchestrator().toJSON(),
          input: { items: [`req_${i}_a`, `req_${i}_b`] },
          expected: (input: any) =>
            input.items.map((url: string) => ({ status: 'ok', url })),
        }
      }
    })

    // 3. Execute Concurrently
    const startTime = performance.now()
    const results = await Promise.all(
      workload.map(async (task) => {
        try {
          const res = await vm.run(task.ast, task.input as any, {
            capabilities: caps,
            fuel: 10000,
          })
          return { id: task.id, success: true, data: res.result, task }
        } catch (e: any) {
          return { id: task.id, success: false, error: e.message, task }
        }
      })
    )
    const duration = performance.now() - startTime

    // 4. Verify
    console.log(`Torture Test: Ran ${count} agents in ${duration.toFixed(2)}ms`)

    results.forEach((res) => {
      if (!res.success) {
        console.error(`Task ${res.id} failed:`, res.error)
      }
      expect(res.success).toBe(true)

      if (res.task.type === 'fib') {
        const expected = (res.task.expected as (...args: any[]) => any)(
          res.task.input.n
        )
        expect(res.data.result).toBe(expected)
      } else {
        const expected = (res.task.expected as (...args: any[]) => any)(
          res.task.input
        )
        expect(res.data.results).toEqual(expected)
      }
    })
  })
})
