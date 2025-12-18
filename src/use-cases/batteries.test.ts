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

// Store Mocks

// --- Test Setup ---

// This factory creates a mock LLM battery with a specific fetch mock.
// This avoids global state and allows each test to define its required fetch behavior.
const createMockLLMBattery = (fetchMock: any) => ({
  predict: async (
    system: string,
    user: string,
    tools?: any[],
    responseFormat?: any
  ) => {
    const body: any = {
      model: 'mock-model',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }
    if (tools) body.tools = tools
    if (responseFormat) body.response_format = responseFormat

    // Use the provided fetch mock for the network call
    const res = await fetchMock('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return data.choices[0].message
  },
  embed: async (text: string) => {
    const res = await fetchMock('http://localhost:1234/v1/embeddings', {
      method: 'POST',
      body: JSON.stringify({
        model: 'mock-model',
        input: text,
      }),
    })
    const data = await res.json()
    return data.data[0].embedding
  },
})

describe('Batteries Included', () => {
  const batteryVM = new AgentVM({
    storeVectorize,
    storeSearch,
    llmPredictBattery,
  })

  it('should use Vector Battery to embed text', async () => {
    const fetchMock = mock(async (url: any) => {
      if (url.toString().includes('/embeddings')) {
        return new Response(
          JSON.stringify({ data: [{ embedding: Array(768).fill(0.1) }] })
        )
      }
      return new Response('{}')
    })

    const testCaps = {
      ...batteries,
      llmBattery: createMockLLMBattery(fetchMock),
    }

    const agent = A99.custom({ ...batteryVM['atoms'] })
      .step({ op: 'storeVectorize', text: 'Hello World' })
      .as('vector')
      .return(s.object({ vector: s.array(s.number) }))

    const result = await batteryVM.run(
      agent.toJSON(),
      {},
      { capabilities: testCaps }
    )

    expect(result.result.vector).toBeArray()
    expect(result.result.vector.length).toBe(768)
  })

  it('should use Store Battery (Orama) to create collection and search', async () => {
    await batteries.store.createCollection('notes')
    await batteries.store.vectorAdd('notes', {
      id: '1',
      content: 'Important Note',
      embedding: [0.1, 0.2, 0.3],
    })

    const agent = A99.custom({ ...batteryVM['atoms'] })
      .step({
        op: 'storeSearch',
        collection: 'notes',
        queryVector: [0.1, 0.2, 0.3],
      })
      .as('hits')
      .return(s.object({ hits: s.array(s.any) }))

    const result = await batteryVM.run(
      agent.toJSON(),
      {},
      { capabilities: batteries }
    )

    expect(result.result.hits).toHaveLength(1)
    expect(result.result.hits[0].content).toBe('Important Note')
  })

  it('should use LLM Battery to predict', async () => {
    const fetchMock = mock(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Mock LLM Response' } }],
        })
      )
    })

    const testCaps = {
      ...batteries,
      llmBattery: createMockLLMBattery(fetchMock),
    }

    const agent = A99.custom({ ...batteryVM['atoms'] })
      .step({ op: 'llmPredictBattery', system: 'Sys', user: 'User' })
      .as('response')
      .return(s.object({ response: s.string }))

    const result = await batteryVM.run(
      agent.toJSON(),
      {},
      { capabilities: testCaps }
    )

    expect(result.result.response.content).toBe('Mock LLM Response')
  })

  it('should pass response_format to LLM Battery', async () => {
    const fetchMock = mock(async (_url: any, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) || '{}')
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ format: body.response_format }),
              },
            },
          ],
        })
      )
    })

    const testCaps = {
      ...batteries,
      llmBattery: createMockLLMBattery(fetchMock),
    }

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
      { capabilities: testCaps }
    )

    const content = JSON.parse(result.result.response.content)
    expect(content.format).toEqual({ type: 'json_object' })
  })

  it('should pass tools to LLM Battery and handle tool calls', async () => {
    const fetchMock = mock(async () => {
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
    })

    const testCaps = {
      ...batteries,
      llmBattery: createMockLLMBattery(fetchMock),
    }

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

    const result = await batteryVM.run(
      agent.toJSON(),
      {},
      { capabilities: testCaps }
    )

    const msg = result.result.response
    expect(msg.content).toBeNull()
    expect(msg.tool_calls).toHaveLength(1)
    expect(msg.tool_calls[0].function.name).toBe('get_weather')
    expect(msg.tool_calls[0].function.arguments).toBe('{"city":"Paris"}')
  })
})
