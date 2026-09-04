/* tjs <- input.ts */

import { describe, it, expect, mock } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import {
  defineAtom,
  resolveValue,
} from '/Users/tonioloewald/tjs-lang/src/runtime'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { s } from 'tosijs-schema'

import { llmPredictBattery } from '/Users/tonioloewald/tjs-lang/src/atoms/batteries'

const searchAtom = defineAtom(
  'search',
  s.object({ query: s.string }),
  s.any,
  async (step, ctx) => ctx.capabilities.search(resolveValue(step.query, ctx))
)

describe('Use Case: Comparison (Honed API)', () => {
  it('should implement Research Agent with honed syntax', async () => {
    const vm = new AgentVM({
      search: searchAtom,
      llmPredictBattery,
    })

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

    const caps = {
      search: mock(async (query) => `Results for ${query}`),
      llmBattery: {
        predict: mock(async (sys, user) => {
          if (sys.includes('Summarize'))
            return { content: `Summary of ${user}` }
          if (sys.includes('Refine')) return { content: `Refined ${user}` }
          return { content: '' }
        }),
      },
    }

    const result = await vm.run(
      researchAgent.toJSON(),
      { topic: 'AI' },
      { capabilities: caps }
    )

    expect(result.result.refinedSummary.content).toBe(
      'Summary of Results for Refined AI'
    )
  })
})
