/* tjs <- input.ts */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test'

import { Agent } from '/Users/tonioloewald/tjs-lang/src/builder'

import { AgentVM } from '/Users/tonioloewald/tjs-lang/src/vm'

import { s } from 'tosijs-schema'

import {
  storeVectorize,
  storeSearch,
  llmPredictBattery,
} from '/Users/tonioloewald/tjs-lang/src/atoms/batteries'

const mockBatteries = {
  vector: {
    embed: mock(async (_text) => [0.9, 0.8, 0.7]),
  },
  store: {
    get: mock(async () => null),
    set: mock(async () => {}),
    vectorSearch: mock(async (_coll, _vec) => [
      { id: '1', content: 'Secret Server Doc' },
    ]),
  },
  llmBattery: {
    predict: mock(async (sys, user) => ({ content: 'Server says: ' + user })),
  },
}

describe('Use Case: Asymmetric Client-Server', () => {
  let server
  let URL = ''

  beforeAll(() => {
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

            const result = await serverVM.run(ast, args, {
              capabilities: mockBatteries,
            })
            return new Response(JSON.stringify(result), {
              headers: { 'Content-Type': 'application/json' },
            })
          } catch (e) {
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
    const { coreAtoms } = require('../runtime')
    const clientBuilder = Agent.custom({
      ...coreAtoms,
      storeVectorize,
      storeSearch,
      llmPredictBattery,
    })

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
        user: 'Found: {{docs}}',
      })

      .template({ tmpl: 'Analyze: {{docs}}', vars: { docs: 'docsStr' } })
      .as('prompt')
      .step({
        op: 'llmPredictBattery',
        system: 'Analyst',
        user: 'prompt',
      })
      .as('analysis')
      .return(s.object({ analysis: s.any }))

    const response = await fetch(URL, {
      method: 'POST',
      body: JSON.stringify({
        ast: logic.toJSON(),
        args: { query: 'Top Secret' },
      }),
    })
    const data = await response.json()

    expect(response.status).toBe(200)

    expect(data.result.analysis.content).toContain('Server says:')
    expect(data.result.analysis.content).toContain('Secret Server Doc')

    expect(mockBatteries.vector.embed).toHaveBeenCalled()
    expect(mockBatteries.store.vectorSearch).toHaveBeenCalled()
    expect(mockBatteries.llmBattery.predict).toHaveBeenCalled()
  })
  it('should fail if client tries to run locally without capabilities', async () => {
    const clientVM = new AgentVM({
      storeVectorize,
      storeSearch,
      llmPredictBattery,
    })
    const { coreAtoms } = require('../runtime')
    const logic = Agent.custom({ ...coreAtoms, storeVectorize })
      .step({ op: 'storeVectorize', text: 'fail' })
      .return(s.object({}))

    const result = await clientVM.run(logic.toJSON(), {})
    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain("Capability 'vector' missing")
  })
})
