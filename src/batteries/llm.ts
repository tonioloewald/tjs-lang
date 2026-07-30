import { LocalModels } from './models'
import { LLM_BASE_URL } from './config'

/**
 * LLM Capability Battery
 *
 * Bridges to a local **OpenAI-compatible** server over HTTP — MLX
 * (`mlx-omni-server` / `mlx_lm.server`), LM Studio, or any other. Point it with
 * the `TJS_LLM_BASE_URL` env var; see `./config.ts` and `docs/mlx-setup.md`.
 */

/**
 * User content can be a simple string or multimodal with images.
 * Images should be URLs or data URIs (data:image/...;base64,...)
 */
export type UserContent = string | { text: string; images?: string[] }

export interface LLMCapability {
  predict(
    system: string,
    user: UserContent,
    tools?: any[],
    responseFormat?: any
  ): Promise<any>
  embed(text: string): Promise<number[]>
}

/**
 * Build user message content - supports text-only or multimodal (text + images)
 */
function buildUserMessage(user: UserContent): { role: string; content: any } {
  if (typeof user === 'string') {
    return { role: 'user', content: user }
  }

  // Multimodal: array of content blocks (OpenAI vision format)
  const content: any[] = [{ type: 'text', text: user.text }]

  for (const img of user.images || []) {
    content.push({
      type: 'image_url',
      image_url: {
        url: img, // Can be URL or data:image/...;base64,...
      },
    })
  }

  return { role: 'user', content }
}

const DEFAULT_BASE_URL = LLM_BASE_URL

/**
 * A refused connection surfaces differently per runtime: Node hangs it on
 * `e.cause.code === 'ECONNREFUSED'`, Bun (our primary runtime) puts
 * `e.code === 'ConnectionRefused'` at the top level. Checking only the Node
 * shape meant the friendly "start LM Studio" guidance never fired under Bun —
 * users got a raw "Unable to connect" instead. Detect both.
 *
 * Filed upstream: oven-sh/bun#34397 (see UPSTREAM.md). Drop the Bun branch if Bun
 * aligns its fetch error shape with Node.
 */
function isConnectionRefused(e: any): boolean {
  return e?.cause?.code === 'ECONNREFUSED' || e?.code === 'ConnectionRefused'
}

export function getLLMCapability(
  models: LocalModels,
  baseUrl = DEFAULT_BASE_URL
): LLMCapability {
  return {
    async predict(
      system: string,
      user: UserContent,
      tools?: any[],
      responseFormat?: any
    ): Promise<any> {
      try {
        const model = responseFormat
          ? models.getStructuredLLM()
          : models.getLLM()
        const messages = [
          { role: 'system', content: system },
          buildUserMessage(user),
        ]

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model.id,
            messages,
            temperature: 0.7,
            // Only include tools when non-empty: an empty tools array makes
            // LM Studio apply a tool-call grammar that can't be combined with
            // a structured-output response_format ("lazy grammar" 400).
            ...(tools && tools.length > 0 ? { tools } : {}),
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
        if (isConnectionRefused(e)) {
          throw new Error(
            'No local LLM server reachable at ' +
              baseUrl +
              '. Start your backend (MLX: mlx-omni-server, or LM Studio) or set TJS_LLM_BASE_URL.',
            { cause: e }
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
        if (isConnectionRefused(e)) {
          throw new Error(
            'No local LLM server reachable at ' +
              baseUrl +
              '. Start your backend (MLX: mlx-omni-server, or LM Studio) or set TJS_LLM_BASE_URL.',
            { cause: e }
          )
        }
        throw e
      }
    },
  }
}
