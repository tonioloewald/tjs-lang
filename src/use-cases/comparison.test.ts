import { describe, it, expect, mock } from 'bun:test'
import { A99 } from '../builder'
import { defineAtom, resolveValue } from '../runtime'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'
import { llmPredictBattery } from '../atoms/batteries'

// Custom search atom definition
const searchAtom = defineAtom(
  'search',
  s.object({ query: s.string }),
  s.any,
  async (step, ctx) => ctx.capabilities.search(resolveValue(step.query, ctx))
)

describe('Use Case: Comparison (Honed API)', () => {
  it('should implement Research Agent with honed syntax', async () => {
    // 1. Setup Custom VM
    // Override llmPredict with battery version for system prompt support
    const vm = new AgentVM({
      search: searchAtom,
      llmPredictBattery,
    })

    // 2. Build Agent with Honed API
    // - Implicit state access in expressions (no { vars: ... })
    // - Custom atoms via builder proxy
    // - .set() helper (simulated via varSet for now, assuming user meant honing the API surface in builder)

    const researchAgent = A99.custom({
      ...vm['atoms'],
      llmPredict: llmPredictBattery,
    })
      .varSet({ key: 'topic', value: A99.args('topic') })
      .varSet({ key: 'summary', value: '' })
      .varSet({ key: 'isGood', value: false })
      .varSet({ key: 'attempts', value: 0 })

      .while('!isGood && attempts < 3', {}, (loop) =>
        loop
          // Search (Custom Atom via Proxy)
          .search({ query: 'topic' })
          .as('results')

          // Summarize
          .llmPredict({ system: 'Summarize', user: 'results' })
          .as('summary')

          // Critique
          .llmPredict({ system: 'Is this good? YES/NO', user: 'summary' })
          .as('critique')

          // Check
          .if(
            'critique == "YES"',
            {}, // No explicit vars needed!
            (yes) => yes.varSet({ key: 'isGood', value: true }),
            (no) =>
              no
                .mathCalc({ expr: 'attempts + 1' }) // Implicit vars
                .as('attempts')
                .llmPredict({ system: 'Refine query', user: 'topic' })
                .as('topic')
          )
      )
      .return(s.object({ summary: s.string }))

    // 3. Mock Capabilities
    const caps = {
      search: mock(async (query) => `Results for ${query}`),
      llm: {
        predict: mock(async (sys, user) => {
          console.log(`[Mock LLM] Sys: ${sys}, User: ${user}`)
          if (sys.includes('Summarize')) return `Summary of ${user}`
          if (sys.includes('good')) {
            if (user.includes('Refined')) return 'YES'
            return 'NO'
          }
          if (sys.includes('Refine')) return `Refined ${user}`
          return ''
        }),
      },
    }

    // 4. Run
    const result = await vm.run(
      researchAgent.toJSON(),
      { topic: 'AI' },
      { capabilities: caps }
    )

    // 5. Verify
    expect(result.result.summary).toContain('Refined AI')
    // Flow:
    // 1. Search(AI) -> Results(AI) -> Summary(AI) -> Critique(NO) -> Refine -> Topic(Refined AI) -> attempts=1
    // 2. Search(Refined AI) -> Results(Refined AI) -> Summary(Refined AI) -> Critique(YES) -> isGood=true
    // 3. Loop ends. Return summary.
    expect(result.result.summary).toBe('Summary of Results for Refined AI')
  })
})
