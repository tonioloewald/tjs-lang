import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test'
import { A99 } from '../builder'
import { AgentVM } from '../runtime'
import { s } from 'tosijs-schema'
import {
  storeVectorize,
  storeSearch,
  llmPredictBattery,
} from '../atoms/batteries'

// Mock Batteries for Server
// We mock these to avoid heavy downloads/execution during test,
// but conceptually the server "has" them.
const mockBatteries = {
  vector: {
    embed: mock(async (text) => [0.9, 0.8, 0.7]),
  },
  store: {
    get: mock(async () => null),
    set: mock(async () => {}),
    vectorSearch: mock(async (_coll, _vec) => [
      { id: '1', content: 'Secret Server Doc' },
    ]),
  },
  llm: {
    predict: mock(async (sys, user) => ({ content: 'Server says: ' + user })),
  },
}

describe('Use Case: Asymmetric Client-Server', () => {
  let server: any
  let URL = ''

  // 1. Server Setup (Batteries Included)
  beforeAll(() => {
    // The Server VM knows about Battery Atoms and has Capabilities
    const serverVM = new AgentVM({
      storeVectorize,
      storeSearch,
      llmPredictBattery,
    })

    server = Bun.serve({
      port: 0,
      async fetch(req) {
        if (req.method === 'POST') {
          try {
            const body = await req.json()
            const { ast, args } = body

            // Execute using Server VM + Server Capabilities
            const result = await serverVM.run(ast, args, {
              capabilities: mockBatteries as any,
            })

            return new Response(JSON.stringify(result), {
              headers: { 'Content-Type': 'application/json' },
            })
          } catch (e: any) {
            return new Response(JSON.stringify({ error: e.message }), {
              status: 500,
            })
          }
        }
        return new Response('Not Found', { status: 404 })
      },
    })
    URL = `http://127.0.0.1:${server.port}/`
  })

  afterAll(() => {
    if (server) server.stop()
  })

  it('should execute atoms on server that client cannot execute locally', async () => {
    // 2. Client Setup (Bare bones)
    // The client builder needs to know about the atoms to build the AST,
    // but the client RUNTIME does not need the capabilities or implementation.
    // We use a builder configured with the atoms we EXPECT the server to support.

    // Note: In a real scenario, client imports definitions (types/schema) but not heavy deps.
    // Here we reuse the atom definitions from 'batteries.ts' for the builder schema.
    const { coreAtoms } = require('../runtime')
    const clientBuilder = A99.custom({
      ...coreAtoms,
      storeVectorize,
      storeSearch,
      llmPredictBattery,
    })

    // 3. Define Logic
    // This logic relies on Vector Search and LLM, which the Client does NOT have capabilities for.
    const logic = clientBuilder
      .step({ op: 'storeVectorize', text: 'query' })
      .as('vector')
      .step({
        op: 'storeSearch',
        collection: 'secret_docs',
        queryVector: 'vector',
      })
      .as('docs')
      .step({ op: 'jsonStringify', value: 'docs' })
      .as('docsStr')
      .step({
        op: 'llmPredictBattery',
        system: 'Summarize',
        user: 'Found: {{docs}}', // Pass docs to LLM? Wait, template atom needed first.
      }) // We skipped template atom for brevity, let's assume LLM user prompt handles simple vars or we add template.
      // Let's add template for correctness.
      // Does clientBuilder have core atoms? Yes, A99.custom merges core.
      .template({ tmpl: 'Analyze: {{docs}}', vars: { docs: 'docsStr' } })
      .as('prompt')
      .step({
        op: 'llmPredictBattery',
        system: 'Analyst',
        user: 'prompt',
      })
      .as('analysis')
      .return(s.object({ analysis: s.any })) // Return structure is actually { content: ... }

    // 4. Send to Server
    const response = await fetch(URL, {
      method: 'POST',
      body: JSON.stringify({
        ast: logic.toJSON(),
        args: { query: 'Top Secret' },
      }),
    })

    const data = await response.json()

    // 5. Verify Execution
    expect(response.status).toBe(200)
    // Verify LLM ran on server
    // Mock returns "Server says: " + user prompt
    // Prompt was "Analyze: [object Object]" (since docs is array/obj stringified by template simplistically)
    expect(data.result.analysis.content).toContain('Server says:')
    expect(data.result.analysis.content).toContain('Secret Server Doc')

    // Verify Server Capabilities were used
    expect(mockBatteries.vector.embed).toHaveBeenCalled()
    expect(mockBatteries.store.vectorSearch).toHaveBeenCalled()
    expect(mockBatteries.llm.predict).toHaveBeenCalled()
  })

  it('should fail if client tries to run locally without capabilities', async () => {
    // Client VM (Default)
    const clientVM = new AgentVM({
      storeVectorize,
      storeSearch,
      llmPredictBattery,
    })

    const { coreAtoms } = require('../runtime')
    const logic = A99.custom({ ...coreAtoms, storeVectorize })
      .step({ op: 'storeVectorize', text: 'fail' })
      .return(s.object({}))

    // Run locally without caps
    expect(clientVM.run(logic.toJSON(), {})).rejects.toThrow(
      "Capability 'vector' missing"
    )
  })
})