import { describe, it, expect, mock } from 'bun:test'
import { Agent } from '../builder'
import { defineAtom, resolveValue, type Capabilities } from '../runtime'
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

    const researchAgent = Agent.custom({
      ...vm['atoms'],
      llmPredict: llmPredictBattery,
    })
      .search({ query: Agent.args('topic') })
      .as('results')
      .llmPredict({
        system: 'Summarize',
        user: 'results',
      })
      .as('summary')
      .llmPredict({
        system: 'Refine query',
        user: Agent.args('topic'),
      })
      .as('newTopic')
      .search({ query: 'newTopic.content' })
      .as('refinedResults')
      .llmPredict({
        system: 'Summarize',
        user: 'refinedResults',
      })
      .as('refinedSummary')
      .return(s.object({ refinedSummary: s.any }))

    // 3. Mock Capabilities
    const caps: Capabilities = {
      search: mock(async (query) => `Results for ${query}`),
      llmBattery: {
        predict: mock(async (sys: string, user: string) => {
          if (sys.includes('Summarize'))
            return { content: `Summary of ${user}` }
          if (sys.includes('Refine')) return { content: `Refined ${user}` }
          return { content: '' }
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
    expect(result.result.refinedSummary.content).toBe(
      'Summary of Results for Refined AI'
    )
  })
})
