/**
 * LLM Capability Battery
 * Bridges to local LM Studio instance via HTTP.
 */

interface LLMCapability {
  predict(system: string, user: string, tools?: any[]): Promise<any>
  embed(text: string): Promise<number[]>
}

const DEFAULT_BASE_URL = 'http://localhost:1234/v1'

export function getLLMCapability(
  baseUrl = DEFAULT_BASE_URL
): LLMCapability {
  return {
    async predict(
      system: string,
      user: string,
      tools?: any[]
    ): Promise<any> {
      try {
        const messages = [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ]

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages,
            temperature: 0.7,
            tools, // Pass tools if supported by local model
          }),
        })

        if (!response.ok) {
          throw new Error(`LLM Error: ${response.status} ${response.statusText}`)
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
        const response = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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