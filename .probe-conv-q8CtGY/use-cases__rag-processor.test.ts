/* tjs <- input.ts */

import { describe, it, expect, mock } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { s } from 'tosijs-schema'

describe('Use Case: RAG Processor', () => {
  it('should retrieve relevant docs and generate answer', async () => {
    const caps = {
      llm: {
        predict: mock(async (prompt) => {
          if (prompt.includes('Paris')) return 'Paris is the capital of France.'
          return 'I do not know.'
        }),
        embed: mock(async (text) => {
          if (text === 'Capital of France?') return [0.1, 0.2, 0.3]
          return [0, 0, 0]
        }),
      },
      store: {
        get: mock(async () => null),
        set: mock(async () => {}),
        vectorSearch: mock(async (collection, vector) => {
          if (vector[0] === 0.1) {
            return [
              { id: 'doc1', content: 'Paris is a city.' },
              { id: 'doc2', content: 'France is a country.' },
            ]
          }
          return []
        }),
      },
    }

    const rag = Agent.take(s.object({ query: s.string }))

      .step({ op: 'llmEmbed', text: Agent.args('query') })
      .as('vector')
      .storeVectorSearch({ vector: 'vector' })
      .as('docs')

      .jsonStringify({ value: 'docs' })
      .as('contextStr')
      .template({
        tmpl: 'Context: {{context}}\nQuery: {{query}}',
        vars: { context: 'contextStr', query: Agent.args('query') },
      })
      .as('prompt')

      .llmPredict({ prompt: 'prompt' })
      .as('answer')

      .varSet({ key: 'sources', value: 'docs' })
      .return(s.object({ answer: s.any, sources: s.any }))

    const embedAtom = {
      op: 'llmEmbed',
      inputSchema: s.any,
      create: (input) => ({ op: 'llmEmbed', ...input }),
      exec: async (step, ctx) => {
        const val = step.text
        const resolved =
          val?.$kind === 'arg' ? ctx.args[val.path] : ctx.state[val] ?? val
        const embedding = await ctx.capabilities.llm.embed(resolved)
        if (step.result) ctx.state[step.result] = embedding
      },
    }

    const customVM = new AgentVM({ llmEmbed: embedAtom })
    const result = await customVM.run(
      rag.toJSON(),
      { query: 'Capital of France?' },
      { capabilities: caps }
    )
    expect(result.result.answer).toBe('Paris is the capital of France.')
    expect(result.result.sources).toHaveLength(2)
    expect(caps.llm.embed).toHaveBeenCalledWith('Capital of France?')
  })
  it('should handle concurrent RAG requests', async () => {
    const caps = {
      llm: {
        predict: mock(async (prompt) => {
          if (prompt.includes('Paris')) return 'Paris is the capital of France.'
          if (prompt.includes('Berlin'))
            return 'Berlin is the capital of Germany.'
          return 'I do not know.'
        }),
        embed: mock(async (text) => {
          if (text.includes('France')) return [0.1, 0.2, 0.3]
          if (text.includes('Germany')) return [0.4, 0.5, 0.6]
          return [0, 0, 0]
        }),
      },
      store: {
        get: mock(async () => null),
        set: mock(async () => {}),
        vectorSearch: mock(async (collection, vector) => {
          if (vector[0] === 0.1)
            return [{ id: 'doc1', content: 'Paris is a city.' }]
          if (vector[0] === 0.4)
            return [{ id: 'doc2', content: 'Berlin is a city.' }]
          return []
        }),
      },
    }
    const embedAtom = {
      op: 'llmEmbed',
      inputSchema: s.any,
      create: (input) => ({ op: 'llmEmbed', ...input }),
      exec: async (step, ctx) => {
        const val = step.text
        const resolved =
          val?.$kind === 'arg' ? ctx.args[val.path] : ctx.state[val] ?? val
        const embedding = await ctx.capabilities.llm.embed(resolved)
        if (step.result) ctx.state[step.result] = embedding
      },
    }
    const customVM = new AgentVM({ llmEmbed: embedAtom })

    const rag = Agent.take(s.object({ query: s.string }))
      .step({ op: 'llmEmbed', text: Agent.args('query') })
      .as('vector')
      .storeVectorSearch({ collection: 'default', vector: 'vector' })
      .as('docs')
      .jsonStringify({ value: 'docs' })
      .as('contextStr')
      .template({
        tmpl: 'Context: {{context}}\nQuery: {{query}}',
        vars: { context: 'contextStr', query: Agent.args('query') },
      })
      .as('prompt')
      .llmPredict({ prompt: 'prompt' })
      .as('answer')
      .varSet({ key: 'sources', value: 'docs' })
      .return(s.object({ answer: s.any, sources: s.any }))
    const ast = rag.toJSON()
    const queries = [
      { q: 'Capital of France?', a: 'Paris is the capital of France.' },
      { q: 'Capital of Germany?', a: 'Berlin is the capital of Germany.' },
    ]

    const workload = Array.from({ length: 10 }, (_, i) => queries[i % 2])
    const results = await Promise.all(
      workload.map((w) =>
        customVM.run(ast, { query: w.q }, { capabilities: caps })
      )
    )
    results.forEach((res, i) => {
      expect(res.result.answer).toBe(workload[i].a)
    })
  })
})
