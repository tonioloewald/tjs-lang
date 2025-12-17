import { describe, it, expect, mock } from 'bun:test'
import { A99 } from '../builder'
import { AgentVM } from '../vm'
import { s } from 'tosijs-schema'
import { batteries } from '../batteries'
import {
  storeVectorize,
  storeSearch,
  llmPredictBattery,
} from '../atoms/batteries'

mock.module('@orama/orama', () => {
  const db: any[] = []
  return {
    create: async ({ schema }: any) => ({ schema, data: db }),
    insert: async (inst: any, doc: any) => {
      inst.data.push(doc)
      return 'id'
    },
    search: async (inst: any, _params: any) => {
      // Simple mock search returning all docs
      return {
        hits: inst.data.map((doc: any) => ({ document: doc })),
      }
    },
  }
})

// Mock fetch for LLM Capability
// We intercept requests to the LLM endpoint (defaulting to localhost:1234)
// and return a fixed response. This verifies the battery correctly formats
// the request and parses the response without needing a real LLM server.
const originalFetch = globalThis.fetch
globalThis.fetch = mock(
  async (url: string | URL | Request, init?: RequestInit) => {
    const u = url.toString()
    if (u.includes('/chat/completions')) {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Mock LLM Response' } }],
        })
      )
    } else if (u.includes('/embeddings')) {
      // Return a 768-dim vector
      return new Response(
        JSON.stringify({
          data: [{ embedding: Array(768).fill(0.1) }],
        })
      )
    }
    return originalFetch(url, init)
  }
) as any

describe('Batteries Included', () => {
  // Create a VM with the Battery Atoms
  const batteryVM = new AgentVM({
    storeVectorize,
    storeSearch,
    llmPredictBattery,
  })

  it('should use Vector Battery to embed text', async () => {
    // 1. Build Agent
    const agent = A99.custom({ ...batteryVM['atoms'] })
      .step({ op: 'storeVectorize', text: 'Hello World' })
      .as('vector')
      .return(s.object({ vector: s.array(s.number) }))

    // 2. Run with Batteries
    const result = await batteryVM.run(
      agent.toJSON(),
      {},
      { capabilities: batteries }
    )

    // 3. Verify
    expect(result.result.vector).toBeArray()
    expect(result.result.vector.length).toBe(768)
  })

  it('should use Store Battery (Orama) to create collection and search', async () => {
    // 1. Setup Collection directly via capability (since atoms for create aren't standard yet)
    // Or we can assume lazy create? Battery store requires explicit createCollection?
    // Let's check store battery implementation.
    // getStoreCapability returns object with createCollection.
    // But 'storeSet' atom calls 'set' (KV).
    // 'storeSearch' atom calls 'vectorSearch'.
    // We need to create collection first.
    // Since we don't have an atom for 'createCollection', we call it on capability directly in setup.
    await batteries.store.createCollection('notes')

    // 2. Add Doc (using vectorAdd directly for setup)
    await batteries.store.vectorAdd('notes', {
      id: '1',
      content: 'Important Note',
      embedding: [0.1, 0.2, 0.3],
    })

    // 3. Build Agent to Search
    const agent = A99.custom({ ...batteryVM['atoms'] })
      .step({
        op: 'storeSearch',
        collection: 'notes',
        queryVector: [0.1, 0.2, 0.3],
      })
      .as('hits')
      .return(s.object({ hits: s.array(s.any) }))

    // 4. Run
    const result = await batteryVM.run(
      agent.toJSON(),
      {},
      { capabilities: batteries }
    )

    expect(result.result.hits).toHaveLength(1)
    expect(result.result.hits[0].content).toBe('Important Note')
  })

  it('should use LLM Battery to predict', async () => {
    // The result 'Mock LLM Response' comes from the fetch mock defined at top of file
    const agent = A99.custom({ ...batteryVM['atoms'] })
      .step({
        op: 'llmPredictBattery',
        system: 'Sys',
        user: 'User',
      })
      .as('response')
      .return(s.object({ response: s.string }))

    const result = await batteryVM.run(
      agent.toJSON(),
      {},
      { capabilities: batteries }
    )

    expect(result.result.response.content).toBe('Mock LLM Response')
  })

  it('should pass response_format to LLM Battery', async () => {
    const mockFetch = globalThis.fetch as any
    mockFetch.mockImplementation(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = url.toString()
        if (u.includes('/chat/completions')) {
          const body = JSON.parse((init?.body as string) || '{}')
          if (body.response_format) {
            return new Response(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        format: body.response_format,
                      }),
                    },
                  },
                ],
              })
            )
          }
        }
        return originalFetch(url, init)
      }
    )

    const agent = A99.custom({ ...batteryVM['atoms'] })
      .step({
        op: 'llmPredictBattery',
        system: 'Sys',
        user: 'User',
        responseFormat: { type: 'json_object' },
      })
      .as('response')
      .return(s.object({ response: s.any }))

    const result = await batteryVM.run(
      agent.toJSON(),
      {},
      { capabilities: batteries }
    )

    const content = JSON.parse(result.result.response.content)
    expect(content.format).toEqual({ type: 'json_object' })
  })

  it('should pass tools to LLM Battery and handle tool calls', async () => {
    // 1. Setup Mock for Tool Response
    const mockFetch = globalThis.fetch as any
    mockFetch.mockImplementation(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = url.toString()
        if (u.includes('/chat/completions')) {
          // Inspect request body to verify tools
          // const req = url instanceof Request ? url : new Request(url, { method: 'POST' }) // Wait, fetch mock passed args?
          // Actually, we can spy on the mock calls later.
          // For now, return a tool call response.
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        id: 'call_123',
                        type: 'function',
                        function: {
                          name: 'get_weather',
                          arguments: '{"city":"Paris"}',
                        },
                      },
                    ],
                  },
                },
              ],
            })
          )
        }
        return originalFetch(url, init)
      }
    )

    // 2. Build Agent with Tools
    const agent = A99.custom({ ...batteryVM['atoms'] })
      .step({
        op: 'llmPredictBattery',
        system: 'Sys',
        user: 'What is the weather in Paris?',
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get current weather',
              parameters: {
                type: 'object',
                properties: { city: { type: 'string' } },
              },
            },
          },
        ],
      })
      .as('response')
      .return(s.object({ response: s.any }))

    // 3. Run
    const result = await batteryVM.run(
      agent.toJSON(),
      {},
      { capabilities: batteries }
    )

    // 4. Verify
    const msg = result.result.response
    expect(msg.content).toBeNull()
    expect(msg.tool_calls).toHaveLength(1)
    expect(msg.tool_calls[0].function.name).toBe('get_weather')
    expect(msg.tool_calls[0].function.arguments).toBe('{"city":"Paris"}')
  })
})
