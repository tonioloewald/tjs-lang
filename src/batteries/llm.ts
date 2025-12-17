import { LocalModels } from './models'

/**
 * LLM Capability Battery
 * Bridges to local LM Studio instance via HTTP.
 */

export interface LLMCapability {
  predict(
    system: string,
    user: string,
    tools?: any[],
    responseFormat?: any
  ): Promise<any>
  embed(text: string): Promise<number[]>
}

const DEFAULT_BASE_URL = 'http://localhost:1234/v1'

export function getLLMCapability(
  models: LocalModels,
  baseUrl = DEFAULT_BASE_URL
): LLMCapability {
  return {
    async predict(
      system: string,
      user: string,
      tools?: any[],
      responseFormat?: any
    ): Promise<any> {
      try {
        const model = responseFormat
          ? models.getStructuredLLM()
          : models.getLLM()
        const messages = [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ]

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.id,
            messages,
            temperature: 0.7,
            tools,
            response_format: responseFormat,
          }),
        })

        if (!response.ok) {
          throw new Error(
            `LLM Error: ${response.status} ${response.statusText}`
          )
        }

        const data = await response.json()
        return data.choices[0]?.message ?? { content: '' }
      } catch (e: any) {
        if (e.cause?.code === 'ECONNREFUSED') {
          throw new Error(
            'No LLM provider configured. Please start LM Studio or provide an API key.'
          )
        }
        throw e
      }
    },

    async embed(text: string): Promise<number[]> {
      try {
        const model = models.getEmbedding()
        const response = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.id,
            input: text,
          }),
        })

        if (!response.ok) {
          throw new Error(`Embedding Error: ${response.status}`)
        }

        const data = await response.json()
        return data.data[0]?.embedding ?? []
      } catch (e: any) {
        if (e.cause?.code === 'ECONNREFUSED') {
          throw new Error(
            'No LLM provider configured. Please start LM Studio or provide an API key.'
          )
        }
        throw e
      }
    },
  }
}
