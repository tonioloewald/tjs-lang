import { describe, it, expect, mock } from 'bun:test'
import { A99 } from '../builder'
import { AgentVM } from '../runtime'
import { s } from 'tosijs-schema'

describe('Use Case: RAG Processor', () => {
  it('should retrieve relevant docs and generate answer', async () => {
    // 1. Mock Capabilities
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
        set: mock(async () => {
          // noop
        }),
        vectorSearch: mock(async (collection, vector) => {
          // Verify vector passed
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

    // 2. Build Logic
    // Input: { query: string }
    const rag = A99.take(s.object({ query: s.string }))
      // A. Embed Query
      // We don't have explicit 'llm.embed' atom in coreAtoms map yet?
      // runtime.ts has 'llm.predict'.
      // Let's check runtime.ts.
      // It has 'llm.predict'. It does NOT have 'llm.embed' exposed as atom.
      // But capabilities has it.
      // I should add 'llm.embed' atom or use a custom atom here.
      // For this test, let's define a custom atom for embedding.
      // Or I can add it to runtime.ts (since RAG is a core use case).
      // Given I can't edit runtime.ts in this turn, I will use a custom atom definition in the test VM.

      // But wait, the prompt asked me to write the file. I can't modify runtime.ts.
      // So I will define 'llm.embed' locally and use A99.custom() or mix it in.
      // But A99 builder relies on 'coreAtoms'.
      // I can use `builder.step()` with a manual node?
      // Or I can use `defineAtom` and pass it to `A99.custom()`.

      // Let's assume I use A99.custom() pattern.

      // B. Vector Search
      // 'store.vectorSearch' IS in coreAtoms.

      // C. Predict
      // 'llm.predict' IS in coreAtoms.

      // Let's build the flow.
      .step({ op: 'llmEmbed', text: A99.args('query') })
      .as('vector')

      .storeVectorSearch({ vector: 'vector' })
      .as('docs')

      // D. Construct Prompt
      // "Context: {{docs}}\nQuery: {{query}}"
      // docs is array of objects. Template atom stringifies?
      // JSON.stringify docs first?
      .jsonStringify({ value: 'docs' })
      .as('contextStr')

      .template({
        tmpl: 'Context: {{context}}\nQuery: {{query}}',
        vars: { context: 'contextStr', query: A99.args('query') },
      })
      .as('prompt')

      // E. Generate
      .llmPredict({ prompt: 'prompt' })
      .as('answer')

      // We want to return docs as sources
      .varSet({ key: 'sources', value: 'docs' })
      .return(s.object({ answer: s.any, sources: s.any }))

    // 3. Define Custom Atom
    const embedAtom = {
      op: 'llmEmbed',
      inputSchema: s.any,
      create: (input: any) => ({ op: 'llmEmbed', ...input }),
      exec: async (step: any, ctx: any) => {
        // const text = ctx.args[step.text.path] // Manual resolve for now or assume simple arg ref
        // We need robust resolve?
        // Since we can't import resolveValue, we rely on ctx.capabilities.llm.embed
        // But wait, 'text' in step might be 'args.query' string if resolved by builder?
        // Builder: A99.args('query') -> { $kind: 'arg', path: 'query' }
        // So step.text is that object.
        // We need resolveValue logic.
        // But I can't import resolveValue.
        // I can import resolveValue if I export it? No it's internal.
        // I can copy-paste resolve logic or implementation.
        // OR I can use `VM.run` with a VM that has this atom registered, but the atom implementation needs helper.
        // Actually, `defineAtom` in runtime.ts wraps execution and provides resolution?
        // No, `resolveValue` is used INSIDE specific atoms.
        // If I define a custom atom here, I don't have access to `resolveValue`.
        // This is a limitation. Custom atoms need access to resolution.
        // For this test, I will implement a simple resolver.
        const val = step.text
        const resolved =
          val?.$kind === 'arg' ? ctx.args[val.path] : ctx.state[val] ?? val
        const embedding = await ctx.capabilities.llm.embed(resolved)
        if (step.result) ctx.state[step.result] = embedding
      },
    }

    // 4. Run
    // We need to inject the atom.
    // VM is a singleton instance. I can't inject easily without polluting.
    // I should create a NEW VM instance.
    // VM export is `const VM = new AgentVM()`.
    // AgentVM class is exported?
    // `export class AgentVM` in runtime.ts. Yes.

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
    // 1. Mock Capabilities
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
        set: mock(async () => {
          // noop
        }),
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
      create: (input: any) => ({ op: 'llmEmbed', ...input }),
      exec: async (step: any, ctx: any) => {
        // const text = ctx.args[step.text.path]
        const val = step.text
        const resolved =
          val?.$kind === 'arg' ? ctx.args[val.path] : ctx.state[val] ?? val
        const embedding = await ctx.capabilities.llm.embed(resolved)
        if (step.result) ctx.state[step.result] = embedding
      },
    }

    const customVM = new AgentVM({ llmEmbed: embedAtom })

    // Build Logic
    const rag = A99.take(s.object({ query: s.string }))
      .step({ op: 'llmEmbed', text: A99.args('query') })
      .as('vector')
      .storeVectorSearch({ collection: 'default', vector: 'vector' })
      .as('docs')
      .jsonStringify({ value: 'docs' })
      .as('contextStr')
      .template({
        tmpl: 'Context: {{context}}\nQuery: {{query}}',
        vars: { context: 'contextStr', query: A99.args('query') },
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

    // Run 10 mixed requests
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
