/* tjs <- input.ts */

import { describe, it, expect, mock } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { s } from 'tosijs-schema'

import {
  llmPredictBattery,
  storeSearch,
  storeVectorize,
} from '/Users/tonioloewald/tjs-lang/src/atoms/batteries'

describe('Use Case: Sophisticated Agents', () => {
  it('should implement a Robust MCQ Agent (Retry on Invalid Output)', async () => {
    const mcqAgent = Agent.take(s.object({ question: s.string }))
      .varSet({ key: 'prompt', value: Agent.args('question') })
      .varSet({ key: 'attempts', value: 0 })
      .varSet({ key: 'valid', value: false })
      .varSet({ key: 'answer', value: '' })
      .while(
        '!valid && attempts < 3',
        { valid: 'valid', attempts: 'attempts' },
        (loop) =>
          loop

            .step({
              op: 'llmPredictBattery',
              system: 'You are a quiz bot. Reply ONLY with A, B, C, or D.',
              user: 'prompt',
            })
            .as('rawResponse')

            .varSet({ key: 'content', value: 'rawResponse.content' })

            .if(
              'content == "A" || content == "B" || content == "C" || content == "D"',
              { content: 'content' },
              (pass) =>
                pass
                  .varSet({ key: 'valid', value: true })
                  .varSet({ key: 'answer', value: 'content' }),
              (fail) =>
                fail

                  .varSet({
                    key: 'attempts',
                    value: {
                      $expr: 'binary',
                      op: '+',
                      left: { $expr: 'ident', name: 'attempts' },
                      right: { $expr: 'literal', value: 1 },
                    },
                  })

                  .template({
                    tmpl: '{{prev}}\nInvalid answer "{{bad}}". Please reply A, B, C, or D.',
                    vars: { prev: 'prompt', bad: 'content' },
                  })
                  .as('prompt')
            )
      )
      .return(s.object({ answer: s.string, attempts: s.number }))

    let callCount = 0
    const caps = {
      llmBattery: {
        predict: mock(async (_sys, _user) => {
          callCount++
          if (callCount === 1) return { content: 'Paris' }
          if (callCount === 2) return { content: 'A' }
          return { content: 'C' }
        }),
      },
    }
    const vm = new AgentVM({ llmPredictBattery })
    const result = await vm.run(
      mcqAgent.toJSON(),
      { question: 'What is the capital of France? A) Paris B) London' },
      { capabilities: caps }
    )
    expect(result.result.answer).toBe('A')

    expect(result.result.attempts).toBe(1)
    expect(caps.llmBattery.predict).toHaveBeenCalledTimes(2)
  })
  it('should implement Iterative RAG (Refinement Loop)', async () => {
    const iterativeRag = Agent.take(s.object({ query: s.string }))
      .varSet({ key: 'currentQuery', value: Agent.args('query') })
      .varSet({ key: 'found', value: false })
      .varSet({ key: 'attempts', value: 0 })
      .varSet({ key: 'finalAnswer', value: '' })
      .while(
        '!found && attempts < 2',
        { found: 'found', attempts: 'attempts' },
        (loop) =>
          loop

            .step({ op: 'storeVectorize', text: 'currentQuery' })
            .as('vec')
            .step({ op: 'storeSearch', collection: 'docs', queryVector: 'vec' })
            .as('docs')

            .jsonStringify({ value: 'docs' })
            .as('context')
            .step({
              op: 'llmPredictBattery',
              system: 'Judge relevance. Reply "YES" or "NO".',
              user: 'Query: {{q}}\nDocs: {{c}}',
            })

            .template({
              tmpl: 'Query: {{q}}\nDocs: {{c}}',
              vars: { q: 'currentQuery', c: 'context' },
            })
            .as('judgePrompt')
            .step({
              op: 'llmPredictBattery',
              system: 'Judge relevance. Reply YES if relevant, NO otherwise.',
              user: 'judgePrompt',
            })
            .as('judgment')
            .if(
              'judgment.content == "YES"',
              { judgment: 'judgment' },
              (yes) =>
                yes
                  .varSet({ key: 'found', value: true })

                  .step({
                    op: 'llmPredictBattery',
                    system: 'Answer the question based on context.',
                    user: 'judgePrompt',
                  })
                  .as('ans')
                  .varSet({ key: 'answer', value: 'ans.content' }),
              (no) =>
                no
                  .varSet({
                    key: 'attempts',
                    value: {
                      $expr: 'binary',
                      op: '+',
                      left: { $expr: 'ident', name: 'attempts' },
                      right: { $expr: 'literal', value: 1 },
                    },
                  })

                  .template({ tmpl: '{{q}} Inc', vars: { q: 'currentQuery' } })
                  .as('currentQuery')
            )
      )
      .return(s.object({ answer: s.string, attempts: s.number }))

    const caps = {
      llmBattery: {
        predict: mock(async (sys, user) => {
          if (sys.includes('Judge')) {
            if (user.includes('Fruit')) return { content: 'NO' }
            if (user.includes('Tech')) return { content: 'YES' }
            return { content: 'NO' }
          }
          if (sys.includes('Answer')) {
            return { content: 'Tim Cook' }
          }
          return { content: '?' }
        }),
      },
      vector: {
        embed: mock(async (text) => {
          if (text.includes('Inc')) return [0.9]
          return [0.1]
        }),
      },
      store: {
        get: mock(async (_key) => null),
        set: mock(async (_key, _value) => {}),
        vectorSearch: mock(async (_coll, vec) => {
          if (vec[0] === 0.1) return [{ content: 'Apples are a Fruit.' }]
          if (vec[0] === 0.9) return [{ content: 'Apple is a Tech company.' }]
          return []
        }),
      },
    }
    const vm = new AgentVM({
      llmPredictBattery,
      storeVectorize,
      storeSearch,
    })
    const result = await vm.run(
      iterativeRag.toJSON(),
      { query: 'Who is CEO of Apple?' },
      { capabilities: caps }
    )
    expect(result.result.answer).toBe('Tim Cook')
    expect(result.result.attempts).toBe(1)
  })
})
