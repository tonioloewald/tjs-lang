import { describe, it, expect, mock } from 'bun:test'
import { A99 } from '../builder'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'
import {
  llmPredictBattery,
  storeSearch,
  storeVectorize,
} from '../atoms/batteries'

describe('Use Case: Sophisticated Agents', () => {
  it('should implement a Robust MCQ Agent (Retry on Invalid Output)', async () => {
    // Logic: Ask question. Validate 'A','B','C','D'. Retry if invalid.
    const mcqAgent = A99.take(s.object({ question: s.string }))
      .varSet({ key: 'prompt', value: A99.args('question') })
      .varSet({ key: 'attempts', value: 0 })
      .varSet({ key: 'valid', value: false })
      .varSet({ key: 'answer', value: '' })
      .while(
        '!valid && attempts < 3',
        { valid: 'valid', attempts: 'attempts' },
        (loop) =>
          loop
            // Predict
            .step({
              op: 'llmPredictBattery',
              system: 'You are a quiz bot. Reply ONLY with A, B, C, or D.',
              user: 'prompt',
            })
            .as('rawResponse') // Structure { content: string }

            // Extract Content
            .varSet({ key: 'content', value: 'rawResponse.content' })

            // Validate
            .if(
              'content == "A" || content == "B" || content == "C" || content == "D"',
              { content: 'content' },
              (pass) =>
                pass
                  .varSet({ key: 'valid', value: true })
                  .varSet({ key: 'answer', value: 'content' }),
              (fail) =>
                fail
                  // Increment attempts
                  .mathCalc({
                    expr: 'attempts + 1',
                    vars: { attempts: 'attempts' },
                  })
                  .as('attempts')
                  // Update Prompt to complain
                  .template({
                    tmpl: '{{prev}}\nInvalid answer "{{bad}}". Please reply A, B, C, or D.',
                    vars: { prev: 'prompt', bad: 'content' },
                  })
                  .as('prompt')
            )
      )
      .return(s.object({ answer: s.string, attempts: s.number }))

    // Mock Capability
    // Behavior:
    // Call 1: "Paris" (Invalid)
    // Call 2: "A" (Valid)
    let callCount = 0
    const caps = {
      llm: {
        predict: mock(async (_sys, _user) => {
          callCount++
          if (callCount === 1) return { content: 'Paris' }
          if (callCount === 2) return { content: 'A' }
          return { content: 'C' }
        }),
      },
    } as any

    const vm = new AgentVM({ llmPredictBattery })
    const result = await vm.run(
      mcqAgent.toJSON(),
      { question: 'What is the capital of France? A) Paris B) London' },
      { capabilities: caps }
    )

    expect(result.result.answer).toBe('A')
    // Attempt 0: "Paris" (Invalid) -> attempts becomes 1
    // Attempt 1: "A" (Valid) -> success
    // So attempts variable ends at 1.
    expect(result.result.attempts).toBe(1)
    expect(caps.llm.predict).toHaveBeenCalledTimes(2)
  })

  it('should implement Iterative RAG (Refinement Loop)', async () => {
    // Logic:
    // 1. Search.
    // 2. LLM Judge: "Is this relevant?"
    // 3. If No: Refine query and loop.
    // 4. If Yes: Answer.

    const iterativeRag = A99.take(s.object({ query: s.string }))
      .varSet({ key: 'currentQuery', value: A99.args('query') })
      .varSet({ key: 'found', value: false })
      .varSet({ key: 'attempts', value: 0 })
      .varSet({ key: 'finalAnswer', value: '' })

      .while(
        '!found && attempts < 2',
        { found: 'found', attempts: 'attempts' },
        (loop) =>
          loop
            // 1. Vectorize & Search
            .step({ op: 'storeVectorize', text: 'currentQuery' })
            .as('vec')
            .step({ op: 'storeSearch', collection: 'docs', queryVector: 'vec' })
            .as('docs')

            // 2. Judge
            .jsonStringify({ value: 'docs' })
            .as('context')
            .step({
              op: 'llmPredictBattery',
              system: 'Judge relevance. Reply "YES" or "NO".',
              user: 'Query: {{q}}\nDocs: {{c}}', // Template inside? No, step accepts string. We need template atom first.
            }) // Wait, user prop needs string. We need to template it first.

            // Let's Template Judge Prompt
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
            .as('judgment') // { content: "YES"|"NO" }

            .if(
              // Use resolveValue dot notation logic by passing path string to expression?
              // "judgment.content" in expression -> identifier "judgment", access "content".
              // Since judgment is object { content: "YES" }, "judgment.content" works in JSEP.
              // But if judgment is from state, variables must be resolved.
              // Our evaluateExpression logic resolves vars from state if they are passed in 'vars' map.
              // But we need to pass 'judgment' object to expression evaluator.
              // vars: { judgment: 'judgment' } -> resolves 'judgment' var from state.
              // So expr 'judgment.content' should work.
              'judgment.content == "YES"',
              { judgment: 'judgment' },
              (yes) =>
                yes
                  .varSet({ key: 'found', value: true })
                  // Generate Answer
                  .step({
                    op: 'llmPredictBattery',
                    system: 'Answer the question based on context.',
                    user: 'judgePrompt',
                  })
                  .as('ans')
                  .varSet({ key: 'answer', value: 'ans.content' }),
              (no) =>
                no
                  .mathCalc({
                    expr: 'attempts + 1',
                    vars: { attempts: 'attempts' },
                  })
                  .as('attempts')
                  // Refine Query (Mock: Append " Inc")
                  .template({ tmpl: '{{q}} Inc', vars: { q: 'currentQuery' } })
                  .as('currentQuery')
            )
      )
      .return(s.object({ answer: s.string, attempts: s.number }))

    // Mock Capabilities
    const caps = {
      llm: {
        predict: mock(async (sys, user) => {
          if (sys.includes('Judge')) {
            // If docs contain "Fruit", say NO.
            // If docs contain "Tech", say YES.
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
          if (text.includes('Inc')) return [0.9] // Tech
          return [0.1] // Fruit (default for "Apple")
        }),
      },
      store: {
        vectorSearch: mock(async (_coll, vec) => {
          if (vec[0] === 0.1) return [{ content: 'Apples are a Fruit.' }]
          if (vec[0] === 0.9) return [{ content: 'Apple is a Tech company.' }]
          return []
        }),
      },
    } as any

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
    expect(result.result.attempts).toBe(1) // 0 means 1st try succeeded. 1 means 2nd try (1 retry).
    // attempts starts at 0.
    // Iteration 1: "Apple" -> [0.1] -> Fruit -> NO -> attempts=1 -> Query="Apple Inc"
    // Iteration 2: "Apple Inc" -> [0.9] -> Tech -> YES -> Answer -> found=true
    // Result attempts=1. Correct.
  })
})
